import { createRoot } from "react-dom/client";
import "../src/index.css";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import {
  metaReflexCards, metaReflexSegmentMeta, metaReflexState, publicRoundV2, settledCardReveal,
} from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { metaReflexModule } from "@/lib/ranked-core/modules/metaReflexModule";

const q = new URLSearchParams(location.search);
const card = Number(q.get("card") ?? 0);
const outcome = q.get("outcome") ?? "correct";
const phase = q.get("phase") ?? "reveal";
const long = q.get("long") === "1";

const cards = metaReflexCards() as any[];
if (long) {
  cards[card].left.label = "Guardian Angel of the Ruined";
  cards[card].right.label = "Bloodthirster's Curse";
}
const kind = cards[card].kind as string;
const defaults: Record<string, [string | null, string | null]> = {
  magnitude: ["3,450 gold", "3,400 gold"],
  classification: ["Energy", "Mana"],
  recognition: [null, null],
};
let [lv, rv] = defaults[kind];
if (q.get("l")) lv = q.get("l"); if (q.get("r")) rv = q.get("r");
if (long) { lv = "1,234,567 gold"; rv = "1,234,566 gold"; }
if (q.get("null") === "1") { lv = null; rv = null; }

const sel = outcome === "timeout" || outcome === "unanswered" ? null
  : outcome === "correct" ? `c${card}:left` : `c${card}:right`;
const over = {
  kind, entity_kind: cards[card].entity_kind, outcome,
  selected_card_id: sel, correct_card_id: `c${card}:left`,
  left: { label: cards[card].left.label ?? (kind === "recognition" ? "Xerath W" : null), value_display: lv },
  right: { label: cards[card].right.label ?? (kind === "recognition" ? "Xerath E" : null), value_display: rv },
};
const reveals = Array.from({ length: card + 1 }, (_, i) =>
  i === card ? settledCardReveal(i, over) : settledCardReveal(i));
const finalCard = q.get("final") === "1";
const stateRaw = phase === "live"
  ? metaReflexState(card, { challenges: { prompt: "x", challenge_count: 5, challenges: cards },
      own_card_reveals: Array.from({ length: card }, (_, i) => settledCardReveal(i)) })
  : metaReflexState(card + 1, {
    challenges: { prompt: "x", challenge_count: 5, challenges: cards },
    own_card_reveals: reveals,
    own_revealing_card_index: finalCard ? null : card,
    own_reveal_until: "2026-07-18T12:00:07.500+00:00",
  });
const body = publicRoundV2();
const payload = body.payload as Record<string, unknown>;
payload.segment = metaReflexSegmentMeta();
payload.segment_state = stateRaw;
const pr = readPublicRound(body);
const state = pr.segmentState!;
(window as any).__state = state;
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: "12px 16px", maxWidth: 720, margin: "0 auto", color: "#eee", background: "#10131a", minHeight: "100vh" }}>
    <metaReflexModule.Viewport publicRound={readPublicRound(publicRoundV2())} selection={null}
      permissions={NO_INTERACTIONS} onSelect={() => {}} segmentState={state}
      actions={{ submitChallenge: () => {}, busy: false, error: null } as any} skewMs={0} />
  </div>,
);
