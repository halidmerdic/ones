const customerPreviewKey = "onesCustomerPreview";
const cartCountPreviewKey = "onesCartCountPreview";

function $(selector) {
  return document.querySelector(selector);
}

async function api(action, payload, query) {
  return window.onesApi(action, payload, query);
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
  const price = window.onesActivePrice(product);
  return price.type === "inquiry" ? price.label : price.label + " KM";
}

let displayedFavorites = [];
function renderFavorites(products) {
  displayedFavorites = products;
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

  const rows = orders
    .map((order) => {
      const status = statusInfo(order.status);
      const itemCount = (order.items || []).reduce((total, item) => total + (Number(item.quantity) || 1), 0);
      const itemLabel = itemCount === 1 ? "1 artikal" : `${itemCount} artikala`;
      const items = (order.items || [])
        .map((item) => `<li><span>${escapeHtml(item.name)} x${Number(item.quantity) || 1}</span><strong>${escapeHtml(item.price || "0")}</strong></li>`)
        .join("");

      return `
        <details class="profile-order">
          <summary class="profile-order-summary">
            <span class="profile-order-id">
              <strong>Upit #${Number(order.id)}</strong>
              <small>${escapeHtml(status.label)}</small>
            </span>
            <time datetime="${escapeHtml(order.createdAt || "")}">${escapeHtml(formatDate(order.createdAt))}</time>
            <span class="profile-order-count">${escapeHtml(itemLabel)}</span>
            <span class="status-badge profile-status ${status.className}">${escapeHtml(order.status || "Novo")}</span>
            <span class="profile-order-toggle" aria-hidden="true"></span>
          </summary>
          <div class="profile-order-details">
            <div class="profile-status-panel">
              <p>${escapeHtml(status.text)}</p>
            </div>
            <div class="profile-order-meta">
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
          </div>
        </details>
      `;
    })
    .join("");

  list.innerHTML = `
    <div class="profile-order-list-head" aria-hidden="true">
      <span>Upit</span>
      <span>Datum</span>
      <span>Artikli</span>
      <span>Status</span>
      <span></span>
    </div>
    <div class="profile-order-list">${rows}</div>
  `;
}

function fillProfileForm(user) {
  try {
    window.onesStorage.local.removeItem(customerPreviewKey);
    window.onesStorage.session.setItem(customerPreviewKey, JSON.stringify({ name: user.name || "Kupac" }));
  } catch {}
  const initials = String(user.name || "Kupac")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "K";
  $("#profileAvatar").textContent = initials;
  $("#profileName").textContent = user.name || "Kupac";
  $("#profileEmail").textContent = [user.email, user.phone].filter(Boolean).join(" · ");
  $("#profileNameInput").value = user.name || "";
  $("#profileEmailInput").value = user.email || "";
  $("#profilePhoneInput").value = user.phone || "";
  $("#emailVerificationState").textContent = user.emailVerified ? "Email adresa je potvrđena." : "Email adresa još nije potvrđena. Potvrdite je prije slanja upita.";
  $("#sendEmailVerificationBtn").hidden = !!user.emailVerified;
  $("#pendingEmailState").textContent = user.pendingEmail ? `Čeka potvrdu: ${user.pendingEmail}. Do potvrde se prijavljujete starom adresom.` : "";
  $("#cancelEmailChangeBtn").hidden = !user.pendingEmail;
}

function setupMobileNav() {
  window.onesSetupMobileNav();
}

function updateBottomCartCount(count) {
  window.onesStorage.local.setItem(cartCountPreviewKey, String(count || 0));
  document.querySelectorAll(".cart-count-sync").forEach((badge) => {
    badge.textContent = String(count || 0);
    badge.hidden = !count;
  });
}

function setFormStatus(selector, message, state = "") {
  const status = $(selector);
  status.textContent = message;
  status.dataset.state = state;
}

function setButtonBusy(button, busy, busyLabel, defaultLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : defaultLabel;
}

