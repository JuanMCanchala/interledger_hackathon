import {
  homeOfSignedIn,
  param,
  postJson,
  safeNext,
  session,
  showMessage,
  withBusy,
} from "./app.js";

/** Sign-in (/login) and sign-up (/register): both end in the till, or in setting up the shop. */
const $ = (id) => document.getElementById(id);
const form = $("auth-form");
const registering = form.dataset.mode === "register";
const next = safeNext(param("next"));

// Moving between sign-in and sign-up keeps the page the shopkeeper was trying to open.
if (next) {
  for (const link of document.querySelectorAll("[data-keep-next]")) {
    link.href = `${link.getAttribute("href")}?next=${encodeURIComponent(next)}`;
  }
}

async function goOn() {
  window.location.replace(next || (await homeOfSignedIn()));
}

function fail(message, input) {
  showMessage($("auth-error"), message);
  input?.focus();
}

form.addEventListener("input", () => showMessage($("auth-error"), ""));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("auth-name")?.value.trim();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  if (registering && !name) return fail("Escribe tu nombre.", $("auth-name"));
  if (!$("auth-email").checkValidity() || !email)
    return fail("Escribe un correo válido.", $("auth-email"));
  if (registering && password.length < 8)
    return fail("La contraseña necesita al menos 8 caracteres.", $("auth-password"));
  if (!password) return fail("Escribe tu contraseña.", $("auth-password"));

  try {
    await withBusy(
      $("auth-submit"),
      registering ? "Creando tu cuenta…" : "Entrando…",
      async () => {
        const { token } = await postJson(
          registering ? "/api/auth/register" : "/api/auth/login",
          registering ? { name, email, password } : { email, password },
        );
        session.start(token);
        await goOn();
      },
    );
  } catch (error) {
    fail(error.message);
  }
});

// Already signed in on this device: straight to the till.
if (session.token()) {
  // api() already ends a session the server refused; a network blip keeps it and shows the form.
  goOn().catch(() => {});
}
