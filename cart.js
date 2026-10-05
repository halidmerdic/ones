let cms = null;
let cart = { items: [], count: 0 };
let currentCustomer = null;
let cartMutationPending = false;
let orderSubmitting = false;
let cartReady = false;
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
  return (window.onesPriceCents(value) ?? 0) / 100;
}

function formatPrice(value) {
  return window.onesFormatPrice(value);
}

function money(value) {
  if (typeof value === "bigint") return `${window.onesFormatCents(value)} KM`;
  if (String(value).toLowerCase().includes("upit")) return "Cijena na upit";
  return `${formatPrice(value)} KM`;
}

function isDateActive(dateValue) {
  return window.onesDateActive(dateValue);
}

function priceText(product) {
  return window.onesActivePrice(product).label;
}

function itemTotal(item) {
  return BigInt(window.onesPriceCents(priceText(item.product)) ?? 0) * BigInt(item.quantity);
}

function cartTotal() {
  return cart.items.reduce((total, item) => total + itemTotal(item), 0n);
}

function cartHasInquiryPrice() {
  return cart.items.some((item) => priceText(item.product) === "Cijena na upit");
}

function cartHasUnavailableProducts() {
  return cart.items.some((item) => item.product?.enabled === false);
}

function setCartMutationPending(pending) {
  cartMutationPending = pending;
  updateCartControls();
}

function updateCartControls() {
  const busy = cartMutationPending || orderSubmitting;
  document.querySelectorAll("[data-qty], [data-remove]").forEach((button) => {
    button.disabled = busy || !cartReady;
  });
  const submitButton = $("#submitOrderBtn");
  if (submitButton) submitButton.disabled = busy || !cartReady || !cart.items.length || cartHasUnavailableProducts();
  ["#orderPhone", "#orderNote"].forEach((selector) => {
    const input = $(selector);
    if (input) input.disabled = orderSubmitting;
  });
}

function handleCartError(error) {
  if (error.code === "CART_CONFLICT") {
    if (error.cart) { cart = error.cart; renderCart(); }
    else { cartReady = false; updateCartControls(); }
    flash(error.message);
    return;
  }
  if (error.status === 401) {
    cartReady = false;
    currentCustomer = null;
    rememberCustomerPreview(null);
    try { localStorage.setItem(cartCountPreviewKey, "0"); } catch {}
    updateAccountLink();
    updateCartControls();
    window.location.href = window.onesLoginUrl();
    return;
  }
  flash(error.message);
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

  if (channel === "viber") {
    return window.onesPhoneUrl(contact.viber, "viber", inquiryMessage());
  }

  if (channel === "email") {
    return `mailto:${encodeURIComponent(contact.email || "info@fontele.ba")}?subject=${encodeURIComponent("oneS upit iz korpe")}&body=${text}`;
  }

  return window.onesPhoneUrl(contact.whatsapp, "whatsapp", inquiryMessage());
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
      item.href = window.onesLoginUrl();
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
  try {
    localStorage.removeItem(customerPreviewKey);
    if (user) {
      sessionStorage.setItem(customerPreviewKey, JSON.stringify({ name: user.name || "Kupac" }));
    } else {
      sessionStorage.removeItem(customerPreviewKey);
    }
  } catch {}
}

function restoreCustomerPreview() {
  try {
    localStorage.removeItem(customerPreviewKey);
    const cached = JSON.parse(sessionStorage.getItem(customerPreviewKey) || "null");
    if (!cached?.name) return;
    currentCustomer = cached;
    updateAccountLink();
  } catch {}
}

function updateBottomCartCount() {
  try { localStorage.setItem(cartCountPreviewKey, String(cart.count || 0)); } catch {}
  document.querySelectorAll(".cart-count-sync").forEach((badge) => {
    badge.textContent = String(cart.count || 0);
    badge.hidden = !cart.count;
  });
}

