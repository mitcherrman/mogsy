import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import BlogRenderer from "./BlogRenderer";
import type { BlogContent } from "@/lib/blog/types";

afterEach(cleanup);

const BLOCKS_CONTENT: BlogContent = {
  mode: "blocks",
  blocks: [],
} as unknown as BlogContent;

describe("BlogRenderer empty state", () => {
  it("renders text-only with no mascot when showEmptyMascot is not passed", () => {
    render(<BlogRenderer content={null} />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders text-only with no mascot when showEmptyMascot is explicitly false", () => {
    render(<BlogRenderer content={undefined} showEmptyMascot={false} />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the sleeping mascot when showEmptyMascot is true", () => {
    const { container } = render(<BlogRenderer content={{}} showEmptyMascot />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("data-mogzy-art-category", "mascot");
    expect(img).toHaveAttribute("data-mogzy-art-name", "sleeping");
  });

  it("renders the mascot as decorative (empty alt, aria-hidden)", () => {
    const { container } = render(<BlogRenderer content={{}} showEmptyMascot />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("resolves the sleeping mascot to a real asset file", () => {
    const { container } = render(<BlogRenderer content={{}} showEmptyMascot />);
    const img = container.querySelector("img")!;
    const src = img.getAttribute("src")!;
    const fullPath = path.join(process.cwd(), "public", src);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it("never renders the mascot for non-empty content, regardless of showEmptyMascot", () => {
    const { container: withMascotProp } = render(
      <BlogRenderer content={BLOCKS_CONTENT} showEmptyMascot />,
    );
    expect(withMascotProp.querySelector("img")).not.toBeInTheDocument();

    const { container: withoutMascotProp } = render(
      <BlogRenderer content={BLOCKS_CONTENT} />,
    );
    expect(withoutMascotProp.querySelector("img")).not.toBeInTheDocument();
  });
});

describe("BlogRenderer call-site contract (source-level checks)", () => {
  it("BlogPost.tsx passes showEmptyMascot to BlogRenderer", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/pages/blog/BlogPost.tsx"),
      "utf-8",
    );
    const call = src.match(/<BlogRenderer[^>]*\/>/)?.[0] ?? "";
    expect(call).toContain("showEmptyMascot");
  });

  it("AdminBlogEditor.tsx does not pass showEmptyMascot to BlogRenderer", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/pages/admin/AdminBlogEditor.tsx"),
      "utf-8",
    );
    const call = src.match(/<BlogRenderer[^>]*\/>/)?.[0] ?? "";
    expect(call).not.toContain("showEmptyMascot");
  });
});
