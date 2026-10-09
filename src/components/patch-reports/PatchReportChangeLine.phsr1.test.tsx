import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import { MOGZY_STATUS_LABEL } from "@/lib/patch-reports/mogzy-status";
import {
  SR_ANIVIA_26_10,
  SR_APHELIOS,
  SR_AURORA,
  SR_DRAVEN,
  SR_ELISE,
  SR_VI,
} from "@/lib/patch-reports/phsr1-sr-fixtures";
import { buildReportEntityNode } from "@/lib/patch-reports/report-structure";
import { PatchReportEntityCard } from "./PatchReportEntityCard";

/**
 * PHSR1 against real 26.19 / 26.10 Summoner's Rift payloads: consumer labels,
 * evidence hierarchy and redundancy, with Riot's lines untouched.
 */

const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const renderCard = (card: PatchReportCard) => {
  const frozen = deepFreeze(structuredClone(card));
  render(<PatchReportEntityCard entity={buildReportEntityNode(frozen)} />);
  return frozen;
};

const lines = () => screen.getAllByTestId("patch-report-change");
const lineFor = (property: string) => lines().find((li) => within(li).queryByText(property))!;
const headerMark = () => document.querySelector("header [data-testid='patch-report-status-mark']")!;
const ENGINEERING = /Mismatch|Not represented|Needs interpretation|Unresolved|canonical|Mogzy currently|Compared against/;

/** What a reader sees on a line without opening anything. */
const visibleText = (el: HTMLElement) => {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("details").forEach((d) => {
    Array.from(d.children).forEach((child) => {
      if (child.tagName !== "SUMMARY") child.remove();
    });
  });
  return clone.textContent ?? "";
};

describe("PHSR1 — Draven 26.19 Base AD", () => {
  it("shows Riot's 62 → 64 as the patch, and Mogzy's 62 only as a build-time data note", () => {
    renderCard(SR_DRAVEN);
    const line = lineFor("Attack Damage");
    expect(within(line).getByTestId("patch-report-values")).toHaveTextContent("From 62→ to 64");
    expect(visibleText(line)).not.toMatch(ENGINEERING);

    const evidence = within(line).getByTestId("patch-report-evidence") as HTMLDetailsElement;
    expect(within(evidence).getByText(MOGZY_STATUS_LABEL.mismatch)).toBeInTheDocument();
    expect(evidence.open).toBe(false);

    const explanation = within(evidence).getByTestId("patch-report-evidence-explanation");
    expect(explanation).toHaveTextContent(
      "When this report was built, Mogzy's data still had 62 here, not Riot's new value, so it was flagged for a Mogzy data update.",
    );
    expect(explanation).toHaveTextContent("This is about Mogzy's own data, not Riot's patch note.");
    expect(explanation).toHaveTextContent("Mogzy Impact works from Riot's published numbers.");
    expect(explanation.textContent).not.toMatch(/currently|pending|disput/i);
    expect(within(evidence).getByTestId("patch-report-evidence-value")).toHaveTextContent(
      "Mogzy's value when this report was built: 62",
    );
  });
});

describe("PHSR1 — Aurora 26.19", () => {
  it("E Base Damage: the formula is technical evidence, not a sentence", () => {
    renderCard(SR_AURORA);
    const line = lineFor("Base Damage");
    expect(within(line).getByTestId("patch-report-values")).toHaveTextContent(
      "From 70 / 110 / 150 / 190 / 230→ to 80 / 120 / 160 / 200 / 240",
    );
    const evidence = within(line).getByTestId("patch-report-evidence");
    expect(within(evidence).getByTestId("patch-report-evidence-explanation")).toHaveTextContent(
      "Mogzy calculates this from a formula",
    );
    expect(within(evidence).queryByTestId("patch-report-evidence-value")).not.toBeInTheDocument();

    const technical = within(evidence).getByTestId("patch-report-evidence-technical") as HTMLDetailsElement;
    expect(technical.open).toBe(false);
    expect(within(technical).getByText("ability_damage_formula")).toBeInTheDocument();
    expect(within(technical).getByText("(30 + 40 * P_E + 0,7 * AP) * MOD_Magic")).toBeInTheDocument();
    expect(within(technical).getByText("Mogzy formula at build")).toBeInTheDocument();
    expect(within(technical).getByText("mismatch")).toBeInTheDocument();
  });

  it("R Rift Duration differs from the flagged header, so it keeps its own status", () => {
    renderCard(SR_AURORA);
    expect(headerMark()).toHaveTextContent(MOGZY_STATUS_LABEL.mismatch);
    const evidence = within(lineFor("Rift Duration")).getByTestId("patch-report-evidence");
    expect(within(evidence).getByText(MOGZY_STATUS_LABEL.not_represented)).toBeInTheDocument();
  });
});

