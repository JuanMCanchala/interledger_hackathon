// Sandbox payments come back to "/?payment=<id>" or "/?mandate=<id>": send them to the sandbox page.
if (/[?&](payment|mandate)=/.test(window.location.search)) {
  window.location.replace("/sandbox" + window.location.search);
}
