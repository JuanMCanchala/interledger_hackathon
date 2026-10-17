import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaStore } from "../src/storage/prismaStore.js";
import { ALICE, COOP, SUPPLIER } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/**
 * Runs the storage contract against a real PostgreSQL (ADR 0010). Needs a throwaway database:
 *   TEST_DATABASE_URL=postgresql://miplante:miplante@localhost:5432/miplante_test npm test
 * Every test starts from empty tables, so never point it at the development database.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PrismaStore (PostgreSQL)", () => {
  let store: PrismaStore;

  beforeAll(() => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    store = PrismaStore.connect(url!);
  }, 60_000);

  beforeEach(async () => {
    await store.truncateForTests();
  });

  afterAll(async () => {
    await store?.close();
  });

  async function paidSale(env: ReturnType<typeof setupMiPlante>) {
    const merchantId = await env.onboardRosa();
    const { sale } = await env.sales.createSale(merchantId, {
      amount: "10000",
    });
    await env.sales.pay(sale.id, { customerWallet: ALICE });
    const paymentId = (await store.getSale(sale.id))!.paymentId!;
    await env.approvePayment(paymentId);
    env.deliver(
      (await store.getPayment(paymentId))!.incomingPaymentUrl,
      cop("1000000"),
    );
    return { merchantId, saleId: sale.id };
  }

  it("round-trips every record of a settled sale", async () => {
    const env = setupMiPlante(store);
    const { merchantId, saleId } = await paidSale(env);

    const sale = await env.sales.refresh(saleId);

    expect(sale.settlement.status).toBe("done");
    expect(sale.settlement.kept).toEqual(cop("800000"));
    expect(sale.settlement.items.map((i) => i.amount.value)).toEqual([
      "150000",
      "50000",
    ]);
    const merchant = (await store.getMerchant(merchantId))!;
    expect(merchant.rules.map((r) => r.label)).toEqual([
      "Microcrédito",
      "Fondo de emergencia",
    ]);
    expect(merchant.rules[0]).toMatchObject({
      repaid: cop("150000"),
      outstanding: cop("29850000"),
    });
    expect(merchant.rules[1]!.outstanding).toBeUndefined();
    // Secrets survive the round trip, so the grant keeps working after a restart.
    const mandate = (await store.getMandate(merchant.mandateId))!;
    expect(mandate.token?.value).toBe("outgoing-token");
    expect(mandate.continuation).toBeDefined();
    expect(await store.listPayments({ mandateId: mandate.id })).toHaveLength(2);
    const dashboard = await store.listSales({ merchantId });
    expect(dashboard.map((s) => s.id)).toEqual([saleId]);
  });

  it("settles exactly once when many polls race", async () => {
    const env = setupMiPlante(store);
    const { saleId } = await paidSale(env);

    await Promise.all(
      Array.from({ length: 8 }, () => env.sales.refresh(saleId)),
    );
    await env.sales.refresh(saleId);

    // One outgoing payment for the customer, plus one per rule.
    expect(env.ops.createOutgoingPayment).toHaveBeenCalledTimes(3);
    expect((await store.getSale(saleId))!.settlement.status).toBe("done");
  });

  it("lets only one claim win", async () => {
    const env = setupMiPlante(store);
    const { saleId } = await paidSale(env);
    // Paid, but nobody has polled it yet, so its settlement is still pending.
    expect(
      await store.transitionSale(
        saleId,
        ["awaiting-consent", "processing"],
        { status: "paid" },
        new Date().toISOString(),
      ),
    ).toMatchObject({ status: "paid", settlement: { status: "pending" } });

    const claims = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.claimSettlement(saleId, new Date().toISOString()),
      ),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("never loses a repayment under concurrency and never goes below zero", async () => {
    const env = setupMiPlante(store);
    const merchantId = await env.onboardRosa({
      rules: [
        {
          label: "Proveedor",
          category: "Proveedores",
          kind: "debt",
          monthlyQuota: "5000",
          destination: COOP,
          sharePercent: 10,
          outstanding: "1000",
        },
      ],
    });
    const ruleId = (await store.getMerchant(merchantId))!.rules[0]!.id;

    await Promise.all(
      Array.from({ length: 12 }, () =>
        store.recordRepayment(
          merchantId,
          ruleId,
          "10000",
          new Date().toISOString(),
        ),
      ),
    );

    const [rule] = (await store.getMerchant(merchantId))!.rules;
    expect(rule!.repaid).toEqual(cop("120000"));
    expect(rule!.outstanding).toEqual(cop("0"));
  });

  it("edits the rules in place: reorders, adds, keeps what was repaid", async () => {
    const env = setupMiPlante(store);
    const { merchantId, saleId } = await paidSale(env);
    await env.sales.refresh(saleId);
    const [microcredit, savings] = (await store.getMerchant(merchantId))!
      .rules;

    await env.merchants.updateRules(merchantId, [
      {
        id: savings!.id,
        label: "Ahorro",
        category: "Ahorro",
        kind: "savings",
        destination: savings!.destination,
        sharePercent: 10,
      },
      {
        label: "Proveedor",
        category: "Proveedores",
        kind: "debt",
        monthlyQuota: "5000",
        destination: SUPPLIER,
        sharePercent: 10,
        outstanding: "50000",
      },
      {
        id: microcredit!.id,
        label: microcredit!.label,
        category: "Proveedores",
        kind: "debt",
        monthlyQuota: "5000",
        destination: microcredit!.destination,
        sharePercent: 15,
      },
    ]);

    const rules = (await store.getMerchant(merchantId))!.rules;
    expect(rules.map((r) => [r.label, r.shareBps, r.repaid.value])).toEqual([
      ["Ahorro", 1000, "50000"],
      ["Proveedor", 1000, "0"],
      ["Microcrédito", 1500, "150000"],
    ]);
    expect(rules[1]!.outstanding).toEqual(cop("5000000"));
    expect(rules[2]!.outstanding).toEqual(cop("29850000"));
  });
});
