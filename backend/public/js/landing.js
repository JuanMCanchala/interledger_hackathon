import { STORAGE_KEYS, remember } from "./app.js";

const form = document.getElementById("open-form");
const input = document.getElementById("merchant-id");

input.value = remember.get(STORAGE_KEYS.merchantId);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = input.value.trim();
  if (!id) {
    input.focus();
    return;
  }
  remember.set(STORAGE_KEYS.merchantId, id);
  window.location.href = `/merchant?id=${encodeURIComponent(id)}`;
});
