let cms = {
  contact: {
    whatsapp: "062455779",
    viber: "062455779",
    email: "info@fontele.ba",
    defaultMessage: "Pozdrav, zanima me oneS proizvod.",
  },
  sections: {
    hero: true,
    trust: true,
    categories: true,
    categoryShowcase: false,
    products: true,
    comingSoon: true,
    comingSoonShowcase: false,
    comparison: true,
    service: true,
    parts: true,
    manuals: true,
    delivery: true,
    locations: true,
    blog: true,
    faq: true,
    contact: true,
    footer: true,
  },
  settings: {
    productGridColumns: 4,
  },
  categories: [
    {
      name: "Električni romobili",
      text: "oneS F3 modeli za gradsku vožnju, svakodnevne relacije i praktično kretanje.",
    },
    {
      name: "Rezervni dijelovi",
      text: "Dijelovi i dodaci za servisnu podršku. Ponuda stiže uskoro.",
    },
    {
      name: "Proizvodi uskoro",
      text: "Najave novih kategorija i artikala koji dolaze u oneS katalog.",
    },
  ],
  products: [
    {
      id: "scooter-f3",
      name: "oneS F3 električni romobil",
      category: "Električni romobili",
      status: "Dostupno",
      badge: "Popularno",
      tone: "red",
      specs: {
        Domet: "do 30 km",
        Brzina: "do 25 km/h",
        Baterija: "36 V",
        Garancija: "preko prodavnice",
      },
      summary: "Praktičan gradski romobil za svakodnevne relacije, posao i kratke vožnje.",
    },
  ],
  comingSoon: [
    {
      name: "Rezervni dijelovi za romobile",
      text: "Gume, punjači, kočioni dijelovi i drugi servisni dodaci biće prikazani kao posebna ponuda.",
    },
  ],
  parts: [
    {
      name: "Punjači za romobile",
      text: "U pripremi za servisnu i dodatnu prodaju.",
    },
    {
      name: "Gume i potrošni dijelovi",
      text: "Planirano za oneS električne romobile.",
    },
  ],
  manuals: [
    {
      title: "oneS F3 električni romobil",
      type: "PDF manual",
      status: "Dodati dokument",
    },
  ],
  locations: [
    {
      name: "oneS partner Sarajevo",
      address: "Adresa prodavnice se dodaje u CMS",
      hours: "Pon - Sub, radno vrijeme dodati",
    },
    {
      name: "oneS partner Mostar",
      address: "Adresa prodavnice se dodaje u CMS",
      hours: "Pon - Sub, radno vrijeme dodati",
    },
    {
      name: "Online upit",
      address: "WhatsApp i Viber podrška za dostupnost",
      hours: "Odgovor u radnom vremenu",
    },
  ],
  blogs: [
    {
      title: "Kako odabrati električni romobil za gradsku vožnju",
      text: "Savjeti o dometu, brzini, bateriji, težini i održavanju.",
      tag: "Romobili",
      enabled: true,
    },
  ],
  faq: [
    {
      q: "Da li mogu kupiti direktno na stranici?",
      a: "Trenutno ne. Stranica radi kao katalog, a narudžbe i dostupnost se potvrđuju putem WhatsAppa, Vibera ili prodavnice.",
    },
    {
      q: "Kako se potvrđuje cijena proizvoda?",
      a: "Cijena se potvrđuje prilikom upita, jer zavisi od dostupnosti, prodavnice i eventualnih promocija.",
    },
    {
      q: "Gdje se dobija garancija?",
      a: "Garancija se dobija u prodavnici uz račun i prateću dokumentaciju proizvoda.",
    },
    {
      q: "Da li će stranica imati engleski jezik?",
      a: "Prva verzija je na bosanskom jeziku, a engleska verzija je planirana kasnije.",
    },
    {
      q: "Da li rezervni dijelovi postoje u ponudi?",
      a: "Stranica za rezervne dijelove je pripremljena, a artikli će biti označeni kao uskoro dok ponuda ne bude spremna.",
    },
  ],
};

async function loadCmsFromDatabase() {
  try {
    const data = await api("cms");
    if (data.ok && data.cms) {
      cms = {
        ...cms,
        ...data.cms,
        contact: { ...cms.contact, ...(data.cms.contact || {}) },
        sections: { ...cms.sections, ...(data.cms.sections || {}) },
        settings: { ...cms.settings, ...(data.cms.settings || {}) },
      };
      return true;
    }
  } catch (error) {
    console.warn("Database CMS could not be loaded.", error);
  }
  return false;
}

let activeCategory = "Sve";
let cartCount = 0;
let currentCustomer = null;
let currentFavorites = new Set();
let inquiryReturnFocus = null;
let manualSearch = "";
let manualCategory = "Sve";
let manualType = "Sve";
const bottomProfileIcon = '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M4 21a8 8 0 0 1 16 0"></path></svg></span><strong>Profil</strong>';
const customerPreviewKey = "onesCustomerPreview";
const cartCountPreviewKey = "onesCartCountPreview";

