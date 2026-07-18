let cms = {
  contact: {
    whatsapp: "38761000000",
    viber: "38761000000",
    defaultMessage: "Pozdrav, zanima me oneS proizvod.",
  },
  sections: {
    hero: true,
    trust: true,
    categories: true,
    products: true,
    comingSoon: true,
    comparison: true,
    service: true,
    parts: true,
    manuals: true,
    delivery: true,
    locations: true,
    blog: true,
    faq: true,
    contact: true,
  },
  categories: [
    {
      name: "Električni skuteri",
      text: "Modeli za gradsku vožnju, svakodnevne relacije i praktično kretanje.",
    },
    {
      name: "Kuhinjski aparati",
      text: "Multicookeri i pametni uređaji za bržu pripremu obroka.",
    },
    {
      name: "Mobitel dodaci",
      text: "Adapteri, zaštitna stakla i dodaci za najtraženije telefone.",
    },
    {
      name: "Dom i ured",
      text: "Multi utičnice i korisni električni dodaci za radni prostor.",
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
      name: "oneS F3 električni skuter",
      category: "Električni skuteri",
      status: "Dostupno",
      badge: "Popularno",
      tone: "red",
      specs: {
        Domet: "do 30 km",
        Brzina: "do 25 km/h",
        Baterija: "36 V",
        Garancija: "preko prodavnice",
      },
      summary: "Praktičan gradski skuter za svakodnevne relacije, posao i kratke vožnje.",
    },
    {
      id: "multicooker",
      name: "oneS električni multicooker",
      category: "Kuhinjski aparati",
      status: "Dostupno",
      badge: "Novo",
      tone: "light",
      specs: {
        Programi: "više režima kuhanja",
        Posuda: "neljepljiva",
        Upotreba: "kuhanje, dinstanje, zagrijavanje",
        Garancija: "preko prodavnice",
      },
      summary: "Jednostavan uređaj za brzu pripremu jela u kući, stanu ili kancelariji.",
    },
    {
      id: "adapter-20w",
      name: "oneS brzi adapter 20W",
      category: "Mobitel dodaci",
      status: "Dostupno",
      badge: "Brzo punjenje",
      tone: "dark",
      specs: {
        Snaga: "20 W",
        Port: "USB-C",
        Zaštita: "od pregrijavanja",
        Kompatibilnost: "telefoni i dodaci",
      },
      summary: "Kompaktan adapter za svakodnevno brzo punjenje mobilnih uređaja.",
    },
    {
      id: "multi-socket",
      name: "oneS multi utičnica",
      category: "Dom i ured",
      status: "U dolasku",
      badge: "Uskoro",
      tone: "dark",
      specs: {
        Namjena: "dom i ured",
        Portovi: "više priključaka",
        Sigurnost: "zaštita pri korištenju",
        Status: "u dolasku",
      },
      summary: "Praktično rješenje za više uređaja na jednom radnom ili kućnom mjestu.",
    },
  ],
  comingSoon: [
    {
      name: "Zaštitna stakla za telefone",
      text: "Dolaze modeli za najtraženije telefone. Dodati opciju 'obavijesti me' u sljedećoj fazi.",
    },
    {
      name: "oneS multi utičnice",
      text: "Nova kategorija za dom, ured i sigurnije organizovanje kablova.",
    },
    {
      name: "Rezervni dijelovi za skutere",
      text: "Gume, punjači, kočioni dijelovi i drugi servisni dodaci biće prikazani kao posebna ponuda.",
    },
  ],
  parts: [
    {
      name: "Punjači za skutere",
      text: "U pripremi za servisnu i dodatnu prodaju.",
    },
    {
      name: "Gume i potrošni dijelovi",
      text: "Planirano za oneS električne skutere.",
    },
    {
      name: "Adapteri i kablovi",
      text: "Dodatna oprema za postojeće i buduće proizvode.",
    },
  ],
  manuals: [
    {
      title: "oneS F3 električni skuter",
      type: "PDF manual",
      status: "Dodati dokument",
    },
    {
      title: "oneS električni multicooker",
      type: "PDF uputstvo",
      status: "Dodati dokument",
    },
    {
      title: "Sigurnosne upute za adaptere i utičnice",
      type: "PDF dokument",
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
      title: "Kako odabrati električni skuter za gradsku vožnju",
      text: "Savjeti o dometu, brzini, bateriji, težini i održavanju.",
      tag: "Skuteri",
    },
    {
      title: "Zašto koristiti provjeren adapter za telefon",
      text: "Sigurnost punjenja, zaštita uređaja i kompatibilnost.",
      tag: "Mobiteli",
    },
    {
      title: "Multicooker: praktičan uređaj za brzu kuhinju",
      text: "Ideje za svakodnevnu upotrebu i lakšu pripremu obroka.",
      tag: "Kuhinja",
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
    const response = await fetch("api.php?action=cms", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.ok && data.cms) {
      cms = {
        ...cms,
        ...data.cms,
        contact: { ...cms.contact, ...(data.cms.contact || {}) },
        sections: { ...cms.sections, ...(data.cms.sections || {}) },
      };
    }
  } catch (error) {
    console.warn("Database CMS could not be loaded. Demo content is being used.", error);
  }
}

let activeCategory = "Sve";
let cartCount = 0;
let currentCustomer = null;
let currentFavorites = new Set();
let manualSearch = "";
let manualCategory = "Sve";
let manualType = "Sve";

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

function moneyText(product) {
  return activePrice(product).label || "0";
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

  return { label: "0", type: "regular" };
}

function priceHtml(product) {
  const current = activePrice(product);
  const mpc = numericPrice(product.mpcPrice) > 0 && formatPrice(product.mpcPrice) !== current.label ? formatPrice(product.mpcPrice) : "";
  return `
    <div class="price-stack">
      <strong class="${current.type === "sale" ? "sale-price" : ""}">${current.label}</strong>
      ${mpc ? `<span class="mpc-price">MPC: ${mpc}</span>` : ""}
      ${current.type === "sale" && product.saleUntil ? `<small>Akcija traje do ${formatDateOnly(product.saleUntil)}</small>` : ""}
    </div>
  `;
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
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

function inquiryUrl(productName, channel = "whatsapp") {
  const message = inquiryMessage(productName);
  const text = encodeURIComponent(message);

  if (channel === "viber") {
    return `viber://chat?number=%2B${cms.contact.viber}&text=${text}`;
  }

  if (channel === "email") {
    return `mailto:?subject=${encodeURIComponent(`oneS upit${productName ? ` - ${productName}` : ""}`)}&body=${text}`;
  }

  return `https://wa.me/${cms.contact.whatsapp}?text=${text}`;
}

const sectionMap = {
  hero: ["#pocetna"],
  trust: [".trust-strip"],
  categories: ["#kategorije"],
  products: ["#proizvodi"],
  comingSoon: ["#uskoro"],
  comparison: ["#usporedba"],
  service: ["#servis"],
  parts: ["#rezervni-dijelovi"],
  manuals: ["#manuali"],
  delivery: ["#dostava"],
  locations: ["#lokacije"],
  blog: ["#blog"],
  faq: ["#podrska"],
  contact: ["#kontakt"],
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
    locations: ["#lokacije"],
    manuals: ["#manuali"],
    faq: ["#podrska"],
    delivery: ["#dostava"],
    blog: ["#blog"],
  };

  Object.entries(navTargets).forEach(([key, hrefs]) => {
    hrefs.forEach((href) => {
      document.querySelectorAll(`a[href="${href}"], a[href="index.html${href}"]`).forEach((link) => {
        link.hidden = !sectionEnabled(key);
      });
    });
  });
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
  cartCount = count || 0;
  const badge = qs("#cartCount");
  if (badge) {
    badge.textContent = String(cartCount);
    badge.hidden = cartCount === 0;
  }
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
  const links = ["#accountLink", "#footerAccountLink", "#mobileAccountLink"]
    .map((selector) => qs(selector))
    .filter(Boolean);

  links.forEach((link) => {
    link.hidden = false;
    if (currentCustomer) {
      link.href = "profile.html";
      link.textContent = `Prijavljen: ${currentCustomer.name}`;
      link.classList.add("account-active");
    } else {
      link.href = "login.html";
      link.textContent = "Prijavi se";
      link.classList.remove("account-active");
    }
  });
}

async function logoutCustomer() {
  try {
    await api("customer-logout", {});
  } catch (error) {
    console.warn("Logout failed.", error);
  }

  currentCustomer = null;
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
    const data = await api("customer-status");
    currentCustomer = data.loggedIn ? data.user : null;
    currentFavorites = new Set(Array.isArray(data.favorites) ? data.favorites : []);
  } catch {
    currentCustomer = null;
    currentFavorites = new Set();
  }
  updateAccountLinks();
}

