import {
  MERCHANT_STATUS,
  RULE_KIND,
  SALE_STATUS,
  api,
  badge,
  copyText,
  drawQr,
  el,
  formatAmount,
  formatDay,
  formatMoney,
  formatTime,
  homeOfSignedIn,
  logout,
  normalizeDecimal,
  param,
  poll,
  postJson,
  renderSplit,
  renderSteps,
  requireSession,
  showMessage,
  statusBadge,
  toNumber,
  walletName,
  withBusy,
} from "./app.js";
import { barChart, ring } from "./charts.js";
import { createRulesEditor } from "./rules-editor.js";

/**
 * The shopkeeper's panel: today and this month at a glance, selling with a QR (on this screen or
 * handed to the shopkeeper's phone), goals with projections, the splits and every setting. It is
 * one page with a section per tab, built for a phone first.
 */

const TABS = ["inicio", "vender", "metas", "repartos", "ajustes"];

/** How the merchant sees a sale progress (the customer sees the four Open Payments steps). */
const SALE_STAGES = [
  "Esperando al cliente",
  "Cliente autorizando",
  "Pago en camino",
  "¡Pagado!",
];
const STAGE_INDEX = {
  open: 0,
  "awaiting-consent": 1,
  processing: 2,
  paid: SALE_STAGES.length,
};
const RESUME_WINDOW_MS = 30 * 60 * 1000;
const QUICK_AMOUNTS = [5000, 10000, 20000, 50000];
/** On a phone the QR for the customer is on this very screen; on a computer it goes to the phone. */
const ON_PHONE = window.matchMedia("(max-width: 700px)").matches;

const $ = (id) => document.getElementById(id);
const merchantId = param("id");
const merchantPath = `/api/merchants/${encodeURIComponent(merchantId)}`;

let merchant = null;
let lastStatus = null;
let current = null; // { sale, payUrl }
let stopSalePoll = null;
let resumed = false;
let settingsFilled = false;
let drawn = { here: null, phone: null };
let showOn = ON_PHONE ? "here" : "phone";

// Money -------------------------------------------------------------------------------------------

const asset = () => merchant?.asset ?? { assetCode: "COP", assetScale: 2 };
const money = (value) => formatMoney(value, asset().assetCode, asset().assetScale);
const amountOf = (amount) => (amount ? toNumber(amount) : 0);

/** Minor units → the plain decimal the inputs use ("29850000", scale 2 → "298500"). */
function toDecimal(amount) {
  if (!amount) return "";
  const scale = amount.assetScale;
  const digits = amount.value.padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Formats what the person types as pesos with thousands separators: 300000 → "300.000". */
function moneyInput(input) {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").replace(/^0+/, "");
    input.value = digits ? Number(digits).toLocaleString("es-CO") : "";
  });
}

const groupThousands = (decimal) =>
  decimal ? Number(decimal).toLocaleString("es-CO") : "";

/** Renders a section only when its data changed, so polling does not reset the page. */
function changed(container, data) {
  const signature = JSON.stringify(data);
  if (container.dataset.signature === signature) return false;
  container.dataset.signature = signature;
  return true;
}

// Tabs --------------------------------------------------------------------------------------------