function qs(selector) {
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

function nonInteractiveRichHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = window.onesSanitizeRichHtml(value);
  template.content.querySelectorAll("a").forEach((link) => link.replaceWith(...link.childNodes));
  return template.innerHTML;
}

function moneyText(product) {
  const price = activePrice(product);
  return price.type === "inquiry" ? price.label : `${price.label} KM`;
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

function isDateActive(dateValue) {
  if (!dateValue) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${dateValue}T23:59:59`);
  return end >= today;
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
    <div class="price-stack">
      <strong class="${current.type === "sale" ? "sale-price" : ""}">${currentLabel}</strong>
      ${mpc ? `<span class="mpc-price">MPC: ${mpc} KM</span>` : ""}
      ${current.type === "sale" && product.saleUntil ? `<small>Akcija traje do ${formatDateOnly(product.saleUntil)}</small>` : ""}
    </div>
  `;
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
}

function publicProducts() {
  const enabledCategories = new Set(
    (cms.categories || [])
      .filter((category) => category.enabled !== false && String(category.name || "").trim())
      .map((category) => category.name)
  );

  return (cms.products || []).filter(
    (product) => product.enabled !== false && enabledCategories.has(product.category)
  );
}

function catalogKeywords() {
  const ignored = new Set(["ones", "elektricni", "električni", "proizvod", "proizvodi"]);
  const keywords = new Set(
    publicProducts()
      .flatMap((product) => `${product.name || ""} ${product.category || ""}`.toLowerCase().split(/[^\p{L}\p{N}]+/u))
      .filter((word) => word.length >= 2 && !ignored.has(word))
  );
  if ([...keywords].some((word) => word.includes("romobil") || word.includes("skuter"))) {
    keywords.add("romobil");
    keywords.add("skuter");
  }
  return keywords;
}

function matchesActiveCatalog(...values) {
  const haystack = values.join(" ").toLowerCase();
  const keywords = catalogKeywords();
  return !keywords.size || [...keywords].some((keyword) => haystack.includes(keyword));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blogUrl(post, index) {
  const id = post.id || slugify(post.title || `blog-${index + 1}`) || `blog-${index + 1}`;
  return `blog.html?id=${encodeURIComponent(id)}`;
}

function inquiryMessage(productName) {
  return productName
    ? `Pozdrav, zanima me ${productName}. Da li je dostupno i koja je cijena?`
    : cms.contact.defaultMessage;
}

function contactPhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.startsWith("0") ? `387${digits.slice(1)}` : digits;
}

function inquiryUrl(productName, channel = "whatsapp") {
  const message = inquiryMessage(productName);
  const text = encodeURIComponent(message);

  if (channel === "viber") {
    return `viber://chat?number=%2B${contactPhone(cms.contact.viber)}&text=${text}`;
  }

  if (channel === "email") {
    return `mailto:${encodeURIComponent(cms.contact.email || "info@fontele.ba")}?subject=${encodeURIComponent(`oneS upit${productName ? ` - ${productName}` : ""}`)}&body=${text}`;
  }

  return `https://wa.me/${contactPhone(cms.contact.whatsapp)}?text=${text}`;
}

const sectionMap = {
  hero: ["#pocetna"],
  trust: [".trust-strip"],
  categoryShowcase: ["#kategorije"],
  products: ["#proizvodi"],
  comingSoonShowcase: ["#uskoro"],
  comparison: ["#usporedba"],
  service: ["#servis"],
  parts: ["#rezervni-dijelovi"],
  manuals: ["#manuali"],
  delivery: ["#dostava"],
  locations: ["#lokacije"],
  blog: ["#blog"],
  faq: ["#podrska"],
  contact: ["#kontakt"],
  footer: [".site-footer"],
};

function sectionEnabled(key) {
  return cms.sections?.[key] !== false;
}

function applySectionVisibility() {
  Object.entries(sectionMap).forEach(([key, selectors]) => {
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.hidden = !sectionEnabled(key);
      });
    });
  });

  const navTargets = {
    products: ["#proizvodi"],
    comparison: ["#usporedba"],
    service: ["#servis"],
    parts: ["#rezervni-dijelovi"],
    locations: ["#lokacije"],
    manuals: ["#manuali"],
    faq: ["#podrska"],
    delivery: ["#dostava"],
    blog: ["#blog"],
    contact: ["#kontakt"],
  };

  Object.entries(navTargets).forEach(([key, hrefs]) => {
    document.querySelectorAll(`[data-section-key="${key}"]`).forEach((link) => {
      link.hidden = !sectionEnabled(key);
    });

    hrefs.forEach((href) => {
      document.querySelectorAll(`a[href="${href}"], a[href="/${href}"], a[href="index.html${href}"]`).forEach((link) => {
        link.hidden = !sectionEnabled(key);
      });
    });
  });
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
  cartCount = count || 0;
  localStorage.setItem(cartCountPreviewKey, String(cartCount));
  const badges = document.querySelectorAll(".cart-count-sync");
  badges.forEach((badge) => {
    badge.textContent = String(cartCount);
    badge.hidden = cartCount === 0;
  });
}

