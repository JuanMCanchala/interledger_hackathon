/**
 * Shared helpers for the MiPlante screens. Plain ES module, no build step.
 * Dynamic values are always rendered with textContent, never as HTML.
 */

export const STORAGE_KEYS = {
  merchantId: "miplante.merchantId",
  merchantWallet: "miplante.merchantWallet",
  customerWallet: "miplante.customerWallet",
};

/** The four steps the hackathon demo must show, keyed like `payment.steps` in the API. */
export const PAYMENT_STEPS = [
  ["request", "Solicitud de pago"],
  ["authorization", "Autorización"],
  ["execution", "Ejecución"],
  ["completion", "Finalización"],
];

export const MERCHANT_STATUS = {
  "awaiting-consent": {
    text: "Falta tu autorización en la wallet",
    tone: "wait",
  },
  active: { text: "Activo", tone: "ok" },
  rejected: { text: "Autorización rechazada", tone: "bad" },
  revoked: { text: "Autorización revocada", tone: "bad" },
  failed: { text: "No se pudo activar", tone: "bad" },
};

export const SALE_STATUS = {
  open: { text: "Esperando al cliente", tone: "info" },
  "awaiting-consent": { text: "Cliente autorizando", tone: "wait" },
  processing: { text: "Pago en camino", tone: "wait" },
  paid: { text: "¡Pagado!", tone: "ok" },
  failed: { text: "Pago fallido", tone: "bad" },
};

export const ITEM_STATUS = {
  processing: { text: "Enviando…", tone: "wait" },
  completed: { text: "Enviado", tone: "ok" },
  failed: { text: "Falló", tone: "bad" },
  skipped: { text: "Tope diario alcanzado", tone: "neutral" },
};

export const RULE_KIND = {
  debt: "Crédito / proveedor",
  savings: "Ahorro",
};

// API ---------------------------------------------------------------------------------------------

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(
      "No hay conexión con MiPlante. Revisa tu internet e intenta de nuevo.",
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(body.details)
      ? body.details.join(" · ")
      : body.details || "";
    const message = body.error || friendlyStatus(res.status);
    const error = new Error(details ? `${message}: ${details}` : message);
    error.status = res.status;
    throw error;
  }
  return body;
}

export function postJson(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

function friendlyStatus(status) {
  if (status === 404) return "No encontramos lo que buscas";
  if (status >= 500)
    return "El servidor tuvo un problema. Intenta de nuevo en un momento";
  return `Algo salió mal (error ${status})`;
}

// Money -------------------------------------------------------------------------------------------

/** Open Payments amount ({ value in minor units, assetCode, assetScale }) → number. */
export function toNumber(amount) {
  return Number(amount.value) / 10 ** amount.assetScale;
}

export function formatAmount(amount) {
  if (!amount) return "—";
  return formatMoney(toNumber(amount), amount.assetCode, amount.assetScale);
}

export function formatMoney(value, assetCode = "COP", maxFraction = 2) {
  const fraction = Number.isInteger(value) ? 0 : Math.min(maxFraction, 2);
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: assetCode,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(value);
  } catch {
    // Test tokens are not ISO currencies.
    return `${value.toLocaleString("es-CO", { maximumFractionDigits: maxFraction })} ${assetCode}`;
  }
}

/**
 * Turns what a Colombian types into the decimal string the API expects:
 * "300.000" → "300000", "1.500.000" → "1500000", "12,50" → "12.50", "$ 20.000" → "20000".
 * Returns "" when the input is not a valid positive amount with at most 2 decimals.
 */
export function normalizeDecimal(input) {
  let text = String(input ?? "")
    .replace(/[\s$]/g, "")
    .replace(/COP$/i, "");
  if (!text) return "";
  if (text.includes(".") && text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text =
      /,\d{1,2}$/.test(text) && (text.match(/,/g) || []).length === 1
        ? text.replace(",", ".")
        : text.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "";
  if (Number(text) <= 0) return "";
  return text;
}

/** Decimal string → integer minor units (BigInt) for the given scale. */
export function toMinor(decimal, scale = 2) {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole + fraction.padEnd(scale, "0").slice(0, scale));
}

/**
 * Same split the server applies to a sale: floor(amount × bps / 10 000) per rule,
 * a debt never takes more than what is still owed. Amounts are BigInt minor units.
 */
