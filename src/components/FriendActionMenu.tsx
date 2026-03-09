import { useState } from "react";
import { MoreHorizontal, Flag, Ban, UserX } from "lucide-react";
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

interface FriendActionMenuProps {
  targetProfileId: string;
  targetName: string;
  friendshipId?: string;
  onRemoveFriend?: (friendshipId: string) => Promise<void>;
  onBlocked?: () => void;
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
}: FriendActionMenuProps) {
  const { blockUser } = useBlocks();
  const { reportUser } = useReportUser();
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReport = async () => {
    setSubmitting(true);
    try {
      await reportUser(targetProfileId, reportReason, reportDetails || undefined);
      toast.success("Report submitted. We'll review it shortly.");
      setShowReport(false);
      setReportDetails("");
    } catch {
      toast.error("Failed to submit report");
    }
    setSubmitting(false);
  };

  const handleBlock = async () => {
    setSubmitting(true);
    try {
      await blockUser(targetProfileId);
      toast.success(`${targetName} has been blocked`);
      setShowBlock(false);
      onBlocked?.();
    } catch {
      toast.error("Failed to block user");
    }
    setSubmitting(false);
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
        <DropdownMenuContent align="end" className="w-44">
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
