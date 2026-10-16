import {
  MERCHANT_STATUS,
  RULE_KIND,
  SALE_STATUS,
  STORAGE_KEYS,
  absoluteUrl,
  api,
  badge,
  copyText,
  el,
  formatAmount,
  formatDay,
  formatMoney,
  formatTime,
  localDate,
  normalizeDecimal,
  param,
  poll,
  postJson,
  remember,
  renderSplit,
  renderSteps,
  showMessage,
  statusBadge,
  toNumber,
  walletName,
  withBusy,
} from "./app.js";
import { createRulesEditor } from "./rules-editor.js";

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

const $ = (id) => document.getElementById(id);
const merchantId = param("id");
let lastStatus = null;

let merchant = null;
let current = null; // { sale, payUrl }
let stopSalePoll = null;
let qrRenderedFor = null;
let resumed = false;

// Merchant ----------------------------------------------------------------------------------------

async function loadMerchant() {
  try {
    merchant = await api(`/api/merchants/${encodeURIComponent(merchantId)}`);
  } catch (error) {
    if (error.status === 404) {
      showMissing(
        "No encontramos esa caja. Revisa el enlace o registra tu negocio.",
      );
      return false;
    }
    showMessage(
      $("load-error"),
      `No pudimos actualizar tu caja: ${error.message}`,
    );
    return true;
  }
  showMessage($("load-error"), "");
  // Remember only IDs that exist, so a typo does not stick in "Abrir mi caja".
  remember.set(STORAGE_KEYS.merchantId, merchantId);
  renderMerchant(merchant);
  resumeLatestSale(merchant);
  return true;
}

function showMissing(text) {
  $("missing-text").textContent = text;
  $("missing").hidden = false;
  $("app").hidden = true;
}

/** Renders a section only when its data changed, so polling does not reset the page. */
function changed(container, data) {
  const signature = JSON.stringify(data);
  if (container.dataset.signature === signature) return false;
  container.dataset.signature = signature;
  return true;
}

