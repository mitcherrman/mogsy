/**
 * ATL-CS-UX-001 — subject and ability iconography.
 *
 * Champion squares and ability icons come from the existing asset-store
 * helpers (`getChampionSquareIconUrl`, `getAbilityIconUrl`); item icons from
 * `itemIconUrl`. Every image has a monogram fallback so the layout holds
 * when the store is unreachable, and every icon carries a real accessible
 * name. Art identifies the subject; it never asserts a number.
 */
import { useState } from "react";
import { getAbilityIconUrl, getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";
import { itemIconUrl } from "@/components/pro-play/media/ItemIcon";
import { findSubject } from "@/lib/atlas-cross-section/fixtures";
import type { AbilitySlot, SubjectRef } from "@/lib/atlas-cross-section/types";

export type IconSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<IconSize, number> = { sm: 28, md: 40, lg: 56, xl: 84 };

function subjectIconUrl(ref: SubjectRef): string | null {
  return ref.kind === "champion" ? getChampionSquareIconUrl(ref.id) : itemIconUrl(Number.parseInt(ref.id, 10));
}

export function SubjectIcon({ subject, size = "md", decorative = false, className }: { subject: SubjectRef; size?: IconSize; decorative?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = subjectIconUrl(subject);
  const found = findSubject(subject);
  const name = found?.name ?? subject.id;
  const px = SIZE_PX[size];
  const hue = found?.hue ?? 200;
  const common = { className: `acs-icon acs-icon--${subject.kind} ${className ?? ""}`, style: { width: px, height: px, ["--acs-hue" as string]: hue } as React.CSSProperties };
  if (!url || failed) {
    return (
      <span {...common} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : name} aria-hidden={decorative || undefined} data-fallback="true">
        <span className="acs-icon__monogram" aria-hidden="true">
          {name.slice(0, 2)}
        </span>
      </span>
    );
  }
  return (
    <span {...common}>
      <img src={url} alt={decorative ? "" : name} width={px} height={px} loading="lazy" decoding="async" onError={() => setFailed(true)} draggable={false} />
    </span>
  );
}

export function AbilityIcon({ champion, slot, name, size = "md", active = false }: { champion: string; slot: AbilitySlot; name: string; size?: IconSize; active?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = getAbilityIconUrl(champion, slot);
  const px = SIZE_PX[size];
  return (
    <span className={`acs-icon acs-icon--ability acs-icon--slot-${slot.toLowerCase()}`} style={{ width: px, height: px }} data-active={active}>
      {!url || failed ? (
        <span className="acs-icon__monogram" aria-hidden="true">
          {slot}
        </span>
      ) : (
        <img src={url} alt={`${champion} ${slot}: ${name}`} width={px} height={px} loading="lazy" decoding="async" onError={() => setFailed(true)} draggable={false} />
      )}
      <span className="acs-icon__key" aria-hidden="true">
        {slot}
      </span>
    </span>
  );
}
