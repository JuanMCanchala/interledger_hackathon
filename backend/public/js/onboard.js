import {
  STORAGE_KEYS,
  api,
  checkWallet,
  el,
  formatMoney,
  normalizeDecimal,
  normalizeWallet,
  postJson,
  previewSplit,
  remember,
  requireSession,
  showMessage,
  toMinor,
  walletName,
  withBusy,
} from "./app.js";

/**
 * Setting up the shop, in three steps: the shop itself, the wallets each sale pays (grouped in
 * categories the shopkeeper can extend), and the monthly limit approved in the wallet. Each wallet
 * becomes one split rule on the server; an obligation stops taking its share once its monthly quota
 * is paid, so the rest of the month's sales are profit.
 */

const MAX_TOTAL_PERCENT = 50;
const MAX_WALLETS = 10;
/** The preview shows a 10,000 COP sale, like the demo. */
const PREVIEW_SALE = 10000n * 100n;

/** The categories a shop starts with, prefilled with the team's demo wallets. */
const DEFAULT_CATEGORIES = [
  {
    name: "Proveedores",
    kind: "debt",
    icon: "📦",
    wallets: [
      {
        label: "Distribuidora",
        destination: "proveedor-billeticos",
        sharePercent: 10,
        monthlyQuota: "200.000",
        dueDay: 25,
      },
    ],
  },
  {
    name: "Microcréditos",
    kind: "debt",
    icon: "💳",
    wallets: [
      {
        label: "Microcrédito",
        destination: "microcredito",
        sharePercent: 15,
        monthlyQuota: "100.000",
        outstanding: "300.000",
        dueDay: 15,
      },
    ],
  },
  {
    name: "Ahorro",
    kind: "savings",
    icon: "🐷",
    wallets: [
      {
        label: "Fondo de emergencia",
        destination: "ahorro-billeticos",
        sharePercent: 5,
      },
    ],
  },
];

const KIND_TEXT = {
  debt: "Obligación con cuota mensual",
  savings: "Ahorro · siempre toma su parte",
};

const $ = (id) => document.getElementById(id);
const form = $("onboard-form");
const peso = (minor) => formatMoney(Number(minor) / 100, "COP");
const pesos = (decimal) => (decimal ? peso(toMinor(decimal, 2)) : "—");

/** Formats what the person types as pesos with thousands separators: 300000 → "300.000". */
function moneyInput(input) {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").replace(/^0+/, "");
    input.value = digits ? Number(digits).toLocaleString("es-CO") : "";
  });
}

// Step 2: categories and their wallets ------------------------------------------------------------

const categoriesBox = $("categories");
const walletTemplate = $("wallet-template");
const field = (row, name) => row.querySelector(`[data-field="${name}"]`);
const walletRows = () => [...categoriesBox.querySelectorAll(".wallet-row")];

function addWallet(category, values = {}) {
  if (walletRows().length >= MAX_WALLETS) return;
  const row = walletTemplate.content.firstElementChild.cloneNode(true);
  field(row, "label").value = values.label ?? "";
  field(row, "destination").value = values.destination ?? "";
  field(row, "sharePercent").value = values.sharePercent ?? "";
  field(row, "monthlyQuota").value = values.monthlyQuota ?? "";
  field(row, "outstanding").value = values.outstanding ?? "";
  field(row, "dueDay").value = values.dueDay ?? (category.dataset.kind === "debt" ? 28 : "");
  moneyInput(field(row, "monthlyQuota"));
  moneyInput(field(row, "outstanding"));
  for (const debtField of row.querySelectorAll(".debt-only")) {
    debtField.hidden = category.dataset.kind !== "debt";
  }
  row.querySelector(".remove-wallet").addEventListener("click", () => {
    row.remove();
    render();
  });
  category.querySelector(".category-wallets").append(row);
  render();
  return row;
}

function addCategory({ name, kind, icon, wallets = [] }) {
  const list = el("div", { class: "category-wallets stack-sm" });
  const addButton = el("button", {
    type: "button",
    class: "btn btn-secondary add-wallet",
    text: "+ Agregar billetera",
  });
  const removeButton = el("button", {
    type: "button",
    class: "btn btn-ghost",
    text: "Quitar categoría",
  });
  const card = el(
    "section",
    { class: "category stack-sm", "data-kind": kind, "data-name": name },
    el(
      "div",
      { class: "row between" },
      el(
        "div",
        { class: "category-head" },
        el("span", {
          class: "goal-icon",
          "aria-hidden": "true",
          text: icon || (kind === "debt" ? "🧾" : "🌱"),
        }),
        el(
          "div",
          {},
          el("h3", { text: name }),
          el("p", { class: "muted small", text: KIND_TEXT[kind] }),
        ),
      ),
      removeButton,
    ),
    list,
    addButton,
  );
  addButton.addEventListener("click", () => {
    addWallet(card)?.querySelector('[data-field="label"]').focus();
  });
  removeButton.addEventListener("click", () => {
    card.remove();
    render();
  });
  categoriesBox.append(card);
  for (const wallet of wallets) addWallet(card, wallet);
  render();
  return card;
}

