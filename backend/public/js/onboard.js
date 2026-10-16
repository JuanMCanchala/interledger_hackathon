import {
  STORAGE_KEYS,
  checkWallet,
  el,
  formatMoney,
  normalizeDecimal,
  normalizeWallet,
  postJson,
  previewSplit,
  remember,
  showMessage,
  toMinor,
  walletName,
  withBusy,
} from "../app.js";

const MAX_TOTAL_PERCENT = 50;
/** The preview shows a 10,000 COP sale, like the demo. */
const PREVIEW_SALE = 10000n * 100n;
const OTHER = "__other__";

/**
 * What a shopkeeper wants their sales to pay for, in their own words. Each goal becomes one
 * split rule on the server; the demo wallets of the team are offered as ready-made choices.
 */
const GOALS = [
  {
    key: "credit",
    kind: "debt",
    icon: "💳",
    title: "Pagar mi crédito",
    whoQuestion: "¿A quién le debes?",
    owedQuestion: "¿Cuánto debes en total?",
    options: [{ label: "Microcrédito", wallet: "microcredito" }],
    on: true,
    percent: 15,
    maxPercent: 30,
    owed: "300.000",
  },
  {
    key: "supplier",
    kind: "debt",
    icon: "📦",
    title: "Pagarle a mi proveedor",
    whoQuestion: "¿A cuál proveedor?",
    owedQuestion: "¿Cuánto le debes?",
    options: [{ label: "Proveedor", wallet: "proveedor-billeticos" }],
    on: false,
    percent: 10,
    maxPercent: 30,
    owed: "200.000",
  },
  {
    key: "savings",
    kind: "savings",
    icon: "🐷",
    title: "Ahorrar para emergencias",
    whoQuestion: "¿Dónde guardas tu ahorro?",
    options: [{ label: "Fondo de emergencia", wallet: "ahorro-billeticos" }],
    on: true,
    percent: 5,
    maxPercent: 20,
  },
];

const CAP_CHOICES = [10000, 20000, 30000, 50000];
const DEFAULT_CAP = 30000;

const $ = (id) => document.getElementById(id);
const form = $("onboard-form");
const goalsBox = $("goals");
const peso = (minor) => formatMoney(Number(minor) / 100, "COP");

/** Formats what the person types as pesos with thousands separators: 300000 → "300.000". */
function moneyInput(input) {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").replace(/^0+/, "");
    input.value = digits ? Number(digits).toLocaleString("es-CO") : "";
  });
}

// Goals --------------------------------------------------------------------------------------------

function buildGoal(goal) {
  const toggle = el("input", { type: "checkbox", class: "goal-check" });
  toggle.checked = goal.on;

  const who = el(
    "select",
    { class: "goal-who" },
    ...goal.options.map((option) =>
      el("option", { value: option.wallet, text: option.label }),
    ),
    el("option", { value: OTHER, text: "Otra billetera…" }),
  );
  const otherInput = el("input", {
    class: "goal-other",
    maxlength: "300",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "off",
    placeholder: "Nombre de la billetera",
  });
  const otherField = el(
    "label",
    { class: "field", hidden: true },
    el("span", { text: "Nombre de la billetera" }),
    otherInput,
  );
  who.addEventListener("change", () => {
    otherField.hidden = who.value !== OTHER;
    if (!otherField.hidden) otherInput.focus();
  });

  let owedInput = null;
  const owedField =
    goal.kind === "debt"
      ? el(
          "label",
          { class: "field" },
          el("span", { text: goal.owedQuestion }),
          (owedInput = el("input", {
            class: "goal-owed",
            inputmode: "numeric",
            autocomplete: "off",
            placeholder: `Ej: ${goal.owed}`,
          })),
        )
      : null;
  if (owedInput) {
    owedInput.value = goal.owed;
    moneyInput(owedInput);
  }

  const slider = el("input", {
    type: "range",
    class: "goal-percent",
    min: "1",
    max: String(goal.maxPercent),
    step: "1",
    "aria-label": `${goal.title}: parte de cada venta`,
  });
  slider.value = String(goal.percent);
  const sliderText = el("output", { class: "goal-percent-text" });

  const body = el(
    "div",
    { class: "goal-body stack-sm" },
    el(
      "label",
      { class: "field" },
      el("span", { text: goal.whoQuestion }),
      who,
    ),
    otherField,
    owedField,
    el(
      "div",
      { class: "field" },
      el("span", { text: "¿Qué parte de cada venta?" }),
      slider,
      sliderText,
    ),
  );
  body.hidden = !goal.on;

  const card = el(
    "div",
    { class: `goal${goal.on ? " is-on" : ""}`, "data-key": goal.key },
    el(
      "label",
      { class: "goal-toggle" },
      toggle,
      el("span", {
        class: "goal-icon",
        "aria-hidden": "true",
        text: goal.icon,
      }),
      el("span", { class: "goal-title", text: goal.title }),
    ),
    body,
  );
  toggle.addEventListener("change", () => {
    body.hidden = !toggle.checked;
    card.classList.toggle("is-on", toggle.checked);
  });

  return {
    goal,
    card,
    read() {
      const percent = Number(slider.value);
      const wallet = who.value === OTHER ? otherInput.value.trim() : who.value;
      const label =
        who.value === OTHER
          ? goal.title
          : goal.options.find((o) => o.wallet === who.value).label;
      sliderText.textContent = `${percent}% · ${peso((PREVIEW_SALE * BigInt(percent)) / 100n)} de cada ${peso(PREVIEW_SALE)}`;
      return {
        on: toggle.checked,
        kind: goal.kind,
        label,
        wallet,
        percent,
        owed: owedInput ? normalizeDecimal(owedInput.value) : "",
        focusWallet: () => (who.value === OTHER ? otherInput : who).focus(),
        focusOwed: () => owedInput?.focus(),
      };
    },
  };
}