function currentTab() {
  const tab = window.location.hash.replace(/^#/, "");
  return TABS.includes(tab) ? tab : "inicio";
}

function showTab() {
  const tab = currentTab();
  for (const view of document.querySelectorAll("[data-view]")) {
    view.hidden = view.dataset.view !== tab;
  }
  for (const link of $("panel-nav").querySelectorAll("[data-tab]")) {
    const active = link.dataset.tab === tab;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (tab === "vender" && !current) $("sale-amount").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener("hashchange", showTab);

// Loading -----------------------------------------------------------------------------------------

async function loadMerchant() {
  try {
    merchant = await api(merchantPath);
  } catch (error) {
    if (error.status === 404) {
      showMissing(
        "Esta caja no existe o es de otra cuenta. Entra con la cuenta que la registró.",
      );
      return false;
    }
    showMessage($("load-error"), `No pudimos actualizar tu caja: ${error.message}`);
    return true;
  }
  showMessage($("load-error"), "");
  render(merchant);
  resumeLatestSale(merchant);
  return true;
}

function showMissing(text) {
  $("missing-text").textContent = text;
  $("missing").hidden = false;
  $("app").hidden = true;
}

function render(m) {
  $("app").hidden = false;
  $("missing").hidden = true;
  document.title = `${m.name} · MiPlante`;
  $("merchant-name").textContent = m.name;
  $("merchant-wallet").textContent = walletName(m.wallet);
  $("merchant-status").replaceChildren(statusBadge(MERCHANT_STATUS, m.status));
  if (m.status !== lastStatus) renderStatusBanner(m.status, m.wallet);
  lastStatus = m.status;
  syncSaleForm();

  renderHome(m);
  if (changed($("goals"), [m.rules, m.month, m.monthlySalesGoal])) renderGoals(m);
  if (changed($("rules"), m.rules)) renderRules(m.rules);
  renderSettings(m);
}

// Inicio ------------------------------------------------------------------------------------------

function renderHome(m) {
  $("today-date").textContent = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("today-gross").textContent = formatAmount(m.today.gross);
  $("today-count-text").textContent =
    m.today.salesCount === 1 ? "en 1 venta" : `en ${m.today.salesCount} ventas`;
  $("today-kept").textContent = formatAmount(m.today.kept);
  $("today-allocated").textContent = formatAmount(m.today.allocated);
  $("month-gross").textContent = formatAmount(m.month.gross);
  $("month-kept").textContent = formatAmount(m.month.kept);

  renderMonthChart(m);
  if (changed($("month-split"), [m.month, m.rules])) renderMonthSplit(m);

  $("monthly-cap").textContent = `Límite: ${formatAmount(m.monthlyCap)}`;
  const spent = amountOf(m.spentThisMonth);
  $("spent-month").textContent = m.spentThisMonth ? formatAmount(m.spentThisMonth) : "—";
  const cap = amountOf(m.monthlyCap);
  $("cap-bar").style.width = `${cap > 0 ? Math.min(100, (spent / cap) * 100) : 0}%`;

  if (changed($("sales"), m.sales)) renderSales(m.sales);
}

function renderMonthChart(m) {
  const { month } = m;
  const goal = m.monthlySalesGoal ? amountOf(m.monthlySalesGoal) : 0;
  $("chart-caption").textContent =
    `Llevas ${formatAmount(month.gross)} en ${month.salesCount} ${month.salesCount === 1 ? "venta" : "ventas"} · día ${month.dayOfMonth} de ${month.daysInMonth}`;
  $("chart-goal-legend").hidden = !goal;
  barChart($("month-chart"), {
    bars: month.days.map((day, index) => ({
      label: String(index + 1),
      value: amountOf(day.gross),
      title: `${formatDay(day.date)}: ${formatAmount(day.gross)} en ${day.salesCount} ventas`,
      highlight: index === month.days.length - 1,
    })),
    goal: goal ? goal / month.daysInMonth : undefined,
    goalLabel: goal ? `Para tu meta: ${money(goal / month.daysInMonth)} por día` : "",
    summary: `Ventas de este mes por día: ${formatAmount(month.gross)} en ${month.salesCount} ventas`,
  });
}

/** This month's money: what the shop kept and what each category received. */
function renderMonthSplit(m) {
  const gross = amountOf(m.month.gross);
  const kept = amountOf(m.month.kept);
  const categories = new Map();
  for (const rule of m.rules) {
    const name = rule.category || RULE_KIND[rule.kind];
    const entry = categories.get(name) ?? { kind: rule.kind, amount: 0 };
    entry.amount += amountOf(rule.paidThisMonth);
    categories.set(name, entry);
  }
  const width = (value) => `${gross > 0 ? (value * 100) / gross : 0}%`;
  $("month-bar").replaceChildren(
    el("span", { class: "seg-kept", style: `width: ${gross > 0 ? width(kept) : "100%"}` }),
    ...[...categories.values()].map((entry) =>
      el("span", {
        class: entry.kind === "debt" ? "seg-debt" : "seg-savings",
        style: `width: ${width(entry.amount)}`,
      }),
    ),
  );
  $("month-split").replaceChildren(
    el(
      "li",
      { class: "split-item is-kept" },
      el("span", { class: "split-label", text: "Ganancia para ti" }),
      el("span", { class: "split-amount", text: formatAmount(m.month.kept) }),
    ),
    ...[...categories].map(([name, entry]) =>
      el(
        "li",
        { class: "split-item" },
        el("span", { class: "split-label", text: name }),
        el("span", { class: "split-amount", text: money(entry.amount) }),
      ),
    ),
  );
}

function renderSales(sales) {
  $("no-sales").hidden = sales.length > 0;
  $("sales").replaceChildren(
    ...sales.slice(0, 8).map((sale) =>
      el(
        "li",
        {},
        el(
          "button",
          {
            type: "button",
            class: "list-button",
            onclick: () => {
              window.location.hash = "vender";
              showSale(sale);
            },
          },
          el(
            "span",
            {},
            el("strong", { class: "num", text: formatAmount(sale.amount) }),
            el("span", {
              class: "meta",
              text: ` · ${formatTime(sale.createdAt)}${sale.description ? ` · ${sale.description}` : ""}`,
            }),
          ),
          statusBadge(SALE_STATUS, sale.status),
        ),
      ),
    ),
  );
}

// Metas -------------------------------------------------------------------------------------------

const MONTH_NAME = () =>
  new Date().toLocaleDateString("es-CO", { month: "long" });

/**
 * When a goal is reached at this month's pace. Monthly goals (sales, quotas) must make it before
 * the month ends; a savings goal can take longer, so it gets a date.
 */
function projection({ done, target, dayOfMonth, daysInMonth, monthly }) {
  if (target <= 0) return "";
  if (done >= target) return "¡Meta cumplida!";
  const perDay = done / dayOfMonth;
  const left = target - done;
  if (monthly) {
    const remainingDays = daysInMonth - dayOfMonth;
    if (perDay > 0) {
      const finishDay = dayOfMonth + Math.ceil(left / perDay);
      if (finishDay <= daysInMonth) {
        return `A este ritmo la completas el ${finishDay} de ${MONTH_NAME()}.`;
      }
    }
    return remainingDays > 0
      ? `Para lograrla este mes necesitas ${money(left / remainingDays)} por día.`
      : `Faltan ${money(left)} y hoy termina el mes.`;
  }
  if (perDay <= 0) return "Aún no hay ahorro este mes para proyectar la fecha.";
  const date = new Date(Date.now() + Math.ceil(left / perDay) * 86_400_000);
  return `A este ritmo la alcanzas hacia el ${date.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.`;
}

function goalCard({ eyebrow, title, done, target, tone, detail, note, action }) {
  const ringBox = el("div", { class: "goal-ring" });
  ring(ringBox, {
    ratio: target > 0 ? done / target : 0,
    tone,
    label: `${title}: ${target > 0 ? Math.round((done / target) * 100) : 0}%`,
  });
  return el(
    "article",
    { class: "card goal-card" },
    ringBox,
    el(
      "div",
      { class: "stack-sm goal-card-body" },
      el("p", { class: "eyebrow", text: eyebrow }),
      el("h2", { text: title }),
      el("p", { class: "num", text: detail }),
      note ? el("p", { class: "small muted", text: note }) : null,
      action,
    ),
  );
}

function renderGoals(m) {
  const { dayOfMonth, daysInMonth } = m.month;
  const cards = [];

  const salesGoal = amountOf(m.monthlySalesGoal);
  const sold = amountOf(m.month.gross);
  cards.push(
    salesGoal
      ? goalCard({
          eyebrow: "Ventas del mes",
          title: "Meta de ventas",
          done: sold,
          target: salesGoal,
          tone: "brand",
          detail: `${formatAmount(m.month.gross)} de ${formatAmount(m.monthlySalesGoal)}`,
          note: projection({ done: sold, target: salesGoal, dayOfMonth, daysInMonth, monthly: true }),
        })
      : goalCard({
          eyebrow: "Ventas del mes",
          title: "Meta de ventas",
          done: 0,
          target: 0,
          tone: "brand",
          detail: `Este mes llevas ${formatAmount(m.month.gross)}.`,
          note: "Ponte una meta y te decimos si vas a buen ritmo.",
          action: el("a", { class: "btn btn-secondary", href: "#ajustes", text: "Definir meta" }),
        }),
  );

  for (const rule of m.rules.filter((r) => r.kind === "debt")) {
    const paid = amountOf(rule.paidThisMonth);
    const quota = amountOf(rule.monthlyQuota);
    cards.push(
      goalCard({
        eyebrow: rule.category || "Obligación",
        title: rule.label,
        done: paid,
        target: quota,
        tone: "gold",
        detail: `Cuota del mes: ${formatAmount(rule.paidThisMonth)} de ${formatAmount(rule.monthlyQuota)}`,
        note:
          paid >= quota && quota > 0
            ? "Cuota completa: el resto del mes es ganancia."
            : projection({ done: paid, target: quota, dayOfMonth, daysInMonth, monthly: true }),
      }),
    );
  }

  for (const rule of m.rules.filter((r) => r.kind === "savings")) {
    const saved = amountOf(rule.repaid);
    const goal = amountOf(rule.savingsGoal);
    const thisMonth = amountOf(rule.paidThisMonth);
    cards.push(
      goal
        ? goalCard({
            eyebrow: rule.category || "Ahorro",
            title: rule.label,
            done: saved,
            target: goal,
            tone: "info",
            detail: `Ahorrado ${formatAmount(rule.repaid)} de ${formatAmount(rule.savingsGoal)}`,
            note:
              saved >= goal
                ? "¡Meta de ahorro cumplida!"
                : projection({
                    done: thisMonth,
                    target: thisMonth + (goal - saved),
                    dayOfMonth,
                    daysInMonth,
                    monthly: false,
                  }),
          })
        : goalCard({
            eyebrow: rule.category || "Ahorro",
            title: rule.label,
            done: 0,
            target: 0,
            tone: "info",
            detail: `Ahorrado: ${formatAmount(rule.repaid)}`,
            note: "Ponle una meta a este ahorro para ver cuándo la alcanzas.",
            action: el("button", {
              type: "button",
              class: "btn btn-secondary",
              text: "Ponerle meta",
              onclick: () => {
                window.location.hash = "repartos";
                openRulesEditor();
              },
            }),
          }),
    );
  }

  $("metas-caption").textContent =
    `Día ${dayOfMonth} de ${daysInMonth} de ${MONTH_NAME()}.`;
  $("goals").replaceChildren(...cards);
}

// Repartos ----------------------------------------------------------------------------------------

/** One rule: its share, this month's quota (obligations) or goal (savings) and what it received. */
function renderRule(rule) {
  const percent = (rule.shareBps / 100).toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  });
  const parts = [
    el(
      "div",
      { class: "row between" },
      el("strong", { text: rule.label }),
      badge(RULE_KIND[rule.kind] || rule.kind, rule.kind === "debt" ? "wait" : "info"),
    ),
    el("p", { class: "muted small", text: `${percent}% de cada venta` }),
    el("p", { class: "mono muted", text: walletName(rule.destination) }),
  ];
  if (rule.kind === "debt") {
    const paid = amountOf(rule.paidThisMonth);
    const quota = amountOf(rule.monthlyQuota);
    parts.push(
      el(
        "div",
        { class: "progress is-gold" },
        el("span", { style: `width: ${quota > 0 ? Math.min(100, (paid / quota) * 100) : 0}%` }),
      ),
      quota > 0 && paid >= quota
        ? badge("Cuota del mes completa: el resto es ganancia", "ok")
        : el("p", {
            class: "small",
            text: `Este mes: pagado ${formatAmount(rule.paidThisMonth)} de ${formatAmount(rule.monthlyQuota)}`,
          }),
    );
    if (rule.outstanding) {
      parts.push(
        amountOf(rule.outstanding) <= 0
          ? badge("¡Deuda pagada!", "ok")
          : el("p", {
              class: "muted small",
              text: `Deuda total: faltan ${formatAmount(rule.outstanding)} (pagado ${formatAmount(rule.repaid)})`,
            }),
      );
    }
  } else {
    const goal = amountOf(rule.savingsGoal);
    if (goal) {
      parts.push(
        el(
          "div",
          { class: "progress" },
          el("span", { style: `width: ${Math.min(100, (amountOf(rule.repaid) / goal) * 100)}%` }),
        ),
      );
    }
    parts.push(
      el("p", {
        class: "small",
        text: `Este mes: ${formatAmount(rule.paidThisMonth)} · ahorrado en total: ${formatAmount(rule.repaid)}${goal ? ` de ${formatAmount(rule.savingsGoal)}` : ""}`,
      }),
    );
  }
  return el("li", { class: "list-item" }, ...parts);
}

/** Rules grouped by the category the shopkeeper gave them, in the order they were set up. */
function renderRules(rules) {
  const groups = new Map();
  for (const rule of rules) {
    const name = rule.category || RULE_KIND[rule.kind] || rule.kind;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(rule);
  }
  $("rules").replaceChildren(
    ...[...groups].map(([name, members]) =>
      el(
        "li",
        { class: "stack-sm" },
        el("h3", { class: "eyebrow", text: name }),
        el("ul", { class: "list" }, ...members.map(renderRule)),
      ),
    ),
  );
}

let editor = null;

function openRulesEditor() {
  if (!merchant) return;
  editor = createRulesEditor({
    box: $("rules-editor"),
    template: $("rule-template"),
    addButton: $("add-rule"),
    preview: {
      sentence: $("preview-sentence"),
      bar: $("preview-bar"),
      list: $("preview-list"),
      warning: $("preview-warning"),
      cap: $("preview-cap"),
    },
    asset: merchant.asset,
    capMinor: () => BigInt(merchant.monthlyCap.value),
  });
  editor.clear();
  for (const rule of merchant.rules) {
    editor.add({
      id: rule.id,
      label: rule.label,
      category: rule.category,
      kind: rule.kind,
      sharePercent: rule.shareBps / 100,
      monthlyQuota: toDecimal(rule.monthlyQuota),
      outstanding: toDecimal(rule.outstanding),
      savingsGoal: toDecimal(rule.savingsGoal),
      destination: walletName(rule.destination),
    });
  }
  showMessage($("rules-error"), "");
  showMessage($("rules-saved"), "");
  setEditing(true);
}

function setEditing(editing) {
  $("rules-form").hidden = !editing;
  $("rules").hidden = editing;
  $("edit-rules").hidden = editing;
}

$("edit-rules").addEventListener("click", openRulesEditor);
$("cancel-rules").addEventListener("click", () => setEditing(false));
$("add-rule").addEventListener("click", () =>
  editor?.add({ label: "Proveedor", category: "Proveedores", kind: "debt" }),
);
$("rules-form").addEventListener("input", () => {
  editor?.render();
  showMessage($("rules-error"), "");
});

$("rules-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editor) return;
  showMessage($("rules-error"), "");
  if (!$("rules-form").reportValidity()) return;
  let rules;
  try {
    rules = editor.collect();
  } catch (error) {
    showMessage($("rules-error"), error.message);
    return;
  }
  try {
    await withBusy($("save-rules"), "Guardando…", async () => {
      await api(`${merchantPath}/rules`, {
        method: "PUT",
        body: JSON.stringify({ rules }),
      });
      setEditing(false);
      showMessage($("rules-saved"), "Listo: tus próximas ventas se reparten así.", "ok");
      await loadMerchant();
    });
  } catch (error) {
    showMessage($("rules-error"), error.message);
  }
});

