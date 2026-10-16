import {
  el,
  formatMoney,
  normalizeDecimal,
  normalizeWallet,
  previewSplit,
  showMessage,
  toMinor,
} from "../app.js";

export const MAX_RULES = 5;
export const MAX_TOTAL_PERCENT = 50;
/** The preview shows how a sale of this amount splits. */
const PREVIEW_SALE = "10000";

/**
 * Rule rows plus the live "así se reparte una venta" preview. Shared by onboarding and the till.
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
    field(row, "kind").value = values.kind ?? "debt";
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

  /** The outstanding balance only makes sense (and is required) for debts. */
  function syncKind(row) {
    const isDebt = field(row, "kind").value === "debt";
    row.querySelector(".outstanding-field").hidden = !isDebt;
    field(row, "outstanding").required = isDebt;
  }

  function read() {
    return rows().map((row) => {
      const kind = field(row, "kind").value;
      const percent = field(row, "sharePercent").valueAsNumber;
      return {
        id: row.dataset.ruleId,
        storedOutstanding: row.dataset.outstanding,
        label: field(row, "label").value.trim(),
        kind,
        destination: field(row, "destination").value.trim(),
        sharePercent: Number.isFinite(percent)
          ? Math.round(percent * 100) / 100
          : NaN,
        outstanding:
          kind === "debt"
            ? normalizeDecimal(field(row, "outstanding").value)
            : "",
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
    if (cap !== undefined && split.allocated > cap) {
      preview.cap.hidden = false;
      preview.cap.textContent = `Tu tope diario (${money(cap)}) es menor que lo que se repartiría en esta venta (${money(split.allocated)}): lo que pase del tope no se descuenta ese día.`;
    } else {
      preview.cap.hidden = true;
    }
    return { totalPercent, overLimit };
  }

  /** Request body for the rules. Throws an Error with a message for the merchant. */
  function collect() {
    if (render().overLimit) {
      throw new Error(
        `La suma de porcentajes no puede pasar de ${MAX_TOTAL_PERCENT}%.`,
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
      // An existing debt whose balance was not touched keeps the stored one (even a paid-off 0).
      const untouched =
        rule.id &&
        rule.kind === "debt" &&
        rule.outstanding === rule.storedOutstanding;
      if (rule.kind === "debt" && !rule.outstanding && !untouched) {
        throw new Error(
          `${position}: escribe el saldo por pagar, por ejemplo 300.000`,
        );
      }
      const body = {
        label: rule.label,
        kind: rule.kind,
        // "proveedor-billeticos" → "$ilp.interledger-test.dev/proveedor-billeticos", like onboarding.
        destination: normalizeWallet(rule.destination),
        sharePercent: rule.sharePercent,
      };
      if (rule.id) body.id = rule.id;
      if (rule.kind === "debt" && !untouched) body.outstanding = rule.outstanding;
      return body;
    });
  }

  return { add, clear, render, collect };
}
