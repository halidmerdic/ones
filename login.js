function $(selector) {
  return document.querySelector(selector);
}

async function api(action, payload) {
  const options = payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : { cache: "no-store" };

  const response = await fetch(`api.php?action=${action}`, options);
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "API greška.");
  }

  return data;
}

function flash(message) {
  const note = document.createElement("div");
  note.className = "admin-toast";
  note.textContent = message;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2800);
}

function showProfile(user) {
  $("#profilePanel").hidden = false;
  $("#profileTitle").textContent = `Dobrodošli, ${user.name}`;
}

function redirectAfterLogin() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.href = next || "index.html";
}

async function customerLogin() {
  try {
    await api("customer-login", {
      email: $("#loginEmail").value,
      password: $("#loginPassword").value,
    });
    redirectAfterLogin();
  } catch (error) {
    flash(error.message);
  }
}

async function customerRegister() {
  try {
    await api("customer-register", {
      name: $("#registerName").value,
      email: $("#registerEmail").value,
      password: $("#registerPassword").value,
    });
    redirectAfterLogin();
  } catch (error) {
    flash(error.message);
  }
}

function submitOnEnter(fields, callback) {
  fields.forEach((selector) => {
    $(selector)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        callback();
      }
    });
  });
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

$("#customerLoginBtn").addEventListener("click", customerLogin);
$("#customerRegisterBtn").addEventListener("click", customerRegister);

submitOnEnter(["#loginEmail", "#loginPassword"], customerLogin);
submitOnEnter(["#registerName", "#registerEmail", "#registerPassword"], customerRegister);

setupPasswordToggles();

$("#customerLogoutBtn").addEventListener("click", async () => {
  try {
    await api("customer-logout", {});
    $("#profilePanel").hidden = true;
    flash("Odjavljeni ste.");
  } catch (error) {
    flash(error.message);
  }
});

async function initLogin() {
  try {
    const data = await api("customer-status");
    if (data.loggedIn && data.user) {
      redirectAfterLogin();
    }
  } catch (error) {
    flash("Otvorite stranicu preko lokalnog servera da prijava radi.");
  }
}

initLogin();

