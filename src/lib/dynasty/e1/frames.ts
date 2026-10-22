/**
 * Decoder for `mogzy.dynasty.ux3.frame_delta.v1`, the lossless codec the UX-3
 * capture script uses to store consecutive E1 snapshots compactly. It carries
 * no game logic: frame 0 is whole; each later frame lists only the top-level
 * keys that changed, and a list that only grew is `{"$append": [...]}`. The
 * capture script asserts decode(encode(frames)) == frames before writing.
 */
import type { E1Snapshot } from "./contracts";

export const FRAME_CODEC = "mogzy.dynasty.ux3.frame_delta.v1" as const;

type Encoded = Record<string, unknown>;

export function decodeFrames(encoded: Encoded[], base?: E1Snapshot): E1Snapshot[] {
  const out: E1Snapshot[] = [];
  let prev = base as unknown as Record<string, unknown> | undefined;
  for (const e of encoded) {
    let cur: Record<string, unknown>;
    if (!("$delta" in e)) cur = e;
    else {
      if (!prev) throw new Error("frame codec: a delta frame needs a base frame");
      cur = { ...prev };
      for (const [k, v] of Object.entries(e.$delta as Encoded)) {
        if (v && typeof v === "object" && !Array.isArray(v) && (v as Encoded).$del === true) delete cur[k];
        else if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && "$append" in (v as Encoded)) {
          cur[k] = [...(prev[k] as unknown[]), ...((v as Encoded).$append as unknown[])];
        } else cur[k] = v;
      }
    }
    out.push(cur as unknown as E1Snapshot);
    prev = cur;
  }
  return out;
}
