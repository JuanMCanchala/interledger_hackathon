import {
  STORAGE_KEYS,
  el,
  formatMoney,
  normalizeDecimal,
  postJson,
  previewSplit,
  remember,
  showMessage,
  toMinor,
  withBusy,
} from "../app.js";

const MAX_RULES = 5;
const MAX_TOTAL_PERCENT = 50;
/** The preview assumes COP with two decimals, like the test wallet's COP accounts. */
const PREVIEW_SALE = "10000";
const PREVIEW_SCALE = 2;

const form = document.getElementById("onboard-form");
const nameInput = document.getElementById("business-name");
const walletInput = document.getElementById("business-wallet");
const capInput = document.getElementById("daily-cap");
const rulesBox = document.getElementById("rules");
const template = document.getElementById("rule-template");
const addButton = document.getElementById("add-rule");
const submitButton = document.getElementById("submit");
const formError = document.getElementById("form-error");
const previewSentence = document.getElementById("preview-sentence");
const previewBar = document.getElementById("preview-bar");
const previewList = document.getElementById("preview-list");
const previewWarning = document.getElementById("preview-warning");
const previewCap = document.getElementById("preview-cap");

const money = (minor) =>
  formatMoney(Number(minor) / 10 ** PREVIEW_SCALE, "COP");

function field(row, name) {
  return row.querySelector(`[data-field="${name}"]`);
}

function rows() {
  return [...rulesBox.querySelectorAll(".rule-row")];
}

function addRule(values = {}) {
  if (rows().length >= MAX_RULES) return;
  const row = template.content.firstElementChild.cloneNode(true);
  field(row, "label").value = values.label ?? "";
  field(row, "kind").value = values.kind ?? "debt";
  field(row, "sharePercent").value = values.sharePercent ?? "";
  field(row, "outstanding").value = values.outstanding ?? "";
  field(row, "destination").value = values.destination ?? "";
  field(row, "kind").addEventListener("change", () => {
    syncKind(row);
    render();
  });
  row.querySelector(".remove-rule").addEventListener("click", () => {
    if (rows().length <= 1) return;
    row.remove();
    render();
  });
  rulesBox.append(row);
  syncKind(row);
  render();
}

/** The outstanding balance only makes sense (and is required) for debts. */
function syncKind(row) {
  const isDebt = field(row, "kind").value === "debt";
  row.querySelector(".outstanding-field").hidden = !isDebt;
  field(row, "outstanding").required = isDebt;
}

function readRules() {
  return rows().map((row) => {
    const kind = field(row, "kind").value;
    const percent = field(row, "sharePercent").valueAsNumber;
    const outstanding =
      kind === "debt" ? normalizeDecimal(field(row, "outstanding").value) : "";
    return {
      label: field(row, "label").value.trim(),
      kind,
      destination: field(row, "destination").value.trim(),
      sharePercent: Number.isFinite(percent)
        ? Math.round(percent * 100) / 100
        : NaN,
      outstanding,
    };
  });
}