function restoreCartCountPreview() {
  const count = Number(window.__onesCartPreview || localStorage.getItem(cartCountPreviewKey) || 0);
  if (count > 0) updateCartCount(count);
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

function updateAccountLinks() {
  const links = ["#accountLink", "#footerAccountLink", "#mobileAccountLink", "#bottomAccountLink"]
    .map((selector) => qs(selector))
    .filter(Boolean);

  links.forEach((link) => {
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
  try {
    localStorage.removeItem(customerPreviewKey);
    if (user) {
      sessionStorage.setItem(customerPreviewKey, JSON.stringify({ name: user.name || "Kupac" }));
    } else {
      sessionStorage.removeItem(customerPreviewKey);
    }
  } catch {}
}

async function logoutCustomer() {
  try {
    await api("customer-logout", {});
  } catch (error) {
    console.warn("Logout failed.", error);
  }

  currentCustomer = null;
  rememberCustomerPreview(null);
  currentFavorites = new Set();
  updateAccountLinks();
  updateCartCount(0);
  if (sectionEnabled("products")) renderProducts();
  const menu = qs("#accountMenu");
  if (menu) menu.hidden = true;
  flash("Odjavljeni ste.");
}

function setupAccountMenu() {
  const accountLink = qs("#accountLink");
  const footerAccountLink = qs("#footerAccountLink");
  const mobileAccountLink = qs("#mobileAccountLink");
  const menu = qs("#accountMenu");
  const logoutBtn = qs("#logoutBtn");

  accountLink?.addEventListener("click", (event) => {
    if (!currentCustomer) return;
    event.preventDefault();
    menu.hidden = !menu.hidden;
  });

  [footerAccountLink, mobileAccountLink].forEach((link) => {
    link?.addEventListener("click", (event) => {
      if (!currentCustomer) return;
      link.href = "profile.html";
    });
  });

  logoutBtn?.addEventListener("click", logoutCustomer);

  document.addEventListener("click", (event) => {
    if (!currentCustomer || menu.hidden) return;
    if (menu.contains(event.target) || accountLink.contains(event.target)) return;
    menu.hidden = true;
  });
}

async function loadCustomerStatus() {
  try {
    const data = (await window.onesCustomerStatus?.()) || (await api("customer-status"));
    currentCustomer = data.loggedIn ? data.user : null;
    rememberCustomerPreview(currentCustomer);
    currentFavorites = new Set(Array.isArray(data.favorites) ? data.favorites : []);
  } catch {
    currentCustomer = null;
    currentFavorites = new Set();
  }
  updateAccountLinks();
}

async function addToCart(productId, button) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const data = await api("cart-add", { productId, quantity: 1 });
    updateCartCount(data.cart.count);
    flash("Proizvod je dodan u korpu.");
  } catch (error) {
    if (error.message.includes("Prijavite se")) {
      window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
      return;
    }
    flash(error.message);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

async function toggleFavorite(productId, button) {
  if (!currentCustomer) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
    return;
  }

  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const data = await api("favorite-toggle", { productId });
    currentFavorites = new Set(data.favorites || []);
    renderProducts();
    flash(data.favorited ? "Proizvod je dodan u favorite." : "Proizvod je uklonjen iz favorita.");
  } catch (error) {
    flash(error.message);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function closeInquiryModal() {
  qs("#inquiryModal")?.remove();
  document.body.classList.remove("modal-open");
  inquiryReturnFocus?.focus();
  inquiryReturnFocus = null;
}

function trapModalFocus(event, modal) {
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openInquiryModal(productName) {
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
          <h3>${escapeHtml(productName || "oneS proizvod")}</h3>
        </div>
        <button type="button" class="inquiry-close" aria-label="Zatvori">×</button>
      </div>
      <div class="inquiry-options">
        <a href="${inquiryUrl(productName, "whatsapp")}" target="_blank" rel="noreferrer"><span>W</span><strong>WhatsApp</strong></a>
        <a href="${inquiryUrl(productName, "viber")}" data-viber-link><span>V</span><strong>Viber</strong></a>
        <a href="${inquiryUrl(productName, "email")}"><span>@</span><strong>Email</strong></a>
      </div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeInquiryModal();
  });
  modal.addEventListener("keydown", (event) => trapModalFocus(event, modal));
  modal.querySelector(".inquiry-close").addEventListener("click", closeInquiryModal);
  modal.querySelector("[data-viber-link]").addEventListener("click", () => {
    navigator.clipboard?.writeText(inquiryMessage(productName)).then(
      () => flash("Poruka za Viber je kopirana. Zalijepite je u razgovor."),
      () => {}
    );
  });
  modal.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeInquiryModal));
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  modal.querySelector(".inquiry-close").focus();
}

