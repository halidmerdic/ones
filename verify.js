(function () {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token") || "";
  const signup = params.get("kind") === "signup";
  // Keep the bearer token only in memory, out of URL history/referrers/storage.
  history.replaceState(null, "", window.location.pathname);
  const field = document.getElementById("verificationPasswordField");
  const input = document.getElementById("verificationPassword");
  const button = document.getElementById("verifyEmailBtn");
  const status = document.getElementById("verificationStatus");
  field.hidden = !signup;
  input.required = signup;
  document.getElementById("verificationLogin").hidden = signup;
  if (!/^[a-f0-9]{64}$/.test(token)) {
    status.textContent = "Link za potvrdu nije ispravan. Otvorite cijeli link iz email poruke ili zatražite novi.";
    button.disabled = true;
  }
  document.getElementById("verificationForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled) return;
    const error = signup ? window.onesPasswordError(input.value) : null;
    if (error) { status.textContent = error; input.focus(); return; }
    button.disabled = true;
    status.textContent = "Potvrđivanje...";
    try {
      await window.onesApi("customer-email-confirm", { token, password: signup ? input.value : "" });
      input.value = "";
      document.getElementById("verificationForm").hidden = true;
      document.getElementById("verificationHelp").textContent = "Email adresa je potvrđena. Profil je spreman za korištenje.";
      document.getElementById("verificationLogin").hidden = true;
      const next = document.getElementById("verificationContinue");
      next.hidden = false;
      next.focus();
    } catch (error) {
      status.textContent = error.message;
      if (error.status === 401) document.getElementById("verificationLogin").hidden = false;
    } finally { button.disabled = false; }
  });
})();
