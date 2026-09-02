const defaultCms = {
  contact: {
    whatsapp: "062455779",
    viber: "062455779",
    email: "info@fontele.ba",
    defaultMessage: "Pozdrav, zanima me oneS proizvod.",
    orderMessageTemplate: "Pozdrav {ime}, javljamo se povodom oneS upita #{broj_upita}.\n\nStatus: {status}\nArtikli:\n{artikli}",
    viberMessageTemplate: "Pozdrav {ime}, javljamo se povodom oneS upita #{broj_upita}. Status: {status}.",
    emailSubjectTemplate: "oneS upit #{broj_upita}",
    emailBodyTemplate: "Pozdrav {ime},\n\nJavljamo se povodom oneS upita #{broj_upita}.\n\nStatus: {status}\n\nArtikli:\n{artikli}\n\nSrdačan pozdrav,\noneS",
    customerMessageTemplate: "Pozdrav {ime}, javljamo se iz oneS podrške.",
    customerEmailSubjectTemplate: "oneS podrška",
    customerEmailBodyTemplate: "Pozdrav {ime},\n\nJavljamo se iz oneS podrške.\n\nSrdačan pozdrav,\noneS",
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
  launchChecklist: [
    { id: "products", label: "Proizvodi provjereni", done: false },
    { id: "prices", label: "Cijene, MPC, akcije i rokovi provjereni", done: false },
    { id: "images", label: "Slike proizvoda i bloga dodane", done: false },
    { id: "manuals", label: "Manuali/uputstva dodani i povezani", done: false },
    { id: "locations", label: "Poslovnice i kontakt podaci provjereni", done: false },
    { id: "faq", label: "FAQ i podrška provjereni", done: false },
    { id: "seo", label: "SEO naslovi, opisi, sitemap i robots provjereni", done: false },
    { id: "customer", label: "Test registracije i prijave kupca prošao", done: false },
    { id: "cart", label: "Test korpe i količina prošao", done: false },
    { id: "orders", label: "Test slanja upita i CMS narudžbi prošao", done: false },
    { id: "mobile", label: "Mobile pregled prošao", done: false },
    { id: "backup", label: "Finalni backup preuzet", done: false },
  ],
  categories: [
    { name: "Električni romobili", text: "oneS F3 modeli za gradsku vožnju, svakodnevne relacije i praktično kretanje." },
    { name: "Rezervni dijelovi", text: "Dijelovi i dodaci za servisnu podršku. Ponuda stiže uskoro." },
    { name: "Proizvodi uskoro", text: "Najave novih kategorija i artikala koji dolaze u oneS katalog." },
  ],
  badges: [
    { name: "-" },
    { name: "Novo" },
    { name: "Popularno" },
    { name: "Uskoro" },
    { name: "Akcija" },
  ],
  products: [
    {
      id: "scooter-f3",
      name: "oneS F3 električni romobil",
      category: "Električni romobili",
      status: "Dostupno",
      badge: "Popularno",
      tone: "red",
      specs: { Domet: "do 30 km", Brzina: "do 25 km/h", Baterija: "36 V", Garancija: "preko prodavnice" },
      summary: "Praktičan gradski romobil za svakodnevne relacije, posao i kratke vožnje.",
    },
  ],
  comingSoon: [
    { name: "Rezervni dijelovi za romobile", text: "Gume, punjači, kočioni dijelovi i drugi servisni dodaci biće prikazani kao posebna ponuda." },
  ],
  parts: [
    { name: "Punjači za romobile", text: "U pripremi za servisnu i dodatnu prodaju." },
    { name: "Gume i potrošni dijelovi", text: "Planirano za oneS električne romobile." },
  ],
  manuals: [
    { title: "oneS F3 električni romobil", type: "PDF manual", status: "Dodati dokument" },
  ],
  locations: [
    { name: "oneS partner Sarajevo", address: "Adresa prodavnice se dodaje u CMS", hours: "Pon - Sub, radno vrijeme dodati" },
    { name: "Online upit", address: "WhatsApp i Viber podrška za dostupnost", hours: "Odgovor u radnom vremenu" },
  ],
  blogs: [
    { id: "kako-odabrati-elektricni-romobil", title: "Kako odabrati električni romobil za gradsku vožnju", text: "Savjeti o dometu, brzini, bateriji, težini i održavanju.", tag: "Romobili" },
  ],
  faq: [
    { q: "Da li mogu kupiti direktno na stranici?", a: "Trenutno ne. Stranica radi kao katalog, a narudžbe i dostupnost se potvrđuju putem WhatsAppa, Vibera ili prodavnice." },
    { q: "Gdje se dobija garancija?", a: "Garancija se dobija u prodavnici uz račun i prateću dokumentaciju proizvoda." },
  ],
};

let cms = structuredClone(defaultCms);
let orders = [];
let customers = [];
let activePanel = "settings";
let editingProductId = null;
let editingCategoryIndex = null;
let editingCategoryAttributeIndex = null;
let productFilters = {
  search: "",
  category: "Sve",
  badge: "Sve",
  visibility: "Sve",
};
let orderFilters = {
  search: "",
  status: "Sve",
  date: "",
  dateTo: "",
  product: "Sve",
};
let customerFilters = {
  search: "",
};
let productSearchTimer = null;
let orderSearchTimer = null;
let customerSearchTimer = null;
let passwordNeedsChange = false;
let cmsBaseline = "";
let cmsRevision = 0;
let cmsSaving = false;

const panels = [
  { id: "settings", label: "Postavke" },
  { id: "sections", label: "Sekcije" },
  { id: "categories", label: "Kategorije" },
  { id: "badges", label: "Badgevi" },
  { id: "products", label: "Proizvodi" },
  { id: "orders", label: "Narudžbe" },
  { id: "customers", label: "Kupci" },
  { id: "comingSoon", label: "Uskoro" },
  { id: "parts", label: "Dijelovi" },
  { id: "manuals", label: "Manuali" },
  { id: "locations", label: "Lokacije" },
  { id: "blogs", label: "Blog" },
  { id: "faq", label: "FAQ" },
  { id: "security", label: "Sigurnost" },
  { id: "launch", label: "Provjera" },
];

function setAdminMenu(open) {
  document.body.classList.toggle("admin-menu-open", open);
  $("#adminMenuToggle")?.setAttribute("aria-expanded", String(open));
  const backdrop = $("#adminMenuBackdrop");
  if (backdrop) backdrop.hidden = !open;
}

function closeAdminMenu() {
  setAdminMenu(false);
}

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

function cmsSnapshot() {
  return JSON.stringify(cms);
}

function updateSaveState() {
  const saveButton = $("#saveBtn");
  if (!saveButton) return;
  const dirty = Boolean(cmsBaseline) && cmsSnapshot() !== cmsBaseline;
  saveButton.classList.toggle("has-unsaved", dirty);
  saveButton.disabled = cmsSaving;
  saveButton.textContent = cmsSaving ? "Spremanje..." : dirty ? "Sačuvaj izmjene" : "Sačuvaj CMS";
  saveButton.title = dirty ? "Postoje nesačuvane izmjene" : "Sve izmjene su sačuvane";
}

function captureCmsBaseline() {
  cmsBaseline = cmsSnapshot();
  updateSaveState();
}

function numericPrice(value) {
  if (value === null || value === undefined || value === "") return "0";
  const cleaned = String(value).replace(",", ".").replace(/[^\d.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? String(number) : "0";
}

function productMissingSaleDate(product) {
  return Number(numericPrice(product?.salePrice)) > 0 && !String(product?.saleUntil || "").trim();
}

function productsMissingSaleEndDate() {
  return (cms.products || []).filter(productMissingSaleDate);
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

function blogPreviewUrl(item) {
  const id = slugify(item.id || item.title || "blog") || "blog";
  return `blog.html?id=${encodeURIComponent(id)}`;
}

function formatPrice(value) {
  const number = Number(numericPrice(value));
  return Number.isInteger(number) ? String(number) : String(number.toFixed(2)).replace(/\.?0+$/, "");
}

function formatDateOnly(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateOnly(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isDateActive(dateValue) {
  if (!dateValue) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateValue);
  end.setHours(23, 59, 59, 999);
  return end >= today;
}

function adminPriceHtml(product) {
  const discount = Number(numericPrice(product.discountPrice));
  const sale = Number(numericPrice(product.salePrice));
  const hasSale = sale > 0 && product.saleUntil && isDateActive(product.saleUntil);
  const missingSaleDate = productMissingSaleDate(product);
  const mainPrice = discount > 0 ? formatPrice(product.discountPrice) : "0";

  return `
    <div class="product-admin-price">
      <strong>${mainPrice}</strong>
      ${hasSale ? `<span>Akcija: ${formatPrice(product.salePrice)} do ${formatDateOnly(product.saleUntil)}</span>` : ""}
      ${missingSaleDate ? `<span class="sale-date-warning">Nedostaje kraj akcije</span>` : ""}
    </div>
  `;
}

function numberField(label, value, onInput) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.value = numericPrice(value);
  input.addEventListener("input", () => onInput(numericPrice(input.value)));
  wrapper.appendChild(input);
  return wrapper;
}

async function api(action, payload) {
  return window.onesApi(action, payload);
}

async function uploadProductImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("api.php?action=upload-product-image", {
    method: "POST",
    headers: await window.onesCsrfHeaders(),
    body: formData,
  });
  const data = await readUploadResponse(response, "Upload slike nije uspio.");

  return data.file.path;
}

async function uploadBlogImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("api.php?action=upload-blog-image", {
    method: "POST",
    headers: await window.onesCsrfHeaders(),
    body: formData,
  });
  const data = await readUploadResponse(response, "Upload blog slike nije uspio.");

  return data.file.path;
}

async function readUploadResponse(response, fallbackMessage) {
  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${fallbackMessage} Hosting je prekinuo obradu ili nije vratio ispravan odgovor.`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data;
}

function validateProductImage(file) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const hasAllowedExtension = /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
  if (!allowedTypes.has(file.type) && !hasAllowedExtension) {
    throw new Error("Dozvoljeni formati su JPG, PNG, WEBP i GIF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Slika može biti maksimalno 5 MB.");
  }
}

async function uploadManualFile(file) {
  const formData = new FormData();
  formData.append("manual", file);

  const response = await fetch("api.php?action=upload-manual", {
    method: "POST",
    headers: await window.onesCsrfHeaders(),
    body: formData,
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Upload uputstva nije uspio.");
  }

  return data.file.path;
}

async function restoreBackupFile(file) {
  const formData = new FormData();
  formData.append("backup", file);

  const response = await fetch("api.php?action=backup-restore", {
    method: "POST",
    headers: await window.onesCsrfHeaders(),
    body: formData,
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Restore nije uspio.");
  }

  return data;
}

function mergeLaunchChecklist(savedItems) {
  const savedById = new Map((Array.isArray(savedItems) ? savedItems : []).map((item) => [item.id, item]));
  return structuredClone(defaultCms.launchChecklist).map((item) => ({
    ...item,
    done: Boolean(savedById.get(item.id)?.done),
    note: savedById.get(item.id)?.note || "",
  }));
}

async function loadCms() {
  try {
    const data = await api("admin-cms");
    cmsRevision = Number(data.revision) || 1;
    cms = { ...structuredClone(defaultCms), ...data.cms };
    cms.contact = { ...structuredClone(defaultCms.contact), ...(data.cms?.contact || {}) };
    cms.sections = { ...structuredClone(defaultCms.sections), ...(data.cms?.sections || {}) };
    cms.settings = { ...structuredClone(defaultCms.settings), ...(data.cms?.settings || {}) };
    delete cms.sections.productFilters;
    cms.launchChecklist = mergeLaunchChecklist(data.cms?.launchChecklist);
    captureCmsBaseline();
  } catch (error) {
    flash("Baza nije dostupna. Pokrenite lokalni server.");
    console.error(error);
  }
}

async function loadOrders() {
  try {
    const data = await api("admin-orders");
    orders = data.orders || [];
  } catch (error) {
    orders = [];
    console.warn("Narudžbe nisu učitane.", error);
  }
}

async function loadCustomers() {
  try {
    const data = await api("admin-customers");
    customers = data.customers || [];
  } catch (error) {
    customers = [];
    console.warn("Kupci nisu učitani.", error);
  }
}

async function saveCms() {
  if (cmsSaving) return;
  syncOpenProductSpecs();

  if (cms.sections) {
    delete cms.sections.productFilters;
  }

  const removedEmptyCategories = pruneEmptyCategories();
  (cms.categories || []).forEach((category) => ensureCategoryAttributes(category));

  (cms.products || []).forEach((product) => {
    product.enabled = product.enabled !== false;
    product.mpcPrice = numericPrice(product.mpcPrice);
    product.discountPrice = numericPrice(product.discountPrice);
    product.salePrice = numericPrice(product.salePrice);
    if (product.tone === "dark") product.tone = "light";
    syncProductAttributes(product);
  });
  (cms.blogs || []).forEach((post, index) => {
    post.id = slugify(post.id || post.title || `blog-${index + 1}`) || `blog-${index + 1}`;
  });

  const productsMissingSaleDate = productsMissingSaleEndDate();
  if (productsMissingSaleDate.length) {
    activePanel = "products";
    rememberActivePanel();
    renderProducts();
    showPanel();
    renderCmsValidationBanner();
    const currentProductIsMissing = productsMissingSaleDate.some((product) => product.id === editingProductId);
    if (!currentProductIsMissing) {
      openProductEditor(productsMissingSaleDate[0].id);
    }
    flash("CMS nije sačuvan. Unesite završni datum za svaku akcijsku cijenu.");
    return;
  }

  cmsSaving = true;
  updateSaveState();
  try {
    const editedProductId = editingProductId;
    const data = await api("save-cms", { cms, revision: cmsRevision });
    cmsRevision = Number(data.revision) || cmsRevision + 1;
    cms = data.cms;
    captureCmsBaseline();
    renderAll();
    if (editedProductId && (cms.products || []).some((product) => product.id === editedProductId)) {
      editingProductId = editedProductId;
      renderProductEditorModal();
    }
    captureCmsBaseline();
    localStorage.setItem("onesCmsUpdatedAt", String(Date.now()));
    flash(removedEmptyCategories ? `CMS je sacuvan. Uklonjeno praznih kategorija: ${removedEmptyCategories}.` : "CMS je sacuvan u bazi.");
  } catch (error) {
    flash(error.message, /međuvremenu|osvježite cms/i.test(error.message) ? 9000 : 2800);
  } finally {
    cmsSaving = false;
    updateSaveState();
  }
}

function flash(message, duration = 2800) {
  const note = document.createElement("div");
  note.className = "admin-toast";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");
  note.textContent = message;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), duration);
}

function renderCmsValidationBanner() {
  const banner = $("#cmsValidationBanner");
  if (!banner) return;

  const missingProducts = productsMissingSaleEndDate();
  if (!missingProducts.length || $("#adminEditor")?.hidden) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

  const names = missingProducts.map((product) => product.name || product.id || "Proizvod");
  banner.hidden = false;
  banner.innerHTML = `
    <div>
      <strong>Nedostaje završni datum akcije</strong>
      <p>${escapeHtml(names.join(", "))}</p>
      <span>CMS se neće sačuvati dok svaki navedeni proizvod ne dobije datum završetka akcijske cijene.</span>
    </div>
    <button class="btn btn-secondary" type="button" id="reviewMissingSaleDateBtn">Otvori proizvod</button>
  `;

  $("#reviewMissingSaleDateBtn").addEventListener("click", () => {
    activePanel = "products";
    rememberActivePanel();
    renderProducts();
    showPanel();
    openProductEditor(missingProducts[0].id);
  });
}

function field(label, value, onInput, type = "text") {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  input.value = value || "";
  if (type !== "textarea") input.type = type;
  input.addEventListener("input", () => onInput(input.value));
  wrapper.appendChild(input);
  return wrapper;
}

function selectField(label, value, options, onInput) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const select = document.createElement("select");
  options.forEach((option) => {
    const optionValue = typeof option === "string" ? option : option.value;
    const optionLabel = typeof option === "string" ? option : option.label;
    const item = document.createElement("option");
    item.value = optionValue;
    item.textContent = optionLabel;
    item.selected = optionValue === value;
    select.appendChild(item);
  });
  select.addEventListener("change", () => onInput(select.value));
  wrapper.appendChild(select);
  return wrapper;
}

function rerenderAfterTyping(input, renderFn) {
  const fieldId = input.id;
  const cursorStart = input.selectionStart ?? input.value.length;
  const cursorEnd = input.selectionEnd ?? cursorStart;
  renderFn();
  const restored = document.getElementById(fieldId);
  if (!restored) return;
  restored.focus();
  restored.setSelectionRange(cursorStart, cursorEnd);
}

function imageRecommendation(text) {
  const note = document.createElement("p");
  note.className = "image-upload-note";
  note.textContent = text;
  return note;
}

function imageUploadField(label, currentPath, onUploaded, recommendation = "Preporuka: WEBP format, 1200 x 1200 px. PNG samo ako treba providna pozadina, JPG ako je fotografija.") {
  const wrapper = document.createElement("label");
  wrapper.className = "image-upload-field";
  wrapper.textContent = label;

  const preview = document.createElement("div");
  preview.className = "image-upload-preview";
  preview.innerHTML = currentPath
    ? `<img src="${currentPath}" alt="${label}" />`
    : `<span>Nema slike</span>`;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const path = await uploadProductImage(file);
      onUploaded(path);
      preview.innerHTML = `<img src="${path}" alt="${label}" />`;
      flash("Slika je uploadovana. Ne zaboravite sačuvati CMS.");
    } catch (error) {
      flash(error.message);
    }
  });

  wrapper.append(preview, imageRecommendation(recommendation), input);
  return wrapper;
}

function blogImageUploadField(item) {
  const wrapper = document.createElement("label");
  wrapper.className = "image-upload-field";
  wrapper.textContent = "Glavna slika bloga";

  const preview = document.createElement("div");
  preview.className = "image-upload-preview";
  preview.innerHTML = item.image
    ? `<img src="${item.image}" alt="${item.title || "Blog slika"}" />`
    : `<span>Nema slike</span>`;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const path = await uploadBlogImage(file);
      item.image = path;
      preview.innerHTML = `<img src="${path}" alt="${item.title || "Blog slika"}" />`;
      flash("Blog slika je uploadovana. Ne zaboravite sačuvati CMS.");
    } catch (error) {
      flash(error.message);
    }
  });

  wrapper.append(preview, imageRecommendation("Preporuka: WEBP format, 1600 x 900 px. JPG je uredu za fotografije, PNG samo za grafike ili screenshot."), input);
  return wrapper;
}

function manualUploadField(item) {
  const wrapper = document.createElement("label");
  wrapper.className = "manual-upload-field";
  wrapper.textContent = "PDF uputstvo";

  const current = document.createElement("div");
  current.className = "manual-current";
  current.innerHTML = item.file
    ? `<a class="btn btn-secondary" href="${item.file}" target="_blank" rel="noreferrer">Otvori trenutno uputstvo</a>`
    : `<span>Nema uploadovanog PDF-a</span>`;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const path = await uploadManualFile(file);
      item.file = path;
      item.status = "Dostupno za preuzimanje";
      current.innerHTML = `<a class="btn btn-secondary" href="${path}" target="_blank" rel="noreferrer">Otvori trenutno uputstvo</a>`;
      flash("Uputstvo je uploadovano. Ne zaboravite sačuvati CMS.");
    } catch (error) {
      flash(error.message);
    }
  });

  wrapper.append(current, input);
  return wrapper;
}

function productManualField(product) {
  const wrapper = document.createElement("label");
  wrapper.className = "manual-upload-field";
  wrapper.textContent = "Uputstvo za ovaj proizvod";

  function findManual() {
    return (cms.manuals || []).find((manual) => manual.relatedProductId === product.id && (manual.type || "Uputstvo") === "Uputstvo");
  }

  const current = document.createElement("div");
  current.className = "manual-current";

  function renderCurrent() {
    const manual = findManual();
    current.innerHTML = manual?.file
      ? `<a class="btn btn-secondary" href="${manual.file}" target="_blank" rel="noreferrer">Otvori povezano uputstvo</a>`
      : `<span>Nema povezanog uputstva za ovaj proizvod</span>`;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const path = await uploadManualFile(file);
      let manual = findManual();
      if (!manual) {
        manual = {
          title: `Uputstvo - ${product.name}`,
          type: "Uputstvo",
          status: "Dostupno za preuzimanje",
          file: "",
          relatedProductId: product.id,
          category: product.category,
          visibility: "Javno",
        };
        cms.manuals.unshift(manual);
      }

      manual.title = manual.title || `Uputstvo - ${product.name}`;
      manual.file = path;
      manual.relatedProductId = product.id;
      manual.category = product.category;
      manual.visibility = "Javno";
      manual.status = "Dostupno za preuzimanje";
      renderCurrent();
      flash("Uputstvo je povezano s proizvodom. Ne zaboravite sačuvati CMS.");
    } catch (error) {
      flash(error.message);
    }
  });

  renderCurrent();
  wrapper.append(current, input);
  return wrapper;
}

function galleryField(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "gallery-field";
  const title = document.createElement("strong");
  title.textContent = "Galerija proizvoda";
  const note = imageRecommendation("Preporuka: WEBP format, 1200 x 1200 px po slici. Koristiti isti omjer slika kroz galeriju radi urednog prikaza.");

  const list = document.createElement("div");
  list.className = "gallery-list";

  function moveGalleryImage(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= item.gallery.length || fromIndex === toIndex) return;
    const [moved] = item.gallery.splice(fromIndex, 1);
    item.gallery.splice(toIndex, 0, moved);
    renderGallery();
  }

  function renderGallery() {
    item.gallery = Array.isArray(item.gallery) ? item.gallery : [];
    list.innerHTML = item.gallery
      .map(
        (path, index) => `
          <div class="gallery-thumb" draggable="true" data-gallery-index="${index}">
            <span class="gallery-thumb-order">${index + 1}</span>
            <button class="gallery-remove-btn" type="button" data-remove-gallery="${index}" aria-label="Ukloni sliku ${index + 1}">&times;</button>
            <img src="${path}" alt="Slika ${index + 1}" />
            <div class="gallery-reorder-controls" aria-label="Promijeni redoslijed slike ${index + 1}">
              <button type="button" data-step-gallery="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Pomjeri sliku lijevo">&larr;</button>
              <button type="button" data-step-gallery="${index}" data-direction="1" ${index === item.gallery.length - 1 ? "disabled" : ""} aria-label="Pomjeri sliku desno">&rarr;</button>
            </div>
          </div>
        `
      )
      .join("");

    list.querySelectorAll("[data-step-gallery]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = Number(button.dataset.stepGallery);
        const direction = Number(button.dataset.direction);
        moveGalleryImage(index, index + direction);
      });
    });

    list.querySelectorAll("[data-gallery-index]").forEach((thumb) => {
      thumb.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", thumb.dataset.galleryIndex);
        thumb.classList.add("dragging");
      });
      thumb.addEventListener("dragend", () => {
        thumb.classList.remove("dragging");
      });
      thumb.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        thumb.classList.add("drag-over");
      });
      thumb.addEventListener("dragleave", () => {
        thumb.classList.remove("drag-over");
      });
      thumb.addEventListener("drop", (event) => {
        event.preventDefault();
        thumb.classList.remove("drag-over");
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        const toIndex = Number(thumb.dataset.galleryIndex);
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
        moveGalleryImage(fromIndex, toIndex);
      });
    });

    list.querySelectorAll("[data-remove-gallery]").forEach((button) => {
      button.addEventListener("click", () => {
        item.gallery.splice(Number(button.dataset.removeGallery), 1);
        renderGallery();
      });
    });
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";
  input.multiple = true;
  const progress = document.createElement("p");
  progress.className = "image-upload-progress";
  progress.hidden = true;
  progress.setAttribute("role", "status");
  progress.setAttribute("aria-live", "polite");
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    input.disabled = true;
    progress.hidden = false;
    const failed = [];
    let uploaded = 0;

    try {
      item.gallery = Array.isArray(item.gallery) ? item.gallery : [];
      for (const [index, file] of files.entries()) {
        progress.textContent = `Upload ${index + 1} od ${files.length}: ${file.name}`;
        try {
          validateProductImage(file);
          const path = await uploadProductImage(file);
          item.gallery.push(path);
          uploaded += 1;
          renderGallery();
        } catch (error) {
          failed.push(`${file.name}: ${error.message}`);
        }
      }
    } finally {
      input.disabled = false;
      input.value = "";
    }

    if (failed.length) {
      progress.textContent = `Završeno: ${uploaded} od ${files.length} slika je uspješno uploadovano.`;
      const failedPreview = failed.slice(0, 3).join(" | ");
      const remaining = failed.length > 3 ? ` | Još ${failed.length - 3} neuspjelih.` : "";
      flash(`${uploaded} od ${files.length} slika je uploadovano. Nisu dodane: ${failedPreview}${remaining}`, 9000);
      return;
    }

    progress.textContent = `Završeno: svih ${uploaded} slika je uploadovano.`;
    flash(`${uploaded} slika je dodano u galeriju. Ne zaboravite sačuvati CMS.`);
  });

  wrapper.append(title, note, list, progress, input);
  renderGallery();
  return wrapper;
}

function richTextField(label, value, onInput) {
  const wrapper = document.createElement("div");
  wrapper.className = "rich-text-field";

  const title = document.createElement("strong");
  title.textContent = label;

  const toolbar = document.createElement("div");
  toolbar.className = "rich-text-toolbar";
  toolbar.innerHTML = `
    <button type="button" data-command="bold"><strong>B</strong></button>
    <button type="button" data-command="italic"><em>I</em></button>
    <button type="button" data-command="insertUnorderedList">Lista</button>
    <button type="button" data-command="insertOrderedList">1. Lista</button>
    <select aria-label="Veličina teksta">
      <option value="">Veličina</option>
      <option value="3">Normalno</option>
      <option value="4">Veće</option>
      <option value="5">Veliko</option>
      <option value="6">Naslov</option>
    </select>
  `;

  const editor = document.createElement("div");
  editor.className = "rich-text-editor";
  editor.contentEditable = "true";
  editor.innerHTML = value || "";
  editor.addEventListener("input", () => onInput(editor.innerHTML));

  toolbar.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      editor.focus();
      document.execCommand(button.dataset.command, false, null);
      onInput(editor.innerHTML);
    });
  });

  toolbar.querySelector("select").addEventListener("change", (event) => {
    if (!event.target.value) return;
    editor.focus();
    document.execCommand("fontSize", false, event.target.value);
    onInput(editor.innerHTML);
    event.target.value = "";
  });

  wrapper.append(title, toolbar, editor);
  return wrapper;
}

function specsToText(specs) {
  return Object.entries(specs || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function textToSpecs(text) {
  return text.split("\n").reduce((result, line) => {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) result[key.trim()] = rest.join(":").trim();
    return result;
  }, {});
}

function valuesToText(values) {
  return (Array.isArray(values) ? values : []).join("\n");
}

function textToValues(text) {
  return String(text || "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function ensureCategoryAttributes(category) {
  category.attributes = Array.isArray(category.attributes) ? category.attributes : [];
  category.attributes = category.attributes
    .map((attribute) => ({
      name: String(attribute.name || "").trim(),
      values: Array.isArray(attribute.values) ? attribute.values.filter(Boolean) : textToValues(attribute.values || ""),
    }))
    .filter((attribute) => attribute.name);
  return category.attributes;
}

function categoryByName(name) {
  return (cms.categories || []).find((category) => category.name === name);
}

function syncProductAttributes(product) {
  const category = categoryByName(product.category);
  const attributes = category ? ensureCategoryAttributes(category) : [];
  product.attributes = product.attributes && typeof product.attributes === "object" ? product.attributes : {};
  product.specs = product.specs && typeof product.specs === "object" ? product.specs : {};

  attributes.forEach((attribute) => {
    const current = product.attributes[attribute.name] || product.specs[attribute.name] || "";
    const value = current || "-";
    product.attributes[attribute.name] = value;
    product.specs[attribute.name] = value;
  });

  return attributes;
}

function applyProductSpecsText(product, text) {
  const category = categoryByName(product.category);
  const categoryAttributes = category ? ensureCategoryAttributes(category) : [];
  const activeAttributeNames = new Set(categoryAttributes.map((attribute) => attribute.name));

  product.specs = textToSpecs(text);
  product.attributes = product.attributes && typeof product.attributes === "object" ? product.attributes : {};

  Object.keys(product.attributes).forEach((name) => {
    if (!activeAttributeNames.has(name)) delete product.attributes[name];
  });

  categoryAttributes.forEach((attribute) => {
    const value = product.specs[attribute.name] || product.attributes[attribute.name] || "-";
    product.attributes[attribute.name] = value;
    product.specs[attribute.name] = value;
  });

  return categoryAttributes;
}

function syncOpenProductSpecs() {
  if (!editingProductId) return;

  const textarea = document.querySelector("#productEditModal [data-product-specs]");
  const product = (cms.products || []).find((item) => item.id === editingProductId);
  if (!textarea || !product) return;

  applyProductSpecsText(product, textarea.value);
}

function card(title, onDelete) {
  const item = document.createElement("article");
  item.className = "admin-card";
  const header = document.createElement("div");
  header.className = "admin-card-header";
  header.innerHTML = `<h3>${title}</h3>`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-secondary";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Obriši";
  deleteBtn.addEventListener("click", onDelete);
  header.appendChild(deleteBtn);
  item.appendChild(header);
  return item;
}

function productEditorConfig() {
  cms.badges = Array.isArray(cms.badges) ? cms.badges : structuredClone(defaultCms.badges);
  const statusOptions = ["Dostupno", "Nije dostupno", "Uskoro", "U dolasku", "Na upit"];
  const categoryOptions = cms.categories.map((category) => category.name);
  const badgeOptions = [
    { value: "-", label: "- (bez badgea)" },
    ...cms.badges
      .filter((badge) => badge.name && badge.name !== "-" && badge.enabled !== false)
      .map((badge) => ({ value: badge.name, label: badge.name })),
  ];

  return { statusOptions, categoryOptions, badgeOptions };
}

function createDefaultProduct() {
  return {
    id: `product-${Date.now()}`,
    name: "Novi proizvod",
    category: cms.categories[0]?.name || "Bez kategorije",
    status: "Dostupno",
    badge: "Novo",
    tone: "red",
    mpcPrice: "0",
    discountPrice: "0",
    salePrice: "0",
    saleUntil: "",
    badgeUntil: "",
    enabled: true,
    deliveryTime: "Po dogovoru",
    image: "",
    gallery: [],
    specs: {},
    summary: "",
    detailedDescription: "",
    seoTitle: "",
    seoDescription: "",
  };
}

function editorSection(title, className = "") {
  const section = document.createElement("section");
  section.className = `product-edit-section ${className}`.trim();
  const heading = document.createElement("h3");
  heading.textContent = title;
  const content = document.createElement("div");
  content.className = "product-edit-section-content";
  section.append(heading, content);
  return { section, content };
}

function closeProductEditor() {
  syncOpenProductSpecs();
  const modal = $("#productEditModal");
  if (modal) modal.remove();
  editingProductId = null;
  document.body.classList.remove("modal-open");
  renderProducts();
}

function openProductEditor(productId) {
  editingProductId = productId;
  renderProductEditorModal();
}

function renderProductEditorModal() {
  const editorProduct = cms.products.find((product) => product.id === editingProductId);
  if (!editorProduct) return;

  $("#productEditModal")?.remove();
  const { statusOptions, categoryOptions, badgeOptions } = productEditorConfig();
  const categories = [...categoryOptions];
  if (!categories.includes(editorProduct.category)) {
    categories.unshift(editorProduct.category || "Bez kategorije");
  }

  const modal = document.createElement("div");
  modal.className = "product-edit-modal";
  modal.id = "productEditModal";
  modal.innerHTML = `
    <div class="product-edit-dialog" role="dialog" aria-modal="true" aria-label="Uredi proizvod">
      <div class="product-edit-header">
        <div>
          <span>Uredi proizvod</span>
          <h2>${escapeHtml(editorProduct.name || "Proizvod")}</h2>
        </div>
        <div class="product-edit-actions">
          <button class="btn btn-secondary" type="button" id="deleteProductBtn">Obrisi</button>
          <button class="btn btn-primary" type="button" id="saveProductCmsBtn">Sačuvaj izmjene</button>
          <button class="btn btn-secondary" type="button" id="closeProductEditorBtn">Zatvori</button>
        </div>
      </div>
      <div class="product-edit-body" id="productEditBody"></div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeProductEditor();
  });

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  $("#closeProductEditorBtn").addEventListener("click", closeProductEditor);
  $("#saveProductCmsBtn").addEventListener("click", saveCms);
  $("#deleteProductBtn").addEventListener("click", () => {
    const index = cms.products.indexOf(editorProduct);
    cms.products.splice(index, 1);
    editingProductId = null;
    closeProductEditor();
  });

  const body = $("#productEditBody");

  const basic = editorSection("Osnovno");
  basic.content.append(
    field("ID", editorProduct.id, (value) => {
      editorProduct.id = value;
      editingProductId = value;
    }),
    field("Naziv", editorProduct.name, (value) => (editorProduct.name = value)),
    selectField("Kategorija", editorProduct.category, categories, (value) => {
      editorProduct.category = value;
      renderProductEditorModal();
    }),
    selectField("Status", editorProduct.status, statusOptions.includes(editorProduct.status) ? statusOptions : [editorProduct.status, ...statusOptions], (value) => (editorProduct.status = value)),
    selectField("Vidljivost na stranici", editorProduct.enabled !== false ? "Aktivan" : "Neaktivan", ["Aktivan", "Neaktivan"], (value) => (editorProduct.enabled = value === "Aktivan")),
    field("Rok isporuke", editorProduct.deliveryTime, (value) => (editorProduct.deliveryTime = value))
  );

  const prices = editorSection("Cijene");
  const saleDateWarning = document.createElement("p");
  saleDateWarning.className = "product-sale-date-warning";
  saleDateWarning.setAttribute("role", "alert");
  const refreshSaleDateWarning = () => {
    const missingDate = productMissingSaleDate(editorProduct);
    saleDateWarning.hidden = !missingDate;
    saleDateWarning.textContent = missingDate
      ? "Akcijska cijena nema završni datum. CMS se neće sačuvati dok ne unesete datum."
      : "";
  };
  prices.content.append(
    numberField("MPC - maloprodajna cijena", editorProduct.mpcPrice, (value) => (editorProduct.mpcPrice = value)),
    numberField("Cijena s popustom", editorProduct.discountPrice, (value) => (editorProduct.discountPrice = value)),
    numberField("Akcijska cijena", editorProduct.salePrice, (value) => {
      editorProduct.salePrice = value;
      refreshSaleDateWarning();
    }),
    field("Akcija traje do", editorProduct.saleUntil, (value) => {
      editorProduct.saleUntil = value;
      refreshSaleDateWarning();
    }, "date"),
    saleDateWarning
  );
  refreshSaleDateWarning();

  const badge = editorSection("Badge i izgled");
  badge.content.append(
    selectField("Badge", editorProduct.badge || "-", badgeOptions, (value) => (editorProduct.badge = value)),
    field("Badge traje do", editorProduct.badgeUntil, (value) => (editorProduct.badgeUntil = value), "date"),
    selectField("Boja kartice", editorProduct.tone === "dark" ? "light" : editorProduct.tone, ["red", "light"], (value) => (editorProduct.tone = value))
  );

  const media = editorSection("Slike", "product-edit-wide");
  media.content.append(imageUploadField("Glavna slika proizvoda", editorProduct.image, (path) => (editorProduct.image = path)), galleryField(editorProduct));

  const description = editorSection("Opis", "product-edit-wide");
  description.content.append(
    field("Kratak opis", editorProduct.summary, (value) => (editorProduct.summary = value), "textarea"),
    richTextField("Detaljan opis artikla", editorProduct.detailedDescription, (value) => (editorProduct.detailedDescription = value))
  );

  let specsTextarea = null;
  const refreshSpecsTextarea = () => {
    if (specsTextarea) specsTextarea.value = specsToText(editorProduct.specs);
  };
  const categoryAttributes = syncProductAttributes(editorProduct);
  const attributeSection = editorSection("Atributi kategorije", "product-edit-wide");
  if (categoryAttributes.length) {
    categoryAttributes.forEach((attribute) => {
      const options = ["-", ...attribute.values.filter((value) => value !== "-")];
      const current = editorProduct.attributes?.[attribute.name] || editorProduct.specs?.[attribute.name] || "-";
      attributeSection.content.append(
        selectField(attribute.name, current, options, (value) => {
          const nextValue = value || "-";
          editorProduct.attributes = editorProduct.attributes || {};
          editorProduct.specs = editorProduct.specs || {};
          editorProduct.attributes[attribute.name] = nextValue;
          editorProduct.specs[attribute.name] = nextValue;
          refreshSpecsTextarea();
        })
      );
    });
  } else {
    const note = document.createElement("p");
    note.className = "admin-note-text";
    note.textContent = "Ova kategorija još nema definisane atribute. Dodajte ih u panelu Kategorije.";
    attributeSection.content.append(note);
  }

  const specs = editorSection("Specifikacije", "product-edit-wide");
  const specsField = field("Jedna po redu: Naziv: vrijednost", specsToText(editorProduct.specs), (value) => {
    applyProductSpecsText(editorProduct, value);
  }, "textarea");
  specsTextarea = specsField.querySelector("textarea");
  specsTextarea.dataset.productSpecs = "true";
  specs.content.append(specsField);

  const manual = editorSection("Uputstvo", "product-edit-wide");
  manual.content.append(productManualField(editorProduct));

  const seo = editorSection("SEO", "product-edit-wide");
  seo.content.append(
    field("SEO naslov", editorProduct.seoTitle, (value) => (editorProduct.seoTitle = value)),
    field("SEO opis", editorProduct.seoDescription, (value) => (editorProduct.seoDescription = value), "textarea")
  );

  body.append(basic.section, prices.section, badge.section, media.section, description.section, attributeSection.section, specs.section, manual.section, seo.section);
}