$("add-category").addEventListener("click", () => {
  const name = $("new-category-name").value.trim();
  if (!name) {
    $("new-category-name").focus();
    return;
  }
  const exists = [...categoriesBox.querySelectorAll(".category")].some(
    (card) => card.dataset.name.toLowerCase() === name.toLowerCase(),
  );
  if (exists) {
    showMessage($("form-error"), `Ya tienes la categoría "${name}".`);
    return;
  }
  const card = addCategory({ name, kind: $("new-category-kind").value });
  $("new-category-name").value = "";
  addWallet(card)?.querySelector('[data-field="label"]').focus();
});

/** Every wallet row as the rule it becomes, with what is needed to point at a mistake. */
function readWallets() {
  return walletRows().map((row) => {
    const category = row.closest(".category");
    const percent = field(row, "sharePercent").valueAsNumber;
    return {
      row,
      category: category.dataset.name,
      kind: category.dataset.kind,
      label: field(row, "label").value.trim(),
      destination: field(row, "destination").value.trim(),
      sharePercent: Number.isFinite(percent)
        ? Math.round(percent * 100) / 100
        : NaN,
      monthlyQuota: normalizeDecimal(field(row, "monthlyQuota").value),
      outstanding: normalizeDecimal(field(row, "outstanding").value),
      dueDay: field(row, "dueDay").valueAsNumber,
    };
  });
}

// Step 3: monthly limit and summary ---------------------------------------------------------------

const capInput = $("monthly-cap");
moneyInput(capInput);
let capTouched = false;
capInput.addEventListener("input", () => {
  capTouched = true;
});

function quotaTotal(wallets) {
  return wallets
    .filter((w) => w.kind === "debt" && w.monthlyQuota)
    .reduce((sum, w) => sum + toMinor(w.monthlyQuota, 2), 0n);
}

/** Room for every quota plus about half again for savings, rounded up to 10,000 COP. */
function suggestedCap(quotasMinor) {
  const step = 10000n * 100n;
  const wanted = quotasMinor + quotasMinor / 2n;
  const rounded = ((wanted + step - 1n) / step) * step;
  return rounded > 0n ? rounded : 100000n * 100n;
}

function renderSummary() {
  const wallets = readWallets().filter(
    (w) => Number.isFinite(w.sharePercent) && w.sharePercent > 0,
  );
  const quotas = quotaTotal(wallets);
  if (!capTouched) {
    capInput.value = (Number(suggestedCap(quotas)) / 100).toLocaleString(
      "es-CO",
    );
  }
  $("cap-hint").textContent = quotas
    ? `Tus cuotas del mes suman ${peso(quotas)}: el límite debe ser al menos eso. Lo que sobre deja espacio para tu ahorro.`
    : "Lo que sobre de tus cuotas deja espacio para tu ahorro.";

  const preview = previewSplit(
    PREVIEW_SALE,
    wallets.map((w) => ({
      label: w.label || w.category,
      kind: w.kind,
      shareBps: Math.round(w.sharePercent * 100),
      outstandingMinor: w.outstanding ? toMinor(w.outstanding, 2) : undefined,
    })),
  );
  $("summary-title").textContent =
    `Así queda cada venta de ${peso(PREVIEW_SALE)}`;
  const width = (minor) => `${(Number(minor) * 100) / Number(PREVIEW_SALE)}%`;
  $("preview-bar").replaceChildren(
    el("span", { class: "seg-kept", style: `width: ${width(preview.kept)}` }),
    ...preview.items.map((item) =>
      el("span", {
        class: item.kind === "debt" ? "seg-debt" : "seg-savings",
        style: `width: ${width(item.amount)}`,
      }),
    ),
  );
  $("preview-list").replaceChildren(
    el(
      "li",
      { class: "split-item is-kept" },
      el("span", { class: "split-label", text: "Ganancia para ti" }),
      el("span", { class: "split-amount", text: peso(preview.kept) }),
    ),
    ...preview.items.map((item) =>
      el(
        "li",
        { class: "split-item" },
        el("span", { class: "split-label", text: item.label }),
        el("span", { class: "split-amount", text: peso(item.amount) }),
      ),
    ),
  );

  $("quota-list").replaceChildren(
    ...wallets.map((w) =>
      el(
        "li",
        { class: "row between small" },
        el(
          "span",
          {},
          el("strong", { text: w.label || w.category }),
          el("span", { class: "muted", text: ` · ${w.category}` }),
        ),
        el("span", {
          class: "num",
          text:
            w.kind === "debt"
              ? `${w.sharePercent}% hasta ${pesos(w.monthlyQuota)} al mes, se paga el día ${w.dueDay}`
              : `${w.sharePercent}% de cada venta`,
        }),
      ),
    ),
  );
}

