(function () {
  let csrfToken = "";
  let csrfRequest = null;

  async function readJson(response) {
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("Server nije vratio ispravan odgovor.");
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "API greška.");
    }

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

  async function api(action, payload) {
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

    const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, options);
    return readJson(response);
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
    template.innerHTML = String(value || "");
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
  window.onesCsrfHeaders = csrfHeaders;
  window.onesEscapeHtml = escapeHtml;
  window.onesSafeUrl = safeUrl;
  window.onesSanitizeRichHtml = sanitizeRichHtml;
  window.onesSetupMobileNav = setupMobileNav;
})();
