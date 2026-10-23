/**
 * Daily V2 lane D — the proposed Stat Drop host contract.
 *
 * Contract probe, fixture-level: no network, no backend, no stored state. It
 * proves that the proposed wire block maps onto the EXISTING `StatDrop`
 * primitive (rendered as-is, no fork), that a pre-reveal block carrying any
 * answer-bearing key is refused, and that the client grades nothing: the
 * server's outcome/points pass through untouched and never reach the
 * primitive.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatDrop } from "@/components/interaction-grammar/StatDrop";
import {
  readStatDropBlock, readStatDropReveal, readStatDropScale, STAT_DROP_REVEAL_ONLY_KEYS,
  StatDropHostParseError, toStatDropPublic, toStatDropReveal,
} from "./statDropHost";

/** A public block: the scale is a family-level public range, not the answer's neighbourhood. */
const block = () => ({
  prompt: "SYNTHETIC FIXTURE — what is the subject's metric?",
  metric_label: "Fixture metric",
  unit: "units",
  context: "Fixture context",
  scale: { min: 100, max: 700, step: 5, decimals: 0 },
  subject: { label: "Fixture Subject", media: { src: "/assets/fixture.png", alt: "" } },
});

const revealRow = (over: Record<string, unknown> = {}) => ({
  selected: 560,
  canonical_value: 525,
  canonical_display: "525",
  outcome: null,
  points: null,
  evidence: "Synthetic evidence line.",
  source: "synthetic fixture",
  ...over,
});

describe("Stat Drop host contract — public block", () => {
  it("maps field-for-field onto the existing primitive's StatDropPublic", () => {
    const pub = toStatDropPublic(readStatDropBlock(block()), (s) => `https://api.test${s}`);
    expect(pub).toEqual({
      prompt: "SYNTHETIC FIXTURE — what is the subject's metric?",
      metricLabel: "Fixture metric",
      unit: "units",
      context: "Fixture context",
      scale: { min: 100, max: 700, step: 5, decimals: 0 },
      subject: { label: "Fixture Subject", media: { src: "https://api.test/assets/fixture.png", alt: "" } },
    });
  });

  it("renders through the unmodified StatDrop primitive with no value in the DOM", () => {
    const pub = toStatDropPublic(readStatDropBlock(block()));
    const { container } = render(
      <StatDrop content={pub} phase="open" value={null} onChange={() => {}} onLock={() => {}} />);
    expect(screen.getByTestId("mig-stat-drop")).toHaveAttribute("data-phase", "open");
    expect(container.innerHTML).not.toContain("525");
    // Untouched estimate is mid-scale: (100 + 700) / 2.
    expect(screen.getByTestId("drop-estimate")).toHaveTextContent("400");
  });

  it.each([...STAT_DROP_REVEAL_ONLY_KEYS])("refuses a pre-reveal block carrying `%s`, at any depth", (key) => {
    expect(() => readStatDropBlock({ ...block(), [key]: 525 })).toThrow(StatDropHostParseError);
    expect(() => readStatDropBlock({ ...block(), subject: { ...block().subject, [key]: 1 } }))
      .toThrow(StatDropHostParseError);
  });

  it.each([
    [{ min: 700, max: 100, step: 5, decimals: 0 }, /min must be below max/],
    [{ min: 0, max: 10, step: 0, decimals: 0 }, /step must be positive/],
    [{ min: 0, max: 10, step: 3, decimals: 0 }, /does not divide/],
    [{ min: 0, max: 100000, step: 1, decimals: 0 }, /positions/],
    [{ min: 0, max: 10, step: 1, decimals: 1.5 }, /decimals/],
    [{ min: 0, max: Infinity, step: 1, decimals: 0 }, /finite/],
  ])("refuses a malformed scale %j", (scale, msg) => {
    expect(() => readStatDropScale(scale)).toThrow(msg);
  });

  it("accepts a fractional scale without float dust", () => {
    expect(readStatDropScale({ min: 0.5, max: 2.5, step: 0.1, decimals: 1 }))
      .toEqual({ min: 0.5, max: 2.5, step: 0.1, decimals: 1 });
  });
});

describe("Stat Drop host contract — reveal (server-graded, client relays)", () => {
  it("relays the server's outcome and points verbatim and computes none", () => {
    const r = readStatDropReveal(revealRow({ outcome: "srv_band_label", points: 7 }));
    expect(r.outcome).toBe("srv_band_label");
    expect(r.points).toBe(7);
  });

  it("an ungraded reveal stays ungraded: null outcome and points are NOT filled in", () => {
    const r = readStatDropReveal(revealRow());
    expect(r.outcome).toBeNull();
    expect(r.points).toBeNull();
  });

  it("hands the primitive only the value and evidence, never a grade", () => {
    const reveal = toStatDropReveal(readStatDropReveal(revealRow({ outcome: "x", points: 3 })));
    expect(reveal).toEqual({
      canonicalValue: 525, canonicalDisplay: "525",
      evidence: "Synthetic evidence line.", source: "synthetic fixture",
    });
    expect(Object.keys(reveal)).not.toContain("outcome");
    expect(Object.keys(reveal)).not.toContain("points");
  });

  it("renders the revealed value through the unmodified primitive", () => {
    const pub = toStatDropPublic(readStatDropBlock(block()));
    const reveal = toStatDropReveal(readStatDropReveal(revealRow()));
    render(<StatDrop content={pub} phase="revealed" value={560} onChange={() => {}}
      onLock={() => {}} reveal={reveal} />);
    expect(screen.getByTestId("drop-true-value")).toHaveTextContent("525");
    expect(screen.getByTestId("drop-outcome")).toHaveAttribute("data-outcome", "over");
  });

  it("refuses a reveal without the canonical value", () => {
    expect(() => readStatDropReveal({ ...revealRow(), canonical_value: undefined }))
      .toThrow(StatDropHostParseError);
  });
});
