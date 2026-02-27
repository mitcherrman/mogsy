import { motion } from "framer-motion";
import { LogOut, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import SEOHead from "@/components/SEOHead";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <SEOHead title="Settings — Mogsy" description="Manage your Mogsy settings. Change theme, sign out, and customize your experience." />
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Settings</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Use the <span className="font-semibold text-primary">theme button</span> in the bottom-right corner to change your app appearance.
        </p>

        {/* Account */}
        {user && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <h2 className="font-bold text-foreground mb-4">Account</h2>
            <p className="text-sm text-muted-foreground mb-4">Signed in as {user.email}</p>
            <Button variant="destructive" onClick={handleSignOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </motion.section>
        )}
      </div>
    </div>
  );
}