// Ajustes -----------------------------------------------------------------------------------------

moneyInput($("sales-goal"));
moneyInput($("cap-new"));

function renderSettings(m) {
  $("shop-wallet").textContent = walletName(m.wallet);
  const quotas = m.rules
    .filter((rule) => rule.kind === "debt")
    .reduce((sum, rule) => sum + amountOf(rule.monthlyQuota), 0);
  $("cap-current").textContent = formatAmount(m.monthlyCap);
  $("cap-quotas").textContent = quotas ? `· tus cuotas suman ${money(quotas)}` : "";
  showMessage(
    $("cap-pending"),
    m.pendingCap
      ? `Pediste cambiarlo a ${formatAmount(m.pendingCap)}: falta que lo apruebes en tu billetera. Mientras tanto sigue el límite actual.`
      : "",
    "wait",
  );
  // Fill the inputs once (and after each save), never while the shopkeeper is typing.
  if (!settingsFilled) {
    settingsFilled = true;
    $("shop-name").value = m.name;
    $("sales-goal").value = groupThousands(toDecimal(m.monthlySalesGoal));
    $("cap-new").value = groupThousands(toDecimal(m.monthlyCap));
  }
}

async function saveSettings(body, button, messageBox, okText) {
  showMessage(messageBox, "");
  try {
    await withBusy(button, "Guardando…", async () => {
      await api(`${merchantPath}/settings`, { method: "PUT", body: JSON.stringify(body) });
      settingsFilled = false;
      await loadMerchant();
      showMessage(messageBox, okText, "ok");
    });
  } catch (error) {
    showMessage(messageBox, error.message);
  }
}

