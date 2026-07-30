(function () {
  const baseKey = "onesTheme";
  const storeFallbackKey = `${baseKey}:store:last`;
  let storageKey = resolveStorageKey();

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

  function resolveStorageKey(user) {
    const scope = pageScope();
    if (scope === "admin") return `${baseKey}:admin`;
    if (user?.email) return `${baseKey}:customer:${String(user.email).toLowerCase()}`;
    return `${baseKey}:guest`;
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
    const saved = localStorage.getItem(storageKey);
    if (saved === "dark" || saved === "light") return saved;
    if (pageScope() === "store") {
      const lastStoreTheme = localStorage.getItem(storeFallbackKey);
      if (lastStoreTheme === "dark" || lastStoreTheme === "light") return lastStoreTheme;

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(`${baseKey}:customer:`)) continue;
        const customerTheme = localStorage.getItem(key);
        if (customerTheme === "dark" || customerTheme === "light") return customerTheme;
      }
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  async function resolveCustomerTheme() {
    if (pageScope() === "admin" || location.protocol === "file:") return;

    try {
      const response = await fetch("api.php?action=customer-status", { cache: "no-store" });
      if (!response.ok) return;

      const data = await response.json();
      const nextKey = resolveStorageKey(data.loggedIn ? data.user : null);
      if (nextKey === storageKey) return;

      storageKey = nextKey;
      const theme = preferredTheme();
      if (pageScope() === "store") localStorage.setItem(storeFallbackKey, theme);
      applyTheme(theme);
    } catch {
      // Theme still works with the guest key if the server is not reachable.
    }
  }

  window.onesTheme = {
    toggle() {
      const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem(storageKey, next);
      if (pageScope() === "store") localStorage.setItem(storeFallbackKey, next);
      applyTheme(next);
    },
    apply: applyTheme,
  };

  applyTheme(preferredTheme());
  resolveCustomerTheme();

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    window.onesTheme.toggle();
  });
})();
