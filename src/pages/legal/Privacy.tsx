import LegalLayout, { Section, Bullets } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <LegalLayout
      title={`Privacy Policy â€” ${SITE_NAME}`}
      description={`How ${SITE_NAME} collects, uses, retains, and protects your personal information.`}
      path="/privacy"
      heading="Privacy Policy"
      intro={`This policy explains how ${SITE_NAME} handles your information when you use our platform.`}
      updated="2026-07-10"
      keywords="privacy policy, data protection, mogsy privacy, gdpr"
    >
      <Section title="Information we collect">
        <p>We collect the minimum information needed to operate Mogzy:</p>
        <p className="font-medium text-foreground">Account information</p>
        <Bullets
          items={[
            "Username",
            "Email address",
            "Profile data you choose to provide (display name, avatar, theme, favorites)",
          ]}
        />
        <p className="font-medium text-foreground">Gameplay data</p>
        <Bullets
          items={[
            "Rankings and Aura scores",
            "Match results and swipe history",
            "Quiz progress, scores, and unlocked achievements",
            "Community participation such as comments, reports, and friend activity",
          ]}
        />
        <p className="font-medium text-foreground">Technical data</p>
        <Bullets
          items={[
            "Analytics data (page views, feature usage, performance metrics)",
            "Device and browser information (type, OS, viewport, language)",
            "Cookies and similar local storage used for sessions and preferences",
          ]}
        />
      </Section>

      <Section title="How we use your information">
        <Bullets
          items={[
            "Provide core account functionality (sign-in, profile, settings)",
            "Power leaderboards and rankings across preset and user leagues",
            "Track quiz progression, achievements, and personal stats",
            "Improve the platform through aggregated usage analytics",
            "Detect and prevent fraud, abuse, vote manipulation, and cheating",
            "Communicate important account or service updates",
          ]}
        />
        <p>We do not sell your personal information.</p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          Mogzy uses cookies and local browser storage to keep you signed in,
          remember your theme and preferences, and measure aggregate usage of
          the platform. Third-party services (such as advertising and analytics
          providers) may set their own cookies subject to their own policies.
          You can clear cookies in your browser at any time, though this may
          sign you out and reset preferences.
        </p>
      </Section>

      <Section title="Advertising">
        <p>
          Mogzy may display advertising, including ads served by Google AdSense.
          Advertising partners may use cookies or similar technologies to serve
          ads based on your prior visits to this or other websites. Google's use
          of advertising cookies enables it and its partners to serve ads based
          on your visits to Mogzy and/or other sites on the internet. You may
          opt out of personalized advertising by visiting{" "}
          <a
            href="https://www.google.com/settings/ads"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Google Ads Settings
          </a>
          . Where required, we show non-personalized ads or request consent
          before personalized ads are served.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We retain account and gameplay data for as long as your account is
          active. If you delete your account, we remove or anonymize personal
          information within a reasonable period, except where retention is
          required for legal, security, or fraud-prevention reasons. Aggregated
          and anonymized statistics may be retained indefinitely.
        </p>
      </Section>

      <Section title="Your rights">
        <Bullets
          items={[
            "Access â€” request a copy of the personal data we hold about you",
            "Correction â€” update inaccurate or incomplete information",
            "Deletion â€” request removal of your account and associated data",
            "Objection â€” opt out of certain processing where applicable",
            "Portability â€” receive your data in a portable format",
          ]}
        />
        <p>
          To exercise any of these rights, please reach out through our{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
            contact page
          </Link>
          .
        </p>
      </Section>

      <Section title="Children">
        <p>
          Mogzy is not intended for users under the age of 13. If we learn that
          a child under 13 has created an account, we will remove the account
          and associated data.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Visit our{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
            contact page
          </Link>{" "}
          to get in touch.
        </p>
      </Section>
    </LegalLayout>
  );
}