$("shop-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("shop-name").value.trim();
  if (!name) {
    showMessage($("shop-message"), "Escribe el nombre de tu negocio.");
    return;
  }
  saveSettings({ name }, $("save-shop"), $("shop-message"), "Nombre guardado.");
});

$("goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const goal = normalizeDecimal($("sales-goal").value);
  if (!goal) {
    showMessage($("goal-message"), "Escribe tu meta, por ejemplo 3.000.000.");
    return;
  }
  saveSettings({ monthlySalesGoal: goal }, $("save-goal"), $("goal-message"), "Meta guardada.");
});

$("clear-goal").addEventListener("click", () =>
  saveSettings({ monthlySalesGoal: null }, $("clear-goal"), $("goal-message"), "Meta quitada."),
);

$("cap-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage($("cap-message"), "");
  const monthlyCap = normalizeDecimal($("cap-new").value);
  if (!monthlyCap) {
    showMessage($("cap-message"), "Escribe el nuevo límite, por ejemplo 500.000.");
    return;
  }
  try {
    await withBusy($("save-cap"), "Abriendo tu billetera…", async () => {
      const { redirectUrl } = await postJson(`${merchantPath}/cap`, { monthlyCap });
      window.location.href = redirectUrl;
    });
  } catch (error) {
    showMessage($("cap-message"), error.message);
  }
});

