import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Check,
  History,
  BookX,
  BarChart3,
  SlidersHorizontal,
  Swords,
  Save,
  GraduationCap,
  Layers,
  Sparkles,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  startLolProCheckout,
  isLolProCheckoutAvailable,
  LOL_PRO_MONTHLY_PRICE,
} from "@/lib/pro/checkout";

const GOLD = "#c9a84c";

const FREE_FEATURES = [
  "Play quizzes as a guest — no account needed",
  "Daily challenge and free quiz sets",
  "Basic results after every quiz",
  "Your last 10 quiz results saved",
  "Missed-answer review on each results screen",
  "Watch and play live quiz content",
  "Share your quiz results",
];

type ProFeature = {
  title: string;
  description: string;
  Icon: React.ElementType;
  comingSoon?: boolean;
};

const PRO_FEATURES: ProFeature[] = [
  {
    title: "Full Quiz History",
    description: "Every result you've ever posted, not just the last 10.",
    Icon: History,
  },
  {
    title: "Missed Question Bank",
    description: "Review every question you missed across all your quizzes.",
    Icon: BookX,
  },
  {
    title: "Advanced Category Stats",
    description: "See your accuracy by champions, items, abilities, and more.",
    Icon: BarChart3,
    comingSoon: true,
  },
  {
    title: "Custom Practice Filters",
    description: "Build practice sets by category, difficulty, champion, or item.",
    Icon: SlidersHorizontal,
    comingSoon: true,
  },
  {
    title: "Unlimited Combat Lab",
    description: "Run as many simulations as you want, no caps.",
    Icon: Swords,
    comingSoon: true,
  },
  {
    title: "Unlimited Saves & Exports",
    description: "Save and export every Combat Lab simulation you run.",
    Icon: Save,
    comingSoon: true,
  },
  {
    title: "Curated Learning Journeys",
    description: "Guided quiz paths that build real game knowledge.",
    Icon: GraduationCap,
    comingSoon: true,
  },
  {
    title: "Earned Matchup Cards",
    description: "Beat the set. Unlock the card.",
    Icon: Layers,
    comingSoon: true,
  },
];

export default function LolPro() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAnonymous = !user || user.is_anonymous === true;
  const [isPro, setIsPro] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutAvailable = isLolProCheckoutAvailable();
  const showSuccess = searchParams.get("success") === "true";
  const showCanceled = searchParams.get("canceled") === "true";

  useEffect(() => {
    if (authLoading || !user || user.is_anonymous) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("is_pro")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsPro(!!data?.is_pro);
      });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const handleUpgrade = async () => {
    if (!checkoutAvailable) {
      toast.info("Mogsy Pro checkout is coming soon.");
      return;
    }
    if (isAnonymous) {
      toast.info("Create a free account first — your guest progress comes with you.");
      navigate("/auth");
      return;
    }
    setCheckingOut(true);
    try {
      await startLolProCheckout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout could not be started.");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <SEOHead
        title="Mogsy Pro — Practice Smarter at League"
        description="Track your full quiz history, review missed questions, train weak spots, and unlock Matchup Cards with Mogsy Pro."
      />

      <div className="mb-8 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to LoL hub">
          <Link to="/lol"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <Crown className="h-6 w-6" style={{ color: GOLD }} />
        <h1 className="text-2xl font-bold">Mogsy Pro</h1>
      </div>

      {showSuccess && !isPro && (
        <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          Thanks for upgrading — your Pro status may take a moment to activate.
        </div>
      )}
      {showCanceled && !isPro && (
        <div className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          Checkout canceled. You can keep playing free.
        </div>
      )}

      {/* Hero */}
      <div
        className="mb-10 rounded-2xl border p-8 text-center"
        style={{ borderColor: `${GOLD}4d`, background: "linear-gradient(160deg, #0a1428, #091428 60%, #12233f)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
          Practice smarter
        </p>
        <h2 className="mx-auto mt-3 max-w-xl text-3xl font-bold text-[#f5e9c8]">
          Track your progress. Review your mistakes. Practice smarter.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#c8d4e6]">
          Mogsy Pro helps serious League players practice smarter. Track your full quiz
          history, review missed questions, train weak spots, and unlock Matchup Cards
          by completing curated quiz sets.
        </p>

        {isPro ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-semibold"
               style={{ borderColor: `${GOLD}80`, color: "#f0d78c" }}>
            <Sparkles className="h-4 w-4" />
            You’re Pro — everything below is unlocked.
          </div>
        ) : (
          <>
            <p className="mt-6 text-3xl font-bold text-[#f5e9c8]">
              ${LOL_PRO_MONTHLY_PRICE}
              <span className="text-base font-normal text-[#c8d4e6]">/month</span>
            </p>
            <p className="mt-1 text-xs text-[#c8d4e6]/70">Annual plan coming soon.</p>

            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={handleUpgrade}
                disabled={checkingOut || authLoading}
                className="border-0 font-semibold text-[#0a1428] hover:opacity-90"
                style={{ background: `linear-gradient(90deg, ${GOLD}, #a8862f)` }}
              >
                <Crown className="mr-2 h-4 w-4" />
                {checkingOut ? "Opening checkout…" : "Upgrade to Mogsy Pro"}
              </Button>
              <Button asChild size="lg" variant="ghost" className="text-[#c8d4e6] hover:text-white">
                <Link to="/quiz">Keep playing free</Link>
              </Button>
            </div>
            {!checkoutAvailable && (
              <p className="mt-3 text-xs" style={{ color: GOLD }}>
                Mogsy Pro checkout is coming soon.
              </p>
            )}
          </>
        )}
      </div>

      {/* Pro features */}
      <h3 className="mb-4 text-lg font-semibold">What Pro unlocks</h3>
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {PRO_FEATURES.map((f) => (
          <Card key={f.title} className="border-primary/20">
            <CardContent className="flex items-start gap-3 py-4">
              <f.Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: GOLD }} />
              <div>
                <p className="font-medium">
                  {f.title}
                  {f.comingSoon && (
                    <Badge variant="outline" className="ml-2 align-middle text-[10px] uppercase">
                      Coming soon
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Free tier — honest baseline */}
      <h3 className="mb-4 text-lg font-semibold">Free, forever</h3>
      <Card>
        <CardContent className="py-5">
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!isPro && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Subscriptions are handled securely by Stripe. Cancel anytime.
        </p>
      )}
    </div>
  );
}
