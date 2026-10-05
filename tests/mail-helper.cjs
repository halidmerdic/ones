const fs = require('node:fs');
function capturedMail(email) {
  if (process.env.ONES_DISPOSABLE_TEST !== '1' || !process.env.ONES_TEST_MAIL) throw Error('Disposable mail capture required');
  return fs.readFileSync(process.env.ONES_TEST_MAIL, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(mail => mail.recipient === email).map(mail => ({ ...mail, text: Buffer.from(mail.raw.split('\r\n\r\n').slice(1).join('\r\n\r\n'), 'base64').toString('utf8') }));
}
function verificationToken(email) {
  return capturedMail(email).reverse().find(mail => mail.text.includes('#token='))?.text.match(/#token=([a-f0-9]{64})/)?.[1];
}
async function activateCustomer(ctx, baseURL, email, password) {
  const token = verificationToken(email);
  if (!token) throw Error('No captured verification message');
  const csrf = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
  const response = await ctx.post(baseURL + '/api.php?action=customer-email-confirm', { data: { token, password }, headers: { 'X-CSRF-Token': csrf.csrfToken } });
  if (response.status() !== 200) throw Error(await response.text());
}
module.exports = { capturedMail, verificationToken, activateCustomer };
