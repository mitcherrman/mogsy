import LegalLayout, { Section, Bullets } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <LegalLayout
      title={`Privacy Policy — ${SITE_NAME}`}
      description={`How ${SITE_NAME} collects, uses, retains, and protects your personal information.`}
      path="/privacy"
      heading="Privacy Policy"
      intro={`This policy explains how ${SITE_NAME} handles your information when you use our platform.`}
      updated="2026-10-07"
      keywords="privacy policy, data protection, mogzy privacy, gdpr"
    >
      <Section title="Information we collect">
        <p>We collect information needed to operate and improve Mogzy.</p>
        <p className="font-medium text-foreground">Account and profile information</p>
        <Bullets items={[
          "Account identifiers and email address used for sign-in",
          "Profile information and preferences you choose to provide",
          "Subscription or entitlement status when applicable",
        ]} />
        <p className="font-medium text-foreground">Learning and gameplay information</p>
        <Bullets items={[
          "Quiz answers, scores, timing, question history, and progression",
          "Daily Challenge, Ranked, Practice, review, and related learning activity",
          "Combat Simulation inputs and results when they are saved or associated with platform activity",
          "Reports, feedback, and other information you choose to submit",
        ]} />
        <p className="font-medium text-foreground">Technical and usage information</p>
        <Bullets items={[
          "Page views, feature usage, interactions, and performance or reliability metrics",
          "Device and browser information such as browser type, operating system, viewport, and language",
          "Cookies, local storage, session identifiers, and similar technologies used for authentication, preferences, analytics, security, and abuse prevention",
        ]} />
      </Section>

      <Section title="How we use your information">
        <Bullets items={[
          "Provide sign-in, profiles, settings, subscriptions, and other account functionality",
          "Run Leaguecraft activities and maintain scores, progression, history, review, and personal statistics",
          "Operate and improve Combat Simulation, Archives, Pro Play, and other Mogzy features",
          "Measure feature usage and platform performance using aggregated analytics",
          "Detect and prevent fraud, abuse, cheating, automated misuse, and security threats",
          "Respond to support, feedback, privacy, and security requests",
          "Communicate important account or service updates",
        ]} />
        <p>We do not sell your personal information.</p>
      </Section>

      <Section title="Service providers">
        <p>We use third-party providers to operate parts of {SITE_NAME}, including:</p>
        <Bullets items={[
          "Supabase — database and authentication infrastructure",
          "Stripe — payment processing for paid features; Mogzy does not store full payment-card numbers",
          "Hosting and application infrastructure providers used to serve Mogzy and its APIs",
          "Analytics or advertising providers when those services are enabled",
        ]} />
      </Section>

      <Section title="Cookies and local storage">
        <p>
          Mogzy uses cookies and local browser storage for sign-in, preferences,
          feature state, analytics, security, and reliability. Third-party services
          may use their own storage technologies subject to their policies. Clearing
          browser storage may sign you out or reset local preferences and progress
          that has not been associated with an account.
        </p>
      </Section>

      <Section title="Advertising">
        <p>
          Mogzy may display advertising to eligible users. If third-party advertising
          or personalized advertising is enabled, we will use applicable consent and
          privacy controls where required by law. Advertising providers may process
          technical or usage information according to their own policies.
        </p>
        <p>
          Where applicable, you may use the privacy choices provided by the
          advertising provider, your browser or device, or contact us to exercise
          rights available in your jurisdiction.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We retain information for as long as reasonably necessary to provide the
          service, maintain legitimate records, protect the platform, and meet legal
          obligations. Retention periods can vary by data type. When information is
          no longer needed, it may be deleted or de-identified. Aggregated or
          de-identified statistics may be retained for analysis.
        </p>
      </Section>

      <Section title="Your rights">
        <Bullets items={[
          "Access — request information about personal data we hold about you",
          "Correction — ask us to correct inaccurate personal information",
          "Deletion — request deletion where applicable",
          "Objection or restriction — object to or restrict certain processing where applicable",
          "Portability — request a portable copy where applicable",
        ]} />
        <p>
          Rights vary by jurisdiction. To make a request, use our{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">contact page</Link>.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Mogzy is not intended for children under 13. If we learn that we have
          collected personal information from a child under 13, we will take
          appropriate steps to delete it.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update this policy as Mogzy changes. The date above identifies the
          latest revision. Questions or privacy requests can be submitted through our{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">contact page</Link>.
        </p>
      </Section>
    </LegalLayout>
  );
}