function renderNav() {
  $("#adminNav").innerHTML = panels
    .map((panel) => `<button type="button" class="${panel.id === activePanel ? "active" : ""}" data-panel-btn="${panel.id}">${panel.label}</button>`)
    .join("");

  document.querySelectorAll("[data-panel-btn]").forEach((button) => {
    button.addEventListener("click", () => {
      activePanel = button.dataset.panelBtn;
      rememberActivePanel();
      closeAdminMenu();
      renderAll();
    });
  });
}

function rememberActivePanel() {
  localStorage.setItem("onesCmsActivePanel", activePanel);
}

function showPanel() {
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== activePanel;
  });
}

function renderSettings() {
  const panel = $('[data-panel="settings"]');
  panel.innerHTML = "<h2>Postavke</h2>";
  cms.contact = { ...structuredClone(defaultCms.contact), ...(cms.contact || {}) };
  cms.settings = { ...structuredClone(defaultCms.settings), ...(cms.settings || {}) };
  panel.append(
    selectField(
      "Raspored artikala na stranici",
      String(cms.settings.productGridColumns || 4),
      [
        { value: "4", label: "4 artikla u redu" },
        { value: "3", label: "3 artikla u redu" },
      ],
      (value) => (cms.settings.productGridColumns = Number(value) === 3 ? 3 : 4)
    )
  );

  const layoutHint = document.createElement("p");
  layoutHint.className = "admin-note-text";
  layoutHint.textContent = "Desktop prikaz: 4 artikla u redu je kompaktniji katalog, 3 artikla u redu ostavlja veće kartice.";
  panel.appendChild(layoutHint);

  const contactTitle = document.createElement("h3");
  contactTitle.textContent = "Kontakt postavke";
  panel.appendChild(contactTitle);
  panel.append(
    field("WhatsApp broj bez plusa", cms.contact.whatsapp, (value) => (cms.contact.whatsapp = value)),
    field("Viber broj bez plusa", cms.contact.viber, (value) => (cms.contact.viber = value)),
    field("Kontakt email", cms.contact.email, (value) => (cms.contact.email = value)),
    field("Zadana poruka za proizvode", cms.contact.defaultMessage, (value) => (cms.contact.defaultMessage = value), "textarea"),
    field("WhatsApp template za upit", cms.contact.orderMessageTemplate, (value) => (cms.contact.orderMessageTemplate = value), "textarea"),
    field("Viber template za upit", cms.contact.viberMessageTemplate, (value) => (cms.contact.viberMessageTemplate = value), "textarea"),
    field("Email naslov za upit", cms.contact.emailSubjectTemplate, (value) => (cms.contact.emailSubjectTemplate = value)),
    field("Email tekst za upit", cms.contact.emailBodyTemplate, (value) => (cms.contact.emailBodyTemplate = value), "textarea"),
    field("WhatsApp/Viber template za kupca", cms.contact.customerMessageTemplate, (value) => (cms.contact.customerMessageTemplate = value), "textarea"),
    field("Email naslov za kupca", cms.contact.customerEmailSubjectTemplate, (value) => (cms.contact.customerEmailSubjectTemplate = value)),
    field("Email tekst za kupca", cms.contact.customerEmailBodyTemplate, (value) => (cms.contact.customerEmailBodyTemplate = value), "textarea")
  );
  const hint = document.createElement("p");
  hint.className = "admin-note-text";
  hint.textContent = "Dostupne varijable: {ime}, {email}, {telefon}, {broj_upita}, {status}, {artikli}, {napomena}.";
  panel.appendChild(hint);
}

