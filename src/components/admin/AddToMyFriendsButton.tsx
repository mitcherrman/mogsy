// ---------------------------------------------------------------------------
// "Add to My Friends" — the master-admin action that links a selected profile
// to the admin's own Community friends.
//
// The button carries NO authority. It sends one profile id to
// `admin_link_friendship`, which derives the actor from `auth.uid()`, re-checks
// master_admin, blocks, self, and existing state server-side, and writes its own
// audit row. Every outcome the RPC can return is rendered as its own message,
// so "already friends" never masquerades as "created" and a failure never
// renders as a success.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminLinkFriendship,
  LINK_FRIENDSHIP_MESSAGES,
  type LinkFriendshipResult,
} from "@/lib/admin/admin-users";

interface Props {
  targetProfileId: string;
  targetName: string;
  /** Disabled bots cannot be linked; the RPC refuses them too. */
  disabled?: boolean;
  /** Called after any completed attempt so callers can refresh their views. */
  onCompleted?: (result: LinkFriendshipResult) => void;
}

export function AddToMyFriendsButton({
  targetProfileId,
  targetName,
  disabled,
  onCompleted,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LinkFriendshipResult | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await adminLinkFriendship(targetProfileId);
    setBusy(false);
    setConfirmOpen(false);
    setResult(outcome);
    onCompleted?.(outcome);
  };

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={disabled || busy}
        data-testid={`add-friend-${targetProfileId}`}
        onClick={() => setConfirmOpen(true)}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
        )}
        Add to My Friends
      </Button>

      {result && (
        <p
          role="status"
          data-testid={`add-friend-result-${targetProfileId}`}
          className={
            result.ok
              ? "text-[11px] text-emerald-600 dark:text-emerald-400"
              : "text-[11px] text-destructive"
          }
        >
          {LINK_FRIENDSHIP_MESSAGES[result.code]}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="add-friend-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Add {targetName} to your friends?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates an accepted friendship between your own profile and{" "}
              {targetName} straight away. No friend request is sent and neither of
              you receives a notification. You can remove it later from your
              friends drawer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              data-testid="add-friend-confirm-accept"
              onClick={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              {busy ? "Adding…" : "Add to My Friends"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AddToMyFriendsButton;
