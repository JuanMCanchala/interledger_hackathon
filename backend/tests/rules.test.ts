import { describe, expect, it } from "vitest";
import { fromMinorUnits } from "../src/shared/money.js";
import { ALICE, BOB, COOP, SAVINGS, SUPPLIER } from "./fakeOperations.js";
import { cop, setupMiPlante } from "./miplanteHarness.js";

/** A customer pays `amount` COP for a sale at Rosa's shop and the money arrives. */
async function sell(
  env: ReturnType<typeof setupMiPlante>,
  merchantId: string,
  amount = "10000",
) {
  const { sale } = await env.sales.createSale(merchantId, { amount });
  await env.sales.pay(sale.id, { customerWallet: ALICE });
  const paymentId = (await env.store.getSale(sale.id))!.paymentId!;
  await env.approvePayment(paymentId);
  env.deliver(
    (await env.store.getPayment(paymentId))!.incomingPaymentUrl,
    cop(`${amount}00`),
  );
  return env.sales.refresh(sale.id);
}

describe("editing the split rules", () => {
  it("changes how the next sale splits, without asking for consent again", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const [microcredit, savings] = (await env.merchants.require(merchantId))
      .rules;

    const updated = await env.merchants.updateRules(merchantId, [
      { ...asInput(microcredit!), sharePercent: 10 },
      {
        label: "Proveedor",
        category: "Proveedores",
        kind: "debt",
        monthlyQuota: "5000",
        destination: "$ilp.interledger-test.dev/proveedor",
        sharePercent: 10,
        outstanding: "500000",
      },
      { ...asInput(savings!), sharePercent: 5 },
    ]);

    expect(
      updated.rules.map((r) => [r.label, r.destination, r.shareBps]),
    ).toEqual([
      ["Microcrédito", COOP, 1000],
      ["Proveedor", SUPPLIER, 1000],
      ["Fondo de emergencia", SAVINGS, 500],
    ]);
    // The daily-capped grant stays the same: only one consent, at onboarding.
    expect(env.ops.requestOutgoingPaymentGrant).toHaveBeenCalledTimes(1);

    const sale = await sell(env, merchantId);
    expect(sale.settlement.kept).toEqual(cop("750000"));
    expect(
      sale.settlement.items.map((i) => [i.label, i.amount.value]),
    ).toEqual([
      ["Microcrédito", "100000"],
      ["Proveedor", "100000"],
      ["Fondo de emergencia", "50000"],
    ]);
  });

  it("keeps what each rule has repaid and the debt balance", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    await sell(env, merchantId);
    await env.payOutDebts(merchantId);
    const [microcredit, savings] = (await env.merchants.require(merchantId))
      .rules;

    // Same rules sent back without balances: only the share of savings changes.
    await env.merchants.updateRules(merchantId, [
      { ...asInput(microcredit!), outstanding: undefined },
      { ...asInput(savings!), sharePercent: 8 },
    ]);

    const [after1, after2] = (await env.merchants.require(merchantId)).rules;
    expect(after1).toMatchObject({
      id: microcredit!.id,
      repaid: cop("150000"),
      outstanding: cop("29850000"),
    });
    expect(after2).toMatchObject({
      id: savings!.id,
      shareBps: 800,
      repaid: cop("50000"),
    });
  });

  it("sets a new debt balance when one is given and removes rules left out", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const [microcredit] = (await env.merchants.require(merchantId)).rules;

    const updated = await env.merchants.updateRules(merchantId, [
      { ...asInput(microcredit!), outstanding: "100000" },
    ]);

    expect(updated.rules).toHaveLength(1);
    expect(updated.rules[0]!.outstanding).toEqual(cop("10000000"));
  });

  it("keeps a debt that is already paid off", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa({
      rules: [
        {
          label: "Proveedor",
          category: "Proveedores",
          kind: "debt",
          monthlyQuota: "5000",
          destination: COOP,
          sharePercent: 15,
          outstanding: "1000",
        },
      ],
    });
    await sell(env, merchantId); // 1,500 due, only 1,000 owed: 1,000 reserved
    await env.payOutDebts(merchantId); // paid on its due day: the debt is now paid off
    const [supplier] = (await env.merchants.require(merchantId)).rules;
    expect(supplier!.outstanding).toEqual(cop("0"));

    const updated = await env.merchants.updateRules(merchantId, [
      { ...asInput(supplier!), label: "Proveedor (pagado)" },
    ]);

    expect(updated.rules[0]).toMatchObject({
      label: "Proveedor (pagado)",
      outstanding: cop("0"),
      repaid: cop("100000"),
    });
  });

  it("refuses splits that break the merchant's promises", async () => {
    const env = setupMiPlante();
    const merchantId = await env.onboardRosa();
    const [microcredit, savings] = (await env.merchants.require(merchantId))
      .rules;

    await expect(
      env.merchants.updateRules(merchantId, [
        { ...asInput(microcredit!), sharePercent: 40 },
        { ...asInput(savings!), sharePercent: 15 },
      ]),
    ).rejects.toThrow("como máximo pueden tomar el 50%");
    await expect(
      env.merchants.updateRules(merchantId, [
        { ...asInput(savings!), destination: BOB },
      ]),
    ).rejects.toThrow("misma wallet del negocio");
    await expect(
      env.merchants.updateRules(merchantId, [
        { ...asInput(savings!), kind: "debt" },
      ]),
    ).rejects.toThrow("cuota mensual");
    await expect(
      env.merchants.updateRules(merchantId, [
        {
          ...asInput(savings!),
          id: "00000000-0000-4000-8000-000000000000",
        },
      ]),
    ).rejects.toThrow("no tiene la regla");
    // Nothing changed.
    expect(
      (await env.merchants.require(merchantId)).rules.map((r) => r.shareBps),
    ).toEqual([1500, 500]);
  });
});

/** A stored rule as the till sends it back (balances omitted, so they are kept). */
function asInput(rule: {
  id: string;
  label: string;
  category: string;
  kind: "debt" | "savings";
  destination: string;
  shareBps: number;
  monthlyQuota?: { value: string; assetScale: number };
}) {
  return {
    id: rule.id,
    label: rule.label,
    category: rule.category,
    kind: rule.kind,
    destination: rule.destination,
    sharePercent: rule.shareBps / 100,
    monthlyQuota:
      rule.monthlyQuota &&
      fromMinorUnits(rule.monthlyQuota.value, rule.monthlyQuota.assetScale),
    outstanding: undefined as string | undefined,
  };
}
