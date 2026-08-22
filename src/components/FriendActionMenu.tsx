import { useState } from "react";
import { MoreHorizontal, Flag, Ban, UserX, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useBlocks, useReportUser } from "@/hooks/useBlocks";
import { useNavigate } from "react-router-dom";
import { statCheckOnlineApi, StatCheckApiError } from "@/lib/stat-check-online/client";

interface FriendActionMenuProps {
  targetProfileId: string;
  targetName: string;
  friendshipId?: string;
  onRemoveFriend?: (friendshipId: string) => Promise<void>;
  onBlocked?: () => void;
  /**
   * Show "Invite to Stat Check". Callers must pass this ONLY for an accepted
   * friend: this menu is also rendered for strangers on /user/:profileId, and
   * `friendshipId` alone does not distinguish accepted from pending.
   *
   * This is a UI affordance, not a security control — the backend independently
   * re-derives the sender from the JWT and requires an accepted friendship with
   * no block in either direction, at both create and accept.
   */
  canInviteToStatCheck?: boolean;
}

const REPORT_REASONS = [
  { value: "inappropriate", label: "Inappropriate behavior" },
  { value: "harassment", label: "Harassment / bullying" },
  { value: "spam", label: "Spam" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "underage", label: "Underage user" },
  { value: "other", label: "Other" },
];

export default function FriendActionMenu({
  targetProfileId,
  targetName,
  friendshipId,
  onRemoveFriend,
  onBlocked,
  canInviteToStatCheck = false,
}: FriendActionMenuProps) {
  const navigate = useNavigate();
  const { blockUser } = useBlocks();
  const { reportUser } = useReportUser();
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviting, setInviting] = useState(false);

  /**
   * COM1-1 / P0-2. Both handlers used to sit in a `try/catch` that could never
   * fire — supabase-js resolves with `{ error }` rather than throwing — so the
   * success toast printed unconditionally and the dialog closed on a write
   * that never landed. Success is now reported only when the database
   * confirmed it, and a refusal shows the reason the result carries.
   */
  const handleReport = async () => {
    setSubmitting(true);
    const result = await reportUser(targetProfileId, reportReason, reportDetails || undefined);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Report submitted. We'll review it shortly.");
    setShowReport(false);
    setReportDetails("");
  };

  const handleBlock = async () => {
    setSubmitting(true);
    const result = await blockUser(targetProfileId);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${targetName} has been blocked`);
    setShowBlock(false);
    onBlocked?.();
  };

  /**
   * Creates (or reuses) the sender's private room and sends the invitation in
   * one call, then takes the inviter straight to their own lobby through the
   * existing room route. The friend receives it in their notification bell.
   */
  const handleInvite = async () => {
    setInviting(true);
    try {
      const invite = await statCheckOnlineApi.createInvite(targetProfileId);
      toast.success(`Invited ${targetName} to Stat Check`);
      navigate(invite.joinPath);
    } catch (error) {
      const code = error instanceof StatCheckApiError ? error.code : null;
      const status = error instanceof StatCheckApiError ? error.status : 0;
      toast.error(
        status === 404
          ? "Stat Check invites are not available yet"
          : code === "SC_INVITE_NOT_FRIENDS"
            ? "You can only invite accepted friends"
            : code === "SC_INVITE_BLOCKED"
              ? "This invite is not available"
              : code === "SC_INVITE_LIMIT"
                ? "You already have too many outstanding invites"
                : code === "SC_INVITE_ROOM_BUSY"
                  ? "Finish your current match first"
                  : code === "ACCOUNT_REQUIRED" || code === "AUTH_REQUIRED"
                    ? "Sign in with a full account to play private matches"
                    : "Could not send the invite",
      );
    }
    setInviting(false);
  };

  const handleUnfriend = async () => {
    if (!friendshipId || !onRemoveFriend) return;
    try {
      await onRemoveFriend(friendshipId);
      toast.success("Friend removed");
    } catch {
      toast.error("Failed to remove friend");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canInviteToStatCheck && (
            <DropdownMenuItem
              data-testid="invite-to-stat-check"
              disabled={inviting}
              onClick={handleInvite}
            >
              <Swords className="h-4 w-4 mr-2" />
              {inviting ? "Sending invite..." : "Invite to Stat Check"}
            </DropdownMenuItem>
          )}
          {friendshipId && onRemoveFriend && (
            <DropdownMenuItem onClick={handleUnfriend} className="text-destructive focus:text-destructive">
              <UserX className="h-4 w-4 mr-2" /> Unfriend
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setShowReport(true)}>
            <Flag className="h-4 w-4 mr-2" /> Report
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowBlock(true)} className="text-destructive focus:text-destructive">
            <Ban className="h-4 w-4 mr-2" /> Block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Report Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Report {targetName}</DialogTitle>
            <DialogDescription>Why are you reporting this user?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReportReason(r.value)}
                  className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                    reportReason === r.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Additional details (optional)..."
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              className="text-sm"
              rows={3}
            />
            <Button onClick={handleReport} disabled={submitting} className="w-full">
              {submitting ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block Confirmation Dialog */}
      <Dialog open={showBlock} onOpenChange={setShowBlock}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Block {targetName}?</DialogTitle>
            <DialogDescription>
              They won't be able to see your profile, send you friend requests, or interact with you. 
              Any existing friendship will be removed. You can unblock them later from Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowBlock(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBlock} disabled={submitting} className="flex-1">
              {submitting ? "Blocking..." : "Block"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
