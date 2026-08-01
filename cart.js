let cms = null;
let cart = { items: [], count: 0 };
let currentCustomer = null;
const bottomProfileIcon = '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M4 21a8 8 0 0 1 16 0"></path></svg></span><strong>Profil</strong>';
const customerPreviewKey = "onesCustomerPreview";
const cartCountPreviewKey = "onesCartCountPreview";

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return window.onesEscapeHtml(value);
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

function numericPrice(value) {
  const number = Number(String(value ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatPrice(value) {
  const number = numericPrice(value);
  return Number.isInteger(number) ? String(number) : String(number.toFixed(2)).replace(/\.?0+$/, "");
}

function money(value) {
  if (String(value).toLowerCase().includes("upit")) return "Cijena na upit";
  return `${formatPrice(value)} KM`;
}

function isDateActive(dateValue) {
  if (!dateValue) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateValue);
  end.setHours(23, 59, 59, 999);
  return end >= today;
}

function priceText(product) {
  if (numericPrice(product.salePrice) > 0 && product.saleUntil && isDateActive(product.saleUntil)) {
    return formatPrice(product.salePrice);
  }

  if (numericPrice(product.discountPrice) > 0) {
    return formatPrice(product.discountPrice);
  }

  if (numericPrice(product.mpcPrice) > 0) {
    return formatPrice(product.mpcPrice);
  }

  if (numericPrice(product.price) > 0) {
    return formatPrice(product.price);
  }

  return "Cijena na upit";
}

function itemTotal(item) {
  return numericPrice(priceText(item.product)) * (Number(item.quantity) || 1);
}

function cartTotal() {
  return cart.items.reduce((total, item) => total + itemTotal(item), 0);
}

function cartHasInquiryPrice() {
  return cart.items.some((item) => priceText(item.product) === "Cijena na upit");
}

function inquiryMessage() {
  if (!cart.items.length) {
    return "Pozdrav, zanima me oneS ponuda.";
  }

  const lines = cart.items.map((item) => `- ${item.product.name} x${item.quantity}`);
  const total = cartHasInquiryPrice() ? "cijena se potvrđuje putem upita" : money(cartTotal());
  return `Pozdrav, želim poslati upit za:\n${lines.join("\n")}\n\nUkupno okvirno: ${total}`;
}

function contactUrl(channel) {
  const contact = cms?.contact || { whatsapp: "062455779", viber: "062455779", email: "info@fontele.ba" };
  const text = encodeURIComponent(inquiryMessage());
  const phone = (value) => {
    const digits = String(value || "").replace(/[^\d]/g, "");
    return digits.startsWith("0") ? `387${digits.slice(1)}` : digits;
  };

  if (channel === "viber") {
    return `viber://chat?number=%2B${phone(contact.viber)}&text=${text}`;
  }

  if (channel === "email") {
    return `mailto:${encodeURIComponent(contact.email || "info@fontele.ba")}?subject=${encodeURIComponent("oneS upit iz korpe")}&body=${text}`;
  }

  return `https://wa.me/${phone(contact.whatsapp)}?text=${text}`;
}

function updateCheckoutSteps(done = false) {
  return done;
}

function updateAccountLink() {
  const link = $("#cartAccountLink");
  const bottomLink = $("#bottomAccountLink");

  [link, bottomLink].filter(Boolean).forEach((item) => {
    item.hidden = false;
    if (currentCustomer) {
      item.href = "profile.html";
      if (item.id === "bottomAccountLink") {
        item.innerHTML = bottomProfileIcon;
      } else {
        item.textContent = `Prijavljen: ${currentCustomer.name}`;
      }
      if (item.id !== "bottomAccountLink") item.classList.add("account-active");
    } else {
      item.href = "login.html";
      if (item.id === "bottomAccountLink") {
        item.innerHTML = bottomProfileIcon;
      } else {
        item.textContent = "Prijavi se";
      }
      item.classList.remove("account-active");
    }
  });
}

function rememberCustomerPreview(user) {
  if (user) {
    localStorage.setItem(customerPreviewKey, JSON.stringify({ name: user.name || "Kupac", email: user.email || "" }));
  } else {
    localStorage.removeItem(customerPreviewKey);
  }
}

function restoreCustomerPreview() {
  try {
    const cached = JSON.parse(localStorage.getItem(customerPreviewKey) || "null");
    if (!cached?.name) return;
    currentCustomer = cached;
    updateAccountLink();
  } catch {}
}

function updateBottomCartCount() {
  localStorage.setItem(cartCountPreviewKey, String(cart.count || 0));
  document.querySelectorAll(".cart-count-sync").forEach((badge) => {
    badge.textContent = String(cart.count || 0);
    badge.hidden = !cart.count;
  });
}

function restoreCartCountPreview() {
  const count = Number(localStorage.getItem(cartCountPreviewKey) || 0);
  if (!count) return;
  document.querySelectorAll(".cart-count-sync").forEach((badge) => {
    badge.textContent = String(count);
    badge.hidden = false;
  });
}

function setupMobileNav() {
  window.onesSetupMobileNav();
}

function renderCart() {
  updateBottomCartCount();
  const submitButton = $("#submitOrderBtn");
  const successPanel = $("#orderSuccess");
  if (successPanel && !successPanel.hidden && cart.items.length) {
    successPanel.hidden = true;
  }

  if (!cart.items.length) {
    $("#cartList").innerHTML = `
      <article class="login-panel profile-panel">
        <h2>Korpa je prazna</h2>
        <p>Dodajte proizvod iz kataloga da ga sačuvate za upit.</p>
        <a class="btn btn-primary" href="index.html#proizvodi">Pogledaj proizvode</a>
      </article>
    `;
    $("#cartSummaryText").textContent = "Trenutno nema proizvoda u korpi.";
    if (submitButton) submitButton.disabled = true;
  } else {
    $("#cartList").innerHTML = cart.items
      .map(
        (item) => `
          <article class="cart-item">
            <div class="cart-item-main">
              <div class="cart-item-info">
                <span class="badge red">${escapeHtml(item.product.status || "Proizvod")}</span>
                <h3>${escapeHtml(item.product.name)}</h3>
                <p>${escapeHtml(item.product.summary || "")}</p>
              </div>
              <div class="cart-price-line">
                <span>Cijena: <strong>${money(priceText(item.product))}</strong></span>
                <span>Ukupno: <strong>${priceText(item.product) === "Cijena na upit" ? "Cijena na upit" : money(itemTotal(item))}</strong></span>
              </div>
            </div>
            <div class="cart-controls">
              <div class="cart-quantity-group" aria-label="Kolicina proizvoda">
                <button class="btn btn-secondary" type="button" data-qty="${Number(item.id)}" data-value="${Number(item.quantity) - 1}" aria-label="Smanji kolicinu">-</button>
                <span>${Number(item.quantity) || 1}</span>
                <button class="btn btn-secondary" type="button" data-qty="${Number(item.id)}" data-value="${Number(item.quantity) + 1}" aria-label="Povecaj kolicinu">+</button>
              </div>
              <button class="btn btn-secondary" type="button" data-remove="${Number(item.id)}">Ukloni</button>
            </div>
          </article>
        `
      )
      .join("");
    $("#cartSummaryText").innerHTML = `
      <strong>${cart.count} proizvoda</strong>
      <span>Procjena ukupno: ${cartHasInquiryPrice() ? "Cijena na upit" : money(cartTotal())}</span>
    `;
    if (submitButton) submitButton.disabled = false;
  }

  $("#cartWhatsapp").href = contactUrl("whatsapp");
  $("#cartViber").href = contactUrl("viber");
  $("#cartEmail").href = contactUrl("email");
  $("#cartViber").onclick = () => {
    navigator.clipboard?.writeText(inquiryMessage()).then(
      () => flash("Poruka za Viber je kopirana. Zalijepite je u razgovor."),
      () => {}
    );
  };

  document.querySelectorAll("[data-qty]").forEach((button) => {
    button.addEventListener("click", () => updateQuantity(button.dataset.qty, button.dataset.value));
  });

  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeItem(button.dataset.remove));
  });
}

