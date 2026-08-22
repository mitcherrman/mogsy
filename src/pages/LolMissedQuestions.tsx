/**
 * `/lol/missed-questions` — the standalone Missed Question Bank page.
 *
 * MALT Phase A: the bank itself now lives in `MissedQuestionsReview` and its
 * loader in `useMissedQuestions`, both of which the Leaguecraft workspace's
 * Review pane at `/quiz#review` mounts too. Entitlement, pagination and every
 * failure state are decided in one place, so the lobby and this page cannot
 * tell a player different things about what their account can see.
 *
 * The route stays live and is NOT redirected — it is a direct-entry
 * destination, and its retirement, if it happens at all, is a later phase.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, BookX } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import MissedQuestionsReview from "@/components/quiz/workspace/MissedQuestionsReview";

export default function LolMissedQuestions() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* Per-user page: empty for crawlers/guests, so keep it out of the index. */}
      <SEOHead
        title="Missed Question Bank — Mogzy LoL"
        description="Review every League of Legends quiz question you missed and practice your weak spots."
        noindex
      />

      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to quiz history">
          <Link to="/lol/history"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <BookX className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Missed Question Bank</h1>
      </div>

      <MissedQuestionsReview />
    </div>
  );
}
