// One side's frozen configuration: champion splash, build, and the ordered
// action sequence. Utility/heal/setup actions are labelled clearly. Shows only
// public input fields — never any validation detail that could reveal the result.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ChampionPortrait from "./ChampionPortrait";
import type { BattleAction, BattleSideSummary } from "@/lib/combat-battles/types";

function actionLabel(a: BattleAction): { text: string; kind: "damage" | "basic" } {
  if (a.type === "basic_attack") return { text: "Basic attack", kind: "basic" };
  const slot = a.slot ? a.slot.toUpperCase() : (a.active_name ?? "Ability");
  return { text: slot, kind: "damage" };
}

export default function SideConfig({
  side,
  data,
  highlight,
}: {
  side: "left" | "right";
  data: BattleSideSummary;
  highlight?: boolean;
}) {
  const ranks = Object.entries(data.ability_ranks || {});
  return (
    <Card
      className={`border-primary/30 bg-card/70 backdrop-blur-sm ${highlight ? "ring-2 ring-primary" : ""}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{data.champion}</CardTitle>
          <Badge variant="outline" className="uppercase">{side}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChampionPortrait champion={data.champion} variant="splash" />

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Level</dt>
            <dd className="font-medium">{data.level}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Crit mode</dt>
            <dd className="font-medium capitalize">{data.crit_mode}</dd>
          </div>
          {ranks.length > 0 && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Ability ranks</dt>
              <dd className="font-medium">
                {ranks.map(([k, v]) => `${k} ${v}`).join(" · ")}
              </dd>
            </div>
          )}
          {data.starting_hp != null && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Starting HP</dt>
              <dd className="font-medium">{Math.round(data.starting_hp).toLocaleString()}</dd>
            </div>
          )}
        </dl>

        {data.items.length > 0 && (
          <div>
            <div className="mb-1 text-sm text-muted-foreground">Items</div>
            <div className="flex flex-wrap gap-1">
              {data.items.map((it, i) => (
                <Badge key={`${it}-${i}`} variant="secondary">{it}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.runes.length > 0 && (
          <div>
            <div className="mb-1 text-sm text-muted-foreground">Runes</div>
            <div className="flex flex-wrap gap-1">
              {data.runes.map((r, i) => (
                <Badge key={`${r}-${i}`} variant="outline">{r}</Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 text-sm text-muted-foreground">Action sequence</div>
          <ol className="space-y-1">
            {data.actions.map((a, i) => {
              const label = actionLabel(a);
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                  <Badge variant={label.kind === "basic" ? "outline" : "default"}>{label.text}</Badge>
                </li>
              );
            })}
          </ol>
        </div>

        {data.target_assumptions && Object.keys(data.target_assumptions).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Runs against the opposing champion's defenses.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
