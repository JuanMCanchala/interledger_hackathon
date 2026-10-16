import {
  PAYMENT_STEPS,
  STORAGE_KEYS,
  api,
  normalizeWallet,
  formatAmount,
  param,
  poll,
  postJson,
  remember,
  renderSplit,
  renderSteps,
  showMessage,
  statusBadge,
  walletName,
  withBusy,
} from "../app.js";

/** Status labels from the customer's point of view. */
const CUSTOMER_STATUS = {
  open: { text: "Listo para pagar", tone: "info" },
  "awaiting-consent": { text: "Esperando tu autorización", tone: "wait" },
  processing: { text: "Procesando el pago", tone: "wait" },
  paid: { text: "Pagado", tone: "ok" },
  failed: { text: "No se completó", tone: "bad" },
};
const POLL_MS = 1500;
const MAX_POLLS = 400;

const $ = (id) => document.getElementById(id);
const saleId = param("sale");
let stopPoll = null;

function isFinal(sale) {
  if (sale.status === "failed") return true;
  return (
    sale.status === "paid" &&
    ["done", "skipped"].includes(sale.settlement?.status)
  );
}

function render(sale) {
  $("checkout").hidden = false;
  document.title = `Pagar a ${sale.merchantName} · MiPlante`;
  $("merchant-name").textContent = sale.merchantName;
  $("amount").textContent = formatAmount(sale.amount);
  $("description").hidden = !sale.description;
  $("description").textContent = sale.description || "";
  $("status").replaceChildren(statusBadge(CUSTOMER_STATUS, sale.status));

  const canPay = sale.status === "open" || sale.status === "failed";
  $("pay-form").hidden = !canPay;
  if (!$("pay-button").disabled)
    $("pay-button").textContent = `Pagar ${formatAmount(sale.amount)}`;

  const steps = sale.payment?.steps;
  $("steps").hidden = !steps;
  if (steps) {
    renderSteps(
      $("steps"),
      PAYMENT_STEPS.map(([, label]) => label),
      PAYMENT_STEPS.map(([key]) => steps[key]),
      {
        active: !["failed", "paid"].includes(sale.status),
      },
    );
  }

  showMessage(
    $("error"),
    sale.status === "failed"
      ? `El pago no se completó${sale.error ? `: ${sale.error}` : ""}. Puedes intentarlo de nuevo.`
      : "",
  );

  const paid = sale.status === "paid";
  $("done").hidden = !paid;
  $("transparency").hidden = !paid;
  if (paid) {
    renderSplit($("split"), sale.settlement, {
      keptLabel: `${sale.merchantName} recibe`,
    });
    const note = $("split-note");
    const status = sale.settlement?.status;
    if (status === "pending" || status === "running")
      note.textContent = "Repartiendo el pago…";
    else if (status === "skipped")
      note.textContent = sale.settlement.reason || "Este pago no se repartió.";
    else note.textContent = "";
    note.hidden = !note.textContent;
  }
}

async function fetchSale() {
  return api(`/api/sales/${encodeURIComponent(saleId)}`);
}

function startPolling() {
  if (stopPoll) stopPoll();
  let attempts = 0;
  stopPoll = poll(async () => {
    attempts += 1;
    const sale = await fetchSale();
    render(sale);
    return !isFinal(sale) && attempts < MAX_POLLS;
  }, POLL_MS);
}

async function load() {
  let sale;
  try {
    sale = await fetchSale();
  } catch (error) {
    if (error.status === 404) {
      $("missing").hidden = false;
      return;
    }
    showMessage(
      $("load-error"),
      `No pudimos cargar el cobro: ${error.message}. Recarga la página.`,
    );
    return;
  }
  render(sale);
  // Coming back from the wallet: follow the payment until it finishes.
  if (sale.status !== "open" && !isFinal(sale)) startPolling();
}

$("pay-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage($("error"), "");
  const wallet = normalizeWallet($("customer-wallet").value);
  if (!wallet) {
    $("customer-wallet").focus();
    return;
  }
  try {
    await withBusy($("pay-button"), "Abriendo tu billetera…", async () => {
      const { redirectUrl } = await postJson(
        `/api/sales/${encodeURIComponent(saleId)}/pay`,
        {
          customerWallet: wallet,
        },
      );
      remember.set(STORAGE_KEYS.customerWallet, wallet);
      window.location.href = redirectUrl;
    });
  } catch (error) {
    showMessage($("error"), error.message);
  }
});

$("customer-wallet").value = walletName(
  remember.get(STORAGE_KEYS.customerWallet),
);

if (!saleId) {
  $("missing").hidden = false;
} else {
  load();
}
