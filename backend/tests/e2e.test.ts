import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/authService.js";
import { createApp } from "../src/http/app.js";
import { ALICE, COOP, SAVINGS } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/**
 * End to end over HTTP, as the web app uses the API: sign up, set up the shop, approve the monthly
 * consent through its callback, sell, get paid by QR and by checkout, split, pay the creditor on its
 * due day, and read it all back from the dashboard. Only Open Payments is a fake; everything from
 * the HTTP routes to the store is the real code.
 */

const FRONTEND = "http://localhost:5173";
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start() {
  const env = setupMiPlante();
  server = createApp({
    auth: new AuthService(env.store, { now: env.now }),
    payouts: env.payouts,
    flows: env.flows,
    merchants: env.merchants,
    sales: env.sales,
    dashboard: env.dashboard,
    frontendUrl: FRONTEND,
    corsOrigin: FRONTEND,
  }).listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = res.headers.get("content-type")?.includes("application/json");
    return {
      status: res.status,
      body: json ? await res.json() : undefined,
      location: res.headers.get("location"),
    };
  };

  let accounts = 0;
  const signUp = async () => {
    const res = await call("POST", "/api/auth/register", {
      name: "Rosa",
      email: `rosa${++accounts}@example.test`,
      password: "una-clave-de-prueba",
    });
    expect(res.status).toBe(201);
    return res.body.token as string;
  };

  /** What the wallet appends to the finish URL when its owner approves. */
  const approveUrl = async (kind: "mandates" | "payments", id: string) => {
    const record =
      kind === "mandates" ? await env.store.getMandate(id) : await env.store.getPayment(id);
    const { interactRef, hash } = env.approve(record!.interaction!);
    return `/api/${kind}/${id}/callback?interact_ref=${interactRef}&hash=${encodeURIComponent(hash)}`;
  };

  const SHOP = {
    name: "Tienda Doña Rosa",
    wallet: "$ilp.interledger-test.dev/bob",
    monthlyCap: "300000",
    rules: [
      {
        label: "Microcrédito",
        category: "Microcréditos",
        kind: "debt",
        destination: COOP,
        sharePercent: 15,
        monthlyQuota: "100000",
        outstanding: "300000",
        dueDay: 20,
      },
      {
        label: "Fondo de emergencia",
        category: "Ahorro",
        kind: "savings",
        destination: SAVINGS,
        sharePercent: 5,
        savingsGoal: "1000000",
      },
    ],
  };

  /** Signs up and sets up an active shop: onboarding, then the wallet's consent callback. */
  const activeShop = async () => {
    const token = await signUp();
    const onboarded = await call("POST", "/api/merchants", SHOP, token);
    expect(onboarded.status).toBe(201);
    const id = onboarded.body.merchant.id as string;
    const mandateId = (await env.store.getMerchant(id))!.mandateId;
    const callback = await call("GET", await approveUrl("mandates", mandateId));
    expect(callback.status).toBe(303);
    expect(callback.location).toBe(`${FRONTEND}/merchant?id=${id}`);
    return { token, id };
  };

  return { env, call, signUp, approveUrl, activeShop, SHOP };
}

