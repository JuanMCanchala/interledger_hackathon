import { describe, expect, it } from "vitest";
import { BOB, COOP, SAVINGS } from "./fakeOperations.js";
import { BASE_URL, ROSA, cop, setupMiPlante } from "./miplanteHarness.js";

describe("merchant onboarding", () => {
  it("asks the merchant for a single consent capped per day", async () => {
    const { merchants, ops, store } = setupMiPlante();

    const { merchant, redirectUrl } = await merchants.onboard(ROSA);

    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledTimes(1);
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: BOB }),
      expect.objectContaining({
        limits: {
          debitAmount: cop("3000000"),
          interval: "R/2026-10-16T15:00:00Z/P1D",
        },
        finishUri: expect.stringMatching(
          new RegExp(`^${BASE_URL}/api/mandates/.+/callback$`),
        ),
      }),
    );
    expect(merchant).toMatchObject({
      name: "Tienda Doña Rosa",
      wallet: BOB,
      asset: { assetCode: "COP", assetScale: 2 },
      dailyCap: cop("3000000"),
      status: "awaiting-consent",
    });
    expect(
      merchant.rules.map((rule) => [
        rule.destination,
        rule.shareBps,
        rule.outstanding?.value,
      ]),
    ).toEqual([
      [COOP, 1500, "30000000"],
      [SAVINGS, 500, undefined],
    ]);
    const mandateId = store.getMerchant(merchant.id)!.mandateId;
    expect(store.getMandate(mandateId)?.returnTo).toBe(
      `/merchant.html?id=${merchant.id}`,
    );
  });

  it("becomes active once the merchant approves in the wallet", async () => {
    const { merchants, onboardRosa } = setupMiPlante();

    const id = await onboardRosa();

    expect(merchants.view(merchants.require(id)).status).toBe("active");
  });

  it("keeps the majority of every sale for the merchant", async () => {
    const { merchants, ops } = setupMiPlante();
    const greedy = {
      ...ROSA,
      rules: [{ ...ROSA.rules[0]!, sharePercent: 46 }, ROSA.rules[1]!],
    };

    await expect(merchants.onboard(greedy)).rejects.toThrow("50%");
    expect(ops.requestOutgoingPaymentGrant).not.toHaveBeenCalled();
  });

  it("validates every destination before asking for consent", async () => {
    const { merchants, ops } = setupMiPlante();
    const toSelf = {
      ...ROSA,
      rules: [{ ...ROSA.rules[1]!, destination: BOB }],
    };
    const unknown = {
      ...ROSA,
      rules: [
        {
          ...ROSA.rules[1]!,
          destination: "https://ilp.interledger-test.dev/nadie",
        },
      ],
    };
    const debtWithoutBalance = {
      ...ROSA,
      rules: [{ ...ROSA.rules[0]!, outstanding: undefined }],
    };

    await expect(merchants.onboard(toSelf)).rejects.toThrow("misma wallet");
    await expect(merchants.onboard(unknown)).rejects.toThrow(
      "wallet desconocida",
    );
    await expect(merchants.onboard(debtWithoutBalance)).rejects.toThrow(
      "saldo pendiente",
    );
    expect(ops.requestOutgoingPaymentGrant).not.toHaveBeenCalled();
  });

  it("answers 404 for unknown merchants", () => {
    const { merchants } = setupMiPlante();
    expect(() => merchants.require("nope")).toThrow("No existe el comercio");
  });
});
