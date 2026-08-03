// ---------------------------------------------------------------------------
// Enable / disable a bot persona — the Phase A removal mechanism.
//
// Disabling is the normal way to retire a demo bot. It is fully reversible and
// destroys nothing: the profile, its friendships, its audit history and every
// historical reference survive. There is deliberately no delete control here.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminUpdateBotProfile } from "@/lib/admin/admin-users";

interface Props {
  profileId: string;
  isDisabled: boolean;
  onChanged?: () => void;
}

export function BotStateToggle({ profileId, isDisabled, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await adminUpdateBotProfile({ profileId, isDisabled: !isDisabled });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.code === "not_a_bot"
          ? "That profile is not a bot."
          : "Couldn't change the bot state.",
      );
      return;
    }
    onChanged?.();
  };

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={busy}
        data-testid={`bot-toggle-${profileId}`}
        onClick={() => void run()}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : isDisabled ? (
          <Power className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <PowerOff className="h-3.5 w-3.5" aria-hidden />
        )}
        {isDisabled ? "Re-enable bot" : "Disable bot"}
      </Button>
      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default BotStateToggle;