const sectionLabels = {
  hero: "Hero / početni dio",
  trust: "Traka prednosti",
  categoryShowcase: "Kategorije",
  products: "Proizvodi",
  comingSoonShowcase: "Proizvodi uskoro",
  comparison: "Usporedba",
  service: "Servis i podrška",
  parts: "Rezervni dijelovi",
  manuals: "Manuali",
  delivery: "Dostava i povrat",
  locations: "Lokacije",
  blog: "Blog",
  faq: "FAQ / podrška",
  contact: "Kontakt traka",
  footer: "Footer / donji dio stranice",
};

function renderSections() {
  const panel = $('[data-panel="sections"]');
  cms.sections = { ...structuredClone(defaultCms.sections), ...(cms.sections || {}) };
  panel.innerHTML = `
    <div class="admin-panel-heading">
      <h2>Vidljivost sekcija</h2>
      <p class="admin-note-text">Isključena sekcija se ne prikazuje na javnoj stranici i njeni linkovi se sakrivaju iz navigacije.</p>
    </div>
    <div class="section-toggle-grid">
      ${Object.entries(sectionLabels)
        .map(
          ([key, label]) => `
            <label class="section-toggle">
              <input type="checkbox" data-section-toggle="${key}" ${cms.sections[key] !== false ? "checked" : ""} />
              <span>${label}</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;

  document.querySelectorAll("[data-section-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      cms.sections[input.dataset.sectionToggle] = input.checked;
    });
  });
}

