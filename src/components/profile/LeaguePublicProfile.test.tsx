/**
 * Public-profile category contract: labels come from the backend's
 * `category_name`, best/weakest tiles show real values, and the quiz record
 * renders from `total_attempts` instead of falling into the empty state.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeaguePublicProfile from "./LeaguePublicProfile";
import type { ProfileTheme } from "@/lib/profile-themes";
import type { QuizProgress } from "@/lib/quiz/api";

const mocks = vi.hoisted(() => ({
  getProgress: vi.fn(),
  getCategories: vi.fn(),
  getAchievements: vi.fn(),
}));

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getProgress: mocks.getProgress,
      getCategories: mocks.getCategories,
      getAchievements: mocks.getAchievements,
    },
  };
});

vi.mock("@/lib/league-swipe/api", () => ({
  fetchMyRecentResults: vi.fn(async () => []),
}));

const PROGRESS: QuizProgress = {
  total_xp: 890,
  total_attempts: 31,
  correct_attempts: 21,
  accuracy: 67.74,
  current_streak: 8,
  best_streak: 8,
  rank: { rank_name: "Bronze" },
};

function setApi({
  progress = PROGRESS,
  categories = [],
}: {
  progress?: QuizProgress;
  /** Mirrors the real backend payload, which uses `category_name`. */
  categories?: Array<{ category_name: string; accuracy: number; attempts: number }>;
} = {}) {
  mocks.getProgress.mockResolvedValue(progress);
  mocks.getCategories.mockResolvedValue({ categories });
  mocks.getAchievements.mockResolvedValue({ achievements: [] });
}

function renderPublicProfile(props: { isOwnProfile?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LeaguePublicProfile
          userId="u1"
          displayName="RiftMaster"
          isOwnProfile={props.isOwnProfile ?? false}
          themeStyles={{} as ProfileTheme["styles"]}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("LeaguePublicProfile — category contract", () => {
  it("renders best/weakest category names from category_name (never blank)", async () => {
    setApi({
      categories: [
        { category_name: "champions", accuracy: 100, attempts: 15 },
        { category_name: "items", accuracy: 50, attempts: 2 },
        { category_name: "cooldowns", accuracy: 20, attempts: 5 },
      ],
    });
    renderPublicProfile();
    expect(await screen.findByText("champions")).toBeTruthy();
    expect(screen.getByText("cooldowns")).toBeTruthy();
    // With data present, the placeholder dash must not appear in the tiles.
    expect(screen.queryByText("—")).toBeNull();
  });

  it("never selects a zero-attempt category as best", async () => {
    setApi({
      categories: [
        { category_name: "esports", accuracy: 0, attempts: 0 },
        { category_name: "items", accuracy: 40, attempts: 5 },
      ],
    });
    renderPublicProfile();
    // items is best; esports (unplayed) is filtered out entirely.
    expect(await screen.findByText("items")).toBeTruthy();
    expect(screen.queryByText("esports")).toBeNull();
  });

  it("shows placeholder tiles without orphaned labels when no categories were played", async () => {
    setApi({ categories: [] });
    renderPublicProfile();
    expect(await screen.findByText("Best Category")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the quiz record from total_attempts instead of the empty state", async () => {
    setApi({});
    renderPublicProfile();
    expect(await screen.findByText("Bronze")).toBeTruthy();
    expect(screen.getByText(/890 XP · 31 answered/)).toBeTruthy();
    expect(screen.queryByText(/hasn't played the League Quiz yet/)).toBeNull();
  });

  it("keeps the honest empty state for users with no attempts", async () => {
    setApi({ progress: { total_attempts: 0, accuracy: 0 } });
    renderPublicProfile();
    expect(await screen.findByText(/RiftMaster hasn't played the League Quiz yet/)).toBeTruthy();
  });
});