function render() {
  const wallets = readWallets();
  const total = wallets.reduce(
    (sum, w) => sum + (Number.isFinite(w.sharePercent) ? w.sharePercent : 0),
    0,
  );
  const full = wallets.length >= MAX_WALLETS;
  for (const button of categoriesBox.querySelectorAll(".add-wallet")) {
    button.disabled = full;
  }
  const totalText = $("share-total");
  totalText.className = `small${total > MAX_TOTAL_PERCENT ? " error-text" : ""}`;
  totalText.textContent =
    `Entre todas toman ${total.toLocaleString("es-CO")}% de cada venta (máximo ${MAX_TOTAL_PERCENT}%).` +
    (full ? ` Llegaste al máximo de ${MAX_WALLETS} billeteras.` : "");
  renderSummary();
}

// Step 1: the shop's wallet -----------------------------------------------------------------------

const walletInput = $("business-wallet");
let checkedWallet = null;

async function verifyWallet() {
  const value = walletInput.value.trim();
  const check = $("wallet-check");
  checkedWallet = null;
  if (!value) {
    check.textContent = "";
    return null;
  }
  check.className = "check";
  check.textContent = "Buscando tu billetera…";
  try {
    const info = await checkWallet(value);
    check.className = "check check-ok";
    check.textContent = `✓ Encontramos tu billetera ${info.name} (${info.currency})`;
    checkedWallet = info;
    $("wallet-tip").replaceChildren(
      "Ahora te llevamos a tu billetera. Entra con la cuenta dueña de ",
      el("strong", { text: info.name }),
      " y toca ",
      el("strong", { text: "Aceptar" }),
      ". Después vuelves aquí solo.",
    );
    return info;
  } catch (error) {
    check.className = "check check-bad";
    check.textContent = error.message;
    return null;
  }
}
walletInput.addEventListener("change", verifyWallet);

// Validation per step -----------------------------------------------------------------------------

/** Shows the problem and returns false, so `return fail(...)` reads as "this step is not ready". */
function fail(message, focus) {
  showMessage($("form-error"), message);
  focus?.focus();
  return false;
}

async function checkShop() {
  if (!$("business-name").value.trim())
    return fail("Escribe el nombre de tu negocio.", $("business-name"));
  if (!walletInput.value.trim())
    return fail("Escribe el nombre de tu billetera.", walletInput);
  if (!(checkedWallet || (await verifyWallet())))
    return fail("Revisa el nombre de tu billetera.", walletInput);
  return true;
}

function checkWallets() {
  const wallets = readWallets();
  if (wallets.length === 0)
    return fail("Agrega al menos una billetera para pagar con tus ventas.");
  for (const w of wallets) {
    const where = `${w.category}${w.label ? ` · ${w.label}` : ""}`;
    if (!w.label)
      return fail(
        `Ponle un nombre a la billetera de ${w.category}.`,
        field(w.row, "label"),
      );
    if (!w.destination)
      return fail(
        `Escribe la billetera de "${where}".`,
        field(w.row, "destination"),
      );
    if (
      !Number.isFinite(w.sharePercent) ||
      w.sharePercent < 0.01 ||
      w.sharePercent > MAX_TOTAL_PERCENT
    )
      return fail(
        `En "${where}" el porcentaje debe estar entre 0,01 y ${MAX_TOTAL_PERCENT}.`,
        field(w.row, "sharePercent"),
      );
    if (w.kind === "debt" && !w.monthlyQuota)
      return fail(
        `Escribe cuánto pagas al mes a "${where}", por ejemplo 200.000.`,
        field(w.row, "monthlyQuota"),
      );
    if (
      w.kind === "debt" &&
      (!Number.isInteger(w.dueDay) || w.dueDay < 1 || w.dueDay > 28)
    )
      return fail(
        `Escribe el día del mes en que le pagas a "${where}" (del 1 al 28).`,
        field(w.row, "dueDay"),
      );
  }
  const total = wallets.reduce((sum, w) => sum + w.sharePercent, 0);
  if (total > MAX_TOTAL_PERCENT)
    return fail(
      `Entre todas suman ${total.toLocaleString("es-CO")}% de cada venta. Baja alguna: lo máximo es ${MAX_TOTAL_PERCENT}%, para que siempre te quede la mayor parte.`,
    );
  return true;
}