async function submitOrder() {
  if (!cart.items.length) {
    flash("Korpa je prazna.");
    return;
  }

  const phone = ($("#orderPhone")?.value || "").trim();
  if (!phone) {
    flash("Unesite broj telefona prije slanja upita.");
    $("#orderPhone")?.focus();
    return;
  }

  const savedPhone = (currentCustomer?.phone || "").trim();
  let updateProfilePhone = false;
  if (phone && phone !== savedPhone) {
    updateProfilePhone = confirm(
      savedPhone
        ? "Unijeli ste drugi broj telefona. Želite li promijeniti broj telefona na svom profilu?"
        : "Želite li sačuvati ovaj broj telefona na svom profilu za idući put?"
    );
  }

  try {
    const data = await api("order-submit", {
      phone,
      note: $("#orderNote")?.value || "",
      website: $("#orderWebsite")?.value || "",
      updateProfilePhone,
    });
    cart = data.cart;
    if (updateProfilePhone && $("#orderPhone") && $("#orderPhone").value) {
      currentCustomer = { ...(currentCustomer || {}), phone: $("#orderPhone").value };
    }
    if ($("#orderNote")) $("#orderNote").value = "";
    if ($("#orderSuccess")) {
      $("#orderSuccess").hidden = false;
      $("#orderSuccess").innerHTML = `
        <span class="badge red">Upit poslan</span>
        <h2>Broj upita: #${Number(data.order.id)}</h2>
        <p>Upit je sačuvan u CMS-u. Kontaktirat ćemo vas na broj ${escapeHtml(phone)} za potvrdu dostupnosti i sljedeće korake.</p>
        <a class="btn btn-secondary" href="profile.html">Pogledaj profil</a>
      `;
    }
    updateCheckoutSteps(true);
    flash(`Upit je poslan u CMS. Broj upita: ${data.order.id}`);
    renderCart();
  } catch (error) {
    flash(error.message);
  }
}

