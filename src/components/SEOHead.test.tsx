import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SEOHead from "./SEOHead";

const meta = (selector: string) =>
  document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute("content") ?? null;

afterEach(() => {
  document.head
    .querySelectorAll('meta[name="keywords"], meta[property^="article:"], meta[property="og:image"], meta[name="twitter:image"]')
    .forEach((node) => node.remove());
});

describe("SEOHead route metadata cleanup", () => {
  it("clears optional image and keyword metadata when the next SPA route omits it", () => {
    const { rerender } = render(
      <SEOHead
        title="First"
        description="First page"
        path="/first"
        image="https://mogzy.lol/first.png"
        keywords="league, first"
      />,
    );

    expect(meta('meta[property="og:image"]')).toBe("https://mogzy.lol/first.png");
    expect(meta('meta[name="twitter:image"]')).toBe("https://mogzy.lol/first.png");
    expect(meta('meta[name="keywords"]')).toBe("league, first");

    rerender(<SEOHead title="Second" description="Second page" path="/second" />);

    expect(meta('meta[property="og:image"]')).toBeNull();
    expect(meta('meta[name="twitter:image"]')).toBeNull();
    expect(meta('meta[name="keywords"]')).toBeNull();
  });

  it("clears singleton article metadata before applying the next route", () => {
    const { rerender } = render(
      <SEOHead
        title="Article"
        description="Article page"
        path="/blog/article"
        type="article"
        article={{
          publishedTime: "2026-10-01T00:00:00Z",
          modifiedTime: "2026-10-02T00:00:00Z",
          section: "League",
          author: "Mogzy",
        }}
      />,
    );

    expect(meta('meta[property="article:published_time"]')).toBe("2026-10-01T00:00:00Z");
    expect(meta('meta[property="article:section"]')).toBe("League");

    rerender(<SEOHead title="Normal" description="Normal page" path="/lol" />);

    expect(meta('meta[property="article:published_time"]')).toBeNull();
    expect(meta('meta[property="article:modified_time"]')).toBeNull();
    expect(meta('meta[property="article:section"]')).toBeNull();
    expect(meta('meta[property="article:author"]')).toBeNull();
  });
});
