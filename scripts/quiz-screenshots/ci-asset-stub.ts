/**
 * CC2 — hermetic stand-in for the combat backend, for the browser-parity CI job.
 *
 *   npx tsx scripts/quiz-screenshots/ci-asset-stub.ts [--port 8000]
 *
 * The render harness resolves two things against `VITE_COMBAT_API_URL`: item /
 * champion / rank images (`<img>` loads) and `GET /api/assets/champions`, the
 * champion manifest the cinematic splash fetches. The parity workflow points
 * that URL (and `VITE_SUPABASE_URL`) at THIS server so a CI run never contacts
 * Railway or Supabase — no production reads, no production writes.
 *
 * Every image path gets a small deterministic PNG whose colour and stripe are
 * derived from the path, so a misplaced or swapped asset still shows up in the
 * pixel diff. The Playwright authority and the browser export load the SAME
 * stub images, so the comparison stays like for like. This is a QA tool only:
 * it is never deployed and binds loopback.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "visual-qa-fixture.json");
const portIndex = process.argv.indexOf("--port");
const PORT = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 8000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A 128×128 RGBA PNG: a path-derived colour with one diagonal stripe. */
function stubPng(path: string): Buffer {
  const size = 128;
  const h = hash(path);
  const [r, g, b] = [(h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff];
  const stripe = 8 + (h % 48);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const on = Math.abs(x - y) < stripe / 4 || Math.abs(x + y - size) < 2;
      const i = row + 1 + x * 4;
      raw[i] = on ? 255 - r : r;
      raw[i + 1] = on ? 255 - g : g;
      raw[i + 2] = on ? 255 - b : b;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Champion names the fixture refers to, so the splash manifest covers them. */
function fixtureChampions(): string[] {
  const text = readFileSync(FIXTURE, "utf8");
  const names = new Set<string>();
  for (const m of text.matchAll(/assets\/champions\/([A-Za-z][A-Za-z0-9]*)\//g)) names.add(m[1]);
  for (const m of text.matchAll(/"champion(?:_name|Name)?"\s*:\s*"([A-Za-z][A-Za-z0-9 '.]*)"/g)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/"id"\s*:\s*"([A-Z][a-z]+[A-Za-z]*)"/g)) names.add(m[1]);
  return [...names].sort();
}

function championManifest() {
  const champions: Record<string, Record<string, string>> = {};
  for (const name of fixtureChampions()) {
    const key = name.replace(/[^A-Za-z0-9]/g, "");
    champions[name] = {
      icon: `assets/champions/${key}/icon.png`,
      splash: `assets/champions/${key}/splash/0_default.png`,
      loading: `assets/champions/${key}/loading/0_default.png`,
      cutout: `assets/champions/${key}/cutouts/${key}_Cutout.png`,
    };
  }
  return { ok: true, count: Object.keys(champions).length, champions };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const manifest = championManifest();
const unknown = new Map<string, number>();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/assets/champions") {
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    res.end(JSON.stringify(manifest));
    return;
  }
  if (req.method === "GET" && /^\/assets\/.+\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) {
    res.writeHead(200, { ...CORS, "Content-Type": "image/png", "Cache-Control": "no-store" });
    res.end(stubPng(url.pathname));
    return;
  }
  const key = `${req.method} ${url.pathname}`;
  unknown.set(key, (unknown.get(key) ?? 0) + 1);
  res.writeHead(404, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "ci-asset-stub: not served" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ci-asset-stub on http://127.0.0.1:${PORT} — ${manifest.count} champion(s) in manifest`);
});

const shutdown = () => {
  if (unknown.size) {
    console.log("unserved requests:");
    for (const [key, count] of [...unknown.entries()].sort()) console.log(`  ${count}× ${key}`);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
