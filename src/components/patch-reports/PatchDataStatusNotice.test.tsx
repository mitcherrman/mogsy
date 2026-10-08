import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatchDataStatusNotice } from "./PatchDataStatusNotice";
import type { PatchReconciliation } from "@/lib/patch-reports/api";
import { RECONCILIATION_26_19, REPORT_26_19_LINE_COUNT } from "@/lib/patch-reports/phsr1-sr-fixtures";

const reconciliation = (
  over: Partial<PatchReconciliation> = {},
): PatchReconciliation => ({
  status: "RECONCILED",
  meaning: "Every change Mogzy is capable of absorbing was applied to canonical data.",
  reconciliation_recorded: true,
  operation_id: "26.18#1",
  changes_by_terminal_state: {
    AUTO_APPLIED: 4,
    AUTO_APPLIED_REVIEW: 0,
    HELD_RUNTIME_WORK: 0,
    HELD_AUTHORITY: 0,
    FAILED: 0,
    NO_MOGZY_CONSUMER: 81,
  },
  gameplay_data_may_be_stale: false,
  ...over,
});

const notice = () => screen.getByTestId("patch-data-status");
const technical = () => screen.getByTestId("patch-data-status-technical") as HTMLDetailsElement;
/** Text a reader sees before opening Technical details. */
const firstLayer = () => {
  const clone = notice().cloneNode(true) as HTMLElement;
  clone.querySelector("[data-testid='patch-data-status-technical']")?.remove();
  return clone.textContent ?? "";
};