describe("end to end over HTTP", () => {
  it("runs a shop's month: sell, get paid, split, pay the creditor on its due day", async () => {
    const { env, call, approveUrl, activeShop } = await start();
    const { token, id } = await activeShop();

    const me = await call("GET", "/api/auth/me", undefined, token);
    expect(me.body.merchant).toMatchObject({ id, status: "active", monthlyCap: cop("30000000") });

    // Sale 1, paid by QR: the customer's wallet pays the sale's payment request.
    const first = await call("POST", `/api/merchants/${id}/sales`, { amount: "10000" }, token);
    expect(first.status).toBe(201);
    const firstId = first.body.sale.id as string;
    const request = (await env.store.getPayment((await env.store.getSale(firstId))!.paymentId!))!;
    env.deliver(request.incomingPaymentUrl, cop("1000000"));

    // The public sale read (the /cobro screen and the checkout) moves it forward and splits it.
    const paid = await call("GET", `/api/sales/${firstId}`);
    expect(paid.body.status).toBe("paid");
    expect(paid.body.settlement.kept).toEqual(cop("800000"));
    expect(paid.body.settlement.items.map((i: { label: string; status: string }) => [i.label, i.status])).toEqual([
      ["Microcrédito", "reserved"],
      ["Fondo de emergencia", "processing"],
    ]);

    // Sale 2, paid through MiPlante's checkout: wallet consent, then the callback.
    const second = await call("POST", `/api/merchants/${id}/sales`, { amount: "20000", description: "Mercado" }, token);
    const secondId = second.body.sale.id as string;
    const started = await call("POST", `/api/sales/${secondId}/pay`, { customerWallet: ALICE });
    expect(started.status).toBe(201);
    const paymentId = (await env.store.getSale(secondId))!.paymentId!;
    const back = await call("GET", await approveUrl("payments", paymentId));
    expect(back.status).toBe(303);
    env.deliver((await env.store.getPayment(paymentId))!.incomingPaymentUrl, cop("2000000"));
    expect((await call("GET", `/api/sales/${secondId}`)).body.status).toBe("paid");

    // The dashboard: today, the month, what is reserved for the creditor and the savings goal.
    let dashboard = (await call("GET", `/api/merchants/${id}`, undefined, token)).body;
    expect(dashboard.today).toMatchObject({ salesCount: 2, gross: cop("3000000"), kept: cop("2400000") });
    expect(dashboard.month).toMatchObject({ salesCount: 2, gross: cop("3000000") });
    expect(dashboard.rules[0]).toMatchObject({ reserved: cop("450000"), repaid: cop("0"), dueDay: 20 });
    expect(dashboard.rules[1]).toMatchObject({ savingsGoal: cop("100000000"), paidThisMonth: cop("150000") });

    // The 16th is before the due day: the scheduler sends nothing yet.
    await env.payouts.runDue();
    expect(await env.store.listPayouts(id)).toEqual([]);

    // The demo's "Simular que llegó la fecha de pago": one payment of the 100,000 quota, the 4,500
    // reserved and 95,500 from profit.
    const simulated = await call("POST", `/api/merchants/${id}/payouts`, { reason: "due-date" }, token);
    expect(simulated.status).toBe(201);
    expect(simulated.body.payouts).toHaveLength(1);
    expect(simulated.body.payouts[0]).toMatchObject({
      amount: cop("10000000"),
      topUp: cop("9550000"),
      destination: COOP,
      reason: "due-date",
    });
    const payout = simulated.body.payouts[0];
    env.deliver((await env.store.getPayment(payout.paymentId))!.incomingPaymentUrl, cop("5000000"));

    dashboard = (await call("GET", `/api/merchants/${id}`, undefined, token)).body;
    expect(dashboard.rules[0]).toMatchObject({
      reserved: cop("0"),
      paidOutThisMonth: cop("10000000"),
      repaid: cop("10000000"),
      outstanding: cop("20000000"),
    });
    expect(dashboard.payouts.map((p: { status: string }) => p.status)).toEqual(["completed"]);

    // On the real due day it is not paid again this month.
    env.clock.now = new Date("2026-10-20T15:00:00Z");
    await env.payouts.runDue();
    expect(await env.store.listPayouts(id)).toHaveLength(1);
    // And with nothing reserved, paying now says so.
    expect((await call("POST", `/api/merchants/${id}/payouts`, {}, token)).status).toBe(409);
  });

  it("changes settings, goals and the cap through the API", async () => {
    const { env, call, approveUrl, activeShop } = await start();
    const { token, id } = await activeShop();

    const settings = await call("PUT", `/api/merchants/${id}/settings`, { name: "La Esquina", monthlySalesGoal: "3000000" }, token);
    expect(settings.body).toMatchObject({ name: "La Esquina", monthlySalesGoal: cop("300000000") });

    const cap = await call("POST", `/api/merchants/${id}/cap`, { monthlyCap: "400000" }, token);
    expect(cap.status).toBe(201);
    expect(cap.body.merchant).toMatchObject({ monthlyCap: cop("30000000"), pendingCap: cop("40000000") });
    const pending = (await env.store.getMerchant(id))!.pendingCap!;
    await call("GET", await approveUrl("mandates", pending.mandateId));
    const after = (await call("GET", `/api/merchants/${id}`, undefined, token)).body;
    expect(after).toMatchObject({ monthlyCap: cop("40000000"), pendingCap: null, status: "active" });
  });
});

