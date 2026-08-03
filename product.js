let cms = null;
let product = null;
let currentCustomer = null;
let galleryImages = [];
let activeImageIndex = 0;
let inquiryReturnFocus = null;
const bottomProfileIcon = '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M4 21a8 8 0 0 1 16 0"></path></svg></span><strong>Profil</strong>';
const customerPreviewKey = "onesCustomerPreview";
const cartCountPreviewKey = "onesCartCountPreview";

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function updateCartCount(count) {
  localStorage.setItem(cartCountPreviewKey, String(count || 0));
  document.querySelectorAll(".cart-count-sync").forEach((badge) => {
    badge.textContent = String(count || 0);
    badge.hidden = !count;
  });
}

function restoreCartCountPreview() {
  const count = Number(window.__onesCartPreview || localStorage.getItem(cartCountPreviewKey) || 0);
  if (count > 0) updateCartCount(count);
}

function updateAccountLink() {
  ["#accountLink", "#mobileAccountLink", "#bottomAccountLink"]
    .map((selector) => $(selector))
    .filter(Boolean)
    .forEach((link) => {
      link.hidden = false;
      if (currentCustomer) {
        link.href = "profile.html";
        if (link.id === "bottomAccountLink") {
          link.innerHTML = bottomProfileIcon;
        } else {
          link.textContent = `Prijavljen: ${currentCustomer.name}`;
        }
        if (link.id !== "bottomAccountLink") link.classList.add("account-active");
      } else {
        link.href = "login.html";
        if (link.id === "bottomAccountLink") {
          link.innerHTML = bottomProfileIcon;
        } else {
          link.textContent = "Prijavi se";
        }
        link.classList.remove("account-active");
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

async function loadCustomerStatus() {
  try {
    const data = (await window.onesCustomerStatus?.()) || (await api("customer-status"));
    currentCustomer = data.loggedIn ? data.user : null;
    rememberCustomerPreview(currentCustomer);
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
  rememberCustomerPreview(null);
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

function setupMobileNav() {
  window.onesSetupMobileNav();
}

function contactPhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.startsWith("0") ? `387${digits.slice(1)}` : digits;
}

function inquiryUrl(channel = "whatsapp") {
  const text = encodeURIComponent(`Pozdrav, zanima me ${product.name}. Da li je dostupno i koja je cijena?`);

  if (channel === "viber") {
    return `viber://chat?number=%2B${contactPhone(cms.contact.viber)}&text=${text}`;
  }

  if (channel === "email") {
    return `mailto:${encodeURIComponent(cms.contact.email || "info@fontele.ba")}?subject=${encodeURIComponent(`oneS upit - ${product.name}`)}&body=${text}`;
  }

  return `https://wa.me/${contactPhone(cms.contact.whatsapp)}?text=${text}`;
}

function closeInquiryModal() {
  $("#inquiryModal")?.remove();
  document.body.classList.remove("modal-open");
  inquiryReturnFocus?.focus();
  inquiryReturnFocus = null;
}

function openInquiryModal() {
  if (!currentCustomer) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
    return;
  }

  closeInquiryModal();
  inquiryReturnFocus = document.activeElement;
  const modal = document.createElement("div");
  modal.className = "inquiry-modal";
  modal.id = "inquiryModal";
  modal.innerHTML = `
    <div class="inquiry-dialog" role="dialog" aria-modal="true" aria-label="Pošalji upit">
      <div class="inquiry-head">
        <div>
          <span>Pošalji upit</span>
          <h3>${escapeHtml(product.name || "oneS proizvod")}</h3>
        </div>
        <button type="button" class="inquiry-close" aria-label="Zatvori">×</button>
      </div>
      <div class="inquiry-options">
        <a href="${inquiryUrl("whatsapp")}" target="_blank" rel="noreferrer"><span>W</span><strong>WhatsApp</strong></a>
        <a href="${inquiryUrl("viber")}" data-viber-link><span>V</span><strong>Viber</strong></a>
        <a href="${inquiryUrl("email")}"><span>@</span><strong>Email</strong></a>
      </div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeInquiryModal();
  });
  modal.querySelector(".inquiry-close").addEventListener("click", closeInquiryModal);
  modal.querySelector("[data-viber-link]").addEventListener("click", () => {
    const message = `Pozdrav, zanima me ${product.name}. Da li je dostupno i koja je cijena?`;
    navigator.clipboard?.writeText(message).then(
      () => flash("Poruka za Viber je kopirana. Zalijepite je u razgovor."),
      () => {}
    );
  });
  modal.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeInquiryModal));
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  modal.querySelector(".inquiry-close").focus();
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

  if (numericPrice(product.mpcPrice) > 0) {
    return { label: formatPrice(product.mpcPrice), type: "regular" };
  }

  if (numericPrice(product.price) > 0) {
    return { label: formatPrice(product.price), type: "regular" };
  }

  return { label: "Cijena na upit", type: "inquiry" };
}

function priceHtml(product) {
  const current = activePrice(product);
  const mpc = ["sale", "discount"].includes(current.type) && numericPrice(product.mpcPrice) > 0 && formatPrice(product.mpcPrice) !== current.label ? formatPrice(product.mpcPrice) : "";
  const currentLabel = current.type === "inquiry" ? current.label : `${current.label} KM`;
  return `
    <div class="price-stack product-price">
      <strong class="${current.type === "sale" ? "sale-price" : ""}">${currentLabel}</strong>
      ${mpc ? `<span class="mpc-price">MPC: ${mpc} KM</span>` : ""}
      ${current.type === "sale" && product.saleUntil ? `<small>Akcija traje do ${formatDateOnly(product.saleUntil)}</small>` : ""}
    </div>
  `;
}

function productUrl(item) {
  return `product.html?id=${encodeURIComponent(item.id)}`;
}

function productIsPublic(item) {
  return item && item.enabled !== false;
}

function relatedProductsHtml() {
  const related = (cms.products || [])
    .filter((item) => productIsPublic(item) && item.id !== product.id && item.category === product.category)
    .slice(0, 3);

  if (!related.length) return "";

  return `
    <section class="product-long-description related-products-section">
      <div class="section-heading compact-heading">
        <div>
          <p class="eyebrow">Povezano</p>
          <h2>Slični proizvodi</h2>
        </div>
      </div>
      <div class="related-product-grid">
        ${related
          .map(
            (item) => `
              <a class="related-product-card" href="${productUrl(item)}">
                <span class="related-product-image">
                  ${
                    item.image
                      ? `<img src="${escapeHtml(window.onesSafeUrl(item.image))}" alt="${escapeHtml(item.name)}" loading="lazy" />`
                      : `<span aria-hidden="true"></span>`
                  }
                </span>
                <span>
                  <small>${escapeHtml(item.category || "oneS")}</small>
                  <strong>${escapeHtml(item.name)}</strong>
                </span>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
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
  return new URL(path || "/", window.location.href).href;
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
  const image = window.onesSafeUrl(product.image) || "assets/ones-logo.webp";

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

function thumbnailButtonsHtml(images) {
  return images
    .map((image) => {
      const index = galleryImages.indexOf(image);
      return `
        <button type="button" class="${index === activeImageIndex ? "active" : ""}" data-image="${escapeHtml(image)}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} ${index + 1}" loading="eager" decoding="async" />
        </button>
      `;
    })
    .join("");
}

function bindThumbnailButtons() {
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
    <img id="lightboxImage" src="" alt="${escapeHtml(product?.name || "Slika proizvoda")}" />
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
  const images = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])]
    .map((image) => window.onesSafeUrl(image))
    .filter(Boolean);
  galleryImages = images;
  activeImageIndex = 0;
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
            ? `<button class="main-image-button" type="button" id="mainImageButton"><img id="mainProductImage" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name)}" /></button>`
            : `<span>Nema slike proizvoda</span>`
        }
      </div>
      <div class="product-thumbs-wrap ${images.length > 6 ? "has-slider" : ""}">
        ${
          images.length > 6
            ? `<button class="thumb-slider-btn thumb-slider-prev" type="button" data-thumb-slide="-1" aria-label="Prethodne slike">‹</button>`
            : ""
        }
        <div class="product-thumbs" id="productThumbs">
          ${thumbnailButtonsHtml(images.slice(0, 8))}
        </div>
        ${
          images.length > 6
            ? `<button class="thumb-slider-btn thumb-slider-next" type="button" data-thumb-slide="1" aria-label="Sljedeće slike">›</button>`
            : ""
        }
      </div>
      ${images.length > 8 ? `<button class="btn btn-secondary gallery-more-btn" type="button" id="showAllThumbs">Prikaži sve fotografije (${images.length})</button>` : ""}
      ${images.length ? `<p class="gallery-hint">Kliknite glavnu sliku za full preview. Dvoklik na thumbnail također otvara pregled.</p>` : ""}
    </div>

    <div class="product-detail-copy">
      <p class="eyebrow">${escapeHtml(product.category)}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <div class="badge-row">
        <span class="badge red">${escapeHtml(product.status || "Dostupno")}</span>
        ${visibleBadge(product) ? `<span class="badge">${escapeHtml(visibleBadge(product))}</span>` : ""}
      </div>
      <p>${escapeHtml(product.summary || "")}</p>
      ${priceHtml(product)}
      ${product.deliveryTime ? `<p class="delivery-note"><strong>Rok isporuke:</strong> ${escapeHtml(product.deliveryTime)}</p>` : ""}
      <div class="product-actions product-detail-actions">
        <button class="btn btn-primary" type="button" id="detailAddCart">Dodaj u korpu</button>
        <button class="btn btn-secondary" type="button" id="detailInquiryBtn">Pošalji upit</button>
      </div>
      <div class="detail-specs">
        <h2>Specifikacije</h2>
        <ul class="spec-list">
          ${specs.map(([key, value]) => `<li><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></li>`).join("")}
        </ul>
      </div>
    </div>
    ${
      product.detailedDescription
        ? `
          <section class="product-long-description">
            <h2>Detaljan opis</h2>
            <div class="rich-content">${window.onesSanitizeRichHtml(product.detailedDescription)}</div>
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
                        <strong>${escapeHtml(manual.title)}</strong>
                        <span>${escapeHtml(manual.type || "PDF")} · ${escapeHtml(manual.status || "Dostupno")}</span>
                      </div>
                      <a class="btn btn-primary" href="${escapeHtml(window.onesSafeUrl(manual.file))}" target="_blank" rel="noreferrer">Preuzmi PDF</a>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>
        `
        : ""
    }
    ${relatedProductsHtml()}
  `;

  bindThumbnailButtons();
  $("#showAllThumbs")?.addEventListener("click", (event) => {
    $("#productThumbs").innerHTML = thumbnailButtonsHtml(images);
    event.currentTarget.remove();
    bindThumbnailButtons();
  });

  document.querySelectorAll("[data-thumb-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      const thumbs = $("#productThumbs");
      const direction = Number(button.dataset.thumbSlide);
      const step = thumbs ? thumbs.clientWidth : 0;
      thumbs?.scrollBy({ left: direction * step, behavior: "smooth" });
    });
  });

  $("#mainImageButton")?.addEventListener("click", () => openLightbox(Math.max(activeImageIndex, 0)));
  $("#detailAddCart").addEventListener("click", addToCart);
  $("#detailInquiryBtn").addEventListener("click", openInquiryModal);
  setupLightbox();
}

async function init() {
  try {
    setupAccountMenu();
    setupMobileNav();
    restoreCartCountPreview();
    const accountReady = loadCustomerStatus().then(loadCartCount);

    const id = new URLSearchParams(window.location.search).get("id");
    const data = await api("cms");
    cms = data.cms;
    product = cms.products.find((item) => item.id === id && productIsPublic(item));

    if (!product) {
      $("#productDetail").innerHTML = `
        <div class="login-panel profile-panel">
          <h1>Proizvod nije pronađen</h1>
          <p>Vratite se na katalog i odaberite proizvod.</p>
          <a class="btn btn-primary" href="/#proizvodi">Nazad na proizvode</a>
        </div>
      `;
      return;
    }

    await accountReady;

    applyProductSeo();
    renderProduct();
  } catch (error) {
    $("#productDetail").innerHTML = `
      <div class="login-panel profile-panel">
        <h1>Greška</h1>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

window.addEventListener("storage", async (event) => {
  if (event.key !== "onesCmsUpdatedAt" || !product?.id) return;

  try {
    const data = await api("cms");
    cms = data.cms;
    product = cms.products.find((item) => item.id === product.id && productIsPublic(item));
    if (product) renderProduct();
  } catch (error) {
    console.warn("CMS refresh failed.", error);
  }
});

init();
