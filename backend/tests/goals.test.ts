import { describe, expect, it } from "vitest";
import { cop, setupMiPlante } from "./miplanteHarness.js";

const SAVINGS = {
  label: "Fondo de emergencia",
  category: "Ahorro",
  kind: "savings" as const,
  destination: "$ilp.interledger-test.dev/ahorro",
  sharePercent: 5,
};

describe("shop goals", () => {
  it("keeps a savings goal on a savings rule, and drops it from a debt", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa({
      rules: [{ ...SAVINGS, savingsGoal: "1000000" }],
    });
    expect((await env.store.getMerchant(id))!.rules[0]!.savingsGoal).toEqual(
      cop("100000000"),
    );

    const view = await env.merchants.updateRules(id, [
      {
        label: "Microcrédito",
        category: "Microcréditos",
        kind: "debt",
        destination: "$ilp.interledger-test.dev/coop",
        sharePercent: 10,
        monthlyQuota: "2000",
        savingsGoal: "500000",
      },
    ]);
    expect(view.rules[0]!.savingsGoal).toBeUndefined();
  });

  it("sets, changes and clears the monthly sales goal and renames the shop", async () => {
    const env = setupMiPlante();
    const id = await env.onboardRosa();

    const set = await env.merchants.updateSettings(id, {
      name: "Tienda La Esquina",
      monthlySalesGoal: "3000000",
    });
    expect(set.name).toBe("Tienda La Esquina");
    expect(set.monthlySalesGoal).toEqual(cop("300000000"));

    // A rename alone keeps the goal.
    const renamed = await env.merchants.updateSettings(id, { name: "La Esquina" });
    expect(renamed.monthlySalesGoal).toEqual(cop("300000000"));

    const cleared = await env.merchants.updateSettings(id, { monthlySalesGoal: null });
    expect(cleared.monthlySalesGoal).toBeNull();
    expect(cleared.name).toBe("La Esquina");
  });
});