function renderArrayPanel(panelId, title, items, emptyItem, renderItem) {
  const panel = $(`[data-panel="${panelId}"]`);
  panel.innerHTML = `<div class="admin-panel-heading"><h2>${title}</h2><button class="btn btn-primary" type="button">Dodaj</button></div>`;
  panel.querySelector("button").addEventListener("click", () => {
    items.unshift(structuredClone(emptyItem));
    renderAll();
  });

  const list = document.createElement("div");
  list.className = "admin-card-list";
  items.forEach((item, index) => {
    const itemCard = card(item.name || item.title || item.q || "Novi unos", () => {
      items.splice(index, 1);
      renderAll();
    });
    renderItem(itemCard, item, index);
    list.appendChild(itemCard);
  });
  panel.appendChild(list);
}

function checkboxField(label, checked, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "cms-check-field";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}

function pruneEmptyCategories() {
  const usedCategories = new Set((cms.products || []).map((product) => product.category).filter(Boolean));
  const before = (cms.categories || []).length;
  cms.categories = (cms.categories || []).filter((category) => usedCategories.has(category.name));
  return before - cms.categories.length;
}

function closeCategoryEditor() {
  $("#categoryEditModal")?.remove();
  editingCategoryIndex = null;
  editingCategoryAttributeIndex = null;
  document.body.classList.remove("modal-open");
  renderCategories();
}

function openCategoryEditor(index) {
  editingCategoryIndex = index;
  editingCategoryAttributeIndex = null;
  renderCategoryEditorModal();
}

function renderCategoryEditorModal() {
  const category = cms.categories[editingCategoryIndex];
  if (!category) return;

  category.enabled = category.enabled !== false;
  category.badge = category.badge || "-";
  category.badgeUntil = category.badgeUntil || "";
  ensureCategoryAttributes(category);
  cms.badges = Array.isArray(cms.badges) ? cms.badges : structuredClone(defaultCms.badges);

  const badgeOptions = [
    { value: "-", label: "- (bez badgea)" },
    ...cms.badges
      .filter((badge) => badge.name && badge.name !== "-" && badge.enabled !== false)
      .map((badge) => ({ value: badge.name, label: badge.name })),
  ];
  const productCount = (cms.products || []).filter((product) => product.category === category.name).length;

  $("#categoryEditModal")?.remove();
  const modal = document.createElement("div");
  modal.className = "product-edit-modal";
  modal.id = "categoryEditModal";
  modal.innerHTML = `
    <div class="product-edit-dialog category-edit-dialog" role="dialog" aria-modal="true" aria-label="Uredi kategoriju">
      <div class="product-edit-header">
        <div>
          <span>Uredi kategoriju</span>
          <h2>${escapeHtml(category.name || "Kategorija")}</h2>
          <p>${productCount} proizvoda u ovoj kategoriji</p>
        </div>
        <div class="product-edit-actions">
          <button class="btn btn-secondary" type="button" id="deleteCategoryBtn">Obriši</button>
          <button class="btn btn-primary" type="button" id="closeCategoryEditorBtn">Zatvori</button>
        </div>
      </div>
      <div class="product-edit-body" id="categoryEditBody"></div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCategoryEditor();
  });
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  $("#closeCategoryEditorBtn").addEventListener("click", closeCategoryEditor);
  $("#deleteCategoryBtn").addEventListener("click", () => {
    if (productCount > 0 && !confirm("Ova kategorija ima proizvode. Ako je obrišete, proizvodi će zadržati naziv kategorije dok ga ne promijenite. Nastaviti?")) return;
    cms.categories.splice(editingCategoryIndex, 1);
    closeCategoryEditor();
  });

  const body = $("#categoryEditBody");
  const basic = editorSection("Osnovno");
  basic.content.append(
    field("Naziv", category.name, (value) => {
      const oldName = category.name;
      category.name = value;
      (cms.products || []).forEach((product) => {
        if (product.category === oldName) product.category = value;
      });
      (cms.manuals || []).forEach((manual) => {
        if (manual.category === oldName) manual.category = value;
      });
      (cms.badges || []).forEach((badge) => {
        if (badge.applyCategory === oldName) badge.applyCategory = value;
      });
    }),
    field("Opis", category.text, (value) => (category.text = value), "textarea"),
    checkboxField("Prikaži ovu kategoriju kao filter na stranici", category.enabled, (value) => (category.enabled = value))
  );

  const badge = editorSection("Badge kategorije");
  badge.content.append(
    selectField("Badge za kategoriju", category.badge, badgeOptions, (value) => (category.badge = value)),
    field("Badge kategorije traje do", category.badgeUntil, (value) => (category.badgeUntil = value), "date")
  );

  const attributes = editorSection("Atributi kategorije", "product-edit-wide");
  attributes.section.classList.add("category-attributes-section");
  const helper = document.createElement("p");
  helper.className = "admin-note-text";
  helper.textContent = "Napravite atribute za ovu kategoriju. Vrijednosti pišite jednu po redu, npr. do 30 km, do 45 km, do 60 km.";
  attributes.content.append(helper);

  const list = document.createElement("div");
  list.className = "attribute-builder-list";
  if (!category.attributes.length) {
    const empty = document.createElement("div");
    empty.className = "product-admin-empty";
    empty.textContent = "Nema atributa za ovu kategoriju.";
    list.appendChild(empty);
  }

  category.attributes.forEach((attribute, attributeIndex) => {
    const item = document.createElement("article");
    item.className = `attribute-list-item ${editingCategoryAttributeIndex === attributeIndex ? "active" : ""}`;

    const row = document.createElement("div");
    row.className = "attribute-list-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(attribute.name || "Novi atribut")}</strong>
        <span>${Array.isArray(attribute.values) ? attribute.values.length : 0} vrijednosti</span>
      </div>
      <button class="btn btn-secondary" type="button" data-edit-attribute="${attributeIndex}">
        ${editingCategoryAttributeIndex === attributeIndex ? "Zatvori" : "Uredi"}
      </button>
    `;
    item.appendChild(row);

    if (editingCategoryAttributeIndex === attributeIndex) {
      const panel = document.createElement("div");
      panel.className = "attribute-edit-panel";
      panel.append(
        field("Naziv atributa", attribute.name, (value) => {
          const oldName = attribute.name;
          attribute.name = value;
          (cms.products || [])
            .filter((product) => product.category === category.name)
            .forEach((product) => {
              if (product.attributes?.[oldName] && oldName !== value) {
                product.attributes[value] = product.attributes[oldName];
                delete product.attributes[oldName];
              }
              if (product.specs?.[oldName] && oldName !== value) {
                product.specs[value] = product.specs[oldName];
                delete product.specs[oldName];
              }
            });
        }),
        field("Vrijednosti, jedna po redu", valuesToText(Array.isArray(attribute.values) ? attribute.values : []), (value) => {
          attribute.values = textToValues(value);
        }, "textarea")
      );

      const actions = document.createElement("div");
      actions.className = "attribute-edit-actions";
      const remove = document.createElement("button");
      remove.className = "btn btn-secondary";
      remove.type = "button";
      remove.textContent = "Ukloni atribut";
      remove.addEventListener("click", () => {
        const removedAttributeName = attribute.name;
        category.attributes.splice(attributeIndex, 1);
        (cms.products || [])
          .filter((product) => product.category === category.name)
          .forEach((product) => {
            if (product.attributes && typeof product.attributes === "object") {
              delete product.attributes[removedAttributeName];
            }
            if (product.specs && typeof product.specs === "object") {
              delete product.specs[removedAttributeName];
            }
          });
        editingCategoryAttributeIndex = null;
        renderCategoryEditorModal();
      });
      actions.appendChild(remove);
      panel.appendChild(actions);
      item.appendChild(panel);
    }

    list.appendChild(item);
  });
  attributes.content.appendChild(list);

  list.querySelectorAll("[data-edit-attribute]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.editAttribute);
      editingCategoryAttributeIndex = editingCategoryAttributeIndex === index ? null : index;
      renderCategoryEditorModal();
    });
  });

  const addAttribute = document.createElement("button");
  addAttribute.className = "btn btn-secondary attribute-add-button";
  addAttribute.type = "button";
  addAttribute.textContent = "Dodaj atribut";
  addAttribute.addEventListener("click", () => {
    category.attributes.push({ name: "Novi atribut", values: [] });
    editingCategoryAttributeIndex = category.attributes.length - 1;
    renderCategoryEditorModal();
  });
  attributes.content.appendChild(addAttribute);

  body.append(basic.section, badge.section, attributes.section);
}

