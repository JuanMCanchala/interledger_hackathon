import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app.js";
import { PaymentFlows } from "../src/openPayments/flows.js";
import { Store } from "../src/storage/store.js";
import { ALICE, BOB, createFakeOperations } from "./fakeOperations.js";

const FRONTEND_URL = "http://localhost:5173";
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { ops } = createFakeOperations();
  const flows = new PaymentFlows(ops, new Store(), {
    publicBaseUrl: "http://localhost:3000",
    allowedWalletHosts: ["ilp.interledger-test.dev"],
  });
  server = createApp({
    flows,
    frontendUrl: FRONTEND_URL,
    corsOrigin: FRONTEND_URL,
  }).listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const postJson = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

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
