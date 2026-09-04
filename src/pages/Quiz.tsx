import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, ArrowLeft, ArrowRight, RotateCcw, AlertTriangle, HelpCircle, Stethoscope, Flag, Sparkles, Package, Swords, Timer, Wand2, GitBranch, Layers, BookOpen, Trophy, AlertCircle, Flame, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { quizApi, type QuizSet, type QuizQuestion, type QuizAnswerResult, type QuizProgress, type QuizCategoryStat, type QuizAchievement, type QuizHistoryResponse, resolveQuizAssetUrl } from "@/lib/quiz/api";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import { ensureBackendAuthToken } from "@/lib/backend-auth";
import LeaguecraftTutorialLink from "@/components/quiz/LeaguecraftTutorialLink";
import {
  META_REFLEX_NAME,
  META_REFLEX_ROUTE,
  META_REFLEX_TAGLINE,
} from "@/lib/league-swipe/branding";
import QuizKnowledgeCard from "@/components/quiz/QuizKnowledgeCard";
import QuizAchievementsCard from "@/components/quiz/QuizAchievementsCard";
// Daily Score Attack hub entry: shown instead of the legacy Daily card only
// when the backend reports the new mode enabled (server feature flag).
import QuizScoreAttackCard from "@/components/quiz/QuizScoreAttackCard";
import { fetchToday as fetchScoreAttackToday } from "@/pages/dev/daily-score-attack/dailyScoreAttackClient";
import type { DsaToday } from "@/pages/dev/daily-score-attack/dailyScoreAttackTypes";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import { QUIZ_CATEGORY_ICONS } from "@/components/quiz/QuizCategoryStrip";
import {
  loadPracticeCategoryQuestions,
  PRACTICE_SESSION_SIZE,
} from "@/lib/quiz/practiceCategories";
import { useRankedRole } from "@/pages/quiz-ranked/useRankedRole";
import { isRankedRole, type RankedRole } from "@/lib/ranked-public/roles";
import { authHref } from "@/lib/auth/auth-destination";
import { usePlaySfx } from "@/lib/audio/usePlaySfx";
import { useRankedProgression } from "@/pages/quiz-ranked/useRankedProgression";
import { playModeVisibility } from "@/lib/quiz/playModes";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useRankedMatchHistory } from "@/pages/quiz-ranked/useRankedMatchHistory";
import { useProfileIdentity } from "@/hooks/useProfileIdentity";
import AdSlot from "@/components/ads/AdSlot";
import {
  getRankedState,
  recordRecentXpGain,
  getRecentXpGain,
  type RankedState,
} from "@/lib/quiz/featured-mock";
import { useAuth } from "@/hooks/useAuth";
import { useDailyChallengeStatus } from "@/lib/daily-challenge/useDailyChallengeStatus";
import { supabase } from "@/integrations/supabase/client";
import {
  incrementAnonymousActions,
  getAnonymousActionCount,
  hasVisitedHub,
  hasSoftNudgeBeenSeen,
  markSoftNudgeSeen,
} from "@/lib/quiz/onboarding-gate";
import type { QuizOnboardingConfig } from "@/pages/QuizAdmin";
import QuizSignUpGate from "@/components/quiz/QuizSignUpGate";
import QuizSignUpNudge from "@/components/quiz/QuizSignUpNudge";

type QuizPhase = "sets" | "loading-questions" | "active" | "result" | "error";

/**
 * Leaguecraft hub module visibility.
 *
 * The hub is Ranked-first: everything on the main page has to serve the
 * play → review → practice → play loop. The modules below still exist in
 * full — their routes, components, data loaders and handlers are untouched.
 * Most also have another host today (Time Trial at /quiz/daily, Stat Check
 * at /quiz/stat-check, Achievements on /profile and /quiz/diagnostics); the
 * Knowledge Breakdown card has no other host, so its flag is its only route
 * back. They are only withheld from THIS page's presentation, and flipping
 * a flag to `true` restores the original module in place.
 *
 * This is a navigation/visibility decision, never a deletion.
 */
type HubModuleFlags = {
  /** Daily Score Attack ("Time Trial") card — lives at /quiz/daily. */
  timeTrial: boolean;
  /** Standalone Stat Check entry — lives at /quiz/stat-check. */
  statCheck: boolean;
  /** Standalone Meta Reflex entry — lives at its own public /league-swipe URL. */
  metaReflex: boolean;
  /** Full per-category mastery breakdown. The hub is its only host, so this
   *  flag is the only way back to it. */
  knowledgeBreakdown: boolean;
  /** Achievements grid — also rendered on /profile and /quiz/diagnostics. */
  achievements: boolean;
  /** Pre-redesign five-card practice grid, replaced by the compact tiles. */
  legacyPracticeGrid: boolean;
  /** Mastery Journey link (kept: it is one quiet line, and this page holds
   *  the ONLY entrance to /quiz/mastery in the product). */
  masteryJourney: boolean;
  /**
   * "Practice for Ranked" panel in the lobby's lower half.
   *
   * WITHHELD, not retired. The full-width category rail directly above it is
   * becoming Leaguecraft's practice selector, and until it opens the two were
   * stacked navigations to the same six subjects. The panel, its sets, their
   * real question counts and its start action are all intact behind this flag
   * inside `LeaguecraftHub`; every practice ROUTE and question set is
   * untouched.
   */
  practicePanel: boolean;
};

const HUB_MODULES: HubModuleFlags = {
  timeTrial: false,
  statCheck: false,
  metaReflex: false,
  knowledgeBreakdown: false,
  achievements: false,
  legacyPracticeGrid: false,
  masteryJourney: true,
  practicePanel: false,
};

/**
 * Whether this build offers the /quiz/diagnostics link in Leaguecraft chrome.
 *
 * `/quiz/diagnostics` is developer tooling: the ads policy classifies it a
 * `developer_route` and the admin registry lists it as an Internal route under
 * Leaguecraft › Diagnostics, which is how an operator finds it. It was still
 * being advertised to every desktop visitor from the Leaguecraft header, which
 * is the one place it does not belong.
 *
 * The ROUTE, its gate and its admin-directory entry are all untouched — this
 * only decides whether ordinary page chrome points at it. `import.meta.env.DEV`
 * is statically `false` in any production `vite build`, so the link and its
 * icon are dead-code eliminated there rather than merely hidden.
 */
const LOBBY_SHOWS_DIAGNOSTICS = import.meta.env.DEV === true;

/**
 * Mogzy Academy classroom backdrop for the whole /quiz surface. The art is
 * warm and bright with a naturally quieter centre, so the overlays only add
 * a soft central veil for UI legibility plus top/bottom falloff behind the
 * fixed navbar and the footer — never enough to flatten the classroom back
 * into the old dark page.
 */
const LEAGUECRAFT_BG_URL = "/images/lol-hub/leaguecraft-classroom-bg.png";
const LEAGUECRAFT_BG_VEIL =
  "radial-gradient(60% 52% at 50% 44%, rgba(5,11,24,0.66) 0%, rgba(5,11,24,0.38) 58%, rgba(5,11,24,0.04) 100%)," +
  "linear-gradient(180deg, rgba(4,9,20,0.58) 0%, rgba(4,9,20,0.08) 18%, rgba(4,9,20,0.12) 68%, rgba(4,9,20,0.66) 100%)";

// Choice types + answer grid extracted to QuizAnswerOptions for reuse by the
// screenshot render harness (/dev/quiz-render). Behavior unchanged.
import QuizAnswerOptions, {
  choicesHaveImages as computeChoicesHaveImages,
} from "@/components/quiz/QuizAnswerOptions";
import QuizAnswerFeedback from "@/components/quiz/QuizAnswerFeedback";

/**
 * Per-category badge styling. The lookup normalizes the backend category string
 * (snake_case or Title Case) so newly-added categories like "Item Exact Stats",
 * "Item Components", "Item Builds Into", "Item Build Paths",
 * "Champion Ability Cooldowns", and "Summoner Spell Cooldowns" all get
 * distinct, themed badges in the active question header.
 */
type CategoryStyle = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
};

const CATEGORY_STYLE_MAP: Record<string, CategoryStyle> = {
  item_exact_stats: {
    label: "Item Exact Stats",
    icon: Package,
    className: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  },
  item_components: {
    label: "Item Components",
    icon: Layers,
    className: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  },
  item_builds_into: {
    label: "Item Builds Into",
    icon: GitBranch,
    className: "border-yellow-400/40 bg-yellow-400/10 text-yellow-200",
  },
  item_build_paths: {
    label: "Item Build Paths",
    icon: GitBranch,
    className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
  },
  champion_ability_cooldowns: {
    label: "Champion Cooldowns",
    icon: Timer,
    className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  },
  summoner_spell_cooldowns: {
    label: "Summoner Cooldowns",
    icon: Timer,
    className: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  },
  champion_abilities: {
    label: "Champion Abilities",
    icon: Wand2,
    className: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  },
  summoner_spells: {
    label: "Summoner Spells",
    icon: Swords,
    className: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  },
};

