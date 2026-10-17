import { describe, expect, it } from "vitest";
import { BOB, COOP, SAVINGS } from "./fakeOperations.js";
import { BASE_URL, ROSA, cop, setupMiPlante } from "./miplanteHarness.js";

describe("merchant onboarding", () => {
  it("asks the merchant for a single consent capped per calendar month", async () => {
    const { merchants, ops, store } = setupMiPlante();

    const { merchant, redirectUrl } = await merchants.onboard(ROSA);

    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledTimes(1);
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: BOB }),
      expect.objectContaining({
        limits: {
          debitAmount: cop("3000000"),
          // Each interval is a calendar month in Bogotá, from the 1st at 00:00 COT.
          interval: "R/2026-10-01T05:00:00Z/P1M",
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
      monthlyCap: cop("3000000"),
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
    const mandateId = (await store.getMerchant(merchant.id))!.mandateId;
    expect((await store.getMandate(mandateId))?.returnTo).toBe(
      `/merchant?id=${merchant.id}`,
    );
  });

  it("becomes active once the merchant approves in the wallet", async () => {
    const { merchants, onboardRosa } = setupMiPlante();

    const id = await onboardRosa();

    expect((await merchants.view(await merchants.require(id))).status).toBe(
      "active",
    );
  });

  it("always leaves the merchant a part of every sale", async () => {
    const { merchants, ops } = setupMiPlante();
    const greedy = {
      ...ROSA,
      rules: [{ ...ROSA.rules[0]!, sharePercent: 95 }, ROSA.rules[1]!],
    };

    await expect(merchants.onboard(greedy)).rejects.toThrow("99%");
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
    const debtWithoutQuota = {
      ...ROSA,
      rules: [{ ...ROSA.rules[0]!, monthlyQuota: undefined }],
    };
    const quotasOverTheCap = {
      ...ROSA,
      monthlyCap: "10000",
      rules: [{ ...ROSA.rules[0]!, monthlyQuota: "20000" }],
    };

    await expect(merchants.onboard(toSelf)).rejects.toThrow("misma wallet");
    await expect(merchants.onboard(unknown)).rejects.toThrow(
      "wallet desconocida",
    );
    await expect(merchants.onboard(quotasOverTheCap)).rejects.toThrow(
      "más que el límite mensual",
    );
    await expect(merchants.onboard(debtWithoutQuota)).rejects.toThrow(
      "cuota mensual",
    );
    expect(ops.requestOutgoingPaymentGrant).not.toHaveBeenCalled();
  });

  it("answers 404 for unknown merchants", async () => {
    const { merchants } = setupMiPlante();
    await expect(merchants.require("nope")).rejects.toThrow(
      "No existe el comercio",
    );
  });

  it("asks for the consent again when the first one was rejected", async () => {
    const { merchants, flows, store, approveMandate, ops } = setupMiPlante();
    const { merchant } = await merchants.onboard(ROSA);
    const firstMandate = (await store.getMerchant(merchant.id))!.mandateId;
    await flows.completeMandate(firstMandate, { result: "grant_rejected" });
    expect(
      (await merchants.view(await merchants.require(merchant.id))).status,
    ).toBe("rejected");

    const { merchant: renewed, redirectUrl } = await merchants.renewConsent(
      merchant.id,
    );

    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");
    expect(ops.requestOutgoingPaymentGrant).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: BOB }),
      expect.objectContaining({
        limits: {
          debitAmount: cop("3000000"),
          // Each interval is a calendar month in Bogotá, from the 1st at 00:00 COT.
          interval: "R/2026-10-01T05:00:00Z/P1M",
        },
      }),
    );
    const secondMandate = (await store.getMerchant(merchant.id))!.mandateId;
    expect(secondMandate).not.toBe(firstMandate);
    expect(renewed.status).toBe("awaiting-consent");
    await approveMandate(secondMandate);
    expect(
      (await merchants.view(await merchants.require(merchant.id))).status,
    ).toBe("active");
  });

  it("keeps an active consent instead of asking again", async () => {
    const { merchants, onboardRosa } = setupMiPlante();
    const id = await onboardRosa();

    await expect(merchants.renewConsent(id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