const goals = GOALS.map(buildGoal);
goalsBox.append(...goals.map((g) => g.card));

// Daily cap ----------------------------------------------------------------------------------------

const chips = $("cap-chips");
for (const value of [...CAP_CHOICES, OTHER]) {
  const radio = el("input", {
    type: "radio",
    name: "cap",
    value: String(value),
  });
  radio.checked = value === DEFAULT_CAP;
  chips.append(
    el(
      "label",
      { class: "chip" },
      radio,
      el("span", {
        text: value === OTHER ? "Otro" : formatMoney(value, "COP"),
      }),
    ),
  );
}
moneyInput($("cap-other"));
chips.addEventListener("change", () => {
  const other = form.elements.cap.value === OTHER;
  $("cap-other-field").hidden = !other;
  if (other) $("cap-other").focus();
});

function readCap() {
  const choice = form.elements.cap.value;
  return choice === OTHER ? normalizeDecimal($("cap-other").value) : choice;
}

// Wallet check -------------------------------------------------------------------------------------

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

// Preview ------------------------------------------------------------------------------------------

function render() {
  const chosen = goals.map((g) => g.read()).filter((g) => g.on);
  const preview = previewSplit(
    PREVIEW_SALE,
    chosen.map((g) => ({
      label: g.label,
      kind: g.kind,
      shareBps: g.percent * 100,
      outstandingMinor: g.owed ? toMinor(g.owed, 2) : undefined,
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
      el("span", { class: "split-label", text: "Te queda a ti" }),
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

  const total = chosen.reduce((sum, g) => sum + g.percent, 0);
  showMessage(
    $("preview-warning"),
    total > MAX_TOTAL_PERCENT
      ? `Entre todo suman ${total}% de cada venta. Baja alguno: lo máximo es ${MAX_TOTAL_PERCENT}%, para que siempre te quede la mayor parte.`
      : "",
  );
  return { chosen, total };
}

// Submit -------------------------------------------------------------------------------------------

function fail(message, focus) {
  showMessage($("form-error"), message);
  focus?.();
  return null;
}

async function collect() {
  const name = $("business-name").value.trim();
  if (!name)
    return fail("Escribe el nombre de tu negocio.", () =>
      $("business-name").focus(),
    );
  if (!walletInput.value.trim())
    return fail("Escribe el nombre de tu billetera.", () =>
      walletInput.focus(),
    );
  const wallet = checkedWallet || (await verifyWallet());
  if (!wallet)
    return fail("Revisa el nombre de tu billetera.", () => walletInput.focus());

  const { chosen, total } = render();
  if (chosen.length === 0)
    return fail("Elige al menos una cosa para pagar con tus ventas.");
  if (total > MAX_TOTAL_PERCENT)
    return fail(
      `Entre todo no puedes pasar del ${MAX_TOTAL_PERCENT}% de cada venta.`,
    );
  for (const goal of chosen) {
    if (!goal.wallet)
      return fail(
        `Escribe la billetera para "${goal.label}".`,
        goal.focusWallet,
      );
    if (goal.kind === "debt" && !goal.owed)
      return fail(`Escribe cuánto debes en "${goal.label}".`, goal.focusOwed);
  }
  const dailyCap = readCap();
  if (!dailyCap)
    return fail("Escribe tu límite diario, por ejemplo 30.000.", () =>
      $("cap-other").focus(),
    );

  return {
    name,
    wallet: wallet.wallet,
    dailyCap,
    rules: chosen.map((goal) => ({
      label: goal.label,
      kind: goal.kind,
      destination: normalizeWallet(goal.wallet),
      sharePercent: goal.percent,
      ...(goal.kind === "debt" ? { outstanding: goal.owed } : {}),
    })),
  };
}

form.addEventListener("input", () => {
  render();
  showMessage($("form-error"), "");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage($("form-error"), "");
  try {
    await withBusy($("submit"), "Abriendo tu billetera…", async () => {
      const body = await collect();
      if (!body) return;
      const { merchant, redirectUrl } = await postJson("/api/merchants", body);
      remember.set(STORAGE_KEYS.merchantId, merchant.id);
      remember.set(STORAGE_KEYS.merchantWallet, body.wallet);
      window.location.href = redirectUrl;
    });
  } catch (error) {
    showMessage($("form-error"), error.message);
  }
});

const savedWallet = remember.get(STORAGE_KEYS.merchantWallet);
if (savedWallet) {
  walletInput.value = walletName(savedWallet);
  verifyWallet();
}
render();