function renderMerchant(m) {
  $("app").hidden = false;
  $("missing").hidden = true;
  document.title = `${m.name} · MiPlante`;
  $("merchant-name").textContent = m.name;
  $("merchant-wallet").textContent = `Billetera: ${walletName(m.wallet)}`;
  $("merchant-status").replaceChildren(statusBadge(MERCHANT_STATUS, m.status));
  if (m.status !== lastStatus) renderStatusBanner(m.status, m.wallet);
  lastStatus = m.status;
  syncSaleForm();

  $("today-date").textContent = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  $("today-count").textContent = String(m.today.salesCount);
  $("today-gross").textContent = formatAmount(m.today.gross);
  $("today-kept").textContent = formatAmount(m.today.kept);
  $("today-allocated").textContent = formatAmount(m.today.allocated);
  if (changed($("today-by-rule"), m.today.byRule)) {
    $("today-by-rule").replaceChildren(
      ...m.today.byRule.map((item) =>
        el(
          "li",
          { class: "row between small" },
          el("span", { text: item.label }),
          el("strong", { class: "num", text: formatAmount(item.amount) }),
        ),
      ),
    );
  }

  $("daily-cap").textContent = `Límite: ${formatAmount(m.dailyCap)}`;
  if (m.spentToday) {
    $("spent-today").textContent = formatAmount(m.spentToday);
    const ratio =
      toNumber(m.dailyCap) > 0
        ? toNumber(m.spentToday) / toNumber(m.dailyCap)
        : 0;
    $("cap-bar").style.width = `${Math.min(100, ratio * 100)}%`;
  } else {
    $("spent-today").textContent = "—";
    $("cap-bar").style.width = "0%";
  }

  if (changed($("rules"), m.rules)) renderRules(m.rules);
  if (changed($("history"), m.history)) renderHistory(m.history);
  if (changed($("sales"), m.sales)) renderSales(m.sales);
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
        const { redirectUrl } = await postJson(
          `/api/merchants/${encodeURIComponent(merchantId)}/consent`,
          {},
        );
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

function renderRules(rules) {
  $("rules").replaceChildren(
    ...rules.map((rule) => {
      const percent = (rule.shareBps / 100).toLocaleString("es-CO", {
        maximumFractionDigits: 2,
      });
      const parts = [
        el(
          "div",
          { class: "row between" },
          el("strong", { text: rule.label }),
          badge(
            RULE_KIND[rule.kind] || rule.kind,
            rule.kind === "debt" ? "wait" : "info",
          ),
        ),
        el("p", { class: "muted small", text: `${percent}% de cada venta` }),
        el("p", { class: "mono muted", text: rule.destination }),
      ];
      if (rule.kind === "debt") {
        const repaid = toNumber(rule.repaid);
        const outstanding = rule.outstanding ? toNumber(rule.outstanding) : 0;
        const total = repaid + outstanding;
        const ratio = total > 0 ? repaid / total : 1;
        parts.push(
          el(
            "div",
            { class: "progress" },
            el("span", { style: `width: ${Math.min(100, ratio * 100)}%` }),
          ),
        );
        parts.push(
          outstanding <= 0
            ? badge("¡Deuda pagada!", "ok")
            : el("p", {
                class: "small",
                text: `Pagado ${formatAmount(rule.repaid)} de ${formatMoney(total, rule.repaid.assetCode, rule.repaid.assetScale)} · faltan ${formatAmount(rule.outstanding)}`,
              }),
        );
      } else {
        parts.push(
          el("p", {
            class: "small",
            text: `Ahorrado: ${formatAmount(rule.repaid)}`,
          }),
        );
      }
      return el("li", { class: "list-item" }, ...parts);
    }),
  );
}

function renderHistory(history) {
  const max = Math.max(0, ...history.map((day) => toNumber(day.gross)));
  const today = localDate();
  $("history").replaceChildren(
    ...history.map((day) => {
      const width = max > 0 ? (toNumber(day.gross) / max) * 100 : 0;
      const label = `${formatDay(day.date)}: ${formatAmount(day.gross)} en ${day.salesCount} ventas`;
      return el(
        "li",
        { class: `bar-row${day.date === today ? " is-today" : ""}` },
        el("span", { text: formatDay(day.date) }),
        el(
          "div",
          { class: "bar-track", role: "img", "aria-label": label },
          el("div", { class: "bar-fill", style: `width: ${width}%` }),
        ),
        el("span", {
          class: "num small",
          text: `${formatAmount(day.gross)} · ${day.salesCount}`,
        }),
      );
    }),
  );
}

function renderSales(sales) {
  $("no-sales").hidden = sales.length > 0;
  $("sales").replaceChildren(
    ...sales.map((sale) =>
      el(
        "li",
        {},
        el(
          "button",
          {
            type: "button",
            class: "list-button",
            onclick: () => showSale(sale),
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

// Rules editor ------------------------------------------------------------------------------------

let editor = null;

/** Minor units → the plain decimal the inputs use ("29850000", scale 2 → "298500"). */
function toDecimal(amount) {
  if (!amount) return "";
  const scale = amount.assetScale;
  const digits = amount.value.padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
}

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
    capMinor: () => BigInt(merchant.dailyCap.value),
  });
  editor.clear();
  for (const rule of merchant.rules) {
    editor.add({
      id: rule.id,
      label: rule.label,
      kind: rule.kind,
      sharePercent: rule.shareBps / 100,
      outstanding: toDecimal(rule.outstanding),
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
  editor?.add({ label: "Proveedor", kind: "debt" }),
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
      const updated = await api(
        `/api/merchants/${encodeURIComponent(merchantId)}/rules`,
        { method: "PUT", body: JSON.stringify({ rules }) },
      );
      merchant = { ...merchant, rules: updated.rules };
      renderRules(updated.rules);
      $("rules").dataset.signature = JSON.stringify(updated.rules);
      setEditing(false);
      showMessage(
        $("rules-saved"),
        "Listo: tus próximas ventas se reparten así.",
        "ok",
      );
      loadMerchant();
    });
  } catch (error) {
    showMessage($("rules-error"), error.message);
  }
});

// Sales -------------------------------------------------------------------------------------------

function canSell() {
  return merchant?.status === "active";
}

function syncSaleForm() {
  const enabled = canSell();
  $("sale-submit").disabled = !enabled;
  $("sale-disabled-hint").hidden = enabled || !merchant;
}

function isFinal(sale) {
  if (sale.status === "failed") return true;
  return (
    sale.status === "paid" &&
    ["done", "skipped"].includes(sale.settlement?.status)
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

function showSale(sale, payUrl) {
  const url = absoluteUrl(
    payUrl || `/pay.html?sale=${encodeURIComponent(sale.id)}`,
  );
  current = { sale, payUrl: url };
  qrRenderedFor = null;
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
    renderSale(sale);
    if (isFinal(sale)) {
      loadMerchant();
      return false;
    }
    return true;
  }, 2000);
}

function renderSale(sale) {
  $("sale-caption").textContent = `Venta · ${formatTime(sale.createdAt)}`;
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

  const waitingForCustomer = ["open", "awaiting-consent", "failed"].includes(
    sale.status,
  );
  $("qr-block").hidden = !waitingForCustomer;
  if (waitingForCustomer) renderQr(current.payUrl);

  showMessage(
    $("sale-error"),
    sale.status === "failed"
      ? `El pago no se completó${sale.error ? `: ${sale.error}` : ""}. El cliente puede intentarlo de nuevo con el mismo QR.`
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

function renderQr(url) {
  $("pay-url").value = url;
  if (qrRenderedFor === url) return;
  const target = $("qr");
  target.replaceChildren();
  if (typeof window.QRCode !== "function") {
    target.append(
      el("p", {
        class: "small",
        text: "Comparte el enlace de abajo con tu cliente.",
      }),
    );
    return;
  }
  try {
    new window.QRCode(target, {
      text: url,
      width: 256,
      height: 256,
      colorDark: "#0e1410",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    qrRenderedFor = url;
  } catch {
    target.replaceChildren(
      el("p", {
        class: "small",
        text: "Comparte el enlace de abajo con tu cliente.",
      }),
    );
  }
}

// Events ------------------------------------------------------------------------------------------

$("sale-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage($("sale-form-error"), "");
  const amount = normalizeDecimal($("sale-amount").value);
  if (!amount) {
    showMessage(
      $("sale-form-error"),
      "Escribe un monto válido, por ejemplo 10.000",
    );
    return;
  }
  const description = $("sale-description").value.trim();
  try {
    await withBusy($("sale-submit"), "Creando el cobro…", async () => {
      const { sale, payUrl } = await postJson(
        `/api/merchants/${encodeURIComponent(merchantId)}/sales`,
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
  qrRenderedFor = null;
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

// The QR library loads async from the CDN; draw the QR as soon as it arrives.
window.addEventListener("load", () => {
  if (current && !$("qr-block").hidden) {
    qrRenderedFor = null;
    renderQr(current.payUrl);
  }
});

const rememberedId = remember.get(STORAGE_KEYS.merchantId);
if (!merchantId && rememberedId) {
  // "Abrir mi caja" without a code: this device remembers the merchant it registered.
  window.location.replace(
    `/merchant.html?id=${encodeURIComponent(rememberedId)}`,
  );
} else if (!merchantId) {
  showMissing(
    "Este celular o computador no tiene una caja guardada. Registra tu negocio o abre el enlace de tu caja.",
  );
} else {
  poll(loadMerchant, 5000);
}