function renderCategories() {
  cms.badges = Array.isArray(cms.badges) ? cms.badges : structuredClone(defaultCms.badges);
  const panel = $('[data-panel="categories"]');
  panel.innerHTML = `
    <div class="admin-panel-heading">
      <div>
        <h2>Kategorije</h2>
        <p class="admin-note-text">Kategorije su sada prikazane kao lista. Detalje, filter status, badge i atribute uređujete klikom na Uredi.</p>
      </div>
      <button class="btn btn-primary" type="button" id="addCategoryBtn">Dodaj</button>
    </div>
    <div class="category-admin-list">
      <div class="category-admin-row category-admin-head">
        <span>Naziv</span>
        <span>Proizvodi</span>
        <span>Filter</span>
        <span>Atributi</span>
        <span>Badge</span>
        <span></span>
      </div>
      ${
        cms.categories.length
          ? cms.categories
              .map((category, index) => {
                category.enabled = category.enabled !== false;
                category.badge = category.badge || "-";
                const count = (cms.products || []).filter((product) => product.category === category.name).length;
                const attributes = ensureCategoryAttributes(category);
                return `
                  <div class="category-admin-row ${category.enabled ? "" : "category-disabled"}">
                    <strong>${escapeHtml(category.name || "Nova kategorija")}</strong>
                    <span>${count}</span>
                    <span class="badge ${category.enabled ? "red" : ""}">${category.enabled ? "Filter na stranici" : "Sakriven filter"}</span>
                    <span>${attributes.length}</span>
                    <span>${escapeHtml(category.badge && category.badge !== "-" ? category.badge : "-")}</span>
                    <button class="btn btn-secondary" type="button" data-edit-category="${index}">Uredi</button>
                  </div>
                `;
              })
              .join("")
          : `<div class="product-admin-empty">Nema kategorija.</div>`
      }
    </div>
  `;

  $("#addCategoryBtn").addEventListener("click", () => {
    cms.categories.unshift({ name: "Nova kategorija", text: "", enabled: true, badge: "-", badgeUntil: "", attributes: [] });
    openCategoryEditor(0);
  });

  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", () => openCategoryEditor(Number(button.dataset.editCategory)));
  });
}

function renderBadges() {
  cms.badges = Array.isArray(cms.badges) ? cms.badges : structuredClone(defaultCms.badges);
  renderArrayPanel("badges", "Badgevi", cms.badges, { name: "Novi badge", enabled: true }, (itemCard, item) => {
    item.enabled = item.enabled !== false;

    itemCard.append(field("Naziv badgea", item.name, (value) => (item.name = value)));
    itemCard.append(selectField("Status badgea", item.enabled ? "Aktivan" : "Isključen", ["Aktivan", "Isključen"], (value) => (item.enabled = value === "Aktivan")));
  });
}

function renderProducts() {
  const { categoryOptions: categoryOptionsBase, badgeOptions } = productEditorConfig();
  const panel = $('[data-panel="products"]');
  const productCategories = ["Sve", ...categoryOptionsBase];
  const productBadges = ["Sve", "-", ...new Set(cms.badges.filter((badge) => badge.enabled !== false).map((badge) => badge.name).filter(Boolean))];
  const filteredProducts = cms.products.filter((product) => {
    const matchesName = (product.name || "").toLowerCase().includes(productFilters.search.toLowerCase());
    const matchesCategory = productFilters.category === "Sve" || product.category === productFilters.category;
    const matchesBadge = productFilters.badge === "Sve" || (product.badge || "-") === productFilters.badge;
    const visibility = product.enabled !== false ? "Aktivan" : "Neaktivan";
    const matchesVisibility = productFilters.visibility === "Sve" || visibility === productFilters.visibility;
    return matchesName && matchesCategory && matchesBadge && matchesVisibility;
  });

  panel.innerHTML = `
    <div class="admin-panel-heading">
      <h2>Proizvodi</h2>
      <button class="btn btn-primary" type="button" id="addProductBtn">Dodaj</button>
    </div>
    <div class="product-admin-filters">
      <input id="productSearch" type="search" placeholder="Pretraži po nazivu..." value="${escapeHtml(productFilters.search)}" />
      <select id="productCategoryFilter">
        ${productCategories.map((category) => `<option value="${escapeHtml(category)}" ${category === productFilters.category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
      </select>
      <select id="productBadgeFilter">
        ${productBadges.map((badge) => `<option value="${escapeHtml(badge)}" ${badge === productFilters.badge ? "selected" : ""}>${escapeHtml(badge === "-" ? "- (bez badgea)" : badge)}</option>`).join("")}
      </select>
      <select id="productVisibilityFilter">
        ${["Sve", "Aktivan", "Neaktivan"].map((visibility) => `<option value="${visibility}" ${visibility === productFilters.visibility ? "selected" : ""}>${visibility === "Sve" ? "Svi proizvodi" : visibility}</option>`).join("")}
      </select>
    </div>
    <div class="product-admin-list">
      <div class="product-admin-row product-admin-head">
        <span>Naziv</span>
        <span>Prikaz cijene</span>
        <span>Kategorija</span>
        <span>Badge</span>
        <span>Vidljivost</span>
        <span></span>
      </div>
      ${
        filteredProducts.length
          ? filteredProducts
              .map((product) => {
                const index = cms.products.indexOf(product);
                const categoryOptions = [...categoryOptionsBase];
                if (!categoryOptions.includes(product.category)) categoryOptions.unshift(product.category || "Bez kategorije");
                const rowBadgeOptions = [...badgeOptions];
                if (product.badge && !rowBadgeOptions.some((badge) => badge.value === product.badge)) {
                  rowBadgeOptions.unshift({ value: product.badge, label: product.badge });
                }
                return `
                  <div class="product-admin-row ${editingProductId === product.id ? "active" : ""} ${product.enabled === false ? "product-disabled" : ""} ${productMissingSaleDate(product) ? "product-missing-sale-date" : ""}">
                    <input data-product-field="name" data-product-index="${index}" value="${escapeHtml(product.name)}" />
                    ${adminPriceHtml(product)}
                    <select data-product-field="category" data-product-index="${index}">
                      ${categoryOptions.map((category) => `<option value="${escapeHtml(category)}" ${category === product.category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
                    </select>
                    <select data-product-field="badge" data-product-index="${index}" aria-label="Badge za ${escapeHtml(product.name)}">
                      ${rowBadgeOptions.map((badge) => `<option value="${escapeHtml(badge.value)}" ${badge.value === (product.badge || "-") ? "selected" : ""}>${escapeHtml(badge.label)}</option>`).join("")}
                    </select>
                    <label class="product-active-toggle">
                      <input type="checkbox" data-product-enabled="${index}" ${product.enabled !== false ? "checked" : ""} />
                      <span>${product.enabled !== false ? "Aktivan" : "Neaktivan"}</span>
                    </label>
                    <div class="product-admin-actions">
                      <a class="btn btn-secondary" href="admin.html?panel=products&product=${encodeURIComponent(product.id)}" data-edit-product="${escapeHtml(product.id)}">Uredi</a>
                    </div>
                  </div>
                `;
              })
              .join("")
          : `<div class="product-admin-empty">Nema proizvoda za odabrane filtere.</div>`
      }
    </div>
  `;

  $("#addProductBtn").addEventListener("click", () => {
    const defaultProduct = createDefaultProduct();
    cms.products.unshift(structuredClone(defaultProduct));
    editingProductId = cms.products[0].id;
    renderProducts();
    openProductEditor(editingProductId);
  });
  $("#productSearch").addEventListener("input", (event) => {
    productFilters.search = event.target.value;
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => rerenderAfterTyping(event.target, renderProducts), 500);
  });
  $("#productCategoryFilter").addEventListener("change", (event) => {
    productFilters.category = event.target.value;
    renderProducts();
  });
  $("#productBadgeFilter").addEventListener("change", (event) => {
    productFilters.badge = event.target.value;
    renderProducts();
  });
  $("#productVisibilityFilter").addEventListener("change", (event) => {
    productFilters.visibility = event.target.value;
    renderProducts();
  });

  document.querySelectorAll("[data-product-field]").forEach((input) => {
    input.addEventListener("input", () => {
      cms.products[Number(input.dataset.productIndex)][input.dataset.productField] = input.value;
    });
    input.addEventListener("change", () => {
      cms.products[Number(input.dataset.productIndex)][input.dataset.productField] = input.value;
    });
  });

  document.querySelectorAll("[data-product-enabled]").forEach((input) => {
    input.addEventListener("change", () => {
      cms.products[Number(input.dataset.productEnabled)].enabled = input.checked;
      renderProducts();
    });
  });

  document.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) {
        return;
      }
      event.preventDefault();
      openProductEditor(button.dataset.editProduct);
    });
  });

  return;

  if (!editorProduct) {
    editorWrap.innerHTML = `<div class="product-admin-empty">Odaberite proizvod iz liste za detaljno uređivanje.</div>`;
    return;
  }

  const itemCard = card(`Uredi: ${editorProduct.name || "Proizvod"}`, () => {
    const index = cms.products.indexOf(editorProduct);
    cms.products.splice(index, 1);
    editingProductId = null;
    renderProducts();
  });
  const categoryOptions = [...categoryOptionsBase];
  if (!categoryOptions.includes(editorProduct.category)) {
    categoryOptions.unshift(editorProduct.category || "Bez kategorije");
  }

  itemCard.append(field("ID", editorProduct.id, (value) => {
    editorProduct.id = value;
    editingProductId = value;
  }));
  itemCard.append(field("Naziv", editorProduct.name, (value) => (editorProduct.name = value)));
  itemCard.append(selectField("Kategorija", editorProduct.category, categoryOptions, (value) => (editorProduct.category = value)));
  itemCard.append(selectField("Status", editorProduct.status, statusOptions.includes(editorProduct.status) ? statusOptions : [editorProduct.status, ...statusOptions], (value) => (editorProduct.status = value)));
  itemCard.append(selectField("Badge", editorProduct.badge || "-", badgeOptions, (value) => (editorProduct.badge = value)));
  itemCard.append(numberField("MPC - maloprodajna cijena", editorProduct.mpcPrice, (value) => (editorProduct.mpcPrice = value)));
  itemCard.append(numberField("Cijena s popustom", editorProduct.discountPrice, (value) => (editorProduct.discountPrice = value)));
  itemCard.append(numberField("Akcijska cijena", editorProduct.salePrice, (value) => (editorProduct.salePrice = value)));
  itemCard.append(field("Akcija traje do", editorProduct.saleUntil, (value) => (editorProduct.saleUntil = value), "date"));
  itemCard.append(field("Badge traje do", editorProduct.badgeUntil, (value) => (editorProduct.badgeUntil = value), "date"));
  itemCard.append(field("Rok isporuke", editorProduct.deliveryTime, (value) => (editorProduct.deliveryTime = value)));
  itemCard.append(selectField("Boja kartice", editorProduct.tone === "dark" ? "light" : editorProduct.tone, ["red", "light"], (value) => (editorProduct.tone = value)));
  itemCard.append(imageUploadField("Glavna slika proizvoda", editorProduct.image, (path) => (editorProduct.image = path)));
  itemCard.append(galleryField(editorProduct));
  itemCard.append(productManualField(editorProduct));
  itemCard.append(field("Kratak opis", editorProduct.summary, (value) => (editorProduct.summary = value), "textarea"));
  itemCard.append(richTextField("Detaljan opis artikla", editorProduct.detailedDescription, (value) => (editorProduct.detailedDescription = value)));
  itemCard.append(field("Specifikacije, jedna po redu: Naziv: vrijednost", specsToText(editorProduct.specs), (value) => (editorProduct.specs = textToSpecs(value)), "textarea"));
  editorWrap.appendChild(itemCard);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function itemsText(items = []) {
  return items.map((item) => `- ${item.name || "Proizvod"} x${Number(item.quantity) || 1}${item.price ? ` (${item.price})` : ""}`).join("\n");
}

function applyTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => values[key] ?? match);
}

function orderTemplateValues(order) {
  return {
    ime: order.customerName || "Kupac",
    email: order.customerEmail || "",
    telefon: order.phone || "",
    broj_upita: order.id || "",
    status: order.status || "Novo",
    artikli: itemsText(order.items || []),
    napomena: order.note || "",
  };
}

function customerTemplateValues(customer) {
  return {
    ime: customer.name || "Kupac",
    email: customer.email || "",
    telefon: customer.phone || "",
    broj_upita: customer.orders?.[0]?.id || "",
    status: customer.lastOrderStatus || customer.orders?.[0]?.status || "",
    artikli: itemsText(customer.orders?.[0]?.items || []),
    napomena: customer.orders?.[0]?.note || "",
  };
}

function orderMessage(order, channel = "whatsapp") {
  const template = channel === "viber" ? cms.contact.viberMessageTemplate : cms.contact.orderMessageTemplate;
  return applyTemplate(template, orderTemplateValues(order));
}

function orderEmailSubject(order) {
  return applyTemplate(cms.contact.emailSubjectTemplate, orderTemplateValues(order));
}

function orderEmailBody(order) {
  return applyTemplate(cms.contact.emailBodyTemplate, orderTemplateValues(order));
}

function customerMessage(customer) {
  return applyTemplate(cms.contact.customerMessageTemplate, customerTemplateValues(customer));
}

function customerEmailSubject(customer) {
  return applyTemplate(cms.contact.customerEmailSubjectTemplate, customerTemplateValues(customer));
}

function customerEmailBody(customer) {
  return applyTemplate(cms.contact.customerEmailBodyTemplate, customerTemplateValues(customer));
}

function mailtoUrl(email, subject, body) {
  return `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`;
}

async function updateOrderStatus(orderId, status) {
  try {
    const data = await api("admin-order-status", { orderId: Number(orderId), status });
    orders = data.orders || [];
    await loadCustomers();
    renderOrders();
    if ($("#orderDetailModal")) renderOrderDetailModal(Number(orderId));
    flash("Status narudžbe je ažuriran.");
  } catch (error) {
    flash(error.message);
  }
}

async function updateOrderNote(orderId, note) {
  try {
    const data = await api("admin-order-note", { orderId: Number(orderId), note });
    orders = data.orders || [];
    await loadCustomers();
    renderOrders();
    if ($("#orderDetailModal")) renderOrderDetailModal(Number(orderId));
    flash("Interna napomena je sačuvana.");
  } catch (error) {
    flash(error.message);
  }
}

function filteredOrders() {
  const search = orderFilters.search.toLowerCase().trim();
  return orders.filter((order) => {
    const itemNames = (order.items || []).map((item) => item.name).join(" ");
    const haystack = [order.id, order.customerName, order.customerEmail, order.phone, itemNames]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    const matchesSearch = !search || haystack.includes(search);
    const matchesStatus = orderFilters.status === "Sve" || order.status === orderFilters.status;
    const orderDate = String(order.createdAt || "").slice(0, 10);
    const matchesDateFrom = !orderFilters.date || orderDate >= orderFilters.date;
    const matchesDateTo = !orderFilters.dateTo || orderDate <= orderFilters.dateTo;
    const matchesProduct =
      orderFilters.product === "Sve" || (order.items || []).some((item) => item.name === orderFilters.product);
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesProduct;
  });
}

function orderStatusClass(status) {
  if (status === "Novo") return "red";
  if (status === "U obradi" || status === "Kontaktiran") return "dark";
  return "light";
}

function closeOrderDetail() {
  $("#orderDetailModal")?.remove();
  document.body.classList.remove("modal-open");
}

function renderOrderDetailModal(orderId) {
  const order = orders.find((item) => Number(item.id) === Number(orderId));
  if (!order) return;

  $("#orderDetailModal")?.remove();
  const statuses = ["Novo", "U obradi", "Kontaktiran", "Završeno", "Otkazano"];
  const phone = normalizePhone(order.phone);
  const whatsapp = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(order, "whatsapp"))}` : "";
  const viber = phone ? `viber://chat?number=%2B${phone}&text=${encodeURIComponent(orderMessage(order, "viber"))}` : "";
  const emailUrl = mailtoUrl(order.customerEmail || "", orderEmailSubject(order), orderEmailBody(order));
  const items = (order.items || [])
    .map((item) => `<li><span>${escapeHtml(item.name)} x${Number(item.quantity) || 1}</span><strong>${escapeHtml(item.price || "0")}</strong></li>`)
    .join("");

  const modal = document.createElement("div");
  modal.className = "product-edit-modal";
  modal.id = "orderDetailModal";
  modal.innerHTML = `
    <div class="product-edit-dialog order-detail-dialog" role="dialog" aria-modal="true" aria-label="Detalji narudžbe">
      <div class="product-edit-header">
        <div>
          <span>Upit #${order.id}</span>
          <h2>${escapeHtml(order.customerName || "Kupac")}</h2>
          <p>${escapeHtml(order.customerEmail || "")}${order.phone ? ` · ${escapeHtml(order.phone)}` : ""}</p>
        </div>
        <div class="product-edit-actions">
          ${phone ? `<a class="btn btn-secondary" href="${whatsapp}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}
          ${phone ? `<a class="btn btn-secondary" href="${viber}">Viber</a>` : ""}
          <a class="btn btn-secondary" href="${emailUrl}">Email</a>
          <button class="btn btn-primary" type="button" id="closeOrderDetailBtn">Zatvori</button>
        </div>
      </div>
      <div class="order-detail-body">
        <section class="order-detail-section">
          <h3>Status</h3>
          <select id="orderDetailStatus">
            ${statuses.map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
          <p>${escapeHtml(formatDateTime(order.createdAt))}</p>
        </section>
        <section class="order-detail-section">
          <h3>Artikli</h3>
          <ul class="order-items">${items}</ul>
        </section>
        <section class="order-detail-section">
          <h3>Napomena kupca</h3>
          ${order.note ? `<p class="order-note">${escapeHtml(order.note)}</p>` : `<p class="order-note">Nema napomene kupca.</p>`}
        </section>
        <section class="order-detail-section">
          <h3>Interna napomena</h3>
          <textarea id="orderDetailNote" placeholder="Npr. kupac čeka poziv, provjeriti dostupnost...">${escapeHtml(order.adminNote || "")}</textarea>
          <button class="btn btn-secondary" type="button" id="saveOrderDetailNoteBtn">Sačuvaj napomenu</button>
        </section>
      </div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeOrderDetail();
  });
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  $("#closeOrderDetailBtn").addEventListener("click", closeOrderDetail);
  $("#orderDetailStatus").addEventListener("change", (event) => updateOrderStatus(order.id, event.target.value));
  $("#saveOrderDetailNoteBtn").addEventListener("click", () => updateOrderNote(order.id, $("#orderDetailNote").value));
}

function renderOrders() {
  const panel = $('[data-panel="orders"]');
  const statuses = ["Novo", "U obradi", "Kontaktiran", "Završeno", "Otkazano"];
  const productOptions = [
    "Sve",
    ...new Set(orders.flatMap((order) => (order.items || []).map((item) => item.name).filter(Boolean))),
  ];
  const visibleOrders = filteredOrders();

  panel.innerHTML = `
    <div class="admin-panel-heading">
      <div>
        <h2>Narudžbe i upiti</h2>
        <p class="admin-note-text">Filtrirajte po kupcu, telefonu, artiklu, statusu ili datumu. Detalji otvaraju poruku za WhatsApp, Viber i email.</p>
      </div>
      <button class="btn btn-secondary" type="button" id="refreshOrdersBtn">Osvježi</button>
    </div>
    <div class="order-filters">
      <input id="orderSearch" type="search" placeholder="Ime, email, telefon, broj upita ili artikal..." value="${escapeHtml(orderFilters.search)}" />
      <select id="orderStatusFilter">
        ${["Sve", ...statuses].map((status) => `<option value="${status}" ${status === orderFilters.status ? "selected" : ""}>${status}</option>`).join("")}
      </select>
      <select id="orderProductFilter">
        ${productOptions.map((product) => `<option value="${escapeHtml(product)}" ${product === orderFilters.product ? "selected" : ""}>${escapeHtml(product)}</option>`).join("")}
      </select>
      <input id="orderDateFilter" type="date" value="${escapeHtml(orderFilters.date)}" aria-label="Datum od" />
      <input id="orderDateToFilter" type="date" value="${escapeHtml(orderFilters.dateTo)}" aria-label="Datum do" />
      <button class="btn btn-secondary" type="button" id="clearOrderFiltersBtn">Očisti</button>
    </div>
    <div class="order-stats-strip">
      <span><strong>${visibleOrders.length}</strong> prikazano</span>
      <span><strong>${orders.length}</strong> ukupno</span>
      <span><strong>${orders.filter((order) => order.status === "Novo").length}</strong> novih</span>
    </div>
    <div class="orders-list">
      ${
        visibleOrders.length
          ? visibleOrders
              .map((order) => {
                const itemCount = (order.items || []).reduce((total, item) => total + (Number(item.quantity) || 1), 0);
                const itemsPreview = (order.items || [])
                  .map((item) => `${escapeHtml(item.name)} x${Number(item.quantity) || 1}`)
                  .join(", ");
                return `
                  <article class="order-row">
                    <div>
                      <span class="order-id">#${order.id}</span>
                      <strong>${escapeHtml(order.customerName || "Kupac")}</strong>
                      <p>${escapeHtml(order.customerEmail || "")}${order.phone ? ` · ${escapeHtml(order.phone)}` : ""}</p>
                    </div>
                    <span class="badge ${orderStatusClass(order.status)}">${escapeHtml(order.status || "Novo")}</span>
                    <div class="order-row-items">
                      <strong>${itemCount} artikala</strong>
                      <span>${itemsPreview || "Nema artikala"}</span>
                    </div>
                    <span>${escapeHtml(formatDateOnly(order.createdAt))}</span>
                    <button class="btn btn-secondary" type="button" data-order-detail="${order.id}">Detalji</button>
                  </article>
                `;
              })
              .join("")
          : `<div class="product-admin-empty">Nema upita za odabrane filtere.</div>`
      }
    </div>
  `;

  $("#orderSearch").addEventListener("input", (event) => {
    orderFilters.search = event.target.value;
    clearTimeout(orderSearchTimer);
    orderSearchTimer = setTimeout(() => rerenderAfterTyping(event.target, renderOrders), 500);
  });
  $("#orderStatusFilter").addEventListener("change", (event) => {
    orderFilters.status = event.target.value;
    renderOrders();
  });
  $("#orderProductFilter").addEventListener("change", (event) => {
    orderFilters.product = event.target.value;
    renderOrders();
  });
  $("#orderDateFilter").addEventListener("change", (event) => {
    orderFilters.date = event.target.value;
    renderOrders();
  });
  $("#orderDateToFilter").addEventListener("change", (event) => {
    orderFilters.dateTo = event.target.value;
    renderOrders();
  });
  $("#clearOrderFiltersBtn").addEventListener("click", () => {
    orderFilters = { search: "", status: "Sve", date: "", dateTo: "", product: "Sve" };
    renderOrders();
  });

  $("#refreshOrdersBtn").addEventListener("click", async () => {
    await loadOrders();
    renderOrders();
  });

  document.querySelectorAll("[data-order-detail]").forEach((button) => {
    button.addEventListener("click", () => renderOrderDetailModal(Number(button.dataset.orderDetail)));
  });
}
function filteredCustomers() {
  const search = customerFilters.search.toLowerCase().trim();
  return customers.filter((customer) => {
    const haystack = [customer.id, customer.name, customer.email, customer.phone]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return !search || haystack.includes(search);
  });
}

