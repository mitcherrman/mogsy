import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatchDataStatusNotice } from "./PatchDataStatusNotice";
import type { PatchReconciliation } from "@/lib/patch-reports/api";

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

describe("PatchDataStatusNotice", () => {
  it("says gameplay data is not reconciled when the backend sends nothing", () => {
    // An older backend, or a report from before the reconciliation lane. Absent
    // must never render as reassurance.
    render(<PatchDataStatusNotice />);
    expect(screen.getByTestId("patch-data-status")).toHaveAttribute(
      "data-status",
      "PUBLISHED_NOT_RECONCILED",
    );
    expect(screen.getByText(/not reconciled/i)).toBeInTheDocument();
  });

  it("reports a clean reconciliation", () => {
    render(<PatchDataStatusNotice reconciliation={reconciliation()} />);
    expect(screen.getByTestId("patch-data-status")).toHaveAttribute(
      "data-status",
      "RECONCILED",
    );
    expect(screen.getByText(/4 changes applied/i)).toBeInTheDocument();
  });

  it("names the holds rather than only counting the applies", () => {
    render(
      <PatchDataStatusNotice
        reconciliation={reconciliation({
          status: "RECONCILED_WITH_HELDS",
          meaning:
            "Every change Mogzy is capable of absorbing was applied. Others are held.",
          gameplay_data_may_be_stale: true,
          changes_by_terminal_state: {
            AUTO_APPLIED: 4,
            AUTO_APPLIED_REVIEW: 1,
            HELD_RUNTIME_WORK: 20,
            HELD_AUTHORITY: 3,
            FAILED: 0,
            NO_MOGZY_CONSUMER: 81,
          },
        })}
      />,
    );
    expect(screen.getByText(/5 changes applied/i)).toBeInTheDocument();
    expect(
      screen.getByText(/20 held — Mogzy cannot model yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 held — needs a decision/i)).toBeInTheDocument();
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
    expect(screen.getByTestId("patch-data-status")).toHaveAttribute(
      "data-status",
      "RECONCILIATION_FAILED",
    );
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
  });
});