function renderCategories() {
  const categoryGrid = qs("#categoryGrid");
  if (!categoryGrid) return;

  const usedCategories = new Set(publicProducts().map((product) => product.category).filter(Boolean));
  categoryGrid.innerHTML = (cms.categories || [])
    .filter((item) => item.enabled !== false && usedCategories.has(item.name))
    .map(
      (item) => `
        <article class="category-card">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.text)}</span>
        </article>
      `
    )
    .join("");
}

function renderFilters() {
  const filters = qs("#filters");

  const categories = ["Sve", ...new Set(publicProducts().map((product) => product.category).filter(Boolean))];
  if (!categories.includes(activeCategory)) {
    activeCategory = "Sve";
  }

  filters.innerHTML = categories
    .map(
      (category) => `
        <button class="filter-button ${category === activeCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
          ${escapeHtml(category)}
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      renderProducts();
    });
  });
}

function renderProducts() {
  const products = publicProducts();
  const grid = qs("#productGrid");
  if (!grid) return;

  const visible =
    activeCategory === "Sve"
      ? products
      : products.filter((product) => product.category === activeCategory);

  const gridColumns = Number(cms.settings?.productGridColumns) === 3 ? 3 : 4;
  grid.dataset.columns = String(gridColumns);
  grid.innerHTML = visible
    .map((product) => {
      const favoriteActive = currentFavorites.has(product.id);
      const url = productUrl(product);
      return `
        <article class="product-card">
          <a class="card-open-link" href="${url}" aria-label="Otvori proizvod ${escapeHtml(product.name)}"></a>
          <div class="product-visual ${product.tone === "red" ? "red" : "light"}">
            <div>
              <span>${escapeHtml(product.category)}</span>
              <h3>${escapeHtml(product.name)}</h3>
            </div>
            ${
              product.image
                ? `<img class="product-card-image" src="${escapeHtml(window.onesSafeUrl(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy" />`
                : `<div class="product-shape" aria-hidden="true"></div>`
            }
          </div>
          <div class="product-body">
            <div class="badge-row">
              <span class="badge red">${escapeHtml(product.status || "Dostupno")}</span>
              ${visibleBadge(product) ? `<span class="badge">${escapeHtml(visibleBadge(product))}</span>` : ""}
            </div>
            <p>${escapeHtml(product.summary)}</p>
            ${priceHtml(product)}
            ${product.deliveryTime ? `<p class="delivery-note"><strong>Rok isporuke:</strong> ${escapeHtml(product.deliveryTime)}</p>` : ""}
            <ul class="spec-list product-card-specs">
              ${Object.entries(product.specs || {})
                .slice(0, 5)
                .map(([key, value]) => `<li><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></li>`)
                .join("")}
            </ul>
            <div class="product-actions">
              <button class="btn btn-primary" type="button" data-inquiry-product="${escapeHtml(product.name)}">Pošalji upit</button>
              <button class="btn btn-secondary" type="button" data-add-cart="${escapeHtml(product.id)}">Dodaj u korpu</button>
              <button class="favorite-btn ${favoriteActive ? "active" : ""}" type="button" data-favorite="${escapeHtml(product.id)}" aria-label="${favoriteActive ? "Ukloni iz favorita" : "Dodaj u favorite"}" aria-pressed="${favoriteActive}">
                <span aria-hidden="true">${favoriteActive ? "♥" : "♡"}</span>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-add-cart]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.addCart, button));
  });
  document.querySelectorAll("[data-inquiry-product]").forEach((button) => {
    button.addEventListener("click", () => openInquiryModal(button.dataset.inquiryProduct));
  });
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favorite, button));
  });
}
function renderComingSoon() {
  const comingGrid = qs("#comingGrid");
  if (!comingGrid) return;

  comingGrid.innerHTML = (cms.comingSoon || [])
    .filter((item) => item.enabled !== false)
    .map(
      (item) => `
        <article class="coming-card">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.text)}</p>
          <button class="btn btn-secondary" type="button" data-coming-inquiry="${escapeHtml(item.name)}">Pitaj za dolazak</button>
        </article>
      `
    )
    .join("");

  comingGrid.querySelectorAll("[data-coming-inquiry]").forEach((button) => {
    button.addEventListener("click", () => openInquiryModal(button.dataset.comingInquiry));
  });
}

function renderParts() {
  qs("#partsStrip").innerHTML = (cms.parts || [])
    .filter((item) => item.enabled !== false && matchesActiveCatalog(item.name, item.text))
    .map(
      (item) => `
        <article class="part-card">
          <span class="badge red">Uskoro</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.text)}</p>
        </article>
      `
    )
    .join("");
}

