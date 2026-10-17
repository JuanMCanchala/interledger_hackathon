import {
  SALE_STATUS,
  api,
  drawQr,
  formatAmount,
  formatTime,
  param,
  poll,
  showMessage,
  statusBadge,
} from "./app.js";

/**
 * The checkout screen the shopkeeper opens on a phone (from the till's QR or its button) and turns
 * towards the customer: the sale's payment QR, the amount and its live state. It is public on
 * purpose, like the customer's checkout: the link only shows this sale and changes nothing.
 */

const $ = (id) => document.getElementById(id);
const saleId = param("sale");
let drawnFor = null;
let lastSale = null;

function render(sale) {
  lastSale = sale;
  $("missing").hidden = true;
  $("cobro").hidden = false;
  document.title = `${formatAmount(sale.amount)} · ${sale.merchantName || "MiPlante"}`;
  $("merchant-name").textContent = sale.merchantName || "MiPlante";
  $("amount").textContent = formatAmount(sale.pending || sale.amount);
  $("description").hidden = !sale.description;
  $("description").textContent = sale.description || "";
  $("status").replaceChildren(statusBadge(SALE_STATUS, sale.status));

  const paid = sale.status === "paid";
  const waiting =
    ["open", "awaiting-consent"].includes(sale.status) || Boolean(sale.pending);
  $("qr-block").hidden = !waiting;
  if (waiting) {
    $("qr-caption").textContent = sale.pending
      ? `Escanea de nuevo y confirma los ${formatAmount(sale.pending)} que faltan`
      : "Escanea con tu celular y confirma en tu billetera";
    if (drawnFor !== sale.payUrl) {
      drawnFor = drawQr($("qr"), sale.payUrl, {
        size: 320,
        fallback: "Pide al negocio el enlace de pago.",
      })
        ? sale.payUrl
        : null;
    }
  }

  showMessage(
    $("partial"),
    sale.pending
      ? `Llegaron ${formatAmount(sale.payment?.receivedAmount)} de ${formatAmount(sale.amount)}.`
      : "",
    "wait",
  );

  $("done").hidden = !paid;
  if (paid) {
    $("amount").textContent = formatAmount(sale.amount);
    $("done-detail").textContent = sale.paidAt
      ? `Pagado a las ${formatTime(sale.paidAt)}. ¡Gracias por tu compra!`
      : "¡Gracias por tu compra!";
  }

  showMessage(
    $("error"),
    sale.status === "failed"
      ? "Este cobro no se completó. Pide al negocio que genere uno nuevo."
      : "",
  );
  return !paid && sale.status !== "failed";
}

async function refresh() {
  try {
    return render(await api(`/api/sales/${encodeURIComponent(saleId)}`));
  } catch (error) {
    if (error.status === 404) {
      $("missing").hidden = false;
      $("cobro").hidden = true;
      return false;
    }
    throw error;
  }
}

// The QR library loads async from the CDN; draw the QR as soon as it arrives.
window.addEventListener("load", () => {
  if (lastSale && !drawnFor) render(lastSale);
});

if (saleId) {
  poll(refresh, 1000);
} else {
  $("missing").hidden = false;
}