$("logout").addEventListener("click", logout);

async function loadAccount() {
  try {
    const { user } = await api("/api/auth/me");
    $("account-name").textContent = user.name;
    $("account-email").textContent = user.email;
  } catch {
    // The account card is a convenience; the panel works without it.
  }
}

function renderStatusBanner(status, wallet) {
  const banner = $("status-banner");
  const messages = {
    "awaiting-consent": [
      "wait",
      "Falta tu autorización. Mientras no la apruebes, tus ventas no se reparten solas. Si ya la aprobaste, esta página se actualiza sola.",
    ],
    rejected: [
      "bad",
      "La autorización no se completó. A veces pasa si entraste a la billetera con otra cuenta.",
    ],
    revoked: [
      "bad",
      "Cancelaste la autorización, así que tus ventas ya no se reparten solas.",
    ],
    failed: ["bad", "No pudimos activar tu autorización."],
  };
  const entry = messages[status];
  if (!entry) {
    banner.hidden = true;
    return;
  }
  const [tone, text] = entry;
  const button = el("button", {
    type: "button",
    class: "btn btn-primary",
    text: "Autorizar en mi billetera",
  });
  button.addEventListener("click", async () => {
    try {
      await withBusy(button, "Abriendo tu billetera…", async () => {
        const { redirectUrl } = await postJson(`${merchantPath}/consent`, {});
        window.location.href = redirectUrl;
      });
    } catch (error) {
      showMessage(banner, error.message);
    }
  });
  banner.className = `banner banner-${tone} stack-sm`;
  banner.replaceChildren(
    el("p", { text }),
    el(
      "p",
      { class: "small" },
      "En tu billetera entra con la cuenta dueña de ",
      el("strong", { text: walletName(wallet) }),
      " y toca ",
      el("strong", { text: "Aceptar" }),
      ".",
    ),
    button,
  );
  banner.hidden = false;
}

