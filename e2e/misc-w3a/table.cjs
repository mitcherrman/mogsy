/* Prints a markdown table from measure.cjs output: node table.cjs <file.json> [<other.json>] */
const fs = require("fs");
const [a, b] = process.argv.slice(2).map((f) => f && JSON.parse(fs.readFileSync(f, "utf8")).results);
const key = (r) => `${r.state}|${r.vp}`;
const mb = b && new Map(b.map((r) => [key(r), r]));
const VPS = ["320x568", "360x640", "375x667", "390x844", "1280x800", "667x375-land", "844x390-land"];
const states = [...new Set(a.map((r) => r.state))];
const cell = (r) => !r ? "–" : r.error ? "ERR" : `${Math.round(r.docH)}/${r.vh} (+${Math.max(0, Math.round(r.travel))})${r.primaryInView ? " ✓" : ""}`;
console.log(`| state | ${VPS.join(" | ")} |`);
console.log(`|---|${VPS.map(() => "---").join("|")}|`);
for (const s of states) {
  const row = VPS.map((v) => {
    const x = a.find((r) => r.state === s && r.vp === v);
    if (!mb) return cell(x);
    const y = mb.get(`${s}|${v}`);
    return `${cell(x)} → ${cell(y)}`;
  });
  console.log(`| ${s} | ${row.join(" | ")} |`);
}
