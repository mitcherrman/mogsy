import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Plus, Sparkles } from "lucide-react";
import { presetCategories } from "@/lib/mock-data";
import { Link } from "react-router-dom";

export default function Presets() {
  const [isPro] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">Preset Leagues</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Vote on categories beyond user profiles
            </p>
          </div>
          <Button
            variant={isPro ? "default" : "accent"}
            onClick={() => setShowCreate(!showCreate)}
          >
            {isPro ? <><Plus className="h-4 w-4" /> Create</> : <><Lock className="h-4 w-4" /> Create Custom</>}
          </Button>
        </div>

        {/* Paywall / Create form */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-8 rounded-2xl border border-border bg-card p-6"
          >
            {!isPro ? (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 text-accent mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Upgrade to Pro</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Create unlimited custom preset leagues with a Pro subscription.
                </p>
                <Button variant="hero" size="lg">
                  Upgrade — $9.99/mo
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground">Create Custom League</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input placeholder="Best Pizza Place" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="things">Things / Entities</option>
                      <option value="users">Users</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea placeholder="Describe this league..." rows={2} />
                  </div>
                </div>
                <Button variant="hero">Create League</Button>
              </div>
            )}
          </motion.div>
        )}

        {/* Categories grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presetCategories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/leaderboard/${cat.id}`}
                className="block rounded-2xl border border-border bg-card p-6 card-hover"
              >
                <div className="text-4xl mb-3">{cat.icon}</div>
                <h3 className="text-lg font-bold text-foreground">{cat.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {cat.itemCount} items · Vote now
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
