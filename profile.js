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
  setTimeout(() => note.remove(), 2600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusInfo(status) {
  const normalized = status || "Novo";
  const map = {
    Novo: {
      label: "Upit je zaprimljen",
      text: "Primili smo vaš upit. Naš tim će provjeriti detalje i javiti se.",
      className: "red",
    },
    "U obradi": {
      label: "Provjeravamo dostupnost",
      text: "Upit je u obradi. Provjeravamo proizvod, cijenu i mogućnost isporuke.",
      className: "dark",
    },
    Kontaktiran: {
      label: "Kontaktirali smo vas",
      text: "Pokušali smo vas kontaktirati ili je komunikacija već u toku.",
      className: "dark",
    },
    Završeno: {
      label: "Upit je završen",
      text: "Upit je završen. Ako trebate još nešto, možete poslati novi upit.",
      className: "light",
    },
    Otkazano: {
      label: "Upit je otkazan",
      text: "Ovaj upit je označen kao otkazan.",
      className: "light",
    },
  };

  return map[normalized] || {
    label: normalized,
    text: "Status upita je ažuriran.",
    className: "red",
  };
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
}

function renderFavorites(products) {
  const list = $("#profileFavorites");

  if (!products.length) {
    list.innerHTML = `
      <div class="product-admin-empty">
        Još nemate omiljenih proizvoda.
      </div>
    `;
    return;
  }

  list.innerHTML = products
    .map(
      (product) => `
        <a class="profile-favorite" href="${productUrl(product)}">
          <span class="profile-favorite-image">
            ${
              product.image
                ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />`
                : `<span aria-hidden="true"></span>`
            }
          </span>
          <span>
            <small>${escapeHtml(product.category || "oneS")}</small>
            <strong>${escapeHtml(product.name)}</strong>
            <b>${escapeHtml(product.price || "0")} KM</b>
          </span>
        </a>
      `
    )
    .join("");
}

function renderOrders(orders) {
  const list = $("#profileOrders");

  if (!orders.length) {
    list.innerHTML = `
      <div class="product-admin-empty">
        Još nemate poslanih upita.
      </div>
    `;
    return;
  }

  list.innerHTML = orders
    .map((order) => {
      const status = statusInfo(order.status);
      const items = (order.items || [])
        .map((item) => `<li><span>${escapeHtml(item.name)} x${Number(item.quantity) || 1}</span><strong>${escapeHtml(item.price || "0")}</strong></li>`)
        .join("");

      return `
        <article class="profile-order">
          <div class="profile-order-head">
            <div>
              <span>Upit #${order.id}</span>
              <h3>${escapeHtml(status.label)}</h3>
            </div>
            <span class="status-badge profile-status ${status.className}">${escapeHtml(order.status || "Novo")}</span>
          </div>
          <div class="profile-status-panel">
            <p>${escapeHtml(status.text)}</p>
          </div>
          <div class="profile-order-meta">
            <div>
              <span>Datum slanja</span>
              <strong>${escapeHtml(formatDate(order.createdAt))}</strong>
            </div>
            <div>
              <span>Telefon za upit</span>
              <strong>${escapeHtml(order.phone || "-")}</strong>
            </div>
            <div>
              <span>Zadnja izmjena</span>
              <strong>${escapeHtml(formatDate(order.updatedAt))}</strong>
            </div>
          </div>
          <ul class="order-items">${items}</ul>
          ${
            order.note
              ? `<div class="profile-order-note"><span>Vaša napomena</span><p>${escapeHtml(order.note)}</p></div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function fillProfileForm(user) {
  $("#profileName").textContent = user.name;
  $("#profileEmail").textContent = [user.email, user.phone].filter(Boolean).join(" · ");
  $("#profileNameInput").value = user.name || "";
  $("#profileEmailInput").value = user.email || "";
  $("#profilePhoneInput").value = user.phone || "";
}

async function saveProfile() {
  try {
    const data = await api("customer-profile-update", {
      name: $("#profileNameInput").value,
      email: $("#profileEmailInput").value,
      phone: $("#profilePhoneInput").value,
    });
    fillProfileForm(data.profile);
    flash("Podaci profila su sačuvani.");
  } catch (error) {
    flash(error.message);
  }
}

async function savePassword() {
  try {
    await api("customer-password-update", {
      currentPassword: $("#currentPasswordInput").value,
      newPassword: $("#newPasswordInput").value,
    });
    $("#currentPasswordInput").value = "";
    $("#newPasswordInput").value = "";
    flash("Lozinka je promijenjena.");
  } catch (error) {
    flash(error.message);
  }
}

async function logout() {
  try {
    await api("customer-logout", {});
    window.location.href = "login.html";
  } catch (error) {
    flash(error.message);
  }
}

async function initProfile() {
  try {
    const data = await api("customer-profile");
    fillProfileForm(data.user);
    $("#profileCartCount").textContent = data.cart.count || 0;
    $("#profileOrderCount").textContent = data.orders.length || 0;
    $("#profileFavoriteCount").textContent = (data.favoriteProducts || []).length || 0;
    renderFavorites(data.favoriteProducts || []);
    renderOrders(data.orders || []);
  } catch (error) {
    if (error.message.includes("Prijavite se")) {
      window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
      return;
    }
    flash(error.message);
  }
}

$("#profileLogoutBtn").addEventListener("click", logout);
$("#saveProfileBtn").addEventListener("click", saveProfile);
$("#savePasswordBtn").addEventListener("click", savePassword);

initProfile();
