import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BrainCircuit, Swords, Zap, Shield, Check } from "lucide-react";
import {
  type ChampionManifest,
  getChampionSplash,
} from "@/hooks/useChampionAssets";
import { playUiSfx } from "@/lib/ui-sfx";

export type TrainingModeKey = "quiz" | "lab" | "swipe";

type TrainingMode = {
  key: TrainingModeKey;
  label: string;
  to: string;
  championName: string;
  description: string;
  Icon: React.ElementType;
};

const TRAINING_MODES: TrainingMode[] = [
  {
    key: "quiz",
    label: "Quiz",
    to: "/quiz",
    championName: "Ryze",
    description: "Test champions, items, mechanics, and esports knowledge.",
    Icon: BrainCircuit,
  },
  {
    key: "lab",
    label: "Combat Lab",
    to: "/combat-lab",
    championName: "Akali",
    description: "Simulate builds, combos, damage, and patch changes.",
    Icon: Swords,
  },
  {
    key: "swipe",
    label: "League Swipe",
    to: "/league-swipe",
    championName: "Jinx",
    description: "Vote, compare, and see what the League community thinks.",
    Icon: Zap,
  },
];

// Octagonal Hextech clip matching the zipper cards below.
const HERO_CLIP =
  "polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px)";

type Props = {
  assets: ChampionManifest | null | undefined;
  /** Fired when the primary Start Quiz CTA is clicked (funnel tracking lives in the page). */
  onStartQuiz: () => void;
};

/**
 * "Hextech Training Chamber" hero for /lol. Left: fixed headline + CTAs +
 * training-mode selectors. Right: layered champion scene that crossfades as
 * the selected mode changes. Pure CSS animation; respects reduced motion.
 */
