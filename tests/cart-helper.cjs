// API fixtures carry the version they read, as a browser does. Explicit versions
// remain untouched so tests can exercise stale/foreign/malformed requests.
async function withCartVersion(ctx, baseURL, action, data) {
  if (!['cart-add','cart-update','cart-remove','order-submit'].includes(action) || data?.cartId !== undefined) return data;
  const response = await ctx.get(baseURL + '/api.php?action=cart');
  if (response.status() !== 200) return data;
  const {cart} = await response.json();
  return {...data,cartId:cart.cartId,cartRevision:cart.revision};
}
module.exports = {withCartVersion};
