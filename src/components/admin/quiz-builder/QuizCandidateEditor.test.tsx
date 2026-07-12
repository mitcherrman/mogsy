import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuizCandidateEditor } from "./QuizCandidateEditor";
import { EMPTY_PRO_SOURCE, type EditableQuestion, type EditableProSource } from "@/lib/quiz-builder/logic";

const BASE: EditableQuestion = {
  question_text: "Q?",
  choices: ["Ahri", "Zed", "Lux", "Jinx"],
  correctAnswer: "Ahri",
  explanation: "because",
  difficulty: 2,
  proSource: { ...EMPTY_PRO_SOURCE },
};

/** Stateful host so the controlled editor's onChange actually updates. */
function Harness({ initial }: { initial?: Partial<EditableProSource> }) {
  const [value, setValue] = useState<EditableQuestion>({
    ...BASE,
    proSource: initial ? { ...EMPTY_PRO_SOURCE, ...initial } : { ...EMPTY_PRO_SOURCE },
  });
  return <QuizCandidateEditor value={value} onChange={setValue} idPrefix="t" />;
}

describe("QuizCandidateEditor — Pro Data source", () => {
  it("hides the source fields until enabled", () => {
    render(<Harness />);
    expect(screen.getByText("Pro Data source")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Champion slug/i)).toBeNull();
  });

  it("reveals fields when the toggle is switched on", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: /attach a pro data source/i }));
    expect(screen.getByLabelText(/Champion slug/i)).toBeInTheDocument();
  });

  it("shows a destination preview for a valid slug (hydrated enabled)", () => {
    render(<Harness initial={{ enabled: true, championSlug: "akali", year: "2011", scope: "major", section: "yearly-stats" }} />);
    const preview = screen.getByRole("link", { name: /lol\/docs\/pro\/champions\/akali/i });
    expect(preview).toHaveAttribute("href", "/lol/docs/pro/champions/akali?year=2011&scope=major#yearly-stats");
    expect(preview).toHaveAttribute("target", "_blank");
    expect(preview).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows an error and no preview for an invalid slug", () => {
    render(<Harness initial={{ enabled: true, championSlug: "not a slug!" }} />);
    expect(screen.queryByRole("link", { name: /lol\/docs\/pro/i })).toBeNull();
    // The invalid source error surfaces (inline + the question validation summary).
    expect(screen.getAllByText(/not a valid slug/i).length).toBeGreaterThan(0);
  });

  it("champion-only produces a bare champion preview", () => {
    render(<Harness initial={{ enabled: true, championSlug: "akali" }} />);
    expect(screen.getByRole("link", { name: /champions\/akali/i })).toHaveAttribute(
      "href",
      "/lol/docs/pro/champions/akali",
    );
  });
});
