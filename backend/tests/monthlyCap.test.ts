import { describe, expect, it } from "vitest";
import { cop, setupMiPlante } from "./miplanteHarness.js";

describe("changing the monthly cap", () => {
  it("keeps the current grant until the merchant approves the new cap", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa();
    const before = (await env.store.getMerchant(id))!;

    const { merchant, redirectUrl } = await env.merchants.changeCap(id, "60000");
    expect(redirectUrl).toBeTruthy();
    expect(merchant.monthlyCap).toEqual(before.monthlyCap);
    expect(merchant.pendingCap).toEqual(cop("6000000"));
    expect(merchant.status).toBe("active");

    // While waiting, the dashboard still runs on the old grant.
    const waiting = await env.dashboard.get(id);
    expect(waiting.monthlyCap).toEqual(before.monthlyCap);
    expect(waiting.pendingCap).toEqual(cop("6000000"));

    const pending = (await env.store.getMerchant(id))!.pendingCap!;
    await env.approveMandate(pending.mandateId);
    const approved = await env.dashboard.get(id);

    expect(approved.monthlyCap).toEqual(cop("6000000"));
    expect(approved.pendingCap).toBeNull();
    expect(approved.status).toBe("active");
    expect((await env.store.getMerchant(id))!.mandateId).toBe(pending.mandateId);
    expect((await env.flows.findMandate(before.mandateId)).status).toBe("revoked");
  });

  it("applies an approved cap before asking for another one", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa();
    const first = (await env.store.getMerchant(id))!.mandateId;
    await env.merchants.changeCap(id, "60000");
    const approved = (await env.store.getMerchant(id))!.pendingCap!.mandateId;
    await env.approveMandate(approved);

    // Straight to another change, without opening the dashboard in between.
    const { merchant } = await env.merchants.changeCap(id, "90000");

    expect(merchant.monthlyCap).toEqual(cop("6000000"));
    expect(merchant.pendingCap).toEqual(cop("9000000"));
    expect((await env.store.getMerchant(id))!.mandateId).toBe(approved);
    expect((await env.flows.findMandate(first)).status).toBe("revoked");
  });

  it("drops a new cap the merchant rejects, and keeps the current one", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa();
    const before = (await env.store.getMerchant(id))!;
    await env.merchants.changeCap(id, "60000");
    const pending = (await env.store.getMerchant(id))!.pendingCap!;

    await env.flows.completeMandate(pending.mandateId, { result: "grant_rejected" });
    const after = await env.dashboard.get(id);

    expect(after.monthlyCap).toEqual(before.monthlyCap);
    expect(after.pendingCap).toBeNull();
    expect(after.status).toBe("active");
  });

  it("refuses a cap below this month's quotas, or the same cap again", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa();

    // The message reads like the rest of the app: "$ 20.000", not "20000.00 COP".
    await expect(env.merchants.changeCap(id, "1000")).rejects.toThrow(
      /Las cuotas del mes suman \$\s20\.000, más que el límite mensual de \$\s1\.000/,
    );
    await expect(env.merchants.changeCap(id, "30000")).rejects.toThrow(/ya es tu límite/);
  });

  it("refuses a sale too large for a wallet, with a message that says so", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa();
    await expect(
      env.sales.createSale(id, { amount: "999999999999999999" }),
    ).rejects.toThrow(/demasiado grande: el máximo por venta es \$\s100\.000\.000/);
    expect(env.ops.createIncomingPayment).not.toHaveBeenCalled();
  });
});
