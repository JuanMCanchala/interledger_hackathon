import { describe, expect, it } from "vitest";
import { COOP, SAVINGS } from "./fakeOperations.js";
import { setupMiPlante } from "./miplanteHarness.js";

const MICROCREDIT = {
  label: "Microcrédito",
  category: "Microcréditos",
  kind: "debt" as const,
  destination: COOP,
  sharePercent: 15,
  monthlyQuota: "20000",
  dueDay: 20,
};
const FUND = {
  label: "Fondo de emergencia",
  category: "Ahorro",
  kind: "savings" as const,
  destination: SAVINGS,
  sharePercent: 5,
};

describe("the emergency fund as a last resort", () => {
  it("asks for a second consent, on the savings wallet, capped like the shop's", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT, FUND] });

    const { merchant, redirectUrl } = await env.merchants.authorizeEmergency(id);

    expect(redirectUrl).toBeTruthy();
    expect(merchant.emergency).toMatchObject({ label: "Fondo de emergencia", status: "awaiting-consent" });
    const stored = (await env.store.getMerchant(id))!;
    const mandate = await env.flows.findMandate(stored.emergency!.mandateId);
    expect(mandate).toMatchObject({ sender: SAVINGS, maxAmount: stored.monthlyCap });

    await env.approveMandate(stored.emergency!.mandateId);
    expect((await env.merchants.view((await env.store.getMerchant(id))!)).emergency!.status).toBe("active");
    // Like the shop's own grant, the sandbox's public routes cannot reach it.
    expect(await env.store.isMerchantMandate(stored.emergency!.mandateId)).toBe(true);
  });

  it("needs a savings wallet to keep as the last resort", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({ rules: [MICROCREDIT] });
    await expect(env.merchants.authorizeEmergency(id)).rejects.toThrow(/billetera de ahorro/);
  });
});
