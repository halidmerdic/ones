(function () {
  const storageKey = /\/admin\.html$/.test(location.pathname) ? "onesTheme:admin" : "onesTheme:store:last";

  const icons = {
    dark: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.4 14.8A8.2 8.2 0 0 1 9.2 3.6a8.8 8.8 0 1 0 11.2 11.2Z"></path>
      </svg>
    `,
    light: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"></path>
      </svg>
    `,
  };

  function pageScope() {
    return document.body?.dataset.themeScope || (location.pathname.includes("admin") ? "admin" : "store");
  }

  function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.querySelectorAll("[data-theme-image]").forEach((image) => {
      const source = image.dataset[`${nextTheme}Src`];
      if (source && image.getAttribute("src") !== source) image.setAttribute("src", source);
    });
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const nextLabel = nextTheme === "dark" ? "Prebaci na svijetli mod" : "Prebaci na tamni mod";
      button.innerHTML = nextTheme === "dark" ? icons.light : icons.dark;
      button.setAttribute("aria-label", nextLabel);
      button.setAttribute("aria-pressed", String(nextTheme === "dark"));
      button.title = nextLabel;
    });
  }

  function preferredTheme() {
    return window.onesStoredTheme();
  }

  function loadCustomerStatus() {
    if (pageScope() === "admin" || location.protocol === "file:") return Promise.resolve(null);
    if (window.__onesCustomerStatusPromise) return window.__onesCustomerStatusPromise;

    window.__onesCustomerStatusPromise = fetch("api.php?action=customer-status", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data?.ok ? data : null;
      })
      .catch(() => null);

    return window.__onesCustomerStatusPromise;
  }

  window.onesTheme = {
    toggle() {
      const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      window.onesStorage.local.setItem(storageKey, next);
      applyTheme(next);
    },
    apply: applyTheme,
  };
  window.onesCustomerStatus = loadCustomerStatus;

  applyTheme(preferredTheme());
  window.addEventListener("storage", event => {
    if (event.key === null || event.key === storageKey) applyTheme(preferredTheme());
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    window.onesTheme.toggle();
  });
})();