function normalizeCategoryKey(category: string | undefined | null): string {
  return (category || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getCategoryStyle(category: string | undefined | null): CategoryStyle {
  const key = normalizeCategoryKey(category);
  if (CATEGORY_STYLE_MAP[key]) return CATEGORY_STYLE_MAP[key];
  // Fallback partial matches for unknown but related categories.
  if (key.includes("cooldown")) {
    return {
      label: category || "Cooldowns",
      icon: Timer,
      className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
    };
  }
  if (key.includes("item")) {
    return {
      label: category || "Items",
      icon: Package,
      className: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    };
  }
  if (key.includes("rune")) {
    return {
      label: category || "Runes",
      icon: BookOpen,
      className: "border-purple-400/40 bg-purple-400/10 text-purple-200",
    };
  }
  if (key.includes("summoner") || key.includes("spell")) {
    return {
      label: category || "Summoner Spells",
      icon: Swords,
      className: "border-sky-400/40 bg-sky-400/10 text-sky-200",
    };
  }
  if (key.includes("ability") || key.includes("champion")) {
    return {
      label: category || "Champions",
      icon: Wand2,
      className: "border-violet-400/40 bg-violet-400/10 text-violet-200",
    };
  }
  return {
    label: category || "General",
    icon: BrainCircuit,
    className: "border-border bg-background/40 text-foreground/80",
  };
}

/** Local per-session record so we can render a category breakdown + review list. */
type SessionAnswer = {
  question: QuizQuestion;
  selected: string;
  isCorrect: boolean;
  correctAnswer: string;
  explanation?: string;
};

/**
 * The lobby's ONE role-write notice.
 *
 * Named and shared so every refusal of a role change lands on the same toast
 * rather than minting another one. Scoped to this write only — it must never
 * be reused for an unrelated error, which would let one message overwrite
 * another the reader has not read yet.
 */
const RANKED_ROLE_TOAST_ID = "ranked-role-write";
/**
 * The signup gate's one notice. A stable id so a burst of Ranked presses
 * UPDATES the standing notice instead of stacking copies of it — the same
 * technique, and the same reason, as `RANKED_ROLE_TOAST_ID`.
 */
const RANKED_ACCOUNT_TOAST_ID = "ranked-account-required";

/**
 * How the Leaguecraft lobby is asked to restore itself after an auth trip.
 *
 * These are read from the URL rather than from `location.state` because state
 * does NOT survive the round trip: signing up leaves the SPA entirely (and an
 * emailed confirmation link re-enters it in a fresh document), so anything the
 * lobby wants back has to be in the path. That is exactly what `authHref` is
 * built for — its own doc says to pass `pathname + search` when the destination
 * is parameterised — so this adds no second auth-return system, only a
 * parameterised destination for the existing one.
 */
const PLAY_RETURN_PARAM = "play";
const ROLE_RETURN_PARAM = "role";

export default function Quiz() {
  const { user } = useAuth();
  // R1: the player's League role, shown beside — never merged into —
  // competitive rank on the Ranked hero. Best-effort and self-silencing: a
  // guest, an older backend, or an account that has never chosen all report
  // `role: null`, and the hero renders exactly as it did before.
  const rankedRole = useRankedRole();
  // RE1: the hub's competitive identity. Unavailable (older backend, guest,
  // failed request) stays null and the hero renders its neutral unranked state.
  const rankedProgression = useRankedProgression();
  // LC1: the account's real recent Ranked rows. ONE fetch, shared by the
  // lobby's personal history list and the per-role tally under the carousel
  // — the hub components themselves still fetch nothing.
  const rankedHistory = useRankedMatchHistory(20);
  // LC1: the account's own display identity for the lobby's personal column.
  const profileIdentity = useProfileIdentity(user?.id ?? null);
  // Which role's write is in flight, mirroring the Ranked page's picker: the
  // controller's `role` is still the OLD value until the SERVER answers, so
  // the in-flight option has to be tracked here rather than inferred from it.
  const [savingRankedRole, setSavingRankedRole] = useState<RankedRole | null>(null);

  /**
   * BROWSING IS LOCAL. The role the reader has settled on but not yet
   * committed, or null when they have not moved the stage this visit.
   *
   * Working the character-select ring used to be a WRITE per move: every
   * Top → Jungle → Mid step sent `PUT /api/ranked/role`. That endpoint is rate
   * limited to ten writes per account per minute (`role_set`), so two laps of
   * an ordinary five-role carousel exhausted the budget and the eleventh move
   * came back `429 RANKED_RATE_LIMITED`. Nothing about that was the reader's
   * fault: looking through five mascots is browsing, not choosing, and it
   * should cost nothing and be possible forever.
   *
   * So the stage now moves against local state and the account is written
   * exactly once, when the reader commits by pressing PLAY. See
   * `handlePlayRanked` for why that is the correct — and the only safe —
   * commit point.
   */
  // Declared before the state below, which reads the URL to restore itself
  // after the signup gate's auth trip.
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingRankedRole, setPendingRankedRole] = useState<RankedRole | null>(
    () => {
      // Restored after the signup gate's auth trip, so a guest who chose Jungle
      // and then made an account does not come back to Top. Validated against
      // the canonical vocabulary — this is URL input, so anything else is
      // simply ignored and the account's stored role wins as usual.
      const raw = new URLSearchParams(location.search).get(ROLE_RETURN_PARAM);
      return isRankedRole(raw) ? raw : null;
    },
  );
  /** What the lobby SHOWS as chosen: the unsaved local choice if there is one,
   *  otherwise the account's stored role. This is what the carousel is given
   *  as its `value`, which keeps `aria-checked` on the mascot the reader is
   *  actually looking at, and keeps the stage's own
   *  "don't re-select what is already selected" guard (e07da052) measuring
   *  against the right role. */
  const effectiveRankedRole = pendingRankedRole ?? rankedRole.role;
  // PLAY1: which entries the match-entry record offers. The same app_settings
  // rows the admin panel writes and the rest of the platform reads — there is
  // one policy store, and this adds no second one.
  const { settings: appSettings } = useAppSettings();
  /**
   * PLAY1: `/quiz/ranked` sends a player with no active match here rather than
   * resurrecting its retired pre-match menu, and asks for the proper entry
   * experience to be opened. Read ONCE on mount: re-reading it would re-open
   * the record every time the lobby re-renders, including right after the
   * player closed it.
   */
  const [openPlayOnMount] = useState(() => {
    if ((location.state as { openPlay?: boolean } | null)?.openPlay === true) return true;
    // …and the same request as a QUERY, which is how it survives the auth trip
    // the signup gate sends a guest on. See `PLAY_RETURN_PARAM`.
    return new URLSearchParams(location.search).get(PLAY_RETURN_PARAM) === "1";
  });

  /**
   * PLAY — opens the record. It no longer writes anything.
   *
   * The commit MOVED, and it moved because the record now owns the choice.
   * The match-entry scroll has its own role stepper, and it is the surface a
   * player actually decides on: pressing PLAY is "show me my options", not
   * "I have chosen". Writing here would spend a rate-limited `role_set` on
   * every reader who opened the record to look at Daily Challenge.
   *
   * The gate itself is kept — it is still the hook the lobby uses to withhold
   * the record — and it still resolves to whether opening is allowed.
   */
  const handlePlayRanked = useCallback(async (): Promise<boolean> => {
    if (rankedRole.saving) return false;
    return true;
  }, [rankedRole.saving]);

  /**
   * The account's role, written once, from inside the record.
   *
   * THE ONE CANONICAL WRITE. Everything that persists a Ranked role on this
   * page goes through here and through `rankedRole.selectRole` beneath it —
   * `PUT /api/ranked/role` is rate limited to ten writes a minute
   * (`role_set`), and a second write path is a second way to spend that
   * budget without anyone noticing.
   *
   * It is reached from exactly one place: choosing RANKED MATCH on the
   * record. Browsing the lobby's ring writes nothing, stepping the record's
   * arrows writes nothing, and Daily Challenge, Invite and Practice write
   * nothing — none of them queues, so none of them needs the stored role to
   * be anything in particular.
   *
   * The write is SKIPPED when the choice already matches what the account
   * holds, which is the ordinary case for a player who stepped back to where
   * they started or never stepped at all.
   *
   * A REFUSAL RETURNS FALSE AND THE RECORD STAYS ON ITS MENU. The queue join
   * sends no role — `POST /api/ranked/queue` reads the stored preference
   * inside its own transaction — so entering matchmaking on a failed write
   * would queue the player as whoever they used to be, with nothing on screen
   * saying so.
   */
  const handleCommitRankedRole = useCallback(async (next: RankedRole): Promise<boolean> => {
    if (rankedRole.saving) return false;
    if (next === rankedRole.role) {
      // Already the account's role. Keep the lobby's stage in step with what
      // the record settled on, then get out of the way.
      setPendingRankedRole(null);
      return true;
    }
    setSavingRankedRole(next);
    const accepted = await rankedRole.selectRole(next);
    setSavingRankedRole(null);
    if (!accepted) {
      // ONE toast, reused. An id-less `toast.error` mints a NEW toast every
      // time, which is how identical "too many requests" notices used to pile
      // up on the lobby. A stable id makes sonner UPDATE the standing notice
      // instead of stacking another copy. This suppresses nothing: the
      // message still changes with the refusal.
      // The reason is read from the controller's REF, not from its render
      // state: `error` is still the previous value in the tick this promise
      // settles in, which is how a refusal used to be reported with generic
      // role copy instead of the server's actual sentence. See
      // `readWriteError`.
      toast.error(
        rankedRole.readWriteError() ?? "Could not save your role. Try again.",
        { id: RANKED_ROLE_TOAST_ID },
      );
      return false;
    }
    // The record's choice is now the account's, so the lobby's stage has
    // nothing left to hold locally.
    setPendingRankedRole(null);
    return true;
  }, [rankedRole]);
  const userId = user?.id || "anonymous";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = await fetchScoreAttackToday();
        if (!cancelled && today.enabled) setScoreAttackToday(today);
        if (!cancelled && !today.enabled) trackFunnelEvent("dsa_legacy_fallback", { reason: "disabled" });
      } catch {
        // Feature disabled or unavailable: keep the legacy Daily experience.
        if (!cancelled) trackFunnelEvent("dsa_legacy_fallback", { reason: "unavailable" });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const isAnonymous = !user || user.is_anonymous === true;
  /**
   * PLAY1 SOUND — the page owns exactly one cue: the signup CTA's.
   *
   * It takes the quiet fallback knock rather than `modeConfirm`. The seal
   * means "a way to play has been chosen", and Create Account chooses no way
   * to play — it leaves the lobby entirely to go and make an account. A seal
   * here would claim more than the press does, and would sound the same as
   * pressing Ranked, which is the thing this control exists BECAUSE the player
   * could not do.
   */
  const sfx = usePlaySfx();

  /**
   * THE RANKED SIGNUP GATE — one notice, and it lingers.
   *
   * Raised INSTEAD of the Ranked flow when a guest presses Ranked Match (see
   * `PlayScrollRecord`'s gate), so nothing is written, no queue is joined, and
   * no role error can be produced. It is the only thing the player is told.
   *
   * IT IS NOT AN ERROR, and it is deliberately not styled as one. Needing an
   * account to play Ranked is a fact about the mode, not a failure by the
   * player — so this is a plain notice, `toast.error` is not used, and the
   * record plays no negative cue for it.
   *
   * IT DOES NOT EXPIRE. `duration: Infinity` is the app's existing sticky-toast
   * idiom (the admin panels use it for failures a reader must actually read),
   * and the global `Toaster` already renders a `closeButton`, so the notice is
   * dismissible and both of its controls are real, focusable buttons. Nothing
   * about it blocks navigation — it is a toast, not a modal.
   *
   * THE DESTINATION IS THE CANONICAL ONE. `authHref` is AUTH1's single builder
   * for every sender ("did this one remember returnTo?" stops being a
   * per-call-site question), and its own doc says to pass `pathname + search`
   * when the destination is parameterised. So the return target carries the
   * lobby's own state as query: come back to Leaguecraft, on the role the
   * player had chosen, with CHOOSE MODE reopened. It does NOT queue them —
   * they press Ranked again, which is the explicit second action.
   */
  const handleRequireRankedAccount = useCallback(() => {
    const params = new URLSearchParams({ [PLAY_RETURN_PARAM]: "1" });
    if (effectiveRankedRole) params.set(ROLE_RETURN_PARAM, effectiveRankedRole);
    const back = `/quiz?${params.toString()}`;
    toast("Create an account to play Ranked", {
      id: RANKED_ACCOUNT_TOAST_ID,
      description: "Your Leaguecraft setup will be waiting when you return.",
      duration: Infinity,
      action: {
        label: "Create Account",
        onClick: () => {
          sfx.play("buttonPress");
          navigate(authHref(back, { mode: "signup" }));
        },
      },
    });
  }, [effectiveRankedRole, navigate, sfx]);
  const [phase, setPhase] = useState<QuizPhase>("sets");
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [sets, setSets] = useState<QuizSet[]>([]);
  const [currentSet, setCurrentSet] = useState<QuizSet | null>(null);
  /**
   * PRAC1: the rail subject a Practice session was started from, or null
   * when the session came from a SET (or from the Daily Challenge).
   *
   * It is tracked beside `currentSet` rather than encoded into it because
   * the two are re-entered differently: a set replays through
   * `GET /api/quiz/questions?set=`, a subject through its own category
   * loader. `currentSet` still carries the LABEL for both, which is all the
   * results card and the funnel payload ever read off it.
   */
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [fillBlankValue, setFillBlankValue] = useState("");
  const [answerResult, setAnswerResult] = useState<QuizAnswerResult | null>(null);
  const [score, setScore] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState<SessionAnswer[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [setsLoading, setSetsLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<string>("wrong_answer");
  const [reportChosen, setReportChosen] = useState("");
  const [reportExpected, setReportExpected] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [userProgress, setUserProgress] = useState<QuizProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState<string | null>(null);

  const [categoryStats, setCategoryStats] = useState<QuizCategoryStat[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [achievements, setAchievements] = useState<QuizAchievement[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [achievementsError, setAchievementsError] = useState<string | null>(null);

  // Recent quiz-session history for the compact results card. Best-effort:
  // the history endpoint is JWT-only, so a backend auth token is ensured
  // first (guest-friendly, same flow as /lol/history). Failures never block
  // the hub.
  const [recentHistory, setRecentHistory] = useState<QuizHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadRecentHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const token = await ensureBackendAuthToken();
      if (!token) {
        setHistoryError("sign-in required");
        setRecentHistory(null);
        return;
      }
      const data = await quizApi.getHistory();
      setRecentHistory(data);
    } catch (err: any) {
      setHistoryError(err?.message || "History unavailable.");
      setRecentHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const [scoreAttackToday, setScoreAttackToday] = useState<DsaToday | null>(null);
  // DC2's own answer for today — the authority for the match record's Daily
  // clause. One read, no polling; unknown renders the ordinary clause.
  const dailyStatus = useDailyChallengeStatus();
  const [recentXpGain, setRecentXpGain] = useState<number | null>(() => getRecentXpGain());
  // Gate / nudge state
  const [gateConfig, setGateConfig] = useState<QuizOnboardingConfig | null>(null);
  const [showGate, setShowGate] = useState(false);
  // Guest-first: the hard gate never interrupts mid-quiz. Crossing the
  // threshold "arms" it; it displays on the quiz-complete screen instead.
  const gateArmed = useRef(false);
  const [showNudge, setShowNudge] = useState(false);
  const [anonActionCount, setAnonActionCount] = useState(() => getAnonymousActionCount());

  // Backend history session for the current quiz run. Best-effort: created in
  // the background on quiz start; null means play proceeds untracked.
  const sessionIdRef = useRef<number | null>(null);

  const startHistorySession = useCallback((mode: string, category?: string) => {
    sessionIdRef.current = null;
    quizApi
      .startSession({ mode, category })
      .then((res) => {
        if (res.ok && typeof res.session_id === "number") {
          sessionIdRef.current = res.session_id;
        }
      })
      .catch(() => {
        // History tracking must never block gameplay.
      });
  }, []);

  const completeHistorySession = useCallback(() => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId != null) {
      quizApi.completeSession(sessionId).catch(() => {});
    }
  }, []);
  // The theme blurb map mirrors the backend theme names.
  const THEME_BLURBS: Record<string, string> = {
    "Champion Cooldowns": "Memorize the timing windows that win trades.",
    "Item Knowledge": "Recognize core builds and component paths.",
    "Champion Basics": "Identify champions, roles, and signature kits.",
    "Rune Recognition": "Spot keystones, secondaries, and shards on sight.",
    "Summoner Spells": "Track summoner cooldowns to control objectives.",
    "Item Components": "Trace finished items back to their components.",
    "Ability Identification": "Name the spell from the icon alone.",
  };

  const loadProgress = useCallback(async () => {
    setProgressError(null);
    try {
      const data = await quizApi.getProgress(userId);
      setUserProgress(data);
    } catch (err: any) {
      setProgressError(err?.message || "Progression unavailable.");
      setUserProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, [userId]);

  const loadCategories = useCallback(async () => {
    setCategoriesError(null);
    try {
      const data = await quizApi.getCategories(userId);
      setCategoryStats(data.categories || []);
    } catch (err: any) {
      setCategoriesError(err?.message || "Category stats unavailable.");
      setCategoryStats([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, [userId]);

  const loadAchievements = useCallback(async () => {
    setAchievementsError(null);
    try {
      const data = await quizApi.getAchievements(userId);
      const list = data.achievements
        ? data.achievements
        : [...(data.unlocked || []).map((a) => ({ ...a, unlocked: true })), ...(data.locked || []).map((a) => ({ ...a, unlocked: false }))];
      setAchievements(list);
    } catch (err: any) {
      setAchievementsError(err?.message || "Achievements unavailable.");
      setAchievements([]);
    } finally {
      setAchievementsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setProgressLoading(true);
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    setCategoriesLoading(true);
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    setAchievementsLoading(true);
    loadAchievements();
  }, [loadAchievements]);

  useEffect(() => {
    setHistoryLoading(true);
    loadRecentHistory();
  }, [loadRecentHistory]);

  // Ensure anonymous session and load gate config on mount.
  useEffect(() => {
    if (!user) {
      supabase.auth.signInAnonymously();
    }

    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "quiz_onboarding_config")
      .maybeSingle()
      .then(({ data }) => {
        const defaults: QuizOnboardingConfig = {
          hard_gate_enabled: true,
          hard_gate_threshold: 5,
          soft_nudge_enabled: true,
          soft_nudge_threshold: 3,
          redirect_to_hub: true,
        };
        if (data?.value && typeof data.value === "object") {
          setGateConfig({ ...defaults, ...(data.value as Partial<QuizOnboardingConfig>) });
        } else {
          setGateConfig(defaults);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hub redirect: if enabled and user hasn't come from /lol this session, send them there.
  useEffect(() => {
    if (!gateConfig) return;
    if (gateConfig.redirect_to_hub && !hasVisitedHub()) {
      navigate("/lol", { replace: true });
    }
  }, [gateConfig, navigate]);

  // Load quiz sets on mount
  useEffect(() => {
    let cancelled = false;
    setSetsLoading(true);
    quizApi
      .sets()
      .then((data) => {
        if (!cancelled) {
          setSets(data.sets || []);
          setSetsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPhase("error");
          setErrorMsg(err?.message || "Unable to load quiz sets. The quiz server may be offline.");
          setSetsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleSelectSet = useCallback(async (set: QuizSet) => {
    startHistorySession("standard", set.name);
    setCurrentSet(set);
    setCurrentCategoryId(null);
    setPhase("loading-questions");
    setScore(0);
    setSessionAnswers([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setFillBlankValue("");
    setAnswerResult(null);
    setErrorMsg("");
    try {
      const data = await quizApi.questions(set.name, 10);
      const qs = data.questions || [];
      if (qs.length === 0) {
        setPhase("error");
        setErrorMsg("No questions available for this set.");
        return;
      }
      setQuestions(qs);
      setPhase("active");
      if (isAnonymous) {
        trackFunnelEvent("quiz_guest_started", { quiz_mode: "standard", set_id: set.name, total_questions: qs.length });
      }
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err?.message || "Failed to load questions.");
    }
  }, [startHistorySession, isAnonymous]);

  /**
   * PRAC1 — start a Practice session for one category-rail subject.
   *
   * The SAME runner the set path uses: same phase machine, same history
   * session, same attempt recording, same results card. The only thing that
   * differs is where the ten questions come from — a subject spans several
   * live `quiz_categories` rows, so `loadPracticeCategoryQuestions` deals them
   * out round-robin across that subject's categories. See
   * `@/lib/quiz/practiceCategories`.
   *
   * `currentSet` is given a synthetic entry rather than a real one because no
   * set describes these subjects (none contains `Champion Ability Cooldowns`,
   * and "All Current Questions" is every subject at once). Its `id` is
   * namespaced so it can never collide with a real set id, and its NAME is the
   * subject's own — which is what the results card prints, what the funnel
   * payload carries and what the history row records.
   *
   * A subject with no sources cannot get here: the rail renders it
   * `aria-disabled` and never calls this. The guard is kept anyway so a future
   * caller cannot start an empty session by accident.
   */
  const handleSelectCategory = useCallback(async (categoryId: string) => {
    const tile = QUIZ_CATEGORY_ICONS.find((c) => c.id === categoryId);
    if (!tile) return;

    startHistorySession("standard", tile.full);
    setCurrentSet({
      id: `practice-category:${categoryId}`,
      name: tile.full,
      description: `Practice questions on ${tile.full}.`,
      question_count: 0,
    });
    setCurrentCategoryId(categoryId);
    setPhase("loading-questions");
    setScore(0);
    setSessionAnswers([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setFillBlankValue("");
    setAnswerResult(null);
    setErrorMsg("");
    try {
      const qs = await loadPracticeCategoryQuestions(categoryId, PRACTICE_SESSION_SIZE);
      if (qs.length === 0) {
        setPhase("error");
        setErrorMsg(`No practice questions available for ${tile.full} right now.`);
        return;
      }
      setQuestions(qs);
      setPhase("active");
      if (isAnonymous) {
        trackFunnelEvent("quiz_guest_started", {
          quiz_mode: "standard",
          set_id: tile.full,
          total_questions: qs.length,
        });
      }
    } catch (err) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to load questions.");
    }
  }, [startHistorySession, isAnonymous]);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + (answerResult ? 1 : 0)) / questions.length) * 100 : 0;

  const openReportDialog = useCallback(() => {
    setReportType("wrong_answer");
    setReportChosen(selectedAnswer || fillBlankValue || "");
    setReportExpected(answerResult?.correct_answer || "");
    setReportReason("");
    setReportOpen(true);
  }, [selectedAnswer, fillBlankValue, answerResult]);

  const handleSubmitReport = useCallback(async () => {
    if (!currentQuestion) return;
    setReportSubmitting(true);
    try {
      await quizApi.reportQuestion({
        question_id: currentQuestion.id,
        report_type: reportType,
        reported_answer: reportChosen || undefined,
        expected_answer: reportExpected || undefined,
        reason: reportReason || undefined,
      });
      toast.success("Report submitted.");
      setReportOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit report.");
    } finally {
      setReportSubmitting(false);
    }
  }, [currentQuestion, reportType, reportChosen, reportExpected, reportReason]);

  const handleSelectAnswer = useCallback(async (choice: string) => {
    if (!currentQuestion || answerResult) return;
    setSelectedAnswer(choice);
    try {
      const result: QuizAnswerResult = await quizApi.submitAnswer({
        user_id: userId,
        question_id: currentQuestion.id,
        selected_answer: choice,
        session_id: sessionIdRef.current ?? undefined,
      });
      setAnswerResult(result);
      if (result.is_correct) setScore((s) => s + 1);
      trackFunnelEvent("quiz_question_answered", {
        quiz_mode: "standard",
        question_index: currentIndex,
        is_correct: !!result.is_correct,
      });

      // Gate / nudge tracking for anonymous users.
      if (isAnonymous && gateConfig) {
        const newCount = incrementAnonymousActions();
        setAnonActionCount(newCount);
        if (gateConfig.hard_gate_enabled && newCount >= gateConfig.hard_gate_threshold) {
          // Arm only — shown after the quiz completes, never mid-question.
          gateArmed.current = true;
        } else if (
          gateConfig.soft_nudge_enabled &&
          newCount >= gateConfig.soft_nudge_threshold &&
          !hasSoftNudgeBeenSeen()
        ) {
          markSoftNudgeSeen();
          setShowNudge(true);
        }
      }

      setSessionAnswers((prev) => [
        ...prev,
        {
          question: currentQuestion,
          selected: choice,
          isCorrect: !!result.is_correct,
          correctAnswer: result.correct_answer || "",
          explanation: result.explanation,
        },
      ]);
      if (typeof result.xp_earned === "number" && result.xp_earned > 0) {
        recordRecentXpGain(result.xp_earned);
        setRecentXpGain(result.xp_earned);
      }
      // Surface any unlocked achievements
      const unlocked = (result as any).unlocked_achievements;
      if (Array.isArray(unlocked) && unlocked.length > 0) {
        unlocked.forEach((a: any) => {
          const name = a?.name || "Achievement unlocked";
          toast.success(name, {
            description: a?.description || undefined,
            icon: "🏆",
          });
        });
      }
      // Refresh progression in the background
      loadProgress();
      // If the answer unlocked achievements, refresh the achievements panel
      if (Array.isArray(unlocked) && unlocked.length > 0) {
        loadAchievements();
      }
    } catch (err: any) {
      // Even if submit fails, let the user continue
      setAnswerResult({
        is_correct: false,
        correct_answer: "",
        explanation: "Could not verify answer. Please check your connection and try again.",
      });
    }
  }, [currentQuestion, currentIndex, answerResult, userId, loadProgress, loadAchievements]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      completeHistorySession();
      setPhase("result");
      const completionPayload = {
        quiz_mode: "standard",
        set_id: currentSet?.name ?? null,
        correct_count: score,
        total_questions: questions.length,
      };
      trackFunnelEvent("quiz_completed", completionPayload);
      // Results render immediately after completion in the same view.
      trackFunnelEvent("quiz_results_viewed", completionPayload);
      // First signup prompt appears after a completed quiz, not before.
      if (gateArmed.current && isAnonymous) {
        setShowGate(true);
      }
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setFillBlankValue("");
      setAnswerResult(null);
    }
  }, [currentIndex, questions.length, isAnonymous, completeHistorySession, currentSet, score]);

  const handlePlayAgain = useCallback(() => {
    // A subject replays through its own loader. `currentSet` holds a synthetic
    // entry for those sessions, and feeding it back to `handleSelectSet` would
    // query `?set=Objectives` — a set that does not exist — and dead-end on
    // "No questions available for this set."
    if (currentCategoryId) {
      void handleSelectCategory(currentCategoryId);
    } else if (currentSet) {
      handleSelectSet(currentSet);
    } else {
      setPhase("sets");
      setCurrentSet(null);
      setCurrentCategoryId(null);
      setQuestions([]);
      setScore(0);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setFillBlankValue("");
      setAnswerResult(null);
    }
  }, [currentCategoryId, currentSet, handleSelectCategory, handleSelectSet]);

  const handleRetry = useCallback(() => {
    setPhase("sets");
    setErrorMsg("");
    setCurrentSet(null);
    setCurrentCategoryId(null);
    setQuestions([]);
    setScore(0);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setFillBlankValue("");
    setAnswerResult(null);
    // Re-fetch sets if none loaded
    if (sets.length === 0) {
      setSetsLoading(true);
      quizApi
        .sets()
        .then((data) => {
          setSets(data.sets || []);
          setSetsLoading(false);
        })
        .catch((err) => {
          setErrorMsg(err?.message || "Unable to load quiz sets.");
          setSetsLoading(false);
        });
    }
  }, [sets.length]);

  return (
    <div>
      {/* Post-quiz signup prompt — dismissible ("Keep Playing as Guest") */}
      {showGate && (
        <QuizSignUpGate
          progress={userProgress}
          actionCount={anonActionCount}
          returnTo="/quiz"
          onDismiss={() => setShowGate(false)}
        />
      )}

      {/* Soft nudge banner — dismissible */}
      {showNudge && !showGate && (
        <QuizSignUpNudge returnTo="/quiz" />
      )}

      <SEOHead
        title="Mogzy League Quiz — Test Your LoL Knowledge"
        description="Play the League of Legends quiz: champion abilities, item builds, cooldowns, objectives, patch changes, and esports trivia. Daily challenges, streaks, and ranks — start free, no account needed."
        path="/quiz"
        keywords="league of legends quiz, lol quiz, league trivia, champion quiz, item quiz, ability quiz, esports trivia, lol daily challenge, league learning game"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Mogzy League Quiz",
            url: `${SITE_URL}/quiz`,
          },
        ]}
      />

      {/* Academy classroom environment. Absolute (not fixed) so it covers the
          page without painting over the shell footer, and at least a viewport
          tall so a short hub still fills the screen. */}
      <div className="relative min-h-[calc(100dvh-var(--app-header-h))]">
        {/* The two paint layers reach up by --app-header-h so the classroom
            begins right under the fixed HUD instead of leaving the shell's
            header-clearance padding as a bare strip above it (the HUD floats
            and paints nothing of its own there — see GlobalHud). Header
            content below is untouched: only these absolutely-positioned
            decorative layers extend past the wrapper's own top edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 -top-[var(--app-header-h)]"
          style={{
            backgroundImage: `url(${LEAGUECRAFT_BG_URL})`,
            backgroundSize: "cover",
            backgroundPosition: "center 42%",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 -top-[var(--app-header-h)]"
          style={{ background: LEAGUECRAFT_BG_VEIL }}
        />

      {/* MALT top-band pass: the hub now reclaims the HUD BAND ITSELF, not just
          the gap below it.

          The previous pass left `--app-header-h` whole on the theory that the
          outer scrolls "run straight under the HUD's own home and identity
          controls". Measured, that is only true once the rack has stacked. The
          HUD reserves a full-width 56px strip but PAINTS only two corner
          clusters — at 1920×1080 the home control is x 12…56 and the identity
          cluster is x 1590…1893, leaving 1534px of the 1810px band (85%) with
          nothing in it at all. The composition was being pushed down by an
          empty box.

          So from `lg` up — the width at which the rack exists and the hero is
          centred inside wide gutters — the negative margin cancels the shell's
          padding exactly and the scrolls rise into the band:

            · the LEFT scroll starts at x≈219 and the home control ends at
              x=56, so there is no horizontal overlap with it at any width the
              rack exists at;
            · the RIGHT scroll does pass under the identity cluster, but only
              its ornamental top ROLL does. The cluster's bottom is y=53 and
              the right column's first content (the ACADEMY RECORD heading)
              lands at y≈93, so nothing readable is ever covered. This is the
              same trade `/lol` already makes — see LolHub's
              `md:-mt-[var(--app-header-h)]` and the comment above it.

          Below `lg` the columns stack full-width and the first one WOULD run
          under both controls, so the band stays whole there — the original
          reasoning, kept exactly where it still holds.

          TWO STEPS, because the clearance is width-dependent and measured.
          Each scroll's top ROLL is `aspect-ratio: 1086/145` of its own column
          width, so the wider the rack, the lower its first line of text falls
          and the more room the corner controls get for free. Measured gap
          between the controls' bottom edge and the nearest column heading, at
          a FULL reclaim:

            1024 →  5px      1280 → 21px      1536 → 34px      1920 → 40px

          5px is not clearance, it is a near miss, so `lg` reclaims the band
          less 1.5rem and hands that back as the gap (29px at 1024). From `xl`
          the roll is already tall enough to do the job on its own and the
          reclaim is total.

          The margin cancels padding that is already inside this box, so the
          document does not overflow; it gets up to 56px SHORTER, which is the
          point. Every other phase keeps its original pt-4: only the hub has
          three tall columns to fit, and only the hub drops the header row.

          `pt-3`, after passes at `pt-1` and `pt-4`. Cancelling the whole band and then
          adding almost nothing back put the scroll caps 4px off the top edge,
          which reclaimed the space but overshot the composition — the rack had
          nothing above it at all. 1rem seats it: still nothing like the 64px
          ghost-navbar the reclaim removed, and the pixels are affordable
          because the first-screen wrapper in `LeaguecraftHub` tightened the
          rack-to-rail seam to pay for it. 1rem was a step too far: the tightest
          desktop in the range is 1280x800, where the rack alone is 708px and
          the whole budget for (top padding + seam + rail) is 92px — at 16+8+70
          it clipped the rail's bottom edge by two. 12px fits with room at both
          ends of the range.

          THREE NUMBERS, ONE SUM. This padding, the wrapper's `gap-2` seam and
          the rail's own height have to clear the shortest supported viewport
          together; change any one and re-measure 1280x800 as well as the wide
          target. The wrapper's `min-h` offsets are this padding plus whatever
          the breakpoint's reclaim leaves, so they move with it too. */}
      <div
        className={`relative mx-auto px-4 pb-4 ${
          phase === "sets"
            ? "max-w-[1500px] pt-3 lg:-mt-[calc(var(--app-header-h)_-_1.5rem)] xl:-mt-[var(--app-header-h)]"
            : "max-w-3xl pt-4"
        }`}
      >
        {/* Compact Leaguecraft header — every phase EXCEPT the lobby.

            LC1 top-chrome pass: the lobby used to carry this row too, and it
            cost the composition 36px (a 28px row plus its 8px margin) of the
            most valuable vertical space on the page — the strip immediately
            under the shell's HUD band, where the three parchment scroll caps
            want to sit. Every control on it was either decorative or already
            reachable, so on the hub the row is not rendered at all rather than
            being shrunk:

              League Hub   Redundant. LEAGUE_ONLY_MODE is on, which makes
                           LEAGUE_HOME_ROUTE `/lol` and points the HUD's
                           always-present top-left home control at exactly this
                           destination (asserted in GlobalHud.test.tsx). The
                           shell's own floating back pill was already retired in
                           favour of that control — the comment that used to sit
                           here, claiming the pill was merely "suppressed for
                           /quiz", outlived the pill itself.
              Tagline      Decorative only. Removed from the lobby; /lol still
                           carries it as the Leaguecraft card's subtitle.
              Tutorial     Demoted, NOT removed: it is the only UI entry to
                           /quiz/tutorial, so it moves to the quiet utility line
                           under the lobby (below the fold, out of the top
                           chrome). The route and the tutorial gate are
                           untouched.
              Diagnostics  Developer tooling (`developer_route` in the ads
                           policy, "Internal" in the admin registry) that was
                           being shown to every desktop visitor. Now dev-builds
                           only — see LOBBY_SHOWS_DIAGNOSTICS.

            Other phases keep the row exactly as it was: they are single-column
            reading views with room for it, and they need the wordmark and the
            back control that the lobby gets from its own centre scroll and the
            HUD. */}
        {phase !== "sets" && (
          <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Link
              to="/lol"
              aria-label="Back to League hub"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#c9a84c]/40 bg-[#0a1428]/85 px-2.5 py-1 text-[11px] font-semibold text-[#c9a84c] backdrop-blur-md transition-colors hover:border-[#c9a84c] hover:bg-[#0a1428]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              League Hub
            </Link>
            <BookOpen className="h-4 w-4 shrink-0 text-[#c9a84c]/80" aria-hidden="true" />
            {/* The page always has exactly one h1: the lobby's is the centre
                scroll's LEAGUECRAFT wordmark, every other phase's is here. */}
            <h1 className="text-lg font-bold tracking-[0.18em] sm:text-xl">LEAGUECRAFT</h1>
            <p className="text-[11px] uppercase tracking-[0.26em] text-[#c9a84c]/60">
              Study. Practice. Ascend.
            </p>
            <div className="ml-auto flex items-center gap-3">
              {/* Permanent tutorial entry: available regardless of the automatic
                  popup and forced-tutorial policies. */}
              <LeaguecraftTutorialLink />
              {LOBBY_SHOWS_DIAGNOSTICS && (
                <Button asChild variant="ghost" size="sm" className="hidden h-7 gap-1 text-xs md:inline-flex [@media(max-height:480px)]:!hidden">
                  <Link to="/quiz/diagnostics">
                    <Stethoscope className="h-3.5 w-3.5" />
                    Diagnostics
                  </Link>
                </Button>
              )}
            </div>
          </header>
        )}

        {/* Ranked-first hub: a dominant Ranked hero, then one short secondary
            row (Recent Studies · Practice, with Mastery as a link inside it).
            Everything else on this page is withheld behind HUB_MODULES
            (hidden, never deleted). */}
        {phase === "sets" && (
          <>
            <LeaguecraftHub
              progress={userProgress}
              ranked={getRankedState(userProgress?.attempts ?? 0)}
              onPlayRanked={() => handlePlayRanked()}
              onCommitRole={handleCommitRankedRole}
              /* Ranked is account-only on the server, so the record asks
                 BEFORE it writes or queues. `signedIn` is the wrong signal
                 here — it is true for a guest holding an anonymous Supabase
                 session, which is the very visitor this gate exists for. */
              hasAccount={!isAnonymous}
              onRequireAccount={handleRequireRankedAccount}
              /* PLAY1: PLAY opens the match-entry record in place. The only
                 navigation left is the handoff, once the SERVER has a match —
                 `/quiz/ranked` is the live-match host. The id travels in
                 router state so the host enters the match immediately instead
                 of re-discovering it, and the host still falls back to
                 account-bound discovery when it arrives without one. */
              onEnterMatch={(matchId) =>
                navigate("/quiz/ranked", { state: { matchId } })}
              /* The Daily Challenge is DC2 and nothing else. The legacy
                 five-question in-page flow that used to answer this press is
                 gone from this file entirely — see the handoff. */
              onPlayDailyChallenge={() => navigate("/quiz/daily-challenge")}
              playModes={playModeVisibility(appSettings.policy)}
              /* ARENA1 Step 5 §19 — the record's Daily clause reads DC2, the
                 same service the button beside it opens. There is no longer a
                 legacy payload for it to disagree with. */
              dailyChallenge={dailyStatus}
              playScrollOpenOnMount={openPlayOnMount}
              sets={sets}
              setsLoading={setsLoading}
              onSelectSet={handleSelectSet}
              /* PRAC1: the category rail IS the Practice chooser. A tile press
                 starts the session here, on this page, in the runner below —
                 there is no intermediate "choose a category" route, because the
                 rail is that chooser. */
              onSelectCategory={handleSelectCategory}
              /* …and when the runner hands the page back, focus returns to the
                 tile it was started from rather than to the top of the doc. */
              focusCategoryId={currentCategoryId}
              onRefreshSets={handleRetry}
              history={recentHistory}
              historyLoading={historyLoading}
              historyError={historyError}
              showPractice={HUB_MODULES.practicePanel}
              /* The lobby shows the UNSAVED choice; the account is written at
                 PLAY. See `pendingRankedRole`. */
              rankedRole={effectiveRankedRole}
              onSelectRankedRole={setPendingRankedRole}
              /* Held still ONLY while the one write is in flight.
               *
               * It used to also be held whenever `loadState !== "ready"`, which
               * is every GUEST — the role read is account-only, so a guest's
               * controller reports `unavailable`. That rule was written when
               * moving the stage WAS a server write; it no longer is
               * (`onSelectRankedRole` is `setPendingRankedRole`, pure local
               * state), so the only thing it still achieved was throwing a
               * guest's choice away: the ring turned, nothing was recorded, and
               * the match-entry record opened on Top regardless of the mascot
               * the player was looking at. Choosing locally costs nothing and
               * persists nothing; Ranked is where an account is required, and
               * that is now gated explicitly. */
              roleSelectDisabled={rankedRole.saving}
              roleSaving={savingRankedRole}
              /* The seal is the commit, so it holds still while the one write
                 it triggers is in flight — a second press must not start a
                 second write or a second navigation. */
              playDisabled={rankedRole.saving}
              rankedProgression={rankedProgression.progression}
              matchHistory={rankedHistory.entries}
              matchHistoryLoading={rankedHistory.loadState === "loading"}
              displayName={profileIdentity.displayName}
              avatarUrl={profileIdentity.avatarUrl}
              signedIn={!!user}
            />

            {/* ─────────────────────────────────────────────────────────────
                Hidden hub modules. Each block below is intact and restorable
                by flipping its HUB_MODULES flag; the underlying routes,
                components and data all remain live today.
                ───────────────────────────────────────────────────────────── */}

            {/* Time Trial — playable at /quiz/daily.
                The legacy Daily Challenge card used to be this slot's fallback
                and is gone: the Daily is DC2 now, and it is entered from the
                match-entry record, not from a hub card. */}
            {HUB_MODULES.timeTrial && scoreAttackToday && (
              <div
                className="mt-3 grid grid-cols-1 items-stretch gap-3 md:grid-cols-2"
                data-testid="hub-daily-history-row"
              >
                <QuizScoreAttackCard
                  today={scoreAttackToday}
                  hasAccount={!isAnonymous}
                  onPlay={() => trackFunnelEvent("dsa_official_cta_clicked", { from: "quiz_hub" })}
                />
              </div>
            )}

            {/* Stat Check — the card game entrance, live at /quiz/stat-check. */}
            {HUB_MODULES.statCheck && (
              <div className="mt-3" data-testid="hub-stat-check-section">
                <Link
                  to="/quiz/stat-check"
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="hub-stat-check-link"
                >
                  <Card className="transition-colors hover:border-primary/50">
                    <CardHeader className="pb-1">
                      <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-primary/80">
                        <Layers className="h-4 w-4" aria-hidden="true" />
                        Stat Check
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Build a hand and compare champion stats across three lanes.
                        Play the bot, or invite a friend to a private match.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </div>
            )}

            {/* Meta Reflex — the two-card duel entrance. Leaguecraft owns
                /quiz, /quiz/ranked, /quiz/stat-check and /quiz/mastery, but
                Meta Reflex deliberately keeps its own public URLs at
                /league-swipe*: they are live links and a route migration for
                tidiness alone would break them. Withheld from the Ranked-first
                hub, never retired — see src/lib/league-swipe/branding.ts. */}
            {HUB_MODULES.metaReflex && (
              <div className="mt-3" data-testid="hub-meta-reflex-section">
                <Link
                  to={META_REFLEX_ROUTE}
                  className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="hub-meta-reflex-link"
                >
                  <Card className="transition-colors hover:border-primary/50">
                    <CardHeader className="pb-1">
                      <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-primary/80">
                        <Zap className="h-4 w-4" aria-hidden="true" />
                        {META_REFLEX_NAME}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {META_REFLEX_TAGLINE} Rapid-fire champion and item duels —
                        vote on the ones with no right answer, and test yourself on
                        the ones that do.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </div>
            )}

            {/* Pre-redesign five-card practice grid, superseded by the compact
                tiles inside LeaguecraftHub (same sets, same start action). */}
            {HUB_MODULES.legacyPracticeGrid && !setsLoading && sets.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="hub-legacy-practice-grid">
                {sets.map((set) => (
                  <QuizModeCard
                    key={set.id}
                    set={set}
                    categoryStats={categoryStats}
                    onSelect={() => handleSelectSet(set)}
                  />
                ))}
              </div>
            )}

            {/* Knowledge Breakdown — per-category mastery. No other host. */}
            {HUB_MODULES.knowledgeBreakdown && (
              <Collapsible className="mt-3">
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-card/60 px-4 py-2.5 text-left hover:bg-card/80 transition-colors">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary/80" />
                    <span className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
                      Knowledge Breakdown
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <QuizKnowledgeCard
                    categories={categoryStats}
                    loading={categoriesLoading}
                    error={categoriesError}
                    hideHeader
                    totalCategoriesAvailable={Object.keys(CATEGORY_STYLE_MAP).length}
                    totalQuestionsAvailable={sets.reduce(
                      (sum, s) => sum + (s.question_count || 0),
                      0,
                    )}
                    newCategories={[
                      "Item Exact Stats",
                      "Item Components",
                      "Item Builds Into",
                      "Champion Cooldowns",
                      "Summoner Cooldowns",
                    ]}
                    recommendedCategory={
                      sets[0]?.name || "Champion Ability Cooldowns"
                    }
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Achievements grid — also on /profile and /quiz/diagnostics. */}
            {HUB_MODULES.achievements && (
              <Collapsible
                open={achievementsOpen}
                onOpenChange={setAchievementsOpen}
                className="mt-3 mb-6"
              >
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-card/60 px-4 py-2.5 text-left hover:bg-card/80 transition-colors">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary/80" />
                    <span className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
                      Achievements
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {achievements.filter((a) => a.unlocked).length}/{achievements.length}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <QuizAchievementsCard
                    achievements={achievements}
                    loading={achievementsLoading}
                    error={achievementsError}
                    hideHeader
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* The lobby's utility line. Everything the old top row carried
                that is genuinely still needed lives here instead: below the
                composition, after the page's real content in both DOM and tab
                order, and costing the scroll caps nothing.

                The tutorial entry is DEMOTED here, not deleted — this link is
                the only UI path to /quiz/tutorial, and the platform-policy copy
                in the admin tools promises the tutorial "stays available at
                /quiz/tutorial" even with the popup off. Nothing about the
                forced-tutorial gate is touched by moving where the link sits. */}
            <div
              data-testid="hub-utility-line"
              className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 border-t border-[#c9a84c]/12 pt-2"
            >
              {/* MASTERY JOURNEY — RELOCATED, not restored and not new.
                  It was one quiet line inside the "Practice for Ranked"
                  panel, and that panel is withheld this phase. This page
                  holds the ONLY entrance to /quiz/mastery in the product —
                  every other link to it lives inside the mastery pages
                  themselves — so hiding the panel around it would have
                  stranded a whole live route. It moves to the row that
                  already exists for exactly this: one quiet link at the foot
                  of the lobby, rather than a panel of its own. Guided
                  champion progressions are not a practice SELECTOR, so this
                  is not the replacement navigation the rail is going to
                  become. Same flag, same route, same words. */}
              {HUB_MODULES.masteryJourney && (
                <Link
                  to="/quiz/mastery"
                  data-testid="hub-mastery-link"
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Mastery Journey
                </Link>
              )}
              <LeaguecraftTutorialLink />
              {LOBBY_SHOWS_DIAGNOSTICS && (
                <Link
                  to="/quiz/diagnostics"
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                  Diagnostics
                </Link>
              )}
            </div>
          </>
        )}

        {/* Error state */}
        {phase === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center"
          >
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <h3 className="text-base font-semibold text-destructive mb-1">Something went wrong</h3>
            <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
            <Button onClick={handleRetry} variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Try again
            </Button>
          </motion.div>
        )}

        {/* Loading questions */}
        {phase === "loading-questions" && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
        )}

        {/* Active question */}
        {phase === "active" && currentQuestion && (
          <motion.div
            key={`q-${currentIndex}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 [@media(max-height:480px)]:space-y-2"
          >
            <div className="sticky top-[var(--app-header-h)] z-20 -mx-4 space-y-2 bg-background/90 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              {(() => {
                const style = getCategoryStyle(currentQuestion.category);
                const Icon = style.icon;
                const meta = (currentQuestion.metadata || {}) as Record<string, any>;
                const catKey = normalizeCategoryKey(currentQuestion.category);
                const isCooldown = catKey.includes("cooldown");
                const statLabel =
                  typeof meta.stat_label === "string"
                    ? meta.stat_label
                    : typeof meta.stat_name === "string"
                      ? meta.stat_name
                      : undefined;
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium gap-1 ${style.className}`}
                    >
                      <Icon className="h-3 w-3" />
                      {style.label}
                    </Badge>
                    {isCooldown && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-medium gap-1 border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      >
                        <Timer className="h-3 w-3" />
                        Cooldown
                      </Badge>
                    )}
                    {catKey.includes("exact_stat") && statLabel && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-medium border-amber-400/40 bg-amber-400/10 text-amber-200"
                      >
                        Stat: {statLabel}
                      </Badge>
                    )}
                  </div>
                );
              })()}
              <span className="text-[10px] text-muted-foreground font-medium">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <Progress value={progress} className="h-2" />
            </div>

            {(() => {
              const meta = (currentQuestion.metadata || {}) as Record<string, any>;
              const championIcon = resolveQuizAssetUrl(meta.champion_icon_path as string | undefined);
              const championSplash = resolveQuizAssetUrl(meta.champion_splash_path as string | undefined);
              const assetPath = resolveQuizAssetUrl(meta.asset_path as string | undefined);
              const championName = typeof meta.champion_name === "string" ? meta.champion_name : undefined;
              const rawImage = currentQuestion.image_path
                ? resolveQuizAssetUrl(currentQuestion.image_path) || currentQuestion.image_path
                : assetPath;
              const mainVisual = championIcon || rawImage;
              const hasChampionTheme = !!(championIcon || championSplash);
              const cat = (currentQuestion.category || "").toLowerCase();
              const isItem =
                !hasChampionTheme &&
                !!rawImage &&
                (cat.includes("item") ||
                  !!meta.item_id ||
                  !!meta.item_name ||
                  !!meta.component_item_id ||
                  !!meta.component_item_name ||
                  !!meta.parent_item_id ||
                  !!meta.parent_item_name);
              const isRune = !hasChampionTheme && !!rawImage && (cat.includes("rune") || !!meta.rune_id || !!meta.rune_name);
              const isSummoner = !hasChampionTheme && !!rawImage && (cat.includes("summoner") || cat.includes("spell") || !!meta.summoner_id || !!meta.summoner_name);
              const itemName =
                (typeof meta.item_name === "string" ? meta.item_name : undefined) ||
                (typeof meta.parent_item_name === "string" ? meta.parent_item_name : undefined) ||
                (typeof meta.component_item_name === "string" ? meta.component_item_name : undefined);
              const runeName = typeof meta.rune_name === "string" ? meta.rune_name : undefined;
              const summonerName = typeof meta.summoner_name === "string" ? meta.summoner_name : undefined;
              const choicesHaveImages = computeChoicesHaveImages(currentQuestion.choices || []);
              const suppressMainVisual = choicesHaveImages && !currentQuestion.image_path;
              return (
            <Card
              className={
                hasChampionTheme
                  ? "relative overflow-hidden border bg-[#0a1428]/85 backdrop-blur-sm"
                  : "bg-card/80 backdrop-blur-sm"
              }
              style={
                hasChampionTheme
                  ? {
                      borderColor: "rgba(201, 168, 76, 0.45)",
                      boxShadow:
                        "0 0 0 1px rgba(201,168,76,0.15) inset, 0 0 24px rgba(80,170,220,0.18), 0 0 48px rgba(201,168,76,0.10)",
                    }
                  : undefined
              }
            >
              {championSplash && (
                <>
                  <motion.div
                    key={`splash-${currentIndex}`}
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    className="absolute inset-0 pointer-events-none overflow-hidden"
                  >
                    <div
                      className="absolute inset-0 animate-ken-burns"
                      style={{
                        backgroundImage: `url(${championSplash})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: "saturate(1.15) contrast(1.08)",
                      }}
                    />
                  </motion.div>
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(5,10,25,0.50) 0%, rgba(5,10,25,0.72) 50%, rgba(0,0,0,0.92) 100%)",
                    }}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(120% 80% at 50% 0%, rgba(80,170,220,0.10) 0%, transparent 60%)",
                    }}
                  />
                </>
              )}
              <div className="relative">
              <CardHeader className="pb-3">
                <CardTitle
                  className={
                    hasChampionTheme
                      ? "text-base md:text-lg font-semibold leading-snug text-[#f0e6d2]"
                      : "text-base md:text-lg font-semibold leading-snug"
                  }
                >
                  {currentQuestion.question_text}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {mainVisual && !suppressMainVisual && (
                  <div
                    className={
                      championIcon
                        ? "flex flex-col items-center gap-2"
                        : (isItem || isRune || isSummoner)
                          ? "flex flex-col items-center gap-2"
                          : "rounded-lg overflow-hidden border border-border bg-black/20"
                    }
                  >
                    {championIcon ? (
                      <>
                        <motion.div
                          key={`icon-${currentIndex}`}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                          className="relative rounded-xl"
                          style={{
                            padding: 3,
                            background:
                              "linear-gradient(145deg, #f0d78c 0%, #c9a84c 35%, #7a5e22 65%, #c9a84c 100%)",
                            boxShadow:
                              "0 0 0 1px rgba(0,0,0,0.6), 0 0 22px rgba(80,170,220,0.55), 0 0 44px rgba(201,168,76,0.35), 0 8px 24px rgba(0,0,0,0.55)",
                          }}
                        >
                          <div
                            className="relative rounded-lg overflow-hidden"
                            style={{
                              boxShadow:
                                "inset 0 0 0 1px rgba(10,20,40,0.9), inset 0 0 18px rgba(80,170,220,0.35)",
                            }}
                          >
                            <img
                              src={mainVisual}
                              alt={championName || "Champion"}
                              className="h-32 w-32 md:h-40 md:w-40 object-cover block"
                              loading="lazy"
                            />
                            <div
                              aria-hidden
                              className="absolute inset-0 pointer-events-none"
                              style={{
                                background:
                                  "radial-gradient(70% 60% at 50% 0%, rgba(255,235,180,0.18) 0%, transparent 60%)",
                              }}
                            />
                          </div>
                        </motion.div>
                        {championName && (
                          <motion.div
                            key={`name-${currentIndex}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            className="text-sm md:text-base font-semibold tracking-wide uppercase"
                            style={{
                              color: "#f0d78c",
                              textShadow:
                                "0 1px 0 rgba(0,0,0,0.8), 0 0 12px rgba(201,168,76,0.45)",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {championName}
                          </motion.div>
                        )}
                      </>
                    ) : isItem ? (
                      <>
                        <motion.div
                          key={`item-${currentIndex}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          className="relative"
                          style={{
                            padding: 3,
                            background:
                              "linear-gradient(145deg, #d4a857 0%, #8a6a2a 50%, #d4a857 100%)",
                            boxShadow:
                              "0 0 18px rgba(212,168,87,0.45), 0 6px 18px rgba(0,0,0,0.55)",
                          }}
                        >
                          <div
                            className="relative overflow-hidden bg-[#0a0a14]"
                            style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.85), inset 0 0 18px rgba(212,168,87,0.18)" }}
                          >
                            <img
                              src={mainVisual}
                              alt={itemName || "Item"}
                              className="h-28 w-28 md:h-36 md:w-36 object-cover block"
                              loading="lazy"
                            />
                          </div>
                        </motion.div>
                        {itemName && (
                          <div className="text-xs md:text-sm font-semibold tracking-wide uppercase text-[#f0d78c]" style={{ letterSpacing: "0.08em" }}>
                            {itemName}
                          </div>
                        )}
                      </>
                    ) : isRune ? (
                      <>
                        <motion.div
                          key={`rune-${currentIndex}`}
                          initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                          className="relative rounded-full"
                          style={{
                            padding: 3,
                            background:
                              "conic-gradient(from 180deg at 50% 50%, #8b5cf6, #38bdf8, #c084fc, #8b5cf6)",
                            boxShadow:
                              "0 0 22px rgba(139,92,246,0.55), 0 0 44px rgba(56,189,248,0.30), 0 6px 20px rgba(0,0,0,0.55)",
                          }}
                        >
                          <div
                            className="rounded-full overflow-hidden bg-[#0a0a1a]"
                            style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.85), inset 0 0 18px rgba(139,92,246,0.25)" }}
                          >
                            <img
                              src={mainVisual}
                              alt={runeName || "Rune"}
                              className="h-28 w-28 md:h-32 md:w-32 object-cover block rounded-full"
                              loading="lazy"
                            />
                          </div>
                        </motion.div>
                        {runeName && (
                          <div className="text-xs md:text-sm font-semibold tracking-wide uppercase text-[#c4b5fd]" style={{ letterSpacing: "0.08em" }}>
                            {runeName}
                          </div>
                        )}
                      </>
                    ) : isSummoner ? (
                      <>
                        <motion.div
                          key={`summ-${currentIndex}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          className="relative rounded-lg"
                          style={{
                            padding: 3,
                            background:
                              "linear-gradient(145deg, #67e8f9 0%, #0ea5e9 50%, #1e3a8a 100%)",
                            boxShadow:
                              "0 0 22px rgba(56,189,248,0.55), 0 0 44px rgba(56,189,248,0.25), 0 6px 18px rgba(0,0,0,0.55)",
                          }}
                        >
                          <div
                            className="rounded-md overflow-hidden bg-[#06121f]"
                            style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.85), inset 0 0 18px rgba(56,189,248,0.30)" }}
                          >
                            <img
                              src={mainVisual}
                              alt={summonerName || "Summoner spell"}
                              className="h-24 w-24 md:h-28 md:w-28 object-cover block"
                              loading="lazy"
                            />
                          </div>
                        </motion.div>
                        {summonerName && (
                          <div className="text-xs md:text-sm font-semibold tracking-wide uppercase text-[#a5f3fc]" style={{ letterSpacing: "0.08em" }}>
                            {summonerName}
                          </div>
                        )}
                      </>
                    ) : (
                      <img
                        src={mainVisual}
                        alt="Question visual"
                        className="w-full max-h-56 object-contain"
                        loading="lazy"
                      />
                    )}
                  </div>
                )}

                {currentQuestion.format === "fill_blank" ? (
                  <div className="space-y-2">
                    <Input
                      value={fillBlankValue}
                      onChange={(e) => setFillBlankValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && fillBlankValue.trim() && !answerResult) {
                          e.preventDefault();
                          handleSelectAnswer(fillBlankValue.trim());
                        }
                      }}
                      placeholder="Type your answer..."
                      disabled={!!answerResult}
                      autoFocus
                      className="text-sm"
                    />
                    <Button
                      onClick={() => handleSelectAnswer(fillBlankValue.trim())}
                      disabled={!fillBlankValue.trim() || !!answerResult}
                      className="w-full"
                    >
                      Submit answer
                    </Button>
                  </div>
                ) : (
                <QuizAnswerOptions
                  choices={currentQuestion.choices || []}
                  selectedAnswer={selectedAnswer}
                  answerResult={answerResult}
                  onSelect={handleSelectAnswer}
                />
                )}

                {/* Answer feedback */}
                <AnimatePresence>
                  {answerResult && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <QuizAnswerFeedback result={answerResult} metadata={currentQuestion?.metadata} />

                      {/* XP reward */}
                      {(answerResult.xp_earned !== undefined || answerResult.rank || answerResult.current_xp !== undefined) && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 18 }}
                          className="mt-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3"
                        >
                          {(() => {
                            const rankObj = (answerResult.rank && typeof answerResult.rank === "object")
                              ? (answerResult.rank as any)
                              : null;
                            const rankName: string =
                              rankObj?.rank_name ||
                              (typeof answerResult.rank === "string" ? answerResult.rank : "") ||
                              "Rank";
                            const rankIcon =
                              resolveQuizAssetUrl(answerResult.rank_icon) ||
                              resolveQuizAssetUrl(rankObj?.small_icon_path) ||
                              resolveQuizAssetUrl(rankObj?.icon_path);
                            return rankIcon ? (
                              <img
                                src={rankIcon}
                                alt={rankName}
                                className="h-10 w-10 object-contain shrink-0 drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : null;
                          })()}
                          <div className="flex-1 min-w-0">
                            {answerResult.xp_earned !== undefined && (
                              <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                                <Sparkles className="h-3.5 w-3.5" />
                                +{answerResult.xp_earned} XP
                              </div>
                            )}
                            {(answerResult.rank || answerResult.current_xp !== undefined) && (
                              <div className="text-[11px] text-muted-foreground">
                                {answerResult.rank && (
                                  <span className="font-medium text-foreground/80">
                                    {typeof answerResult.rank === "string"
                                      ? answerResult.rank
                                      : ((answerResult.rank as any)?.rank_name || "")}
                                  </span>
                                )}
                                {answerResult.rank && answerResult.current_xp !== undefined && " · "}
                                {answerResult.current_xp !== undefined && (
                                  <span>{answerResult.current_xp.toLocaleString()} XP total</span>
                                )}
                                {typeof answerResult.current_streak === "number" && answerResult.current_streak > 0 && (
                                  <> · <span>🔥 {answerResult.current_streak} streak</span></>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}

                      <div className="flex justify-between items-center mt-3 gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={openReportDialog}
                          className="text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          Report issue
                        </Button>
                        <Button onClick={handleNext}>
                          {currentIndex + 1 >= questions.length ? "See results" : "Next question"}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
              </div>
            </Card>
              );
            })()}
          </motion.div>
        )}

        {/* Final results */}
        {phase === "result" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <Card className="bg-card/80 backdrop-blur-sm text-center">
              <CardHeader>
                <CardTitle className="text-xl md:text-2xl font-bold">Quiz Complete</CardTitle>
                <CardDescription className="text-sm">
                  {currentSet?.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-5xl font-extrabold text-primary">
                    {score}
                    <span className="text-xl text-muted-foreground font-medium"> / {questions.length}</span>
                  </div>
                  <Badge
                    variant={score / questions.length >= 0.7 ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {score === questions.length
                      ? "Perfect Score"
                      : score / questions.length >= 0.7
                      ? "Great Job"
                      : score / questions.length >= 0.4
                      ? "Keep Practicing"
                      : "Study Up"}
                  </Badge>
                </div>

                <Progress
                  value={(score / Math.max(questions.length, 1)) * 100}
                  className="h-3 w-full max-w-xs mx-auto"
                />

                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="outline" onClick={() => setPhase("sets")}>
                    {currentCategoryId ? "Back to Leaguecraft" : "Choose another set"}
                  </Button>
                  <Button onClick={handlePlayAgain}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Play again
                  </Button>
                </div>
              </CardContent>
            </Card>
            <SessionBreakdown answers={sessionAnswers} />
            <SessionReviewList answers={sessionAnswers} />
            <AdSlot placement="quiz_results" isActiveQuizQuestion={phase !== "result"} />
          </motion.div>
        )}
      </div>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
            <DialogDescription>
              Help us improve the quiz. Your report will be reviewed by a moderator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Issue type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wrong_answer">Wrong answer</SelectItem>
                  <SelectItem value="confusing_question">Confusing question</SelectItem>
                  <SelectItem value="wrong_image">Wrong image</SelectItem>
                  <SelectItem value="typo">Typo</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">What answer did you choose?</Label>
              <Input
                value={reportChosen}
                onChange={(e) => setReportChosen(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">What should the answer be?</Label>
              <Input
                value={reportExpected}
                onChange={(e) => setReportExpected(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes / reason</Label>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={reportSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReport} disabled={reportSubmitting}>
              {reportSubmitting ? "Submitting..." : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* ───────────────────── Session breakdown helpers ───────────────────── */

function QuizModeCard({
  set,
  categoryStats,
  onSelect,
}: {
  set: QuizSet;
  categoryStats: QuizCategoryStat[];
  onSelect: () => void;
}) {
  const style = getCategoryStyle(set.name);
  const Icon = style.icon;
  const qCount = set.question_count || 0;
  // Difficulty bucket from question count.
  const difficulty =
    qCount >= 200 ? { label: "Expert", stars: 4 } :
    qCount >= 100 ? { label: "Hard", stars: 3 } :
    qCount >= 40 ? { label: "Medium", stars: 2 } :
    { label: "Easy", stars: 1 };
  // Try to match a category stat by fuzzy name overlap to compute mastery %.
  const match = (() => {
    const lc = set.name.toLowerCase();
    return categoryStats.find(
      (c) =>
        c.category &&
        (lc.includes(c.category.toLowerCase()) ||
          c.category.toLowerCase().includes(lc)),
    );
  })();
  const mastery = match ? Math.max(0, Math.min(100, Math.round(Number(match.accuracy ?? 0)))) : null;
  const attempts = match?.attempts ?? 0;

  // Derive an accent border tint from the per-category style className so each
  // mode card feels visually distinct without bumping the card height.
  const accentBorder = (() => {
    const m = style.className.match(/border-([a-z]+-\d+)\/\d+/);
    return m ? `border-${m[1]}/40` : "border-border";
  })();

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="text-left"
    >
      <Card
        className={`relative h-full cursor-pointer overflow-hidden border ${accentBorder} bg-card/80 backdrop-blur-sm transition-colors hover:border-primary/60`}
      >
        {/* Category accent stripe */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 ${style.className
            .replace(/text-[^\s]+/g, "")
            .replace(/border-[^\s]+/g, "")
            .replace(/bg-([a-z]+-\d+)\/\d+/, "bg-$1/70")}`}
        />
        <CardHeader className="pb-1.5 pt-2.5 sm:pb-2 sm:pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg border ${style.className} shadow-[inset_0_0_8px_rgba(255,255,255,0.05)]`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold leading-tight truncate">
                  {set.name}
                </CardTitle>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="font-bold text-foreground/90 tabular-nums">{qCount}</span>
                  <span>questions</span>
                  <span aria-hidden className="opacity-40">·</span>
                  <span
                    aria-label={`Difficulty ${difficulty.label}`}
                    className="font-semibold uppercase tracking-wider"
                  >
                    {"★".repeat(difficulty.stars)}
                    <span className="opacity-30">{"★".repeat(4 - difficulty.stars)}</span>
                    <span className="ml-1 opacity-80">{difficulty.label}</span>
                  </span>
                </div>
              </div>
            </div>
            {/* No per-card "New" badge — with most categories unplayed it
                appeared on nearly every card and meant nothing. Played counts
                remain the only per-card status marker. */}
            {attempts > 0 && (
              <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                {attempts} played
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1 text-xs leading-snug line-clamp-2">
            {set.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 pb-2.5 sm:pb-3">
          {/* Mastery and the Start affordance share one row — the whole card is
              the click target, so this label is a cue, not a separate button. */}
          <div className="flex items-center gap-3">
            {mastery !== null ? (
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="uppercase tracking-wider">Mastery</span>
                  <span className="font-mono font-semibold text-foreground/80">{mastery}%</span>
                </div>
                <Progress value={mastery} className="h-1.5" />
              </div>
            ) : (
              <div className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Not started
              </div>
            )}
            <div className="flex shrink-0 items-center text-xs font-semibold text-primary">
              Start quiz <ArrowRight className="ml-1 h-3 w-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.button>
  );
}

function SessionBreakdown({ answers }: { answers: SessionAnswer[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { category: string; correct: number; total: number }>();
    for (const a of answers) {
      const cat = a.question.category || "Uncategorized";
      const entry = map.get(cat) || { category: cat, correct: 0, total: 0 };
      entry.total += 1;
      if (a.isCorrect) entry.correct += 1;
      map.set(cat, entry);
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      accuracy: r.total > 0 ? (r.correct / r.total) * 100 : 0,
    }));
  }, [answers]);

  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => b.accuracy - a.accuracy);
  const best = sorted[0];
  const weakest = sorted[sorted.length - 1];

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
          <BookOpen className="h-4 w-4" />
          Session Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 1 && best && weakest && best.category !== weakest.category && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-300">
                <Trophy className="h-3 w-3" />
                Best category
              </div>
              <div className="mt-0.5 text-sm font-semibold text-emerald-200">{best.category}</div>
              <div className="text-[11px] text-emerald-200/80">
                {best.correct}/{best.total} · {best.accuracy.toFixed(0)}%
              </div>
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-rose-300">
                <AlertCircle className="h-3 w-3" />
                Needs work
              </div>
              <div className="mt-0.5 text-sm font-semibold text-rose-200">{weakest.category}</div>
              <div className="text-[11px] text-rose-200/80">
                {weakest.correct}/{weakest.total} · {weakest.accuracy.toFixed(0)}%
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {rows.map((r) => {
            const style = getCategoryStyle(r.category);
            const Icon = style.icon;
            return (
              <div
                key={r.category}
                className="rounded-md border border-border/40 bg-background/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-medium gap-1 ${style.className}`}
                  >
                    <Icon className="h-3 w-3" />
                    {style.label}
                  </Badge>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {r.correct}/{r.total} · {r.accuracy.toFixed(0)}%
                  </span>
                </div>
                <Progress value={r.accuracy} className="mt-2 h-1.5" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionReviewList({ answers }: { answers: SessionAnswer[] }) {
  const missed = useMemo(() => answers.filter((a) => !a.isCorrect), [answers]);
  if (missed.length === 0) return null;

  return (
    <Card className="bg-card/80 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
          <AlertCircle className="h-4 w-4" />
          Questions to Review
        </CardTitle>
        <CardDescription className="text-xs">
          Missed this session — review and try again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {missed.map((a, idx) => {
          const style = getCategoryStyle(a.question.category);
          const Icon = style.icon;
          return (
            <div
              key={`${a.question.id}-${idx}`}
              className="rounded-md border border-border/40 bg-background/40 p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={`text-[10px] gap-1 ${style.className}`}>
                  <Icon className="h-3 w-3" />
                  {style.label}
                </Badge>
              </div>
              <p className="text-sm font-medium leading-snug text-left">
                {a.question.question_text}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-rose-200">
                  <div className="opacity-70 uppercase tracking-wider text-[10px]">Your answer</div>
                  <div className="font-medium">{a.selected || "—"}</div>
                </div>
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-emerald-200">
                  <div className="opacity-70 uppercase tracking-wider text-[10px]">Correct</div>
                  <div className="font-medium">{a.correctAnswer || "—"}</div>
                </div>
              </div>
              {a.explanation && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {a.explanation}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
