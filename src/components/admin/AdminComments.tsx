import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Trash2, Eye, EyeOff, Flag, MessageSquare } from "lucide-react";

interface AdminComment {
  id: string;
  profile_id: string;
  league_id: string | null;
  content: string;
  is_hidden: boolean;
  hidden_by_admin: boolean;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
  league_name: string;
  report_count: number;
  reaction_count: number;
}

export default function AdminComments() {
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("comments")
      .select("id, profile_id, league_id, content, is_hidden, hidden_by_admin, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!showHidden) {
      query = query.eq("is_hidden", false);
    }

    const { data: commentsData } = await query;

    if (!commentsData || commentsData.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    // Fetch profiles
    const profileIds = [...new Set(commentsData.map((c) => c.profile_id))];
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", profileIds);
    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, { display_name: p.display_name || "Unknown", avatar_url: p.avatar_url }])
    );

    // Fetch leagues
    const leagueIds = [...new Set(commentsData.filter((c) => c.league_id).map((c) => c.league_id!))];
    const { data: leagues } = leagueIds.length > 0
      ? await supabase.from("leagues").select("id, name").in("id", leagueIds)
      : { data: [] };
    const leagueMap = new Map((leagues || []).map((l) => [l.id, l.name]));

    // Fetch report counts
    const commentIds = commentsData.map((c) => c.id);
    const { data: reports } = await supabase
      .from("comment_reports")
      .select("comment_id")
      .in("comment_id", commentIds);
    const reportCounts = new Map<string, number>();
    (reports || []).forEach((r) => {
      reportCounts.set(r.comment_id, (reportCounts.get(r.comment_id) || 0) + 1);
    });

    // Fetch reaction counts
    const { data: reactions } = await supabase
      .from("comment_reactions")
      .select("comment_id")
      .in("comment_id", commentIds);
    const reactionCounts = new Map<string, number>();
    (reactions || []).forEach((r) => {
      reactionCounts.set(r.comment_id, (reactionCounts.get(r.comment_id) || 0) + 1);
    });

    const mapped: AdminComment[] = commentsData.map((c) => {
      const profile = profileMap.get(c.profile_id);
      return {
        ...c,
        display_name: profile?.display_name || "Unknown",
        avatar_url: profile?.avatar_url || null,
        league_name: c.league_id ? leagueMap.get(c.league_id) || "Unknown" : "N/A",
        report_count: reportCounts.get(c.id) || 0,
        reaction_count: reactionCounts.get(c.id) || 0,
      };
    });

    setComments(mapped);
    setLoading(false);
  }, [showHidden]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
    toast.success("Comment deleted");
  };

  const toggleHide = async (comment: AdminComment) => {
    const newHidden = !comment.is_hidden;
    const { error } = await supabase
      .from("comments")
      .update({ is_hidden: newHidden, hidden_by_admin: newHidden })
      .eq("id", comment.id);
    if (error) {
      toast.error("Failed to update");
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, is_hidden: newHidden, hidden_by_admin: newHidden } : c))
    );
    toast.success(newHidden ? "Comment hidden" : "Comment unhidden");
  };

  const filtered = comments.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.content.toLowerCase().includes(q) ||
      c.display_name.toLowerCase().includes(q) ||
      c.league_name.toLowerCase().includes(q)
    );
  });

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search comments, users, leagues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showHidden} onCheckedChange={setShowHidden} />
          <Label className="text-xs">Show hidden</Label>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <MessageSquare className="h-3 w-3 inline mr-1" />
        {filtered.length} comment{filtered.length !== 1 ? "s" : ""}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Comment</TableHead>
                <TableHead className="text-xs">League</TableHead>
                <TableHead className="text-xs text-center">📊</TableHead>
                <TableHead className="text-xs text-center">🚩</TableHead>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((comment) => (
                <TableRow key={comment.id} className={comment.is_hidden ? "opacity-50" : ""}>
                  <TableCell className="text-xs font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-secondary overflow-hidden flex-shrink-0">
                        {comment.avatar_url ? (
                          <img src={comment.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                            {comment.display_name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <span className="truncate max-w-[80px]">{comment.display_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px]">
                    <p className="truncate">{comment.content}</p>
                    {comment.is_hidden && (
                      <Badge variant="outline" className="text-[9px] mt-0.5">
                        {comment.hidden_by_admin ? "Admin hidden" : "Auto-hidden"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[100px]">
                    {comment.league_name}
                  </TableCell>
                  <TableCell className="text-xs text-center">{comment.reaction_count}</TableCell>
                  <TableCell className="text-xs text-center">
                    {comment.report_count > 0 ? (
                      <Badge variant="destructive" className="text-[9px]">{comment.report_count}</Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDate(comment.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon" aria-label="Toggle visibility"
                        className="h-7 w-7"
                        onClick={() => toggleHide(comment)}
                        title={comment.is_hidden ? "Unhide" : "Hide"}
                      >
                        {comment.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon" aria-label="Delete"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(comment.id)}
                        title="Delete permanently"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