function restoreCartCountPreview() {
  let count = 0;
  try { count = Number(localStorage.getItem(cartCountPreviewKey) || 0); } catch {}
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
  const successPanel = $("#orderSuccess");
  if (successPanel && !successPanel.hidden && cart.items.length) {
    successPanel.hidden = true;
  }

  if (!cart.items.length) {
    $("#cartList").innerHTML = `
      <article class="login-panel profile-panel">
        <h2>Korpa je prazna</h2>
        <p>Dodajte proizvod iz kataloga da ga sačuvate za upit.</p>
        <a class="btn btn-primary" href="/#proizvodi">Pogledaj proizvode</a>
      </article>
    `;
    $("#cartSummaryText").textContent = "Trenutno nema proizvoda u korpi.";
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
    $("#cartSummaryText").innerHTML = cartHasUnavailableProducts()
      ? `<strong>Jedan proizvod više nije dostupan</strong><span>Uklonite ga iz korpe prije slanja upita.</span>`
      : `<strong>${cart.count} proizvoda</strong><span>Procjena ukupno: ${cartHasInquiryPrice() ? "Cijena na upit" : money(cartTotal())}</span>`;
  }

  window.onesSetContactLink($("#cartWhatsapp"), contactUrl("whatsapp"));
  window.onesSetContactLink($("#cartViber"), contactUrl("viber"));
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
  updateCartControls();
}

async function submitOrder() {
  if (orderSubmitting || cartMutationPending || !cartReady) return;
  if (!cart.items.length) {
    flash("Korpa je prazna.");
    return;
  }
  if (cartHasUnavailableProducts()) {
    flash("Uklonite nedostupne proizvode prije slanja upita.");
    return;
  }

  const phone = window.onesPhone($("#orderPhone")?.value || "");
  if (!phone) {
    flash("Unesite ispravan telefon, npr. 061 123 456 ili +387 61 123 456.");
    $("#orderPhone")?.focus();
    return;
  }

  const savedPhone = window.onesPhone(currentCustomer?.phone || "");
  let updateProfilePhone = false;
  if (phone && phone !== savedPhone) {
    updateProfilePhone = confirm(
      savedPhone
        ? "Unijeli ste drugi broj telefona. Želite li promijeniti broj telefona na svom profilu?"
        : "Želite li sačuvati ovaj broj telefona na svom profilu za idući put?"
    );
  }

  const submitButton = $("#submitOrderBtn");
  const originalLabel = submitButton?.textContent || "Pošalji upit";
  orderSubmitting = true;
  updateCartControls();
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Šaljem upit...";
  }
  try {
    const data = await api("order-submit", {
      cartId: cart.cartId,
      cartRevision: cart.revision,
      phone,
      note: $("#orderNote")?.value || "",
      website: $("#orderWebsite")?.value || "",
      updateProfilePhone,
    });
    cart = data.cart;
    if (updateProfilePhone) {
      currentCustomer = { ...(currentCustomer || {}), phone };
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
    if (!error.status) {
      // The request may have committed before its response was lost. Never retry automatically.
      try {
        const latest = await api("cart");
        cart = latest.cart;
        renderCart();
      } catch (refreshError) {
        if (refreshError.status === 401) { handleCartError(refreshError); return; }
      }
      flash("Slanje nije potvrđeno. Provjerite upite na profilu prije ponovnog pokušaja.");
    } else {
      handleCartError(error);
    }
  } finally {
    orderSubmitting = false;
    if (submitButton) submitButton.textContent = originalLabel;
    updateCartControls();
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
    cartReady = true;
    if ($("#orderPhone") && currentCustomer?.phone) {
      $("#orderPhone").value = currentCustomer.phone;
    }
    updateCheckoutSteps(false);
    renderCart();
  } catch (error) {
    handleCartError(error);
  }
}

async function updateQuantity(itemId, quantity) {
  if (cartMutationPending || orderSubmitting || !cartReady) return;
  setCartMutationPending(true);
  try {
    const data = await api("cart-update", { cartId: cart.cartId, cartRevision: cart.revision, itemId: Number(itemId), quantity: Number(quantity) });
    cart = data.cart;
    updateCheckoutSteps(false);
    renderCart();
  } catch (error) {
    handleCartError(error);
  } finally {
    setCartMutationPending(false);
  }
}

async function removeItem(itemId) {
  if (cartMutationPending || orderSubmitting || !cartReady) return;
  setCartMutationPending(true);
  try {
    const data = await api("cart-remove", { cartId: cart.cartId, cartRevision: cart.revision, itemId: Number(itemId) });
    cart = data.cart;
    updateCheckoutSteps(false);
    renderCart();
  } catch (error) {
    handleCartError(error);
  } finally {
    setCartMutationPending(false);
  }
}

$("#submitOrderBtn")?.addEventListener("click", submitOrder);
updateCartControls();
setupMobileNav();
restoreCustomerPreview();
restoreCartCountPreview();

loadCart();

window.addEventListener("ones-pricing-date", () => { if (cartReady) renderCart(); });
