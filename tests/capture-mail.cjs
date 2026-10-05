// Disposable loopback SMTP sink. It never forwards mail outside the machine.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.ONES_TEST_MAIL;
if (!output || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Set disposable mail capture path');
fs.mkdirSync(path.dirname(output), { recursive: true });
const server = net.createServer(socket => {
  socket.setEncoding('utf8'); socket.write('220 localhost test SMTP\r\n');
  let buffer = '', data = false, body = [], recipient = '';
  socket.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const i = buffer.indexOf('\n'); const line = buffer.slice(0, i).replace(/\r$/, ''); buffer = buffer.slice(i + 1);
      if (data) {
        if (line === '.') {
          fs.appendFileSync(output, JSON.stringify({ recipient, raw: body.join('\r\n') }) + '\n');
          socket.write('250 Message captured\r\n'); data = false; body = [];
        } else body.push(line.replace(/^\.\./, '.'));
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-localhost\r\n250 SIZE 1000000\r\n');
      else if (/^RCPT TO:/i.test(line)) { recipient = line.match(/<([^>]+)>/)?.[1] || ''; socket.write('250 OK\r\n'); }
      else if (/^DATA$/i.test(line)) { data = true; socket.write('354 End with dot\r\n'); }
      else if (/^QUIT/i.test(line)) { socket.end('221 Bye\r\n'); }
      else socket.write('250 OK\r\n');
    }
  });
});
server.listen(Number(process.env.ONES_TEST_SMTP_PORT || 10255), '127.0.0.1', () => console.log('Disposable SMTP capture ready'));
