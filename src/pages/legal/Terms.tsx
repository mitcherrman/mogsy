import LegalLayout, { Section, Bullets } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";

export default function Terms() {
  return (
    <LegalLayout
      title={`Terms of Service — ${SITE_NAME}`}
      description={`The rules and responsibilities for using ${SITE_NAME}.`}
      path="/terms"
      heading="Terms of Service"
      intro={`By using ${SITE_NAME}, you agree to these terms.`}
      updated="2026-10-07"
      keywords="terms of service, user agreement, mogzy terms"
    >
      <Section title="Eligibility">
        <p>
          You must be at least 13 years old to use Mogzy. By creating an account
          or otherwise using the platform, you confirm that you meet this requirement.
        </p>
      </Section>

      <Section title="Using Mogzy">
        <p>
          Mogzy provides League of Legends learning, quiz, simulation, reference,
          and professional-play features. Some features may require an account or
          paid access, and features may change as the game and platform evolve.
        </p>
      </Section>

      <Section title="User responsibilities">
        <p>You agree not to misuse Mogzy or interfere with other users or the service, including through:</p>
        <Bullets items={[
          "Harassment, threats, hate speech, or targeted abuse",
          "Cheating, exploits, or attempts to falsify or manipulate scores, progression, or results",
          "Automated abuse, excessive scraping, bots, or scripted interactions that violate platform controls",
          "Spam, deceptive submissions, or malicious reports",
          "Unauthorized access or attempts to compromise accounts, data, APIs, or platform infrastructure",
          "Account sharing or other activity intended to bypass access, entitlement, rate-limit, or integrity controls",
        ]} />
      </Section>

      <Section title="Content and information you submit">
        <p>
          You are responsible for information and content you submit to Mogzy,
          including profile information, feedback, reports, and other submissions.
          You grant Mogzy the rights reasonably necessary to host, process, display,
          and use that material to operate and improve the service.
        </p>
      </Section>

      <Section title="League data and educational results">
        <p>
          Mogzy's quizzes, simulations, reference material, statistics, and
          professional-play information are provided for informational and
          educational purposes. League of Legends changes over time, and data or
          calculations may become outdated, incomplete, or incorrect. You should
          verify information that is important to a decision you make outside Mogzy.
        </p>
      </Section>

      <Section title="Platform rights">
        <p>Mogzy may:</p>
        <Bullets items={[
          "Suspend or terminate access that violates these terms or threatens the platform",
          "Remove or restrict content or activity that violates our rules",
          "Apply technical controls to protect service integrity and prevent abuse",
          "Modify, add, retire, or replace features as Mogzy evolves",
        ]} />
      </Section>

      <Section title="Fan content disclaimer">
        <p>
          Mogzy is an unofficial fan project. Mogzy isn't endorsed by Riot Games
          and doesn't reflect the views or opinions of Riot Games or anyone
          officially involved in producing or managing Riot Games properties.
          Riot Games, League of Legends, and associated properties are trademarks
          or registered trademarks of Riot Games, Inc.
        </p>
      </Section>

      <Section title="Disclaimer of warranties">
        <p>
          Mogzy is provided “as is” and “as available” without warranties of any
          kind, whether express or implied. We do not guarantee that the platform,
          its data, or its calculations will always be available, complete, current,
          accurate, or error-free.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Mogzy and its operators are not
          liable for indirect, incidental, special, consequential, or punitive
          damages arising from your use of the platform.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          We may update these terms as Mogzy changes. The date above identifies
          the latest revision. Continued use after updated terms take effect
          constitutes acceptance of the updated terms.
        </p>
      </Section>
    </LegalLayout>
  );
}