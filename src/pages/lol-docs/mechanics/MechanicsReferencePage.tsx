// Mechanics Reference — the player-facing reference shelf over Mogzy's
// canonical mechanics study tables, inside Mogzy Archives (/lol/docs).
//
// One component serves all three depths so the shell, breadcrumb and data
// cache never fork:
//
//   /lol/docs/mechanics                          the shelf
//   /lol/docs/mechanics/:categorySlug            one category, all its tables
//   /lol/docs/mechanics/:categorySlug/:tableSlug one table, focused
//
// Sibling to the Mechanics Explorer at /lol/mechanics, which answers "what is
// it right now, for my inputs". This surface answers "show me the table".
// Every number below is rendered from /api/mechanics/tables; nothing here
// computes, stores or corrects a mechanics value.

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Compass, Library } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import DataSourcesNotice from "@/components/lol/DataSourcesNotice";
import StudyTableView, {
  VerifiedThroughBadge,
} from "@/components/mechanics-tables/StudyTableView";
import { SITE_URL } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import {
  fetchStudyTable,
  fetchTablesIndex,
  mechanicsTablesKeys,
  type StudyTable,
  type TablesIndex,
} from "@/lib/mechanics-tables/api";
import {
  MECHANICS_REFERENCE_PATH,
  SHELF_BLURBS,
  SHELF_LABELS,
  buildCategoryViews,
  categoryPath,
  findCategoryBySlug,
  findTableBySlug,
  groupByShelf,
  tablePath,
  type CategoryView,
  type TableView,
} from "@/lib/mechanics-tables/presentation";

