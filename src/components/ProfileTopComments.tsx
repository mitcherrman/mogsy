import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare } from "lucide-react";

interface TopComment {
  id: string;
  content: string;
  league_name: string;
  reaction_count: number;
  top_emojis: string[];
  created_at: string;
}

export default function ProfileTopComments({ profileId }: { profileId: string }) {
  const [comments, setComments] = useState<TopComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;

    const load = async () => {
      const { data: commentsData } = await supabase
        .from("comments")
        .select("id, content, league_id, created_at")
        .eq("profile_id", profileId)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!commentsData || commentsData.length === 0) {
        setComments([]);
        setLoading(false);
        return;
      }

      const commentIds = commentsData.map((c) => c.id);
      const leagueIds = [...new Set(commentsData.filter((c) => c.league_id).map((c) => c.league_id!))];

      const [{ data: reactions }, { data: leagues }] = await Promise.all([
        supabase.from("comment_reactions").select("comment_id, emoji").in("comment_id", commentIds),
        leagueIds.length > 0
          ? supabase.from("leagues").select("id, name").in("id", leagueIds)
          : Promise.resolve({ data: [] }),
      ]);

      const leagueMap = new Map((leagues || []).map((l) => [l.id, l.name]));

      const reactionData = new Map<string, { count: number; emojis: Map<string, number> }>();
      (reactions || []).forEach((r) => {
        if (!reactionData.has(r.comment_id)) {
          reactionData.set(r.comment_id, { count: 0, emojis: new Map() });
        }
        const d = reactionData.get(r.comment_id)!;
        d.count++;
        d.emojis.set(r.emoji, (d.emojis.get(r.emoji) || 0) + 1);
      });

      const withReactions = commentsData.map((c) => {
        const rd = reactionData.get(c.id);
        const topEmojis = rd
          ? [...rd.emojis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e)
          : [];
        return {
          id: c.id,
          content: c.content,
          league_name: c.league_id ? leagueMap.get(c.league_id) || "" : "",
          reaction_count: rd?.count || 0,
          top_emojis: topEmojis,
          created_at: c.created_at,
        };
      });

      // Sort by reaction count, take top 5
      withReactions.sort((a, b) => b.reaction_count - a.reaction_count);
      setComments(withReactions.slice(0, 5));
      setLoading(false);
    };

    load();
  }, [profileId]);

  if (loading) return null;
  if (comments.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm text-foreground">Top Comments</h3>
      </div>
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-secondary/50 p-2.5">
            <p className="text-xs text-foreground break-words">{c.content}</p>
            <div className="flex items-center gap-2 mt-1">
              {c.top_emojis.length > 0 && (
                <span className="text-[10px]">{c.top_emojis.join(" ")}</span>
              )}
              {c.reaction_count > 0 && (
                <span className="text-[10px] text-primary font-medium">{c.reaction_count} reactions</span>
              )}
              {c.league_name && (
                <span className="text-[10px] text-muted-foreground ml-auto truncate">{c.league_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
