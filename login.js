function $(selector) {
  return document.querySelector(selector);
}

const customerPreviewKey = "onesCustomerPreview";

async function api(action, payload) {
  return window.onesApi(action, payload);
}

function flash(message) {
  const note = document.createElement("div");
  note.className = "admin-toast";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");
  note.textContent = message;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2800);
}

function showProfile(user) {
  $("#profilePanel").hidden = false;
  $("#profileTitle").textContent = `Dobrodošli, ${user.name}`;
}

function rememberCustomerPreview(user) {
  try {
    localStorage.removeItem(customerPreviewKey);
    if (user) {
      sessionStorage.setItem(customerPreviewKey, JSON.stringify({ name: user.name || "Kupac" }));
    } else {
      sessionStorage.removeItem(customerPreviewKey);
    }
  } catch {}
}

function redirectAfterLogin() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) {
    window.location.href = "/";
    return;
  }

  try {
    const target = new URL(next, window.location.href);
    window.location.href = target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/";
  } catch (error) {
    window.location.href = "/";
  }
}

async function customerLogin() {
  const button = $("#customerLoginBtn");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const data = await api("customer-login", {
      email: $("#loginEmail").value,
      password: $("#loginPassword").value,
    });
    const user = data.user || { name: $("#loginEmail").value, email: $("#loginEmail").value };
    rememberCustomerPreview(user);
    redirectAfterLogin();
  } catch (error) {
    flash(error.message);
  } finally {
    button.disabled = false;
  }
}

async function customerRegister() {
  if (!$("#registerConsent").checked) {
    flash("Potvrdite privatnost i uslove korištenja prije registracije.");
    $("#registerConsent").focus();
    return;
  }

  const button = $("#customerRegisterBtn");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const data = await api("customer-register", {
      name: $("#registerName").value,
      email: $("#registerEmail").value,
      acceptedPrivacy: $("#registerConsent").checked,
      website: $("#registerWebsite")?.value || "",
    });
    $("#registerStatus").textContent = data.message;
    button.textContent = "Pošalji ponovo";
  } catch (error) {
    $("#registerStatus").textContent = error.message;
    flash(error.message);
  } finally {
    button.disabled = false;
  }
}

function setupPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Vidi" : "Sakrij";
      button.setAttribute("aria-label", visible ? "Prikazi lozinku" : "Sakrij lozinku");
    });
  });
}

$("#customerLoginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  customerLogin();
});
$("#customerRegisterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  customerRegister();
});

setupPasswordToggles();

$("#customerLogoutBtn").addEventListener("click", async () => {
  try {
    await api("customer-logout", {});
    rememberCustomerPreview(null);
    $("#profilePanel").hidden = true;
    flash("Odjavljeni ste.");
  } catch (error) {
    flash(error.message);
  }
});

async function initLogin() {
  try {
    const data = (await window.onesCustomerStatus?.()) || (await api("customer-status"));
    if (data.loggedIn && data.user) {
      redirectAfterLogin();
    }
  } catch (error) {
    flash("Otvorite stranicu preko lokalnog servera da prijava radi.");
  }
}

initLogin();