async function addToCart(productId) {
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
  }
}

async function toggleFavorite(productId) {
  if (!currentCustomer) {
    window.location.href = `login.html?next=${encodeURIComponent(window.location.href)}`;
    return;
  }

  try {
    const data = await api("favorite-toggle", { productId });
    currentFavorites = new Set(data.favorites || []);
    renderProducts();
    flash(data.favorited ? "Proizvod je dodan u favorite." : "Proizvod je uklonjen iz favorita.");
  } catch (error) {
    flash(error.message);
  }
}

function closeInquiryModal() {
  qs("#inquiryModal")?.remove();
  document.body.classList.remove("modal-open");
}

function openInquiryModal(productName) {
  closeInquiryModal();
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
        <a href="${inquiryUrl(productName, "viber")}"><span>V</span><strong>Viber</strong></a>
        <a href="${inquiryUrl(productName, "email")}"><span>@</span><strong>Email</strong></a>
      </div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeInquiryModal();
  });
  modal.querySelector(".inquiry-close").addEventListener("click", closeInquiryModal);
  modal.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeInquiryModal));
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
}

function renderCategories() {
  const usedCategories = new Set((cms.products || []).map((product) => product.category).filter(Boolean));
  qs("#categoryGrid").innerHTML = (cms.categories || [])
    .filter((item) => usedCategories.has(item.name))
    .map(
      (item) => `
        <article class="category-card">
          <strong>${item.name}</strong>
          <span>${item.text}</span>
        </article>
      `
    )
    .join("");
}