function renderManuals() {
  const activeProductIds = new Set(publicProducts().map((product) => product.id));
  const activeCategories = new Set(publicProducts().map((product) => product.category));
  const publicManuals = (cms.manuals || []).filter((manual) => {
    if (manual.enabled === false || (manual.visibility || "Javno") !== "Javno") return false;
    if (manual.relatedProductId) return activeProductIds.has(manual.relatedProductId);
    if (manual.category) return activeCategories.has(manual.category);
    return matchesActiveCatalog(manual.title, manual.type);
  });
  const categories = ["Sve", ...new Set(publicManuals.map((manual) => manual.category).filter(Boolean))];
  const types = ["Sve", ...new Set(publicManuals.map((manual) => manual.type).filter(Boolean))];

  qs("#manualList").innerHTML = `
    <div class="manual-controls">
      <input id="manualSearch" type="search" aria-label="Pretraži manuale" placeholder="Pretraži uputstva..." value="${escapeHtml(manualSearch)}" />
      <select id="manualCategory" aria-label="Kategorija manuala">
        ${categories.map((category) => `<option value="${escapeHtml(category)}" ${category === manualCategory ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
      </select>
      <select id="manualType" aria-label="Tip manuala">
        ${types.map((type) => `<option value="${escapeHtml(type)}" ${type === manualType ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
      </select>
    </div>
    <div class="manual-results" id="manualResults" aria-live="polite"></div>
  `;

  const renderManualResults = () => {
    const filteredManuals = publicManuals.filter((manual) => {
      const searchTarget = `${manual.title || ""} ${manual.type || ""} ${manual.status || ""}`.toLowerCase();
      const matchesSearch = searchTarget.includes(manualSearch.toLowerCase());
      const matchesCategory = manualCategory === "Sve" || manual.category === manualCategory;
      const matchesType = manualType === "Sve" || manual.type === manualType;
      return matchesSearch && matchesCategory && matchesType;
    });

    qs("#manualResults").innerHTML = filteredManuals.length
      ? filteredManuals
          .map(
            (manual) => `
              <article class="manual-item">
                <div>
                  <h3>${escapeHtml(manual.title)}</h3>
                  <p>${escapeHtml(manual.type || "PDF")} · ${escapeHtml(manual.category || "Sve kategorije")} · ${escapeHtml(manual.status)}</p>
                </div>
                ${
                  manual.file
                    ? `<a class="btn btn-primary" href="${escapeHtml(window.onesSafeUrl(manual.file))}" target="_blank" rel="noreferrer">Preuzmi PDF</a>`
                    : `<a class="btn btn-secondary" href="#kontakt">Zatraži manual</a>`
                }
              </article>
            `
          )
          .join("")
      : `<article class="manual-item"><div><h3>Nema rezultata</h3><p>Promijenite pretragu ili filter.</p></div></article>`;
  };

  renderManualResults();

  qs("#manualSearch").addEventListener("input", (event) => {
    manualSearch = event.target.value;
    renderManualResults();
  });
  qs("#manualCategory").addEventListener("change", (event) => {
    manualCategory = event.target.value;
    renderManualResults();
  });
  qs("#manualType").addEventListener("change", (event) => {
    manualType = event.target.value;
    renderManualResults();
  });
}

function renderLocations() {
  qs("#locationGrid").innerHTML = (cms.locations || [])
    .filter((location) => location.enabled !== false)
    .map(
      (location) => `
        <article class="location-card">
          <h3>${escapeHtml(location.name)}</h3>
          <p>${escapeHtml(location.address)}</p>
          <p>${escapeHtml(location.hours)}</p>
          <a class="btn btn-secondary" href="#kontakt">Kontakt</a>
        </article>
      `
    )
    .join("");
}

function renderBlogs() {
  qs("#blogGrid").innerHTML = (cms.blogs || [])
    .map((post, index) => ({ post, index }))
    .filter(({ post }) => post.enabled !== false && matchesActiveCatalog(post.title, post.tag, post.text))
    .map(
      ({ post, index }) => `
        <a class="blog-card" href="${blogUrl(post, index)}" aria-label="Otvori blog ${escapeHtml(post.title)}">
          ${
            post.image
              ? `<div class="blog-card-image"><img src="${escapeHtml(window.onesSafeUrl(post.image))}" alt="${escapeHtml(post.title)}" loading="lazy" /></div>`
              : `<div class="blog-card-image empty"><span>oneS blog</span></div>`
          }
          <div class="blog-card-copy">
            <span class="badge red">${escapeHtml(post.tag || "Blog")}</span>
            <h3>${escapeHtml(post.title)}</h3>
            <div class="rich-content blog-content">${nonInteractiveRichHtml(post.text)}</div>
          </div>
        </a>
      `
    )
    .join("");
}

function renderFaq() {
  qs("#faqList").innerHTML = (cms.faq || [])
    .filter((item) => item.enabled !== false)
    .map(
      (item, index) => `
        <article class="faq-item" data-faq-card="${index}">
          <button class="faq-button" id="faq-question-${index}" type="button" aria-expanded="${index === 0}" aria-controls="faq-answer-${index}" data-faq="${index}">
            <span>${escapeHtml(item.q)}</span>
            <strong aria-hidden="true">${index === 0 ? "-" : "+"}</strong>
          </button>
          <div class="faq-panel" id="faq-answer-${index}" role="region" aria-labelledby="faq-question-${index}" ${index === 0 ? "" : "hidden"}>${escapeHtml(item.a)}</div>
        </article>
      `
    )
    .join("");

  document.querySelectorAll("[data-faq-card]").forEach((card) => {
    card.addEventListener("click", () => {
      const button = card.querySelector("[data-faq]");
      const panel = button.nextElementSibling;
      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      button.querySelector("strong").textContent = isOpen ? "+" : "-";
      panel.hidden = isOpen;
    });
  });
}

function setupComparison() {
  const products = publicProducts();
  const categoryCounts = products.reduce((counts, product) => {
    counts.set(product.category, (counts.get(product.category) || 0) + 1);
    return counts;
  }, new Map());
  const comparableProducts = products.filter((product) => (categoryCounts.get(product.category) || 0) > 1);
  const comparisonSection = qs("#usporedba");
  const comparisonLinks = document.querySelectorAll('a[href="#usporedba"], a[href="/#usporedba"], a[href="index.html#usporedba"]');
  const available = sectionEnabled("comparison") && comparableProducts.length > 1;

  if (comparisonSection) comparisonSection.hidden = !available;
  comparisonLinks.forEach((link) => {
    link.hidden = !available;
  });
  if (!available) return;

  const options = comparableProducts
    .map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.category)} - ${escapeHtml(product.name)}</option>`)
    .join("");
  qs("#compareA").innerHTML = options;
  updateCompareBOptions();

  qs("#compareA").onchange = () => {
    updateCompareBOptions();
    renderComparison();
  };
  qs("#compareB").onchange = renderComparison;
  renderComparison();
}

function updateCompareBOptions() {
  const products = publicProducts();
  const first = products.find((product) => product.id === qs("#compareA").value) || products[0];
  if (!first) return;

  const sameCategoryProducts = products.filter((product) => product.category === first.category);
  const secondChoices =
    sameCategoryProducts.length > 1
      ? sameCategoryProducts.filter((product) => product.id !== first.id)
      : sameCategoryProducts;
  const previousValue = qs("#compareB").value;

  qs("#compareB").innerHTML = secondChoices
    .map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`)
    .join("");

  if (secondChoices.some((product) => product.id === previousValue)) {
    qs("#compareB").value = previousValue;
  } else {
    qs("#compareB").selectedIndex = 0;
  }
}

