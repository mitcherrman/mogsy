import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, ArrowRight, RotateCcw, AlertTriangle, HelpCircle, CheckCircle2, XCircle, Stethoscope, Flag, Sparkles, Package, Swords, Timer, Wand2, GitBranch, Layers, BookOpen, Trophy, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { quizApi, type QuizSet, type QuizQuestion, type QuizAnswerResult, type QuizProgress, type QuizCategoryStat, type QuizAchievement, resolveQuizAssetUrl } from "@/lib/quiz/api";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import QuizProfileCard from "@/components/quiz/QuizProfileCard";
import QuizKnowledgeCard from "@/components/quiz/QuizKnowledgeCard";
import QuizAchievementsCard from "@/components/quiz/QuizAchievementsCard";
import QuizDailyChallengeCard from "@/components/quiz/QuizDailyChallengeCard";
import QuizRankedQueueCard from "@/components/quiz/QuizRankedQueueCard";
import {
  getDailyChallenge,
  recordDailyAnswer,
  getRankedState,
  recordRecentXpGain,
  getRecentXpGain,
  type DailyChallengeState,
  type RankedState,
} from "@/lib/quiz/featured-mock";
import { useAuth } from "@/hooks/useAuth";

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
  const userId = user?.id || "anonymous";
  const [phase, setPhase] = useState<QuizPhase>("sets");
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

  // Frontend-only progression surfaces (daily challenge + ranked queue).
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeState>(() =>
    getDailyChallenge(),
  );
  const [recentXpGain, setRecentXpGain] = useState<number | null>(() => getRecentXpGain());

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
      const result = await quizApi.submitAnswer({
        user_id: userId,
        question_id: currentQuestion.id,
        selected_answer: choice,
      });
      setAnswerResult(result);
      if (result.is_correct) setScore((s) => s + 1);
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
      // Update Daily Challenge progress + remember last XP gain for the rank card.
      setDailyChallenge(recordDailyAnswer(!!result.is_correct));
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
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setFillBlankValue("");
      setAnswerResult(null);
    }
  }, [currentIndex, questions.length]);

  const handlePlayAgain = useCallback(() => {
    if (currentSet) {
      handleSelectSet(currentSet);
    } else {
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

        {/* Quiz profile card */}
        <div className="mb-6">
          {/* Featured Daily Challenge + Ranked Queue heroes */}
          <div className="mb-4 space-y-3">
            <QuizDailyChallengeCard
              state={dailyChallenge}
              disabled={setsLoading || sets.length === 0}
              onPlay={() => {
                if (sets.length > 0) handleSelectSet(sets[0]);
              }}
            />
            <QuizRankedQueueCard
              progress={userProgress}
              ranked={getRankedState(userProgress?.attempts ?? 0)}
              disabled={setsLoading || sets.length === 0}
              onPlay={() => {
                if (sets.length > 0) handleSelectSet(sets[sets.length - 1] ?? sets[0]);
              }}
            />
          </div>
          <QuizProfileCard
            progress={userProgress}
            loading={progressLoading}
            error={progressError}
            recentXpGain={recentXpGain}
          />
        </div>

        {/* Knowledge breakdown */}
        <div className="mb-6">
          <QuizKnowledgeCard
            categories={categoryStats}
            loading={categoriesLoading}
            error={categoriesError}
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
        </div>

        {/* Achievements */}
        <div className="mb-6">
          <QuizAchievementsCard
            achievements={achievements}
            loading={achievementsLoading}
            error={achievementsError}
          />
        </div>

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

        {/* Quiz sets */}
        {phase === "sets" && (
          <AnimatePresence mode="wait">
            {setsLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
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
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
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

/* ───────────────────── Session breakdown helpers ───────────────────── */

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
