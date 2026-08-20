// ---------------------------------------------------------------------------
// Leaguecraft — quiz content, corrections, mastery and engine diagnostics.
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
      sectionExtras={{ mastery: <MasteryDigestLookup /> }}
    />
  );
}