function renderComparison() {
  const products = publicProducts();
  const first = products.find((product) => product.id === qs("#compareA").value);
  const second = products.find((product) => product.id === qs("#compareB").value);
  if (!first || !second) return;
  if (first.category !== second.category) {
    updateCompareBOptions();
    return renderComparison();
  }
  const keys = [...new Set([...Object.keys(first.specs || {}), ...Object.keys(second.specs || {})])];

  qs("#compareTable").innerHTML = `
    <thead>
      <tr>
        <th>Karakteristika</th>
        <th>${escapeHtml(first.name)}</th>
        <th>${escapeHtml(second.name)}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Kategorija</td>
        <td>${escapeHtml(first.category)}</td>
        <td>${escapeHtml(second.category)}</td>
      </tr>
      <tr>
        <td>Cijena</td>
        <td>${escapeHtml(moneyText(first))}</td>
        <td>${escapeHtml(moneyText(second))}</td>
      </tr>
      <tr>
        <td>Status</td>
        <td>${escapeHtml(first.status)}</td>
        <td>${escapeHtml(second.status)}</td>
      </tr>
      ${keys
        .map(
          (key) => `
          <tr>
            <td>${escapeHtml(key)}</td>
            <td>${escapeHtml((first.specs || {})[key] || "-")}</td>
            <td>${escapeHtml((second.specs || {})[key] || "-")}</td>
          </tr>
        `
        )
        .join("")}
    </tbody>
  `;
}

function setupContactLinks() {
  const requireContactLogin = (event) => {
    if (currentCustomer) return;
    event.preventDefault();
    window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
  };

  const whatsappBottom = qs("#whatsappBottom");
  if (whatsappBottom) {
    whatsappBottom.href = inquiryUrl();
    whatsappBottom.addEventListener("click", requireContactLogin);
  }

  const viberBottom = qs("#viberBottom");
  if (viberBottom) {
    viberBottom.href = inquiryUrl("", "viber");
    viberBottom.addEventListener("click", requireContactLogin);
  }
}

function setupMobileNav() {
  window.onesSetupMobileNav();
  setupBottomNavScrollSpy();
}

