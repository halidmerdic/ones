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
  window.location.href = next || "profile.html";
}

$("#customerLoginBtn").addEventListener("click", async () => {
  try {
    const data = await api("customer-login", {
      email: $("#loginEmail").value,
      password: $("#loginPassword").value,
    });
    redirectAfterLogin();
  } catch (error) {
    flash(error.message);
  }
});

$("#customerRegisterBtn").addEventListener("click", async () => {
  try {
    const data = await api("customer-register", {
      name: $("#registerName").value,
      email: $("#registerEmail").value,
      password: $("#registerPassword").value,
    });
    redirectAfterLogin();
  } catch (error) {
    flash(error.message);
  }
});

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
