let cms = null;
let post = null;
let currentCustomer = null;

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blogId(item, index) {
  return item.id || slugify(item.title || `blog-${index + 1}`) || `blog-${index + 1}`;
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
}

function updateCartCount(count) {
  document.querySelectorAll("#cartCount, .cart-count-sync").forEach((badge) => {
    badge.textContent = String(count || 0);
    badge.hidden = !count;
  });
}

function updateAccountLink() {
  const link = $("#accountLink");
  const mobileLink = $("#mobileAccountLink");
  const bottomLink = $("#bottomAccountLink");

  if (currentCustomer) {
    if (link) {
      link.href = "profile.html";
      link.textContent = `Prijavljen: ${currentCustomer.name}`;
      link.classList.add("account-active");
    }
    if (mobileLink) {
      mobileLink.href = "profile.html";
      mobileLink.textContent = "Moj profil";
    }
    if (bottomLink) bottomLink.href = "profile.html";
  } else {
    if (link) {
      link.href = "login.html";
      link.textContent = "Prijavi se";
      link.classList.remove("account-active");
    }
    if (mobileLink) {
      mobileLink.href = "login.html";
      mobileLink.textContent = "Prijavi se";
    }
    if (bottomLink) bottomLink.href = "login.html";
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

function setupMobileNav() {
  window.onesSetupMobileNav();
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

function plainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = window.onesSanitizeRichHtml(html);
  return (temp.textContent || temp.innerText || "").trim();
}

function postMatchesCatalog(item) {
  const ignored = new Set(["ones", "elektricni", "električni", "proizvod", "proizvodi"]);
  const keywords = (cms.products || [])
    .filter((product) => product.enabled !== false)
    .flatMap((product) => `${product.name || ""} ${product.category || ""}`.toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter((word) => word.length >= 2 && !ignored.has(word));
  if (keywords.some((word) => word.includes("romobil") || word.includes("skuter"))) {
    keywords.push("romobil", "skuter");
  }
  const haystack = `${item.title || ""} ${item.tag || ""} ${plainText(item.text)}`.toLowerCase();
  return !keywords.length || [...new Set(keywords)].some((keyword) => haystack.includes(keyword));
}

function applyBlogSeo() {
  const title = post.seoTitle || `${post.title} | oneS blog`;
  const description = post.seoDescription || plainText(post.text).slice(0, 155) || "oneS blog, savjeti i novosti.";
  const id = post.id || slugify(post.title || "blog");
  const canonical = absoluteUrl(`blog.html?id=${encodeURIComponent(id)}`);
  const image = post.image || "assets/ones-logo.webp";

  document.title = title;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', canonical);
  setMeta('meta[property="og:image"]', absoluteUrl(image));
  setCanonical(canonical);
}

function relatedProducts() {
  const tag = String(post.tag || "").toLowerCase();
  const title = String(post.title || "").toLowerCase();
  const text = plainText(post.text).toLowerCase();
  const haystack = `${tag} ${title} ${text}`;

  return (cms.products || [])
    .filter((product) => product.enabled !== false)
    .filter((product) => {
      const category = String(product.category || "").toLowerCase();
      const name = String(product.name || "").toLowerCase();
      const keywords = [category, name]
        .join(" ")
        .split(/\s+/)
        .map((word) => word.replace(/[^a-z0-9čćžšđ]/gi, "").toLowerCase())
        .filter((word) => word.length >= 4);

      if (category.includes("skuter") || category.includes("romobil")) keywords.push("skuter", "skuteri", "romobil", "romobili");

      return [...new Set(keywords)].some((keyword) => haystack.includes(keyword));
    })
    .slice(0, 3);
}

function renderRelatedProducts(products) {
  if (!products.length) return "";

  return `
    <section class="blog-related">
      <div class="section-heading">
        <p class="eyebrow">Povezano</p>
        <h2>Proizvodi iz teksta</h2>
      </div>
      <div class="blog-related-grid">
        ${products
          .map(
            (product) => `
              <article class="blog-related-card">
                <a href="${productUrl(product)}">
                  ${product.image ? `<img src="${window.onesEscapeHtml(window.onesSafeUrl(product.image))}" alt="${window.onesEscapeHtml(product.name)}" loading="lazy" />` : `<span class="product-shape" aria-hidden="true"></span>`}
                  <div>
                    <span>${window.onesEscapeHtml(product.category || "")}</span>
                    <strong>${window.onesEscapeHtml(product.name)}</strong>
                  </div>
                </a>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderBlog() {
  const related = relatedProducts();

  $("#blogDetail").innerHTML = `
    <article class="blog-article">
      <a class="btn btn-secondary" href="index.html#blog">Nazad na blog</a>
      ${
        post.image
          ? `<div class="blog-hero-image"><img src="${window.onesEscapeHtml(window.onesSafeUrl(post.image))}" alt="${window.onesEscapeHtml(post.title)}" /></div>`
          : `<div class="blog-hero-image empty"><span>oneS blog</span></div>`
      }
      <p class="eyebrow">${window.onesEscapeHtml(post.tag || "Blog")}</p>
      <h1>${window.onesEscapeHtml(post.title)}</h1>
      <div class="rich-content blog-article-content">${window.onesSanitizeRichHtml(post.text)}</div>
    </article>
    ${renderRelatedProducts(related)}
  `;
}

async function init() {
  try {
    setupAccountMenu();
    setupMobileNav();
    await loadCustomerStatus();
    await loadCartCount();

    const requestedId = new URLSearchParams(window.location.search).get("id");
    const data = await api("cms");
    cms = data.cms;
    post = (cms.blogs || []).find((item, index) => item.enabled !== false && postMatchesCatalog(item) && blogId(item, index) === requestedId);

    if (!post) {
      $("#blogDetail").innerHTML = `
        <div class="login-panel profile-panel">
          <h1>Blog nije pronađen</h1>
          <p>Vratite se na listu blogova i odaberite tekst.</p>
          <a class="btn btn-primary" href="index.html#blog">Nazad na blog</a>
        </div>
      `;
      return;
    }

    applyBlogSeo();
    renderBlog();
  } catch (error) {
    $("#blogDetail").innerHTML = `
      <div class="login-panel profile-panel">
        <h1>Greška</h1>
        <p>${window.onesEscapeHtml(error.message)}</p>
      </div>
    `;
  }
}

window.addEventListener("storage", async (event) => {
  if (event.key !== "onesCmsUpdatedAt" || !post) return;

  try {
    const data = await api("cms");
    cms = data.cms;
    const currentId = blogId(post, 0);
    post = (cms.blogs || []).find((item, index) => item.enabled !== false && postMatchesCatalog(item) && blogId(item, index) === currentId);
    if (post) {
      applyBlogSeo();
      renderBlog();
    }
  } catch (error) {
    console.warn("CMS refresh failed.", error);
  }
});

init();
