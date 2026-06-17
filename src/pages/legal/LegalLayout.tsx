import { ReactNode } from "react";
import SEOHead from "@/components/SEOHead";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";

interface LegalLayoutProps {
  title: string;
  description: string;
  path: string;
  heading: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
  keywords?: string;
}

/** Shared visual chrome for /about, /privacy, /terms, /security, /contact. */
export default function LegalLayout({
  title,
  description,
  path,
  heading,
  intro,
  updated,
  children,
  keywords,
}: LegalLayoutProps) {
  return (
    <>
      <SEOHead
        title={title}
        description={description}
        path={path}
        keywords={keywords}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: heading,
          description,
          url: `${SITE_URL}${path}`,
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        }}
      />
      <article className="px-4 md:px-8 py-10 md:py-14 max-w-3xl mx-auto text-foreground">
        <header className="mb-8 md:mb-12">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{heading}</h1>
          {intro && <p className="mt-4 text-base md:text-lg text-muted-foreground">{intro}</p>}
          {updated && (
            <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground/80">
              Last updated: {updated}
            </p>
          )}
        </header>
        <div className="prose-mogsy space-y-8 text-[15px] md:text-base leading-relaxed">
          {children}
        </div>
      </article>
    </>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/40 bg-card/40 p-5 md:p-7">
      <h2 className="text-xl md:text-2xl font-semibold mb-3 text-foreground">{title}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-primary/70">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}