export function previewSplit(saleMinor, rules) {
  let allocated = 0n;
  const items = rules.map((rule) => {
    let amount = (saleMinor * BigInt(rule.shareBps)) / 10000n;
    if (
      rule.kind === "debt" &&
      rule.outstandingMinor !== undefined &&
      amount > rule.outstandingMinor
    ) {
      amount = rule.outstandingMinor;
    }
    allocated += amount;
    return { label: rule.label, kind: rule.kind, amount };
  });
  return { items, allocated, kept: saleMinor - allocated };
}

// DOM ---------------------------------------------------------------------------------------------

/** Small element builder: strings become text nodes, never HTML. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

const TONES = {
  ok: "badge-ok",
  wait: "badge-wait",
  bad: "badge-bad",
  info: "badge-info",
};

export function badge(text, tone) {
  return el("span", { class: `badge ${TONES[tone] || ""}`.trim(), text });
}

export function statusBadge(map, status) {
  const info = map[status] || { text: status, tone: "neutral" };
  return badge(info.text, info.tone);
}

/** Shows a message in a banner element (hides it when message is empty). */
export function showMessage(element, message, tone = "bad") {
  element.className = `banner banner-${tone}`;
  element.textContent = message || "";
  element.hidden = !message;
}

/** Disables the button and shows a busy label while the action runs. */
export async function withBusy(button, busyText, action) {
  const original = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (busyText) button.textContent = busyText;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = original;
  }
}

/** Renders the four demo steps; the first pending step pulses while `active`. */
export function renderSteps(
  container,
  labels,
  doneFlags,
  { active = true } = {},
) {
  container.replaceChildren();
  let currentMarked = false;
  labels.forEach((label, index) => {
    const done = Boolean(doneFlags[index]);
    const current = active && !done && !currentMarked;
    if (current) currentMarked = true;
    container.append(
      el(
        "li",
        { class: `step${done ? " is-done" : current ? " is-current" : ""}` },
        el("span", {
          class: "step-icon",
          "aria-hidden": "true",
          text: done ? "✓" : "",
        }),
        el("span", { text: label }),
        el("span", {
          class: "sr-only",
          text: done ? " (listo)" : current ? " (en curso)" : "",
        }),
      ),
    );
  });
}

/**
 * Renders how a sale was split. Re-renders only when something changed and animates rows
 * only the first time, so polling does not make the list flicker.
 */
export function renderSplit(
  container,
  settlement,
  { keptLabel = "Tú te quedas" } = {},
) {
  const items = settlement?.items || [];
  const signature = JSON.stringify([settlement?.kept, items]);
  if (container.dataset.signature === signature) return;
  const animate = container.childElementCount === 0;
  container.dataset.signature = signature;
  container.replaceChildren();

  const rows = [];
  if (settlement?.kept) {
    rows.push(
      el(
        "li",
        { class: "split-item is-kept" },
        el("span", { class: "split-label", text: keptLabel }),
        el("span", {
          class: "split-amount",
          text: formatAmount(settlement.kept),
        }),
      ),
    );
  }
  for (const item of items) {
    rows.push(
      el(
        "li",
        { class: "split-item" },
        el("span", { class: "split-label", text: item.label }),
        el("span", { class: "split-amount", text: formatAmount(item.amount) }),
        el(
          "div",
          { class: "split-meta" },
          el("span", { text: RULE_KIND[item.kind] || item.kind }),
          statusBadge(ITEM_STATUS, item.status),
          item.capped && item.status !== "skipped"
            ? badge("Tope diario alcanzado")
            : null,
          item.error
            ? el("span", { class: "error-text", text: item.error })
            : null,
        ),
      ),
    );
  }
  rows.forEach((row, index) => {
    if (animate) {
      row.classList.add("is-entering");
      row.style.animationDelay = `${index * 140}ms`;
    }
    container.append(row);
  });
}

// Misc --------------------------------------------------------------------------------------------

export const remember = {
  get(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable (private mode); remembering is only a convenience.
    }
  },
};

export function param(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Calls `task` every `intervalMs` until it returns false or `stop()` is called. */
export function poll(task, intervalMs) {
  let timer;
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    let again = true;
    try {
      again = (await task()) !== false;
    } catch {
      again = true;
    }
    if (!stopped && again) timer = setTimeout(run, intervalMs);
  };
  run();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDay(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
  });
}

export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function absoluteUrl(url) {
  return new URL(url, window.location.origin).toString();
}

export async function copyText(text, fallbackInput) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallbackInput) return false;
    fallbackInput.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}
