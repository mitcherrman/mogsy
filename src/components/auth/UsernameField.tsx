// ---------------------------------------------------------------------------
// UsernameField — the public Mogzy name, on every account-creation surface.
//
// AUTH3. Signup is an IDENTITY moment, not only an auth one: the thing a person
// is actually creating is the name other players will see on the leaderboard,
// in Ranked, and on their profile. Collecting it here is what lets Mogzy stop
// shipping accounts called 'Anonymous5472' and accounts called '' — and, for
// anyone who already answered "what should we call you?" at /welcome, it is
// PREFILLED, so answering once is answering.
//
// ONE FIELD, TWO SURFACES. /auth's signup form and the guest AccountUpgrade
// panel both render this, so the label, the rules, the hint and the error copy
// cannot drift between "create an account" and "save your progress" — which
// are the same act reached from two places.
//
// VALIDATION IS SHOWN, NEVER SHOUTED. Nothing is marked wrong until the user
// has tried to submit, after which the field re-validates as it is edited so a
// corrected name stops being red immediately. This is the same posture the
// Welcome register already uses, deliberately: the two screens ask the same
// question and should feel like it.
//
// The error slot also carries SERVER answers ("That username is already
// taken."), which is why `error` is a prop rather than derived here. Only the
// database can know that, and it can only know it at the moment of writing.
// ---------------------------------------------------------------------------

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USERNAME_MAX, usernameProblem, USERNAME_MESSAGES } from "@/lib/identity/username";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * True once the user has tried to submit. Before that the field stays quiet
   * even while it is technically invalid — an empty field the user has not
   * reached yet is not a mistake.
   */
  submitted: boolean;
  /**
   * A server-side refusal (taken, or anything the database disagreed with us
   * about). Outranks the local check: it is newer and more authoritative.
   */
  error?: string | null;
  /**
   * Whether the value arrived prefilled from an identity the user already
   * chose. Only changes the hint — the field is always editable, because the
   * moment before an account exists is the cheapest possible time to fix a
   * typo, and AUTH3 does not charge for fixing typos later either.
   */
  carriedForward?: boolean;
  disabled?: boolean;
  "data-testid"?: string;
}

export default function UsernameField({
  id,
  value,
  onChange,
  submitted,
  error,
  carriedForward = false,
  disabled,
  "data-testid": testId,
}: Props) {
  const localProblem = submitted ? usernameProblem(value) : null;
  const shown = error ?? (localProblem ? USERNAME_MESSAGES[localProblem] : null);
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Username</Label>
      <Input
        id={id}
        type="text"
        placeholder="What should we call you?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={USERNAME_MAX}
        // "nickname", not "username": the browser's username token is an
        // account handle it will offer to pair with a password, and this is a
        // public display name that has nothing to do with signing in.
        autoComplete="nickname"
        autoCapitalize="words"
        spellCheck={false}
        required
        disabled={disabled}
        aria-invalid={shown ? "true" : undefined}
        aria-describedby={shown ? errorId : `${id}-hint`}
        data-testid={testId}
      />
      {shown ? (
        <p className="text-sm text-destructive" role="alert" id={errorId} data-testid={`${testId ?? id}-error`}>
          {shown}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground" id={`${id}-hint`}>
          {carriedForward
            ? "This is the name you chose — change it now if you'd like."
            : "This is how other players will see you. You can change it later."}
        </p>
      )}
    </div>
  );
}
