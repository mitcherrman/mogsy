import { useState, useEffect, useCallback, useRef } from "react";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Trash2, Flag, EyeOff, Send, SmilePlus, Reply, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { containsProfanity } from "@/lib/profanity-filter";
import { cn } from "@/lib/utils";

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "🔥", "😮", "💀"];

interface Comment {
  id: string;
  profile_id: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
  reactions: Record<string, { count: number; reacted: boolean }>;
  total_reactions: number;
  parent_comment_id: string | null;
  replies: Comment[];
}

interface SwipeCommentsProps {
  leagueId: string;
}

interface DeletedComment {
  comment: Comment;
  parentId: string | null;
  timeout: ReturnType<typeof setTimeout>;
}

export default function SwipeComments({ leagueId }: SwipeCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [deletedComments, setDeletedComments] = useState<Map<string, DeletedComment>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setMyProfileId(data.id);
        });
    }
  }, [user]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const { data: commentsData } = await supabase
      .from("comments")
      .select("id, profile_id, content, is_hidden, created_at, parent_comment_id")
      .eq("league_id", leagueId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!commentsData || commentsData.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    const profileIds = [...new Set(commentsData.map((c) => c.profile_id))];
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", profileIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, { display_name: p.display_name || "Anonymous", avatar_url: p.avatar_url }])
    );

    const commentIds = commentsData.map((c) => c.id);
    const { data: reactions } = await supabase
      .from("comment_reactions")
      .select("id, comment_id, profile_id, emoji")
      .in("comment_id", commentIds);

    const reactionMap = new Map<string, Record<string, { count: number; reacted: boolean }>>();
    (reactions || []).forEach((r) => {
      if (!reactionMap.has(r.comment_id)) reactionMap.set(r.comment_id, {});
      const map = reactionMap.get(r.comment_id)!;
      if (!map[r.emoji]) map[r.emoji] = { count: 0, reacted: false };
      map[r.emoji].count++;
      if (r.profile_id === myProfileId) map[r.emoji].reacted = true;
    });

    const allComments: Comment[] = commentsData.map((c) => {
      const profile = profileMap.get(c.profile_id);
      const rxns = reactionMap.get(c.id) || {};
      const total = Object.values(rxns).reduce((sum, r) => sum + r.count, 0);
      return {
        ...c,
        display_name: profile?.display_name || "Anonymous",
        avatar_url: profile?.avatar_url || null,
        reactions: rxns,
        total_reactions: total,
        replies: [],
      };
    });

    // Build tree: separate top-level and replies
    const commentMap = new Map(allComments.map((c) => [c.id, c]));
    const topLevel: Comment[] = [];

    allComments.forEach((c) => {
      if (c.parent_comment_id && commentMap.has(c.parent_comment_id)) {
        commentMap.get(c.parent_comment_id)!.replies.push(c);
      } else if (!c.parent_comment_id) {
        topLevel.push(c);
      } else {
        // orphaned reply — show as top-level
        topLevel.push(c);
      }
    });

    // Sort replies by date ascending
    topLevel.forEach((c) => {
      c.replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    setComments(topLevel);
    setLoading(false);
  }, [leagueId, myProfileId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || !myProfileId || submitting) return;

    if (containsProfanity(newComment)) {
      toast.error("Your comment contains inappropriate language.");
      return;
    }

    if (newComment.trim().length > 500) {
      toast.error("Comment is too long (max 500 characters).");
      return;
    }

    setSubmitting(true);
    const contentTrimmed = newComment.trim();
    const insertData: any = {
      profile_id: myProfileId,
      league_id: leagueId,
      content: contentTrimmed,
    };
    if (replyingTo) {
      insertData.parent_comment_id = replyingTo.id;
    }

    // Build optimistic comment
    const tempId = crypto.randomUUID();
    const myProfile = comments.find(c => c.profile_id === myProfileId);
    const optimisticComment: Comment = {
      id: tempId,
      profile_id: myProfileId,
      content: contentTrimmed,
      is_hidden: false,
      created_at: new Date().toISOString(),
      display_name: myProfile?.display_name || "You",
      avatar_url: myProfile?.avatar_url || null,
      reactions: {},
      total_reactions: 0,
      parent_comment_id: replyingTo?.id || null,
      replies: [],
    };

    // If no display name found from existing comments, fetch it
    if (!myProfile) {
      const { data: profileData } = await supabase
        .from("public_profiles")
        .select("display_name, avatar_url")
        .eq("id", myProfileId)
        .single();
      if (profileData) {
        optimisticComment.display_name = profileData.display_name || "You";
        optimisticComment.avatar_url = profileData.avatar_url;
      }
    }

    // Optimistically add to state
    const replyTarget = replyingTo?.id;
    setComments((prev) => {
      if (replyTarget) {
        return prev.map((c) =>
          c.id === replyTarget
            ? { ...c, replies: [...c.replies, optimisticComment] }
            : c
        );
      }
      return [optimisticComment, ...prev];
    });

    setNewComment("");
    setReplyingTo(null);
    setSubmitting(false);

    // Persist in background
    const { error } = await supabase.from("comments").insert(insertData);
    if (error) {
      toast.error("Failed to post comment");
      // Rollback
      setComments((prev) => {
        if (replyTarget) {
          return prev.map((c) =>
            c.id === replyTarget
              ? { ...c, replies: c.replies.filter((r) => r.id !== tempId) }
              : c
          );
        }
        return prev.filter((c) => c.id !== tempId);
      });
    }
  };

  // Optimistic emoji reaction — no full reload
  const handleReact = async (commentId: string, emoji: string) => {
    if (!myProfileId) {
      toast.error("Sign in to react");
      return;
    }

    // Find comment (could be top-level or reply)
    const findComment = (list: Comment[]): Comment | undefined => {
      for (const c of list) {
        if (c.id === commentId) return c;
        const found = c.replies.find((r) => r.id === commentId);
        if (found) return found;
      }
      return undefined;
    };

    const comment = findComment(comments);
    if (!comment) return;
    const alreadyReacted = comment.reactions[emoji]?.reacted;

    // Optimistic update
    setComments((prev) => {
      const update = (list: Comment[]): Comment[] =>
        list.map((c) => {
          const target = c.id === commentId ? c : null;
          const updatedReplies = c.replies.map((r) =>
            r.id === commentId ? applyReaction(r, emoji, alreadyReacted) : r
          );
          return {
            ...(target ? applyReaction(c, emoji, alreadyReacted) : c),
            replies: target ? c.replies : updatedReplies,
          };
        });
      return update(prev);
    });

    setShowEmojiPicker(null);

    // Persist in background
    if (alreadyReacted) {
      await supabase
        .from("comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("profile_id", myProfileId)
        .eq("emoji", emoji);
    } else {
      await supabase.from("comment_reactions").insert({
        comment_id: commentId,
        profile_id: myProfileId,
        emoji,
      });
    }
  };

  const applyReaction = (comment: Comment, emoji: string, wasReacted: boolean | undefined): Comment => {
    const newReactions = { ...comment.reactions };
    if (wasReacted) {
      if (newReactions[emoji]) {
        newReactions[emoji] = { count: newReactions[emoji].count - 1, reacted: false };
        if (newReactions[emoji].count <= 0) delete newReactions[emoji];
      }
    } else {
      newReactions[emoji] = {
        count: (newReactions[emoji]?.count || 0) + 1,
        reacted: true,
      };
    }
    const total = Object.values(newReactions).reduce((sum, r) => sum + r.count, 0);
    return { ...comment, reactions: newReactions, total_reactions: total };
  };

  const handleDelete = async (commentId: string, parentId: string | null = null) => {
    // Find the comment before removing
    const findAndRemove = (list: Comment[]): { found: Comment | null; newList: Comment[] } => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === commentId) {
          const found = list[i];
          return { found, newList: [...list.slice(0, i), ...list.slice(i + 1)] };
        }
        const replyIdx = list[i].replies.findIndex((r) => r.id === commentId);
        if (replyIdx !== -1) {
          const found = list[i].replies[replyIdx];
          const newReplies = [...list[i].replies.slice(0, replyIdx), ...list[i].replies.slice(replyIdx + 1)];
          const newList = [...list];
          newList[i] = { ...newList[i], replies: newReplies };
          return { found, newList };
        }
      }
      return { found: null, newList: list };
    };

    const { found, newList } = findAndRemove(comments);
    if (!found) return;

    // Optimistic remove
    setComments(newList);

    // Set up undo with timeout
    const timeout = setTimeout(async () => {
      // Actually delete from DB
      await supabase.from("comments").delete().eq("id", commentId);
      setDeletedComments((prev) => {
        const next = new Map(prev);
        next.delete(commentId);
        return next;
      });
    }, 5000);

    const deleted: DeletedComment = { comment: found, parentId, timeout };
    setDeletedComments((prev) => new Map(prev).set(commentId, deleted));

    toast("Comment deleted", {
      action: {
        label: "Undo",
        onClick: () => handleUndoDelete(commentId),
      },
      duration: 4500,
    });
  };

  const handleUndoDelete = (commentId: string) => {
    const entry = deletedComments.get(commentId);
    if (!entry) return;

    clearTimeout(entry.timeout);

    // Restore comment to state
    setComments((prev) => {
      if (entry.parentId) {
        return prev.map((c) =>
          c.id === entry.parentId
            ? { ...c, replies: [...c.replies, entry.comment].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) }
            : c
        );
      }
      return [...prev, entry.comment].sort((a, b) => b.total_reactions - a.total_reactions || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    setDeletedComments((prev) => {
      const next = new Map(prev);
      next.delete(commentId);
      return next;
    });

    toast.success("Comment restored");
  };

  const handleHide = async (commentId: string) => {
    if (!myProfileId) return;
    setComments((prev) => {
      // Remove from top-level or replies
      return prev
        .filter((c) => c.id !== commentId)
        .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== commentId) }));
    });
    toast.success("Comment hidden for you");
  };

  const handleReport = async (commentId: string) => {
    if (!myProfileId) {
      toast.error("Sign in to report");
      return;
    }

    const { error } = await supabase.from("comment_reports").insert({
      comment_id: commentId,
      reporter_profile_id: myProfileId,
    });

    if (error) {
      if (error.code === "23505") toast.info("Already reported");
      else toast.error("Failed to report");
      return;
    }

    const { count } = await supabase
      .from("comment_reports")
      .select("*", { count: "exact", head: true })
      .eq("comment_id", commentId);

    if (count && count >= 5) {
      await supabase.from("comments").update({ is_hidden: true, hidden_by_admin: false }).eq("id", commentId);
      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== commentId) }))
      );
      await supabase.from("admin_notifications").insert({
        type: "comment_report_critical",
        title: "Comment auto-hidden",
        message: `A comment received ${count} reports and was automatically hidden.`,
        metadata: { comment_id: commentId, report_count: count },
      });
    }

    toast.success("Comment reported");
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const handleReply = (commentId: string, displayName: string) => {
    setReplyingTo({ id: commentId, name: displayName });
    inputRef.current?.focus();
  };

  const sorted = [...comments].sort((a, b) => b.total_reactions - a.total_reactions || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={cn("flex gap-2 py-2 first:pt-0", isReply && "ml-6 border-l-2 border-border pl-2")}>
      <UserAvatar src={comment.avatar_url} name={comment.display_name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground truncate">{comment.display_name}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-xs text-foreground/80 break-words">{comment.content}</p>

        {/* Reactions row */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {Object.entries(comment.reactions).map(([emoji, data]) => (
            <button
              key={emoji}
              onClick={() => handleReact(comment.id, emoji)}
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                data.reacted
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              {emoji} {data.count}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(showEmojiPicker === comment.id ? null : comment.id)}
              className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
            >
              <SmilePlus className="h-3 w-3" />
            </button>
            {showEmojiPicker === comment.id && (
              <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 bg-card border border-border rounded-lg p-1 shadow-lg z-20">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(comment.id, emoji)}
                    className="text-sm hover:scale-125 transition-transform p-0.5"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reply button (only for top-level) */}
          {!isReply && (
            <button
              onClick={() => handleReply(comment.id, comment.display_name)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
              title="Reply"
            >
              <Reply className="h-3 w-3" />
            </button>
          )}

          {/* Actions */}
          <div className="ml-auto flex items-center gap-0.5">
            {comment.profile_id === myProfileId && (
              <button
                onClick={() => handleDelete(comment.id, isReply ? comment.parent_comment_id : null)}
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            {comment.profile_id !== myProfileId && (
              <>
                <button
                  onClick={() => handleReport(comment.id)}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  title="Report"
                >
                  <Flag className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleHide(comment.id)}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Hide"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies.length > 0 && (
          <div className="mt-1">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-3">
      <h4 className="text-xs font-bold text-foreground mb-2">Comments</h4>

      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center gap-1 text-[10px] text-primary mb-1">
          <Reply className="h-3 w-3" />
          <span>Replying to {replyingTo.name}</span>
          <button onClick={() => setReplyingTo(null)} className="ml-1 text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* New comment input */}
      {user && myProfileId ? (
        <div className="flex gap-2 mb-3">
          <Input
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={replyingTo ? `Reply to ${replyingTo.name}...` : "Add a comment..."}
            className="text-xs h-8"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground mb-2">Sign in to comment</p>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-3">No comments yet. Be the first!</p>
      ) : (
        <>
          <div className="divide-y divide-border">{top3.map((c) => renderComment(c))}</div>

          {rest.length > 0 && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-primary font-medium mt-2 hover:underline w-full">
                <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                {rest.length} more comment{rest.length > 1 ? "s" : ""}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="divide-y divide-border mt-1">{rest.map((c) => renderComment(c))}</div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
}
