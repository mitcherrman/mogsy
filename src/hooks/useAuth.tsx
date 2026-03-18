import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  linkAnonymousAccount: (email: string, password: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Initialize: get session, check settings, maybe sign in anonymously
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        if (mounted) {
          setSession(session);
          setUser(session.user);
          setLoading(false);
        }
        return;
      }

      // No user — check if we should sign in anonymously
      const { data: settingsData } = await supabase
        .from("app_settings")
        .select("key, value")
        .eq("key", "require_auth");

      const requireAuth = settingsData?.[0]
        ? (settingsData[0].value as any)?.enabled ?? true
        : true;

      if (!requireAuth) {
        // Sign in anonymously before resolving loading
        await supabase.auth.signInAnonymously();
        // onAuthStateChange will set user/session
      }

      if (mounted) {
        setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    await supabase.auth.signOut();
  };

  const linkAnonymousAccount = async (email: string, password: string) => {
    const { error } = await supabase.auth.updateUser({
      email,
      password,
    });
    if (!error) {
      const userId = user?.id;
      if (userId) {
        await supabase.from("profiles").update({ is_anonymous: false }).eq("user_id", userId);
      }
    }
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, linkAnonymousAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
