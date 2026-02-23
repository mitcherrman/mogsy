import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import mogsyIcon from "@/assets/mogsy-icon.png";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import SEOHead from "@/components/SEOHead";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, signIn, signUp, linkAnonymousAccount } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isAnonymous = user?.is_anonymous === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isAnonymous) {
      // Link anonymous account to real account - preserves all data
      const { error } = await linkAnonymousAccount(email, password);
      if (error) {
        toast({ title: "Linking failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: "Your anonymous progress has been saved to your new account." });
        navigate("/swipe");
      }
    } else if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
      } else {
        navigate("/swipe");
      }
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "We sent you a confirmation link." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SEOHead title="Sign In — Mogsy" description="Sign in or create your Mogsy account. Start voting, ranking, and competing in head-to-head leagues." />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8"
      >
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <img src={mogsyIcon} alt="Mogsy" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-extrabold text-gradient">Mogsy</span>
          </Link>
          <h2 className="text-xl font-bold text-foreground">
            {isAnonymous ? "Claim your account" : isLogin ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isAnonymous
              ? "Create an account to keep all your progress, matches, and settings"
              : isLogin ? "Log in to continue ranking" : "Start climbing the ranks"}
          </p>
        </div>

        {isAnonymous && (
          <div className="mb-4 rounded-lg bg-primary/10 border border-primary/20 p-3">
            <p className="text-xs text-primary font-medium">
              ✨ Your match history, Elo ratings, diamonds, and settings will all be preserved!
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" variant="hero" className="w-full" size="lg" disabled={loading}>
            {loading ? "Loading…" : isAnonymous ? "Create Account & Keep Progress" : isLogin ? "Log In" : "Sign Up"}
          </Button>
        </form>

        {!isAnonymous && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-semibold hover:underline">
              {isLogin ? "Sign up" : "Log in"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
