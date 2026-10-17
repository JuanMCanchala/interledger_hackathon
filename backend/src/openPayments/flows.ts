import { randomUUID } from "node:crypto";
import type { Quote, WalletAddress } from "@interledger/open-payments";
import { AppError, NotFoundError } from "../shared/errors.js";
import {
  compareAmounts,
  fromMinorUnits,
  toAmount,
  type Amount,
} from "../shared/money.js";
import type { Store } from "../storage/store.js";
import { describeError, isAuthError } from "./errors.js";
import { verifyInteractHash } from "./hash.js";
import { buildRepeatingInterval } from "./interval.js";
import {
  toStoredToken,
  type OutgoingGrantLimits,
  type PaymentOperations,
} from "./operations.js";
import type { Interaction, MandateRecord, PaymentRecord } from "./records.js";
import {
  assertAllowedWalletHost,
  normalizeWalletAddressUrl,
} from "./walletAddress.js";

/** Query params the wallet appends to our finish URL after the consent screen. */
export interface CallbackParams {
  interactRef?: string;
  hash?: string;
  result?: string;
}

/** receive: the receiver gets exactly `amount` (their currency). send: the sender pays exactly `amount` (their currency). */
export type AmountType = "receive" | "send";

export interface FlowOptions {
  publicBaseUrl: string;
  allowedWalletHosts: string[] | "*";
  now?: () => Date;
}

export interface StartPaymentInput {
  sender: string;
  receiver: string;
  /** Decimal amount the receiver gets, in the receiver's currency. */
  amount: string;
  description?: string;
  /** Page (path starting with "/") where the browser lands after the consent screen. */
  returnTo?: string;
  /**
   * Pay this incoming payment (a payment request already shown to the payer) instead of creating
   * a new one, so a sale keeps a single destination however the customer pays it.
   */
  incoming?: { url: string; accessToken?: string };
}

export interface StartMandateInput {
  sender: string;
  /** Decimal debit cap in the sender's currency (per interval, if one is given). */
  maxAmount: string;
  /** ISO 8601 duration, e.g. P1W. Omit for a one-time total cap. */
  interval?: string;
  /** When the first interval starts (default: now), e.g. the 1st of the month for P1M. */
  intervalStart?: Date;
  repetitions?: number;
  description?: string;
  /** Page (path starting with "/") where the browser lands after the consent screen. */
  returnTo?: string;
}

export interface ChargeInput {
  receiver: string;
  amount: string;
  amountType?: AmountType;
  description?: string;
}

export interface SplitInput {
  receivers: { receiver: string; amount: string }[];
  amountType?: AmountType;
  description?: string;
}

const QUOTE_SAFETY_MARGIN_MS = 5_000;
const TOKEN_SAFETY_MARGIN_MS = 30_000;

/**
 * The mandatory Open Payments flow, independent of the final product idea:
 *  - One-off payment: payment request → quote → consent → execution → completion.
 *  - Mandate: consent once (debit cap, optionally per interval) → charge many times without
 *    asking again (savings groups, store credit, allowances, agent payments, splits...).
 */
export class PaymentFlows {
  private readonly now: () => Date;

