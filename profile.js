const customerPreviewKey = "onesCustomerPreview";
const cartCountPreviewKey = "onesCartCountPreview";

function $(selector) {
  return document.querySelector(selector);
}

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

function profilePrice(product) {
  const saleEnd = product.saleUntil ? new Date(`${String(product.saleUntil).slice(0, 10)}T23:59:59`) : null;
  const activeSale = saleEnd && !Number.isNaN(saleEnd.getTime()) && saleEnd >= new Date() ? product.salePrice : null;
  const values = [activeSale, product.discountPrice, product.mpcPrice, product.price];
  const value = values.find((candidate) => Number(String(candidate ?? "").replace(",", ".").replace(/[^\d.]/g, "")) > 0);
  if (!value) return "Cijena na upit";
  const number = Number(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
  const label = Number.isInteger(number) ? String(number) : String(number.toFixed(2)).replace(/\.?0+$/, "");
  return `${label} KM`;
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
                ? `<img src="${escapeHtml(window.onesSafeUrl(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy" />`
                : `<span aria-hidden="true"></span>`
            }
          </span>
          <span>
            <small>${escapeHtml(product.category || "oneS")}</small>
            <strong>${escapeHtml(product.name)}</strong>
            <b>${escapeHtml(profilePrice(product))}</b>
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
              <span>Upit #${Number(order.id)}</span>
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
  try {
    localStorage.removeItem(customerPreviewKey);
    sessionStorage.setItem(customerPreviewKey, JSON.stringify({ name: user.name || "Kupac" }));
  } catch {}
  $("#profileName").textContent = user.name;
  $("#profileEmail").textContent = [user.email, user.phone].filter(Boolean).join(" · ");
  $("#profileNameInput").value = user.name || "";
  $("#profileEmailInput").value = user.email || "";
  $("#profilePhoneInput").value = user.phone || "";
}

function setupMobileNav() {
  window.onesSetupMobileNav();
}

function updateBottomCartCount(count) {
  localStorage.setItem(cartCountPreviewKey, String(count || 0));
  document.querySelectorAll(".cart-count-sync").forEach((badge) => {
    badge.textContent = String(count || 0);
    badge.hidden = !count;
  });
}

async function saveProfile() {
  try {
    const data = await api("customer-profile-update", {
      name: $("#profileNameInput").value,
      email: $("#profileEmailInput").value,
      phone: $("#profilePhoneInput").value,
      currentPassword: $("#profileEmailPasswordInput").value,
    });
    fillProfileForm(data.profile);
    $("#profileEmailPasswordInput").value = "";
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
    localStorage.removeItem(customerPreviewKey);
    sessionStorage.removeItem(customerPreviewKey);
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
    updateBottomCartCount(data.cart.count || 0);
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
$("#profileMobileLogoutBtn")?.addEventListener("click", logout);
$("#saveProfileBtn").addEventListener("click", saveProfile);
$("#savePasswordBtn").addEventListener("click", savePassword);
setupMobileNav();

initProfile();