function checkCap() {
  const cap = normalizeDecimal(capInput.value);
  if (!cap)
    return fail("Escribe tu límite mensual, por ejemplo 500.000.", capInput);
  const quotas = quotaTotal(readWallets());
  if (toMinor(cap, 2) < quotas)
    return fail(
      `Tus cuotas del mes suman ${peso(quotas)}: el límite mensual debe ser al menos eso.`,
      capInput,
    );
  return true;
}

// Stepper -----------------------------------------------------------------------------------------

const STEPS = [checkShop, checkWallets, checkCap];
const LAST = STEPS.length - 1;
let step = 0;
/** The furthest step reached: the stepper lets the shopkeeper jump back to any step up to it. */
let reached = 0;

function showStep(index) {
  step = index;
  reached = Math.max(reached, index);
  for (const panel of form.querySelectorAll(".wizard-panel")) {
    panel.hidden = Number(panel.dataset.panel) !== index;
  }
  for (const item of $("wizard").querySelectorAll("li")) {
    const at = Number(item.dataset.step);
    item.className = at === index ? "is-current" : at < index ? "is-done" : "";
    item.querySelector("button").disabled = at > reached;
    if (at === index) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }
  $("back").hidden = index === 0;
  $("next").textContent =
    index === LAST ? "Autorizar en mi billetera →" : "Siguiente →";
  $("wallet-tip").hidden = index !== LAST;
  showMessage($("form-error"), "");
  if (index === LAST) renderSummary();
  form.querySelector(`[data-panel="${index}"]`).scrollIntoView({
    block: "nearest",
  });
}

$("wizard").addEventListener("click", async (event) => {
  const item = event.target.closest("li[data-step]");
  if (!item) return;
  const target = Number(item.dataset.step);
  if (target === step || target > reached) return;
  // Going forward through the stepper still checks the steps in between.
  for (let at = step; at < target; at += 1) {
    if (!(await STEPS[at]())) return;
  }
  showStep(target);
});

$("back").addEventListener("click", () => showStep(Math.max(0, step - 1)));

form.addEventListener("input", () => {
  render();
  showMessage($("form-error"), "");
});

function collect() {
  return {
    name: $("business-name").value.trim(),
    wallet: checkedWallet.wallet,
    monthlyCap: normalizeDecimal(capInput.value),
    rules: readWallets().map((w) => ({
      label: w.label,
      category: w.category,
      kind: w.kind,
      destination: normalizeWallet(w.destination),
      sharePercent: w.sharePercent,
      ...(w.kind === "debt"
        ? { monthlyQuota: w.monthlyQuota, dueDay: w.dueDay }
        : {}),
      ...(w.kind === "debt" && w.outstanding
        ? { outstanding: w.outstanding }
        : {}),
    })),
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage($("form-error"), "");
  if (!(await STEPS[step]())) return;
  if (step < LAST) {
    showStep(step + 1);
    return;
  }
  // Every step is checked again: the shopkeeper may have edited an earlier one through the stepper.
  for (const check of STEPS) if (!(await check())) return;
  try {
    await withBusy($("next"), "Abriendo tu billetera…", async () => {
      const body = collect();
      const { redirectUrl } = await postJson("/api/merchants", body);
      remember.set(STORAGE_KEYS.merchantWallet, body.wallet);
      window.location.href = redirectUrl;
    });
  } catch (error) {
    showMessage($("form-error"), error.message);
  }
});

// Start -------------------------------------------------------------------------------------------

async function start() {
  // A shop is set up once per account: if it already has one, its till is the place to change it.
  const { merchant } = await api("/api/auth/me");
  if (merchant) {
    window.location.replace(
      `/merchant?id=${encodeURIComponent(merchant.id)}`,
    );
    return;
  }
  for (const category of DEFAULT_CATEGORIES) addCategory(category);
  const savedWallet = remember.get(STORAGE_KEYS.merchantWallet);
  if (savedWallet) {
    walletInput.value = walletName(savedWallet);
    verifyWallet();
  }
  showStep(0);
}

if (requireSession()) {
  start().catch((error) => showMessage($("form-error"), error.message));
}
