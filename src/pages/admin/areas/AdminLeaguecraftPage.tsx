// ---------------------------------------------------------------------------
// Leaguecraft — quiz content, corrections, mastery and engine diagnostics.
//
// USERS1 folded RANKED in as a section: Ranked is a Leaguecraft mode, and a
// sidebar that listed it beside Leaguecraft was describing the order the
// features shipped in, not the product. All six of its operator views and all
// eleven of its tools came with it, unchanged.
//
// The unified /admin/quiz-content workspace is deliberately NOT split or
// re-mounted here: Builder and Review were consolidated on purpose and the
// consolidation works. This area cross-links it and adds the one thing that
// was missing — a navigation source for the Mastery artifact reviewer, which
// was reachable by direct URL only.
// ---------------------------------------------------------------------------

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import AdminRegistryAreaPage from "./AdminRegistryAreaPage";
import AdminRankedPage from "./AdminRankedPage";

function MasteryDigestLookup() {
  const [digest, setDigest] = useState("");
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = digest.trim();
    if (value) navigate(`/admin/mastery/${encodeURIComponent(value)}`);
  };

  return (
    <AdminPanel
      title="Mastery artifact reviewer"
      description="The reviewer at /admin/mastery/:artifactDigest had no navigation source anywhere in the product. This is it — a lookup into the existing route. Read-only."
      testId="leaguecraft-mastery-lookup"
    >
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          value={digest}
          onChange={(e) => setDigest(e.target.value)}
          placeholder="artifact digest"
          aria-label="Mastery artifact digest"
          data-testid="mastery-digest-input"
          className="h-8 max-w-xs text-xs"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 text-[11px]"
          disabled={!digest.trim()}
          data-testid="mastery-digest-submit"
        >
          Open reviewer
        </Button>
      </form>
    </AdminPanel>
  );
}

export default function AdminLeaguecraftPage() {
  return (
    <AdminRegistryAreaPage
      areaId="leaguecraft"
      sectionExtras={{
        mastery: <MasteryDigestLookup />,
        // USERS1 — Ranked is a mode of this product, not a peer of it. The
        // whole operator surface is mounted here unchanged; it brings its own
        // six views and its own tool grids, so the hub's grid is suppressed
        // for this section (the tools are already inside it).
        ranked: <AdminRankedPage />,
      }}
      sectionsWithOwnTools={["ranked"]}
    />
  );
}
