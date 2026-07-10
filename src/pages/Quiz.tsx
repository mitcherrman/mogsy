import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, ArrowRight, RotateCcw, AlertTriangle, HelpCircle, CheckCircle2, XCircle, Stethoscope, Flag, Sparkles, Package, Swords, Timer, Wand2, GitBranch, Layers, BookOpen, Trophy, AlertCircle, Flame } from "lucide-react";
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
import { quizApi, type QuizSet, type QuizQuestion, type QuizAnswerResult, type QuizProgress, type QuizCategoryStat, type QuizAchievement, resolveQuizAssetUrl, type DailyChallengeQuestion } from "@/lib/quiz/api";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import QuizProfileCard from "@/components/quiz/QuizProfileCard";
import QuizKnowledgeCard from "@/components/quiz/QuizKnowledgeCard";
import QuizAchievementsCard from "@/components/quiz/QuizAchievementsCard";
import QuizDailyChallengeCard from "@/components/quiz/QuizDailyChallengeCard";
import QuizRankedQueueCard from "@/components/quiz/QuizRankedQueueCard";
import {
  getDailyChallenge,
  getRankedState,
  recordRecentXpGain,
  getRecentXpGain,
  type DailyChallengeState,
  type RankedState,
} from "@/lib/quiz/featured-mock";
import { useAuth } from "@/hooks/useAuth";
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

type QuizChoiceObject = { label: string; image_path?: string; champion_name?: string };
type QuizChoice = string | QuizChoiceObject;

function getChoiceLabel(choice: QuizChoice): string {
  return typeof choice === "string" ? choice : choice.label;
}

function getChoiceImage(choice: QuizChoice): string | undefined {
  if (typeof choice === "string") return undefined;
  return choice.image_path || undefined;
}

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
  return (category || "").toString().trim().toLowerCase().replace(/[\s\-]+/g, "_");
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

