import LegalLayout, { Section, Bullets } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";

export default function About() {
  return (
    <LegalLayout
      title={`About ${SITE_NAME} — League of Legends Knowledge & Training`}
      description={`${SITE_NAME} is a League of Legends knowledge and training platform for quizzes, combat simulation, reference data, and professional-play exploration.`}
      path="/about"
      heading={`About ${SITE_NAME}`}
      intro="Mogzy is a League of Legends knowledge and training platform built to help players study the game, test what they know, and explore the systems behind it."
      keywords="mogzy, league of legends quiz, league of legends knowledge, combat simulation, pro play, league reference"
    >
      <Section title="What Mogzy is">
        <p>
          Mogzy brings League learning, practice, reference material, and analysis
          into one place. The Academy is organized around four primary destinations:
          Leaguecraft, Combat Simulation, Mogzy Archives, and Pro Play.
        </p>
        <Bullets
          items={[
            "Leaguecraft — quizzes, Daily Challenge, practice, progression, review, and personal history",
            "Combat Simulation — explore League combat interactions and compare outcomes in a controlled sandbox",
            "Mogzy Archives — browse champions, items, mechanics, glossary entries, patch information, and reference data",
            "Pro Play — explore professional players, teams, champions, tournaments, matches, and pro-focused quiz content",
          ]}
        />
      </Section>

      <Section title="Our mission">
        <p className="italic text-foreground/90">
          “Make learning League of Legends as engaging as playing it.”
        </p>
        <p>
          League changes constantly and contains an enormous amount of mechanical,
          strategic, and competitive knowledge. Mogzy turns that knowledge into
          interactive ways to study, practice, investigate, and measure what you know.
        </p>
      </Section>

      <Section title="Built around League knowledge">
        <Bullets
          items={[
            "Knowledge challenges spanning champions, items, runes, mechanics, and professional play",
            "Progression and history that help players understand their performance over time",
            "Reference pages backed by structured League and professional-play data",
            "Combat tools for examining interactions rather than relying on static tier-list claims",
            "Patch and professional-play surfaces for following how the game and competitive scene change",
          ]}
        />
      </Section>

      <Section title="Independent fan project">
        <p>
          Mogzy is an independent League of Legends fan project. It is not endorsed
          by Riot Games and does not represent Riot Games or the organizations,
          teams, or players covered by its reference and professional-play features.
        </p>
      </Section>
    </LegalLayout>
  );
}