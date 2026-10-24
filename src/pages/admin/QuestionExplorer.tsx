/** MQS1 — owner-only query explorer. Backend owns grammar and matching. */
import { useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { getBackendAuthHeaders } from "@/lib/backend-auth";
import { quizApi } from "@/lib/quiz/api";

type Row = Record<string, unknown> & { question_key: string; question_text: string; correct_answer: string };
type Source = "bank" | "candidates";
type QuerySchema = { schema_version: string; fields: string[]; bank_fields: string[]; candidate_families: string[]; max_page_size: number };
const MANA = 'FROM candidates\nWHERE family = "ability_cost_rank" AND resource = "mana"\nORDER BY champion, slot, rank\nLIMIT 10000\nEXPORT CSV';
const BANK = 'FROM bank\nWHERE family = "ability_cost_rank" AND resource = "mana"\nORDER BY champion, slot, rank\nLIMIT 10000\nEXPORT CSV';

function compose(source: Source, family: string, resource: string, champion: string, difficulty: string) {
  const terms = ["family = " + JSON.stringify(family)];
  if (resource !== "any") terms.push("resource = " + JSON.stringify(resource));
  if (champion.trim()) terms.push("champion = " + JSON.stringify(champion.trim()));
  if (difficulty !== "any") terms.push("difficulty >= " + difficulty);
  return "FROM " + source + "\nWHERE " + terms.join("\n  AND ") +
    "\nORDER BY champion, slot, rank\nLIMIT 10000\nEXPORT CSV";
}
async function request(query: string, output: "preview" | "csv", offset = 0) {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(quizApi.baseUrl + "/api/quiz/admin/review/query", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query, output, offset }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error("Query refused (" + response.status + "): " +
      (error?.detail?.message || error?.detail?.code || response.statusText));
  }
  return response;
}
async function getSchema(): Promise<QuerySchema> {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(quizApi.baseUrl + "/api/quiz/admin/review/query/schema", { headers });
  if (!response.ok) throw new Error("Schema unavailable (" + response.status + ")");
  return await response.json() as QuerySchema;
}
export default function QuestionExplorer() {
  const [source, setSource] = useState<Source>("candidates");
  const [family, setFamily] = useState("ability_cost_rank");
  const [resource, setResource] = useState("mana");
  const [champion, setChampion] = useState("");
  const [difficulty, setDifficulty] = useState("any");
  const [query, setQuery] = useState(MANA);
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState<"preview" | "csv" | null>(null);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<QuerySchema | null>(null);
  const [customQuery, setCustomQuery] = useState(false);
  // Bumped whenever the visual filters replace the query, so an in-flight
  // preview for the old query cannot repopulate the results.
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    void getSchema().then(data => {
      if (active) setSchema(data);
    }).catch(() => {
      // The Explorer continues to work without optional schema help.
    });
    return () => { active = false; };
  }, []);

  function filter(next: Partial<{ source: Source; family: string; resource: string; champion: string; difficulty: string }>) {
    const values = {
      source: next.source ?? source, family: next.family ?? family,
      resource: next.resource ?? resource, champion: next.champion ?? champion,
      difficulty: next.difficulty ?? difficulty,
    };
    setSource(values.source); setFamily(values.family);
    setResource(values.resource); setChampion(values.champion);
    setDifficulty(values.difficulty);
    setQuery(compose(values.source, values.family, values.resource, values.champion, values.difficulty));
    generation.current += 1;
    setRows([]); setCount(null); setHasMore(false); setCustomQuery(false); setError("");
  }

  async function run(output: "preview" | "csv") {
    setBusy(output); setError("");
    const started = generation.current;
    try {
      if (output === "preview") {
        const response = await request(query, "preview");
        const data = await response.json() as { rows: Row[]; shown: number; has_more: boolean };
        if (started !== generation.current) return;
        setRows(data.rows); setCount(data.shown); setHasMore(data.has_more);
      } else {
        // Sequential bounded pages, never multiple heavy DB queries in flight.
        // No partial CSV is downloaded if a page fails or size cap is reached.
        const pieces: string[] = [];
        let offset = 0;
        let bytes = 0;
        let completed = false;
        for (let page = 0; page < 12; page++) {
          const response = await request(query, "csv", offset);
          const rowCount = Number(response.headers.get("X-Export-Row-Count"));
          const more = response.headers.get("X-Export-Has-More");
          if (!Number.isSafeInteger(rowCount) || rowCount < 0 || (more !== "true" && more !== "false")) {
            throw new Error("CSV pagination metadata unavailable. Verify backend CORS/header contract.");
          }
          const contents = (await response.text()).replace(/^\uFEFF/, "");
          const chunk = page === 0 ? "\uFEFF" + contents : contents.slice(contents.indexOf("\n") + 1);
          bytes += new TextEncoder().encode(chunk).length;
          if (bytes > 64 * 1024 * 1024) {
            throw new Error("Export exceeds the 64MB browser safety limit. Narrow the query.");
          }
          pieces.push(chunk);
          offset += rowCount;
          if (more === "false") { completed = true; break; }
          if (rowCount === 0) throw new Error("Export pagination stopped progressing.");
        }
        if (!completed) throw new Error("Export exceeded 12 pages. Narrow the query; no partial file was saved.");
        const blob = new Blob(pieces, { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "mogzy-question-export.csv";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (started === generation.current) setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="h-full min-h-0 overflow-auto bg-background p-4" data-testid="question-explorer">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Question Explorer</h2>
            <p className="text-sm text-muted-foreground">Visual filters and query text use one backend engine. Read-only. Full exports are collected in bounded sequential pages (64MB / 12 pages maximum).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={() => void run("preview")}>
              {busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Play className="mr-2 h-4 w-4"/>}Preview
            </Button>
            <Button disabled={busy !== null} onClick={() => void run("csv")}>
              {busy === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}Export CSV
            </Button>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Visual filters</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-xs">Source
              <select aria-label="Source" value={source} onChange={e => filter({source: e.target.value as Source})} className="w-full h-9 rounded border bg-background px-2 text-sm">
                <option value="candidates">Generator candidates</option><option value="bank">Stored bank</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">Family
              <select aria-label="Family" value={family} onChange={e => filter({family: e.target.value})} className="w-full h-9 rounded border bg-background px-2 text-sm">
                <option value="ability_cost_rank">Ability costs</option>
                <option value="ability_cooldown_rank">Cooldowns</option>
                <option value="combat_cooldown">Item/haste cooldowns</option>
                <option value="item_missing_component_v2">Item recipes</option>
                <option value="minion_xp_level_breakpoint">Wave XP</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">Resource
              <select aria-label="Resource" value={resource} onChange={e => filter({resource: e.target.value})} className="w-full h-9 rounded border bg-background px-2 text-sm">
                <option value="any">All</option><option value="mana">Mana</option><option value="energy">Energy</option><option value="health">Health</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">Difficulty
              <select aria-label="Difficulty" value={difficulty} onChange={e => filter({difficulty: e.target.value})} className="w-full h-9 rounded border bg-background px-2 text-sm">
                <option value="any">All</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>Tier {n}+</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs">Champion
              <Input aria-label="Champion" value={champion} onChange={e => filter({champion: e.target.value})} placeholder="All champions" className="h-9"/>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Generator preview currently supports ability_cost_rank only. All stored-bank families can be queried. For advanced combinations, edit the query below.</p>
          {schema && <p className="text-xs text-muted-foreground" data-testid="query-schema">
            Available bank fields: {schema.bank_fields.join(", ")}.
            Candidate providers: {schema.candidate_families.join(", ")}.
          </p>}
          {customQuery && <p className="text-xs text-amber-600 dark:text-amber-400">
            Custom command active. The visual controls show your last selections; changing a filter replaces the custom command.
          </p>}
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="mqs-query" className="text-sm font-semibold">Mogzy Query Language</label>
              <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(query).catch(() => setError("Copy failed: clipboard unavailable."))}><Copy className="mr-1 h-4 w-4"/>Copy</Button>
            </div>
            <Textarea id="mqs-query" spellCheck={false} value={query} onChange={e => { setQuery(e.target.value); setCustomQuery(true); }} rows={6} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Presets</p>
            <Button variant="outline" className="w-full justify-start" onClick={() => { setQuery(MANA); setCustomQuery(true); }}>All producible mana costs</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => { setQuery(BANK); setCustomQuery(true); }}>Stored mana-cost questions</Button>
          </div>
        </div>
        {error && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
        <div className="space-y-2" aria-label="Query results">
          <p className="text-sm font-semibold">{count === null ? "No preview loaded" : count.toLocaleString() + " shown" + (hasMore ? " · more available" : "")}</p>
          {rows.length > 0 && <div className="overflow-auto rounded border">
            <table className="min-w-[750px] w-full text-left text-xs">
              <thead className="bg-muted"><tr>{["Champion","Ability","Rank","Family","Question","Answer","Stored?"].map(h => <th className="px-3 py-2" key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(0,75).map((r,i) => <tr key={r.question_key + i} className="border-t align-top">
                {["champion","slot","rank","family","question_text","correct_answer","bank_status"].map(k => <td key={k} className="px-3 py-2">{String(r[k] ?? "")}</td>)}
              </tr>)}</tbody>
            </table>
          </div>}
          {rows.length > 75 && <p className="text-xs text-muted-foreground">First 75 shown; CSV contains the complete result.</p>}
        </div>
      </div>
    </main>
  );
}
