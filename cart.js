let cms = null;
let cart = { items: [], count: 0 };
let currentCustomer = null;

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
    throw new Error(data.message || "API greska.");
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

function numericPrice(value) {
  const number = Number(String(value ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatPrice(value) {
  const number = numericPrice(value);
  return Number.isInteger(number) ? String(number) : String(number.toFixed(2)).replace(/\.?0+$/, "");
}

function money(value) {
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

  return "0";
}

function itemTotal(item) {
  return numericPrice(priceText(item.product)) * (Number(item.quantity) || 1);
}

function cartTotal() {
  return cart.items.reduce((total, item) => total + itemTotal(item), 0);
}

function inquiryMessage() {
  if (!cart.items.length) {
    return "Pozdrav, zanima me oneS ponuda.";
  }

  const lines = cart.items.map((item) => `- ${item.product.name} x${item.quantity}`);
  return `Pozdrav, zelim poslati upit za:\n${lines.join("\n")}\n\nUkupno okvirno: ${money(cartTotal())}`;
}

function contactUrl(channel) {
  const contact = cms?.contact || { whatsapp: "38761000000", viber: "38761000000" };
  const text = encodeURIComponent(inquiryMessage());

  if (channel === "viber") {
    return `viber://chat?number=%2B${contact.viber}&text=${text}`;
  }

  return `https://wa.me/${contact.whatsapp}?text=${text}`;
}

function updateCheckoutSteps(done = false) {
  document.querySelectorAll(".checkout-steps span").forEach((step, index) => {
    step.classList.toggle("active", done ? index === 2 : index === 0 || index === 1);
  });
}

function updateAccountLink() {
  const link = $("#cartAccountLink");
  if (!link) return;

  if (currentCustomer) {
    link.href = "profile.html";
    link.textContent = `Prijavljen: ${currentCustomer.name}`;
    link.classList.add("account-active");
  } else {
    link.href = "login.html";
    link.textContent = "Prijavi se";
    link.classList.remove("account-active");
  }
}

function renderCart() {
  const submitButton = $("#submitOrderBtn");
  const successPanel = $("#orderSuccess");
  if (successPanel && !successPanel.hidden && cart.items.length) {
    successPanel.hidden = true;
  }

  if (!cart.items.length) {
    $("#cartList").innerHTML = `
      <article class="login-panel profile-panel">
        <h2>Korpa je prazna</h2>
        <p>Dodajte proizvod iz kataloga da ga sacuvate za upit.</p>
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
            <div>
              <span class="badge red">${item.product.status || "Proizvod"}</span>
              <h3>${item.product.name}</h3>
              <p>${item.product.summary || ""}</p>
              <div class="cart-price-line">
                <strong>${money(priceText(item.product))}</strong>
                <span>Ukupno: ${money(itemTotal(item))}</span>
              </div>
            </div>
            <div class="cart-controls">
              <button class="btn btn-secondary" type="button" data-qty="${item.id}" data-value="${item.quantity - 1}">-</button>
              <span>${item.quantity}</span>
              <button class="btn btn-secondary" type="button" data-qty="${item.id}" data-value="${item.quantity + 1}">+</button>
              <button class="btn btn-secondary" type="button" data-remove="${item.id}">Ukloni</button>
            </div>
          </article>
        `
      )
      .join("");
    $("#cartSummaryText").innerHTML = `
      <strong>${cart.count} proizvoda</strong>
      <span>Procjena ukupno: ${money(cartTotal())}</span>
    `;
    if (submitButton) submitButton.disabled = false;
  }

  $("#cartWhatsapp").href = contactUrl("whatsapp");
  $("#cartViber").href = contactUrl("viber");

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
        ? "Unijeli ste drugi broj telefona. Zelite li promijeniti broj telefona na svom profilu?"
        : "Zelite li sacuvati ovaj broj telefona na svom profilu za iduci put?"
    );
  }

  try {
    const data = await api("order-submit", {
      phone,
      note: $("#orderNote")?.value || "",
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
        <h2>Broj upita: #${data.order.id}</h2>
        <p>Upit je sacuvan u CMS-u. Kontaktirat cemo vas na broj ${phone} za potvrdu dostupnosti i sljedece korake.</p>
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

loadCart();
