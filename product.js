let cms = null;
let product = null;
let currentCustomer = null;
let galleryImages = [];
let activeImageIndex = 0;

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

function updateCartCount(count) {
  const badge = $("#cartCount");
  if (badge) {
    badge.textContent = String(count || 0);
    badge.hidden = !count;
  }
}

function updateAccountLink() {
  const link = $("#accountLink");
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

async function loadCustomerStatus() {
  try {
    const data = await api("customer-status");
    currentCustomer = data.loggedIn ? data.user : null;
  } catch {
    currentCustomer = null;
  }
  updateAccountLink();
}

async function loadCartCount() {
  if (!currentCustomer) {
    updateCartCount(0);
    return;
  }

  try {
    const data = await api("cart");
    updateCartCount(data.cart.count);
  } catch {
    updateCartCount(0);
  }
}

async function logoutCustomer() {
  try {
    await api("customer-logout", {});
  } catch (error) {
    console.warn("Logout failed.", error);
  }

  currentCustomer = null;
  updateAccountLink();
  updateCartCount(0);
  $("#accountMenu").hidden = true;
  flash("Odjavljeni ste.");
}

function setupAccountMenu() {
  const accountLink = $("#accountLink");
  const menu = $("#accountMenu");
  const logoutBtn = $("#logoutBtn");

  accountLink?.addEventListener("click", (event) => {
    if (!currentCustomer) return;
    event.preventDefault();
    menu.hidden = !menu.hidden;
  });

  logoutBtn?.addEventListener("click", logoutCustomer);

  document.addEventListener("click", (event) => {
    if (!currentCustomer || menu.hidden) return;
    if (menu.contains(event.target) || accountLink.contains(event.target)) return;
    menu.hidden = true;
  });
}

function inquiryUrl(channel = "whatsapp") {
  const text = encodeURIComponent(`Pozdrav, zanima me ${product.name}. Da li je dostupno i koja je cijena?`);

  if (channel === "viber") {
    return `viber://chat?number=%2B${cms.contact.viber}&text=${text}`;
  }

  return `https://wa.me/${cms.contact.whatsapp}?text=${text}`;
}

function visibleBadge(product) {
  const productBadge = product.badge && product.badge !== "-" && isDateActive(product.badgeUntil) ? product.badge : "";
  const category = (cms.categories || []).find((item) => item.name === product.category);
  const categoryBadge = category?.badge && category.badge !== "-" && isDateActive(category.badgeUntil) ? category.badge : "";
  const badgeName = productBadge || categoryBadge;
  if (!badgeName) return "";

  const badge = (cms.badges || []).find((item) => item.name === badgeName);
  if (badge && badge.enabled === false) return "";
  return badgeName;
}

function isDateActive(dateValue) {
  if (!dateValue) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${dateValue}T23:59:59`);
  return end >= today;
}

function numericPrice(value) {
  const number = Number(String(value ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatPrice(value) {
  const number = numericPrice(value);
  return Number.isInteger(number) ? String(number) : String(number.toFixed(2)).replace(/\.?0+$/, "");
}

function formatDateOnly(value) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function activePrice(product) {
  if (numericPrice(product.salePrice) > 0 && product.saleUntil && isDateActive(product.saleUntil)) {
    return { label: formatPrice(product.salePrice), type: "sale" };
  }

  if (numericPrice(product.discountPrice) > 0) {
    return { label: formatPrice(product.discountPrice), type: "discount" };
  }

  return { label: "0", type: "regular" };
}

function priceHtml(product) {
  const current = activePrice(product);
  const mpc = numericPrice(product.mpcPrice) > 0 && formatPrice(product.mpcPrice) !== current.label ? formatPrice(product.mpcPrice) : "";
  return `
    <div class="price-stack product-price">
      <strong class="${current.type === "sale" ? "sale-price" : ""}">${current.label}</strong>
      ${mpc ? `<span class="mpc-price">MPC: ${mpc}</span>` : ""}
      ${current.type === "sale" && product.saleUntil ? `<small>Akcija traje do ${formatDateOnly(product.saleUntil)}</small>` : ""}
    </div>
  `;
}

function setMeta(selector, content) {
  let meta = document.querySelector(selector);
  if (!meta) {
    meta = document.createElement("meta");
    const match = selector.match(/\[(name|property)="([^"]+)"\]/);
    if (match) {
      meta.setAttribute(match[1], match[2]);
    }
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content || "");
}

function absoluteUrl(path) {
  return new URL(path || "index.html", window.location.href).href;
}

function setCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
}

function applyProductSeo() {
  const title = product.seoTitle || `${product.name} | oneS`;
  const description = product.seoDescription || product.summary || `${product.name} u oneS katalogu.`;
  const canonical = absoluteUrl(`product.html?id=${encodeURIComponent(product.id)}`);
  const image = product.image || "assets/ones-logo.webp";

  document.title = title;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', canonical);
  setMeta('meta[property="og:image"]', absoluteUrl(image));
  setCanonical(canonical);
}

function openLightbox(index) {
  if (!galleryImages.length) return;
  activeImageIndex = index;
  renderLightboxImage();
  $("#imageLightbox").hidden = false;
  document.body.classList.add("no-scroll");
}

function closeLightbox() {
  $("#imageLightbox").hidden = true;
  document.body.classList.remove("no-scroll");
}

function moveLightbox(direction) {
  if (!galleryImages.length) return;
  activeImageIndex = (activeImageIndex + direction + galleryImages.length) % galleryImages.length;
  renderLightboxImage();
}

function renderLightboxImage() {
  const image = galleryImages[activeImageIndex];
  $("#lightboxImage").src = image;
  $("#lightboxCounter").textContent = `${activeImageIndex + 1} / ${galleryImages.length}`;
}

function setupLightbox() {
  if ($("#imageLightbox")) return;

  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.id = "imageLightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Zatvori pregled">×</button>
    <button class="lightbox-arrow lightbox-prev" type="button" aria-label="Prethodna slika">‹</button>
    <img id="lightboxImage" src="" alt="${product?.name || "Slika proizvoda"}" />
    <button class="lightbox-arrow lightbox-next" type="button" aria-label="Sljedeća slika">›</button>
    <div class="lightbox-counter" id="lightboxCounter"></div>
  `;
  document.body.appendChild(lightbox);

  lightbox.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  lightbox.querySelector(".lightbox-prev").addEventListener("click", () => moveLightbox(-1));
  lightbox.querySelector(".lightbox-next").addEventListener("click", () => moveLightbox(1));
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") moveLightbox(-1);
    if (event.key === "ArrowRight") moveLightbox(1);
  });
}

