import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Swords, Trophy, TrendingUp } from "lucide-react";
import mogsyLogo from "@/assets/mogsy-logo.png";

const features = [
  { icon: Swords, title: "Swipe & Vote", desc: "Choose between two profiles head-to-head. Your vote shapes the rankings." },
  { icon: TrendingUp, title: "Elo Rankings", desc: "Competitive Elo system with Bronze, Silver, Gold, and Platinum tiers." },
  { icon: Trophy, title: "Leaderboards", desc: "Climb the ranks and see where you stand against the community." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 bg-gradient-to-br from-background via-background to-secondary/10">
        <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <img src={mogsyLogo} alt="Mogsy" className="h-24 sm:h-32" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-xl"
          >
            Vote head-to-head. Climb the ranks. Compete in leagues.
            The ultimate competitive profile ranking platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="flex gap-4"
          >
            <Link to="/auth">
              <Button variant="hero" size="xl">Get Started</Button>
            </Link>
            <Link to="/swipe">
              <Button variant="outline" size="xl">Try Swiping</Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-24">
        <div className="grid gap-8 sm:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="rounded-2xl border border-border bg-card p-8 card-hover text-center"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <f.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2026 Mogsy. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