function renderFilters() {
  const filters = qs("#filters");

  const enabledCategoryNames = new Set((cms.categories || []).filter((category) => category.enabled !== false).map((category) => category.name));
  const categories = ["Sve", ...new Set(cms.products.map((product) => product.category).filter((category) => enabledCategoryNames.has(category)))];
  if (!categories.includes(activeCategory)) {
    activeCategory = "Sve";
  }

  filters.innerHTML = categories
    .map(
      (category) => `
        <button class="filter-button ${category === activeCategory ? "active" : ""}" type="button" data-category="${category}">
          ${category}
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

function setupClickableCards() {
  document.querySelectorAll("[data-card-url]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea")) return;
      window.location.href = card.dataset.cardUrl;
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("a, button, input, select, textarea")) return;
      event.preventDefault();
      window.location.href = card.dataset.cardUrl;
    });
  });
}

function renderProducts() {
  const visible =
    activeCategory === "Sve"
      ? cms.products
      : cms.products.filter((product) => product.category === activeCategory);

  qs("#productGrid").innerHTML = visible
    .map((product) => {
      const favoriteActive = currentFavorites.has(product.id);
      return `
        <article class="product-card clickable-card" data-card-url="${productUrl(product)}" role="link" tabindex="0" aria-label="Otvori proizvod ${escapeHtml(product.name)}">
          <a class="product-visual ${product.tone === "red" ? "red" : "light"}" href="${productUrl(product)}">
            <div>
              <span>${escapeHtml(product.category)}</span>
              <h3>${escapeHtml(product.name)}</h3>
            </div>
            ${
              product.image
                ? `<img class="product-card-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />`
                : `<div class="product-shape" aria-hidden="true"></div>`
            }
          </a>
          <div class="product-body">
            <div class="badge-row">
              <span class="badge red">${escapeHtml(product.status || "Dostupno")}</span>
              ${visibleBadge(product) ? `<span class="badge">${escapeHtml(visibleBadge(product))}</span>` : ""}
            </div>
            <p>${escapeHtml(product.summary)}</p>
            ${priceHtml(product)}
            ${product.deliveryTime ? `<p class="delivery-note"><strong>Rok isporuke:</strong> ${escapeHtml(product.deliveryTime)}</p>` : ""}
            <ul class="spec-list">
              ${Object.entries(product.specs || {})
                .slice(0, 4)
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
    button.addEventListener("click", () => addToCart(button.dataset.addCart));
  });
  document.querySelectorAll("[data-inquiry-product]").forEach((button) => {
    button.addEventListener("click", () => openInquiryModal(button.dataset.inquiryProduct));
  });
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favorite));
  });
  setupClickableCards();
}
function renderComingSoon() {
  qs("#comingGrid").innerHTML = cms.comingSoon
    .map(
      (item) => `
        <article class="coming-card">
          <h3>${item.name}</h3>
          <p>${item.text}</p>
          <a class="btn btn-secondary" href="${inquiryUrl(item.name)}" target="_blank" rel="noreferrer">Pitaj za dolazak</a>
        </article>
      `
    )
    .join("");
}