export default function Quiz() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id || "anonymous";
  const isAnonymous = !user || user.is_anonymous === true;
  const [phase, setPhase] = useState<QuizPhase>("sets");
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [sets, setSets] = useState<QuizSet[]>([]);
  const [currentSet, setCurrentSet] = useState<QuizSet | null>(null);
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

  // Daily challenge — initialised from localStorage for instant render, then synced from backend.
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeState>(() =>
    getDailyChallenge(),
  );
  const [recentXpGain, setRecentXpGain] = useState<number | null>(() => getRecentXpGain());
  // Gate / nudge state
  const [gateConfig, setGateConfig] = useState<QuizOnboardingConfig | null>(null);
  const [showGate, setShowGate] = useState(false);
  // Guest-first: the hard gate never interrupts mid-quiz. Crossing the
  // threshold "arms" it; it displays on the quiz-complete screen instead.
  const gateArmed = useRef(false);
  const [showNudge, setShowNudge] = useState(false);
  const [anonActionCount, setAnonActionCount] = useState(() => getAnonymousActionCount());

  // True while the user is playing the daily challenge (vs a normal quiz set).
  const isDailyChallenge = useRef(false);
  // Bonus XP earned on daily challenge completion — captured from the last submit response.
  const dailyBonusXpEarned = useRef(0);
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

  const applyDailyChallengeResponse = useCallback(
    (data: Awaited<ReturnType<typeof quizApi.getDailyChallenge>>) => {
      if (!data.ok || !data.challenge) return;
      const theme = data.challenge.theme;
      setDailyChallenge({
        date: data.challenge.challenge_date,
        answered: data.progress?.answered_count ?? data.answered_count ?? 0,
        correct: data.progress?.correct_count ?? 0,
        target: data.challenge.question_count,
        xpBonus: data.challenge.xp_bonus,
        dailyStreak: data.progress?.daily_streak ?? data.daily_streak ?? 0,
        lastCompletedDate: data.progress?.completed ? data.challenge.challenge_date : null,
        completed: data.progress?.completed ?? data.completed ?? false,
        remaining: data.questions_remaining ?? Math.max(0, data.challenge.question_count - (data.progress?.answered_count ?? 0)),
        themeTitle: theme,
        themeBlurb: THEME_BLURBS[theme] ?? "Sharpen your League of Legends knowledge.",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadDailyChallenge = useCallback(async () => {
    try {
      const data = await quizApi.getDailyChallenge(userId);
      applyDailyChallengeResponse(data);
    } catch {
      // Keep localStorage state on network failure.
    }
  }, [userId, applyDailyChallengeResponse]);

  const handlePlayDailyChallenge = useCallback(async () => {
    isDailyChallenge.current = true;
    setCurrentSet(null);
    setPhase("loading-questions");
    setScore(0);
    setSessionAnswers([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setFillBlankValue("");
    setAnswerResult(null);
    setErrorMsg("");
    try {
      const data = await quizApi.getDailyChallenge(userId);
      applyDailyChallengeResponse(data);
      if (!data.ok || !data.questions) throw new Error(data.error || "Could not load daily challenge.");
      // Only show unanswered questions.
      const remaining = (data.questions as DailyChallengeQuestion[]).filter((q) => !q.answered);
      if (remaining.length === 0) {
        setPhase("sets");
        return;
      }
      setQuestions(remaining as QuizQuestion[]);
      setPhase("active");
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err?.message || "Failed to load daily challenge.");
    }
  }, [userId, applyDailyChallengeResponse]);

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

  // Sync daily challenge state from backend on mount.
  useEffect(() => {
    loadDailyChallenge();
  }, [loadDailyChallenge]);

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
    isDailyChallenge.current = false;
    setCurrentSet(set);
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
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err?.message || "Failed to load questions.");
    }
  }, []);

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
      let result: QuizAnswerResult;
      if (isDailyChallenge.current) {
        const dcResult = await quizApi.submitDailyChallengeAnswer({
          user_id: userId,
          question_id: currentQuestion.id,
          selected_answer: choice,
        });
        result = dcResult;
        // Update daily challenge state from the backend response.
        if (dcResult.daily_progress) {
          setDailyChallenge((prev) => ({
            ...prev,
            answered: dcResult.daily_progress!.answered_count,
            correct: dcResult.daily_progress!.correct_count,
            completed: dcResult.daily_progress!.completed,
            dailyStreak: dcResult.daily_progress!.daily_streak,
            remaining: Math.max(0, prev.target - dcResult.daily_progress!.answered_count),
            lastCompletedDate: dcResult.daily_progress!.completed ? prev.date : prev.lastCompletedDate,
          }));
        }
        if (dcResult.daily_bonus_xp_earned && dcResult.daily_bonus_xp_earned > 0) {
          dailyBonusXpEarned.current = dcResult.daily_bonus_xp_earned;
        }
      } else {
        result = await quizApi.submitAnswer({
          user_id: userId,
          question_id: currentQuestion.id,
          selected_answer: choice,
        });
      }
      setAnswerResult(result);
      if (result.is_correct) setScore((s) => s + 1);

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
  }, [currentQuestion, answerResult, userId, loadProgress, loadAchievements]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setPhase("result");
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
  }, [currentIndex, questions.length, isAnonymous]);

  const handlePlayAgain = useCallback(() => {
    if (currentSet) {
      handleSelectSet(currentSet);
    } else {
      isDailyChallenge.current = false;
      setPhase("sets");
      setCurrentSet(null);
      setQuestions([]);
      setScore(0);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setFillBlankValue("");
      setAnswerResult(null);
    }
  }, [currentSet, handleSelectSet]);

  const handleRetry = useCallback(() => {
    isDailyChallenge.current = false;
    setPhase("sets");
    setErrorMsg("");
    setCurrentSet(null);
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
        title="Mogsy League Quiz — Test Your LoL Knowledge"
        description="Challenge yourself with League of Legends trivia and mechanics questions on Mogsy."
        path="/quiz"
        keywords="league of legends quiz, lol trivia, mogsy quiz, lol knowledge test"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Mogsy League Quiz",
            url: `${SITE_URL}/quiz`,
          },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5">
              <BrainCircuit className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">League Quiz</h1>
              <p className="text-xs text-muted-foreground">Test your League of Legends knowledge</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/quiz/diagnostics">
              <Stethoscope className="h-3.5 w-3.5" />
              Diagnostics
            </Link>
          </Button>
        </div>

        {/* Gameplay-first home: Daily Challenge → Quiz Modes → Ranked → Progression → expandable details. */}
        {phase === "sets" && (
          <>
            {/* 1. Daily Challenge hero (primary retention CTA). */}
            <div className="mb-3">
              <QuizDailyChallengeCard
                state={dailyChallenge}
                disabled={setsLoading}
                onPlay={handlePlayDailyChallenge}
              />
            </div>

            {/* 2. Quiz Mode Cards — playable content right under the hero. */}
            <div className="mb-3">
              <AnimatePresence mode="wait">
                {setsLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-lg" />
                    ))}
                  </motion.div>
                ) : sets.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center"
                  >
                    <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No quiz sets available right now.</p>
                    <Button onClick={handleRetry} variant="ghost" className="mt-3">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="sets"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    {sets.map((set) => (
                      <QuizModeCard
                        key={set.id}
                        set={set}
                        categoryStats={categoryStats}
                        onSelect={() => handleSelectSet(set)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 3. Ranked queue — secondary competitive CTA, below practice modes. */}
            <div className="mb-3">
              <QuizRankedQueueCard
                progress={userProgress}
                ranked={getRankedState(userProgress?.attempts ?? 0)}
                disabled={setsLoading || sets.length === 0}
                onPlay={() => {
                  if (sets.length > 0) handleSelectSet(sets[sets.length - 1] ?? sets[0]);
                }}
              />
            </div>

            {/* 4. Compact Progression Dashboard. */}
            <div className="mb-3">
              <QuizProfileCard
                progress={userProgress}
                loading={progressLoading}
                error={progressError}
                recentXpGain={recentXpGain}
                achievements={achievements}
                onViewAchievements={() => setAchievementsOpen(true)}
              />
            </div>

            {/* 5. Collapsible Knowledge Breakdown. */}
            <Collapsible className="mb-3">
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

            {/* 6. Collapsible Achievements grid. */}
            <Collapsible
              open={achievementsOpen}
              onOpenChange={setAchievementsOpen}
              className="mb-6"
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
            className="space-y-4"
          >
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
              const choicesHaveImages = (currentQuestion.choices || []).some(
                (c) => typeof c === "object" && c !== null && !!(c as QuizChoiceObject).image_path,
              );
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
                <div className={choicesHaveImages ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-1 gap-2.5"}>
                  {(currentQuestion.choices || []).map((choice, idx) => {
                    const label = getChoiceLabel(choice);
                    const imgPath = getChoiceImage(choice);
                    const imgUrl = imgPath ? resolveQuizAssetUrl(imgPath) : undefined;
                    const isSelected = selectedAnswer === label;
                    const isCorrect = answerResult?.correct_answer === label;
                    let btnVariant: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive" | "hero" | "accent" = "outline";
                    if (answerResult) {
                      if (isCorrect) btnVariant = "default";
                      else if (isSelected) btnVariant = "destructive";
                      else btnVariant = "outline";
                    } else if (isSelected) {
                      btnVariant = "default";
                    }

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + idx * 0.07, duration: 0.35, ease: "easeOut" }}
                      >
                        <Button
                          variant={btnVariant}
                          onClick={() => handleSelectAnswer(label)}
                          disabled={!!answerResult}
                          className={
                            imgUrl
                              ? "w-full h-auto flex-col items-center gap-2 py-3 px-3 whitespace-normal font-medium text-sm leading-relaxed"
                              : "w-full justify-start text-left h-auto py-3 px-4 whitespace-normal font-medium text-sm leading-relaxed"
                          }
                        >
                          {imgUrl ? (
                            <>
                              <div
                                className="relative rounded-md overflow-hidden"
                                style={{
                                  padding: 2,
                                  background:
                                    "linear-gradient(145deg, #f0d78c 0%, #c9a84c 50%, #7a5e22 100%)",
                                  boxShadow:
                                    "0 0 12px rgba(201,168,76,0.35), 0 4px 12px rgba(0,0,0,0.45)",
                                }}
                              >
                                <img
                                  src={imgUrl}
                                  alt={label}
                                  className="h-20 w-20 md:h-24 md:w-24 object-cover block rounded-sm"
                                  loading="lazy"
                                />
                              </div>
                              <div className="flex items-center gap-1.5 w-full justify-center">
                                <span className="text-xs text-muted-foreground font-bold">
                                  {String.fromCharCode(65 + idx)}.
                                </span>
                                <span className="text-center">{label}</span>
                                {answerResult && isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 text-primary-foreground shrink-0" />
                                )}
                                {answerResult && isSelected && !isCorrect && (
                                  <XCircle className="h-4 w-4 text-destructive-foreground shrink-0" />
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="mr-2 shrink-0 text-xs text-muted-foreground font-bold">
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              <span className="flex-1">{label}</span>
                              {answerResult && isCorrect && (
                                <CheckCircle2 className="h-4 w-4 text-primary-foreground ml-2 shrink-0" />
                              )}
                              {answerResult && isSelected && !isCorrect && (
                                <XCircle className="h-4 w-4 text-destructive-foreground ml-2 shrink-0" />
                              )}
                            </>
                          )}
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>
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
                      <div
                        className={`rounded-lg border p-4 text-sm ${
                          answerResult.is_correct
                            ? "border-green-500/30 bg-green-500/10 text-green-400"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold mb-1">
                          {answerResult.is_correct ? (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Correct!
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4" />
                              Incorrect
                            </>
                          )}
                        </div>
                        {!answerResult.is_correct && answerResult.correct_answer && (
                          <p className="text-xs opacity-90 mb-1">
                            Correct answer: <span className="font-semibold">{answerResult.correct_answer}</span>
                          </p>
                        )}
                        {answerResult.explanation && (
                          <p className="text-xs opacity-80 leading-relaxed">{answerResult.explanation}</p>
                        )}
                      </div>

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
        {phase === "result" && isDailyChallenge.current && (
          <DailyChallengeResult
            score={dailyChallenge.correct}
            total={dailyChallenge.target}
            dailyChallenge={dailyChallenge}
            bonusXp={dailyBonusXpEarned.current}
            answers={sessionAnswers}
            onDone={() => {
              isDailyChallenge.current = false;
              dailyBonusXpEarned.current = 0;
              setPhase("sets");
            }}
          />
        )}

        {phase === "result" && !isDailyChallenge.current && (
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

                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={() => setPhase("sets")}>
                    Choose another set
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
          </motion.div>
        )}
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

/* ───────────────────── Daily challenge result ───────────────────── */

function DailyChallengeResult({
  score,
  total,
  dailyChallenge,
  bonusXp,
  answers,
  onDone,
}: {
  score: number;
  total: number;
  dailyChallenge: DailyChallengeState;
  bonusXp: number;
  answers: SessionAnswer[];
  onDone: () => void;
}) {
  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
  const isCompleted = dailyChallenge.completed;
  const streak = dailyChallenge.dailyStreak;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      <Card
        className="relative overflow-hidden border-[#c9a84c]/40 bg-gradient-to-br from-[#1a1530]/90 via-[#0a1428]/90 to-[#0a0a1a]/90 backdrop-blur-sm text-center"
        style={{
          boxShadow: "0 0 0 1px rgba(201,168,76,0.18) inset, 0 0 28px rgba(80,170,220,0.15), 0 8px 28px rgba(0,0,0,0.55)",
        }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent opacity-80" />
        <CardHeader className="pb-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c9a84c]/80 mb-1">
            Daily Challenge · Complete
          </div>
          <CardTitle className="text-xl md:text-2xl font-bold text-[#f5e9c8]">
            {isCompleted ? "Challenge Complete!" : "Session Over"}
          </CardTitle>
          <CardDescription className="text-sm text-[#c9a84c]/70">
            {dailyChallenge.themeTitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pb-6">
          {/* Score */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-5xl font-extrabold text-[#f0d78c]">
              {score}
              <span className="text-xl font-medium text-[#c9a84c]/60"> / {total}</span>
            </div>
            <Badge
              variant="outline"
              className={`text-xs border-[#c9a84c]/40 ${
                accuracy === 100
                  ? "bg-emerald-500/20 text-emerald-300"
                  : accuracy >= 60
                  ? "bg-[#c9a84c]/15 text-[#f0d78c]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {accuracy === 100 ? "Perfect" : accuracy >= 60 ? "Good effort" : "Keep practicing"}
            </Badge>
          </div>

          {/* Stats row */}
          <div className="flex justify-center gap-6">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-2xl font-bold text-orange-300 inline-flex items-center gap-1">
                <Flame className="h-5 w-5" />{streak}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">day streak</span>
            </div>
            {bonusXp > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-2xl font-bold text-[#f0d78c] inline-flex items-center gap-1">
                  <Sparkles className="h-5 w-5" />+{bonusXp}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">bonus XP</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-2xl font-bold text-[#f5e9c8]">{accuracy}%</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">accuracy</span>
            </div>
          </div>

          {/* Streak message */}
          {isCompleted && (
            <p className="text-sm text-muted-foreground">
              {streak > 1
                ? `${streak}-day streak — come back tomorrow to keep it alive.`
                : "Come back tomorrow to start a streak!"}
            </p>
          )}

          <Button
            onClick={onDone}
            className="w-full bg-gradient-to-r from-[#c9a84c] to-[#a8862f] font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f]"
          >
            Back to Quiz
          </Button>
        </CardContent>
      </Card>

      <SessionBreakdown answers={answers} />
      <SessionReviewList answers={answers} />
    </motion.div>
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
        <CardHeader className="pb-2 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${style.className} shadow-[inset_0_0_8px_rgba(255,255,255,0.05)]`}
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
            {attempts === 0 ? (
              <Badge
                variant="outline"
                className="shrink-0 border-emerald-400/40 bg-emerald-400/10 text-[10px] font-bold uppercase tracking-wider text-emerald-300"
              >
                New
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                {attempts} played
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1 text-xs leading-snug line-clamp-2">
            {set.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-0 pb-3">
          {mastery !== null ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="uppercase tracking-wider">Mastery</span>
                <span className="font-mono font-semibold text-foreground/80">{mastery}%</span>
              </div>
              <Progress value={mastery} className="h-1.5" />
            </div>
          ) : (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              No mastery yet
            </div>
          )}
          <div className="flex items-center justify-end text-xs font-semibold text-primary">
            Start quiz <ArrowRight className="ml-1 h-3 w-3" />
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