async function saveProfile(event) {
  event.preventDefault();
  const form = $("#profileDetails");
  if (!form.reportValidity()) return;
  const button = $("#saveProfileBtn");
  setButtonBusy(button, true, "Spremanje...", "Sačuvaj podatke");
  setFormStatus("#profileSaveStatus", "Spremanje izmjena...");
  try {
    const data = await api("customer-profile-update", {
      name: $("#profileNameInput").value,
      email: $("#profileEmailInput").value,
      phone: $("#profilePhoneInput").value,
      currentPassword: $("#profileEmailPasswordInput").value,
    });
    fillProfileForm(data.profile);
    $("#profileEmailPasswordInput").value = "";
    const message = data.verificationRequired ? "Podaci su sačuvani. Potvrdite novu adresu putem email poruke; do tada vrijedi stara adresa." : "Izmjene su sačuvane.";
    setFormStatus("#profileSaveStatus", message, "success");
    flash(message);
  } catch (error) {
    setFormStatus("#profileSaveStatus", error.message, "error");
    flash(error.message);
  } finally {
    setButtonBusy(button, false, "Spremanje...", "Sačuvaj podatke");
  }
}

async function savePassword(event) {
  event.preventDefault();
  const form = $("#profilePasswordForm");
  if (!form.reportValidity()) return;
  const passwordError = window.onesPasswordError($("#newPasswordInput").value);
  if (passwordError) {
    setFormStatus("#profilePasswordStatus", passwordError, "error");
    $("#newPasswordInput").focus();
    return;
  }
  const button = $("#savePasswordBtn");
  setButtonBusy(button, true, "Spremanje...", "Promijeni lozinku");
  setFormStatus("#profilePasswordStatus", "Spremanje nove lozinke...");
  try {
    await api("customer-password-update", {
      currentPassword: $("#currentPasswordInput").value,
      newPassword: $("#newPasswordInput").value,
    });
    $("#currentPasswordInput").value = "";
    $("#newPasswordInput").value = "";
    setFormStatus("#profilePasswordStatus", "Lozinka je promijenjena.", "success");
    flash("Lozinka je promijenjena.");
  } catch (error) {
    setFormStatus("#profilePasswordStatus", error.message, "error");
    flash(error.message);
  } finally {
    setButtonBusy(button, false, "Spremanje...", "Promijeni lozinku");
  }
}

function editProfile() {
  const form = $("#profileDetails");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.classList.remove("profile-card-attention");
  requestAnimationFrame(() => form.classList.add("profile-card-attention"));
  setTimeout(() => {
    $("#profileNameInput").focus({ preventScroll: true });
    form.classList.remove("profile-card-attention");
  }, 450);
}

async function logout() {
  const buttons = [$("#profileLogoutBtn"), $("#profileMobileLogoutBtn")].filter(Boolean);
  if (buttons.some(button => button.disabled)) return;
  buttons.forEach(button => { button.disabled = true; });
  try {
    await window.onesLogoutCustomer();
    window.location.href = "login.html";
  } catch (error) {
    flash(error.message);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function initProfile() {
  try {
    const data = await api("customer-profile");
    fillProfileForm(data.user);
    $("#profileCartCount").textContent = data.cart.count || 0;
    updateBottomCartCount(data.cart.count || 0);
    $("#profileFavoriteCount").textContent = (data.favoriteProducts || []).length || 0;
    renderFavorites(data.favoriteProducts || []);
    window.onesProfileOrders(data, renderOrders);
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
$("#editProfileBtn").addEventListener("click", editProfile);
$("#profileDetails").addEventListener("submit", saveProfile);
$("#profilePasswordForm").addEventListener("submit", savePassword);
$("#sendEmailVerificationBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  try {
    const data = await api("customer-email-send", {});
    $("#emailVerificationStatus").textContent = data.message;
  } catch (error) { $("#emailVerificationStatus").textContent = error.message; }
  finally { button.disabled = false; }
});
$("#cancelEmailChangeBtn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  try {
    await api("customer-email-cancel", {});
    $("#pendingEmailState").textContent = "Zahtjev za promjenu emaila je poništen.";
    button.hidden = true;
  } catch (error) { $("#emailVerificationStatus").textContent = error.message; }
  finally { button.disabled = false; }
});
setupMobileNav();

initProfile();

window.addEventListener("ones-pricing-date", () => { renderFavorites(displayedFavorites); });
