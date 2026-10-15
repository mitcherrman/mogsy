/**
 * INT1 — `/admin/interaction-labs/:lab`: the owner-only playtest entry for the
 * Rangefinder (GM-R1) and Glyph Press (WP1) prototypes on the live site.
 *
 * Access: App.tsx wraps this page in `AdminRoute` (owner session + device MFA,
 * decided by `owner_auth_state`). That gate is UX only — the page's JS chunk is
 * a public static file like any other — so the chunk carries NO answer bank.
 * The owner loads the lab's committed fixture from their own disk; it is
 * validated in `packs.ts`, held in memory, and never uploaded or persisted
 * (a refresh asks for it again).
 *
 * Grading is the original labs' stand-in server running in this tab. It is not
 * server-authoritative, and every surface says so.
 */
import { lazy, Suspense, useId, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { RangeAuthorityCapture } from "@/lib/rangefinder/eligibility";
import type { FixtureRound } from "@/pages/dev/word-puzzle/labAuthority";
import {
  LAB_PACK_FILES, PROTOTYPE_LABEL, isLabId, readPackFile, readRangefinderPack, readWordPuzzlePack, type LabId,
} from "@/lib/interaction-labs/packs";

const RangefinderLab = lazy(() => import("@/pages/dev/rangefinder/RangefinderLab"));
const WordPuzzleLab = lazy(() => import("@/pages/dev/word-puzzle/WordPuzzleLab"));

const LABS: Record<LabId, { title: string; mechanic: string }> = {
  rangefinder: { title: "Rangefinder", mechanic: "GM-R1 · place a target at an ability's cast range" },
  "word-puzzle": { title: "Glyph Press", mechanic: "WP1 · complete a partially engraved name" },
};

type Loaded =
  | { lab: "rangefinder"; capture: RangeAuthorityCapture; fileName: string }
  | { lab: "word-puzzle"; rounds: readonly FixtureRound[]; fileName: string };

function PrototypeBanner() {
  return (
    <p data-testid="lab-prototype-label" className="inline-block rounded border border-[#d9825a] bg-[#2a1610] px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#f0a27c]">
      {PROTOTYPE_LABEL}
    </p>
  );
}

function LabIndex() {
  return (
    <main data-testid="interaction-labs-index" className="mx-auto w-full max-w-xl space-y-4 px-4 py-8">
      <PrototypeBanner />
      <h1 className="text-xl font-semibold">Interaction mode labs</h1>
      <p className="text-sm text-muted-foreground">Owner-only playtests. Not part of Ranked, Daily or any public format.</p>
      <ul className="space-y-2">
        {(Object.keys(LABS) as LabId[]).map((id) => (
          <li key={id}>
            <Link to={`/admin/interaction-labs/${id}`} className="block min-h-[44px] rounded border border-border p-3 hover:bg-muted/30">
              <span className="font-medium">{LABS[id].title}</span>
              <span className="block text-xs text-muted-foreground">{LABS[id].mechanic}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function PackLoader({ lab, onLoaded }: { lab: LabId; onLoaded: (l: Loaded) => void }) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    if (lab === "rangefinder") {
      const r = await readPackFile(file, readRangefinderPack);
      if (r.ok) onLoaded({ lab, capture: r.pack, fileName: file.name });
      else setError("error" in r ? r.error : "Unreadable pack.");
    } else {
      const r = await readPackFile(file, readWordPuzzlePack);
      if (r.ok) onLoaded({ lab, rounds: r.pack, fileName: file.name });
      else setError("error" in r ? r.error : "Unreadable pack.");
    }
    setBusy(false);
  };

  return (
    <main data-testid="interaction-lab-loader" data-lab={lab} className="mx-auto w-full max-w-xl space-y-4 px-4 py-8">
      <PrototypeBanner />
      <h1 className="text-xl font-semibold">{LABS[lab].title} lab</h1>
      <p className="text-sm text-muted-foreground">{LABS[lab].mechanic}</p>
      <div className="space-y-2 rounded border border-border p-4">
        <label htmlFor={inputId} className="block text-sm font-medium">Load the lab pack</label>
        <p className="text-xs text-muted-foreground">
          Choose <code className="break-all">{LAB_PACK_FILES[lab]}</code> from your checkout. It stays in this tab:
          nothing is uploaded or saved, and a refresh asks for it again.
        </p>
        <input id={inputId} data-testid="lab-pack-input" type="file" accept="application/json,.json" disabled={busy} onChange={onFile}
          className="block min-h-[44px] w-full text-sm file:mr-3 file:min-h-[44px] file:rounded file:border file:border-border file:bg-muted/30 file:px-3" />
        <p role="alert" data-testid="lab-pack-error" className="min-h-[1.25rem] text-xs text-red-400">{error ?? ""}</p>
      </div>
      <Link to="/admin/interaction-labs" className="inline-flex min-h-[44px] items-center text-sm underline">All interaction labs</Link>
    </main>
  );
}

export default function InteractionLabPage() {
  const { lab } = useParams();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  if (lab === undefined) return <LabIndex />;
  if (!isLabId(lab)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8 text-sm" data-testid="interaction-lab-unknown">
        No such lab. <Link to="/admin/interaction-labs" className="underline">All interaction labs</Link>
      </main>
    );
  }
  if (!loaded || loaded.lab !== lab) return <PackLoader lab={lab} onLoaded={setLoaded} />;

  return (
    <div data-testid="interaction-lab-live" data-lab={lab} data-pack={loaded.fileName}>
      <Suspense fallback={<div aria-hidden className="min-h-[50vh]" />}>
        {loaded.lab === "rangefinder" ? <RangefinderLab capture={loaded.capture} /> : <WordPuzzleLab rounds={loaded.rounds} />}
      </Suspense>
    </div>
  );
}