function setupBottomNavScrollSpy() {
  const nav = qs(".bottom-mobile-nav");
  if (!nav || nav.dataset.scrollSpyReady === "true") return;

  const links = [...nav.querySelectorAll("a")];
  const normalizePath = (path) => path.replace(/\/index\.html$/i, "/");
  const currentPath = normalizePath(window.location.pathname);
  const sectionLinks = links
    .map((link) => {
      const url = new URL(link.getAttribute("href"), window.location.href);
      const targetId = url.hash.slice(1) || link.dataset.section || "";
      const target = normalizePath(url.pathname) === currentPath && targetId
        ? document.getElementById(targetId)
        : null;
      return target ? { link, target } : null;
    })
    .filter(Boolean);

  if (!sectionLinks.length) return;
  nav.dataset.scrollSpyReady = "true";

  const setActiveLink = (activeLink) => {
    links.forEach((link) => {
      const isActive = link === activeLink;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const updateActiveLink = () => {
    const headerHeight = qs(".site-header")?.getBoundingClientRect().height || 0;
    const activationLine = headerHeight + 16;
    let active = sectionLinks[0];

    sectionLinks.forEach((item) => {
      if (!item.target.hidden && item.target.getBoundingClientRect().top <= activationLine) {
        active = item;
      }
    });

    setActiveLink(active.link);
  };

  let updateFrame = 0;
  const scheduleUpdate = () => {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      updateActiveLink();
    });
  };

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("hashchange", scheduleUpdate);
  window.addEventListener("pageshow", scheduleUpdate);
  updateActiveLink();
}

function restoreHashScroll() {
  const scheduledHash = window.location.hash;
  const targetId = window.location.hash.slice(1);
  if (!targetId) return;

  const target = document.getElementById(targetId);
  if (!target || target.hidden) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (window.location.hash === scheduledHash) {
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
  });
}

function setupTrustStripScroller() {
  const strip = qs(".trust-strip");
  const track = qs(".trust-track");
  if (!strip || !track || strip.dataset.scrollerReady === "true") return;

  strip.dataset.scrollerReady = "true";
  const mobileQuery = window.matchMedia("(max-width: 640px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frameId = 0;
  let lastTime = 0;
  let segmentWidth = 0;
  let position = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPosition = 0;
  let lastPointerX = 0;
  let lastPointerTime = 0;
  let dragVelocity = 0;
  let pausedUntil = 0;
  let activePointerId = null;
  let isDragging = false;
  let gestureDirection = "idle";
  let viewportWidth = Math.round(window.innerWidth);

  const ensureLoopSegments = () => {
    const sourceGroup = track.querySelector(".trust-group");
    if (!sourceGroup) return;

    while (track.querySelectorAll(".trust-group").length < 3) {
      const clone = sourceGroup.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.dataset.trustClone = "true";
      track.appendChild(clone);
    }
  };

  const removeLoopSegments = () => {
    track.querySelectorAll('[data-trust-clone="true"]').forEach((clone) => clone.remove());
  };

  const measureSegment = () => {
    const groups = track.querySelectorAll(".trust-group");
    segmentWidth = groups.length > 1 ? groups[1].offsetLeft - groups[0].offsetLeft : 0;
  };

  const normalizePosition = () => {
    if (!segmentWidth) return;
    while (position >= segmentWidth * 2) position -= segmentWidth;
    while (position < segmentWidth) position += segmentWidth;
  };

  const renderPosition = () => {
    track.style.transform = `translate3d(${-position}px, 0, 0)`;
  };

  const stop = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    lastTime = 0;
  };

  const step = (time) => {
    if (!mobileQuery.matches) {
      stop();
      return;
    }

    const delta = lastTime ? Math.min(time - lastTime, 40) : 16;
    if (!isDragging && segmentWidth) {
      if (Math.abs(dragVelocity) > 0.005) {
        position += dragVelocity * delta;
        dragVelocity *= Math.pow(0.92, delta / 16.67);
        if (Math.abs(dragVelocity) <= 0.005) dragVelocity = 0;
      } else if (time > pausedUntil && !reducedMotionQuery.matches) {
        position += delta * 0.045;
      }

      normalizePosition();
      renderPosition();
    }

    lastTime = time;
    frameId = requestAnimationFrame(step);
  };

  const start = () => {
    const previousPhase = segmentWidth ? (position - segmentWidth) / segmentWidth : 0;
    stop();
    if (mobileQuery.matches) {
      ensureLoopSegments();
      frameId = requestAnimationFrame(() => {
        measureSegment();
        if (segmentWidth) {
          position = segmentWidth * (1 + Math.max(0, Math.min(previousPhase, 1)));
          normalizePosition();
          renderPosition();
        }
        frameId = requestAnimationFrame(step);
      });
    } else {
      removeLoopSegments();
      segmentWidth = 0;
      position = 0;
      dragVelocity = 0;
      activePointerId = null;
      isDragging = false;
      gestureDirection = "idle";
      track.style.transform = "";
      strip.classList.remove("is-dragging");
    }
  };

  const beginDrag = (event) => {
    if (!mobileQuery.matches || (event.pointerType === "mouse" && event.button !== 0)) return;

    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartPosition = position;
    lastPointerX = event.clientX;
    lastPointerTime = performance.now();
    dragVelocity = 0;
    gestureDirection = "pending";
  };

  const moveDrag = (event) => {
    if (event.pointerId !== activePointerId || gestureDirection === "vertical") return;

    const totalX = event.clientX - dragStartX;
    const totalY = event.clientY - dragStartY;

    if (gestureDirection === "pending") {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 10) return;

      if (Math.abs(totalY) >= Math.abs(totalX) * 0.85) {
        gestureDirection = "vertical";
        dragVelocity = 0;
        return;
      }

      gestureDirection = "horizontal";
      isDragging = true;
      dragStartX = event.clientX;
      dragStartPosition = position;
      lastPointerX = event.clientX;
      lastPointerTime = performance.now();
      pausedUntil = performance.now() + 1400;
      strip.classList.add("is-dragging");
      strip.setPointerCapture?.(event.pointerId);
      return;
    }

    const now = performance.now();
    const elapsed = Math.max(now - lastPointerTime, 1);
    const pointerDelta = event.clientX - lastPointerX;
    position = dragStartPosition - totalX;
    const instantVelocity = Math.max(-0.65, Math.min(0.65, -pointerDelta / elapsed));
    dragVelocity = dragVelocity * 0.7 + instantVelocity * 0.3;
    lastPointerX = event.clientX;
    lastPointerTime = now;
    normalizePosition();
    renderPosition();
  };

  const finishDrag = (event) => {
    if (event.pointerId !== activePointerId) return;

    const wasHorizontal = gestureDirection === "horizontal";
    const keepInertia = wasHorizontal && event.type !== "pointercancel";
    if (!keepInertia) dragVelocity = 0;
    isDragging = false;
    activePointerId = null;
    gestureDirection = "idle";
    if (wasHorizontal) pausedUntil = performance.now() + 1400;
    strip.classList.remove("is-dragging");
    if (strip.hasPointerCapture?.(event.pointerId)) strip.releasePointerCapture(event.pointerId);
  };

  const moveWithWheel = (event) => {
    if (!mobileQuery.matches || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    position += event.deltaX;
    dragVelocity = 0;
    pausedUntil = performance.now() + 1400;
    normalizePosition();
    renderPosition();
  };

  strip.addEventListener("pointerdown", beginDrag);
  strip.addEventListener("pointermove", moveDrag);
  strip.addEventListener("pointerup", finishDrag);
  strip.addEventListener("pointercancel", finishDrag);
  strip.addEventListener("wheel", moveWithWheel, { passive: false });

  const handleViewportResize = () => {
    const nextWidth = Math.round(window.innerWidth);
    if (nextWidth === viewportWidth) return;
    viewportWidth = nextWidth;
    start();
  };

  window.addEventListener("resize", handleViewportResize);
  reducedMotionQuery.addEventListener?.("change", () => {
    dragVelocity = 0;
  });
  start();
}

