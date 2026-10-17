import {
  MAX_RULES,
  MAX_TOTAL_PERCENT,
  el,
  formatMoney,
  normalizeDecimal,
  normalizeWallet,
  previewSplit,
  showMessage,
  toMinor,
} from "./app.js";

/** The preview shows how a sale of this amount splits. */
const PREVIEW_SALE = "10000";

/**
 * Rule rows plus the live "así se reparte una venta" preview, used by the till.
 * Rows created from a stored rule remember its ID and balance: an untouched balance is not sent
 * back, so editing never undoes a repayment that lands meanwhile.
 */
export function createRulesEditor({
  box,
  template,
  addButton,
  preview,
  asset = { assetCode: "COP", assetScale: 2 },
  capMinor = () => undefined,
}) {
  const scale = asset.assetScale;
  const money = (minor) =>
    formatMoney(Number(minor) / 10 ** scale, asset.assetCode);
  const field = (row, name) => row.querySelector(`[data-field="${name}"]`);
  const rows = () => [...box.querySelectorAll(".rule-row")];

  function add(values = {}) {
    if (rows().length >= MAX_RULES) return;
    const row = template.content.firstElementChild.cloneNode(true);
    field(row, "label").value = values.label ?? "";
    field(row, "category").value = values.category ?? "";
    field(row, "kind").value = values.kind ?? "debt";
    field(row, "monthlyQuota").value = values.monthlyQuota ?? "";
    field(row, "savingsGoal").value = values.savingsGoal ?? "";
    // A debt without a stored due day is paid on the 28th, as the server does.
    field(row, "dueDay").value =
      values.dueDay ?? ((values.kind ?? "debt") === "debt" ? 28 : "");
    field(row, "sharePercent").value = values.sharePercent ?? "";
    field(row, "outstanding").value = values.outstanding ?? "";
    field(row, "destination").value = values.destination ?? "";
    if (values.id) {
      row.dataset.ruleId = values.id;
      row.dataset.outstanding = normalizeDecimal(values.outstanding);
    }
    field(row, "kind").addEventListener("change", () => {
      syncKind(row);
      render();
    });
    row.querySelector(".remove-rule").addEventListener("click", () => {
      if (rows().length <= 1) return;
      row.remove();
      render();
    });
    box.append(row);
    syncKind(row);
    render();
  }

  function clear() {
    box.replaceChildren();
  }

  /**
   * The monthly quota (required) and the balance (optional) only make sense for obligations, and
   * the savings goal (optional) only for savings.
   */
  function syncKind(row) {
    const isDebt = field(row, "kind").value === "debt";
    for (const debtField of row.querySelectorAll(".debt-only")) {
      debtField.hidden = !isDebt;
    }
    for (const savingsField of row.querySelectorAll(".savings-only")) {
      savingsField.hidden = isDebt;
    }
    field(row, "monthlyQuota").required = isDebt;
  }

  function read() {
    return rows().map((row) => {
      const kind = field(row, "kind").value;
      const percent = field(row, "sharePercent").valueAsNumber;
      return {
        id: row.dataset.ruleId,
        storedOutstanding: row.dataset.outstanding,
        label: field(row, "label").value.trim(),
        category: field(row, "category").value.trim(),
        kind,
        destination: field(row, "destination").value.trim(),
        sharePercent: Number.isFinite(percent)
          ? Math.round(percent * 100) / 100
          : NaN,
        monthlyQuota:
          kind === "debt"
            ? normalizeDecimal(field(row, "monthlyQuota").value)
            : "",
        outstanding:
          kind === "debt"
            ? normalizeDecimal(field(row, "outstanding").value)
            : "",
        savingsGoal:
          kind === "savings"
            ? normalizeDecimal(field(row, "savingsGoal").value)
            : "",
        dueDay: kind === "debt" ? field(row, "dueDay").valueAsNumber : NaN,
        // What was typed in the amounts this kind uses, to tell a mistake from an empty field.
        typed: {
          monthlyQuota: kind === "debt" ? field(row, "monthlyQuota").value.trim() : "",
          outstanding: kind === "debt" ? field(row, "outstanding").value.trim() : "",
          savingsGoal: kind === "savings" ? field(row, "savingsGoal").value.trim() : "",
        },
      };
    });
  }

  function render() {
    const rules = read();
    const count = rows().length;
    addButton.disabled = count >= MAX_RULES;
    for (const row of rows())
      row.querySelector(".remove-rule").disabled = count <= 1;

    const valid = rules.filter(
      (rule) => Number.isFinite(rule.sharePercent) && rule.sharePercent > 0,
    );
    const saleMinor = toMinor(PREVIEW_SALE, scale);
    const split = previewSplit(
      saleMinor,
      valid.map((rule) => ({
        label: rule.label || (rule.kind === "debt" ? "Crédito" : "Ahorro"),
        kind: rule.kind,
        shareBps: Math.round(rule.sharePercent * 100),
        outstandingMinor: rule.outstanding
          ? toMinor(rule.outstanding, scale)
          : undefined,
      })),
    );

    const parts = [
      `tú recibes ${money(split.kept)}`,
      ...split.items.map((item) => `${item.label} ${money(item.amount)}`),
    ];
    preview.sentence.textContent = `Por una venta de ${money(saleMinor)}: ${parts.join(" · ")}`;

    const share = (minor) => `${(Number(minor) * 100) / Number(saleMinor)}%`;
    preview.bar.replaceChildren(
      el("span", { class: "seg-kept", style: `width: ${share(split.kept)}` }),
      ...split.items.map((item) =>
        el("span", {
          class: item.kind === "debt" ? "seg-debt" : "seg-savings",
          style: `width: ${share(item.amount)}`,
        }),
      ),
    );

    preview.list.replaceChildren(
      el(
        "li",
        { class: "split-item is-kept" },
        el("span", { class: "split-label", text: "Tú te quedas" }),
        el("span", { class: "split-amount", text: money(split.kept) }),
      ),
      ...split.items.map((item) =>
        el(
          "li",
          { class: "split-item" },
          el("span", { class: "split-label", text: item.label }),
          el("span", { class: "split-amount", text: money(item.amount) }),
        ),
      ),
    );

    const totalPercent = valid.reduce(
      (sum, rule) => sum + rule.sharePercent,
      0,
    );
    const overLimit = totalPercent > MAX_TOTAL_PERCENT;
    showMessage(
      preview.warning,
      overLimit
        ? `Las reglas suman ${totalPercent.toLocaleString("es-CO")}%. El máximo es ${MAX_TOTAL_PERCENT}% para que siempre te quede la mayor parte de cada venta.`
        : "",
    );

    const cap = capMinor();
    const quotas = rules
      .filter((rule) => rule.kind === "debt" && rule.monthlyQuota)
      .reduce((sum, rule) => sum + toMinor(rule.monthlyQuota, scale), 0n);
    const overCap = cap !== undefined && quotas > cap;
    if (overCap) {
      preview.cap.hidden = false;
      preview.cap.textContent = `Las cuotas del mes suman ${money(quotas)}, más que tu límite mensual de ${money(cap)}. Baja alguna cuota.`;
    } else {
      preview.cap.hidden = true;
    }
    return { totalPercent, overLimit, overCap };
  }

  /** Request body for the rules. Throws an Error with a message for the merchant. */
  function collect() {
    const { overLimit, overCap } = render();
    if (overLimit) {
      throw new Error(
        `La suma de porcentajes no puede pasar de ${MAX_TOTAL_PERCENT}%.`,
      );
    }
    if (overCap) {
      throw new Error(
        "Las cuotas del mes no pueden sumar más que tu límite mensual.",
      );
    }
    return read().map((rule, index) => {
      const position = `Regla ${index + 1}`;
      if (
        !Number.isFinite(rule.sharePercent) ||
        rule.sharePercent < 0.01 ||
        rule.sharePercent > MAX_TOTAL_PERCENT
      ) {
        throw new Error(
          `${position}: el porcentaje debe estar entre 0,01 y ${MAX_TOTAL_PERCENT}`,
        );
      }
      if (!rule.category) {
        throw new Error(`${position}: escribe su categoría, por ejemplo Proveedores`);
      }
      for (const [name, what] of [
        ["monthlyQuota", "la cuota del mes"],
        ["outstanding", "la deuda total"],
        ["savingsGoal", "la meta de ahorro"],
      ]) {
        if (rule.typed[name] && !rule[name]) {
          throw new Error(`${position}: revisa ${what}, por ejemplo 200.000`);
        }
      }
      if (rule.kind === "debt" && !rule.monthlyQuota) {
        throw new Error(
          `${position}: escribe la cuota del mes, por ejemplo 200.000`,
        );
      }
      // An existing debt whose balance was not touched keeps the stored one (even a paid-off 0).
      const untouched =
        rule.id &&
        rule.kind === "debt" &&
        rule.outstanding === rule.storedOutstanding;
      const body = {
        label: rule.label,
        category: rule.category,
        kind: rule.kind,
        // "proveedor-billeticos" → "$ilp.interledger-test.dev/proveedor-billeticos", like onboarding.
        destination: normalizeWallet(rule.destination),
        sharePercent: rule.sharePercent,
      };
      if (rule.id) body.id = rule.id;
      if (rule.kind === "debt") {
        if (!Number.isInteger(rule.dueDay) || rule.dueDay < 1 || rule.dueDay > 28) {
          throw new Error(`${position}: el día de pago va del 1 al 28`);
        }
        body.monthlyQuota = rule.monthlyQuota;
        body.dueDay = rule.dueDay;
      }
      if (rule.kind === "savings" && rule.savingsGoal) {
        body.savingsGoal = rule.savingsGoal;
      }
      if (rule.kind === "debt" && !untouched && rule.outstanding) {
        body.outstanding = rule.outstanding;
      }
      return body;
    });
  }

  return { add, clear, render, collect };
}
