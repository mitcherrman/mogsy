// OWN1.1 — the one place a per-action MFA prompt renders. Mounted once in
// App; sensitive actions call requestOwnerStepUp() (via runOwnerAction) and
// this dialog resolves it. The admin page underneath stays mounted.
import { useEffect, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OwnerStepUp } from "@/components/admin/OwnerStepUp";
import { refreshOwnerSession } from "@/lib/admin-auth/ownerSession";
import {
  getPendingOwnerStepUp,
  registerOwnerStepUpHost,
  settleOwnerStepUp,
  subscribeOwnerStepUp,
} from "@/lib/admin-auth/ownerStepUpRequest";

export function OwnerStepUpHost() {
  const pending = useSyncExternalStore(subscribeOwnerStepUp, getPendingOwnerStepUp, getPendingOwnerStepUp);
  useEffect(() => registerOwnerStepUpHost(), []);

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && settleOwnerStepUp(false)}>
      <DialogContent className="max-w-sm p-4" data-testid="owner-step-up-dialog">
        <DialogTitle className="sr-only">Verify it&apos;s you</DialogTitle>
        <DialogDescription className="sr-only">{pending?.reason ?? ""}</DialogDescription>
        {pending && (
          <OwnerStepUp
            embedded
            offerTrust={false}
            title="Verify it's you"
            description={`${pending.reason} needs a fresh check. Enter the code from your authenticator app.`}
            onVerified={() => {
              void refreshOwnerSession().finally(() => settleOwnerStepUp(true));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
