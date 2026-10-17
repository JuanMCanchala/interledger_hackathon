/**
 * Shared helpers for the MiPlante screens. Plain ES module, no build step.
 * Dynamic values are always rendered with textContent, never as HTML.
 */

export const STORAGE_KEYS = {
  session: "miplante.session",
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
    text: "Falta autorizar",
    tone: "wait",
  },
  active: { text: "Activo", tone: "ok" },
  rejected: { text: "Sin autorizar", tone: "bad" },
  revoked: { text: "Autorización cancelada", tone: "bad" },
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
  skipped: { text: "Límite mensual alcanzado", tone: "neutral" },
  reserved: { text: "Apartado para su día de pago", tone: "info" },
};

export const RULE_KIND = {
  debt: "Obligación",
  savings: "Ahorro",
};

// API ---------------------------------------------------------------------------------------------

export async function api(path, options = {}) {
  const token = session.token();
  // Signing in or up never carries an old session, so a wrong password is not taken for an expired one.
  const sendToken = Boolean(token) && !/^\/api\/auth\/(login|register)$/.test(path);
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(sendToken ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(
      "No hay conexión con MiPlante. Revisa tu internet e intenta de nuevo.",
    );
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && sendToken) {
    // The session ended (signed out elsewhere or expired): sign in again and come back here.
    session.clear();
    goToLogin();
  }
  if (!res.ok) {
    const details = Array.isArray(body.details)
      ? body.details.join(" · ")
      : body.details || "";
    const message = body.error || friendlyStatus(res.status);
    const technical = details ? `${message}: ${details}` : message;
    const error = new Error(friendlyError(technical) || technical);
    error.status = res.status;
    error.technical = technical;
    throw error;
  }
  return body;
}

