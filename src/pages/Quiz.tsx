import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, ArrowRight, RotateCcw, AlertTriangle, HelpCircle, CheckCircle2, XCircle, Stethoscope, Flag } from "lucide-react";
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
import { quizApi, type QuizSet, type QuizQuestion, type QuizAnswerResult } from "@/lib/quiz/api";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";

type QuizPhase = "sets" | "loading-questions" | "active" | "result" | "error";

function getChoiceLabel(choice: string | { label: string }): string {
  return typeof choice === "string" ? choice : choice.label;
}

export default function Quiz() {
  const [phase, setPhase] = useState<QuizPhase>("sets");
  const [sets, setSets] = useState<QuizSet[]>([]);
  const [currentSet, setCurrentSet] = useState<QuizSet | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [fillBlankValue, setFillBlankValue] = useState("");
  const [answerResult, setAnswerResult] = useState<QuizAnswerResult | null>(null);
  const [score, setScore] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [setsLoading, setSetsLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<string>("wrong_answer");
  const [reportChosen, setReportChosen] = useState("");
  const [reportExpected, setReportExpected] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

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

  const handleSelectAnswer = useCallback(async (choice: string) => {
    if (!currentQuestion || answerResult) return;
    setSelectedAnswer(choice);
    try {
      const result = await quizApi.submitAnswer({
        question_id: currentQuestion.id,
        selected_answer: choice,
      });
      setAnswerResult(result);
      if (result.is_correct) setScore((s) => s + 1);
    } catch (err: any) {
      // Even if submit fails, let the user continue
      setAnswerResult({
        is_correct: false,
        correct_answer: "",
        explanation: "Could not verify answer. Please check your connection and try again.",
      });
    }
  }, [currentQuestion, answerResult]);

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
    <div className="min-h-dvh bg-background">
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
                  <motion.button
                    key={set.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectSet(set)}
                    className="text-left"
                  >
                    <Card className="h-full hover:border-primary/40 transition-colors cursor-pointer bg-card/80 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base font-bold">{set.name}</CardTitle>
                          <Badge variant="secondary" className="text-[10px]">{set.question_count} Qs</Badge>
                        </div>
                        <CardDescription className="text-xs leading-relaxed">
                          {set.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center text-xs text-primary font-semibold gap-1">
                          Start quiz <ArrowRight className="h-3 w-3" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.button>
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
              <Badge variant="outline" className="text-[10px] font-medium">
                {currentQuestion.category}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-medium">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <Progress value={progress} className="h-2" />

            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg font-semibold leading-snug">
                  {currentQuestion.question_text}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentQuestion.image_path && (
                  <div className="rounded-lg overflow-hidden border border-border bg-black/20">
                    <img
                      src={currentQuestion.image_path}
                      alt="Question visual"
                      className="w-full max-h-56 object-contain"
                      loading="lazy"
                    />
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
                <div className="grid grid-cols-1 gap-2.5">
                  {(currentQuestion.choices || []).map((choice, idx) => {
                    const label = getChoiceLabel(choice);
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
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <Button
                          variant={btnVariant}
                          onClick={() => handleSelectAnswer(label)}
                          disabled={!!answerResult}
                          className="w-full justify-start text-left h-auto py-3 px-4 whitespace-normal font-medium text-sm leading-relaxed"
                        >
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

                      <div className="flex justify-end mt-3">
                        <Button onClick={handleNext}>
                          {currentIndex + 1 >= questions.length ? "See results" : "Next question"}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Final results */}
        {phase === "result" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <Card className="bg-card/80 backdrop-blur-sm">
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
          </motion.div>
        )}
      </div>
    </div>
  );
}
