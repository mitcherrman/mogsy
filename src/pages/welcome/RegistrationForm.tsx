import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";

import {
  LEAGUE_RANKS,
  USERNAME_MAX,
  validatePassword,
  validateUsername,
  type LeagueRankId,
  type RegistrationValue,
} from "@/lib/welcome/academy-registration";

/**
 * The Academy register — the introduction's one interactive page (HI1-C5).
 *
 * WRITTEN INTO THE BOOK, NOT DROPPED ONTO IT. There is no card, no panel and no
 * boxed input anywhere below. Each field is a RULED LINE on the parchment with
 * its label set in the same gilt small caps the chapter eyebrows use, and the
 * text sits on the rule in the tome's own ink. The one filled control on the
 * page is the button that turns the page, which is styled as the finale's
 * primary exit is styled, because it does the same kind of thing. The register
 * card on the facing page (ChapterPlate) fills in as this is filled in, so the
 * two pages are one act.
 *
 * WHAT IS REQUIRED, AND WHAT REQUIRED MEANS HERE. The name and the rank are
 * required; the password is not. "Required" governs this FORM — it does not
 * trap anyone in the introduction, because the rail's "Skip to the Academy"
 * remains a real exit from this page exactly as from every other, and Back
 * still re-reads the previous chapter. What it does mean is that the tome's own
 * Next is suppressed while this page is up: an impatient tap can finish the
 * writing but cannot turn past the register unanswered. See AcademyWelcomePage.
 *
 * VALIDATION IS SHOWN, NEVER SHOUTED. Nothing is marked wrong until the visitor
 * has tried to submit; after that a field re-validates as it is edited, so an
 * error disappears the moment it stops being true. Errors are one sentence,
 * next to the rule that caused them, and they are wired with `aria-describedby`
 * and `aria-invalid` so a screen reader gets them at the field rather than as
 * an announcement about a page.
 *
 * NO PASSWORD IS PERSISTED BY ANYTHING THIS FORM CALLS — see the note at the
 * top of lib/welcome/academy-registration.ts.
 */

export default function RegistrationForm({
  value,
  onChange,
  onSubmit,
}: {
  value: RegistrationValue;
  onChange: (next: RegistrationValue) => void;
  /** Called only with a valid registration. The page owns what happens next. */
  onSubmit: (value: RegistrationValue & { rank: LeagueRankId }) => void;
}) {
  const ids = useId();
  const nameId = `${ids}-name`;
  const rankId = `${ids}-rank`;
  const passwordId = `${ids}-password`;
  const linkId = `${ids}-link`;

  // Nothing is wrong until they have said they are done. After that, every
  // keystroke re-checks, so a corrected field stops being red immediately.
  const [submitted, setSubmitted] = useState(false);

  const nameCheck = validateUsername(value.username);
  const passwordCheck = validatePassword(value.password);
  const rankMissing = value.rank === "";

  const nameError = submitted && !nameCheck.ok ? nameCheck.error : undefined;
  const rankError = submitted && rankMissing ? "Pick a rank — Unranked counts." : undefined;
  const passwordError = submitted && !passwordCheck.ok ? passwordCheck.error : undefined;

  const set = (patch: Partial<RegistrationValue>) => onChange({ ...value, ...patch });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!nameCheck.ok || rankMissing || !passwordCheck.ok) return;
    onSubmit({
      ...value,
      // Normalised on the way out: the stored name is the one that gets printed
      // back at the visitor, so it is the trimmed one, not the typed one.
      username: nameCheck.value!,
      rank: value.rank as LeagueRankId,
    });
  };

  return (
    <form
      className="tome-form"
      data-testid="academy-registration-form"
      onSubmit={handleSubmit}
      // The scene is a giant "I'm ready" control (see AcademyWelcomePage). A
      // click inside the register is someone filling it in, not someone
      // hurrying the book along — the page checks for this marker and leaves
      // such clicks alone. Belt and braces with the button/input check there:
      // this covers the rules, the labels and the whitespace between them.
      data-tome-interactive="true"
      noValidate
    >
      <div className="tome-field" data-invalid={nameError ? "true" : "false"}>
        <label className="tome-field-label" htmlFor={nameId}>
          Name
        </label>
        <input
          id={nameId}
          name="username"
          type="text"
          className="tome-field-input"
          data-testid="academy-registration-username"
          value={value.username}
          onChange={(e) => set({ username: e.target.value })}
          maxLength={USERNAME_MAX}
          autoComplete="nickname"
          autoCapitalize="words"
          spellCheck={false}
          required
          aria-invalid={nameError ? "true" : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          placeholder="What should we call you?"
        />
        {nameError && (
          <p className="tome-field-error" id={`${nameId}-error`} data-testid="academy-registration-username-error">
            {nameError}
          </p>
        )}
      </div>

      <div className="tome-field" data-invalid={rankError ? "true" : "false"}>
        <label className="tome-field-label" htmlFor={rankId}>
          Rank
        </label>
        {/* A native select, deliberately. Twelve options on a phone is exactly
            what the platform picker is good at, it needs no portal above a
            book that is mid-page-turn, and it is the only control here that a
            visitor may meet with a hardware keyboard, a screen reader and a
            thumb in the same week. */}
        <select
          id={rankId}
          name="rank"
          className="tome-field-input tome-field-select"
          data-testid="academy-registration-rank"
          value={value.rank}
          onChange={(e) => set({ rank: e.target.value as LeagueRankId | "" })}
          required
          aria-invalid={rankError ? "true" : undefined}
          aria-describedby={rankError ? `${rankId}-error` : undefined}
        >
          <option value="">Where do you play?</option>
          {LEAGUE_RANKS.map((rank) => (
            <option key={rank.id} value={rank.id}>
              {rank.label}
            </option>
          ))}
        </select>
        {rankError && (
          <p className="tome-field-error" id={`${rankId}-error`} data-testid="academy-registration-rank-error">
            {rankError}
          </p>
        )}
      </div>

      <div className="tome-field" data-invalid={passwordError ? "true" : "false"}>
        <label className="tome-field-label" htmlFor={passwordId}>
          Password <span className="tome-field-optional">optional</span>
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          className="tome-field-input"
          data-testid="academy-registration-password"
          value={value.password}
          onChange={(e) => set({ password: e.target.value })}
          autoComplete="new-password"
          aria-invalid={passwordError ? "true" : undefined}
          aria-describedby={passwordError ? `${passwordId}-error` : undefined}
          placeholder="Leave blank to decide later"
        />
        {passwordError && (
          <p className="tome-field-error" id={`${passwordId}-error`} data-testid="academy-registration-password-error">
            {passwordError}
          </p>
        )}
      </div>

      {/* The linking intent. A real checkbox with a real label, under the
          password because that is the thing it is an alternative to. It
          promises a page, not a provider — nothing here contacts Riot, Discord
          or an email server, and nothing pretends to. */}
      <label className="tome-check" htmlFor={linkId}>
        <input
          id={linkId}
          name="wantsLinking"
          type="checkbox"
          className="tome-check-box"
          data-testid="academy-registration-link"
          checked={value.wantsLinking}
          onChange={(e) => set({ wantsLinking: e.target.checked })}
        />
        <span className="tome-check-copy">
          Optional — check to link Riot, Discord, or email for a bonus after.
        </span>
      </label>

      <button type="submit" className="tome-submit" data-testid="academy-registration-submit">
        <span>Enter the register</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}