describe("PatchDataStatusNotice", () => {
  it("says no update is recorded when the backend sends nothing", () => {
    // An older backend, or a report from before the reconciliation lane. Absent
    // must never render as reassurance.
    render(<PatchDataStatusNotice />);
    expect(notice()).toHaveAttribute("data-status", "PUBLISHED_NOT_RECONCILED");
    expect(screen.getByText("No full Mogzy data update is recorded for this patch")).toBeInTheDocument();
    expect(firstLayer()).toMatch(/Riot's patch notes below are complete/);
    expect(firstLayer()).toMatch(/may still be from an earlier patch/);
    expect(screen.queryByTestId("patch-data-status-counts")).not.toBeInTheDocument();
  });

  it("reports a clean reconciliation", () => {
    render(<PatchDataStatusNotice reconciliation={reconciliation()} />);
    expect(notice()).toHaveAttribute("data-status", "RECONCILED");
    expect(screen.getByText("Mogzy's gameplay data is up to date with this patch")).toBeInTheDocument();
    expect(screen.getByTestId("patch-data-status-counts")).toHaveTextContent(
      "Of the 4 gameplay-number changes Mogzy's data update checked: 4 now up to date in Mogzy.",
    );
  });

  it("26.19: consumer headline and explanation lead; engineering terms stay out of the first layer", () => {
    render(<PatchDataStatusNotice reconciliation={RECONCILIATION_26_19} />);
    expect(notice()).toHaveAttribute("data-status", "RECONCILED_WITH_HELDS");
    expect(screen.getByText("Mogzy's gameplay data is partly updated for this patch")).toBeInTheDocument();
    expect(screen.getByTestId("patch-data-status-body")).toHaveTextContent(
      "Riot's patch notes below are complete. Mogzy has updated the changes it can safely apply to its own data; " +
        "some mechanics aren't modeled by Mogzy yet and some need a Mogzy review first, so Mogzy still uses the " +
        "previous values for those. This describes Mogzy's own data — it never changes or disputes Riot's notes.",
    );
    const text = firstLayer();
    expect(text).not.toMatch(/canonical|held —|cannot model|needs a decision|HELD_|AUTO_APPLIED|reconcil/i);
  });

  it("26.19: counts stay exact and use the update's own denominator", () => {
    render(<PatchDataStatusNotice reconciliation={RECONCILIATION_26_19} />);
    const counts = screen.getByTestId("patch-data-status-counts");
    expect(counts).toHaveTextContent(
      "Of the 42 gameplay-number changes Mogzy's data update checked: 11 now up to date in Mogzy · " +
        "24 not modeled by Mogzy yet · 7 need a Mogzy review.",
    );
    expect(counts).toHaveTextContent(
      "173 other notes — wording-only changes, bug fixes, announcements and mode-specific changes — had nothing for Mogzy to update.",
    );
    // No claim that every report line was in the update's denominator.
    expect(firstLayer()).not.toContain(String(REPORT_26_19_LINE_COUNT));
    expect(firstLayer()).not.toContain("215");
    expect(counts).toHaveTextContent("recorded when this report was built, before this update ran");
  });

  it("26.19: exact states, operation and backend wording live under Technical details", () => {
    render(<PatchDataStatusNotice reconciliation={RECONCILIATION_26_19} />);
    expect(technical().open).toBe(false);
    const t = within(technical());
    expect(t.getByText("Technical details")).toBeInTheDocument();
    expect(t.getByText("RECONCILED_WITH_HELDS")).toBeInTheDocument();
    expect(t.getByText("26.19#1")).toBeInTheDocument();
    expect(t.getByText(/Pipeline note: Every change Mogzy is capable of absorbing was applied/)).toBeInTheDocument();
    const states = t.getAllByTestId("patch-data-status-state");
    expect(states.map((li) => [li.getAttribute("data-state"), li.textContent])).toEqual([
      ["AUTO_APPLIED", "AUTO_APPLIED 11 — Up to date — Mogzy now has Riot's new value"],
      ["AUTO_APPLIED_REVIEW", "AUTO_APPLIED_REVIEW 0 — Up to date, with a note for a follow-up check"],
      ["HELD_RUNTIME_WORK", "HELD_RUNTIME_WORK 24 — Not modeled by Mogzy yet — Mogzy keeps the previous value"],
      ["HELD_AUTHORITY", "HELD_AUTHORITY 7 — Needs a Mogzy review before it can be applied"],
      ["FAILED", "FAILED 0 — Couldn't be processed"],
      ["NO_MOGZY_CONSUMER", "NO_MOGZY_CONSUMER 173 — Nothing for Mogzy to update"],
    ]);
    expect(t.getByText(/counts 215 items in its own units/)).toBeInTheDocument();
  });

  it("surfaces a failed reconciliation as failed", () => {
    // The V26.18 shape: the report published, the reconciliation did not finish.
    render(
      <PatchDataStatusNotice
        reconciliation={reconciliation({
          status: "RECONCILIATION_FAILED",
          meaning: "Reconciliation did not complete.",
          gameplay_data_may_be_stale: true,
          changes_by_terminal_state: {
            AUTO_APPLIED: 3,
            AUTO_APPLIED_REVIEW: 0,
            HELD_RUNTIME_WORK: 20,
            HELD_AUTHORITY: 3,
            FAILED: 1,
            NO_MOGZY_CONSUMER: 82,
          },
        })}
      />,
    );
    expect(notice()).toHaveAttribute("data-status", "RECONCILIATION_FAILED");
    expect(screen.getByText("Mogzy's gameplay data update didn't finish")).toBeInTheDocument();
    expect(screen.getByTestId("patch-data-status-counts")).toHaveTextContent(
      "Of the 27 gameplay-number changes Mogzy's data update checked: 3 now up to date in Mogzy · " +
        "20 not modeled by Mogzy yet · 3 need a Mogzy review · 1 couldn't be processed.",
    );
  });

  it("an unknown future status still leads with Riot and shows the raw status", () => {
    render(
      <PatchDataStatusNotice
        reconciliation={reconciliation({ status: "SOMETHING_NEW" as PatchReconciliation["status"] })}
      />,
    );
    expect(notice()).toHaveAttribute("data-status", "SOMETHING_NEW");
    expect(screen.getByText("Mogzy data status", { selector: "#patch-data-status-title" })).toBeInTheDocument();
    expect(within(technical()).getByText("SOMETHING_NEW")).toBeInTheDocument();
  });
});
