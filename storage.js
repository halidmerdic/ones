(function () {
  // Optional browser caches must never decide whether a server operation works.
  function safeStorage(name) {
    const memory = new Map();
    const pending = new Set();
    function flush(key) {
      if (!pending.has(key)) return;
      const value = memory.get(key);
      if (value === null) window[name].removeItem(key);
      else window[name].setItem(key, value);
      pending.delete(key);
    }
    return {
      getItem(key) {
        try {
          flush(key);
          const value = window[name].getItem(key);
          memory.set(key, value);
          return value;
        } catch { return memory.get(key) ?? null; }
      },
      setItem(key, value) {
        memory.set(key, String(value));
        pending.add(key);
        try { flush(key); } catch {}
      },
      removeItem(key) {
        // A failed removal must not resurrect a stale value in this page.
        memory.set(key, null);
        pending.add(key);
        try { flush(key); } catch {}
      },
      keys() {
        const keys = new Set(memory.keys());
        try {
          for (const key of pending) flush(key);
          const storage = window[name];
          for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (key !== null) keys.add(key);
          }
        } catch {}
        return [...keys].filter(key => !pending.has(key) || memory.get(key) !== null);
      },
    };
  }
  const local = safeStorage("localStorage");
  const session = safeStorage("sessionStorage");
  window.onesStorage = { local, session };

  function cleanLegacyStorage() {
    // Keep the device preference, without consulting or copying account keys.
    if (!["light", "dark"].includes(local.getItem("onesTheme:store:last"))) {
      const guest = local.getItem("onesTheme:guest");
      if (["light", "dark"].includes(guest)) local.setItem("onesTheme:store:last", guest);
    }
    for (const storage of [local, session]) {
      for (const key of storage.keys()) {
        if (key.startsWith("onesTheme:customer:")) storage.removeItem(key);
      }
    }
    local.removeItem("onesTheme:guest");
    local.removeItem("onesCustomerPreview");
    const preview = session.getItem("onesCustomerPreview");
    if (preview !== null) {
      try {
        const value = JSON.parse(preview);
        if (typeof value?.name === "string") {
          const safePreview = JSON.stringify({ name: value.name });
          if (preview !== safePreview) {
            // Removal still works when writing fails because the quota is full.
            session.removeItem("onesCustomerPreview");
            session.setItem("onesCustomerPreview", safePreview);
          }
        } else session.removeItem("onesCustomerPreview");
      } catch { session.removeItem("onesCustomerPreview"); }
    }
  }
  window.onesCleanLegacyStorage = cleanLegacyStorage;
  window.onesStoredTheme = function () {
    const admin = /\/admin\.html$/.test(window.location.pathname);
    const saved = local.getItem(admin ? "onesTheme:admin" : "onesTheme:store:last");
    return ["light", "dark"].includes(saved) ? saved
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  cleanLegacyStorage();
  if (typeof document !== "undefined") document.documentElement.dataset.theme = window.onesStoredTheme();
  window.addEventListener?.("pageshow", cleanLegacyStorage);
  window.addEventListener?.("storage", event => {
    if (event.key === null || event.key?.startsWith("onesTheme:customer:")) cleanLegacyStorage();
  });
})();