function closeCustomerDetail() {
  $("#customerDetailModal")?.remove();
  document.body.classList.remove("modal-open");
}

function renderCustomerDetailModal(customerId) {
  const customer = customers.find((item) => Number(item.id) === Number(customerId));
  if (!customer) return;

  $("#customerDetailModal")?.remove();
  const phone = normalizePhone(customer.phone);
  const customerText = customerMessage(customer);
  const whatsapp = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(customerText)}` : "";
  const viber = phone ? `viber://chat?number=%2B${phone}&text=${encodeURIComponent(customerText)}` : "";
  const emailUrl = mailtoUrl(customer.email || "", customerEmailSubject(customer), customerEmailBody(customer));
  const orderItems = (customer.orders || [])
    .map((order) => {
      const items = (order.items || []).map((item) => `${escapeHtml(item.name)} x${Number(item.quantity) || 1}`).join(", ");
      return `
        <article class="customer-order-mini">
          <div>
            <span class="order-id">#${order.id}</span>
            <strong>${escapeHtml(order.status || "Novo")}</strong>
            <p>${escapeHtml(formatDateTime(order.createdAt))}</p>
            <p>${items || "Bez artikala"}</p>
          </div>
          <button class="btn btn-secondary" type="button" data-customer-order="${order.id}">Otvori upit</button>
        </article>
      `;
    })
    .join("");

  const modal = document.createElement("div");
  modal.className = "product-edit-modal";
  modal.id = "customerDetailModal";
  modal.innerHTML = `
    <div class="product-edit-dialog customer-detail-dialog" role="dialog" aria-modal="true" aria-label="Detalji kupca">
      <div class="product-edit-header">
        <div>
          <span>Kupac #${customer.id}</span>
          <h2>${escapeHtml(customer.name || "Kupac")}</h2>
          <p>${escapeHtml(customer.email || "")}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}</p>
        </div>
        <div class="product-edit-actions">
          ${phone ? `<a class="btn btn-secondary" href="${whatsapp}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}
          ${phone ? `<a class="btn btn-secondary" href="${viber}">Viber</a>` : ""}
          <a class="btn btn-secondary" href="${emailUrl}">Email</a>
          <button class="btn btn-primary" type="button" id="closeCustomerDetailBtn">Zatvori</button>
        </div>
      </div>
      <div class="customer-detail-body">
        <section class="order-detail-section">
          <h3>Profil</h3>
          <p><strong>Email:</strong> ${escapeHtml(customer.email || "-")}</p>
          <p><strong>Telefon:</strong> ${escapeHtml(customer.phone || "-")}</p>
          <p><strong>Registrovan:</strong> ${escapeHtml(formatDateTime(customer.createdAt))}</p>
          <p><strong>Ukupno upita:</strong> ${Number(customer.orderCount) || 0}</p>
        </section>
        <section class="order-detail-section customer-orders-section">
          <h3>Upiti kupca</h3>
          ${orderItems || `<p class="order-note">Kupac još nema poslanih upita.</p>`}
        </section>
      </div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCustomerDetail();
  });
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  $("#closeCustomerDetailBtn").addEventListener("click", closeCustomerDetail);
  document.querySelectorAll("[data-customer-order]").forEach((button) => {
    button.addEventListener("click", () => {
      closeCustomerDetail();
      activePanel = "orders";
      orderFilters.search = String(button.dataset.customerOrder);
      renderAll();
      renderOrderDetailModal(Number(button.dataset.customerOrder));
    });
  });
}

function renderCustomers() {
  const panel = $('[data-panel="customers"]');
  const visibleCustomers = filteredCustomers();

  panel.innerHTML = `
    <div class="admin-panel-heading">
      <h2>Kupci</h2>
      <button class="btn btn-secondary" type="button" id="refreshCustomersBtn">Osvježi</button>
    </div>
    <div class="customer-filters">
      <input id="customerSearch" type="search" placeholder="Pretraži ime, email ili telefon..." value="${escapeHtml(customerFilters.search)}" />
      <button class="btn btn-secondary" type="button" id="clearCustomerFiltersBtn">Očisti</button>
    </div>
    <div class="customers-list">
      ${
        visibleCustomers.length
          ? visibleCustomers
              .map(
                (customer) => `
                  <article class="customer-row">
                    <div>
                      <strong>${escapeHtml(customer.name || "Kupac")}</strong>
                      <span>${escapeHtml(customer.email || "")}</span>
                    </div>
                    <span>${escapeHtml(customer.phone || "-")}</span>
                    <span>${Number(customer.orderCount) || 0} upita</span>
                    <span>${escapeHtml(customer.lastOrderAt || "Bez upita")}</span>
                    <span class="badge ${orderStatusClass(customer.lastOrderStatus)}">${escapeHtml(customer.lastOrderStatus || "Nema")}</span>
                    <button class="btn btn-secondary" type="button" data-customer-detail="${customer.id}">Detalji</button>
                  </article>
                `
              )
              .join("")
          : `<div class="product-admin-empty">Nema kupaca za odabranu pretragu.</div>`
      }
    </div>
  `;

  $("#customerSearch").addEventListener("input", (event) => {
    customerFilters.search = event.target.value;
    clearTimeout(customerSearchTimer);
    customerSearchTimer = setTimeout(() => rerenderAfterTyping(event.target, renderCustomers), 500);
  });
  $("#clearCustomerFiltersBtn").addEventListener("click", () => {
    customerFilters = { search: "" };
    renderCustomers();
  });
  $("#refreshCustomersBtn").addEventListener("click", async () => {
    await loadCustomers();
    renderCustomers();
  });
  document.querySelectorAll("[data-customer-detail]").forEach((button) => {
    button.addEventListener("click", () => renderCustomerDetailModal(Number(button.dataset.customerDetail)));
  });
}

function renderComingSoon() {
  renderArrayPanel("comingSoon", "Proizvodi uskoro", cms.comingSoon, { name: "Novi proizvod uskoro", text: "", enabled: true }, (itemCard, item) => {
    itemCard.append(field("Naziv", item.name, (value) => (item.name = value)));
    itemCard.append(field("Opis", item.text, (value) => (item.text = value), "textarea"));
    itemCard.append(selectField("Vidljivost", item.enabled === false ? "Sakriveno" : "Javno", ["Javno", "Sakriveno"], (value) => (item.enabled = value === "Javno")));
  });
}

function renderParts() {
  renderArrayPanel("parts", "Rezervni dijelovi", cms.parts, { name: "Novi dio", text: "", enabled: true }, (itemCard, item) => {
    itemCard.append(field("Naziv", item.name, (value) => (item.name = value)));
    itemCard.append(field("Opis", item.text, (value) => (item.text = value), "textarea"));
    itemCard.append(selectField("Vidljivost", item.enabled === false ? "Sakriveno" : "Javno", ["Javno", "Sakriveno"], (value) => (item.enabled = value === "Javno")));
  });
}

function renderManuals() {
  const productOptions = [{ value: "", label: "Nije vezano za pojedinačni proizvod" }, ...cms.products.map((product) => ({ value: product.id, label: product.name }))];
  const categoryOptions = ["", ...cms.categories.map((category) => category.name)];
  const documentTypes = ["Uputstvo", "Sigurnosne upute", "Specifikacija", "Servisni dokument", "PDF"];

  renderArrayPanel("manuals", "Manuali", cms.manuals, { title: "Novi manual", type: "Uputstvo", status: "Dodati dokument", file: "", relatedProductId: "", category: "", visibility: "Javno" }, (itemCard, item) => {
    item.relatedProductId = item.relatedProductId || "";
    item.category = item.category || "";
    item.visibility = item.visibility || "Javno";

    itemCard.append(field("Naslov", item.title, (value) => (item.title = value)));
    itemCard.append(selectField("Tip dokumenta", item.type, documentTypes.includes(item.type) ? documentTypes : [item.type, ...documentTypes], (value) => (item.type = value)));
    itemCard.append(selectField("Povezani proizvod", item.relatedProductId, productOptions, (value) => (item.relatedProductId = value)));
    itemCard.append(selectField("Kategorija", item.category, categoryOptions, (value) => (item.category = value)));
    itemCard.append(selectField("Vidljivost", item.visibility, ["Javno", "Sakriveno"], (value) => (item.visibility = value)));
    itemCard.append(field("Status", item.status, (value) => (item.status = value)));
    itemCard.append(manualUploadField(item));
  });
}

function renderLocations() {
  renderArrayPanel("locations", "Lokacije", cms.locations, { name: "Nova lokacija", address: "", hours: "", enabled: true }, (itemCard, item) => {
    itemCard.append(field("Naziv", item.name, (value) => (item.name = value)));
    itemCard.append(field("Adresa", item.address, (value) => (item.address = value), "textarea"));
    itemCard.append(field("Radno vrijeme", item.hours, (value) => (item.hours = value)));
    itemCard.append(selectField("Vidljivost", item.enabled === false ? "Sakriveno" : "Javno", ["Javno", "Sakriveno"], (value) => (item.enabled = value === "Javno")));
  });
}

function renderBlogs() {
  renderArrayPanel("blogs", "Blog i novosti", cms.blogs, { id: `blog-${Date.now()}`, title: "Novi blog", text: "", tag: "Novosti", image: "", seoTitle: "", seoDescription: "", enabled: true }, (itemCard, item) => {
    itemCard.classList.add("blog-admin-card");
    item.id = item.id || slugify(item.title || "novi-blog");

    const previewRow = document.createElement("div");
    previewRow.className = "blog-preview-row";
    previewRow.innerHTML = `
      <div>
        <strong>Pregled javne stranice bloga</strong>
        <span>${item.enabled === false ? "Blog je sakriven na stranici." : "Blog je vidljiv na stranici."}</span>
      </div>
      <span class="admin-status-pill ${item.enabled === false ? "is-muted" : "is-active"}">${item.enabled === false ? "Sakriveno" : "Javno"}</span>
      <a class="btn btn-secondary" href="${blogPreviewUrl(item)}" target="_blank" rel="noreferrer">Otvori blog</a>
    `;
    itemCard.append(previewRow);

    const intro = document.createElement("div");
    intro.className = "blog-editor-layout";

    const meta = document.createElement("section");
    meta.className = "blog-editor-section blog-editor-meta";
    meta.innerHTML = "<h4>Osnovne informacije</h4>";
    meta.append(
      field("Naslov", item.title, (value) => (item.title = value)),
      field("Slug / URL", item.id, (value) => (item.id = slugify(value))),
      field("Tag", item.tag, (value) => (item.tag = value)),
      selectField("Vidljivost", item.enabled === false ? "Sakriveno" : "Javno", ["Javno", "Sakriveno"], (value) => (item.enabled = value === "Javno"))
    );

    const media = document.createElement("section");
    media.className = "blog-editor-section blog-editor-media";
    media.innerHTML = "<h4>Slika bloga</h4>";
    media.append(blogImageUploadField(item));

    intro.append(meta, media);
    itemCard.append(intro);

    const content = document.createElement("section");
    content.className = "blog-editor-section blog-editor-content";
    content.append(richTextField("Tekst bloga", item.text, (value) => (item.text = value)));
    itemCard.append(content);

    const seo = document.createElement("section");
    seo.className = "blog-editor-section blog-editor-seo";
    seo.innerHTML = "<h4>SEO postavke</h4>";
    const seoFields = document.createElement("div");
    seoFields.className = "blog-editor-seo-fields";
    seoFields.append(
      field("SEO naslov", item.seoTitle, (value) => (item.seoTitle = value)),
      field("SEO opis", item.seoDescription, (value) => (item.seoDescription = value), "textarea")
    );
    seo.append(seoFields);
    itemCard.append(seo);
  });
}