const GOLD = "#c9a84c";

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function Breadcrumb({ trail }: { trail: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 opacity-50" aria-hidden />}
            {crumb.to ? (
              <Link
                to={crumb.to}
                className="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <span className="min-w-0 break-words">
        The mechanics tables could not be loaded. {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded bg-destructive/20 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
      >
        Try again
      </button>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 md:p-5"
      data-testid="study-table-skeleton"
    >
      <div className="h-5 w-52 animate-pulse rounded bg-muted/50" />
      <div className="mt-2 h-3.5 w-72 animate-pulse rounded bg-muted/40" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="h-8 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
    </div>
  );
}

function NotFoundPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-6 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      <Link
        to={MECHANICS_REFERENCE_PATH}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#c9a84c]/40 px-3 py-1.5 text-xs font-bold text-[#c9a84c] hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All mechanics tables
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shelf (landing)
// ---------------------------------------------------------------------------

function CategoryCard({ category }: { category: CategoryView }) {
  const { Icon } = category;
  return (
    <Link
      to={categoryPath(category)}
      className={cn(
        "group flex h-full flex-col rounded-xl border border-border bg-card/60 p-4 transition-colors",
        "hover:border-[#c9a84c]/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06]"
          aria-hidden
        >
          <Icon className="h-4.5 w-4.5" style={{ color: GOLD, width: "1.05rem", height: "1.05rem" }} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight text-foreground">{category.label}</h3>
          {category.blurb && (
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{category.blurb}</p>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1 border-t border-border/50 pt-2.5">
        {category.tables.map((table) => (
          <li key={table.tableId} className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate text-muted-foreground group-hover:text-foreground/80">
              {table.title}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground/60">
              {table.rowCount}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

function ShelfLanding({ categories, patch }: { categories: CategoryView[]; patch: string }) {
  const shelves = groupByShelf(categories);
  const tableCount = categories.reduce((total, category) => total + category.tables.length, 0);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-muted-foreground">
          {tableCount} reference tables across {categories.length} subjects. Every value is read
          straight from Mogzy's canonical mechanics authority — the same source the quizzes and the
          combat simulator answer from.
        </p>
      </div>
      {shelves.map(({ shelf, categories: shelfCategories }) => (
        <section key={shelf} aria-labelledby={`shelf-${shelf}`}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2">
            <h2
              id={`shelf-${shelf}`}
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: GOLD }}
            >
              {SHELF_LABELS[shelf] ?? shelf}
            </h2>
            <p className="text-[12px] text-muted-foreground">{SHELF_BLURBS[shelf]}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shelfCategories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </section>
      ))}
      <p className="text-[12px] text-muted-foreground">
        Looking for one answer rather than the whole table? The{" "}
        <Link to="/lol/mechanics" className="text-[#c9a84c] hover:underline">
          Mechanics Explorer
        </Link>{" "}
        works out death timers, wave states and structure values for the exact game time you give
        it, from the same authority. Tables here are certified through patch {patch}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category / table view
// ---------------------------------------------------------------------------

function TableChips({
  category,
  activeSlug,
}: {
  category: CategoryView;
  activeSlug?: string;
}) {
  if (category.tables.length < 2) return null;
  return (
    <nav aria-label={`${category.label} tables`} className="flex flex-wrap gap-2">
      <Link
        to={categoryPath(category)}
        aria-current={activeSlug ? undefined : "page"}
        className={cn(
          "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50",
          activeSlug
            ? "border-border text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground"
            : "border-[#c9a84c]/60 bg-[#c9a84c]/10 text-foreground",
        )}
      >
        All {category.tables.length}
      </Link>
      {category.tables.map((table) => {
        const active = table.slug === activeSlug;
        return (
          <Link
            key={table.tableId}
            to={tablePath(table)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50",
              active
                ? "border-[#c9a84c]/60 bg-[#c9a84c]/10 text-foreground"
                : "border-border text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground",
            )}
          >
            {table.title}
          </Link>
        );
      })}
    </nav>
  );
}

function CategoryTables({ tables }: { tables: TableView[] }) {
  const results = useQueries({
    queries: tables.map((table) => ({
      queryKey: mechanicsTablesKeys.study(table.tableId),
      queryFn: () => fetchStudyTable(table.tableId),
      staleTime: Infinity,
    })),
  });

  return (
    <div className="space-y-4">
      {tables.map((table, index) => {
        const result = results[index] as {
          data?: StudyTable;
          isPending: boolean;
          isError: boolean;
          error: unknown;
          refetch: () => void;
        };
        if (result?.isPending) return <TableSkeleton key={table.tableId} />;
        if (result?.isError || !result?.data) {
          return (
            <div key={table.tableId} className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-base font-bold text-foreground">{table.title}</h3>
              <div className="mt-3">
                <ErrorState error={result?.error} onRetry={() => result?.refetch()} />
              </div>
            </div>
          );
        }
        return (
          <StudyTableView
            key={table.tableId}
            table={result.data}
            headingLevel={2}
            showVerifiedBadge={false}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MechanicsReferencePage() {
  const { categorySlug, tableSlug } = useParams<{ categorySlug?: string; tableSlug?: string }>();

  const indexQuery = useQuery<TablesIndex, Error>({
    queryKey: mechanicsTablesKeys.index,
    queryFn: fetchTablesIndex,
    staleTime: Infinity,
  });

  const categories = useMemo(
    () => buildCategoryViews(indexQuery.data?.categories ?? []),
    [indexQuery.data],
  );
  const category = categorySlug ? findCategoryBySlug(categories, categorySlug) : undefined;
  const table = category && tableSlug ? findTableBySlug(category, tableSlug) : undefined;
  const patch = indexQuery.data?.patch ?? "";

  const trail: Array<{ label: string; to?: string }> = [
    { label: "Archives", to: "/lol/docs" },
    { label: "Mechanics reference", to: categorySlug ? MECHANICS_REFERENCE_PATH : undefined },
  ];
  if (category) {
    trail.push({ label: category.label, to: tableSlug ? categoryPath(category) : undefined });
  }
  if (table) trail.push({ label: table.title });

  const seoTitle = table
    ? `${table.title} — LoL Mechanics Reference | Mogzy`
    : category
      ? `${category.label} — LoL Mechanics Reference | Mogzy`
      : "LoL Mechanics Reference — Waves, Jungle, Structures & Gold Tables | Mogzy";
  const seoDescription = table
    ? `${table.title}: ${table.subtitle || "a Mogzy mechanics reference table"}. Read straight from Mogzy's canonical League of Legends mechanics authority.`
    : category
      ? `${category.label} reference tables for League of Legends — ${category.blurb || "certified values from Mogzy's canonical mechanics authority."}`
      : "Every League of Legends environment number as a reference table: minion waves and stats, jungle and objective timers, structures and plates, respawn and fountain rules, and takedown gold.";
  const seoPath = table
    ? tablePath(table)
    : category
      ? categoryPath(category)
      : MECHANICS_REFERENCE_PATH;

  const headerTitle = table ? table.title : category ? category.label : "Mechanics Reference";
  const headerBlurb = table
    ? table.subtitle
    : category
      ? category.blurb
      : "Every environment number Mogzy certifies, laid out as a study table you can read start to finish.";

  return (
    <div>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        path={seoPath}
        keywords="lol minion wave table, league xp per wave, lol turret plate gold, league death timer table, lol kill gold by level, jungle respawn timers"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: headerTitle,
          url: `${SITE_URL}${seoPath}`,
          description: seoDescription,
          isPartOf: { "@type": "WebSite", name: "Mogzy", url: SITE_URL },
        }}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <Breadcrumb trail={trail} />

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 p-6 backdrop-blur-sm md:p-8">
          <div
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: GOLD }}
          >
            <Library className="h-3.5 w-3.5" aria-hidden />
            Mogzy Archives · Mechanics Reference
          </div>
          <h1 className="mt-1.5 text-2xl font-bold text-foreground md:text-4xl">{headerTitle}</h1>
          {headerBlurb && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{headerBlurb}</p>
          )}
          {patch && (
            <div className="mt-4">
              <VerifiedThroughBadge patch={patch} />
            </div>
          )}
        </div>

        {indexQuery.isPending ? (
          <div className="space-y-4" data-testid="mechanics-reference-loading">
            <div className="h-4 w-72 animate-pulse rounded bg-muted/40" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((card) => (
                <div key={card} className="h-40 animate-pulse rounded-xl bg-muted/30" />
              ))}
            </div>
          </div>
        ) : indexQuery.isError ? (
          <ErrorState error={indexQuery.error} onRetry={() => indexQuery.refetch()} />
        ) : categories.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
            No mechanics tables are published yet.
          </div>
        ) : categorySlug && !category ? (
          <NotFoundPanel>
            There is no mechanics subject called “{categorySlug}”.
          </NotFoundPanel>
        ) : category && tableSlug && !table ? (
          <div className="space-y-4">
            <TableChips category={category} />
            <NotFoundPanel>
              {category.label} has no table called “{tableSlug}”.
            </NotFoundPanel>
          </div>
        ) : category ? (
          <div className="space-y-4">
            <TableChips category={category} activeSlug={table?.slug} />
            <CategoryTables tables={table ? [table] : category.tables} />
            {table && (
              <Link
                to={categoryPath(category)}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#c9a84c] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                All {category.label} tables
              </Link>
            )}
          </div>
        ) : (
          <ShelfLanding categories={categories} patch={patch} />
        )}

        {!categorySlug && (
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/lol/docs"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to Archives
            </Link>
            <Link
              to="/lol/mechanics"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden />
              Mechanics Explorer
            </Link>
          </div>
        )}

        <DataSourcesNotice freshness={patch ? `Tables certified through patch ${patch}.` : undefined} />
      </div>
    </div>
  );
}
