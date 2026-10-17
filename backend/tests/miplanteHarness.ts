import {
  MerchantService,
  type OnboardInput,
} from "../src/merchants/merchantService.js";
import { DashboardService } from "../src/merchants/dashboardService.js";
import { PayoutService } from "../src/merchants/payoutService.js";
import { SalesService } from "../src/merchants/salesService.js";
import { PaymentFlows } from "../src/openPayments/flows.js";
import { computeInteractHash } from "../src/openPayments/hash.js";
import type { Interaction } from "../src/openPayments/records.js";
import { MemoryStore, type Store } from "../src/storage/store.js";
import {
  AUTH_SERVER,
  COOP,
  NOW,
  SAVINGS,
  createFakeOperations,
} from "./fakeOperations.js";

export const BASE_URL = "http://localhost:3000";
export const cop = (value: string) => ({
  value,
  assetCode: "COP",
  assetScale: 2,
});

/** Rosa's shop: 15% of each sale to a microcredit until 300,000 COP, 5% to savings, 30,000 COP/day cap. */
export const ROSA: OnboardInput = {
  name: "Tienda Doña Rosa",
  wallet: "$ilp.interledger-test.dev/bob",
  monthlyCap: "30000",
  rules: [
    {
      label: "Microcrédito",
      category: "Microcréditos",
      kind: "debt",
      destination: COOP,
      sharePercent: 15,
      monthlyQuota: "20000",
      outstanding: "300000",
    },
    {
      label: "Fondo de emergencia",
      category: "Ahorro",
      kind: "savings",
      destination: SAVINGS,
      sharePercent: 5,
    },
  ],
};

/** Wires the MiPlante services to the in-memory Open Payments fake (and memory storage by default). */
export function setupMiPlante(store: Store = new MemoryStore()) {
  const clock = { now: NOW };
  const now = () => clock.now;
  const { ops, deliver } = createFakeOperations();
  const flows = new PaymentFlows(ops, store, {
    publicBaseUrl: BASE_URL,
    allowedWalletHosts: ["ilp.interledger-test.dev"],
    now,
  });
  const merchants = new MerchantService(flows, store, { now });
  const sales = new SalesService(flows, merchants, store, {
    frontendUrl: BASE_URL,
    now,
  });
  const payouts = new PayoutService(flows, merchants, store, { now });
  const dashboard = new DashboardService(flows, merchants, sales, store, {
    now,
    payouts,
  });

  /** What the wallet appends to the finish URL when its owner approves. */
  const approve = (interaction: Interaction) => ({
    interactRef: "ref-1",
    hash: computeInteractHash({
      clientNonce: interaction.clientNonce,
      interactNonce: interaction.finishNonce,
      interactRef: "ref-1",
      authServerUrl: AUTH_SERVER,
    }),
  });
  const approveMandate = async (mandateId: string) =>
    flows.completeMandate(
      mandateId,
      approve((await store.getMandate(mandateId))!.interaction!),
    );
  const approvePayment = async (paymentId: string) =>
    flows.completePayment(
      paymentId,
      approve((await store.getPayment(paymentId))!.interaction!),
    );

  /** Onboards Rosa and approves her daily-capped grant. */
  const onboardRosa = async (overrides: Partial<OnboardInput> = {}) => {
    const { merchant } = await merchants.onboard({ ...ROSA, ...overrides });
    await approveMandate((await store.getMerchant(merchant.id))!.mandateId);
    return merchant.id;
  };

  /**
   * Runs every reserved debt as on its due day and has the money arrive at each creditor, so the
   * debts count as repaid (ADR 0014).
   */
  const payOutDebts = async (merchantId: string) => {
    const sent = await payouts.pay(merchantId, { reason: "due-date" });
    for (const payout of sent) {
      deliver(
        (await store.getPayment(payout.paymentId!))!.incomingPaymentUrl,
        cop("5000000"),
      );
    }
    await payouts.refresh(merchantId);
    return sent;
  };

  return {
    clock,
    payOutDebts,
    now,
    ops,
    deliver,
    store,
    flows,
    merchants,
    sales,
    payouts,
    dashboard,
    approve,
    approveMandate,
    approvePayment,
    onboardRosa,
  };
}
