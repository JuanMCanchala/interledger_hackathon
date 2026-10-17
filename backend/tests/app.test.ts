import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/authService.js";
import { createApp } from "../src/http/app.js";
import { PayoutService } from "../src/merchants/payoutService.js";
import { DashboardService } from "../src/merchants/dashboardService.js";
import { MerchantService } from "../src/merchants/merchantService.js";
import { SalesService } from "../src/merchants/salesService.js";
import { PaymentFlows } from "../src/openPayments/flows.js";
import { MemoryStore } from "../src/storage/store.js";
import {
  ALICE,
  BOB,
  COOP,
  SAVINGS,
  createFakeOperations,
} from "./fakeOperations.js";

const FRONTEND_URL = "http://localhost:5173";
let server: Server;
let baseUrl: string;
let store: MemoryStore;

beforeAll(async () => {
  const { ops } = createFakeOperations();
  store = new MemoryStore();
  const flows = new PaymentFlows(ops, store, {
    publicBaseUrl: "http://localhost:3000",
    allowedWalletHosts: ["ilp.interledger-test.dev"],
  });
  const merchants = new MerchantService(flows, store);
  const sales = new SalesService(flows, merchants, store, {
    frontendUrl: FRONTEND_URL,
  });
  server = createApp({
    auth: new AuthService(store),
    payouts: new PayoutService(flows, merchants, store),
    flows,
    merchants,
    sales,
    dashboard: new DashboardService(flows, merchants, sales, store),
    frontendUrl: FRONTEND_URL,
    corsOrigin: FRONTEND_URL,
  }).listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const postJson = (path: string, body: unknown, token?: string) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const getJson = (path: string, token?: string) =>
  fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

let accounts = 0;
/** Signs a new shopkeeper up and returns their session token. */
async function signUp(): Promise<string> {
  const res = await postJson("/api/auth/register", {
    name: "Rosa",
    email: `rosa${++accounts}@example.com`,
    password: "contraseña-segura",
  });
  return (await res.json()).token;
}

describe("HTTP API", () => {
  it("validates the payment body", async () => {
    const res = await postJson("/api/payments", {
      sender: ALICE,
      receiver: BOB,
      amount: "diez",
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Datos inválidos");
    expect(body.details.join(" ")).toContain("amount");
  });

  it("answers 400 to malformed JSON", async () => {
    const res = await postJson("/api/payments", "{not json");
    expect(res.status).toBe(400);
  });

  it("answers 404 for unknown payments and routes", async () => {
    expect((await fetch(`${baseUrl}/api/payments/does-not-exist`)).status).toBe(
      404,
    );
    expect((await fetch(`${baseUrl}/api/nope`)).status).toBe(404);
  });

  it("starts a payment without leaking tokens or nonces", async () => {
    const res = await postJson("/api/payments", {
      sender: ALICE,
      receiver: BOB,
      amount: "10.50",
    });
    const text = await res.text();

    expect(res.status).toBe(201);
    expect(JSON.parse(text).redirectUrl).toBe(
      "https://wallet.interledger-test.dev/consent/1",
    );
    expect(text).not.toContain("continue-token");
    expect(text).not.toContain("incoming-token");
    expect(text).not.toContain("server-nonce");
  });

  it("sends the browser back to the frontend after the consent screen", async () => {
    const created = await (
      await postJson("/api/payments", {
        sender: ALICE,
        receiver: BOB,
        amount: "1",
      })
    ).json();
    const res = await fetch(
      `${baseUrl}/api/payments/${created.payment.id}/callback?interact_ref=x&hash=forged`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `${FRONTEND_URL}/?payment=${created.payment.id}`,
    );
    const payment = await (
      await fetch(`${baseUrl}/api/payments/${created.payment.id}`)
    ).json();
    expect(payment.status).toBe("failed");
  });

  it("allows the configured frontend origin", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND_URL);
  });
});

describe("MiPlante API", () => {
  const rosa = {
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

  it("onboards a merchant, sells and starts the customer's payment", async () => {
    const token = await signUp();
    const onboarded = await postJson("/api/merchants", rosa, token);
    expect(onboarded.status).toBe(201);
    const { merchant, redirectUrl } = await onboarded.json();
    expect(redirectUrl).toBe("https://wallet.interledger-test.dev/consent/1");

    const created = await postJson(
      `/api/merchants/${merchant.id}/sales`,
      { amount: "10000" },
      token,
    );
    expect(created.status).toBe(201);
    const { sale, payUrl, checkoutUrl } = await created.json();
    expect(payUrl).toMatch(/\/incoming-payments\//);
    expect(checkoutUrl).toBe(`${FRONTEND_URL}/pay?sale=${sale.id}`);

    const paying = await postJson(`/api/sales/${sale.id}/pay`, {
      customerWallet: ALICE,
    });
    expect(paying.status).toBe(201);
    expect((await paying.json()).sale.status).toBe("awaiting-consent");

    const dashboard = await (
      await getJson(`/api/merchants/${merchant.id}`, token)
    ).json();
    expect(dashboard).toMatchObject({
      name: "Tienda Doña Rosa",
      wallet: BOB,
      status: "awaiting-consent",
    });
    expect(dashboard.history).toHaveLength(7);
    expect(dashboard.sales).toHaveLength(1);
  });

  it("keeps a shop's grant out of the sandbox's mandate routes", async () => {
    const token = await signUp();
    const { merchant } = await (
      await postJson("/api/merchants", rosa, token)
    ).json();
    const { mandateId } = (await store.getMerchant(merchant.id))!;
    const path = `/api/mandates/${mandateId}`;
    const charge = { receiver: ALICE, amount: "1000" };

    expect((await fetch(`${baseUrl}${path}`)).status).toBe(404);
    expect((await postJson(`${path}/charges`, charge)).status).toBe(404);
    expect(
      (await postJson(`${path}/split`, { receivers: [{ receiver: ALICE, amount: "1000" }] }))
        .status,
    ).toBe(404);
    expect((await fetch(`${baseUrl}${path}`, { method: "DELETE" })).status).toBe(404);
    expect((await store.getMandate(mandateId))!.status).not.toBe("revoked");

    // The sandbox's own mandates still work.
    const sandbox = await postJson("/api/mandates", {
      sender: ALICE,
      maxAmount: "100",
    });
    const { mandate } = await sandbox.json();
    expect((await fetch(`${baseUrl}/api/mandates/${mandate.id}`)).status).toBe(200);
  });

  it("validates merchant rules at the edge", async () => {
    const res = await postJson(
      "/api/merchants",
      { ...rosa, rules: [{ ...rosa.rules[1], sharePercent: 80 }] },
      await signUp(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).details.join(" ")).toContain("sharePercent");
  });

  it("edits the split rules of a merchant", async () => {
    const token = await signUp();
    const { merchant } = await (
      await postJson("/api/merchants", rosa, token)
    ).json();
    const put = (body: unknown) =>
      fetch(`${baseUrl}/api/merchants/${merchant.id}/rules`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    const [microcredit] = merchant.rules;

    const ok = await put({
      rules: [
        { ...rosa.rules[0], id: microcredit.id, sharePercent: 20 },
        { ...rosa.rules[1], sharePercent: 10 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(
      (await ok.json()).rules.map((r: { shareBps: number }) => r.shareBps),
    ).toEqual([2000, 1000]);

    const duplicated = await put({
      rules: [
        { ...rosa.rules[0], id: microcredit.id },
        { ...rosa.rules[1], id: microcredit.id },
      ],
    });
    expect(duplicated.status).toBe(400);
    expect((await put({ rules: [] })).status).toBe(400);
  });

  it("answers 404 for unknown merchants and sales", async () => {
    const token = await signUp();
    expect((await getJson("/api/merchants/nope", token)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/sales/nope`)).status).toBe(404);
  });
});

describe("clean page URLs", () => {
  it("serves each page without the .html extension, with or without a trailing slash", async () => {
    for (const path of [
      "/onboard",
      "/onboard/",
      "/merchant",
      "/pay",
      "/sandbox/",
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toContain("text/html");
    }
  });

  it("redirects the old .html links permanently and keeps the query", async () => {
    const res = await fetch(`${baseUrl}/pay.html?sale=abc`, {
      redirect: "manual",
    });

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/pay?sale=abc");
  });
});

describe("shopkeeper accounts", () => {
  it("signs up, signs in, knows who is signed in and signs out", async () => {
    const registered = await postJson("/api/auth/register", {
      name: "Don Pedro",
      email: "Pedro@Example.com",
      password: "una-clave-larga",
    });
    expect(registered.status).toBe(201);
    const { user } = await registered.json();
    expect(user).toEqual({
      id: expect.any(String),
      name: "Don Pedro",
      email: "pedro@example.com",
    });
    // The hash never leaves the server.
    expect(JSON.stringify(user)).not.toContain("scrypt");

    const login = await postJson("/api/auth/login", {
      email: "pedro@example.com",
      password: "una-clave-larga",
    });
    const { token } = await login.json();
    const me = await (await getJson("/api/auth/me", token)).json();
    expect(me).toEqual({ user, merchant: null });

    expect((await postJson("/api/auth/logout", {}, token)).status).toBe(204);
    expect((await getJson("/api/auth/me", token)).status).toBe(401);
  });

  it("refuses a wrong password and a second account with the same email", async () => {
    await postJson("/api/auth/register", {
      name: "Lucía",
      email: "lucia@example.com",
      password: "una-clave-larga",
    });

    const wrong = await postJson("/api/auth/login", {
      email: "lucia@example.com",
      password: "otra-clave",
    });
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe("Correo o contraseña incorrectos");

    const twice = await postJson("/api/auth/register", {
      name: "Lucía",
      email: "LUCIA@example.com",
      password: "una-clave-larga",
    });
    expect(twice.status).toBe(409);
  });

  it("lets one of two simultaneous sign-ups with the same email in and refuses the other", async () => {
    const body = {
      name: "Marta",
      email: "marta@example.com",
      password: "una-clave-larga",
    };
    const statuses = (
      await Promise.all([1, 2, 3].map(() => postJson("/api/auth/register", body)))
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([201, 409, 409]);
  });

  it("asks for a session to set up a shop, and hides a shop from other accounts", async () => {
    const rosa = {
      name: "Tienda Doña Rosa",
      wallet: "$ilp.interledger-test.dev/bob",
      monthlyCap: "30000",
      rules: [
        {
          label: "Fondo de emergencia",
          category: "Ahorro",
          kind: "savings",
          destination: SAVINGS,
          sharePercent: 5,
        },
      ],
    };
    expect((await postJson("/api/merchants", rosa)).status).toBe(401);

    const owner = await signUp();
    const { merchant } = await (
      await postJson("/api/merchants", rosa, owner)
    ).json();
    const me = await (await getJson("/api/auth/me", owner)).json();
    expect(me.merchant.id).toBe(merchant.id);

    const stranger = await signUp();
    expect((await getJson(`/api/merchants/${merchant.id}`, stranger)).status).toBe(404);
    expect((await getJson(`/api/merchants/${merchant.id}`)).status).toBe(401);
    expect(
      (await postJson(`/api/merchants/${merchant.id}/sales`, { amount: "1000" }, stranger))
        .status,
    ).toBe(404);
  });
});
