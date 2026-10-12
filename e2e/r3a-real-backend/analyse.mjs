// DEV ONLY (RECONSTRUCT R3A). Reads the *.frames.json files `play-match.mjs` wrote and prints
//   1. per-region movement INSIDE each segment (a host-owned region moving is not Reconstruct's),
//   2. the container deltas AT each round swap,
//   3. the host lifecycle per segment: ack -> hold -> reveal stages -> swap/outro, and how long the
//      educational evidence was actually on screen.
//
//   node e2e/r3a-real-backend/analyse.mjs ./r3a-out
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "./r3a-out";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".frames.json")).sort();
const OWN = ["module", "target", "sockets", "socket0", "status", "region", "tray", "footer", "opponentLine", "evidence", "breakdown", "equation"];
const HOST = ["header", "railL", "railR", "board", "body", "timeline", "shell"];
const SWAP = ["shell", "header", "railL", "board", "body", "module", "target", "sockets", "status", "region", "footer", "opponentLine", "timeline"];
const seg = (f) => { const m = /^s(\d)-/.exec(f.step ?? ""); return m ? +m[1] : (f.step === "end-screen" ? 9 : 0); };
const r = (n) => Math.round(n);

for (const fn of files) {
  const all = JSON.parse(fs.readFileSync(path.join(dir, fn), "utf8"));
  const F = all.filter((f) => f.phase !== null && f.r.module);
  console.log(`\n=== ${fn.replace(".frames.json", "")}`);

  // 1. movement inside segments
  const moved = [];
  for (let s = 1; s <= 3; s++) {
    const fr = F.filter((f) => seg(f) === s || (s === 1 && seg(f) === 0)).filter((f) => !f.host.includes("over"));
    for (const k of [...HOST, ...OWN]) {
      const seen = fr.filter((f) => f.r[k]);
      let t = 0, h = 0, l = 0;
      for (let i = 1; i < seen.length; i++) {
        if (seen[i].target !== seen[i - 1].target) continue;
        t = Math.max(t, Math.abs(seen[i].r[k][0] + seen[i].sy - seen[i - 1].r[k][0] - seen[i - 1].sy));
        h = Math.max(h, Math.abs(seen[i].r[k][3] - seen[i - 1].r[k][3]));
        l = Math.max(l, Math.abs(seen[i].r[k][1] - seen[i - 1].r[k][1]));
      }
      if (t > 1 || h > 1 || l > 1) {
        const hdr = fr.filter((f) => f.r.header);
        const hdrMoved = hdr.some((f, i) => i > 0 && f.target === hdr[i - 1].target && Math.abs(f.r.header[3] - hdr[i - 1].r.header[3]) > 1);
        const who = HOST.includes(k) ? "host" : hdrMoved ? "reconstruct, carried by the host header" : "RECONSTRUCT'S OWN";
        moved.push(`seg${s}:${k} (${who}) dTop ${r(t)} dH ${r(h)} dLeft ${r(l)}`);
      }
    }
  }
  console.log("1. movement inside a segment (>1px):", moved.length ? "\n   " + moved.join("\n   ") : "none");

  // 2. swaps
  const sw = {};
  for (let i = 1; i < F.length; i++) {
    if (F[i].target !== F[i - 1].target && F[i].phase === "open") {
      for (const k of SWAP) {
        const a = F[i - 1].r[k], b = F[i].r[k];
        if (!a || !b) continue;
        const g = (sw[k] ??= { n: 0, t: 0, h: 0, l: 0, w: 0 });
        g.n++; g.t = Math.max(g.t, Math.abs(a[0] + F[i - 1].sy - b[0] - F[i].sy)); g.h = Math.max(g.h, Math.abs(a[3] - b[3]));
        g.l = Math.max(g.l, Math.abs(a[1] - b[1])); g.w = Math.max(g.w, Math.abs(a[2] - b[2]));
      }
    }
  }
  console.log("2. container deltas at round swaps:",
    Object.entries(sw).map(([k, g]) => `${k}: dTop ${r(g.t)} dH ${r(g.h)} dLeft ${r(g.l)} dW ${r(g.w)}`).join(" | ") || "no swap observed");

  // 3. lifecycle
  console.log("3. host lifecycle (ms after the reveal's first frame):");
  for (let s = 1; s <= 3; s++) {
    const lock = all.find((f) => f.step === `s${s}-lock` && f.phase === "open");
    if (!lock) continue;
    const next = all.find((f) => f.step === `s${s + 1}-open` && f.t > lock.t);
    const after = all.filter((f) => f.t >= lock.t && (!next || f.t < next.t));
    const rev = after.find((f) => f.phase === "revealed");
    if (!rev) { console.log(`   seg${s}: no reveal`); continue; }
    const at = (x) => (x ? r(x.t - rev.t) : null);
    const hold = after.find((f) => f.host.startsWith("true"));
    const settle = after.find((f) => f.stage === "settle");
    const ev = after.find((f) => f.stage === "evidence");
    const done = after.find((f) => f.stage === "done");
    const final = s === 3;
    const end = final ? after.find((f) => f.host.includes("outro")) : after.find((f) => f.phase === "open" && f.target !== lock.target);
    const over = final ? after.find((f) => f.host.includes("over")) : null;
    const wrong = !!settle;
    console.log(`   seg${s} ${final ? "FINAL " : "      "}${wrong ? "wrong  " : "correct"} hold@${at(hold)} settle@${at(settle)} evidence@${at(ev)} done@${at(done)} ` +
      `${final ? "outro" : "swap"}@${at(end)}${over ? ` end-screen@${at(over)}` : ""}` +
      `  => evidence on screen ${end && ev ? r(end.t - ev.t) : "?"} ms, fully settled ${end && done ? r(end.t - done.t) : end && !done ? "CUT BEFORE DONE" : "?"} ms`);
  }
}