// Vender ------------------------------------------------------------------------------------------

$("quick-amounts").replaceChildren(
  ...QUICK_AMOUNTS.map((value) =>
    el("button", {
      type: "button",
      class: "chip-button",
      text: formatMoney(value, "COP"),
      onclick: () => {
        $("sale-amount").value = value.toLocaleString("es-CO");
        $("sale-amount").focus();
      },
    }),
  ),
);

function canSell() {
  return merchant?.status === "active";
}

function syncSaleForm() {
  const enabled = canSell();
  $("sale-submit").disabled = !enabled;
  $("sale-disabled-hint").hidden = enabled || !merchant;
}

/** Nothing left to watch: failed, or paid with every share of the split delivered (or failed). */
function isFinal(sale) {
  if (sale.status === "failed") return true;
  return (
    sale.status === "paid" &&
    ["done", "skipped"].includes(sale.settlement?.status) &&
    !(sale.settlement.items || []).some((item) => item.status === "processing")
  );
}

/** After a reload, bring back the newest sale that is still in progress. */
function resumeLatestSale(m) {
  if (resumed) return;
  resumed = true;
  const latest = m.sales[0];
  if (!latest || isFinal(latest) || current) return;
  if (Date.now() - Date.parse(latest.createdAt) > RESUME_WINDOW_MS) return;
  showSale(latest);
}