function renderFaq() {
  renderArrayPanel("faq", "FAQ", cms.faq, { q: "Novo pitanje", a: "", enabled: true }, (itemCard, item) => {
    itemCard.append(field("Pitanje", item.q, (value) => (item.q = value)));
    itemCard.append(field("Odgovor", item.a, (value) => (item.a = value), "textarea"));
    itemCard.append(selectField("Vidljivost", item.enabled === false ? "Sakriveno" : "Javno", ["Javno", "Sakriveno"], (value) => (item.enabled = value === "Javno")));
  });
}

function renderSecurity() {
  const panel = $('[data-panel="security"]');
  panel.innerHTML = `
    <div class="admin-panel-heading">
      <h2>Sigurnost</h2>
      <div class="security-actions">
        <button class="btn btn-secondary" type="button" id="securityBackupBtn">Preuzmi backup</button>
        <button class="btn btn-secondary" type="button" id="securityRestoreBackupBtn">Vrati backup</button>
        <button class="btn btn-secondary" type="button" id="securityResetBtn">Vrati demo</button>
        <button class="btn btn-secondary" type="button" id="securityLogoutBtn">Odjavi se</button>
      </div>
    </div>
    ${
      passwordNeedsChange
        ? `<div class="admin-security-warning" role="alert"><strong>Promijenite početnu admin lozinku prije objave stranice.</strong></div>`
        : ""
    }
    <div class="security-grid">
      <article class="security-card">
        <span class="badge red">Admin</span>
        <h3>Promjena lozinke</h3>
        <label>
          Trenutna lozinka
          <input id="adminCurrentPassword" type="password" autocomplete="current-password" maxlength="72" />
        </label>
        <label>
          Nova lozinka (najmanje 15 znakova)
          <input id="adminNewPassword" type="password" autocomplete="new-password" minlength="15" maxlength="72" />
        </label>
        <label>
          Ponovite novu lozinku
          <input id="adminConfirmPassword" type="password" autocomplete="new-password" minlength="15" maxlength="72" />
        </label>
        <button class="btn btn-primary" type="button" id="adminPasswordUpdateBtn">Promijeni lozinku</button>
      </article>
      <article class="security-card">
        <span class="badge dark">Backup</span>
        <h3>Backup fajlovi</h3>
        <p>Backup sadrži CMS, korisnike, korpe i narudžbe. Čuvajte ga privatno, jer je potreban za potpuno vraćanje sistema.</p>
      </article>
      <article class="security-card">
        <span class="badge dark">Restore</span>
        <h3>Vraćanje backupa</h3>
        <p>Restore prepisuje trenutnu bazu. Prije vraćanja sistem automatski pravi sigurnosnu kopiju trenutnog stanja.</p>
      </article>
      <article class="security-card">
        <span class="badge red">Deployment</span>
        <h3>Prije objave</h3>
        <p>Provjerite zaštitu data foldera, sitemap domen, robots.txt, HTTPS i finalni backup.</p>
      </article>
    </div>
  `;

  $("#securityBackupBtn").addEventListener("click", downloadBackup);
  $("#securityRestoreBackupBtn").addEventListener("click", () => $("#restoreBackupInput")?.click());
  $("#securityResetBtn").addEventListener("click", resetCmsDemo);
  $("#securityLogoutBtn").addEventListener("click", adminLogout);
  $("#adminPasswordUpdateBtn").addEventListener("click", async () => {
    const currentPassword = $("#adminCurrentPassword").value;
    const newPassword = $("#adminNewPassword").value;
    const confirmPassword = $("#adminConfirmPassword").value;

    if (newPassword.length < 15) {
      flash("Nova admin lozinka mora imati najmanje 15 znakova.");
      return;
    }
    if (newPassword !== confirmPassword) {
      flash("Nove lozinke se ne podudaraju.");
      return;
    }

    try {
      await api("admin-password-update", { currentPassword, newPassword });
      passwordNeedsChange = false;
      renderSecurity();
      flash("Admin lozinka je promijenjena.");
    } catch (error) {
      flash(error.message);
    }
  });
}

function renderLaunchChecklist() {
  const panel = $('[data-panel="launch"]');
  cms.launchChecklist = mergeLaunchChecklist(cms.launchChecklist);
  const total = cms.launchChecklist.length || 1;
  const done = cms.launchChecklist.filter((item) => item.done).length;
  const percent = Math.round((done / total) * 100);

  panel.innerHTML = `
    <div class="admin-panel-heading">
      <div>
        <h2>Provjera prije objave</h2>
        <p class="admin-note-text">Ovo je radna checklist-a za finalni QA prije deploymenta. Nakon izmjena kliknite Sačuvaj CMS.</p>
      </div>
      <div class="launch-progress" aria-label="Završeno ${percent}%">
        <strong>${percent}%</strong>
        <span>${done}/${total} završeno</span>
      </div>
    </div>
    <div class="launch-progress-bar" aria-hidden="true">
      <span style="width: ${percent}%"></span>
    </div>
    <div class="launch-checklist">
      ${cms.launchChecklist
        .map(
          (item, index) => `
            <article class="launch-check-item ${item.done ? "done" : ""}">
              <label>
                <input type="checkbox" data-launch-done="${index}" ${item.done ? "checked" : ""} />
                <span>${escapeHtml(item.label)}</span>
              </label>
              <textarea data-launch-note="${index}" placeholder="Napomena, ako treba...">${escapeHtml(item.note || "")}</textarea>
            </article>
          `
        )
        .join("")}
    </div>
  `;

  document.querySelectorAll("[data-launch-done]").forEach((input) => {
    input.addEventListener("change", () => {
      cms.launchChecklist[Number(input.dataset.launchDone)].done = input.checked;
      renderLaunchChecklist();
    });
  });

  document.querySelectorAll("[data-launch-note]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      cms.launchChecklist[Number(textarea.dataset.launchNote)].note = textarea.value;
    });
  });
}

function renderAll() {
  rememberActivePanel();
  renderNav();
  renderSettings();
  renderSections();
  renderCategories();
  renderBadges();
  renderProducts();
  renderOrders();
  renderCustomers();
  renderComingSoon();
  renderParts();
  renderManuals();
  renderLocations();
  renderBlogs();
  renderFaq();
  renderSecurity();
  renderLaunchChecklist();
  showPanel();
  renderCmsValidationBanner();
}

function applyAdminUrlContext() {
  const params = new URLSearchParams(window.location.search);
  const requestedPanel = params.get("panel");
  const requestedProduct = params.get("product");
  const savedPanel = localStorage.getItem("onesCmsActivePanel");

  if (requestedPanel && panels.some((panel) => panel.id === requestedPanel)) {
    activePanel = requestedPanel;
  } else if (savedPanel && panels.some((panel) => panel.id === savedPanel)) {
    activePanel = savedPanel;
  }

  if (requestedProduct) {
    activePanel = "products";
    editingProductId = requestedProduct;
  }

  return requestedProduct;
}

async function showEditor() {
  $("#loginPanel").hidden = true;
  $("#adminEditor").hidden = false;
  const requestedProduct = applyAdminUrlContext();
  await loadOrders();
  await loadCustomers();
  renderAll();
  captureCmsBaseline();
  if (requestedProduct && cms.products.some((product) => product.id === requestedProduct)) {
    openProductEditor(requestedProduct);
  }
}

async function adminLogout() {
  try {
    await api("admin-logout", {});
    $("#adminEditor").hidden = true;
    $("#loginPanel").hidden = false;
    $("#passwordInput").value = "";
    flash("Admin je odjavljen.");
  } catch (error) {
    flash(error.message);
  }
}

async function resetCmsDemo() {
  if (!confirm("Vratiti demo sadržaj?")) return;
  try {
    const data = await api("reset-cms", { revision: cmsRevision });
    cmsRevision = Number(data.revision) || cmsRevision + 1;
    cms = data.cms;
    await loadCustomers();
    captureCmsBaseline();
    renderAll();
    captureCmsBaseline();
    flash("Demo sadržaj je vraćen u bazu.");
  } catch (error) {
    flash(error.message);
  }
}

function downloadBackup() {
  window.location.href = "api.php?action=backup-download";
  flash("Backup se preuzima.");
}

$("#loginBtn").addEventListener("click", async () => {
  try {
    await api("admin-login", { password: $("#passwordInput").value });
    await loadCms();
    await showEditor();
  } catch (error) {
    flash(error.message || "Pogrešna lozinka.");
  }
});

$("#passwordInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("#loginBtn").click();
  }
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    if (!input) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "Vidi" : "Sakrij";
    button.setAttribute("aria-label", visible ? "Prikazi lozinku" : "Sakrij lozinku");
  });
});

$("#saveBtn").addEventListener("click", saveCms);
["input", "change", "click"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    if (!event.target.closest?.("#adminEditor, .product-edit-modal")) return;
    setTimeout(() => {
      updateSaveState();
      renderCmsValidationBanner();
    }, 0);
  });
});
$("#adminMenuToggle")?.addEventListener("click", () => setAdminMenu(!document.body.classList.contains("admin-menu-open")));
$("#adminMenuClose")?.addEventListener("click", closeAdminMenu);
$("#adminMenuBackdrop")?.addEventListener("click", closeAdminMenu);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modalClose = document.querySelector(
      "#customerDetailModal #closeCustomerDetailBtn, #orderDetailModal #closeOrderDetailBtn, #categoryEditModal #closeCategoryEditorBtn, #productEditModal #closeProductEditorBtn"
    );
    if (modalClose) {
      modalClose.click();
      return;
    }
    closeAdminMenu();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!cmsBaseline || cmsSnapshot() === cmsBaseline || $("#adminEditor").hidden) return;
  event.preventDefault();
  event.returnValue = "";
});

$("#restoreBackupInput")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!confirm("Vraćanje backupa će prebrisati trenutni CMS, korisnike, korpe i narudžbe. Prije toga će se automatski napraviti sigurnosna kopija trenutne baze. Nastaviti?")) return;
  const confirmation = prompt('Za potvrdu vraćanja backupa upišite: VRATI');
  if (confirmation !== "VRATI") {
    flash("Restore je otkazan.");
    return;
  }

  try {
    const data = await restoreBackupFile(file);
    cmsRevision = Number(data.revision) || cmsRevision + 1;
    cms = { ...structuredClone(defaultCms), ...data.cms };
    orders = data.orders || [];
    await loadCustomers();
    captureCmsBaseline();
    renderAll();
    captureCmsBaseline();
    localStorage.setItem("onesCmsUpdatedAt", String(Date.now()));
    flash("Backup je vraćen u bazu.");
  } catch (error) {
    flash(error.message);
  }
});

window.addEventListener("storage", async (event) => {
  if (event.key !== "onesCmsUpdatedAt" || $("#adminEditor").hidden) return;
  if (cmsBaseline && cmsSnapshot() !== cmsBaseline) {
    flash("CMS je promijenjen u drugoj kartici. Vaše nesačuvane izmjene nisu prepisane; osvježite stranicu tek kada ih više ne trebate.", 9000);
    return;
  }

  await loadCms();
  await loadOrders();
  await loadCustomers();
  renderAll();
  captureCmsBaseline();
});

async function initAdmin() {
  try {
    const status = await api("admin-status");
    passwordNeedsChange = Boolean(status.passwordNeedsChange);
    if (status.loggedIn) {
      await loadCms();
      await showEditor();
    } else {
      $("#loginPanel").hidden = false;
      $("#adminEditor").hidden = true;
    }
  } catch (error) {
    $("#loginPanel").hidden = false;
    flash("Otvorite CMS preko lokalnog servera da se poveže s bazom.");
    console.error(error);
  }
}

initAdmin();

