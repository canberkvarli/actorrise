"use client";

import { useState } from "react";

import { ContentRequestsTab } from "@/components/admin/searches/ContentRequestsTab";
import { DemandTab } from "@/components/admin/searches/DemandTab";
import { PeopleTab } from "@/components/admin/searches/PeopleTab";
import { ProblemsTab } from "@/components/admin/searches/ProblemsTab";
import { SearchLogsTable } from "@/components/admin/searches/SearchLogsTable";
import { BRAND, EMPTY_FILTERS, type LogFilters } from "@/components/admin/searches/shared";

/**
 * Search admin, organised by the question you walked in with.
 *
 * Search is the busiest surface on the platform, and the single screen that
 * used to serve it made every question equally hard: nine metric cards, then a
 * flat reverse-chronological feed. Each tab now answers one thing, and the tabs
 * hand off to each other — a query in Demand or an actor in People drops you
 * into the raw feed already filtered.
 */

const TABS = [
  { id: "problems", label: "What's broken", hint: "Failed and weak searches" },
  { id: "demand", label: "What they want", hint: "Top queries and gaps" },
  { id: "people", label: "Who's searching", hint: "Per-actor behaviour" },
  { id: "recent", label: "Recent activity", hint: "The raw feed" },
  { id: "requests", label: "Requests", hint: "Titles to add" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminSearchesPage() {
  const [tab, setTab] = useState<TabId>("problems");
  const [filters, setFilters] = useState<LogFilters>(EMPTY_FILTERS);

  /** Jump from an aggregate straight to the rows that produced it. */
  const drillInto = (patch: Partial<LogFilters>) => {
    setFilters({ ...EMPTY_FILTERS, ...patch });
    setTab("recent");
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold sm:text-xl">Search</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What actors are looking for, and whether they&apos;re finding it.
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-left transition-colors ${
                active ? "" : "border-transparent hover:bg-muted/30"
              }`}
              style={active ? { borderColor: BRAND, color: BRAND } : undefined}
            >
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </nav>

      {tab === "problems" && <ProblemsTab />}

      {tab === "demand" && <DemandTab onDrillIntoQuery={(q) => drillInto({ q })} />}

      {tab === "people" && <PeopleTab onDrillIntoUser={(user) => drillInto({ user })} />}

      {tab === "recent" && (
        <SearchLogsTable
          filters={filters}
          onFiltersChange={setFilters}
          title="Every search, newest first"
        />
      )}

      {tab === "requests" && <ContentRequestsTab />}
    </div>
  );
}
