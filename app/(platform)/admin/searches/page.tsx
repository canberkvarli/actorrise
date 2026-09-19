"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";

import { useMarkSeen } from "@/hooks/useMarkSeen";

import { DiagnosisTab } from "@/components/admin/searches/DiagnosisTab";
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
  { id: "diagnosis", label: "Diagnosis", hint: "What's failing, and whose fault it is" },
  { id: "searches", label: "Searches", hint: "Every search, filterable" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminSearchesPage() {
  useMarkSeen("searches");

  const [tab, setTab] = useState<TabId>("diagnosis");

  // Read from the same place the nav badge reads, so the two can never
  // disagree about what you came here for. useMarkSeen invalidates this on
  // mount, so the line states the count at the moment of arrival and then
  // clears -- it tells you what you came for, once.
  const { data: pulse } = useQuery({
    queryKey: ["admin-pulse"],
    queryFn: async () => {
      const res = await api.get<Record<string, number>>("/api/admin/pulse");
      return res.data;
    },
    staleTime: 30_000,
  });
  const [filters, setFilters] = useState<LogFilters>(EMPTY_FILTERS);

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold sm:text-xl">Search</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What actors are looking for, and whether they&apos;re finding it.
        </p>
        {(pulse?.searches ?? 0) > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="tabular-nums text-foreground">{pulse?.searches}</strong>{" "}
            {pulse?.searches === 1 ? "search" : "searches"} since you last looked
            found nothing, and we hold the piece.
          </p>
        )}
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

      {tab === "diagnosis" && (
        <DiagnosisTab
          onDrillIntoQuery={(next) => {
            setFilters(next);
            setTab("searches");
          }}
        />
      )}



      {tab === "searches" && (
        <SearchLogsTable
          filters={filters}
          onFiltersChange={setFilters}
          title="Every search, newest first"
        />
      )}

    </div>
  );
}