async function loadCart() {
  try {
    const cmsData = await api("cms");
    cms = cmsData.cms;
    const profileData = await api("customer-profile");
    currentCustomer = profileData.user;
    rememberCustomerPreview(currentCustomer);
    updateAccountLink();
    const data = await api("cart");
    cart = data.cart;
    if ($("#orderPhone") && currentCustomer?.phone) {
      $("#orderPhone").value = currentCustomer.phone;
    }
    updateCheckoutSteps(false);
    renderCart();
  } catch (error) {
    if (error.message.includes("Prijavite se")) {
      currentCustomer = null;
      rememberCustomerPreview(null);
      localStorage.setItem(cartCountPreviewKey, "0");
      updateAccountLink();
      window.location.href = "login.html";
      return;
    }
    flash(error.message);
  }
}

async function updateQuantity(itemId, quantity) {
  try {
    const data = await api("cart-update", { itemId: Number(itemId), quantity: Number(quantity) });
    cart = data.cart;
    updateCheckoutSteps(false);
    renderCart();
  } catch (error) {
    flash(error.message);
  }
}

async function removeItem(itemId) {
  try {
    const data = await api("cart-remove", { itemId: Number(itemId) });
    cart = data.cart;
    updateCheckoutSteps(false);
    renderCart();
  } catch (error) {
    flash(error.message);
  }
}

$("#submitOrderBtn")?.addEventListener("click", submitOrder);
setupMobileNav();
restoreCustomerPreview();
restoreCartCountPreview();

loadCart();
