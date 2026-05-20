import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, MessageSquarePlus, ChevronUp, Check, Clock, Tag, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SEOHead from "@/components/SEOHead";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface FeedbackItem {
  id: string;
  profile_id: string;
  category: string;
  page_reference: string | null;
  title: string;
  body: string;
  status: string;
  priority: string;
  upvotes: number;
  created_at: string;
}

interface FeedbackConfig {
  is_enabled: boolean;
  categories: string[];
  page_options: string[];
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-500",
  "in-progress": "bg-amber-500/20 text-amber-500",
  planned: "bg-purple-500/20 text-purple-500",
  completed: "bg-green-500/20 text-green-500",
  declined: "bg-muted text-muted-foreground",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <Clock className="h-3 w-3" />,
  "in-progress": <Clock className="h-3 w-3" />,
  planned: <Tag className="h-3 w-3" />,
  completed: <Check className="h-3 w-3" />,
  declined: null,
};

export default function Feedback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FeedbackConfig>({
    is_enabled: true,
    categories: ["Bug Report", "Feature Request", "UI/UX", "Content", "General"],
    page_options: ["Home", "Play", "Swipe", "Profile", "Leaderboard", "Shop", "Settings", "Multiplayer", "Aura Check", "Other"],
  });
  const [myFeedback, setMyFeedback] = useState<FeedbackItem[]>([]);
  const [myUpvotes, setMyUpvotes] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [pageRef, setPageRef] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    // Load config
    const { data: cfgData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "feedback_config")
      .single();
    if (cfgData?.value) setConfig(cfgData.value as unknown as FeedbackConfig);

    if (!user) { setLoading(false); return; }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) { setLoading(false); return; }
    setProfileId(profile.id);

    // Load user's own feedback
    const { data: fb } = await supabase
      .from("feedback")
      .select("*")
      .eq("profile_id", profile.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    setMyFeedback((fb as FeedbackItem[]) || []);

    // Load upvotes
    const { data: uv } = await supabase
      .from("feedback_upvotes")
      .select("feedback_id")
      .eq("profile_id", profile.id);
    setMyUpvotes(new Set((uv || []).map(u => u.feedback_id)));

    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!profileId || !title.trim() || !body.trim()) {
      toast.error("Please fill in title and description");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("feedback")
      .insert({
        profile_id: profileId,
        title: title.trim().slice(0, 200),
        body: body.trim().slice(0, 2000),
        category,
        page_reference: pageRef || null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      setMyFeedback(prev => [data as FeedbackItem, ...prev]);
      setTitle("");
      setBody("");
      setCategory("General");
      setPageRef("");
      setShowForm(false);
      toast.success("Feedback submitted! Thank you 🎉");
    }
    setSubmitting(false);
  };

  if (!user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Please sign in to submit feedback.</p>
      </div>
    );
  }

  if (!config.is_enabled) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/home")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-black text-foreground">Feedback</h1>
        </div>
        <p className="text-muted-foreground text-center py-12">Feedback is currently disabled.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <SEOHead title="Feedback — Mogsy" description="Share your feedback and suggestions." />

      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/home")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <MessageSquarePlus className="h-6 w-6 text-primary" /> Feedback
          </h1>
          <p className="text-xs text-muted-foreground">Help us improve Mogsy</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="gap-1.5">
            <Send className="h-4 w-4" /> New
          </Button>
        )}
      </div>

      {/* Submit form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Submit Feedback</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="text-xs">
                  Cancel
                </Button>
              </div>

              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Short title for your feedback..."
                maxLength={200}
                className="text-sm"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config.categories.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Related Page</label>
                  <Select value={pageRef || "none"} onValueChange={v => setPageRef(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {config.page_options.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Describe your feedback, bug, or idea in detail..."
                maxLength={2000}
                rows={4}
                className="text-sm resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{body.length}/2000</span>
                <Button onClick={handleSubmit} disabled={submitting || !title.trim() || !body.trim()} className="gap-1.5">
                  <Send className="h-4 w-4" />
                  {submitting ? "Sending..." : "Submit"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My feedback list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : myFeedback.length === 0 && !showForm ? (
        <div className="text-center py-16">
          <MessageSquarePlus className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No feedback yet</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Share your thoughts, report bugs, or suggest features</p>
          <Button onClick={() => setShowForm(true)} className="gap-1.5">
            <Send className="h-4 w-4" /> Submit Feedback
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Submissions</h2>
          {myFeedback.map((fb, i) => (
            <motion.div
              key={fb.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold text-foreground">{fb.title}</h3>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_COLORS[fb.status] || STATUS_COLORS.open}`}>
                      {STATUS_ICONS[fb.status]} {fb.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{fb.body}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{fb.category}</Badge>
                    {fb.page_reference && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        <MapPin className="h-2.5 w-2.5 mr-0.5" /> {fb.page_reference}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(fb.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold text-foreground">{fb.upvotes}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}