/**
 * The checkout screen for the shopkeeper's phone. It lives on the public address the customer's
 * checkout uses (the LAN or production URL), so a phone can open it even when this screen runs on
 * localhost.
 */
function cobroUrl(sale) {
  const base = sale.checkoutUrl
    ? new URL(sale.checkoutUrl, window.location.origin).origin
    : window.location.origin;
  return `${base}/cobro?sale=${encodeURIComponent(sale.id)}`;
}

function showSale(sale, payUrl) {
  const checkout = `/pay?sale=${encodeURIComponent(sale.id)}`;
  current = { sale, payUrl: new URL(payUrl || sale.payUrl || checkout, window.location.origin).toString() };
  drawn = { here: null, phone: null };
  $("checkout-link").href = new URL(sale.checkoutUrl || checkout, window.location.origin).toString();
  $("open-cobro").href = cobroUrl(sale);
  const split = $("sale-split");
  split.replaceChildren();
  delete split.dataset.signature;
  $("sale-form").hidden = true;
  $("sale-panel").hidden = false;
  renderSale(sale);
  startSalePolling();
}

function startSalePolling() {
  if (stopSalePoll) stopSalePoll();
  stopSalePoll = null;
  if (!current || isFinal(current.sale)) return;
  const saleId = current.sale.id;
  stopSalePoll = poll(async () => {
    if (!current || current.sale.id !== saleId) return false;
    const sale = await api(`/api/sales/${encodeURIComponent(saleId)}`);
    if (!current || current.sale.id !== saleId) return false;
    current.sale = sale;
    if (sale.payUrl) current.payUrl = new URL(sale.payUrl, window.location.origin).toString();
    renderSale(sale);
    if (isFinal(sale)) {
      loadMerchant();
      return false;
    }
    return true;
    // The next check starts when this one ends, so a fast cadence never piles requests up.
  }, 1000);
}

function renderShowOn() {
  $("show-phone").setAttribute("aria-selected", String(showOn === "phone"));
  $("show-here").setAttribute("aria-selected", String(showOn === "here"));
  $("phone-block").hidden = showOn !== "phone";
  $("here-block").hidden = showOn !== "here";
  if (current) drawQrs();
}

for (const button of [$("show-phone"), $("show-here")]) {
  button.addEventListener("click", () => {
    showOn = button.dataset.show;
    renderShowOn();
  });
}

function drawQrs() {
  if (showOn === "phone") {
    const url = $("open-cobro").href;
    if (drawn.phone !== url) {
      drawn.phone = drawQr($("phone-qr"), url, { size: 220 }) ? url : null;
    }
  } else {
    $("pay-url").value = current.payUrl;
    if (drawn.here !== current.payUrl) {
      drawn.here = drawQr($("qr"), current.payUrl) ? current.payUrl : null;
    }
  }
}

