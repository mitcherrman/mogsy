/**
 * /dev/graph1 — GRAPH1 native bar-race dev page.
 *
 * Both launch configurations render through the SAME RacePlayer/RaceRenderer;
 * the switch below only changes which curated dataset is fetched. A `?api=`
 * query param points the fetch at a local backend while the /api/graph1
 * routes are not deployed (e.g. ?api=http://localhost:8321).
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import RacePlayer from "@/components/graph1/RacePlayer";
import { Button } from "@/components/ui/button";
import { useGraph1Dataset } from "@/graph1/useGraph1Dataset";

const DATASETS = [
  { key: "faker-champions", label: "Faker → champions" },
  { key: "azir-players", label: "Azir → players" },
];

export default function Graph1RacePage() {
  const [searchParams] = useSearchParams();
  const apiOverride = searchParams.get("api") ?? undefined;
  const [datasetKey, setDatasetKey] = useState(DATASETS[0].key);
  const { data, isLoading, error } = useGraph1Dataset(datasetKey, apiOverride);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">GRAPH1 · ranked race</h1>
        <nav aria-label="Dataset" className="flex gap-2">
          {DATASETS.map((d) => (
            <Button
              key={d.key}
              type="button"
              size="sm"
              variant={d.key === datasetKey ? "default" : "outline"}
              aria-pressed={d.key === datasetKey}
              onClick={() => setDatasetKey(d.key)}
            >
              {d.label}
            </Button>
          ))}
        </nav>
      </header>

      {isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading dataset…
        </p>
      )}
      {error instanceof Error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message} — start the local API and pass ?api=http://localhost:8321
        </p>
      )}
      {data && <RacePlayer key={data.id} dataset={data} />}
    </main>
  );
}
