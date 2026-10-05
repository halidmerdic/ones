(() => {
  let version = 0;
  let current = null;
  let render = null;
  let busy = false;
  let error = '';
  let requested = null;

  function valid(data) {
    const page = data.pagination;
    return Array.isArray(data.orders) && data.orders.every(order => Number.isSafeInteger(order?.id) && Array.isArray(order.items)) &&
      page && ['page', 'pageSize', 'pageCount', 'total', 'start'].every(key => Number.isSafeInteger(page[key])) &&
      page.pageSize >= 1 && page.pageSize <= 50 && page.total >= 0 && page.pageCount === Math.max(1, Math.ceil(page.total / page.pageSize)) &&
      page.page >= 1 && page.page <= page.pageCount && page.start === (page.page - 1) * page.pageSize &&
      data.orders.length === Math.min(page.pageSize, page.total - page.start);
  }

  function controls() {
    let container = document.querySelector('#profileOrderPagination');
    if (!container) {
      container = document.createElement('div'); container.id = 'profileOrderPagination';
      container.className = 'admin-pagination'; container.setAttribute('aria-label', 'Stranice historije upita');
      document.querySelector('#profileOrders').after(container);
    }
    container.replaceChildren();
    container.setAttribute('aria-busy', String(busy));
    const page = current.pagination;
    const info = document.createElement('span');
    info.textContent = busy ? 'Učitavanje upita...' : `Stranica ${page.page} od ${page.pageCount} · ${page.total} upita`;
    info.setAttribute('role', 'status'); container.append(info);
    const actions = document.createElement('div'); actions.className = 'admin-pagination-actions';
    for (const [label, target, disabled] of [['Prethodna', page.page - 1, page.page <= 1], ['Sljedeća', page.page + 1, page.page >= page.pageCount]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary';
      button.textContent = label; button.disabled = busy || disabled;
      button.addEventListener('click', () => load(target, page.pageSize)); actions.append(button);
    }
    const label = document.createElement('label'); label.textContent = 'Po stranici';
    const select = document.createElement('select'); select.disabled = busy;
    for (const size of [10, 25, 50]) select.append(new Option(String(size), String(size), false, size === page.pageSize));
    select.addEventListener('change', () => load(1, Number(select.value))); label.append(select); actions.append(label); container.append(actions);
    if (error) {
      const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = error; container.append(message);
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-secondary'; retry.textContent = 'Pokušaj ponovo';
      retry.addEventListener('click', () => load(requested.page, requested.pageSize)); container.append(retry);
    }
  }

  async function load(page, pageSize) {
    const request = ++version;
    requested = {page, pageSize};
    busy = true; error = ''; controls();
    try {
      const data = await window.onesApi('customer-orders', undefined, {page, pageSize});
      if (request !== version) return;
      if (!valid(data)) throw new Error('Historiju upita nije moguće učitati.');
      current = data;
      render(data.orders);
      document.querySelector('#profileOrderCount').textContent = String(data.pagination.total);
    } catch (failure) {
      if (request !== version) return;
      error = failure.message || 'Historiju upita nije moguće učitati.';
    } finally {
      if (request === version) {
        busy = false; controls();
        const info = document.querySelector('#profileOrderPagination [role="status"]');
        info.tabIndex = -1; info.focus();
      }
    }
  }

  window.onesProfileOrders = (data, renderer) => {
    const page = {orders: data.orders, pagination: data.orderPagination};
    if (!valid(page)) throw new Error('Historiju upita nije moguće učitati.');
    version++; current = page; render = renderer; busy = false; error = '';
    document.querySelector('#profileOrderCount').textContent = String(page.pagination.total);
    render(page.orders); controls();
  };
})();