async function addToCart() {
  try {
    await api("cart-add", { productId: product.id, quantity: 1 });
    await loadCartCount();
    flash("Proizvod je dodan u korpu.");
  } catch (error) {
    if (error.message.includes("Prijavite se")) {
      window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
      return;
    }
    flash(error.message);
  }
}

function renderProduct() {
  const images = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(Boolean);
  galleryImages = images;
  const mainImage = images[0] || "";
  const specs = Object.entries(product.specs || {});
  const relatedManuals = (cms.manuals || []).filter((manual) => {
    const isPublic = (manual.visibility || "Javno") === "Javno";
    const matchesProduct = manual.relatedProductId && manual.relatedProductId === product.id;
    const matchesCategory = !manual.relatedProductId && manual.category && manual.category === product.category;
    return isPublic && manual.file && (matchesProduct || matchesCategory);
  });

  $("#productDetail").innerHTML = `
    <div class="product-gallery">
      <div class="product-main-image ${mainImage ? "" : "empty"}">
        ${
          mainImage
            ? `<button class="main-image-button" type="button" id="mainImageButton"><img id="mainProductImage" src="${mainImage}" alt="${product.name}" /></button>`
            : `<span>Nema slike proizvoda</span>`
        }
      </div>
      <div class="product-thumbs">
        ${images
          .map(
            (image, index) => `
              <button type="button" class="${index === 0 ? "active" : ""}" data-image="${image}">
                <img src="${image}" alt="${product.name} ${index + 1}" />
              </button>
            `
          )
          .join("")}
      </div>
      ${images.length ? `<p class="gallery-hint">Kliknite glavnu sliku za full preview. Dvoklik na thumbnail također otvara pregled.</p>` : ""}
    </div>

    <div class="product-detail-copy">
      <p class="eyebrow">${product.category}</p>
      <h1>${product.name}</h1>
      <div class="badge-row">
        <span class="badge red">${product.status || "Dostupno"}</span>
        ${visibleBadge(product) ? `<span class="badge">${visibleBadge(product)}</span>` : ""}
      </div>
      <p>${product.summary || ""}</p>
      ${priceHtml(product)}
      ${product.deliveryTime ? `<p class="delivery-note"><strong>Rok isporuke:</strong> ${product.deliveryTime}</p>` : ""}
      <div class="product-actions">
        <button class="btn btn-primary" type="button" id="detailAddCart">Dodaj u korpu</button>
        <a class="btn btn-secondary" href="${inquiryUrl("whatsapp")}" target="_blank" rel="noreferrer">WhatsApp upit</a>
        <a class="btn btn-secondary" href="${inquiryUrl("viber")}">Viber upit</a>
      </div>
      <div class="detail-specs">
        <h2>Specifikacije</h2>
        <ul class="spec-list">
          ${specs.map(([key, value]) => `<li><span>${key}</span><strong>${value}</strong></li>`).join("")}
        </ul>
      </div>
    </div>
    ${
      product.detailedDescription
        ? `
          <section class="product-long-description">
            <h2>Detaljan opis</h2>
            <div class="rich-content">${product.detailedDescription}</div>
          </section>
        `
        : ""
    }
    ${
      relatedManuals.length
        ? `
          <section class="product-long-description">
            <h2>Uputstva i dokumenti</h2>
            <div class="product-manual-list">
              ${relatedManuals
                .map(
                  (manual) => `
                    <article class="product-manual-item">
                      <div>
                        <strong>${manual.title}</strong>
                        <span>${manual.type || "PDF"} · ${manual.status || "Dostupno"}</span>
                      </div>
                      <a class="btn btn-primary" href="${manual.file}" target="_blank" rel="noreferrer">Preuzmi PDF</a>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>
        `
        : ""
    }
  `;

  document.querySelectorAll("[data-image]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-image]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $("#mainProductImage").src = button.dataset.image;
      activeImageIndex = galleryImages.indexOf(button.dataset.image);
    });

    button.addEventListener("dblclick", () => {
      openLightbox(galleryImages.indexOf(button.dataset.image));
    });
  });

  $("#mainImageButton")?.addEventListener("click", () => openLightbox(Math.max(activeImageIndex, 0)));
  $("#detailAddCart").addEventListener("click", addToCart);
  setupLightbox();
}

async function init() {
  try {
    setupAccountMenu();
    await loadCustomerStatus();
    await loadCartCount();

    const id = new URLSearchParams(window.location.search).get("id");
    const data = await api("cms");
    cms = data.cms;
    product = cms.products.find((item) => item.id === id);

    if (!product) {
      $("#productDetail").innerHTML = `
        <div class="login-panel profile-panel">
          <h1>Proizvod nije pronađen</h1>
          <p>Vratite se na katalog i odaberite proizvod.</p>
          <a class="btn btn-primary" href="index.html#proizvodi">Nazad na proizvode</a>
        </div>
      `;
      return;
    }

    applyProductSeo();
    renderProduct();
  } catch (error) {
    $("#productDetail").innerHTML = `
      <div class="login-panel profile-panel">
        <h1>Greška</h1>
        <p>${error.message}</p>
      </div>
    `;
  }
}

window.addEventListener("storage", async (event) => {
  if (event.key !== "onesCmsUpdatedAt" || !product?.id) return;

  try {
    const data = await api("cms");
    cms = data.cms;
    product = cms.products.find((item) => item.id === product.id);
    if (product) renderProduct();
  } catch (error) {
    console.warn("CMS refresh failed.", error);
  }
});

init();
