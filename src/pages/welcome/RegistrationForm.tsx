import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";

import {
  LEAGUE_RANKS,
  USERNAME_MAX,
  validateUsername,
  type LeagueRankId,
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
 * TWO FIELDS (HI1-C5B). The first pass also carried an optional password and a
 * checkbox recording an intent to link Riot, Discord or email later. Both are
 * removed rather than hidden: a password with nothing to authenticate against
 * and a checkbox with no Verify page behind it were UI for an account this
 * screen does not make. Both belong to the Verify experience, where they can be
 * true. What is left is exactly what the product will actually use — a name and
 * a self-reported rank, both of which become real profile columns.
 *
 * WHAT IS REQUIRED, AND WHAT REQUIRED MEANS HERE. Both fields are required, and
 * this page genuinely gates the introduction: the tome's own Next is suppressed
 * while it is up, and until it is answered the rail carries no exit either (see
 * AcademyWelcomePage). The escape hatch that IS offered is Sign In, for someone
 * who already has an account — it lives below this form and arrives after it.
 *
 * VALIDATION IS SHOWN, NEVER SHOUTED. Nothing is marked wrong until the visitor
 * has tried to submit; after that a field re-validates as it is edited, so an
 * error disappears the moment it stops being true. Errors are one sentence,
 * next to the rule that caused them, and they are wired with `aria-describedby`
 * and `aria-invalid` so a screen reader gets them at the field rather than as
 * an announcement about a page.
 */

export interface RegistrationValue {
  username: string;
  rank: LeagueRankId | "";
}

export default function RegistrationForm({
  value,
  onChange,
  onSubmit,
}: {
  value: RegistrationValue;
  onChange: (next: RegistrationValue) => void;
  /** Called only with a valid registration. The page owns what happens next. */
  onSubmit: (value: { username: string; rank: LeagueRankId }) => void;
}) {
  const ids = useId();
  const nameId = `${ids}-name`;
  const rankId = `${ids}-rank`;

  // Nothing is wrong until they have said they are done. After that, every
  // keystroke re-checks, so a corrected field stops being red immediately.
  const [submitted, setSubmitted] = useState(false);

  const nameCheck = validateUsername(value.username);
  const rankMissing = value.rank === "";

  const nameError = submitted && !nameCheck.ok ? nameCheck.error : undefined;
  const rankError = submitted && rankMissing ? "Pick a rank — Unranked counts." : undefined;

  const set = (patch: Partial<RegistrationValue>) => onChange({ ...value, ...patch });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!nameCheck.ok || rankMissing) return;
    onSubmit({
      // Normalised on the way out: this name is printed back at the visitor AND
      // written to profiles.display_name, so it is the trimmed one.
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
          {/* Says what the control is FOR, not where its owner lives. A native
              select's first option is the only placeholder it has, so this
              line is doing the job `placeholder` does on the name field.
              Carried over from HI1-C6, which never reached main. */}
          <option value="">Select your rank in League of Legends</option>
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

      <button type="submit" className="tome-submit" data-testid="academy-registration-submit">
        <span>Enter the register</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}
