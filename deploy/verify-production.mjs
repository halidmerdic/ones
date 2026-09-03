import net from "node:net";

const args = process.argv.slice(2);
const valueAfter = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const baseUrl = valueAfter("--base-url", "https://ones.ba").replace(/\/$/, "");
const originIp = valueAfter("--origin-ip");
const siteHost = new URL(baseUrl).hostname;
let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`[OK] ${message}`);
    return;
  }

  failures += 1;
  console.error(`[FAIL] ${message}`);
}

async function get(url, readBody = false) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return {
      error: null,
      headers: response.headers,
      status: response.status,
      body: readBody ? await response.text() : "",
    };
  } catch (error) {
    return {
      error,
      headers: new Headers(),
      status: 0,
      body: "",
    };
  }
}

function canConnect(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

console.log(`oneS production verification: ${baseUrl}`);

const home = await get(`${baseUrl}/`);
check(home.status === 200, "Pocetna stranica vraca HTTP 200");
check(/cloudflare/i.test(home.headers.get("server") || ""), "Javni promet prolazi kroz Cloudflare");

const securityHeaders = [
  ["strict-transport-security", "max-age="],
  ["content-security-policy", "default-src"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "SAMEORIGIN"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "geolocation=()"],
];

for (const [name, expected] of securityHeaders) {
  check((home.headers.get(name) || "").includes(expected), `Zaglavlje ${name} je aktivno`);
}

const www = await get(`https://www.${siteHost}/`);
check([301, 308].includes(www.status), "www domena preusmjerava");
check(www.headers.get("location") === `${baseUrl}/`, "www domena vodi na kanonski URL");

const index = await get(`${baseUrl}/index.html`);
check([301, 308].includes(index.status), "/index.html preusmjerava");
check(index.headers.get("location") === `${baseUrl}/`, "/index.html vodi na cistu pocetnu adresu");

const http = await get(`http://${siteHost}/`);
check([301, 308].includes(http.status), "HTTP preusmjerava na HTTPS");

const api = await get(`${baseUrl}/api.php?action=cms`);
check(api.status === 200, "Javni CMS API vraca HTTP 200");
check((api.headers.get("content-type") || "").startsWith("application/json"), "API vraca JSON");
check(/no-store/i.test(api.headers.get("cache-control") || ""), "API ima no-store");
check(!/^HIT$/i.test(api.headers.get("cf-cache-status") || ""), "Cloudflare ne kesira API");

const sessionCookie = api.headers.get("set-cookie") || "";
check(/(?:^|;)\s*secure(?:;|$)/i.test(sessionCookie), "Sesijski cookie koristi Secure");
check(/(?:^|;)\s*httponly(?:;|$)/i.test(sessionCookie), "Sesijski cookie koristi HttpOnly");
check(/(?:^|;)\s*samesite=lax(?:;|$)/i.test(sessionCookie), "Sesijski cookie koristi SameSite=Lax");

for (const path of ["admin.html", "cart.html", "login.html", "profile.html"]) {
  const response = await get(`${baseUrl}/${path}`);
  check(response.status === 200, `${path} je dostupan`);
  check(/no-store/i.test(response.headers.get("cache-control") || ""), `${path} ima no-store`);
  check(!/^HIT$/i.test(response.headers.get("cf-cache-status") || ""), `Cloudflare ne kesira ${path}`);
}

for (const path of ["config.local.php", "data/ones.sqlite", "data/backups/", ".env", ".git/config"]) {
  const response = await get(`${baseUrl}/${path}`);
  check([403, 404].includes(response.status), `/${path} nije javno dostupan`);
}

const sitemap = await get(`${baseUrl}/sitemap.php`, true);
check(sitemap.status === 200, "Sitemap vraca HTTP 200");
check(sitemap.body.includes(`${baseUrl}/`), "Sitemap koristi produkcijsku domenu");
check(!/<loc>(?:http:\/\/|https:\/\/www\.)/i.test(sitemap.body), "Sitemap nema nekanonske URL adrese");

const robots = await get(`${baseUrl}/robots.txt`, true);
check(robots.status === 200, "robots.txt vraca HTTP 200");
check(robots.body.includes(`Sitemap: ${baseUrl}/sitemap.php`), "robots.txt koristi apsolutni sitemap URL");

if (originIp) {
  const directOriginReachable = await canConnect(originIp, 80);
  check(!directOriginReachable, "Hetzner origin nije direktno dostupan mimo Cloudflarea");
}

if (failures > 0) {
  console.error(`\nProduction verification failed: ${failures} problem(s).`);
  process.exit(1);
}

console.log("\nProduction verification passed.");
