// ---------------------------------------------------------------------------
// PasswordField — one password input with a reveal toggle.
//
// AUTH2 replaces "Confirm password" on the two ACCOUNT-CREATION surfaces with
// this. The reasoning, kept here because deleting a conventional field deserves
// a written reason:
//
//   - A confirmation field exists to catch a typo. It only does so for people
//     TYPING the password twice; a password manager fills both fields with the
//     same value, so for those users it catches nothing and costs a field.
//   - The failure it guards against is already fully recoverable: the account
//     is created with a verified email, and "Forgot password?" is one click on
//     the same page. A typo'd password is a 20-second detour, not a lockout.
//   - The guard was inconsistent anyway. The EMAIL is typed once, with no
//     confirmation, and a typo'd email is the case that actually strands
//     someone. Doubling only the password protected the recoverable half.
//   - Revealing the password lets the user verify what they typed DIRECTLY,
//     which is strictly more information than typing it twice and being told
//     the two blobs of dots disagree.
//
// Where a confirmation still earns its place, it is kept: Settings → change
// password and /reset-password both re-establish a credential for an account
// the user is ALREADY holding, where a silent typo locks out a live session
// rather than a brand-new one. `validateNewPassword` still takes its optional
// `confirm` argument for exactly those surfaces.
//
// The toggle is `type="button"` so it can never submit the form, and it is
// labelled for screen readers rather than relying on the icon alone.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** "new-password" while creating, "current-password" while signing in. */
  autoComplete: "new-password" | "current-password";
  minLength?: number;
  required?: boolean;
  "data-testid"?: string;
  /** Rendered to the right of the label (e.g. a "Forgot password?" link). */
  labelAction?: React.ReactNode;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required = true,
  labelAction,
  ...rest
}: Props) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="pr-11"
          data-testid={rest["data-testid"]}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          // Not in the tab order: it is a convenience, and keeping it out keeps
          // Tab going straight from the password to the submit button.
          tabIndex={-1}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
