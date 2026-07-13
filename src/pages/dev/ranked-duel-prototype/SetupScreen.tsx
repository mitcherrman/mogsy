import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles, Crosshair, Lock, Check } from "lucide-react";
import { DUEL_CLASSES, DuelClassId, MOCK_PLAYERS, PlayerId } from "./fixtures";

const CLASS_ICON = { tank: Shield, mage: Sparkles, marksman: Crosshair } as const;

function ClassPicker({
  player,
  value,
  onChange,
}: {
  player: PlayerId;
  value: DuelClassId;
  onChange: (c: DuelClassId) => void;
}) {
  const identity = MOCK_PLAYERS[player];
  return (
    <fieldset className="rounded-xl border bg-card p-4 space-y-3 flex-1 min-w-0">
      <legend className="sr-only">{identity.name} class selection</legend>
      <div className="font-bold">{identity.name}</div>
      <div className="grid gap-2">
        {DUEL_CLASSES.map((cls) => {
          const Icon = CLASS_ICON[cls.id];
          const selected = value === cls.id;
          return (
            <button
              key={cls.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(cls.id)}
              className={`rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="h-4 w-4" aria-hidden />
                {cls.name}
                {selected && (
                  <Badge className="ml-auto gap-1">
                    <Check className="h-3 w-3" aria-hidden />
                    Selected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{cls.identity}</p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                <span>Starting HP: {cls.startingHp}</span>
                {/* Relative durability cue (vs. the highest class HP fixture). */}
                <span className="h-1.5 w-20 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-emerald-500/80"
                    style={{ width: `${Math.round((cls.startingHp / 120) * 100)}%` }}
                  />
                </span>
                <span className="text-[10px]">(fixture)</span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                <li>
                  <Badge className="gap-1 text-[10px]">
                    {cls.startingAbility.name} · Starter active · Lv1
                  </Badge>
                </li>
                {cls.levelTwoChoices.map((a) => (
                  <li key={a.id}>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Lock className="h-2.5 w-2.5" aria-hidden />
                      {a.name} · Normal
                    </Badge>
                  </li>
                ))}
                <li>
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Lock className="h-2.5 w-2.5" aria-hidden />
                    {cls.futureUltimate.name} · Future ultimate
                  </Badge>
                </li>
              </ul>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                <strong>Lv1:</strong> starter active from the first round. <strong>Lv2:</strong>{" "}
                pick one of the two normals. <strong>Lv3 (max):</strong> the other normal unlocks
                automatically. <strong>Ultimate:</strong> future — not implemented. Mock concepts
                only, not finalized balance.
              </p>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SetupScreen({
  onStart,
}: {
  onStart: (classes: Record<PlayerId, DuelClassId>) => void;
}) {
  const [p1, setP1] = useState<DuelClassId>("tank");
  const [p2, setP2] = useState<DuelClassId>("mage");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <strong>Prototype:</strong> mock classes and abilities. Players start at Level&nbsp;1 with
        one starting active ability; further normal abilities unlock at Levels 2 and 3. Every
        ability is an active ability, and ultimates are not implemented yet. Ability effects are
        not finalized — names below are UI placeholders, not balance decisions.
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        <ClassPicker player="p1" value={p1} onChange={setP1} />
        <ClassPicker player="p2" value={p2} onChange={setP2} />
      </div>
      <Button size="lg" className="w-full md:w-auto" onClick={() => onStart({ p1, p2 })}>
        Start Mock Match
      </Button>
    </div>
  );
}
