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
      updated="2026-07-10"
      keywords="terms of service, user agreement, mogsy terms"
    >
      <Section title="Eligibility">
        <p>
          You must be at least 13 years old to use Mogsy. By creating an
          account or otherwise using the platform, you confirm that you meet
          this age requirement.
        </p>
      </Section>

      <Section title="User responsibilities">
        <p>To keep Mogsy fair and welcoming, you agree not to engage in:</p>
        <Bullets
          items={[
            "Harassment, threats, or targeted intimidation of other users",
            "Hate speech, slurs, or discriminatory content",
            "Cheating, exploits, or attempts to manipulate game outcomes",
            "Vote manipulation, including coordinated brigading or sockpuppeting",
            "Automated abuse, including bots, scrapers, or scripted interactions",
            "Spam, advertising, or repetitive low-value content",
            "Account sharing for the purpose of exploiting features, rewards, or rankings",
            "Malicious activity, including attempts to compromise other accounts or our systems",
          ]}
        />
      </Section>

      <Section title="Content you submit">
        <p>
          You are responsible for content you post on Mogsy, including
          comments, profile information, and submissions. You grant Mogsy a
          non-exclusive license to display and distribute that content as part
          of operating the platform.
        </p>
      </Section>

      <Section title="Platform rights">
        <p>Mogsy reserves the right to:</p>
        <Bullets
          items={[
            "Suspend or terminate accounts that violate these terms",
            "Remove content that breaks our rules or harms the community",
            "Modify, add, or remove features at any time",
            "Take reasonable action to prevent abuse and protect users",
          ]}
        />
      </Section>

      <Section title="Fan content disclaimer">
        <p>
          Mogsy is an unofficial fan project. Mogsy isn't endorsed by Riot
          Games and doesn't reflect the views or opinions of Riot Games or
          anyone officially involved in producing or managing Riot Games
          properties. Riot Games, League of Legends, and all associated
          properties are trademarks or registered trademarks of Riot Games,
          Inc. Game data and imagery referenced by Mogsy are used for
          informational and educational purposes under Riot Games'{" "}
          <a
            href="https://www.riotgames.com/en/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Legal Jibber Jabber
          </a>{" "}
          fan content policy.
        </p>
      </Section>

      <Section title="Disclaimer of warranties">
        <p>
          Mogsy is provided “as is” and “as available” without warranties of
          any kind, whether express or implied. We do not guarantee that the
          platform will be uninterrupted, error-free, or completely secure.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Mogsy and its operators are
          not liable for indirect, incidental, special, consequential, or
          punitive damages arising from your use of the platform.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          We may update these terms from time to time. Continued use of Mogsy
          after changes take effect constitutes acceptance of the updated
          terms.
        </p>
      </Section>
    </LegalLayout>
  );
}