function render() {
  const rules = readRules();
  const count = rows().length;
  addButton.disabled = count >= MAX_RULES;
  for (const row of rows())
    row.querySelector(".remove-rule").disabled = count <= 1;

  const valid = rules.filter(
    (rule) => Number.isFinite(rule.sharePercent) && rule.sharePercent > 0,
  );
  const saleMinor = toMinor(PREVIEW_SALE, PREVIEW_SCALE);
  const preview = previewSplit(
    saleMinor,
    valid.map((rule) => ({
      label: rule.label || (rule.kind === "debt" ? "Crédito" : "Ahorro"),
      kind: rule.kind,
      shareBps: Math.round(rule.sharePercent * 100),
      outstandingMinor: rule.outstanding
        ? toMinor(rule.outstanding, PREVIEW_SCALE)
        : undefined,
    })),
  );

  const parts = [
    `tú recibes ${money(preview.kept)}`,
    ...preview.items.map((item) => `${item.label} ${money(item.amount)}`),
  ];
  previewSentence.textContent = `Por una venta de ${money(saleMinor)}: ${parts.join(" · ")}`;

  const share = (minor) => `${(Number(minor) * 100) / Number(saleMinor)}%`;
  previewBar.replaceChildren(
    el("span", { class: "seg-kept", style: `width: ${share(preview.kept)}` }),
    ...preview.items.map((item) =>
      el("span", {
        class: item.kind === "debt" ? "seg-debt" : "seg-savings",
        style: `width: ${share(item.amount)}`,
      }),
    ),
  );

  previewList.replaceChildren(
    el(
      "li",
      { class: "split-item is-kept" },
      el("span", { class: "split-label", text: "Tú te quedas" }),
      el("span", { class: "split-amount", text: money(preview.kept) }),
    ),
    ...preview.items.map((item) =>
      el(
        "li",
        { class: "split-item" },
        el("span", { class: "split-label", text: item.label }),
        el("span", { class: "split-amount", text: money(item.amount) }),
      ),
    ),
  );

  const totalPercent = valid.reduce((sum, rule) => sum + rule.sharePercent, 0);
  const overLimit = totalPercent > MAX_TOTAL_PERCENT;
  showMessage(
    previewWarning,
    overLimit
      ? `Las reglas suman ${totalPercent.toLocaleString("es-CO")}%. El máximo es ${MAX_TOTAL_PERCENT}% para que siempre te quede la mayor parte de cada venta.`
      : "",
  );

  const cap = normalizeDecimal(capInput.value);
  const capMinor = cap ? toMinor(cap, PREVIEW_SCALE) : undefined;
  if (capMinor !== undefined && preview.allocated > capMinor) {
    previewCap.hidden = false;
    previewCap.textContent = `Tu tope diario (${money(capMinor)}) es menor que lo que se repartiría en esta venta (${money(preview.allocated)}): lo que pase del tope no se descuenta ese día.`;
  } else {
    previewCap.hidden = true;
  }
  return { totalPercent, overLimit };
}

function collect() {
  const dailyCap = normalizeDecimal(capInput.value);
  if (!dailyCap)
    throw new Error("Escribe un tope diario válido, por ejemplo 20.000");
  const rules = readRules().map((rule, index) => {
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
    if (rule.kind === "debt" && !rule.outstanding) {
      throw new Error(
        `${position}: escribe el saldo por pagar, por ejemplo 300.000`,
      );
    }
    const body = {
      label: rule.label,
      kind: rule.kind,
      destination: rule.destination,
      sharePercent: rule.sharePercent,
    };
    if (rule.kind === "debt") body.outstanding = rule.outstanding;
    return body;
  });
  return {
    name: nameInput.value.trim(),
    wallet: walletInput.value.trim(),
    dailyCap,
    rules,
  };
}

form.addEventListener("input", () => {
  render();
  showMessage(formError, "");
});

addButton.addEventListener("click", () => addRule({ kind: "savings" }));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(formError, "");
  if (!form.reportValidity()) return;
  if (render().overLimit) {
    showMessage(
      formError,
      `La suma de porcentajes no puede pasar de ${MAX_TOTAL_PERCENT}%.`,
    );
    return;
  }
  let body;
  try {
    body = collect();
  } catch (error) {
    showMessage(formError, error.message);
    return;
  }
  try {
    await withBusy(submitButton, "Conectando con tu wallet…", async () => {
      const { merchant, redirectUrl } = await postJson("/api/merchants", body);
      remember.set(STORAGE_KEYS.merchantId, merchant.id);
      remember.set(STORAGE_KEYS.merchantWallet, body.wallet);
      window.location.href = redirectUrl;
    });
  } catch (error) {
    showMessage(formError, error.message);
  }
});

walletInput.value = remember.get(STORAGE_KEYS.merchantWallet);
addRule({
  label: "Microcrédito",
  kind: "debt",
  sharePercent: 15,
  outstanding: "300000",
});
addRule({ label: "Fondo de emergencia", kind: "savings", sharePercent: 5 });
