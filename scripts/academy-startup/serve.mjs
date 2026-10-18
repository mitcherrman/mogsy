/**
 * ACADEMY STARTUP — serve a production build with mogzy.lol's cache policy.
 *
 *   node scripts/academy-startup/serve.mjs <dist-dir> [port=4418]
 *
 * Mirrors what the production host sent on 2026-10-18 (curl):
 *   /assets/*       public, max-age=31536000, immutable   (hashed)
 *   HTML            no-cache, must-revalidate, max-age=0
 *   other /public   ETag only, no Cache-Control           (=> revalidate)
 * brotli for text, SPA fallback to index.html.
 *
 * HTTP/2 (as production) when ACADEMY_PERF_TLS_DIR holds key.pem + cert.pem,
 * e.g. created once with:
 *   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
 *     -days 30 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
 * Without it: plain HTTP/1.1 (6 connections per host instead of multiplexing,
 * which overstates contention under throttling — note it in any result).
 */
import { createSecureServer } from "node:http2";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const DIST = resolve(process.argv[2] ?? "dist");
const PORT = Number(process.argv[3] ?? 4418);
const TLS = process.env.ACADEMY_PERF_TLS_DIR;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".ico": "image/x-icon", ".txt": "text/plain",
  ".xml": "application/xml", ".webm": "video/webm", ".mp4": "video/mp4", ".wav": "audio/wav", ".gif": "image/gif",
};
const TEXT = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".xml"]);
const cache = new Map();

function load(file) {
  let e = cache.get(file);
  if (e) return e;
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();
  e = {
    buf,
    br: TEXT.has(ext) ? brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) : null,
    etag: `"${createHash("md5").update(buf).digest("hex")}"`,
    type: TYPES[ext] ?? "application/octet-stream",
    ext,
  };
  cache.set(file, e);
  return e;
}

function handle(req, res) {
  try {
    const p = decodeURIComponent(new URL(req.url, "https://x").pathname);
    let file = join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    let fallback = false;
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const index = join(file, "index.html");
      if (existsSync(index)) file = index;
      else if (extname(p)) { res.writeHead(404); res.end(); return; }
      else { file = join(DIST, "index.html"); fallback = true; }
    }
    const e = load(file);
    const headers = { "content-type": e.type, etag: e.etag };
    if (p.startsWith("/assets/")) headers["cache-control"] = "public, max-age=31536000, immutable";
    else if (e.ext === ".html" || fallback) headers["cache-control"] = "no-cache, must-revalidate, max-age=0";
    if (req.headers["if-none-match"] === e.etag) { res.writeHead(304, headers); res.end(); return; }
    let body = e.buf;
    if (e.br && /\bbr\b/.test(req.headers["accept-encoding"] ?? "")) { body = e.br; headers["content-encoding"] = "br"; }
    headers["content-length"] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
}

const tls = TLS && existsSync(join(TLS, "key.pem")) && existsSync(join(TLS, "cert.pem"));
const server = tls
  ? createSecureServer({ key: readFileSync(join(TLS, "key.pem")), cert: readFileSync(join(TLS, "cert.pem")), allowHTTP1: true }, handle)
  : createServer(handle);
// Owned process: stop cleanly when asked (AGENTS.md — never leave servers running).
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref(); // open keep-alive sessions must not hold it up
  });
}
server.listen(PORT, "127.0.0.1", () =>
  console.log(`${tls ? "https (HTTP/2)" : "http (HTTP/1.1 — set ACADEMY_PERF_TLS_DIR for HTTP/2)"}://127.0.0.1:${PORT} <- ${DIST}`));