export default function HexTrainingHero({ assets, onStartQuiz }: Props) {
  const navigate = useNavigate();
  const [modeKey, setModeKey] = useState<TrainingModeKey>("quiz");
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const mode = TRAINING_MODES.find((m) => m.key === modeKey)!;

  return (
    <section className="relative">
      {/* Outer Hextech border layer */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#0ac8ff]/40 via-[#c9a84c]/25 to-[#0ac8ff]/40"
        style={{ clipPath: HERO_CLIP }}
        aria-hidden
      />
      <div
        className="relative m-[2px] overflow-hidden bg-gradient-to-br from-[#0a1428] via-[#091428] to-[#020610]"
        style={{
          clipPath: HERO_CLIP,
          boxShadow:
            "inset 0 0 40px rgba(10,200,255,0.08), inset 0 0 0 1px rgba(201,168,76,0.15)",
        }}
      >
        {/* Ambient drifting glow across the whole chamber */}
        <div
          className="hero-glow-pulse pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 80% at 80% 30%, rgba(10,200,255,0.14) 0%, transparent 60%), radial-gradient(40% 60% at 15% 85%, rgba(201,168,76,0.10) 0%, transparent 60%)",
          }}
          aria-hidden
        />
        {/* Faint hex grid */}
        <div className="hero-hexgrid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />

        <div className="relative grid grid-cols-1 md:grid-cols-[1.05fr_1fr] md:min-h-[360px]">
          {/* ---------- Left: copy + CTAs + mode selectors ---------- */}
          <div className="relative z-10 flex flex-col justify-center gap-3 p-6 md:p-8">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#c9a84c] font-bold">
              Mogsy × LoL
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-[#f0e6d2]">
              Train Your League Knowledge
            </h1>
            <p className="text-xs md:text-sm text-[#a09b8c] max-w-xl">
              Quiz mechanics, test builds, compare damage, and learn League one
              decision at a time.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  playUiSfx("primaryAction");
                  onStartQuiz();
                  navigate("/quiz");
                }}
                className="hero-cta-gold inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#c9a84c] to-[#a8862f] px-4 py-2.5 text-sm font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f] transition-colors"
              >
                Start Quiz
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/combat-lab"
                onClick={() => playUiSfx("primaryAction")}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#0ac8ff]/40 bg-[#0ac8ff]/10 px-4 py-2.5 text-sm font-bold text-[#8fdcff] hover:bg-[#0ac8ff]/20 hover:border-[#0ac8ff]/70 hover:-translate-y-0.5 hover:shadow-[0_4px_18px_rgba(10,200,255,0.35)] motion-reduce:hover:translate-y-0 transition-all duration-300"
              >
                Open Combat Lab
              </Link>
              <span className="text-[11px] text-muted-foreground">No account needed</span>
            </div>

            {/* Training mode selectors */}
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#0ac8ff]/80 font-bold mb-2">
                Choose Your Training
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
                {TRAINING_MODES.map((m) => {
                  const active = m.key === modeKey;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setModeKey(m.key)}
                      aria-pressed={active}
                      className={`shrink-0 inline-flex min-h-[40px] items-center gap-2 px-3.5 py-2 text-xs font-bold transition-colors border ${
                        active
                          ? "hero-tab-active border-[#c9a84c]/80 bg-[#c9a84c]/15 text-[#f0d78c]"
                          : "border-white/10 bg-black/30 text-[#a09b8c] hover:border-[#0ac8ff]/40 hover:text-[#cfe9f5]"
                      }`}
                      style={{
                        clipPath:
                          "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)",
                      }}
                    >
                      <m.Icon className={`h-3.5 w-3.5 ${active ? "text-[#c9a84c]" : "text-[#0ac8ff]/70"}`} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {/* Mode description + destination link — re-keyed so it fades in on change */}
              <div key={mode.key} className="hero-mode-in mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs text-[#a09b8c]">{mode.description}</p>
                <Link
                  to={mode.to}
                  className="text-xs font-semibold text-[#0ac8ff] hover:underline inline-flex items-center gap-1"
                >
                  Enter {mode.label} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* ---------- Right: layered champion scene ---------- */}
          <div className="relative min-h-[220px] md:min-h-0 overflow-hidden">
            {/* Champion splash layers — all mounted, active one crossfades in */}
            {TRAINING_MODES.map((m) => {
              const url = getChampionSplash(assets, m.championName);
              const active = m.key === modeKey;
              const ok = !!url && !failed[m.key];
              return (
                <div
                  key={m.key}
                  className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={!active}
                >
                  {ok ? (
                    <img
                      src={url!}
                      alt=""
                      aria-hidden
                      loading={m.key === "quiz" ? "eager" : "lazy"}
                      onError={() => setFailed((f) => ({ ...f, [m.key]: true }))}
                      className={`h-full w-full object-cover ${active ? "hero-champ-float" : ""}`}
                      style={{ objectPosition: "center 20%" }}
                    />
                  ) : (
                    // Graceful fallback: Hextech shield silhouette
                    <div className="h-full w-full flex items-center justify-center">
                      <Shield className="h-1/2 w-1/2 text-[#0ac8ff]/50" strokeWidth={1.25} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Dark overlays keeping left text readable and art grounded */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, #091428 0%, rgba(9,20,40,0.55) 25%, rgba(9,20,40,0.1) 60%, rgba(9,20,40,0.45) 100%), linear-gradient(to top, rgba(2,6,16,0.85) 0%, transparent 45%)",
              }}
              aria-hidden
            />

            {/* Targeting ring */}
            <div
              className="pointer-events-none absolute right-[8%] top-1/2 -translate-y-1/2 h-56 w-56 md:h-72 md:w-72"
              aria-hidden
            >
              <div className="hero-ring-spin absolute inset-0 rounded-full border border-dashed border-[#0ac8ff]/30" />
              <div className="hero-ring-spin-reverse absolute inset-6 rounded-full border border-[#c9a84c]/25" />
              <div className="hero-glow-pulse absolute inset-10 rounded-full" style={{ boxShadow: "0 0 60px rgba(10,200,255,0.25) inset" }} />
            </div>

            {/* Ambient particles — varied size, delay, and duration */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {[
                { left: 12, size: 3, delay: 0, dur: 7.5 },
                { left: 34, size: 4, delay: 2.2, dur: 9 },
                { left: 55, size: 2, delay: 4.1, dur: 6.5 },
                { left: 72, size: 3, delay: 1.3, dur: 8 },
                { left: 88, size: 2, delay: 5.4, dur: 10 },
              ].map((p) => (
                <span
                  key={p.left}
                  className="hero-particle absolute bottom-0 rounded-full bg-[#0ac8ff]/50"
                  style={{
                    left: `${p.left}%`,
                    width: p.size,
                    height: p.size,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.dur}s`,
                  }}
                />
              ))}
            </div>

            {/* Decorative side diamonds */}
            <div className="pointer-events-none absolute inset-y-0 right-3 hidden md:flex flex-col items-center justify-center gap-6" aria-hidden>
              <span className="hero-diamond h-2 w-2 border border-[#c9a84c]/40" />
              <span className="hero-diamond h-1.5 w-1.5 bg-[#0ac8ff]/30" style={{ animationDelay: "-4s" }} />
              <span className="hero-diamond h-2 w-2 border border-[#0ac8ff]/35" style={{ animationDelay: "-7s" }} />
            </div>

            {/* Floating mini-panel — re-keyed per mode for fade/slide-in */}
            <div key={mode.key} className="hero-mode-in absolute left-4 bottom-4 md:left-6 md:bottom-6 z-10">
              {/* Drift lives on an inner wrapper so it composes with the mode-in transform */}
              <div className="hero-panel-drift">
                <ModePanel modeKey={mode.key} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Compact supporting visual for the selected training mode. */
function ModePanel({ modeKey }: { modeKey: TrainingModeKey }) {
  const frame = "border border-[#0ac8ff]/30 bg-[#050d1c]/85 backdrop-blur-sm px-3.5 py-2.5";
  const clip = {
    clipPath:
      "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)",
  };

  if (modeKey === "quiz") {
    return (
      <div className={frame} style={clip}>
        <div className="text-[9px] uppercase tracking-[0.2em] text-[#0ac8ff]/80 font-bold mb-1">
          Knowledge Check
        </div>
        <div className="text-[11px] font-semibold text-[#f0e6d2] mb-1.5">
          Which item builds into Trinity Force?
        </div>
        <div className="flex gap-1.5">
          <span className="inline-flex items-center gap-1 rounded border border-[#c9a84c]/60 bg-[#c9a84c]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#f0d78c]">
            <Check className="h-2.5 w-2.5" /> Sheen
          </span>
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-[#a09b8c]">Kindlegem</span>
        </div>
      </div>
    );
  }

  if (modeKey === "lab") {
    return (
      <div className={frame} style={clip}>
        <div className="text-[9px] uppercase tracking-[0.2em] text-[#0ac8ff]/80 font-bold mb-1.5">
          Damage Readout
        </div>
        {[
          { label: "Q", val: 342, pct: 40 },
          { label: "E", val: 518, pct: 62 },
          { label: "R", val: 890, pct: 100 },
        ].map((r) => (
          <div key={r.label} className="flex items-center gap-2 mb-1 last:mb-0">
            <span className="w-3 text-[10px] font-bold text-[#c9a84c]">{r.label}</span>
            <span className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-[#0ac8ff] to-[#c9a84c]"
                style={{ width: `${r.pct}%` }}
              />
            </span>
            <span className="text-[10px] tabular-nums text-[#f0e6d2]">{r.val}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={frame} style={clip}>
      <div className="text-[9px] uppercase tracking-[0.2em] text-[#0ac8ff]/80 font-bold mb-1.5">
        Community Pick
      </div>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <span className="rounded border border-[#0ac8ff]/50 bg-[#0ac8ff]/15 px-2 py-1 text-[#8fdcff]">Jinx 62%</span>
        <span className="text-[9px] uppercase tracking-widest text-[#a09b8c]">vs</span>
        <span className="rounded border border-white/10 px-2 py-1 text-[#a09b8c]">Vi 38%</span>
      </div>
    </div>
  );
}