function renderSale(sale) {
  $("sale-caption").textContent = `Venta · ${formatTime(sale.createdAt)}`;
  $("qr-caption").textContent = sale.pending
    ? `Que tu cliente escanee de nuevo y confirme los ${formatAmount(sale.pending)} que faltan`
    : `Que tu cliente lo escanee y confirme ${formatAmount(sale.amount)} en su billetera`;
  showMessage(
    $("sale-partial"),
    sale.pending
      ? `Llegaron ${formatAmount(sale.payment?.receivedAmount)} de ${formatAmount(sale.amount)}. Faltan ${formatAmount(sale.pending)}: el cliente puede volver a escanear el mismo QR.`
      : "",
    "wait",
  );
  $("sale-amount-view").textContent = formatAmount(sale.amount);
  $("sale-description-view").hidden = !sale.description;
  $("sale-description-view").textContent = sale.description || "";
  $("sale-status").replaceChildren(statusBadge(SALE_STATUS, sale.status));

  const stage = STAGE_INDEX[sale.status] ?? 0;
  renderSteps(
    $("sale-steps"),
    SALE_STAGES,
    SALE_STAGES.map((_, index) => index < stage),
    { active: sale.status !== "failed" },
  );

  const waitingForCustomer =
    ["open", "awaiting-consent"].includes(sale.status) || Boolean(sale.pending);
  $("qr-block").hidden = !waitingForCustomer;
  if (waitingForCustomer) renderShowOn();

  showMessage(
    $("sale-error"),
    sale.status === "failed"
      ? `El pago no se completó${sale.error ? `: ${sale.error}` : ""}. Toca "Nueva venta" para cobrar de nuevo.`
      : "",
  );

  const paid = sale.status === "paid";
  $("split-block").hidden = !paid;
  if (paid) {
    renderSplit($("sale-split"), sale.settlement);
    const note = $("settlement-note");
    const status = sale.settlement?.status;
    if (status === "pending" || status === "running") {
      note.textContent = "Repartiendo tu venta…";
    } else if (status === "skipped") {
      note.textContent = sale.settlement.reason || "Esta venta no se repartió.";
    } else {
      note.textContent = "";
    }
    note.hidden = !note.textContent;
  }
}

$("sale-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage($("sale-form-error"), "");
  const amount = normalizeDecimal($("sale-amount").value);
  if (!amount) {
    showMessage($("sale-form-error"), "Escribe un monto válido, por ejemplo 10.000");
    return;
  }
  const description = $("sale-description").value.trim();
  try {
    await withBusy($("sale-submit"), "Creando el cobro…", async () => {
      const { sale, payUrl } = await postJson(
        `${merchantPath}/sales`,
        description ? { amount, description } : { amount },
      );
      showSale(sale, payUrl);
      loadMerchant();
    });
  } catch (error) {
    showMessage($("sale-form-error"), error.message);
  } finally {
    syncSaleForm();
  }
});

$("new-sale").addEventListener("click", () => {
  if (stopSalePoll) stopSalePoll();
  stopSalePoll = null;
  current = null;
  $("sale-panel").hidden = true;
  $("sale-form").hidden = false;
  $("sale-form").reset();
  $("sale-amount").focus();
});

$("copy-url").addEventListener("click", async () => {
  const button = $("copy-url");
  const ok = await copyText($("pay-url").value, $("pay-url"));
  button.textContent = ok ? "¡Copiado!" : "Cópialo a mano";
  setTimeout(() => {
    button.textContent = "Copiar";
  }, 1800);
});

// The QR library loads async from the CDN; draw the QRs as soon as it arrives.
window.addEventListener("load", () => {
  if (current && !$("qr-block").hidden) {
    drawn = { here: null, phone: null };
    drawQrs();
  }
});

// Start -------------------------------------------------------------------------------------------

if (requireSession()) {
  if (merchantId) {
    showTab();
    loadAccount();
    poll(loadMerchant, 5000);
  } else {
    // "/merchant" alone: the till of the signed-in account, or setting up its shop.
    homeOfSignedIn()
      .then((home) => window.location.replace(`${home}${window.location.hash}`))
      .catch((error) => showMessage($("load-error"), error.message));
  }
}
