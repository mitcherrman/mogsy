/**
 * WHAT RANKED SCORING IS, IN THE PLAYER'S WORDS.
 *
 * THIS FILE COMPUTES NOTHING. Every number below is a LABEL describing the
 * backend's scoring, which is authoritative and already shipped (RP1). There
 * is no arithmetic here, nothing derived from a match, and nothing that any
 * scoring path reads — the arena's live awards come from the settlement
 * payload through `lib/ranked-core/pointsFeedback`, and always will. If the
 * backend's scoring ever changes, this copy changes with it and
 * `RANKED_RULES_VERSION` is bumped; the reverse never happens.
 *
 * THE ONE SENTENCE THAT MUST NOT BE SIMPLIFIED. A multi-question module's
 * speed bonus requires a PERFECT module and finishing first. "Finish first for
 * +1" is a shorter sentence and a false one — 4/5 answered first earns 4, not
 * 5. So the multi-question block states both halves of the condition in the
 * row itself, and then says the failure case out loud underneath, because that
 * is the part a player is most likely to guess wrong.
 *
 * There is no separate perfect bonus, and nothing here may imply one: a
 * perfect module earns one point per correct answer, and perfection is only
 * ever a QUALIFIER on the speed bonus.
 *
 * The vocabulary matches what the arena says on settlement — CORRECT, FIRST,
 * FINISHED FIRST — so the scroll and the match use one language.
 */

function Section({ heading, children }:
{ heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b5220]">
        {heading}
      </h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Row({ label, award }: { label: string; award: string }) {
  return (
    <div className="mogzy-scroll-row text-[13px] leading-snug">
      <span>{label}</span>
      <span className="mogzy-scroll-award">{award}</span>
    </div>
  );
}

export function RankedRulesContent() {
  return (
    <div data-testid="ranked-rules-content">
      <Section heading="Knowledge earns points">
        <Row label="Correct answer" award="+2" />
        <Row label="Hard question" award="+3" />
      </Section>

      <Section heading="Speed can add one">
        <Row label="Correct, and first to answer" award="+1" />
      </Section>

      <Section heading="Multi-question modules">
        <Row label="Each correct answer" award="+1" />
        <Row label="Perfect module, and first to finish" award="+1" />
        {/* The false-simplification guard, stated as the case it rules out. */}
        <p className="mt-1.5 text-[11px] leading-snug text-[#5a4622]">
          Miss one and there is no speed bonus, however fast you were.
        </p>
      </Section>

      <Section heading="10 modules">
        <p className="text-[13px] leading-snug">
          Highest score wins. An equal score is a draw.
        </p>
      </Section>
    </div>
  );
}
