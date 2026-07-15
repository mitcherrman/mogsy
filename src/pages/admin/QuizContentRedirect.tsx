// ---------------------------------------------------------------------------
// Legacy-route compatibility: /admin/quiz-builder and /admin/quiz-review
// delegate into the unified workspace (/admin/quiz-content) on the matching
// tab. This component preserves the incoming query string (filters, selected
// ids, packs, pagination, search, questionId, …) so existing deep links keep
// working — it only FORCES the `tab` and otherwise carries every param
// forward. Nothing is silently discarded.
// ---------------------------------------------------------------------------

import { Navigate, useSearchParams } from "react-router-dom";

const CANONICAL_PATH = "/admin/quiz-content";

export function QuizContentRedirect({ tab }: { tab: "builder" | "review" | "ranked-duel" }) {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set("tab", tab); // force the destination tab, keep everything else
  return <Navigate to={`${CANONICAL_PATH}?${next.toString()}`} replace />;
}

export default QuizContentRedirect;