describe("PHSR1 — Aphelios 26.19 five-line card", () => {
  it("states 'Not modeled by Mogzy' once in the header instead of after every line", () => {
    renderCard(SR_APHELIOS);
    expect(lines()).toHaveLength(5);
    expect(headerMark()).toHaveTextContent("Mogzy data status: Not modeled by Mogzy");
    expect(screen.queryAllByTestId("patch-report-evidence")).toHaveLength(0);
    expect(screen.getAllByText(MOGZY_STATUS_LABEL.not_represented)).toHaveLength(1);
    // Every Riot line is still there.
    expect(screen.getAllByTestId("patch-report-values")).toHaveLength(5);
    expect(lineFor("Duskwave Cooldown")).toHaveTextContent("8 / 7.25 / 6.5 / 5.75 / 5 seconds");
  });
});

describe("PHSR1 — Elise 26.19 Passive / W", () => {
  it("both untracked lines defer to the header", () => {
    renderCard(SR_ELISE);
    expect(headerMark()).toHaveTextContent(MOGZY_STATUS_LABEL.not_represented);
    expect(screen.queryAllByTestId("patch-report-evidence")).toHaveLength(0);
    expect(lineFor("Passive Magic Damage On-Hit")).toHaveTextContent("12 / 22 / 32 / 42");
    expect(lineFor("Bonus Attack Speed")).toHaveTextContent("70 / 85 / 100 / 115 / 130%");
  });
});

describe("PHSR1 — Vi 26.19 Base Stats + Passive", () => {
  it("keeps both lines' evidence, each with its own label and tracked value", () => {
    renderCard(SR_VI);
    expect(headerMark()).toHaveTextContent(MOGZY_STATUS_LABEL.mismatch);

    const base = within(lineFor("Attack Damage")).getByTestId("patch-report-evidence");
    expect(within(base).getByText(MOGZY_STATUS_LABEL.needs_interpretation)).toBeInTheDocument();
    expect(within(base).getByTestId("patch-report-evidence-value")).toHaveTextContent(
      "Mogzy's value when this report was built: 63",
    );
    expect(within(base).getByText("base_ad")).toBeInTheDocument();

    const passive = within(lineFor("Shield")).getByTestId("patch-report-evidence");
    expect(within(passive).getByText(MOGZY_STATUS_LABEL.mismatch)).toBeInTheDocument();
    expect(within(passive).getByText("0,12 * HP * MOD_Shield")).toBeInTheDocument();
  });
});

describe("PHSR1 — fully current example (Anivia 26.10)", () => {
  it("reads as current, with no disclaimer, and keeps its tracked values", () => {
    renderCard(SR_ANIVIA_26_10);
    expect(headerMark()).toHaveTextContent(MOGZY_STATUS_LABEL.applied);
    const evidence = screen.getAllByTestId("patch-report-evidence");
    expect(evidence).toHaveLength(2);
    expect(within(evidence[0]).getByTestId("patch-report-evidence-explanation")).toHaveTextContent(
      /^Mogzy has updated its data to Riot's new value\.$/,
    );
    expect(within(evidence[0]).getByTestId("patch-report-evidence-value")).toHaveTextContent("19");
    expect(within(evidence[0]).getByText("applied (proposal #494)")).toBeInTheDocument();
  });
});

describe("PHSR1 — evidence hierarchy and source truth", () => {
  it("opening the status reveals the explanation first and keeps raw evidence one level down", () => {
    renderCard(SR_DRAVEN);
    const evidence = screen.getByTestId("patch-report-evidence") as HTMLDetailsElement;
    expect(evidence.open).toBe(false);
    const explanation = within(evidence).getByTestId("patch-report-evidence-explanation");
    const technical = within(evidence).getByTestId("patch-report-evidence-technical");
    expect(explanation.compareDocumentPosition(technical) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(technical).getByText("Status code")).toBeInTheDocument();
    expect(within(technical).getByText("Mogzy property")).toBeInTheDocument();
    expect(within(technical).getByText("Mogzy value at build")).toBeInTheDocument();
  });

  it("renders every real SR card without mutating it, and with each Riot value intact", () => {
    for (const card of [SR_DRAVEN, SR_AURORA, SR_APHELIOS, SR_ELISE, SR_VI, SR_ANIVIA_26_10]) {
      const before = JSON.stringify(card);
      const { unmount } = render(
        <PatchReportEntityCard entity={buildReportEntityNode(deepFreeze(structuredClone(card)))} />,
      );
      const values = screen.getAllByTestId("patch-report-values");
      expect(values).toHaveLength(card.changes.length);
      card.changes.forEach((change, i) => {
        expect(values[i]).toHaveTextContent(change.after_raw!);
        expect(values[i]).toHaveTextContent(change.before_raw!);
      });
      // The data-attributes keep the untouched backend enum.
      screen.getAllByTestId("patch-report-status-mark").forEach((mark) => {
        expect(["matches", "applied", "pending", "mismatch", "unresolved", "needs_interpretation", "not_represented"])
          .toContain(mark.getAttribute("data-mogzy-status"));
      });
      unmount();
      expect(JSON.stringify(card)).toBe(before);
    }
  });
});
