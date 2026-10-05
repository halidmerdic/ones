(function () {
  window.onesPhone = function (value) {
    if (typeof value !== "string" || new TextEncoder().encode(value).length > 120 || /[^0-9+()\/ .\t\u00a0\u202f-]/u.test(value)) return "";
    let number = value.replace(/[()\/ .\t\u00a0\u202f-]/gu, "");
    if (!/^\+?[0-9]+$/.test(number)) return "";
    if (number.startsWith("00")) number = "+" + number.slice(2);
    else if (number.startsWith("0")) number = "+387" + number.slice(1);
    else if (number.startsWith("387")) number = "+" + number;
    if (number.startsWith("+3870")) number = "+387" + number.slice(5);
    if (!/^\+[1-9][0-9]{6,14}$/.test(number)) return "";
    if (number.startsWith("+387") && !/^\+387[1-9][0-9]{5,8}$/.test(number)) return "";
    return number;
  };
  window.onesPhoneUrl = function (value, channel, message = "") {
    const number = window.onesPhone(value);
    if (!number) return "";
    if (channel === "whatsapp") return `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(message)}`;
    if (channel === "viber") return `viber://chat?number=${encodeURIComponent(number)}&text=${encodeURIComponent(message)}`;
    return "";
  };
  window.onesSetContactLink = function (link, url) {
    if (!link) return;
    link.hidden = !url;
    if (url) link.href = url;
    else link.removeAttribute("href");
  };

  window.onesSafeReturnUrl = function (value) {
    const base = new URL("./", window.location.href);
    try {
      const target = new URL(value || "./", base);
      const allowed = ["", "index.html", "cart.html", "product.html", "profile.html", "blog.html", "privacy.html", "terms.html"];
      if (!/^https?:$/.test(target.protocol) || target.origin !== base.origin || target.username || target.password
        || !allowed.some(file => target.pathname === base.pathname + file)) return base.href;
      return target.href;
    } catch { return base.href; }
  };
  window.onesLoginUrl = function (next = window.location.href, pendingCart = false) {
    const target = new URL(window.onesSafeReturnUrl(next));
    if (pendingCart) target.searchParams.set("cartPending", "1");
    const login = new URL("login.html", window.location.href);
    login.searchParams.set("next", target.href);
    return login.href;
  };
  window.onesPriceCents = function (value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const match = String(value).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").match(/^([0-9]{1,10})(?:[.,]([0-9]{1,2}))?$/);
    if (!match) return /^[ \t\r\n]*$/.test(String(value)) ? 0 : null;
    const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
    return cents <= 100000000000 ? cents : null;
  };
  window.onesFormatCents = function (cents) {
    const value = BigInt(cents);
    const fraction = value % 100n;
    return String(value / 100n) + (fraction ? "." + String(fraction).padStart(2, "0").replace(/0+$/, "") : "");
  };
  window.onesFormatPrice = value => window.onesFormatCents(window.onesPriceCents(value) ?? 0);

  let businessDate = "";
  let clockAsOf = 0;
  let clockTimer;
  let clockRequest;
  function acceptPricingClock(clock) {
    if (!clock || clock.zone !== "Europe/Sarajevo" || !/^\d{4}-\d{2}-\d{2}$/.test(clock.date)) return;
    if (!Number.isFinite(clock.asOf) || clock.asOf < clockAsOf || !Number.isFinite(clock.refreshAfterMs)) return;
    clockAsOf = clock.asOf;
    const changed = businessDate !== clock.date;
    businessDate = clock.date;
    clearTimeout(clockTimer);
    clockTimer = setTimeout(() => refreshPricingClock(true), Math.max(1, Math.min(90000000, clock.refreshAfterMs)));
    if (changed) window.dispatchEvent(new Event("ones-pricing-date"));
  }
  async function refreshPricingClock(expired = false) {
    if (expired) { businessDate = ""; window.dispatchEvent(new Event("ones-pricing-date")); }
    if (!clockRequest) clockRequest = api("pricing-clock").catch(() => {
      clearTimeout(clockTimer);
      clockTimer = setTimeout(() => refreshPricingClock(true), 30000);
    }).finally(() => { clockRequest = null; });
    return clockRequest;
  }
  // Never consult Date.now() or the device's time zone for store prices.
  window.onesDateActive = value => !value || (!!businessDate && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= businessDate);
  window.onesActivePrice = product => {
    if (!businessDate) return { label: "Cijena na upit", type: "inquiry" };
    if (product.effectivePrice?.date === businessDate) return product.effectivePrice;
    for (const [field, type] of [["salePrice", "sale"], ["discountPrice", "discount"], ["mpcPrice", "regular"], ["price", "regular"]]) {
      if (field === "salePrice" && (!product.saleUntil || !window.onesDateActive(product.saleUntil))) continue;
      if ((window.onesPriceCents(product[field]) ?? 0) > 0) return { label: window.onesFormatPrice(product[field]), type };
    }
    return { label: "Cijena na upit", type: "inquiry" };
  };
  window.addEventListener?.("pageshow", () => refreshPricingClock(true));
  if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", () => { if (!document.hidden) refreshPricingClock(true); });

  // New passwords count Unicode code points; bcrypt's separate limit is bytes.
  window.onesPasswordError = function (password, admin = false) {
    if (typeof password !== "string" || /\u0000|[\uD800-\uDFFF]/u.test(password)) return "Lozinka sadrži neispravan znak.";
    if (Array.from(password).length < 15) return `${admin ? "Nova admin lozinka" : "Lozinka"} mora imati najmanje 15 znakova.`;
    if (new TextEncoder().encode(password).length > 72) return "Lozinka smije zauzimati najviše 72 UTF-8 bajta; slova č/ć/š/đ/ž i emoji zauzimaju više bajtova.";
    const blocked = ["123456789012345", "administrator123", "lozinkalozinka", "passwordpassword", "qwertyuiop12345", "onesadmin", "onesadmin123456"];
    if (blocked.includes(password.replace(/^[ \t\r\n\v\0]+|[ \t\r\n\v\0]+$/g, "").toLowerCase()) || /^(.)\1{14,}$/su.test(password)) return "Odaberite sigurniju lozinku koja nije česta niti lako pogodiva.";
    return null;
  };

  let csrfToken = "";
  let csrfRequest = null;
  let logoutRequest = null;
  let lastCart = null;

  async function readJson(response) {
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("Server nije vratio ispravan odgovor.");
    }

    if (!response.ok || !data?.ok) {
      const error = new Error(data?.message || "API greška.");
      error.status = response.status;
      error.code = data?.code || "";
      throw error;
    }

    acceptPricingClock(data.pricingClock);
    return data;
  }

  async function ensureCsrfToken() {
    if (csrfToken) return csrfToken;
    if (!csrfRequest) {
      csrfRequest = fetch("api.php?action=csrf-token", {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(readJson)
        .then((data) => {
          csrfToken = data.csrfToken || "";
          if (!csrfToken) throw new Error("Sigurnosni token nije dostupan.");
          return csrfToken;
        })
        .finally(() => {
          csrfRequest = null;
        });
    }
    return csrfRequest;
  }

  async function csrfHeaders(extraHeaders) {
    return {
      ...(extraHeaders || {}),
      "X-CSRF-Token": await ensureCsrfToken(),
    };
  }

  async function api(action, payload, query = {}) {
    // Catalogue/product buttons use the last version this page actually read.
    // Cart-page edits pass their displayed version explicitly.
    if (action === "cart-add" && payload?.cartId === undefined) {
      if (!lastCart) lastCart = (await api("cart")).cart;
      payload = { ...payload, cartId: lastCart.cartId, cartRevision: lastCart.revision };
    }
    const hasPayload = payload !== undefined;
    const options = hasPayload
      ? {
          method: "POST",
          credentials: "same-origin",
          headers: await csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        }
      : {
          cache: "no-store",
          credentials: "same-origin",
        };

    const params = [`action=${encodeURIComponent(action)}`];
    for (const [key, value] of Object.entries(query)) {
      if (key !== "action" && value !== undefined && value !== null && value !== "") params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
    const response = await fetch(`api.php?${params.join("&")}`, options);
    try {
      const data = await readJson(response);
      if (data.cart) lastCart = data.cart;
      if (action === "customer-logout") lastCart = null;
      return data;
    } catch (error) {
      if (error.code === "CART_CONFLICT") {
        lastCart = null;
        try { error.cart = (await api("cart")).cart; } catch { /* Preserve original error; never replay a mutation. */ }
      }
      throw error;
    }
  }

  async function logoutCustomer() {
    if (!logoutRequest) {
      logoutRequest = (async () => {
        try {
          await api("customer-logout", {});
        } catch {
          // A lost response may follow a completed logout. Confirm with the server.
          const status = await api("customer-status").catch(() => null);
          if (status?.loggedIn !== false) {
            throw new Error("Odjava nije potvrđena. Provjerite vezu i pokušajte ponovo.");
          }
        }
        window.onesCleanLegacyStorage();
        for (const storage of [window.onesStorage.local, window.onesStorage.session]) {
          storage.removeItem("onesCustomerPreview");
          storage.removeItem("onesCartCountPreview");
        }
        window.__onesCartPreview = 0;
        window.__onesCustomerStatusPromise = Promise.resolve({ ok: true, loggedIn: false, user: null });
      })().finally(() => { logoutRequest = null; });
    }
    return logoutRequest;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value), window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function sanitizeRichHtml(value) {
    const template = document.createElement("template");
    // Fail closed if the sanitizer failed to load.
    if (!window.DOMPurify?.isSupported) return escapeHtml(value || "");
    template.innerHTML = window.DOMPurify.sanitize(String(value || ""), {
      ALLOWED_TAGS: ["p", "div", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "a", "blockquote", "span", "font"],
      ALLOWED_ATTR: ["href", "size"],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
    const allowedTags = new Set(["P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "H2", "H3", "H4", "A", "BLOCKQUOTE", "SPAN", "FONT"]);

    [...template.content.querySelectorAll("*")].forEach((element) => {
      if (!allowedTags.has(element.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE"].includes(element.tagName)) {
          element.remove();
          return;
        }
        element.replaceWith(...element.childNodes);
        return;
      }

      const fontSize = element.tagName === "FONT" ? element.getAttribute("size") : "";
      [...element.attributes].forEach((attribute) => {
        const keepHref = element.tagName === "A" && attribute.name.toLowerCase() === "href";
        if (!keepHref) element.removeAttribute(attribute.name);
      });
      if (element.tagName === "FONT" && /^[1-6]$/.test(fontSize || "")) {
        element.setAttribute("size", fontSize);
      }

      if (element.tagName === "A") {
        const href = safeUrl(element.getAttribute("href"));
        if (!href) {
          element.removeAttribute("href");
        } else {
          element.href = href;
          element.target = "_blank";
          element.rel = "noopener noreferrer";
        }
      }
    });

    return template.innerHTML;
  }

  function setupMobileNav(buttonSelector = ".menu-button", menuSelector = ".mobile-nav") {
    const button = document.querySelector(buttonSelector);
    const menu = document.querySelector(menuSelector);
    if (!button || !menu || button.dataset.menuReady === "true") return;
    button.dataset.menuReady = "true";

    const close = (returnFocus = false) => {
      button.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      if (returnFocus) button.focus();
    };

    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        close();
      } else {
        button.setAttribute("aria-expanded", "true");
        menu.hidden = false;
        menu.querySelector("a, button")?.focus();
      }
    });

    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => close()));
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const inquiryClose = document.querySelector("#inquiryModal .inquiry-close");
      if (inquiryClose) {
        inquiryClose.click();
        return;
      }
      if (!menu.hidden) close(true);
    });
    document.addEventListener("click", (event) => {
      if (menu.hidden || menu.contains(event.target) || button.contains(event.target)) return;
      close();
    });
  }

  window.onesApi = api;
  window.onesLogoutCustomer = logoutCustomer;
  window.onesCsrfHeaders = csrfHeaders;
  window.onesEscapeHtml = escapeHtml;
  window.onesSafeUrl = safeUrl;
  window.onesSanitizeRichHtml = sanitizeRichHtml;
  window.onesSetupMobileNav = setupMobileNav;
})();
