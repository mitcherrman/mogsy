import LegalLayout, { Section, Bullets } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";

export default function About() {
  return (
    <LegalLayout
      title={`About ${SITE_NAME} — Community-Driven Gaming Platform`}
      description={`${SITE_NAME} is a community platform for ranking games, quizzes, competitions, and gaming content — including League of Legends tools.`}
      path="/about"
      heading={`About ${SITE_NAME}`}
      intro="Mogzy is a community-driven platform built around competition, ranking, and gaming culture."
      keywords="mogsy, ranking games, gaming community, league of legends tools, quiz games"
    >
      <Section title="What Mogzy is">
        <p>
          Mogzy brings gamers together through interactive ranking games, quizzes,
          live competitions, and curated gaming content. Players can compare opinions,
          climb leaderboards, and test their knowledge in a friendly, competitive space.
        </p>
        <Bullets
          items={[
            "Ranking games — vote, compare, and shape community leaderboards",
            "Quiz games — test your knowledge across gaming topics",
            "Community competitions — multiplayer modes and recurring events",
            "Gaming content — guides, tier lists, and curated picks",
            "League of Legends tools — champion tier lists, combat lab, and quizzes",
            "Future social and community features — friend systems, custom leagues, and more",
          ]}
        />
      </Section>

      <Section title="Our mission">
        <p className="italic text-foreground/90">
          “Create fun, competitive, and educational experiences for gamers and
          online communities.”
        </p>
        <p>
          Every feature on Mogzy is designed to celebrate gaming culture while
          giving players new ways to express their opinions, sharpen their
          knowledge, and connect with others.
        </p>
      </Section>

      <Section title="Current features">
        <Bullets
          items={[
            "Preset and user-created ranking leagues with global Aura scores",
            "League Quiz with progression, achievements, and diagnostics",
            "Combat Lab for League of Legends matchup exploration",
            "Multiplayer modes including Draft Duel, Hot Streak, and Siege",
            "Public profiles, comments, and community-led moderation",
          ]}
        />
      </Section>

      <Section title="What’s next">
        <Bullets
          items={[
            "Deeper social features — friend feeds, party play, and reactions",
            "Expanded League of Legends data, builds, and meta tracking",
            "More multiplayer modes and seasonal community events",
            "Creator tools for building and sharing custom leagues and quizzes",
          ]}
        />
      </Section>
    </LegalLayout>
  );
}