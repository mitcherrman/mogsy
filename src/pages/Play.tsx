import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Play() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground flex-1">Play</h1>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <motion.button
            onClick={() => navigate("/swipe-leagues")}
            className="relative rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-[0_0_30px_hsl(210_80%_60%/0.12)] overflow-hidden group"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shuffle className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-extrabold text-foreground">Swipe</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Rate and rank items by swiping through Collections and User Leagues
                </p>
              </div>
            </div>
          </motion.button>

          <motion.button
            onClick={() => navigate("/elo-check")}
            className="relative rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-[0_0_30px_hsl(210_80%_60%/0.12)] overflow-hidden group"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-extrabold text-foreground">Elo Check</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Guess who's ranked higher — test your knowledge across all leagues
                </p>
              </div>
            </div>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