  constructor(
    private readonly ops: PaymentOperations,
    private readonly store: Store,
    private readonly options: FlowOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async describeWalletAddress(input: string) {
    const wallet = await this.resolve(input);
    return {
      id: wallet.id,
      publicName: wallet.publicName,
      assetCode: wallet.assetCode,
      assetScale: wallet.assetScale,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // One-off payment
  // ---------------------------------------------------------------------------------------------

  async startPayment(input: StartPaymentInput) {
    const [sender, receiver] = await Promise.all([
      this.resolve(input.sender),
      this.resolve(input.receiver),
    ]);
    let incoming = input.incoming;
    if (!incoming) {
      const created = await this.ops.createIncomingPayment(receiver, {
        incomingAmount: toAmount(input.amount, receiver),
        description: input.description,
      });
      incoming = {
        url: created.incomingPayment.id,
        accessToken: created.accessToken,
      };
    }
    const { url: incomingPaymentUrl, accessToken: incomingToken } = incoming;
    const quote = await this.ops.createQuote(sender, {
      receiver: incomingPaymentUrl,
    });
    const id = randomUUID();
    const { interaction, redirectUrl } = await this.requestConsent(
      sender,
      { debitAmount: quote.debitAmount },
      `/api/payments/${id}/callback`,
    );
    const timestamp = this.timestamp();
    const record = await this.store.savePayment({
      id,
      kind: "one-off",
      status: "awaiting-consent",
      description: input.description,
      returnTo: assertReturnPath(input.returnTo),
      sender: sender.id,
      receiver: receiver.id,
      incomingPaymentUrl,
      incomingToken,
      ...quoteFields(quote),
      interaction,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { payment: toPublicPayment(record), redirectUrl };
  }

  async completePayment(id: string, params: CallbackParams) {
    let record = await this.requirePayment(id);
    // Idempotent: reloading the callback URL must not pay twice.
    if (record.status !== "awaiting-consent" || !record.interaction) {
      return toPublicPayment(record);
    }
    const { interaction } = record;
    const check = checkCallback(interaction, params);
    if (!check.approved) {
      await this.updatePayment(record, {
        status: check.status,
        error: check.error,
        interaction: undefined,
      });
      return toPublicPayment(await this.requirePayment(id));
    }
    try {
      const grant = await this.ops.continueGrant(
        {
          uri: interaction.continueUri,
          accessToken: interaction.continueToken,
        },
        check.interactRef,
      );
      record = await this.updatePayment(record, {
        authorizedAt: this.timestamp(),
        interaction: undefined,
      });
      // Consented payments always know their sender; only payment requests do not.
      const sender = await this.resolve(record.sender!);
      const quote = await this.ensureFreshQuote(record, sender);
      const outgoing = await this.ops.createOutgoingPayment(
        sender,
        grant.access_token.value,
        {
          quoteId: quote.quoteId,
          description: record.description,
        },
      );
      await this.updatePayment(record, {
        ...quote,
        status: "processing",
        outgoingPaymentUrl: outgoing.id,
        outgoingToken: grant.access_token.value,
      });
    } catch (error) {
      await this.updatePayment(await this.requirePayment(id), {
        status: "failed",
        error: describeError(error),
        interaction: undefined,
      });
      throw error;
    }
    return this.refreshPayment(id);
  }

  /**
   * Open Payments payment request: an incoming payment on the receiver's wallet for exactly
   * `amount`. Any wallet can pay its URL; the payer approves it in their own wallet, where they
   * are signed in. MiPlante needs no consent callback from the payer: it watches the payment.
   */
  async requestPayment(input: {
    receiver: string;
    amount: string;
    description?: string;
  }) {
    const receiver = await this.resolve(input.receiver);
    const amount = toAmount(input.amount, receiver);
    const { incomingPayment, accessToken } =
      await this.ops.createIncomingPayment(receiver, {
        incomingAmount: amount,
        description: input.description,
      });
    const timestamp = this.timestamp();
    const record = await this.store.savePayment({
      id: randomUUID(),
      kind: "payment-request",
      status: "awaiting-consent",
      description: input.description,
      receiver: receiver.id,
      incomingPaymentUrl: incomingPayment.id,
      incomingToken: accessToken,
      receiveAmount: amount,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return toPublicPayment(record);
  }

  /** Reads the current state from Open Payments. Safe to poll from the frontend. */
  async refreshPayment(id: string) {
    let record = await this.requirePayment(id);
    const waitingForPayer =
      record.kind === "payment-request" && record.status === "awaiting-consent";
    if (record.status !== "processing" && !waitingForPayer) {
      return toPublicPayment(record);
    }
    try {
      const receiver = await this.resolve(record.receiver);
      const { incomingPayment, accessToken } =
        await this.ops.readIncomingPayment(
          record.incomingPaymentUrl,
          receiver,
          record.incomingToken,
        );
      const outgoingFailed =
        (await this.readOutgoingPayment(record))?.failed ?? false;
      const received = incomingPayment.receivedAmount;
      const fullyReceived =
        incomingPayment.completed ||
        (record.receiveAmount !== undefined &&
          BigInt(received.value) >= BigInt(record.receiveAmount.value));
      // A payment request waits until the payer's money starts arriving. A payer who sends less
      // can pay the rest to the same request; if it expires before it is complete, it fails.
      const nothingYet = BigInt(received.value) === 0n;
      const expired =
        record.kind === "payment-request" &&
        !fullyReceived &&
        incomingPayment.expiresAt !== undefined &&
        Date.parse(incomingPayment.expiresAt) <= this.now().getTime();
      record = await this.updatePayment(record, {
        status:
          outgoingFailed || expired
            ? "failed"
            : fullyReceived
              ? "completed"
              : waitingForPayer && nothingYet
                ? "awaiting-consent"
                : "processing",
        error: outgoingFailed
          ? "El pago saliente falló en Interledger"
          : expired
            ? nothingYet
              ? "La solicitud de pago venció sin recibir el pago"
              : `La solicitud de pago venció incompleta: llegaron ${fromMinorUnits(received.value, received.assetScale)} ${received.assetCode}`
            : undefined,
        receivedAmount: received,
        incomingToken: accessToken,
      });
      if (record.status === "completed" && !incomingPayment.completed) {
        await this.closeIncomingPayment(record, receiver);
      }
    } catch (error) {
      // Polling must not break the UI; the next poll retries.
      console.warn(
        `[payments] no se pudo actualizar ${id}: ${describeError(error)}`,
      );
    }
    return toPublicPayment(record);
  }

  async getPayment(id: string) {
    return toPublicPayment(await this.requirePayment(id));
  }

  /** Stored view of a mandate, without calling the wallet. */
  async findMandate(id: string) {
    return toPublicMandate(await this.requireMandate(id));
  }

  // ---------------------------------------------------------------------------------------------
  // Mandate: recurring or capped consent
  // ---------------------------------------------------------------------------------------------

  async startMandate(input: StartMandateInput) {
    const sender = await this.resolve(input.sender);
    const maxAmount = toAmount(input.maxAmount, sender);
    const interval = input.interval
      ? buildRepeatingInterval(input.interval, {
          start: input.intervalStart ?? this.now(),
          repetitions: input.repetitions,
        })
      : undefined;
    const id = randomUUID();
    const { interaction, redirectUrl } = await this.requestConsent(
      sender,
      { debitAmount: maxAmount, interval },
      `/api/mandates/${id}/callback`,
    );
    const timestamp = this.timestamp();
    const record = await this.store.saveMandate({
      id,
      status: "awaiting-consent",
      description: input.description,
      returnTo: assertReturnPath(input.returnTo),
      sender: sender.id,
      maxAmount,
      interval,
      interaction,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { mandate: toPublicMandate(record), redirectUrl };
  }

  async completeMandate(id: string, params: CallbackParams) {
    const record = await this.requireMandate(id);
    if (record.status !== "awaiting-consent" || !record.interaction) {
      return toPublicMandate(record);
    }
    const { interaction } = record;
    const check = checkCallback(interaction, params);
    if (!check.approved) {
      return toPublicMandate(
        await this.updateMandate(record, {
          status: check.status,
          error: check.error,
          interaction: undefined,
        }),
      );
    }
    try {
      const grant = await this.ops.continueGrant(
        {
          uri: interaction.continueUri,
          accessToken: interaction.continueToken,
        },
        check.interactRef,
      );
      return toPublicMandate(
        await this.updateMandate(record, {
          status: "active",
          token: toStoredToken(grant.access_token, this.now()),
          continuation: {
            uri: grant.continue.uri,
            accessToken: grant.continue.access_token.value,
          },
          interaction: undefined,
        }),
      );
    } catch (error) {
      await this.updateMandate(record, {
        status: "failed",
        error: describeError(error),
        interaction: undefined,
      });
      throw error;
    }
  }

  /** Pays from the sender's wallet under the mandate, without asking for consent again. */
  async chargeMandate(id: string, input: ChargeInput) {
    const mandate = await this.requireActiveMandate(id);
    const [sender, receiver] = await Promise.all([
      this.resolve(mandate.sender),
      this.resolve(input.receiver),
    ]);
    const amountType = input.amountType ?? "receive";
    const { incomingPayment, accessToken: incomingToken } =
      await this.ops.createIncomingPayment(
        receiver,
        amountType === "receive"
          ? {
              incomingAmount: toAmount(input.amount, receiver),
              description: input.description,
            }
          : { description: input.description },
      );
    const quote = await this.ops.createQuote(
      sender,
      amountType === "receive"
        ? { receiver: incomingPayment.id }
        : {
            receiver: incomingPayment.id,
            debitAmount: toAmount(input.amount, sender),
          },
    );
    const timestamp = this.timestamp();
    let record = await this.store.savePayment({
      id: randomUUID(),
      kind: "mandate-charge",
      status: "processing",
      description: input.description,
      sender: sender.id,
      receiver: receiver.id,
      mandateId: id,
      incomingPaymentUrl: incomingPayment.id,
      incomingToken,
      ...quoteFields(quote),
      authorizedAt: mandate.updatedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    try {
      const outgoing = await this.withMandateToken(id, (token) =>
        this.ops.createOutgoingPayment(sender, token, {
          quoteId: quote.id,
          description: input.description,
        }),
      );
      record = await this.updatePayment(record, { outgoingPaymentUrl: outgoing.id });
    } catch (error) {
      await this.updatePayment(record, {
        status: "failed",
        error: describeError(error),
      });
      throw new AppError(
        `No se pudo cobrar con la autorización: ${describeError(error)}`,
        422,
      );
    }
    return this.refreshPayment(record.id);
  }

  /** Several charges under one mandate (e.g. a remittance split between mom, school and savings). */
  async splitMandate(id: string, input: SplitInput) {
    await this.requireActiveMandate(id);
    const results: {
      receiver: string;
      payment?: ReturnType<typeof toPublicPayment>;
      error?: string;
    }[] = [];
    // Sequential on purpose: each charge counts against the same grant limit.
    for (const item of input.receivers) {
      try {
        const payment = await this.chargeMandate(id, {
          receiver: item.receiver,
          amount: item.amount,
          amountType: input.amountType,
          description: input.description,
        });
        results.push({ receiver: item.receiver, payment });
      } catch (error) {
        results.push({ receiver: item.receiver, error: describeError(error) });
      }
    }
    return results;
  }

  async getMandate(id: string) {
    const mandate = await this.requireMandate(id);
    let spent:
      { debitAmount: Amount | null; receiveAmount: Amount | null } | undefined;
    if (mandate.status === "active") {
      try {
        const sender = await this.resolve(mandate.sender);
        const amounts = await this.withMandateToken(id, (token) =>
          this.ops.getGrantSpentAmounts(sender, token),
        );
        spent = {
          debitAmount: amounts.spentDebitAmount,
          receiveAmount: amounts.spentReceiveAmount,
        };
      } catch (error) {
        console.warn(
          `[mandates] no se pudo leer lo gastado en ${id}: ${describeError(error)}`,
        );
      }
    }
    return {
      ...toPublicMandate(await this.requireMandate(id)),
      spent,
      payments: (await this.store.listPayments({ mandateId: id })).map(
        toPublicPayment,
      ),
    };
  }

  async revokeMandate(id: string) {
    const mandate = await this.requireMandate(id);
    if (mandate.status !== "active" || !mandate.continuation) {
      throw new AppError("Solo se puede revocar una autorización activa", 409);
    }
    await this.ops.cancelGrant(mandate.continuation);
    return toPublicMandate(
      await this.updateMandate(mandate, {
        status: "revoked",
        token: undefined,
        continuation: undefined,
      }),
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------

  private async resolve(input: string): Promise<WalletAddress> {
    const url = normalizeWalletAddressUrl(input);
    assertAllowedWalletHost(url, this.options.allowedWalletHosts);
    return this.ops.getWalletAddress(url);
  }

  private async requestConsent(
    sender: WalletAddress,
    limits: OutgoingGrantLimits,
    callbackPath: string,
  ) {
    const clientNonce = randomUUID();
    const pending = await this.ops.requestOutgoingPaymentGrant(sender, {
      limits,
      finishUri: `${this.options.publicBaseUrl}${callbackPath}`,
      clientNonce,
    });
    const interaction: Interaction = {
      continueUri: pending.continue.uri,
      continueToken: pending.continue.access_token.value,
      finishNonce: pending.interact.finish,
      clientNonce,
      authServer: sender.authServer,
    };
    return { interaction, redirectUrl: pending.interact.redirect };
  }

  /**
   * Everything quoted arrived at an incoming payment without a fixed amount (a split share): close
   * it, so the receiver's wallet shows it completed instead of pending until it expires. The money
   * has already arrived, so a failure here is only logged.
   */
  private async closeIncomingPayment(
    record: PaymentRecord,
    receiver: WalletAddress,
  ) {
    try {
      await this.ops.completeIncomingPayment(
        record.incomingPaymentUrl,
        receiver,
        record.incomingToken,
      );
    } catch (error) {
      console.warn(
        `[payments] no se pudo cerrar la incoming payment de ${record.id}: ${describeError(error)}`,
      );
    }
  }

  /** Quotes expire within minutes; if the user took long to consent, quote again within the approved limit. */
  private async ensureFreshQuote(record: PaymentRecord, sender: WalletAddress) {
    const expiresAt = record.quoteExpiresAt
      ? Date.parse(record.quoteExpiresAt)
      : Number.POSITIVE_INFINITY;
    if (
      record.quoteId &&
      expiresAt - QUOTE_SAFETY_MARGIN_MS > this.now().getTime()
    ) {
      return { quoteId: record.quoteId };
    }
    const quote = await this.ops.createQuote(sender, {
      receiver: record.incomingPaymentUrl,
    });
    if (
      record.debitAmount &&
      compareAmounts(quote.debitAmount, record.debitAmount) > 0
    ) {
      throw new AppError(
        "La cotización cambió y ahora supera el monto que autorizaste. Inicia el pago de nuevo.",
        409,
      );
    }
    return { ...quoteFields(quote), quoteId: quote.id };
  }

  private async readOutgoingPayment(record: PaymentRecord) {
    if (!record.outgoingPaymentUrl) return undefined;
    const url = record.outgoingPaymentUrl;
    try {
      if (record.mandateId) {
        return await this.withMandateToken(record.mandateId, (token) =>
          this.ops.getOutgoingPayment(url, token),
        );
      }
      return record.outgoingToken
        ? await this.ops.getOutgoingPayment(url, record.outgoingToken)
        : undefined;
    } catch {
      // Completion is decided from the incoming payment; the outgoing read is a bonus.
      return undefined;
    }
  }

  /** Runs `fn` with a valid mandate token: rotates it before expiry and once more on a 401. */
  private async withMandateToken<T>(
    mandateId: string,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    let mandate = await this.requireActiveMandate(mandateId);
    if (!mandate.token)
      throw new AppError("La autorización no tiene un token activo", 409);
    const expiresAt = mandate.token.expiresAt
      ? Date.parse(mandate.token.expiresAt)
      : Number.POSITIVE_INFINITY;
    if (expiresAt - TOKEN_SAFETY_MARGIN_MS <= this.now().getTime()) {
      mandate = await this.rotateMandateToken(mandate);
    }
    try {
      return await fn(mandate.token!.value);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      mandate = await this.rotateMandateToken(mandate);
      return fn(mandate.token!.value);
    }
  }

  private async rotateMandateToken(
    mandate: MandateRecord,
  ): Promise<MandateRecord> {
    if (!mandate.token)
      throw new AppError("La autorización no tiene un token activo", 409);
    const token = await this.ops.rotateToken(mandate.token);
    return this.updateMandate(mandate, { token });
  }

  private async requirePayment(id: string): Promise<PaymentRecord> {
    const record = await this.store.getPayment(id);
    if (!record) throw new NotFoundError(`No existe el pago ${id}`);
    return record;
  }

  private async requireMandate(id: string): Promise<MandateRecord> {
    const record = await this.store.getMandate(id);
    if (!record) throw new NotFoundError(`No existe la autorización ${id}`);
    return record;
  }

  private async requireActiveMandate(id: string): Promise<MandateRecord> {
    const mandate = await this.requireMandate(id);
    if (mandate.status !== "active") {
      throw new AppError(
        `La autorización está en estado "${mandate.status}", no "active"`,
        409,
      );
    }
    return mandate;
  }

  private updatePayment(
    record: PaymentRecord,
    changes: Partial<PaymentRecord>,
  ): Promise<PaymentRecord> {
    return this.store.savePayment({
      ...record,
      ...changes,
      updatedAt: this.timestamp(),
    });
  }

  private updateMandate(
    record: MandateRecord,
    changes: Partial<MandateRecord>,
  ): Promise<MandateRecord> {
    return this.store.saveMandate({
      ...record,
      ...changes,
      updatedAt: this.timestamp(),
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

type CallbackCheck =
  | { approved: true; interactRef: string }
  | { approved: false; status: "rejected" | "failed"; error: string };

function checkCallback(
  interaction: Interaction,
  params: CallbackParams,
): CallbackCheck {
  if (params.result === "grant_rejected") {
    return {
      approved: false,
      status: "rejected",
      error: "El usuario rechazó la autorización en su wallet",
    };
  }
  if (params.result) {
    return {
      approved: false,
      status: "failed",
      error: `La wallet devolvió "${params.result}"`,
    };
  }
  if (!params.interactRef || !params.hash) {
    return {
      approved: false,
      status: "failed",
      error: "El callback no trae interact_ref y hash",
    };
  }
  const valid = verifyInteractHash(
    {
      clientNonce: interaction.clientNonce,
      interactNonce: interaction.finishNonce,
      interactRef: params.interactRef,
      authServerUrl: interaction.authServer,
    },
    params.hash,
  );
  if (!valid) {
    return {
      approved: false,
      status: "failed",
      error:
        "El hash de la interacción no coincide; se descartó el callback por seguridad",
    };
  }
  return { approved: true, interactRef: params.interactRef };
}

/** Only same-site paths, so a stored redirect can never send the browser to another site. */
function assertReturnPath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new AppError(`Ruta de regreso inválida: ${path}`);
  }
  return path;
}

function quoteFields(quote: Quote) {
  return {
    quoteId: quote.id,
    quoteExpiresAt: quote.expiresAt,
    debitAmount: quote.debitAmount,
    receiveAmount: quote.receiveAmount,
  };
}

/** API view: drops tokens and nonces, adds the four steps the demo has to show. */
export function toPublicPayment(record: PaymentRecord) {
  const {
    interaction: _i,
    incomingToken: _it,
    outgoingToken: _ot,
    // Public: which grant paid it would let anyone find a shop's mandate.
    mandateId: _m,
    ...rest
  } = record;
  // A payment request is authorized and executed in the payer's own wallet: MiPlante sees the
  // money arriving.
  const arriving =
    record.kind === "payment-request" &&
    (record.status === "completed" ||
      BigInt(record.receivedAmount?.value ?? "0") > 0n);
  return {
    ...rest,
    steps: {
      request: true,
      authorization: arriving || Boolean(record.authorizedAt),
      execution: arriving || Boolean(record.outgoingPaymentUrl),
      completion: record.status === "completed",
    },
  };
}

export function toPublicMandate(record: MandateRecord) {
  const { interaction: _i, token: _t, continuation: _c, ...rest } = record;
  return rest;
}
