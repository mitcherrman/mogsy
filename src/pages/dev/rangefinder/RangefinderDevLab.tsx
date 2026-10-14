/**
 * INT1 — the DEVELOPMENT-ONLY host for `/dev/rangefinder`. It is the only
 * module that imports the frozen capture, and App.tsx registers it behind
 * `import.meta.env.DEV`, so a production build drops it and the fixture with it.
 */
import capture from "@/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json";
import type { RangeAuthorityCapture } from "@/lib/rangefinder/eligibility";
import RangefinderLab from "./RangefinderLab";

const CAPTURE = capture as unknown as RangeAuthorityCapture;

export default function RangefinderDevLab() {
  return <RangefinderLab capture={CAPTURE} />;
}