function renderParts() {
  qs("#partsStrip").innerHTML = cms.parts
    .map(
      (item) => `
        <article class="part-card">
          <span class="badge red">Uskoro</span>
          <h3>${item.name}</h3>
          <p>${item.text}</p>
        </article>
      `
    )
    .join("");
}

function renderManuals() {
  const publicManuals = cms.manuals.filter((manual) => (manual.visibility || "Javno") === "Javno");
  const categories = ["Sve", ...new Set(publicManuals.map((manual) => manual.category).filter(Boolean))];
  const types = ["Sve", ...new Set(publicManuals.map((manual) => manual.type).filter(Boolean))];

  const filteredManuals = publicManuals.filter((manual) => {
    const searchTarget = `${manual.title || ""} ${manual.type || ""} ${manual.status || ""}`.toLowerCase();
    const matchesSearch = searchTarget.includes(manualSearch.toLowerCase());
    const matchesCategory = manualCategory === "Sve" || manual.category === manualCategory;
    const matchesType = manualType === "Sve" || manual.type === manualType;
    return matchesSearch && matchesCategory && matchesType;
  });

  qs("#manualList").innerHTML = `
    <div class="manual-controls">
      <input id="manualSearch" type="search" placeholder="Pretraži uputstva..." value="${manualSearch}" />
      <select id="manualCategory">
        ${categories.map((category) => `<option value="${category}" ${category === manualCategory ? "selected" : ""}>${category}</option>`).join("")}
      </select>
      <select id="manualType">
        ${types.map((type) => `<option value="${type}" ${type === manualType ? "selected" : ""}>${type}</option>`).join("")}
      </select>
    </div>
    ${
      filteredManuals.length
        ? filteredManuals
    .map(
      (manual) => `
        <article class="manual-item">
          <div>
            <h3>${manual.title}</h3>
            <p>${manual.type || "PDF"} · ${manual.category || "Sve kategorije"} · ${manual.status}</p>
          </div>
          ${
            manual.file
              ? `<a class="btn btn-primary" href="${manual.file}" target="_blank" rel="noreferrer">Preuzmi PDF</a>`
              : `<a class="btn btn-secondary" href="#kontakt">Zatraži manual</a>`
          }
        </article>
      `
    )
    .join("")
        : `<article class="manual-item"><div><h3>Nema rezultata</h3><p>Promijenite pretragu ili filter.</p></div></article>`
    }
  `;

  qs("#manualSearch").addEventListener("input", (event) => {
    manualSearch = event.target.value;
    renderManuals();
  });
  qs("#manualCategory").addEventListener("change", (event) => {
    manualCategory = event.target.value;
    renderManuals();
  });
  qs("#manualType").addEventListener("change", (event) => {
    manualType = event.target.value;
    renderManuals();
  });
}

function renderLocations() {
  qs("#locationGrid").innerHTML = cms.locations
    .map(
      (location) => `
        <article class="location-card">
          <h3>${location.name}</h3>
          <p>${location.address}</p>
          <p>${location.hours}</p>
          <a class="btn btn-secondary" href="#kontakt">Kontakt</a>
        </article>
      `
    )
    .join("");
}

