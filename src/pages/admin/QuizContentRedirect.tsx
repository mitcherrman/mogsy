// ---------------------------------------------------------------------------
// Legacy-route compatibility for /admin/quiz-content.
//
// The workspace now has two tabs, Quiz Review and Diagnostics. Bookmarks to
// the retired Builder and Ranked Duel tabs land on Quiz Review rather than on
// a tab that no longer exists — Ranked questions are reviewable there through
// the source/family/type filters and the "All sources" view.
//
// The incoming query string (filters, packs, pagination, search, questionId, …)
// is carried forward; only `tab` is forced. Nothing is silently discarded.
// ---------------------------------------------------------------------------

import { Navigate, useSearchParams } from "react-router-dom";

const CANONICAL_PATH = "/admin/quiz-content";

export function QuizContentRedirect({
  tab = "review",
}: { tab?: "review" | "diagnostics" } = {}) {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set("tab", tab); // force the destination tab, keep everything else
  return <Navigate to={`${CANONICAL_PATH}?${next.toString()}`} replace />;
}

export default QuizContentRedirect;