export function postJson(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

// Session -----------------------------------------------------------------------------------------

/** The shopkeeper's session token, kept on this device after signing in. */
export const session = {
  token: () => remember.get(STORAGE_KEYS.session),
  start: (token) => remember.set(STORAGE_KEYS.session, token),
  clear: () => remember.remove(STORAGE_KEYS.session),
};

/** Sends the shopkeeper to sign in, and back to this page afterwards. */
export function goToLogin() {
  const here = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?next=${encodeURIComponent(here)}`;
}

/** Shopkeeper pages call this first: without a session it goes to sign in and returns false. */
export function requireSession() {
  if (session.token()) return true;
  goToLogin();
  return false;
}

export async function logout() {
  try {
    await postJson("/api/auth/logout", {});
  } catch {
    // Signing out on this device is what matters.
  }
  session.clear();
  window.location.href = "/login";
}

/** Where a signed-in shopkeeper goes: their till, or setting up their shop if they have none yet. */
export async function homeOfSignedIn() {
  const { merchant } = await api("/api/auth/me");
  return merchant
    ? `/merchant?id=${encodeURIComponent(merchant.id)}`
    : "/onboard";
}

/** A `next` page from the URL, only if it is a path on this site (never another domain). */
export function safeNext(next) {
  if (!next?.startsWith("/")) return "";
  // Resolve it as the browser will: "/\\evil.com" or a tab in "//" also lead to another domain.
  let url;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return "";
  }
  return url.origin === window.location.origin &&
    !url.pathname.startsWith("/login")
    ? `${url.pathname}${url.search}${url.hash}`
    : "";
}

/**
 * People using MiPlante are shopkeepers and their customers, not developers: technical messages
 * from the API or the wallet become plain Spanish with a hint of what to do next.
 */
const FRIENDLY_ERRORS = [
  [
    /Could not get wallet address|wallet desconocida|Wallet address inválida/i,
    "No encontramos esa billetera. Revisa que el nombre esté bien escrito.",
  ],
  [
    /no está permitido/i,
    "Esa billetera no es de la red de prueba de Interledger. Escribe solo su nombre, por ejemplo tienda-billeticos.",
  ],
  [
    /debe usar https|query ni fragmento/i,
    "Escribe solo el nombre de la billetera, por ejemplo tienda-billeticos.",
  ],
  [
    /misma wallet del negocio/i,
    "El dinero de un pago automático no puede ir a la misma billetera de tu negocio.",
  ],
  [
    /como máximo pueden tomar el 50%/i,
    "Entre todos los pagos automáticos no puedes pasar de la mitad de cada venta.",
  ],
  [
    /ya se está pagando o ya fue pagada/i,
    "Este cobro ya se está pagando. Espera un momento y recarga la página.",
  ],
  [
    /Open Payments rechazó la solicitud/i,
    "La billetera no aceptó la operación. Intenta de nuevo en un momento.",
  ],
];

export function friendlyError(message) {
  const match = FRIENDLY_ERRORS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : "";
}

function friendlyStatus(status) {
  if (status === 404) return "No encontramos lo que buscas";
  if (status >= 500)
    return "El servidor tuvo un problema. Intenta de nuevo en un momento";
  return `Algo salió mal (error ${status})`;
}

// Wallets -----------------------------------------------------------------------------------------

/** All demo wallets live on the Interledger test network, so people only type the name. */
export const WALLET_HOST = "ilp.interledger-test.dev";

/**
 * What a person types → what the API accepts:
 * "tienda-billeticos" → "$ilp.interledger-test.dev/tienda-billeticos"; "$…" and "https://…" pass.
 */
export function normalizeWallet(input) {
  const text = String(input ?? "").replace(/\s+/g, "");
  if (!text) return "";
  if (/^(\$|https?:\/\/)/i.test(text)) return text;
  if (text.includes("/")) return `$${text}`;
  return `$${WALLET_HOST}/${text.replace(/^@/, "")}`;
}

/** "https://ilp.interledger-test.dev/tienda-billeticos" → "tienda-billeticos" for display. */
export function walletName(url) {
  try {
    const parsed = new URL(String(url).replace(/^\$/, "https://"));
    const path = parsed.pathname.replace(/^\//, "");
    return parsed.hostname === WALLET_HOST
      ? path
      : `${parsed.hostname}/${path}`;
  } catch {
    return String(url ?? "");
  }
}

const CURRENCY_NAMES = {
  COP: "pesos colombianos",
  USD: "dólares",
  EUR: "euros",
};

/** Looks the wallet up; resolves to { name, currency } or rejects with a friendly message. */
export async function checkWallet(input) {
  const wallet = normalizeWallet(input);
  const info = await api(
    `/api/wallet-address?url=${encodeURIComponent(wallet)}`,
  );
  return {
    wallet,
    name: walletName(info.id),
    currency: CURRENCY_NAMES[info.assetCode] || info.assetCode,
    assetCode: info.assetCode,
  };
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
 * While the shopkeeper is typing, the shares can add up to more than the sale; the preview then
 * gives each rule only what is left, in order, so the shop never shows a negative amount (the
 * form refuses to save it anyway).
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
    if (amount > saleMinor - allocated) amount = saleMinor - allocated;
    if (amount < 0n) amount = 0n;
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
            ? badge("Límite mensual alcanzado")
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

// QR ----------------------------------------------------------------------------------------------

/**
 * Draws `url` as a QR code in `target` with the qrcodejs library the page loads from the CDN.
 * Returns false (and leaves a hint) when the library is not there yet, so the page can retry on load.
 */
export function drawQr(target, url, { size = 256, fallback = "Comparte el enlace de abajo." } = {}) {
  target.replaceChildren();
  if (typeof window.QRCode !== "function") {
    target.append(el("p", { class: "small", text: fallback }));
    return false;
  }
  try {
    new window.QRCode(target, {
      text: url,
      width: size,
      height: size,
      colorDark: "#0e1410",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    return true;
  } catch {
    target.replaceChildren(el("p", { class: "small", text: fallback }));
    return false;
  }
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
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing was stored.
    }
  },
};

export function param(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Calls `task` until it returns false or `stop()` is called, waiting `interval` ms between calls
 * (a number, or a function so the pace can slow down). The next call starts when the previous one
 * ends, so requests never pile up. While the page is hidden (another tab, the phone locked) it
 * makes no requests, and it checks again as soon as the page is visible.
 */
export function poll(task, interval) {
  let timer;
  let stopped = false;
  let running = false;
  const delay = () => (typeof interval === "function" ? interval() : interval);
  const run = async () => {
    timer = undefined;
    if (stopped || running || document.hidden) return;
    running = true;
    let again = true;
    try {
      again = (await task()) !== false;
    } catch {
      again = true;
    }
    running = false;
    if (!again) stop();
    else if (!stopped) timer = setTimeout(run, delay());
  };
  const onVisibility = () => {
    if (document.hidden || stopped || running) return;
    clearTimeout(timer);
    run();
  };
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  document.addEventListener("visibilitychange", onVisibility);
  run();
  return stop;
}

/**
 * How often to check a sale, by its age: every second while the customer is likely paying, then
 * less and less, so an abandoned sale left on screen does not spend the shop's mobile data.
 */
export function salePace(createdAt) {
  const age = Date.now() - Date.parse(createdAt);
  if (!Number.isFinite(age) || age < 60_000) return 1_000;
  if (age < 5 * 60_000) return 3_000;
  return 10_000;
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
