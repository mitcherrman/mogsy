import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Swords, LayoutGrid, Trophy, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const playOptions = [
  {
    path: "/swipe",
    icon: Swords,
    title: "Quick Swipe",
    desc: "Jump straight into head-to-head voting in your leagues.",
  },
  {
    path: "/leagues",
    icon: Trophy,
    title: "Browse Leagues",
    desc: "See all available leagues, join new ones, and check rankings.",
  },
  {
    path: "/presets",
    icon: LayoutGrid,
    title: "Preset Leagues",
    desc: "Explore community-created preset leagues and vote on curated items.",
  },
];

export default function Play() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Play</h1>
        </div>

        <div className="space-y-4">
          {playOptions.map((option, i) => (
            <motion.div
              key={option.path}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                to={option.path}
                className="flex items-center gap-5 rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(210_80%_60%/0.12)] hover:-translate-y-0.5"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <option.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">{option.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{option.desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
