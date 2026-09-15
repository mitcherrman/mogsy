/**
 * RL2 — the three champions this account answers best, for the selected role.
 *
 * Sits to the RIGHT of the PLAY seal and re-reads on every role change, so it
 * is always the role about to be queued.
 *
 * "FOR THIS ROLE" IS AN ELIGIBILITY RESTRICTION, NOT AN ATTEMPT TAG
 * ─────────────────────────────────────────────────────────────────
 * Nothing here claims the player answered these questions WHILE playing the
 * role. The intended derivation is: rank the account's champion knowledge by
 * correct answers, then restrict that ranking to the champions the canonical
 * role authority says belong to this role. Attempts are never tagged with a
 * role and this component never implies they are.
 *
 * PRODUCTION RENDERS ABSENT, ON PURPOSE
 * ─────────────────────────────────────
 * `productionChampionKnowledge` returns `{ state: "absent" }` because neither
 * authority the derivation needs is reachable from the client — see
 * `@/lib/quiz/championKnowledge`. The absent branch below draws the three
 * empty medallions at their real size, so the composition around PLAY is the
 * composition that ships, and says nothing about the player. It is NOT the
 * same as `ready` with no entries, which is a real "no champion knowledge yet".
 */
import { LEAGUECRAFT_INK as INK } from "@/components/quiz/leaguecraft-ink";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import type { RankedRole } from "@/lib/ranked-public/roles";
import {
  CHAMPION_KNOWLEDGE_TOP_N,
  championIconPath,
  topChampions,
  type ChampionKnowledgeResult,
} from "@/lib/quiz/championKnowledge";

const SLOTS = Array.from({ length: CHAMPION_KNOWLEDGE_TOP_N }, (_, i) => i);

export default function RoleChampionKnowledge({
  role,
  result,
  className = "",
}: {
  role: RankedRole;
  result: ChampionKnowledgeResult;
  className?: string;
}) {
  const entries = result.state === "ready" ? topChampions(result.entries) : [];
  const state = result.state === "absent" ? "absent" : entries.length ? "ready" : "empty";

  return (
    <div
      className={`min-w-0 ${className}`}
      data-testid="role-champion-knowledge"
      data-role={role}
      data-state={state}
    >
      <div
        className="truncate text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: INK.brass }}
      >
        {RANKED_ROLE_LABELS[role]} best
      </div>

      {/* STACKED, not a row of three.

          The centre sheet's writing area is 295px and the wax seal takes 144
          of it, so each flank gets about 68px — three 36px medallions side by
          side measured 120 and ran 52px off the parchment. Stacking them fits
          the flank at every width instead of only at the widest, and it keeps
          the champion NAME beside each portrait, which the row could not:
          identity is never carried by an image alone. */}
      <ul className="mt-1 space-y-[3px]">
        {SLOTS.map((i) => {
          const entry = entries[i];
          return (
            <li key={i} className="flex items-center gap-1 lg:justify-start">
              <span
                className="relative block h-[22px] w-[22px] shrink-0 overflow-hidden rounded-full"
                style={{
                  border: `1px solid ${INK.rule}`,
                  background: INK.inset,
                  boxShadow: INK.press,
                }}
                data-testid={entry ? "champion-knowledge-icon" : "champion-knowledge-slot"}
                data-champion={entry?.champion}
              >
                {entry ? (
                  <img
                    src={resolveQuizAssetUrl(championIconPath(entry.champion))}
                    /* The champion's NAME is printed beside the portrait, so
                       the image itself carries no identity. */
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    width={22}
                    height={22}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </span>
              {entry ? (
                <span
                  className="min-w-0 flex-1 truncate text-[10px] font-semibold leading-tight"
                  style={{ color: INK.body }}
                  title={entry.champion}
                >
                  {entry.champion}
                </span>
              ) : (
                /* The empty slot still reserves the label's width, so the
                   flank does not change size when the data arrives. */
                <span className="min-w-0 flex-1" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>

      {/* One line, and only when there is nothing to show. It states the
          CONDITION, which is not flavour: an empty row of medallions with no
          line under it reads as a failure to load. */}
      {state !== "ready" ? (
        <div
          className="mt-0.5 text-[10px] leading-tight"
          style={{ color: INK.faint }}
          data-testid="role-champion-knowledge-note"
        >
          {state === "absent" ? "Not tracked yet" : "No answers yet"}
        </div>
      ) : null}
    </div>
  );
}