describe("the server checks everything itself (QA risk R1)", () => {
  it("refuses invalid shops, rules, sales and settings, whatever the browser sends", async () => {
    const { call, signUp, activeShop, SHOP } = await start();
    const token = await signUp();
    const bad = (body: unknown) => call("POST", "/api/merchants", body, token);

    expect((await bad({ ...SHOP, name: "" })).status).toBe(400);
    // Shares adding up to more than 50%, even if each one is valid.
    expect(
      (await bad({ ...SHOP, rules: [{ ...SHOP.rules[0], sharePercent: 40 }, { ...SHOP.rules[1], sharePercent: 40 }] })).status,
    ).toBe(400);
    expect((await bad({ ...SHOP, rules: [{ ...SHOP.rules[0], sharePercent: 120 }] })).status).toBe(400);
    expect((await bad({ ...SHOP, rules: [{ ...SHOP.rules[0], sharePercent: -5 }] })).status).toBe(400);
    // A cap below the month's quotas.
    expect((await bad({ ...SHOP, monthlyCap: "1000" })).status).toBe(400);
    expect((await bad({ ...SHOP, rules: [{ ...SHOP.rules[0], dueDay: 31 }] })).status).toBe(400);
    expect((await bad({ ...SHOP, rules: [{ ...SHOP.rules[0], monthlyQuota: undefined }] })).status).toBe(400);

    const shop = await activeShop();
    for (const amount of ["0", "-5", "abc", "12.345", "999999999999999999"]) {
      const res = await call("POST", `/api/merchants/${shop.id}/sales`, { amount }, shop.token);
      expect(res.status, `amount ${amount}`).toBe(400);
    }
    const put = (rules: unknown) => call("PUT", `/api/merchants/${shop.id}/rules`, { rules }, shop.token);
    expect((await put([{ ...SHOP.rules[0], sharePercent: 30 }, { ...SHOP.rules[1], sharePercent: 30 }])).status).toBe(400);
    expect((await call("PUT", `/api/merchants/${shop.id}/settings`, { name: "" }, shop.token)).status).toBe(400);
    expect((await call("POST", `/api/merchants/${shop.id}/cap`, { monthlyCap: "1000" }, shop.token)).status).toBe(400);
  });
});

describe("one account cannot see or touch another's shop (QA risk R2)", () => {
  it("answers 404 to every shop route for another account, and 401 without a session", async () => {
    const { call, signUp, activeShop, SHOP } = await start();
    const { id } = await activeShop();
    const stranger = await signUp();

    const routes: [string, string, unknown?][] = [
      ["GET", `/api/merchants/${id}`],
      ["PUT", `/api/merchants/${id}/rules`, { rules: SHOP.rules }],
      ["PUT", `/api/merchants/${id}/settings`, { name: "Robada" }],
      ["POST", `/api/merchants/${id}/sales`, { amount: "1000" }],
      ["POST", `/api/merchants/${id}/payouts`, {}],
      ["POST", `/api/merchants/${id}/cap`, { monthlyCap: "500000" }],
      ["POST", `/api/merchants/${id}/consent`, {}],
    ];
    for (const [method, path, body] of routes) {
      expect((await call(method, path, body, stranger)).status, `${method} ${path}`).toBe(404);
      expect((await call(method, path, body)).status, `${method} ${path} sin sesión`).toBe(401);
    }
    // The stranger's own account shows no shop at all.
    expect((await call("GET", "/api/auth/me", undefined, stranger)).body.merchant).toBeNull();
  });

  it("keeps a shop's grant out of reach of the sandbox's public mandate routes", async () => {
    const { env, call, activeShop } = await start();
    const { token, id } = await activeShop();
    const mandateId = (await env.store.getMerchant(id))!.mandateId;

    // Nothing public leads to the shop's mandate: not the sale, not its payments.
    const sale = await call("POST", `/api/merchants/${id}/sales`, { amount: "10000" }, token);
    const saleId = sale.body.sale.id;
    const request = (await env.store.getPayment((await env.store.getSale(saleId))!.paymentId!))!;
    env.deliver(request.incomingPaymentUrl, cop("1000000"));
    const read = await call("GET", `/api/sales/${saleId}`);
    expect(JSON.stringify(read.body)).not.toContain(mandateId);
    expect(read.body.settlement.items.every((i: object) => !("paymentId" in i))).toBe(true);
    const share = (await env.store.getSale(saleId))!.settlement.items.find((i) => i.paymentId)!;
    expect(JSON.stringify((await call("GET", `/api/payments/${share.paymentId}`)).body)).not.toContain(mandateId);

    // And even knowing it, the sandbox cannot read, charge, split or revoke it.
    expect((await call("GET", `/api/mandates/${mandateId}`)).status).toBe(404);
    expect((await call("POST", `/api/mandates/${mandateId}/charges`, { receiver: ALICE, amount: "1000" })).status).toBe(404);
    expect(
      (await call("POST", `/api/mandates/${mandateId}/split`, { receivers: [{ receiver: ALICE, amount: "1000" }] })).status,
    ).toBe(404);
    expect((await call("DELETE", `/api/mandates/${mandateId}`)).status).toBe(404);
    expect((await env.flows.findMandate(mandateId)).status).toBe("active");
  });

  it("a damaged sale link answers 404, so /cobro can say so", async () => {
    const { call } = await start();
    expect((await call("GET", "/api/sales/not-a-real-id")).status).toBe(404);
    expect((await call("GET", "/api/sales/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