function renderBlogs() {
  qs("#blogGrid").innerHTML = cms.blogs
    .map(
      (post, index) => `
        <article class="blog-card clickable-card" data-card-url="${blogUrl(post, index)}" role="link" tabindex="0" aria-label="Otvori blog ${post.title}">
          ${
            post.image
              ? `<a class="blog-card-image" href="${blogUrl(post, index)}"><img src="${post.image}" alt="${post.title}" /></a>`
              : `<a class="blog-card-image empty" href="${blogUrl(post, index)}"><span>oneS blog</span></a>`
          }
          <span class="badge red">${post.tag}</span>
          <h3>${post.title}</h3>
          <div class="rich-content blog-content">${post.text || ""}</div>
        </article>
      `
    )
    .join("");
  setupClickableCards();
}

function renderFaq() {
  qs("#faqList").innerHTML = cms.faq
    .map(
      (item, index) => `
        <article class="faq-item">
          <button class="faq-button" type="button" aria-expanded="${index === 0}" data-faq="${index}">
            <span>${item.q}</span>
            <strong>${index === 0 ? "-" : "+"}</strong>
          </button>
          <div class="faq-panel" ${index === 0 ? "" : "hidden"}>${item.a}</div>
        </article>
      `
    )
    .join("");

  document.querySelectorAll("[data-faq]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.nextElementSibling;
      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      button.querySelector("strong").textContent = isOpen ? "+" : "-";
      panel.hidden = isOpen;
    });
  });
}

function setupComparison() {
  if (!sectionEnabled("comparison") || !cms.products.length) return;
  const options = cms.products
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
  const first = cms.products.find((product) => product.id === qs("#compareA").value) || cms.products[0];
  if (!first) return;

  const sameCategoryProducts = cms.products.filter((product) => product.category === first.category);
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
  const first = cms.products.find((product) => product.id === qs("#compareA").value);
  const second = cms.products.find((product) => product.id === qs("#compareB").value);
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
  ["#whatsappBottom"].forEach((selector) => {
    qs(selector).href = inquiryUrl();
  });

  ["#viberBottom"].forEach((selector) => {
    qs(selector).href = inquiryUrl("", "viber");
  });
}

function setupMobileNav() {
  const button = qs(".menu-button");
  const menu = qs(".mobile-nav");
  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    menu.hidden = isOpen;
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      button.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    });
  });
}

async function init() {
  await loadCmsFromDatabase();
  applySectionVisibility();
  if (sectionEnabled("categories")) renderCategories();
  if (sectionEnabled("products")) {
    renderFilters();
    renderProducts();
  }
  if (sectionEnabled("comingSoon")) renderComingSoon();
  if (sectionEnabled("parts")) renderParts();
  if (sectionEnabled("manuals")) renderManuals();
  if (sectionEnabled("locations")) renderLocations();
  if (sectionEnabled("blog")) renderBlogs();
  if (sectionEnabled("faq")) renderFaq();
  if (sectionEnabled("comparison")) setupComparison();
  if (sectionEnabled("contact")) setupContactLinks();
  setupMobileNav();
  setupAccountMenu();
  await loadCustomerStatus();
  if (sectionEnabled("products")) renderProducts();
  await loadCartCount();
}

window.addEventListener("storage", async (event) => {
  if (event.key !== "onesCmsUpdatedAt") return;

  await loadCmsFromDatabase();
  applySectionVisibility();
  if (sectionEnabled("categories")) renderCategories();
  if (sectionEnabled("products")) {
    renderFilters();
    renderProducts();
  }
  if (sectionEnabled("comingSoon")) renderComingSoon();
  if (sectionEnabled("parts")) renderParts();
  if (sectionEnabled("manuals")) renderManuals();
  if (sectionEnabled("locations")) renderLocations();
  if (sectionEnabled("blog")) renderBlogs();
  if (sectionEnabled("faq")) renderFaq();
  if (sectionEnabled("comparison")) setupComparison();
  if (sectionEnabled("contact")) setupContactLinks();
});

init();

