import LegalLayout, { Section, Bullets } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";
import { Link } from "react-router-dom";

export default function Security() {
  return (
    <LegalLayout
      title={`Security — ${SITE_NAME}`}
      description={`How ${SITE_NAME} protects user data and how to report security issues.`}
      path="/security"
      heading="Security at Mogzy"
      intro="We take reasonable measures to protect accounts, data, and the integrity of the platform. This page is maintained by the Mogzy team to answer common security questions."
      keywords="mogsy security, responsible disclosure, vulnerability reporting"
    >
      <Section title="Transport encryption">
        <p>
          All traffic to Mogzy is served over HTTPS using modern TLS. This
          protects credentials and gameplay data while in transit between your
          browser and our servers.
        </p>
      </Section>

      <Section title="Authentication">
        <p>
          Mogzy uses well-established authentication providers for account
          sign-in. Passwords are never stored in plaintext, and account
          sessions use signed, expiring tokens. Optional two-factor
          authentication is available where supported.
        </p>
      </Section>

      <Section title="Data protection">
        <Bullets
          items={[
            "Database access is scoped through row-level security policies",
            "Internal admin actions are gated by server-side role checks",
            "Uploaded images are validated for type and size before storage",
            "Sensitive operations are logged for auditing and abuse review",
          ]}
        />
        <p>
          This page describes controls currently enabled on the platform. It
          is not an independent certification or audit attestation.
        </p>
      </Section>

      <Section title="Responsible disclosure">
        <p>
          If you believe you’ve found a security vulnerability in Mogzy, we’d
          like to hear about it. Please follow these guidelines:
        </p>
        <Bullets
          items={[
            "Report the issue privately before sharing it publicly",
            "Provide steps to reproduce, affected URLs, and any relevant payloads",
            "Do not access, modify, or delete data that doesn’t belong to you",
            "Do not perform denial-of-service testing or social engineering",
            "Give us a reasonable window to investigate and remediate",
          ]}
        />
        <p>
          Send reports through our{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
            contact page
          </Link>{" "}
          and select the “Security report” topic. We acknowledge valid reports
          and will keep you informed as we work through a fix.
        </p>
      </Section>

      <Section title="Your role in security">
        <Bullets
          items={[
            "Use a strong, unique password for your Mogzy account",
            "Don’t share account credentials with others",
            "Keep your browser and devices up to date",
            "Report suspicious behavior or content using in-app reporting tools",
          ]}
        />
      </Section>
    </LegalLayout>
  );
}