async function init() {
  restoreCartCountPreview();
  const accountReady = loadCustomerStatus().then(loadCartCount);
  const cmsLoaded = await loadCmsFromDatabase();
  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!cmsLoaded && !isLocalDevelopment) {
    setupMobileNav();
    setupAccountMenu();
    setupTrustStripScroller();
    const filters = qs("#filters");
    const productGrid = qs("#productGrid");
    if (filters) filters.replaceChildren();
    if (productGrid) {
      productGrid.innerHTML = `
        <article class="catalog-error" role="alert">
          <h3>Ponuda trenutno nije dostupna</h3>
          <p>Pokušajte ponovo za nekoliko trenutaka ili nas kontaktirajte direktno.</p>
          <a class="btn btn-primary" href="mailto:info@fontele.ba">Pošalji email</a>
        </article>
      `;
    }
    await accountReady;
    restoreHashScroll();
    return;
  }
  applySectionVisibility();
  if (sectionEnabled("categoryShowcase")) renderCategories();
  if (sectionEnabled("products")) {
    renderFilters();
    renderProducts();
  }
  if (sectionEnabled("comingSoonShowcase")) renderComingSoon();
  if (sectionEnabled("parts")) renderParts();
  if (sectionEnabled("manuals")) renderManuals();
  if (sectionEnabled("locations")) renderLocations();
  if (sectionEnabled("blog")) renderBlogs();
  if (sectionEnabled("faq")) renderFaq();
  if (sectionEnabled("comparison")) setupComparison();
  if (sectionEnabled("contact")) setupContactLinks();
  setupMobileNav();
  setupAccountMenu();
  setupTrustStripScroller();
  await accountReady;
  if (sectionEnabled("products")) renderProducts();
  restoreHashScroll();
}

window.addEventListener("storage", async (event) => {
  if (event.key !== "onesCmsUpdatedAt") return;

  await loadCmsFromDatabase();
  applySectionVisibility();
  if (sectionEnabled("categoryShowcase")) renderCategories();
  if (sectionEnabled("products")) {
    renderFilters();
    renderProducts();
  }
  if (sectionEnabled("comingSoonShowcase")) renderComingSoon();
  if (sectionEnabled("parts")) renderParts();
  if (sectionEnabled("manuals")) renderManuals();
  if (sectionEnabled("locations")) renderLocations();
  if (sectionEnabled("blog")) renderBlogs();
  if (sectionEnabled("faq")) renderFaq();
  if (sectionEnabled("comparison")) setupComparison();
  if (sectionEnabled("contact")) setupContactLinks();
});

init();

