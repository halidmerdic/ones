// Focus scopes for CMS overlays; native confirmation dialogs keep their native lifecycle.
(() => {
  const scopes = new Map();
  const isolated = new Map();
  const selector = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';
  const visible = element => element instanceof HTMLElement && element.isConnected &&
    !element.closest('[hidden], [inert]') && !element.matches(':disabled') &&
    getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0;
  const candidates = root => [...root.querySelectorAll(selector)].filter(element => visible(element) &&
    (element.tabIndex >= 0 || (element.isContentEditable && !element.hasAttribute('tabindex'))));
  const top = () => [...scopes.values()].at(-1);
  const nativeDialog = () => document.querySelector('#cmsRelationDialog[open]');

  function remember(element, root = document) {
    if (!(element instanceof HTMLElement) || element === document.body || !root.contains(element)) return null;
    let query = element.id ? `#${CSS.escape(element.id)}` : null;
    const key = [...element.attributes].find(attribute => /^data-(edit-|customer-|order-|panel-|product-field)/.test(attribute.name));
    if (!query && key) query = `[${key.name}="${CSS.escape(key.value)}"]`;
    const label = element.closest('label');
    return { element, query, label: label?.firstChild?.textContent.trim(), tag: element.tagName,
      start: element.selectionStart, end: element.selectionEnd };
  }

  function resolve(mark, root = document) {
    if (!mark) return null;
    if (root.contains(mark.element) && visible(mark.element)) return mark.element;
    if (mark.query) return root.querySelector(mark.query);
    if (mark.label) return [...root.querySelectorAll('label')]
      .find(label => label.firstChild?.textContent.trim() === mark.label)?.querySelector(mark.tag);
    return null;
  }

  function focus(element, mark = null) {
    if (!visible(element)) return false;
    element.focus();
    if (document.activeElement !== element) return false;
    if (Number.isInteger(mark?.start) && typeof element.setSelectionRange === 'function') {
      try { element.setSelectionRange(mark.start, mark.end); } catch { /* Non-text input. */ }
    }
    return true;
  }

  function restoreIsolation() {
    for (const [element, inert] of isolated) element.inert = inert;
    isolated.clear();
  }

  function isolate() {
    restoreIsolation();
    const scope = top();
    if (!scope?.root.isConnected) return;
    // Inert only sibling branches, never an ancestor containing the active scope.
    for (let branch = scope.root; branch !== document.body; branch = branch.parentElement) {
      if (!branch?.parentElement) break;
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || sibling.matches('script, style, link, dialog, [role="status"]') ||
          sibling.id === 'adminMenuBackdrop') continue;
        isolated.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
  }

  function focusScope(scope) {
    if (!scope?.root.isConnected) return;
    if (focus(resolve(scope.last, scope.root), scope.last)) return;
    const initial = scope.root.querySelector(scope.options.initial || '[data-initial-focus]');
    if (focus(initial) || focus(candidates(scope.root)[0])) return;
    scope.root.tabIndex = -1;
    focus(scope.root);
  }

  function fallback() {
    const login = document.querySelector('#loginPanel:not([hidden]) #passwordInput');
    if (focus(login)) return;
    const heading = document.querySelector('#adminEditor:not([hidden]) .admin-panel:not([hidden]) h2');
    if (heading) { heading.tabIndex = -1; focus(heading); }
  }

  window.onesCmsFocus = {
    prepare(id) {
      const old = scopes.get(id);
      return old ? { ...old, last: remember(document.activeElement, old.root) || old.last } :
        { trigger: remember(document.activeElement), last: null };
    },
    open(root, state, options) {
      const scope = { ...state, root, options };
      scopes.set(root.id, scope);
      isolate();
      document.body.classList.toggle('modal-open', [...scopes.values()].some(item => item.root.classList.contains('product-edit-modal')));
      if (top() === scope && !nativeDialog()) focusScope(scope);
    },
    release(id, restore = true) {
      const scope = scopes.get(id);
      if (!scope) return;
      const wasTop = top() === scope;
      scopes.delete(id);
      isolate();
      document.body.classList.toggle('modal-open', [...scopes.values()].some(item => item.root.classList.contains('product-edit-modal')));
      if (!restore || !wasTop) return;
      if (focus(scope.trigger?.element) || focus(scope.options.returnTo?.()) || focus(resolve(scope.trigger))) return;
      if (top()) focusScope(top()); else fallback();
    },
    reset() {
      scopes.clear();
      restoreIsolation();
      document.body.classList.remove('modal-open');
    },
    closeTop() {
      if (nativeDialog() || !top()) return false;
      top().options.close();
      return true;
    },
  };

  document.addEventListener('focusin', event => {
    const scope = top();
    const root = nativeDialog() || scope?.root;
    if (!root) return;
    if (!root.contains(event.target)) {
      if (nativeDialog()) focus(candidates(root)[0]); else focusScope(scope);
    } else if (root === scope?.root) scope.last = remember(event.target, root);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const root = nativeDialog() || top()?.root;
    if (!root) return;
    const items = candidates(root);
    const index = items.indexOf(document.activeElement);
    if (!items.length || index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
      event.preventDefault();
      if (!focus(event.shiftKey ? items.at(-1) : items[0])) { root.tabIndex = -1; focus(root); }
    }
  }, true);

  // Rendering may replace focused controls or append new background content.
  new MutationObserver(() => {
    if (!top()) return;
    isolate();
    if (!nativeDialog() && (!top().root.contains(document.activeElement) || !visible(document.activeElement))) focusScope(top());
  }).observe(document.body, { childList: true, subtree: true });
})();
