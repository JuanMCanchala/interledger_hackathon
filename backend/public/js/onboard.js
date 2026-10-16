import {
  STORAGE_KEYS,
  normalizeDecimal,
  postJson,
  remember,
  showMessage,
  toMinor,
  withBusy,
} from "../app.js";
import { createRulesEditor } from "./rules-editor.js";

const form = document.getElementById("onboard-form");
const nameInput = document.getElementById("business-name");
const walletInput = document.getElementById("business-wallet");
const capInput = document.getElementById("daily-cap");
const addButton = document.getElementById("add-rule");
const submitButton = document.getElementById("submit");
const formError = document.getElementById("form-error");

/** The preview assumes COP with two decimals, like the test wallet's COP accounts. */
const editor = createRulesEditor({
  box: document.getElementById("rules"),
  template: document.getElementById("rule-template"),
  addButton,
  preview: {
    sentence: document.getElementById("preview-sentence"),
    bar: document.getElementById("preview-bar"),
    list: document.getElementById("preview-list"),
    warning: document.getElementById("preview-warning"),
    cap: document.getElementById("preview-cap"),
  },
  capMinor: () => {
    const cap = normalizeDecimal(capInput.value);
    return cap ? toMinor(cap, 2) : undefined;
  },
});

function collect() {
  const dailyCap = normalizeDecimal(capInput.value);
  if (!dailyCap)
    throw new Error("Escribe un tope diario válido, por ejemplo 20.000");
  return {
    name: nameInput.value.trim(),
    wallet: walletInput.value.trim(),
    dailyCap,
    rules: editor.collect(),
  };
}

form.addEventListener("input", () => {
  editor.render();
  showMessage(formError, "");
});

addButton.addEventListener("click", () => editor.add({ kind: "savings" }));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(formError, "");
  if (!form.reportValidity()) return;
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
editor.add({
  label: "Microcrédito",
  kind: "debt",
  sharePercent: 15,
  outstanding: "300000",
});
editor.add({ label: "Fondo de emergencia", kind: "savings", sharePercent: 5 });
