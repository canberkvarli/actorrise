"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SearchTour } from "@/components/onboarding/SearchTour";
import { useTourTrigger } from "@/components/onboarding/useTourTrigger";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";
import { useTypewriterPlaceholder } from "@/hooks/useTypewriterPlaceholder";
import { useAuth } from "@/lib/auth";
import { trackEvent } from "@/lib/events";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { toastBookmark } from "@/lib/toast";
import { trackSearchPerformed, trackResultClicked } from "@/lib/analytics";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconBookmark, IconEye, IconEyeOff, IconDownload, IconAdjustments, IconFlag, IconDeviceTv } from "@tabler/icons-react";

import api from "@/lib/api";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { Monologue } from "@/types/actor";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { TrendingPreSearch } from "@/components/monologue/TrendingPreSearch";
import { HouseIsHunting } from "@/components/community/HouseIsHunting";
import { ForYouShelf } from "@/components/monologue/ForYouShelf";
import { SearchCurtain } from "@/components/monologue/SearchCurtain";
// A ticket stub for "nothing on this bill" — the masks were already doing duty
// as the gibberish/short empty state and as a starting-point tile, so film & TV
// coming back empty looked identical to two other things.
import {
  ClapperSketch,
  MasksSketch,
  ScriptPagesSketch,
  SpotlightSketch,
  TicketSketch,
} from "@/components/brand/sketches";
import { SearchFiltersPanel } from "@/components/monologue/SearchFiltersPanel";
import { NoResultsState } from "@/components/monologue/NoResultsState";
import { StartingPoints } from "@/components/monologue/StartingPoints";
import { addSearchToHistory, getSearchById } from "@/lib/searchHistory";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueSpeech, matchMarkIsUseful } from "@/components/monologue/MonologueSpeech";
import { constantFacts, constantFactsLabel } from "@/lib/resultFacts";
import { SearchFiltersSheet, getDurationLabel } from "@/components/search/SearchFiltersSheet";
import type { SearchFiltersState } from "@/components/search/SearchFiltersSheet";
import { accentTeal } from "@/components/search/MatchIndicatorTag";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { ReportMonologueModal } from "@/components/monologue/ReportMonologueModal";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { ContactModal } from "@/components/contact/ContactModal";
import { ResultsFeedbackPrompt } from "@/components/feedback/ResultsFeedbackPrompt";
import { extractQueryHighlights } from "@/lib/queryMatchHighlight";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import { QuickFilterChips } from "@/components/search/QuickFilterChips";
import { MonologueSourceTag } from "@/components/search/SourceTag";
import { ContentGapBanner } from "@/components/search/ContentGapBanner";
import { RequestQueryButton } from "@/components/search/RequestQueryButton";
import { EmotionPivots } from "@/components/search/EmotionPivots";
import { ParsedConstraintChips } from "@/components/search/ParsedConstraintChips";
import { SceneGapBanner } from "@/components/search/SceneGapBanner";
import { useProfileStats, useProfileFormData } from "@/hooks/useDashboardData";
import { computeProfileMatch, type ProfileMatch } from "@/lib/profileMatch";
import { useQueryClient } from "@tanstack/react-query";
import { useBookmarks } from "@/hooks/useBookmarks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/** The two shelves. `accent` is the CSS custom property the tab tints itself
 *  with — Film & TV's violet used to be the literal rgb(167,139,250) in three
 *  places, which silently opted every one of them out of dark mode. */
const MODE_TABS = [
  { mode: "plays" as const, label: "Plays", accent: "--primary" },
  { mode: "film_tv" as const, label: "Film & TV", accent: "--accent-screen" },
];

/**
 * The two shelves are two colours, and the whole page reads them from here.
 *
 * `--acc` drives the H1 italic, the search box's hard shadow, the door glyphs
 * and their hover shadow, the shelf-title italics, the best-pick mark and the
 * mode-switch flash. `--page` is the ground. Setting two variables on the root
 * replaced a scatter of per-mode class swaps and three hardcoded violets.
 */
/* The values live in CSS, keyed off this attribute, rather than being written
   inline from here. Inline custom properties win over every stylesheet rule,
   which meant the dark theme could flip the text tokens but not the ground or
   the accent — the page stayed cream in dark mode. As an attribute, mode and
   theme compose the way every other pair of variants in this file does. */
type SearchMode = "plays" | "film_tv";

export default function MonologuesPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Skeleton className="h-10 w-full mb-6" />
        <Skeleton className="h-96" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}

/**
 * What every result on this page has in common, said once.
 *
 * The rows no longer repeat it — see constantFacts. Set as a stage direction
 * rather than a heading, because it is an aside about the page rather than a
 * section of it: the actor is looking for the piece that differs, and this is
 * the part that does not.
 */
function SharedFactsLine({ label }: { label: string | null }) {
  if (!label) return null;
  /* It used to share a line with a query echo. The echo is gone — it repeated
     the search box verbatim — so this stands on its own. */
  return (
    <p className="t-dir mt-3" style={{ color: "var(--t-muted-dark-2)" }}>
      (all {label}.)
    </p>
  );
}

/** Nothing to subscribe to: the hour is read once per render pass, and a page
 *  open across midnight re-reading it is not worth a timer. */
function subscribeNever() {
  return () => {};
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();
  const { user, isDemoUser } = useAuth();
  const { show: showSearchTour, dismiss: dismissSearchTour } =
    useTourTrigger("has_seen_search_tour", { delay: 800 });
  const [playsQuery, setPlaysQuery] = useState("");
  const [filmTvQuery, setFilmTvQuery] = useState("");
  /* Typed rather than inferred: source_type is optional on SearchFiltersState
     (only Film & TV sets it) and an inferred literal would make it required
     for every other filter object in this file. */
  const [filters, setFilters] = useState<SearchFiltersState>({
    gender: "",
    age_range: "",
    emotion: "",
    theme: "",
    category: "",
    tone: "",
    difficulty: "",
    author: "",
    max_duration: "",
    source_type: "",
  });
  /** 0 = freshest only, 0.3 = fresh, 0.5 = some overdone OK, 1 = show all. Separate from filters for clearer UX. */
  const [maxOverdoneScore, setMaxOverdoneScore] = useState(1);
  const [results, setResults] = useState<Monologue[]>([]);
  const [isPlaysLoading, setIsPlaysLoading] = useState(false);
  /** Distinguishes the "Find for me" wait from a typed search — both set
   *  isPlaysLoading, but they are different acts and get different curtains. */
  const [isFindingForMe, setIsFindingForMe] = useState(false);
  const [isFilmTvLoading, setIsFilmTvLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [debugTiming, setDebugTiming] = useState<DebugTiming | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [frontendSearchStart, setFrontendSearchStart] = useState<number | null>(null);
  const [frontendSearchMs, setFrontendSearchMs] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** When set, restore effect skips Film & TV block to avoid acting on stale URL after a Plays action. */
  const playsActionAtRef = useRef<number>(0);
  const filmTvActionAtRef = useRef<number>(0);

  /** "plays" = classic monologues; "film_tv" = film/TV reference (metadata-only). Init from URL or last mode to avoid flash. */
  const [searchMode, setSearchMode] = useState<"plays" | "film_tv">(() => {
    if (typeof window === "undefined") return "plays";
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") === "film_tv") return "film_tv";
    if (p.get("mode") === "plays") return "plays";
    return sessionStorage.getItem("search_last_mode_v1") === "film_tv" ? "film_tv" : "plays";
  });
  // Derived: reflects current mode's loading state (for shared UI like search button)
  const isLoading = searchMode === "film_tv" ? isFilmTvLoading : isPlaysLoading;
  const [filmTvResults, setFilmTvResults] = useState<Monologue[]>([]);
  const [filmTvTotal, setFilmTvTotal] = useState(0);

  // Keep search results in sync with the actual collection so that returning to
  // the results (often restored from a cached snapshot with stale flags) still
  // shows "In collection" for anything already added.
  const { data: collectionData } = useBookmarks();
  const favoritedIds = useMemo(
    () => new Set((collectionData ?? []).map((m) => m.id)),
    [collectionData],
  );
  useEffect(() => {
    if (!collectionData) return;
    const reconcile = (list: Monologue[]) => {
      let changed = false;
      const next = list.map((m) => {
        const fav = favoritedIds.has(m.id);
        if (m.is_favorited === fav) return m;
        changed = true;
        return { ...m, is_favorited: fav };
      });
      return changed ? next : list;
    };
    setResults((prev) => reconcile(prev));
    setFilmTvResults((prev) => reconcile(prev));
  }, [favoritedIds, collectionData, results, filmTvResults]);
  const [filmTvHasSearched, setFilmTvHasSearched] = useState(false);
  /** Brief viewport outline "woosh" when switching tabs: orange (plays) or purple (film/tv) */
  const [outlineFlash, setOutlineFlash] = useState<"plays" | "film_tv" | null>(null);
  const [editMonologueId, setEditMonologueId] = useState<number | null>(null);
  const [editMonologueSaving, setEditMonologueSaving] = useState(false);
  const [showProfileCompleteModal, setShowProfileCompleteModal] = useState(false);

  // Debug overlay toggle: Ctrl+Shift+D or Cmd+Shift+D (dev mode or admin/moderator only)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        const isDev = process.env.NODE_ENV === "development";
        if (isDev || user?.is_moderator) {
          setShowDebug((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [user?.is_moderator]);
  const { data: profileStats } = useProfileStats(isDemoUser);
  const { data: profileData } = useProfileFormData();

  const LAST_SEARCH_KEY = "monologue_search_last_results_v1";
  const FILM_TV_LAST_SEARCH_KEY = "film_tv_search_last_results_v1";
  const SEARCH_LAST_MODE_KEY = "search_last_mode_v1";
  const RESULTS_VIEW_COUNT_KEY = "search_results_view_count_v1";
  const FILM_TV_RESULTS_VIEW_COUNT_KEY = "film_tv_results_view_count_v1";
  const [resultsViewCount, setResultsViewCount] = useState(0);
  const [filmTvResultsViewCount, setFilmTvResultsViewCount] = useState(0);
  const [restoredFromLastSearch, setRestoredFromLastSearch] = useState(false);
  /** Query that produced the current results (for summary text); stays stable while user types in the search box. */
  const [queryUsedForResults, setQueryUsedForResults] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchUpgradeUrl, setSearchUpgradeUrl] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [queryMayHaveTypos, setQueryMayHaveTypos] = useState(false);
  const [contentGap, setContentGap] = useState<{ play: string | null; author: string | null; available_in?: string[] | null; carried_but_empty?: boolean } | null>(null);
  const [sceneGap, setSceneGap] = useState(false);
  const [queryInvalidReason, setQueryInvalidReason] = useState<string | null>(null);
  // True when results exist but none clear the strong-match bar; drives the
  // "no strong match, request it" affordance.
  const [weakMatch, setWeakMatch] = useState(false);
  const [broadened, setBroadened] = useState<{ relaxed: string[] } | null>(null);
  // Constraints the backend parsed out of the free-text query, shown as
  // removable chips. Dismissing one adds its key to ignoredConstraintsRef and
  // re-runs; the ref (not state) so performSearch always reads the latest, and
  // it resets whenever the query text itself changes (see performSearch).
  const [parsedConstraints, setParsedConstraints] = useState<Record<string, unknown> | null>(null);
  const ignoredConstraintsRef = useRef<string[]>([]);
  const lastParsedQueryRef = useRef<string>("");
  const PAGE_SIZE = 20;
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  /* An empty submit used to set this and nothing else: `jitter` was never
     read, so the `.search-jitter` class in globals.css was never applied to
     anything and pressing Search with an empty box did literally nothing. It
     shakes the bar, focuses it, and says what it wants. */
  const [jitter, setJitter] = useState(false);
  const emptyPromptRef = useRef<HTMLInputElement | null>(null);
  const nudgeEmpty = useCallback(() => {
    setJitter(true);
    emptyPromptRef.current?.focus();
  }, []);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const filmTvAbortRef = useRef<AbortController | null>(null);

  // Typewriter placeholder examples
  const PLAYS_EXAMPLES = useMemo(() => [
    "funny monologue for a 20 year old, under 2 min",
    "dramatic classical piece for a woman",
    "comedic monologue about love",
    "angry male monologue, contemporary",
    "audition piece for drama school",
    "Shakespeare monologue for a young man",
  ], []);
  const FILM_TV_EXAMPLES = useMemo(() => [
    "courtroom drama, intense closing argument",
    "breakup scene, emotional",
    "villain monologue, intimidating",
    "comedy, awkward first date scene",
    "war film, motivational speech",
  ], []);

  const queryHighlights = useMemo(() => extractQueryHighlights(queryUsedForResults || playsQuery), [queryUsedForResults, playsQuery]);

  const currentQuery = searchMode === "plays" ? playsQuery : filmTvQuery;
  const typewriterExamples = searchMode === "plays" ? PLAYS_EXAMPLES : FILM_TV_EXAMPLES;
  const { placeholder: typewriterText, pause: pauseTypewriter, scheduleResume: resumeTypewriter } =
    useTypewriterPlaceholder(typewriterExamples, {
      enabled: !currentQuery && !isLoading && !hasSearched && !filmTvHasSearched,
      resumeDelayMs: 4000,
    });

  const userStoppedRef = useRef(false);
  const userStoppedModesRef = useRef<Set<"plays" | "film_tv">>(new Set());
  const stopSearch = useCallback(() => {
    userStoppedRef.current = true;
    userStoppedModesRef.current.add(searchMode);
    if (searchMode === "plays") {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      setIsPlaysLoading(false);
    } else {
      if (filmTvAbortRef.current) {
        filmTvAbortRef.current.abort();
        filmTvAbortRef.current = null;
      }
      setIsFilmTvLoading(false);
    }
    setIsLoadingMore(false);
  }, [searchMode]);

  // The tour's gating moved into useTourTrigger, which adds the session latch
  // this effect was missing: dismissing fired the flag write and then
  // refreshUser(), and if the read beat the write the actor still carried
  // has_seen_search_tour === false, so this effect re-fired and walked them
  // through the whole tour a second time.



  // Auto-scroll: handled via ref callback on the latest step

  // Scroll panel to top only when a *different* monologue is selected (not on data refresh)
  useEffect(() => {
    if (selectedMonologue && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [selectedMonologue?.id]);

  // Initialize results view count from sessionStorage (for feedback prompt).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(RESULTS_VIEW_COUNT_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      if (!Number.isNaN(n) && n >= 0) setResultsViewCount(n);
      const filmTvRaw = sessionStorage.getItem(FILM_TV_RESULTS_VIEW_COUNT_KEY);
      const filmTvN = filmTvRaw ? parseInt(filmTvRaw, 10) : 0;
      if (!Number.isNaN(filmTvN) && filmTvN >= 0) setFilmTvResultsViewCount(filmTvN);
    } catch {
      // ignore
    }
  }, []);

  // When we have results but count is still 0 (e.g. restored from last search), set to 1 so feedback prompt shows.
  useEffect(() => {
    if (typeof window === "undefined" || !hasSearched || results.length === 0 || resultsViewCount !== 0) return;
    try {
      sessionStorage.setItem(RESULTS_VIEW_COUNT_KEY, "1");
      setResultsViewCount(1);
    } catch {
      // ignore
    }
  }, [hasSearched, results.length, resultsViewCount]);

  // Same for Film & TV: when we have results but count is still 0 (e.g. restored from last search), set to 1 so feedback prompt shows.
  useEffect(() => {
    if (typeof window === "undefined" || !filmTvHasSearched || filmTvResults.length === 0 || filmTvResultsViewCount !== 0) return;
    try {
      sessionStorage.setItem(FILM_TV_RESULTS_VIEW_COUNT_KEY, "1");
      setFilmTvResultsViewCount(1);
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmTvHasSearched, filmTvResults.length, filmTvResultsViewCount]);

  // Restore search state from URL and sessionStorage whenever this page is (re)visited.
  // This allows search results to persist across refreshes AND when navigating away
  // to other pages and then back to /monologues. Supports both Plays and Film & TV.
  useEffect(() => {
    // Check if this is a restoration from search history
    const historyId = searchParams.get("id");
    if (historyId) {
      const historyEntry = getSearchById(historyId);
      if (historyEntry) {
        setPlaysQuery(historyEntry.query);
        setSearchMode("plays");
        // Normalize filters to ensure all required fields are strings
        const hf = historyEntry.filters as Record<string, string>;
        setFilters({
          gender: hf.gender || "",
          age_range: hf.age_range || "",
          emotion: hf.emotion || "",
          theme: hf.theme || "",
          category: hf.category || "",
          tone: hf.tone || "",
          difficulty: hf.difficulty || "",
          author: hf.author || "",
          max_duration: hf.max_duration || "",
        });
        const h = historyEntry.filters as { exclude_overdone?: string; max_overdone_score?: number };
        setMaxOverdoneScore(typeof h.max_overdone_score === "number" ? h.max_overdone_score : h.exclude_overdone === "true" ? 0.3 : 1);
        setResults(historyEntry.resultPreviews);
        setHasSearched(true);
        return;
      }
    }

    const mode = searchParams.get("mode");

    // Skip Film & TV restore if user just switched to Plays or ran a plays search (URL may not have updated yet).
    if (mode === "film_tv" && playsActionAtRef.current && Date.now() - playsActionAtRef.current < 1500) {
      playsActionAtRef.current = 0;
      return;
    }

    // Film & TV: restore from URL + cache or last film_tv search
    if (mode === "film_tv") {
      setSearchMode("film_tv");
      const urlQuery = searchParams.get("q") ?? "";
      setFilmTvQuery(urlQuery);
      setRestoredFromLastSearch(false);

      const cacheKey = `film_tv_results_${urlQuery}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { results: cachedResults, total: cachedTotal } = JSON.parse(cached) as { results: Monologue[]; total: number };
          setFilmTvResults(cachedResults);
          setFilmTvTotal(cachedTotal);
          setFilmTvHasSearched(true);
          return;
        } catch (e) {
          console.error("Error parsing cached film_tv results:", e);
        }
      }

      const hasFilmTvParams = urlQuery.trim() !== "";
      // Skip re-triggering if user just manually stopped this search
      if (userStoppedModesRef.current.has("film_tv")) {
        userStoppedModesRef.current.delete("film_tv");
        return;
      }
      if (hasFilmTvParams) {
        (async () => {
          if (filmTvAbortRef.current) filmTvAbortRef.current.abort();
          const ctrl = new AbortController();
          filmTvAbortRef.current = ctrl;
          setIsFilmTvLoading(true);
          setSearchError(null);
          try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1", source_type: filters.source_type || "film,tv" });
            if (urlQuery.trim()) params.set("q", urlQuery.trim());
            const res = await api.get<{ results: Monologue[]; total: number }>(`/api/monologues/search?${params.toString()}`, { signal: ctrl.signal });
            setFilmTvResults(res.data.results);
            setFilmTvTotal(res.data.total);
            setFilmTvHasSearched(true);
            const payload = { query: urlQuery.trim(), results: res.data.results, total: res.data.total };
            sessionStorage.setItem(FILM_TV_LAST_SEARCH_KEY, JSON.stringify(payload));
            sessionStorage.setItem(cacheKey, JSON.stringify({ results: res.data.results, total: res.data.total }));
            sessionStorage.setItem(SEARCH_LAST_MODE_KEY, "film_tv");
          } catch {
            if (filmTvAbortRef.current !== ctrl) return;
            setFilmTvResults([]);
            setFilmTvTotal(0);
            setFilmTvHasSearched(true);
          } finally {
            if (filmTvAbortRef.current === ctrl) {
              setIsFilmTvLoading(false);
            }
          }
        })();
        return;
      }

      const lastFilmTvRaw = sessionStorage.getItem(FILM_TV_LAST_SEARCH_KEY);
      if (lastFilmTvRaw) {
        try {
          const last = JSON.parse(lastFilmTvRaw) as { query: string; results: Monologue[]; total: number };
          setFilmTvQuery(last.query);
          setFilmTvResults(last.results);
          setFilmTvTotal(last.total);
          setFilmTvHasSearched(true);
        } catch (e) {
          console.error("Error restoring last film_tv search:", e);
        }
      }
      return;
    }

    // Skip Plays restore if user just switched to Film & TV (URL may not have updated yet).
    if (filmTvActionAtRef.current && Date.now() - filmTvActionAtRef.current < 1500) {
      filmTvActionAtRef.current = 0;
      return;
    }

    // Plays: URL params (mode is "plays" or missing; we only enter here when mode !== "film_tv")
    const urlQuery = searchParams.get("q");
    const urlFilters: typeof filters = {
      gender: "",
      age_range: "",
      emotion: "",
      theme: "",
      category: "",
      tone: "",
      difficulty: "",
      author: "",
      max_duration: "",
    };
    ["gender", "age_range", "emotion", "theme", "category", "tone", "difficulty", "author", "max_duration"].forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        urlFilters[key as keyof typeof filters] = value;
      }
    });
    const urlMaxOverdone = searchParams.get("max_overdone_score");
    const parsedMax = urlMaxOverdone ? parseFloat(urlMaxOverdone) : NaN;
    const initialMaxOverdone = !Number.isNaN(parsedMax) && parsedMax >= 0 && parsedMax <= 1 ? parsedMax : 1;
    setMaxOverdoneScore(initialMaxOverdone);

    setRestoredFromLastSearch(false);

    // Restore from URL params if present (plays)
    if (urlQuery !== null && urlQuery !== undefined) {
      setSearchMode("plays");
      setPlaysQuery(urlQuery);
      setFilters(urlFilters);

      // Try to restore results from sessionStorage (fast, no API call)
      const storageKey = `search_results_${urlQuery}_${JSON.stringify(urlFilters)}_${initialMaxOverdone}`;
      const cachedResults = sessionStorage.getItem(storageKey);

      if (cachedResults) {
        try {
          const cached = JSON.parse(cachedResults);
          // Support both old format (array) and new format ({items, total})
          const parsed: Monologue[] = Array.isArray(cached) ? cached : cached.items;
          const cachedTotal: number = Array.isArray(cached) ? cached.length : cached.total;
          setResults(parsed);
          setTotal(cachedTotal);
          // Restore the response-level signals so the chips / relaxation notice /
          // weak banner survive a cache-restore (older array-shaped caches lack them).
          if (!Array.isArray(cached)) {
            setParsedConstraints(cached.parsed_constraints ?? null);
            setBroadened(cached.broadened ?? null);
            setWeakMatch(Boolean(cached.weak_match));
          }
          // Restore typo correction banner from cache
          const correctionKey = `search_correction_${urlQuery}_${JSON.stringify(urlFilters)}_${initialMaxOverdone}`;
          const cachedCorrection = sessionStorage.getItem(correctionKey);
          setCorrectedQuery(cachedCorrection || null);
          setQueryUsedForResults(urlQuery);
          setHasSearched(true);
          setRestoredFromLastSearch(false);
          return;
        } catch (e) {
          console.error("Error parsing cached results:", e);
          // If cache is corrupted, perform fresh search
          performSearch(urlQuery, urlFilters, 1, false, initialMaxOverdone);
          return;
        }
      } else {
        // Skip re-triggering if user just manually stopped this search
        if (userStoppedModesRef.current.has("plays")) {
          userStoppedModesRef.current.delete("plays");
          return;
        }
        // If no cache but URL has query, perform fresh search
        performSearch(urlQuery, urlFilters, 1, false, initialMaxOverdone);
        return;
      }
    }

    // No URL query: restore by explicit mode or last mode so Plays and Film & TV stay independent
    const explicitMode = searchParams.get("mode");
    if (explicitMode === "plays") {
      setSearchMode("plays");
      // User chose Plays tab; restore plays last search only
      try {
        const lastSearchRaw = sessionStorage.getItem(LAST_SEARCH_KEY);
        if (lastSearchRaw) {
          const last = JSON.parse(lastSearchRaw) as {
            query: string;
            filters: typeof filters & { exclude_overdone?: string; max_overdone_score?: number };
            results: Monologue[];
            total?: number;
          };
          setPlaysQuery(last.query);
          setFilters({
            gender: last.filters.gender ?? "",
            age_range: last.filters.age_range ?? "",
            emotion: last.filters.emotion ?? "",
            theme: last.filters.theme ?? "",
            category: last.filters.category ?? "",
            tone: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).tone ?? "",
            difficulty: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).difficulty ?? "",
            author: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).author ?? "",
            max_duration: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).max_duration ?? "",
          });
          const m = last.filters.max_overdone_score;
          setMaxOverdoneScore(typeof m === "number" && m >= 0 && m <= 1 ? m : last.filters.exclude_overdone === "true" ? 0.3 : 1);
          setResults(last.results);
          setTotal(last.total ?? last.results.length);
          setCorrectedQuery(null);
          setHasSearched(last.results.length > 0);
          setQueryUsedForResults(last.query);
          setRestoredFromLastSearch(true);
        }
      } catch (e) {
        console.error("Error restoring last plays search:", e);
      }
      return;
    }

    if (explicitMode === "film_tv") return; // already handled above

    // No explicit mode: use last mode to restore (e.g. navigated to /search with no params)
    try {
      const lastMode = sessionStorage.getItem(SEARCH_LAST_MODE_KEY);
      if (lastMode === "film_tv") {
        const lastFilmTvRaw = sessionStorage.getItem(FILM_TV_LAST_SEARCH_KEY);
        if (lastFilmTvRaw) {
          const last = JSON.parse(lastFilmTvRaw) as { query: string; results: Monologue[]; total: number };
          setSearchMode("film_tv");
          setFilmTvQuery(last.query);
          setFilmTvResults(last.results);
          setFilmTvTotal(last.total);
          setFilmTvHasSearched(true);
          return;
        }
      }

      const lastSearchRaw = sessionStorage.getItem(LAST_SEARCH_KEY);
      if (lastSearchRaw) {
        setSearchMode("plays");
        const last = JSON.parse(lastSearchRaw) as {
          query: string;
          filters: typeof filters & { exclude_overdone?: string; max_overdone_score?: number };
          results: Monologue[];
          total?: number;
        };
        setPlaysQuery(last.query);
        setFilters({
          gender: last.filters.gender ?? "",
          age_range: last.filters.age_range ?? "",
          emotion: last.filters.emotion ?? "",
          theme: last.filters.theme ?? "",
          category: last.filters.category ?? "",
          tone: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).tone ?? "",
          difficulty: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).difficulty ?? "",
          author: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).author ?? "",
          max_duration: (last.filters as { tone?: string; difficulty?: string; author?: string; max_duration?: string }).max_duration ?? "",
        });
        const m = last.filters.max_overdone_score;
        setMaxOverdoneScore(typeof m === "number" && m >= 0 && m <= 1 ? m : last.filters.exclude_overdone === "true" ? 0.3 : 1);
        setResults(last.results);
        setTotal(last.total ?? last.results.length);
        setCorrectedQuery(null);
        setHasSearched(last.results.length > 0);
        setQueryUsedForResults(last.query);
        setRestoredFromLastSearch(true);
      }
    } catch (e) {
      console.error("Error restoring last search state:", e);
    }
  }, [searchParams]);

  // Auto-open monologue from URL on mount (e.g. shared link /monologues?m=123)
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (didAutoOpenRef.current) return;
    const mId = searchParams.get("m");
    if (!mId) return;
    const id = parseInt(mId, 10);
    if (isNaN(id)) return;
    didAutoOpenRef.current = true;
    api.get<Monologue>(`/api/monologues/${id}`)
      .then((res) => setSelectedMonologue(res.data))
      .catch(() => {});
  }, []);

  type DebugTiming = {
    tier?: number;
    optimize_ms?: number;
    ai_parse_ms?: number;
    ai_parse_source?: string;
    embedding_ms?: number;
    embedding_source?: string;
    filters_ms?: number;
    filters_merged?: Record<string, string>;
    total_ms?: number;
    result_count?: number;
    candidates?: number;
    results_source?: string;
    hard_filters?: Record<string, string>;
  };

  type SearchResponseShape = {
    results: Monologue[];
    total: number;
    page: number;
    page_size: number;
    corrected_query?: string | null;
    query_may_have_typos?: boolean;
    content_gap?: {
      play: string | null;
      author: string | null;
      /** Set when we DO carry the title, just not under the current tab. */
      available_in?: string[] | null;
      /** The play or author is listed, with zero monologues behind it. */
      carried_but_empty?: boolean;
    } | null;
    scene_gap?: boolean;
    query_invalid_reason?: string | null;
    weak_match?: boolean;
    broadened?: { relaxed: string[] } | null;
    parsed_constraints?: Record<string, unknown> | null;
    debug_timing?: DebugTiming | null;
    search_log_id?: number | null;
  };

  // Links a monologue open back to the search that produced it (?slid= on the
  // detail fetch -> monologue_views.search_log_id, funnel analytics).
  const searchLogIdRef = useRef<number | null>(null);

  // First focus of the search box this mount. With first_search_submitted it
  // splits "never touched the box" from "typed and bailed".
  const searchBoxFocusedRef = useRef(false);
  const noteSearchBoxFocused = () => {
    if (searchBoxFocusedRef.current) return;
    searchBoxFocusedRef.current = true;
    trackEvent("search_box_focused", { mode: searchMode });
  };

  const performSearch = async (
    searchQuery: string,
    searchFilters: typeof filters,
    pageNum: number = 1,
    append: boolean = false,
    maxOverdoneScoreOverride?: number
  ) => {
    setShowFiltersSheet(false);
    userStoppedRef.current = false;

    // Cancel any in-flight search
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const effectiveMaxOverdone = maxOverdoneScoreOverride ?? maxOverdoneScore;
    if (!append) {
      setIsPlaysLoading(true);
      setSearchError(null);
      setSearchUpgradeUrl(null);
      setCorrectedQuery(null);
      setQueryMayHaveTypos(false);
      setWeakMatch(false);
      setBroadened(null);
      // A genuinely new query forgets any constraint chips the user dismissed;
      // a chip-removal re-run keeps the same query text, so its ignores persist.
      if (searchQuery !== lastParsedQueryRef.current) {
        ignoredConstraintsRef.current = [];
      }
      lastParsedQueryRef.current = searchQuery;
    } else {
      setIsLoadingMore(true);
    }
    setHasSearched(true);
    setRestoredFromLastSearch(false);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(pageNum), source_type: "play" });
      /* `source_type` is the Film & TV chip's field and this shelf is plays;
         letting it through the loop below would overwrite the pin above. */
      if (searchQuery.trim()) params.set("q", searchQuery);
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (key === "source_type") return;
        if (value) params.append(key, value);
      });
      if (effectiveMaxOverdone < 1) params.set("max_overdone_score", String(effectiveMaxOverdone));
      if (ignoredConstraintsRef.current.length) params.set("ignore", ignoredConstraintsRef.current.join(","));

      const _searchStart = Date.now();
      setFrontendSearchStart(_searchStart);
      const response = await api.get<SearchResponseShape>(
        `/api/monologues/search?${params.toString()}`,
        { timeoutMs: 180000, signal: controller.signal }
      );
      const _searchEnd = Date.now();
      setFrontendSearchMs(_searchEnd - _searchStart);
      const data = response.data;
      if (data.debug_timing) setDebugTiming(data.debug_timing);
      searchLogIdRef.current = data.search_log_id ?? null;
      const newResults = data.results;

      if (append) {
        setResults((prev) => [...prev, ...newResults]);
      } else {
        setResults(newResults);
        setCorrectedQuery(data.corrected_query ?? null);
        setQueryMayHaveTypos(data.query_may_have_typos ?? false);
        setContentGap(data.content_gap ?? null);
        setSceneGap(data.scene_gap ?? false);
        setQueryInvalidReason(data.query_invalid_reason ?? null);
        setWeakMatch(Boolean(data.weak_match));
        setBroadened(data.broadened ?? null);
        setParsedConstraints(data.parsed_constraints ?? null);
      }
      setTotal(data.total);
      setPage(data.page);
      setHasMore(newResults.length === PAGE_SIZE && newResults.length < data.total);

      // Track GA4 search event (first page only)
      if (pageNum === 1 && searchQuery.trim()) {
        trackSearchPerformed({ query: searchQuery, results_count: data.total, search_type: "monologue" });
      }

      // Cache results (first page only) in sessionStorage keyed by query+filters
      if (pageNum === 1) {
        playsActionAtRef.current = Date.now();
        const storageKey = `search_results_${searchQuery}_${JSON.stringify(searchFilters)}_${effectiveMaxOverdone}`;
        // Persist the response-level signals too, or a cache-restore drops the
        // constraint chips, the relaxation notice, and the weak-match banner.
        // (band is per-item, so it already survives inside items.)
        sessionStorage.setItem(storageKey, JSON.stringify({
          items: newResults,
          total: data.total,
          parsed_constraints: data.parsed_constraints ?? null,
          broadened: data.broadened ?? null,
          weak_match: Boolean(data.weak_match),
        }));
        // Persist correction alongside the cached results so it survives URL-driven restores
        const correctionKey = `search_correction_${searchQuery}_${JSON.stringify(searchFilters)}_${effectiveMaxOverdone}`;
        sessionStorage.setItem(correctionKey, data.corrected_query ?? "");
        const savedFilters = { ...searchFilters, max_overdone_score: effectiveMaxOverdone };
        sessionStorage.setItem(
          LAST_SEARCH_KEY,
          JSON.stringify({
            query: searchQuery,
            filters: savedFilters,
            results: newResults,
            total: data.total,
          })
        );
        sessionStorage.setItem(SEARCH_LAST_MODE_KEY, "plays");
        setQueryUsedForResults(searchQuery);
        addSearchToHistory({
          query: searchQuery,
          filters: savedFilters,
          resultPreviews: newResults.slice(0, 3),
          resultCount: data.total,
        });
        const newParams = new URLSearchParams();
        newParams.set("mode", "plays");
        if (searchQuery) newParams.set("q", searchQuery);
        Object.entries(searchFilters).forEach(([key, value]) => {
          if (value) newParams.set(key, value);
        });
        if (effectiveMaxOverdone < 1) newParams.set("max_overdone_score", String(effectiveMaxOverdone));
        router.replace(`/monologues?${newParams.toString()}`, { scroll: false });
        // Increment results view count for "every other search" feedback prompt
        try {
          const prev = parseInt(sessionStorage.getItem(RESULTS_VIEW_COUNT_KEY) || "0", 10);
          const next = (Number.isNaN(prev) ? 0 : prev) + 1;
          sessionStorage.setItem(RESULTS_VIEW_COUNT_KEY, String(next));
          setResultsViewCount(next);
        } catch {
          // ignore
        }
      }
    } catch (error: unknown) {
      if (userStoppedRef.current) { userStoppedRef.current = false; return; }
      // If a newer search replaced this one, ignore the abort error silently
      if (searchAbortRef.current !== controller) return;
      const res = (error as { response?: { data?: { detail?: string | { message?: string; upgrade_url?: string } } } })?.response;
      const raw = res?.data?.detail;
      const message =
        typeof raw === "string"
          ? raw
          : raw && typeof raw === "object" && "message" in raw
            ? (raw as { message: string }).message
            : error instanceof Error
              ? error.message
              : "Search failed. Please try again.";
      const upgradeUrl = raw && typeof raw === "object" && "upgrade_url" in raw ? (raw as { upgrade_url: string }).upgrade_url : null;
      setSearchError(message);
      setSearchUpgradeUrl(upgradeUrl ?? null);
      if (!append) { setResults([]); setContentGap(null); setQueryInvalidReason(null); }
    } finally {
      // Only clear loading if this search is still the active one
      // (a newer search may have replaced our controller)
      if (searchAbortRef.current === controller) {
        setIsPlaysLoading(false);
      }
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    const hasQueryOrFilters = playsQuery.trim() !== "" || Object.entries(filters).some(([, v]) => v !== "") || maxOverdoneScore < 1;
    if (!hasQueryOrFilters || isLoadingMore || !hasMore) return;
    performSearch(playsQuery, filters, page + 1, true);
  };

  const handleSearch = async () => {
    if (searchMode === "film_tv") {
      const hasQueryOrFilters = filmTvQuery.trim() !== "" || Object.entries(filters).some(([, v]) => v !== "") || maxOverdoneScore < 1;
      if (!hasQueryOrFilters) {
        nudgeEmpty();
        return;
      }
      // Cancel any in-flight search
      userStoppedRef.current = false;

      if (filmTvAbortRef.current) filmTvAbortRef.current.abort();
      const controller = new AbortController();
      filmTvAbortRef.current = controller;
      setFilmTvHasSearched(true);
      setIsFilmTvLoading(true);
      setSearchError(null);
      setQueryInvalidReason(null);
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1", source_type: filters.source_type || "film,tv" });
        if (filmTvQuery.trim()) params.set("q", filmTvQuery.trim());
        // Apply the same filters as plays
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        if (maxOverdoneScore < 1) params.set("max_overdone_score", String(maxOverdoneScore));

        const _ftSearchStart = Date.now();
        setFrontendSearchStart(_ftSearchStart);
        const res = await api.get<SearchResponseShape>(
          `/api/monologues/search?${params.toString()}`,
          { timeoutMs: 180000, signal: controller.signal }
        );
        setFrontendSearchMs(Date.now() - _ftSearchStart);
        if (res.data.debug_timing) setDebugTiming(res.data.debug_timing);
        searchLogIdRef.current = res.data.search_log_id ?? null;

        // Check if query was flagged as invalid (gibberish, etc.)
        if (res.data.query_invalid_reason) {
          setQueryInvalidReason(res.data.query_invalid_reason);
          setFilmTvResults([]);
          setFilmTvTotal(0);
          setIsFilmTvLoading(false);
          return;
        }

        setFilmTvResults(res.data.results);
        setFilmTvTotal(res.data.total);
        setQueryUsedForResults(filmTvQuery.trim());

        // Track GA4 search event for film/TV
        if (filmTvQuery.trim()) {
          trackSearchPerformed({ query: filmTvQuery.trim(), results_count: res.data.total, search_type: "film_tv" });
        }

        // Persist so refresh or navigating away and back keeps Film & TV results (like plays).
        try {
          const payload = { query: filmTvQuery.trim(), results: res.data.results, total: res.data.total };
          sessionStorage.setItem(FILM_TV_LAST_SEARCH_KEY, JSON.stringify(payload));
          const cacheKey = `film_tv_results_${filmTvQuery.trim()}`;
          sessionStorage.setItem(cacheKey, JSON.stringify({ results: res.data.results, total: res.data.total }));
          sessionStorage.setItem(SEARCH_LAST_MODE_KEY, "film_tv");
        } catch (e) {
          console.error("Error persisting film_tv search:", e);
        }
        // Increment results view count for feedback prompt
        try {
          const prev = parseInt(sessionStorage.getItem(FILM_TV_RESULTS_VIEW_COUNT_KEY) || "0", 10);
          const next = (Number.isNaN(prev) ? 0 : prev) + 1;
          sessionStorage.setItem(FILM_TV_RESULTS_VIEW_COUNT_KEY, String(next));
          setFilmTvResultsViewCount(next);
        } catch {
          // ignore
        }
        // Update URL so refresh / back keeps Film & TV section and state.
        const urlParams = new URLSearchParams();
        urlParams.set("mode", "film_tv");
        if (filmTvQuery.trim()) urlParams.set("q", filmTvQuery.trim());
        router.replace(`/monologues?${urlParams.toString()}`, { scroll: false });
      } catch (err: unknown) {
        if (userStoppedRef.current) { userStoppedRef.current = false; return; }
        if (filmTvAbortRef.current !== controller) return;
        const msg = err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Search failed.";
        setSearchError(typeof msg === "string" ? msg : "Search failed.");
        setFilmTvResults([]);
        setFilmTvTotal(0);
      } finally {
        if (filmTvAbortRef.current === controller) {
          setIsFilmTvLoading(false);
        }
      }
      return;
    }
    const hasQueryOrFilters = playsQuery.trim() !== "" || Object.entries(filters).some(([, v]) => v !== "") || maxOverdoneScore < 1;
    if (!hasQueryOrFilters) {
      nudgeEmpty();
      return;
    }
    await performSearch(playsQuery, filters);
  };

  /** First name only. A full name in "Casting you, …" reads like a letter from
   *  a bank; a first name reads like the stage manager calling you. */
  const firstName = useMemo(() => {
    const raw = (profileData?.name || user?.name || "").trim();
    return raw ? raw.split(/\s+/)[0] : null;
  }, [profileData?.name, user?.name]);

  /** The profile fields the recommendation is actually keyed on, shown during
   *  the wait so the feature explains itself instead of asking for trust. */
  const forYouFacts = useMemo(() => {
    if (!profileData) return [];
    return [
      profileData.gender && profileData.gender !== "prefer not to say"
        ? profileData.gender
        : null,
      profileData.age_range,
      ...(profileData.preferred_genres ?? []).slice(0, 2),
    ].filter((x): x is string => Boolean(x));
  }, [profileData]);

  const handleFindForMe = async () => {
    // Only block if the profile is truly empty (0%). Any partial info is
    // enough to surface useful recommendations — the backend handles
    // missing fields gracefully.
    const profileEmpty = profileStats != null && profileStats.completion_percentage === 0;
    if (profileEmpty) {
      setShowProfileCompleteModal(true);
      return;
    }

    /* Which shelf the actor is standing at. This used to be hardcoded to
       plays: it set the play loading flag, wrote into the play results and
       pinned the stored mode to "plays", so pressing it from Film & TV would
       have run a play search and dropped the answers where that tab cannot
       show them. The recommender takes a source filter now. */
    const onScreen = searchMode === "film_tv";

    setIsFindingForMe(true);
    if (onScreen) {
      setIsFilmTvLoading(true);
      setFilmTvHasSearched(true);
      setFilmTvQuery("");
    } else {
      setIsPlaysLoading(true);
      setHasSearched(true);
      setPlaysQuery("");
    }
    setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" }); // Clear filters

    try {
      const response = await api.get<Monologue[]>(
        `/api/monologues/recommendations?limit=20${onScreen ? "&source_type=film,tv" : ""}`,
      );
      if (onScreen) {
        setFilmTvResults(response.data);
        setFilmTvTotal(response.data.length);
      } else {
        setResults(response.data);
      }
      setCorrectedQuery(null);

      // Persist AI "Find for me" results as the last search so that
      // navigating away and back to /monologues keeps them visible.
      sessionStorage.setItem(
        onScreen ? FILM_TV_LAST_SEARCH_KEY : LAST_SEARCH_KEY,
        JSON.stringify({
          query: "",
          filters: { gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" },
          results: response.data,
          total: response.data.length,
        })
      );
      sessionStorage.setItem(SEARCH_LAST_MODE_KEY, onScreen ? "film_tv" : "plays");

      // Update URL to reflect AI search, on the shelf it was run from.
      router.replace(
        onScreen ? "/monologues?mode=film_tv&ai=true" : "/monologues?ai=true",
        { scroll: false },
      );

      // Increment results view count for "every other search" feedback prompt
      try {
        const prev = parseInt(sessionStorage.getItem(RESULTS_VIEW_COUNT_KEY) || "0", 10);
        const next = (Number.isNaN(prev) ? 0 : prev) + 1;
        sessionStorage.setItem(RESULTS_VIEW_COUNT_KEY, String(next));
        setResultsViewCount(next);
      } catch {
        // ignore
      }
    } catch (error) {
      const err = error as { response?: { status?: number }; message?: string };
      const isProfileError =
        err?.response?.status === 400 ||
        (typeof err?.message === "string" && /profile|complete your profile|actor profile not found/i.test(err.message));
      if (isProfileError) {
        setShowProfileCompleteModal(true);
      } else {
        console.error("Find For Me error:", error);
      }
      if (onScreen) setFilmTvResults([]);
      else setResults([]);
    } finally {
      if (onScreen) setIsFilmTvLoading(false);
      else setIsPlaysLoading(false);
      setIsFindingForMe(false);
    }
  };

  const openMonologue = (mono: Monologue, position?: number, resultSearchType?: "monologue" | "film_tv") => {
    trackResultClicked({
      monologue_id: mono.id,
      title: mono.title || mono.character_name,
      position: position ?? 0,
      search_type: resultSearchType ?? (searchMode === "film_tv" ? "film_tv" : "monologue"),
    });
    setSelectedMonologue(mono);
    setIsLoadingDetail(false);
    setIsReadingMode(false);
    // Reflect the open monologue in the URL so it's shareable
    const params = new URLSearchParams(searchParams.toString());
    params.set("m", mono.id.toString());
    router.replace(`/monologues?${params.toString()}`, { scroll: false });
    // Fetch fresh data in background (view count, etc.); slid ties the open
    // back to the search that produced it, rank says how far down the list it
    // was (1-based). Together they are the click-through record for that search.
    const slid = searchLogIdRef.current;
    const open = new URLSearchParams();
    if (slid) {
      open.set("slid", String(slid));
      if (position != null) open.set("rank", String(position + 1));
    }
    const qs = open.toString();
    api.get<Monologue>(`/api/monologues/${mono.id}${qs ? `?${qs}` : ""}`)
      .then((response) => setSelectedMonologue(response.data))
      .catch(() => {});
  };

  const closeMonologue = () => {
    setSelectedMonologue(null);
    setIsReadingMode(false);
    setShowDownloadMenu(false);
    // Remove ?m from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete("m");
    const newUrl = params.toString() ? `/monologues?${params.toString()}` : "/monologues";
    router.replace(newUrl, { scroll: false });
  };

  const downloadMonologue = (mono: Monologue, format: 'text' | 'pdf' = 'text') => {
    if (format === 'text') {
      const content = `MONOLOGUE: ${mono.character_name}
From: ${mono.play_title} by ${mono.author}

${mono.scene_description ? `SCENE DESCRIPTION:\n${mono.scene_description}\n\n` : ''}MONOLOGUE TEXT:\n${mono.text}${mono.stage_directions ? `\n\nSTAGE DIRECTIONS:\n${mono.stage_directions}` : ''}

---
Duration: ${Math.floor(mono.estimated_duration_seconds / 60)}:${(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')}
Word Count: ${mono.word_count}
${mono.primary_emotion ? `Primary Emotion: ${mono.primary_emotion}` : ''}
${mono.character_gender ? `Character Gender: ${mono.character_gender}` : ''}
${mono.character_age_range ? `Age Range: ${mono.character_age_range}` : ''}
`;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mono.character_name.replace(/\s+/g, '_')}_${mono.play_title.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // PDF download using browser's print functionality
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${mono.character_name} - ${mono.play_title}</title>
  <style>
    @media print {
      @page {
        margin: 1in;
      }
    }
    body {
      font-family: 'Times New Roman', serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    h2 {
      font-size: 18px;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #666;
    }
    .metadata {
      font-size: 14px;
      color: #666;
      margin-bottom: 20px;
      padding: 10px;
      background-color: #f5f5f5;
      border-left: 3px solid #333;
    }
    .monologue-text {
      font-size: 16px;
      line-height: 1.8;
      margin: 20px 0;
      white-space: pre-wrap;
      text-align: justify;
    }
    .stage-directions {
      font-style: italic;
      color: #666;
      margin-top: 15px;
      padding: 10px;
      background-color: #f9f9f9;
      border-left: 2px solid #ccc;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${mono.character_name}</h1>
  <div class="metadata">
    <strong>From:</strong> ${mono.play_title} by ${mono.author}<br>
    ${mono.character_gender ? `<strong>Character Gender:</strong> ${mono.character_gender}<br>` : ''}
    ${mono.character_age_range ? `<strong>Age Range:</strong> ${mono.character_age_range}<br>` : ''}
    ${mono.primary_emotion ? `<strong>Primary Emotion:</strong> ${mono.primary_emotion}<br>` : ''}
    <strong>Duration:</strong> ${Math.floor(mono.estimated_duration_seconds / 60)}:${(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')}<br>
    <strong>Word Count:</strong> ${mono.word_count}
  </div>
  
  ${mono.scene_description ? `<h2>Scene Description</h2><p class="stage-directions">${mono.scene_description}</p>` : ''}
  
  <h2>Monologue</h2>
  <div class="monologue-text">${mono.text.replace(/\n/g, '<br>')}</div>
  
  ${mono.stage_directions ? `<div class="stage-directions"><strong>Stage Directions:</strong> ${mono.stage_directions}</div>` : ''}
  
  <div class="footer">
    <p>Downloaded from ActorRise</p>
  </div>
  
  <script>
    window.onload = function() {
      window.print();
      setTimeout(() => window.close(), 100);
    };
  </script>
</body>
</html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  const queryClient = useQueryClient();
  const updateMonoFav = (setter: React.Dispatch<React.SetStateAction<Monologue[]>>, id: number, favorited: boolean) => {
    setter(prev => prev.map(m => m.id === id ? { ...m, is_favorited: favorited, favorite_count: favorited ? (m.favorite_count ?? 0) + 1 : Math.max(0, (m.favorite_count ?? 1) - 1) } : m));
  };
  const toggleFavorite = async (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    const previousResults = results;
    const previousFilmTvResults = filmTvResults;
    const previousSelected = selectedMonologue;
    const monologueId = mono.id;

    try {
      if (mono.is_favorited) {
        updateMonoFav(setResults, mono.id, false);
        updateMonoFav(setFilmTvResults, mono.id, false);
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue(prev => prev ? { ...prev, is_favorited: false, favorite_count: prev.favorite_count - 1 } : null);
        }
        // Remove from the Collection cache instantly.
        queryClient.setQueryData<Monologue[]>(["bookmarks"], (old) => (old ?? []).filter((m) => m.id !== mono.id));
        await api.delete(`/api/monologues/${mono.id}/favorite`);
        toastBookmark(false, {
          duration: 5000,
          label: "Monologue",
          onUndo: async () => {
            try {
              await api.post(`/api/monologues/${monologueId}/favorite`);
              updateMonoFav(setResults, monologueId, true);
              updateMonoFav(setFilmTvResults, monologueId, true);
              setSelectedMonologue(prev => prev?.id === monologueId ? { ...prev, is_favorited: true, favorite_count: (prev.favorite_count ?? 0) + 1 } : prev);
              queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
            } catch {
              toast.error("Couldn't restore bookmark.");
            }
          },
        });
      } else {
        updateMonoFav(setResults, mono.id, true);
        updateMonoFav(setFilmTvResults, mono.id, true);
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue(prev => prev ? { ...prev, is_favorited: true, favorite_count: (prev.favorite_count ?? 0) + 1 } : null);
        }
        // Write into the Collection cache instantly so it shows up immediately
        // (search results live in component state, not this query cache).
        queryClient.setQueryData<Monologue[]>(["bookmarks"], (old) => {
          const list = old ?? [];
          return list.some((m) => m.id === mono.id)
            ? list
            : [{ ...mono, is_favorited: true, memorized: false, favorite_count: (mono.favorite_count ?? 0) + 1 }, ...list];
        });
        await api.post(`/api/monologues/${mono.id}/favorite`);
        toastBookmark(true, {
          duration: 5000,
          label: "Monologue",
          onUndo: async () => {
            try {
              await api.delete(`/api/monologues/${monologueId}/favorite`);
              updateMonoFav(setResults, monologueId, false);
              updateMonoFav(setFilmTvResults, monologueId, false);
              setSelectedMonologue(prev => prev?.id === monologueId ? { ...prev, is_favorited: false, favorite_count: Math.max(0, (prev.favorite_count ?? 1) - 1) } : prev);
              queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
            } catch {
              toast.error("Couldn't remove bookmark.");
            }
          },
        });
      }
    } catch (error) {
      setResults(previousResults);
      setFilmTvResults(previousFilmTvResults);
      setSelectedMonologue(previousSelected);
      toast.error("Couldn't update bookmark. Please try again.");
      console.error("Error toggling favorite:", error);
    }
  };

  // Human-readable list of the constraints graceful relaxation loosened
  // ("age and duration"), deduped so max/min duration read as one word.
  const formatRelaxed = (keys: string[]): string => {
    const labels: Record<string, string> = {
      age_range: "age",
      category: "category",
      era: "era",
      max_duration: "duration",
      min_duration: "duration",
    };
    const seen = new Set<string>();
    const words: string[] = [];
    for (const k of keys) {
      const label = labels[k] ?? k.replace(/_/g, " ");
      if (!seen.has(label)) {
        seen.add(label);
        words.push(label);
      }
    }
    if (words.length <= 1) return words[0] ?? "";
    return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
  };

  // Dismiss a parsed-constraint chip: remember to ignore it and re-run the same
  // query so the search stops applying it. Optimistically drop it from the shown
  // chips too, so the UI responds before the request returns.
  const handleRemoveConstraint = (key: string) => {
    if (!ignoredConstraintsRef.current.includes(key)) {
      ignoredConstraintsRef.current = [...ignoredConstraintsRef.current, key];
    }
    setParsedConstraints((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    performSearch(queryUsedForResults, filters);
  };

  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");
  const hasFreshnessFilter = maxOverdoneScore < 1;
  const getFilterDisplay = (key: string, value: string) => `${key.replace(/_/g, " ")}: ${key === "max_duration" ? getDurationLabel(value) : value}`;

  // Sort by confidence score (desc). Best match = only actual quote matches (exact_quote/fuzzy_quote); rest are related.
  const HIGH_SCORE_CAP_FOR_CONFIDENCE = 10; // If more than this many have score >= 0.80, treat as broad query and hide confidence
  const { bestMatches, relatedResults, showConfidence } = useMemo(() => {
    const sorted = [...results].sort(
      (a, b) => (b.relevance_score ?? -1) - (a.relevance_score ?? -1)
    );
    const scores = sorted
      .map((r) => r.relevance_score)
      .filter((s): s is number => s != null && s > 0.1);
    const highCount = scores.filter((s) => s >= 0.80).length;
    const showConf = scores.length > 0 && highCount <= HIGH_SCORE_CAP_FOR_CONFIDENCE;

    const best: Monologue[] = [];
    const related: Monologue[] = [];
    for (const mono of sorted) {
      if (showConf && (mono.match_type === "exact_quote" || mono.match_type === "fuzzy_quote")) {
        best.push(mono);
      } else {
        related.push(mono);
      }
    }

    return {
      bestMatches: best,
      relatedResults: related,
      showConfidence: showConf,
    };
  }, [results]);

  /**
   * Whether the tab you are looking at has stopped being a hero and become a
   * results screen. Per-tab: switch to a shelf you have not searched and you
   * get its opening view, title and all.
   *
   * This used to be `hasSearched || filmTvHasSearched` — held compact once
   * *either* side had searched — because the change was so violent. The page
   * went from max-w-3xl to max-w-[88rem] on a tab tap, so everything re-centred
   * and reflowed 640px sideways while the title animated back in underneath it.
   * The width is what made it read as a page load rather than a transition.
   *
   * The page now keeps one measure at all times (see the container below), so
   * nothing moves horizontally and the only changes left are vertical ones that
   * can be animated.
   */
  const chromeCompact = searchMode === "film_tv" ? filmTvHasSearched : hasSearched;

  /* "a woman confronting her mother" returned twenty rows every one of which
     said `name match`, which distinguishes nothing and just repeats a word down
     the page. Worked out per result set, not per row. */
  const playsMatchMark = useMemo(() => matchMarkIsUseful(results), [results]);
  const filmTvMatchMark = useMemo(() => matchMarkIsUseful(filmTvResults), [filmTvResults]);

  /* The same argument, applied to the source line. "shakespeare monologue"
     printed "William Shakespeare" and "classical" on all eighteen rows; a fact
     that never varies inside a result set is something the eye has to read
     past on every row to reach the part that differs. Said once above the
     results instead, and left off the rows. Worked out per result set, because
     a row cannot know what the rows around it say. */
  const playsFacts = useMemo(() => constantFacts(results), [results]);
  const filmTvFacts = useMemo(() => constantFacts(filmTvResults), [filmTvResults]);
  const playsShared = useMemo(
    () => ({ author: !!playsFacts.author, era: !!playsFacts.era }),
    [playsFacts],
  );
  const filmTvShared = useMemo(
    () => ({ author: !!filmTvFacts.author, era: !!filmTvFacts.era }),
    [filmTvFacts],
  );

  const isPersonalized = !!(
    profileData?.profile_bias_enabled &&
    ((profileData.preferred_genres?.length ?? 0) > 0 || profileData.experience_level || profileData.training_background)
  );

  /* Film & TV is in here too now. The map used to cover Plays only, which was
     invisible while it merely re-sorted a list, but the `your lane` mark reads
     from it — leaving Film & TV out would have meant the mark silently never
     appearing on that tab. */
  const profileMatchMap = useMemo(() => {
    if (!isPersonalized) return new Map<number, ProfileMatch>();
    const map = new Map<number, ProfileMatch>();
    results.forEach((mono) => map.set(mono.id, computeProfileMatch(mono, profileData)));
    filmTvResults.forEach((mono) => map.set(mono.id, computeProfileMatch(mono, profileData)));
    return map;
  }, [results, filmTvResults, profileData, isPersonalized]);

  const sortedRelated = useMemo(() => {
    if (!isPersonalized) return relatedResults;
    return [...relatedResults].sort(
      (a, b) => (profileMatchMap.get(b.id)?.score ?? 0) - (profileMatchMap.get(a.id)?.score ?? 0),
    );
  }, [relatedResults, profileMatchMap, isPersonalized]);

  /**
   * Change shelves. Each tab keeps its own query and its own results, and
   * tapping one never fires a search — you get that tab as you left it, or its
   * starting shelf if you have not been there yet. Carrying the query across
   * and re-running it was tried and pulled: a tab tap is a look around, not a
   * search, and spending a request on it turned a glance into a wait.
   */
  const switchMode = (target: "plays" | "film_tv") => {
    if (target === searchMode) return;
    const query = target === "plays" ? playsQuery : filmTvQuery;
    if (target === "plays") playsActionAtRef.current = Date.now();
    else filmTvActionAtRef.current = Date.now();

    setSearchMode(target);
    setSearchError(null);
    setOutlineFlash(target);

    const params = new URLSearchParams();
    params.set("mode", target);
    if (query) params.set("q", query);
    if (target === "plays") {
      Object.keys(filters).forEach((key) => {
        const value = filters[key as keyof typeof filters];
        if (value) params.set(key, value);
      });
      if (maxOverdoneScore < 1) params.set("max_overdone_score", String(maxOverdoneScore));
    }
    router.replace(`/monologues?${params.toString()}`, { scroll: false });
  };

  /**
   * "Joker lives in Film & TV → Take me there" used to do nothing visible.
   * It called setSearchMode and stopped there — but each tab keeps its OWN query
   * state, so you landed on the other tab with an empty box and no search ever
   * ran. The tab buttons had always carried their query into the URL; this path
   * never did. Same move as those buttons, with the query brought along.
   */
  const switchSourceWithQuery = useCallback(
    (sourceType: string) => {
      const target = sourceType === "play" ? "plays" : "film_tv";
      const carried = (searchMode === "plays" ? playsQuery : filmTvQuery).trim();
      if (target === "plays") setPlaysQuery(carried);
      else setFilmTvQuery(carried);
      setSearchMode(target);
      setSearchError(null);
      setOutlineFlash(target);
      const params = new URLSearchParams();
      params.set("mode", target);
      if (carried) params.set("q", carried);
      router.replace(`/monologues?${params.toString()}`, { scroll: false });
    },
    [searchMode, playsQuery, filmTvQuery, router],
  );

  /* The transition choreography (handoff §5), as three named shapes so the
     call sites cannot drift apart.

     `fall` is what the outgoing block does on submit — it drops and shrinks a
     little rather than sliding up, so it reads as scenery being struck rather
     than the page scrolling. `liftout` is the curtain clearing once results
     land: up and away, the opposite direction, because it is flown out rather
     than struck. Under reduced motion both collapse to a plain swap. */
  const FALL = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 28, scale: 0.985, transition: { duration: 0.42, ease: [0.4, 0, 1, 1] as const } };
  const LIFT_OUT = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: -40, scale: 0.96, transition: { duration: 0.48, ease: [0.4, 0, 1, 1] as const } };
  const RISE_IN = reducedMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } };

  /* The head's two lines of copy. The row is a fixed height, so these only
     ever change wording — never how much room they take. */
  const headState: "searching" | "results" | "empty" = isLoading
    ? "searching"
    : chromeCompact
      ? "results"
      : "empty";

  /* "tonight?" was hardcoded. Actors audition in the morning, prepare over
     lunch and self-tape whenever the room is quiet, and a page that insists it
     is night to someone searching at 9am is a page that is not paying
     attention. Read off the visitor's own clock.

     Rendered through useSyncExternalStore rather than an effect, so the server
     and the first client pass agree: the server has no clock worth trusting,
     so it emits the neutral word and the client swaps in the right one. */
  const whenWord = useSyncExternalStore(
    subscribeNever,
    () => {
      const h = new Date().getHours();
      if (h < 12) return "this morning";
      if (h < 17) return "today";
      return "tonight";
    },
    () => "today",
  );

  const headDirection =
    /* The shake alone says "no", not "no, because". The direction line is
       already the page's voice; it holds the answer until the box has one. */
    jitter
      ? "(give me something. a feeling, a play, a name.)"
      : headState === "searching"
      ? "(the house goes quiet.)"
      : headState === "results"
        ? "(lights to half.)"
        : searchMode === "film_tv"
          ? "(film & tv. the screen shelf.)"
          : "(the search. say it out loud.)";

  const headTitle =
    headState === "searching" ? (
      <em className="t-em" style={{ color: "var(--acc)" }}>
        Looking.
      </em>
    ) : headState === "results" ? (
      <>
        Here&rsquo;s what{" "}
        <em className="t-em" style={{ color: "var(--acc)" }}>
          came back.
        </em>
      </>
    ) : (
      <>
        What do you{" "}
        <em className="t-em" style={{ color: "var(--acc)" }}>
          need
        </em>{" "}
        {whenWord}?
      </>
    );

  /* The mode-switch flash. It used to carry two hardcoded rgba() bloom
     values, one per mode, which is exactly the kind of thing --acc exists to
     stop: the colour now comes from the theme like everything else. */
  const outlineOverlay =
    typeof document !== "undefined" &&
    outlineFlash &&
    createPortal(
      <div
        key={outlineFlash}
        className="t-outline-flash"
        data-search-mode={outlineFlash}
        onAnimationEnd={() => setOutlineFlash(null)}
      />,
      document.body,
    );

  /**
   * The starting shelf, shared by both tabs.
   *
   * One key for both, so moving between tabs updates the contents in place
   * instead of exiting and re-entering the whole block — the switch should read
   * as the same shelf restocked.
   */
  const preSearchView = (
    <motion.div
      key="presearch"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={FALL}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* Directly under the search bar, and first.
          An empty search box is the loneliest screen we own, and this is the
          only thing on the page saying other actors are here tonight. It also
          happens to be the best answer to "what do I type?" — eight queries
          real people ran today, each one live. Both of those jobs are done at
          the search bar and nowhere else: placed further down (it was
          originally below the shelves, 1158px in) it was past the fold on
          every laptop and might as well not have existed.
          It is two lines tall and renders nothing when the house is quiet, so
          it costs the shelves below almost no room and never advertises the
          silence. */}
      <div className="mt-7 mb-8">
        <HouseIsHunting />
      </div>
      {/* Personalization, surfaced by default (not hidden behind "Find for
          me"): profile-havers rehearse ~1.6x more. Recruits a profile when
          there isn't one. Plays only — film/TV recs are separate. */}
      {/* Two shelves, side by side where there is room. */}
      <div
        className="mt-10 grid gap-12"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))" }}
      >
        {searchMode === "plays" && <ForYouShelf />}
        <TrendingPreSearch />
      </div>
      {/* Last, not first: the shelves are personal and current, these are the
          fallback for when nothing there catches you. */}
      <StartingPoints mode={searchMode} />
    </motion.div>
  );

  return (
    // One measure for the whole page, always.
    //
    // At 88rem the results ran 1360px wide while the search bar above them was
    // 672. Both were centred, but the disparity meant the bar floated in the
    // middle of a much wider block and no two things shared an edge. At one
    // width, tabs, bar, count and speeches all start and end together.
    //
    // It used to widen back to 88rem before a search, which is what made
    // switching to an unsearched tab feel like a page load: the whole column
    // sprang 640px wider and re-centred while the title faded in underneath.
    // Holding the measure means a tab tap changes nothing horizontally, and the
    // opening view can arrive as a transition instead of a reload.
    <div
      className={`theatre-tokens theatre-search ${theatreFontVars} relative mx-auto w-full max-w-[1160px] px-5 pb-32 pt-8 md:px-[14px] sm:pt-14`}
      data-search-mode={searchMode satisfies SearchMode}
    >
      {/* Behind the page, not on it, so the shelf colour reaches the edges of
          the viewport rather than stopping at the container. */}
      <div aria-hidden className="t-search-wash" />
      {outlineOverlay}

      {/* The search head.
          
          One height in every state, which is the whole point: the direction
          and the H1 change wording as you search, but the row does not change
          size, so results landing never shoves the page under the reader's
          eye. That is why the H1 is nowrap + ellipsis rather than wrapping —
          "What do you need tonight?" is longer than "Looking." and a wrapping
          headline would move everything below it by a line.

          This replaces the old chromeCompact behaviour, which hid the title
          and stuck the bar to the top after a search. The fixed-height row is
          the design's answer to the same problem. */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-80">
            <div className="flex items-center gap-3">
              {/* Which shelf you are on, drawn. The tab and the caption both
                  say it in words; this says it at a glance, and redrawing on
                  every switch is what makes the press feel like an event. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={searchMode}
                  className="t-shelf-mark"
                  aria-hidden
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  {searchMode === "film_tv" ? (
                    <ClapperSketch size={30} eager />
                  ) : (
                    <MasksSketch size={30} eager />
                  )}
                </motion.span>
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={headDirection}
                  className="t-dir"
                  style={{ color: "var(--t-muted-dark-2)" }}
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {headDirection}
                </motion.p>
              </AnimatePresence>
            </div>
            <h1
              className="mt-2"
              style={{
                fontFamily: "var(--t-display)",
                fontWeight: 400,
                fontSize: "clamp(2.4rem, 5vw, 4.2rem)",
                lineHeight: 0.95,
                letterSpacing: "-0.02em",
                color: "var(--t-text)",
                /* Two lines' worth, always reserved. That is what keeps the
                   row one height across every state — the old nowrap+ellipsis
                   did the same job by cutting the sentence off, which read as
                   a rendering fault rather than a design. */
                minHeight: "1.9em",
                textWrap: "balance",
              }}
            >
              {headTitle}
            </h1>
          </div>

          {/* Plays vs Film & TV. Still 44px targets, still switchMode.

              The column is pinned to the toggle's width (two 124px tabs plus
              the 1px gap and the 1px border either side). The caption beneath
              it changes length with the shelf, and as the widest child it was
              setting this column's width — which took 114px off the headline's
              measure on every switch and reflowed the whole head. It wraps
              inside a fixed box now instead of deciding one. */}
          <div className="w-[252px] shrink-0">
            <div
              className="inline-flex gap-1 p-1"
              style={{
                borderRadius: 999,
                border: "1.5px solid var(--t-text)",
                background: "var(--t-paper)",
              }}
            >
              {MODE_TABS.map((tab) => {
                const active = searchMode === tab.mode;
                const isFilm = tab.mode === "film_tv";
                return (
                  <button
                    key={tab.mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => switchMode(tab.mode)}
                    className="relative inline-flex min-h-[44px] items-center justify-center gap-2 px-4 text-sm font-semibold transition-transform hover:scale-[1.04]"
                    style={{
                      borderRadius: 999,
                      transitionTimingFunction: "var(--t-spring)",
                      /* Both tabs hold one width. "Plays" and "Film & TV" are
                         26px apart, so the active pill resized on every switch
                         — which changed the toggle's width, which changed the
                         headline's width by 114px, because the two share a flex
                         row. Nothing downstream was moving because of the
                         chips; it was all this. Equal boxes mean the fill
                         slides and not one other thing on the page reflows. */
                      minWidth: 124,
                      color: active ? "var(--t-on-text)" : "var(--t-muted-dark-2)",
                    }}
                  >
                    {/* One fill that slides between the two tabs, so the switch
                        reads as the same object moving rather than two pills
                        trading colour — the mode change is now the quietest it
                        has been, and this is what carries it. */}
                    {/* The fill sits at z-0, NOT -z-10. A negatively stacked
                        child paints behind its own ancestor's background, so
                        the fill went under the toggle's paper and the active
                        tab rendered as cream text on cream — invisible, and
                        the one tab you most need to see. The label rides above
                        it at z-1. */}
                    {active && (
                      <motion.span
                        layoutId="search-mode-fill"
                        aria-hidden
                        className="absolute inset-0"
                        style={{ borderRadius: 999, background: "var(--t-text)", zIndex: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative z-[1] inline-flex items-center gap-2">
                      {isFilm ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                          <rect x="2" y="4" width="20" height="13" rx="2" />
                          <path d="M8 21h8" />
                        </svg>
                      ) : (
                        /* An open script. The old mark was a proscenium arch
                           with a line across it, which at 16px is an ambiguous
                           shape rather than a picture of anything — the Film &
                           TV tab beside it is a screen and reads instantly,
                           which is the bar. A play is a text. */
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z" />
                          <path d="M12 6.5v13" />
                        </svg>
                      )}
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* The caption is the thing that actually says which shelf you
                are on now that the page no longer changes colour, so it gets
                the same cross-fade as the direction above. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={searchMode}
                /* mt-3.5, not mt-2: the caption was tucked directly under
                   the pill's edge, close enough to read as part of the
                   control rather than as a note about it. */
                className="t-dir mt-3.5 text-right"
                style={{ fontSize: 12, color: "var(--t-faint)", maxWidth: "100%" }}
                initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Short enough to hold one line in the pinned column. The
                    long versions wrapped to two ragged right-aligned lines
                    under the toggle. */}
                {searchMode === "film_tv"
                  ? "(film and tv.)"
                  : "(19,000 pieces.)"}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div>
        {/* The search box.

            One pill on a hard shadow in the mode accent, with "Find for me"
            beside it as a dashed twin — dashed because it is the "I don't know
            what I want" door, and it should not look like the same commitment
            as typing something. Every handler below is the one that was here
            before; only the surface changed. */}
        <div className="flex flex-wrap items-stretch gap-3">
          <div
            className={`group relative flex min-w-0 flex-1 basis-80 items-center gap-3 px-5${
              jitter ? " search-jitter" : ""
            }`}
            onAnimationEnd={() => setJitter(false)}
            style={{
              minHeight: 68,
              borderRadius: 40,
              background: "var(--t-paper)",
              border: "2px solid var(--t-text)",
              boxShadow: "8px 8px 0 var(--acc)",
              transition: "transform .25s var(--t-spring), box-shadow .25s",
            }}
            onFocusCapture={(e) => {
              e.currentTarget.style.transform = "translate(-2px,-2px)";
              e.currentTarget.style.boxShadow = "10px 10px 0 var(--acc)";
            }}
            onBlurCapture={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "8px 8px 0 var(--acc)";
            }}
          >
            <IconSearch className="size-[22px] shrink-0" style={{ color: "var(--t-text)" }} aria-hidden />
            <Input
              id="search-input"
              placeholder={
                typewriterText ||
                (searchMode === "film_tv" ? "Search scripts, scenes, speeches..." : "Search monologues...")
              }
              value={searchMode === "plays" ? playsQuery : filmTvQuery}
              onChange={(e) => {
                const v = e.target.value;
                if (searchMode === "plays") setPlaysQuery(v);
                else setFilmTvQuery(v);
                pauseTypewriter();
                setIsTyping(true);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 800);
              }}
              ref={emptyPromptRef}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              onFocus={() => {
                pauseTypewriter();
                noteSearchBoxFocused();
                if (currentQuery) setIsTyping(true);
              }}
              onBlur={() => {
                setTimeout(() => setIsTyping(false), 200);
                if (!currentQuery) resumeTypewriter();
              }}
              className="min-h-0 flex-1 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              style={{
                fontFamily: "var(--t-body)",
                fontSize: "clamp(17px,1.6vw,21px)",
                fontWeight: 500,
                color: "var(--t-text)",
                borderRadius: 0,
              }}
            />
            {!isLoading && (searchMode === "plays" ? playsQuery : filmTvQuery) && (
              <button
                type="button"
                onClick={() => (searchMode === "plays" ? setPlaysQuery("") : setFilmTvQuery(""))}
                aria-label="Clear search"
                title="Clear"
                className="t-clear-query"
              >
                <IconX className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={isLoading ? stopSearch : handleSearch}
              aria-label={isLoading ? "Stop search" : "Search"}
              className="flex h-11 shrink-0 items-center gap-2.5 pl-5 pr-1.5 text-[15px] font-bold transition-transform hover:scale-[1.04] hover:-rotate-[1.5deg]"
              style={{
                borderRadius: 999,
                background: "var(--t-cta-bg)",
                border: "1.5px solid var(--t-cta-bd)",
                color: "var(--t-cta-fg)",
                transitionTimingFunction: "var(--t-spring)",
              }}
            >
              {isLoading ? "Looking" : "Search"}
              <span
                className="flex size-6 items-center justify-center rounded-full"
                style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
                aria-hidden
              >
                {isLoading ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </span>
            </button>
          </div>

          {/* Both shelves. "I don't know what I want" is at least as true of
              film and TV as it is of plays. */}
          {(
            <button
              id="search-find-for-me"
              type="button"
              onClick={handleFindForMe}
              disabled={isLoading}
              className="t-find-for-me flex shrink-0 items-center gap-2 px-6 text-[15px] font-semibold disabled:opacity-50"
              style={{ minHeight: 68, borderRadius: 40 }}
            >
              <IconSparkles className="size-[18px]" />
              Find for me
            </button>
          )}
        </div>

        {/* Quick chips. They stay after a search now: the head is a fixed
            height and the bar no longer collapses, so there is nothing for
            hiding them to protect. */}
        {/* The chips get the whole row. They were sharing it with the
            freshness caption, and because the row scrolls rather than wraps,
            the caption's width came straight off the chips — the last one
            ("Under 2 min") was cut mid-word at every desktop size, which
            reads as a rendering fault rather than a scroll affordance. */}
        <div className="mt-5">
          <div className="min-w-0">
            <QuickFilterChips
              filters={filters}
              onToggle={(key, value) => setFilters({ ...filters, [key]: value })}
              hideCategory={searchMode === "film_tv"}
              mode={searchMode}
              onOpenFilters={() => {
                if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
                  setShowFilters(true);
                } else {
                  setShowFiltersSheet(true);
                }
              }}
              activeFilterCount={activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
            />
          </div>
        </div>


          {/* Mobile: filters in sheet (SearchFiltersSheet). Desktop: expandable inline filters */}
          <SearchFiltersSheet
            open={showFiltersSheet}
            onOpenChange={setShowFiltersSheet}
            filters={filters}
            setFilters={setFilters}
            maxOverdoneScore={maxOverdoneScore}
            setMaxOverdoneScore={setMaxOverdoneScore}
            hideCategory={searchMode === "film_tv"}
          />

          {selectedMonologue && (
            <ReportMonologueModal
              open={reportOpen}
              onOpenChange={setReportOpen}
              monologueId={selectedMonologue.id}
              characterName={selectedMonologue.character_name}
              playTitle={selectedMonologue.play_title}
            />
          )}

          {/* Desktop filters, as a modal. Inline it pushed the results down the
              page every time it opened; in a modal the stage clears, you set
              what you want, and the results are where you left them. */}
          <Dialog open={showFilters} onOpenChange={setShowFilters}>
            <DialogContent className="max-w-3xl p-0 gap-0">
              <DialogHeader className="border-b border-border/60 px-6 py-4">
                <DialogTitle className="font-brand text-2xl font-medium">Narrow it down</DialogTitle>
                <DialogDescription className="stage-direction text-xs text-muted-foreground/70">
                  (who you are, what it feels like, how long you have.)
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto px-6 pb-6">
                <SearchFiltersPanel
                  filters={filters}
                  onChange={setFilters}
                  maxOverdoneScore={maxOverdoneScore}
                  onMaxOverdoneScoreChange={setMaxOverdoneScore}
                  activeFilters={activeFilters as [string, string][]}
                  hasFreshnessFilter={hasFreshnessFilter}
                  getFilterDisplay={getFilterDisplay}
                  className="pt-5"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-3">
                <Button size="sm" onClick={() => setShowFilters(false)}>
                  Show results
                </Button>
              </div>
            </DialogContent>
          </Dialog>
      </div>

      <div className="space-y-6">

        {/* Error banner with retry */}
        {/* A real error (network/timeout) shows the retry card. A quota wall
            (searchUpgradeUrl set) shows the polished Plus paywall modal instead. */}
        {/* A failure, said the way this page says everything else. It used to
            be the app's generic destructive card — a red-bordered, red-filled
            box with "Search failed." in red — which is the visual language of
            a crashed form, not of a theatre, and it was the loudest thing on
            a page whose own accent is one orange. The fault is worth saying
            plainly and once; it is not worth an alarm. */}
        {searchError && !searchUpgradeUrl && (
          <div className="t-fault">
            <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
              (the search went dark.)
            </p>
            <p className="t-fault__line">
              That one didn&apos;t come back. Nothing is lost — run it again.
            </p>
            <button
              type="button"
              className="t-fault__retry"
              onClick={() => {
                setSearchError(null);
                setSearchUpgradeUrl(null);
                searchMode === "film_tv" ? handleSearch() : performSearch(playsQuery, filters);
              }}
            >
              Try it again
            </button>
          </div>
        )}
        <MonologuePaywallModal
          open={!!searchUpgradeUrl}
          onOpenChange={(o) => { if (!o) { setSearchUpgradeUrl(null); setSearchError(null); } }}
          feature="monologue_search"
          title="You&apos;ve used your free searches this month"
          description="Keep exploring with 2 weeks of Plus, free. Unlimited searches, nothing charged now, card on file, cancel anytime."
        />

        {/* Results */}
        <AnimatePresence mode="wait">
          {searchMode === "film_tv" ? (
            /* Film & TV results */
            isFilmTvLoading ? (
              <motion.div
                key="film-tv-loading"
                initial={{ opacity: 0 }}
                animate={RISE_IN}
                exit={LIFT_OUT}
              >
                <SearchCurtain mode="film_tv" onStop={stopSearch} />
              </motion.div>
            ) : filmTvResults.length === 0 && !filmTvHasSearched ? (
              /* Was an empty <div />. Switching to a tab you had not searched
                 gave you a search bar above nothing at all — the page looked
                 broken rather than waiting. It gets the same starting shelf
                 Plays has always had. */
              preSearchView
            ) : filmTvResults.length === 0 ? (
              <div className="pt-12 pb-12 text-center max-w-md mx-auto">
                {queryInvalidReason === "gibberish" ? (
                  <>
                    <IconSearch className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-2xl font-semibold mb-2">We couldn&apos;t understand that search</h3>
                    <p className="text-sm text-muted-foreground">
                      Try searching for a movie title, character, or genre like &quot;drama&quot; or &quot;courtroom&quot;
                    </p>
                  </>
                ) : queryInvalidReason ? (
                  <>
                    <IconSearch className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-2xl font-semibold mb-2">That search is too short</h3>
                    <p className="text-sm text-muted-foreground">
                      Try adding more detail, like a movie title or genre
                    </p>
                  </>
                ) : (
                  <Card className="border-dashed bg-muted/20">
                    <CardContent className="flex flex-col items-center pt-12 pb-12 text-center">
                      <TicketSketch size={56} className="text-muted-foreground/50" />
                      <p className="stage-direction mt-5 text-sm text-muted-foreground">
                        (nothing on this bill.)
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              /* Keyed and animated so switching shelves cross-fades. This was a
                 bare <div> inside an AnimatePresence, so it had no exit and no
                 enter: the Plays list faded out and the Film & TV list simply
                 appeared, which is most of why the switch felt like a jolt. */
              <motion.div
                key="film-tv-results"
                id="search-results"
                initial={{ opacity: 0, y: 8 }}
                animate={RISE_IN}
                exit={FALL}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                <div className="mt-3 sm:pl-[9.5rem]">
                <ActiveFilterChips
                  filters={filters}
                  labels={{ gender: "Gender", age_range: "Age", emotion: "Emotion", theme: "Theme", category: "Category", tone: "Tone", difficulty: "Difficulty", author: "Author", max_duration: "Max Duration" }}
                  onRemove={(key) => setFilters((f) => ({ ...f, [key]: "" }))}
                  onClearAll={() => setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" })}
                />
                </div>
                {/* Nothing above the results but the one control that
                    changes them. The count, the "from Film & TV scripts in our
                    library" caption and the "Did this find what you needed?"
                    prompt all went: none of them helps anyone find a piece,
                    and they were three lines you had to read before you were
                    allowed to start looking. */}
                <div className="mb-6 flex items-center justify-end sm:pl-[9.5rem]">
                  <button
                    type="button"
                    onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                    aria-pressed={showBookmarkedOnly}
                    title={showBookmarkedOnly ? "Showing your collection" : "Show only your collection"}
                    className="t-only-saved shrink-0"
                  >
                    <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} aria-hidden />
                    your collection
                  </button>
                </div>
                {/* Monologue cards grid */}
                {(() => {
                  const filmTvDisplay = showBookmarkedOnly ? filmTvResults.filter((m) => m.is_favorited) : filmTvResults;
                  if (filmTvDisplay.length === 0) {
                    return (
                      <Card className="border-dashed bg-muted/20">
                        <CardContent className="flex flex-col items-center pt-12 pb-12 text-center">
                          <TicketSketch size={56} className="text-muted-foreground/50" />
                          <p className="stage-direction mt-5 text-sm text-muted-foreground">
                            {showBookmarkedOnly
                              ? "(nothing saved here yet.)"
                              : "(nothing on this bill.)"}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  }
                  return (
                    /* Film & TV reads the same way. Two different result designs
                       on one page, switched by a tab, would be worse than
                       either. The poster thumbnail goes with the card; the
                       speech is the thing being chosen. */
                    <div>
                      <div className="mb-4">
                        <SharedFactsLine label={constantFactsLabel(filmTvFacts)} />
                      </div>
                      <div aria-hidden className="t-results-rule mb-2" />
                      {filmTvDisplay.map((mono, idx) => (
                        <MonologueSpeech
                          key={mono.id}
                          mono={mono}
                          index={idx}
                          mode="film_tv"
                          profileMatch={profileMatchMap.get(mono.id)}
                          showMatchMark={filmTvMatchMark}
                          omit={filmTvShared}
                          onSelect={() => openMonologue(mono, idx, "film_tv")}
                          onToggleFavorite={toggleFavorite}
                          isModerator={!!user?.is_moderator}
                          onEdit={user?.is_moderator ? (id: number) => setEditMonologueId(id) : undefined}
                        />
                      ))}
                    </div>
                  );
                })()}
              </motion.div>
            )
          ) : isPlaysLoading ? (
            <motion.div
              key="plays-loading"
              initial={{ opacity: 0 }}
              animate={RISE_IN}
              exit={LIFT_OUT}
            >
              {/* Find for me gets its own beats. Nobody typed anything, so
                  "reading twelve thousand pages" describes the wrong act. */}
              <SearchCurtain
                onStop={stopSearch}
                mode={isFindingForMe ? "for_you" : "plays"}
                name={firstName}
                facts={forYouFacts}
              />
            </motion.div>
          ) : hasSearched && results.length === 0 && !searchError ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {contentGap ? (
                <div className="pt-12 pb-12 text-center max-w-md mx-auto">
                  <ContentGapBanner
                    play={contentGap.play}
                    author={contentGap.author}
                    availableIn={contentGap.available_in}
                    carriedButEmpty={contentGap.carried_but_empty}
                    onSwitchSource={switchSourceWithQuery}
                  />
                  <EmotionPivots className="mt-6" />
                </div>
              ) : (
                <NoResultsState
                  query={queryUsedForResults}
                  reason={
                    queryInvalidReason === "gibberish"
                      ? "gibberish"
                      : queryInvalidReason
                        ? "short"
                        : "none"
                  }
                  activeFilterCount={activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  onClearFilters={() => {
                    setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" });
                    setMaxOverdoneScore(1);
                  }}
                >
                  {!queryInvalidReason && queryUsedForResults.trim() && (
                    <RequestQueryButton query={queryUsedForResults} className="flex items-center justify-center" />
                  )}
                  {!queryInvalidReason && <EmotionPivots className="basis-full text-center" />}
                  {/* A search that found nothing is at once the loneliest
                      moment in the product and the highest-intent one, and it
                      was a pure dead end. The lead answers the question the
                      actor is actually asking here — "did I do something
                      wrong?" — with the honest no, then hands over what the
                      house IS finding as live, clickable queries. */}
                  <div className="mt-8 flex justify-center">
                    <HouseIsHunting
                      surface="search_empty"
                      lead="Nobody else has found that today either"
                    />
                  </div>
                </NoResultsState>
              )}
            </motion.div>
          ) : results.length > 0 ? (
            <motion.div
              key="plays-results"
              id="search-results"
              initial={{ opacity: 0, y: 8 }}
              animate={RISE_IN}
              exit={FALL}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {searchParams.get("ai") === "true" && (
                <div className="flex items-center gap-2 p-4 bg-secondary/10 border border-secondary/30 rounded-lg">
                  <IconSparkles className="h-5 w-5 text-foreground flex-shrink-0" />
                  <p className="text-sm font-medium text-secondary-foreground">
                    AI-powered recommendations based on your profile
                  </p>
                </div>
              )}
              {correctedQuery && (
                <p className="text-sm text-muted-foreground">
                  Showing results for <span className="font-medium text-foreground">{correctedQuery}</span>
                </p>
              )}
              {contentGap && (
                <ContentGapBanner
                  play={contentGap.play}
                  author={contentGap.author}
                  availableIn={contentGap.available_in}
                  carriedButEmpty={contentGap.carried_but_empty}
                  onSwitchSource={(st) => setSearchMode(st === "play" ? "plays" : "film_tv")}
                />
              )}
              {sceneGap && <SceneGapBanner />}
              {/* Never relax silently: say which constraint was loosened to fill results. */}
              {broadened && broadened.relaxed.length > 0 && (
                <div className="border border-border border-l-2 border-l-primary bg-muted/40 px-4 py-3">
                  <p className="text-sm text-foreground">
                    Only a few exact matches, so I broadened the{" "}
                    <span className="font-medium">{formatRelaxed(broadened.relaxed)}</span>.
                  </p>
                </div>
              )}
              {/* Weak result set with no named-title gap: offer to request the
                  query. Centred, with a drawing, in the same voice as the
                  nothing-found screen — this was a flat left-aligned box that
                  read as an error bar rather than part of the app. Compact on
                  purpose: real results follow directly underneath it, so it
                  must not look like a full empty state. */}
              {weakMatch && !contentGap && (
                <div className="mb-6 flex flex-col items-center border border-dashed border-border bg-muted/20 px-4 py-7 text-center">
                  <SpotlightSketch size={44} className="text-muted-foreground/45" />
                  <p className="stage-direction mt-4 text-xs text-muted-foreground/70">
                    (nothing landed square.)
                  </p>
                  <p className="mt-2 max-w-sm text-sm text-foreground">
                    No strong match for{" "}
                    <span className="font-semibold">{queryUsedForResults}</span>. These are the
                    closest I have.
                  </p>
                  <RequestQueryButton
                    query={queryUsedForResults}
                    className="mt-3 flex items-center justify-center"
                  />
                  <EmotionPivots className="mt-3" />
                </div>
              )}
              {/* One toolbar: how many, what shaped the search, and the
                  collection toggle. These used to be four stacked strips —
                  filter chips, "Understood:" chips, a profile nudge and the
                  count row — which pushed the results down and read as noise. */}
              {/* Indented to 7.75rem — the margin column plus its gap — so the
                  toolbar starts exactly where the speeches do. Left at the
                  container edge it sat 124px to the left of every character
                  name, and the gutter read as a hole rather than a margin. */}
              {/* One toolbar: what the search understood, how many came back,
                  and the way back to the box. Indented to the margin column so
                  it starts exactly where the speeches do. */}
              <div className="mb-4 sm:pl-[9.5rem]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <ParsedConstraintChips constraints={parsedConstraints} onRemove={handleRemoveConstraint} />
                    <ActiveFilterChips
                      filters={filters}
                      labels={{ gender: "Gender", age_range: "Age", emotion: "Emotion", theme: "Theme", category: "Category", tone: "Tone", difficulty: "Difficulty", author: "Author", max_duration: "Max Duration" }}
                      onRemove={(key) => setFilters((f) => ({ ...f, [key]: "" }))}
                      onClearAll={() => setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "", source_type: "" })}
                    />
                  </div>

                  {/* The count and "new search" are gone. A count is a number
                      you cannot act on, and "new search" pointed at a search
                      box already on screen, unmoved, with your query still in
                      it. */}
                  <button
                    type="button"
                    onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                    aria-pressed={showBookmarkedOnly}
                    title={showBookmarkedOnly ? "Showing your collection" : "Show only your collection"}
                    className="t-only-saved shrink-0"
                  >
                    <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} aria-hidden />
                    your collection
                  </button>
                </div>

                {/* The query echo and the facts every row shares, on one line.
                    This is why the H1 never repeats the query: the head has to
                    hold one height, so what you typed lives here instead. */}
                {/* What every row here has in common, once. The query echo
                    that used to lead this line is gone: it repeated, word for
                    word, what is still sitting in the search box two inches
                    above it. Four bands of metadata stood between the box and
                    the first result; this is the only one that said anything
                    the reader could not already see. */}
                <SharedFactsLine label={constantFactsLabel(playsFacts)} />
              </div>

              {/* The rule the results hang from. */}
              <div
                aria-hidden
                className="t-results-rule mb-2"
                style={{ ["--rule-d" as string]: "0.2s" }}
              />

              {/* Unified results grid: Best Match + Related use same card layout; hide confidence for broad queries */}
              {(() => {
                const relatedOrBookmarked = showBookmarkedOnly ? results.filter((m) => m.is_favorited) : sortedRelated;
                const hasCards = (!showBookmarkedOnly && bestMatches.length > 0) || relatedOrBookmarked.length > 0;
                // Never `return null` here. This block sits directly under a
                // count, so rendering nothing produced a screen that said
                // "11 monologues" above an empty page with no explanation.
                // Whatever emptied the list, say so.
                if (!hasCards) {
                  return (
                    <Card className="border-dashed bg-muted/20">
                      <CardContent className="flex flex-col items-center pt-12 pb-12 text-center">
                        <ScriptPagesSketch size={56} className="text-muted-foreground/50" />
                        <p className="stage-direction mt-5 text-sm text-muted-foreground">
                          {showBookmarkedOnly ? "(nothing saved here yet.)" : "(nothing to show.)"}
                        </p>
                        {showBookmarkedOnly && (
                          <button
                            onClick={() => setShowBookmarkedOnly(false)}
                            className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
                          >
                            Show all results
                          </button>
                        )}
                      </CardContent>
                    </Card>
                  );
                }
                // Show match badges for all semantic results (score > 0.1 check is in the card itself).
                // showConfidence only gates the "Best Matches" section header, not individual badges.
                const showBadges = !showBookmarkedOnly;
                const baseOffset = !showBookmarkedOnly ? bestMatches.length : 0;
                // Relevance band is a separate axis from Best/Related: a strong
                // query still trails off into looser matches (band "looser" =
                // below the show bar). Split the related tail so those sit under
                // a divider rather than masquerading as equally-good results.
                // Never split in the bookmarked-only view — band is irrelevant there.
                const looserRelated = showBookmarkedOnly
                  ? []
                  : relatedOrBookmarked.filter((m) => m.band === "looser");
                const strongRelated = showBookmarkedOnly
                  ? relatedOrBookmarked
                  : relatedOrBookmarked.filter((m) => m.band !== "looser");
                /**
                 * Whether anything sits ABOVE the looser tail. This gates the
                 * divider only — never the cards.
                 *
                 * The cards used to be nested inside this condition, and that
                 * was the empty-results bug: when a query is weak, EVERY result
                 * comes back band "looser", so strongRelated and bestMatches are
                 * both empty, the divider is skipped, and all 20 results are
                 * dropped on the floor. The page then showed a count and a
                 * banner reading "here are the closest ones" above nothing at
                 * all. Verified live: "joker" returns 20 results, 20 looser.
                 */
                const hasStrongAbove =
                  !showBookmarkedOnly && bestMatches.length + strongRelated.length > 0;
                /* Results read as a page of speeches now, not a grid of cards.
                   You judge a monologue by reading it, so the reading is the
                   result: the words get the measure and the size, and the
                   metadata that used to crowd them is one line above and one
                   line below. */
                const renderCard = (mono: Monologue, idx: number) => (
                  <MonologueSpeech
                    key={mono.id}
                    mono={mono}
                    onSelect={() => openMonologue(mono, idx, "monologue")}
                    onToggleFavorite={toggleFavorite}
                    index={idx}
                    mode="plays"
                    profileMatch={profileMatchMap.get(mono.id)}
                    showMatchMark={playsMatchMark}
                    omit={playsShared}
                    isModerator={!!user?.is_moderator}
                    onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                  />
                );
                return (
                  <>
                    {!showBookmarkedOnly && showConfidence && bestMatches.length > 0 && (
                      <p className="mb-6 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        <span aria-hidden className="inline-block h-3 w-0.5 bg-primary" />
                        Best match
                      </p>
                    )}
                    <div>
                      {!showBookmarkedOnly && bestMatches.map((mono, idx) => renderCard(mono, idx))}
                      {strongRelated.map((mono, idx) => renderCard(mono, baseOffset + idx))}
                    </div>
                    {looserRelated.length > 0 && (
                      <>
                        {/* The rule only means anything when there are stronger
                            results above it to divide from. Its absence must not
                            take the cards with it. */}
                        {hasStrongAbove && (
                          <div className="mt-8 mb-4 border-t border-border pt-3">
                            {/* "Looser matches" read like a verdict on the
                                actor's taste. Same meaning, said as a stage
                                direction. */}
                            <span className="stage-direction text-sm text-muted-foreground/70">
                              (further afield.)
                            </span>
                          </div>
                        )}
                        <div>
                          {looserRelated.map((mono, idx) =>
                            renderCard(mono, baseOffset + strongRelated.length + idx),
                          )}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
              {hasMore && !showBookmarkedOnly && (
                <div className="flex justify-center pt-6">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="t-show-more"
                  >
                    {isLoadingMore ? <IconLoader2 className="size-4 animate-spin" /> : null}
                    Show {PAGE_SIZE} more
                  </button>
                </div>
              )}
              {/* Ask AFTER the results, not above them. In the toolbar it was
                  asking "Helpful?" before the actor had read a single card —
                  the honest answer at that point is "I don't know yet", and
                  the observed answer was silence: 0 rows in 7 days. */}
              <div className="flex justify-center pt-8 pb-2">
                <ResultsFeedbackPrompt
                  context="search"
                  resultsViewCount={resultsViewCount}
                  onOpenContact={() => setContactOpen(true)}
                />
              </div>

              {/* Profile nudge, after the results rather than above them: it's
                  an offer to improve the next search, not a toll on this one. */}
              {hasSearched && results.length > 0 && profileData && !isPersonalized &&
                !profileData.preferred_genres?.length && !profileData.experience_level && !isDemoUser && (
                <p className="pb-2 text-center text-xs text-muted-foreground">
                  Add your type and I&apos;ll tailor these.{" "}
                  <Link href="/profile" className="text-primary underline underline-offset-2">
                    Set it up →
                  </Link>
                </p>
              )}
            </motion.div>
          ) : (
            preSearchView
          )}
        </AnimatePresence>
      </div>

      {/* Slide-over Detail Panel - Backstage.com Style */}
      <AnimatePresence>
        {selectedMonologue && (
          <>
            {/* Backdrop: single bg class so opacity transition is smooth */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isReadingMode ? 0.95 : 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeMonologue}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-0 z-[10000]"
              style={{ background: "var(--t-ink)", backdropFilter: "blur(2px)" }}
            />

            {/* Slide-over Panel */}
            <motion.div
              ref={panelRef}
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.25, 0.1, 0.25, 1],
                opacity: { duration: 0.25 },
              }}
              className={`theatre-sides fixed bottom-0 right-0 top-0 z-[10001] overflow-y-auto transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
                isReadingMode ? "w-full" : "w-full md:w-[600px]"
              }`}
              style={{
                background: "var(--t-paper)",
                borderLeft: "2px solid var(--t-text)",
                color: "var(--t-text)",
              }}
            >
              <div
                className="sticky top-0 z-[10002]"
                style={{
                  background: "color-mix(in oklab, var(--t-paper) 95%, transparent)",
                  backdropFilter: "blur(6px)",
                  borderBottom: isReadingMode ? "none" : "1.5px solid var(--t-line-light)",
                }}
              >
                <div className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="t-dir" style={{ fontSize: 13, color: "var(--t-muted-dark-2)" }}>
                    (the sides.)
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Download button - show in both modes; 44px touch target on mobile */}
                    <div className="relative z-[10002]">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDownloadMenu(!showDownloadMenu);
                        }}
                        className="hover:bg-muted relative z-[10002] h-9 w-9"
                        title="Download monologue"
                      >
                        <IconDownload className="h-4 w-4" />
                      </Button>
                      <AnimatePresence>
                        {showDownloadMenu && (
                          <>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="fixed inset-0 z-[10003]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDownloadMenu(false);
                              }}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.96, y: -6 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.96, y: -6 }}
                              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                              className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 min-w-[140px] z-[10004] origin-top-right"
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadMonologue(selectedMonologue, 'text');
                                  setShowDownloadMenu(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
                              >
                                Download as TXT
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadMonologue(selectedMonologue, 'pdf');
                                  setShowDownloadMenu(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
                              >
                                Download as PDF
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                    {!isReadingMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          toggleFavorite(e, selectedMonologue);
                        }}
                        className={`relative z-[10002] active:scale-95 transition-all duration-200 ease-out h-9 w-9 ${
                          selectedMonologue.is_favorited
                            ? `${accentTeal.bg} ${accentTeal.bgHover} ${accentTeal.text}`
                            : `${accentTeal.hoverBg} ${accentTeal.textHover} text-muted-foreground`
                        }`}
                        aria-label={selectedMonologue.is_favorited ? "Remove from collection" : "Add to collection"}
                      >
                        <BookmarkIcon filled={!!selectedMonologue.is_favorited} size="md" />
                      </Button>
                    )}
                    {!isReadingMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportOpen(true);
                        }}
                        className="hover:bg-muted relative z-[10002] h-9 w-9 text-muted-foreground hover:text-foreground"
                        title="Report an issue"
                        aria-label="Report an issue with this monologue"
                      >
                        <IconFlag className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsReadingMode(!isReadingMode);
                      }}
                      className="hover:bg-muted relative z-[10002] h-9 w-9"
                    >
                      {isReadingMode ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={closeMonologue}
                      className="relative z-[10002] h-9 w-9"
                    >
                      <IconX className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className={`${isReadingMode ? "max-w-4xl mx-auto" : ""} p-6 space-y-6`}>
                {isLoadingDetail ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-64 w-full" />
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    {isReadingMode ? (
                      <motion.div
                        key="reading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-8 py-12"
                      >
                    {/* Minimal Header */}
                    <div className="text-center space-y-2">
                      {/* font-brand, same as the detail page and the slide-over,
                          so the character name doesn't change face depending on
                          which of the three you opened it from. The old inline
                          `var(--font-sans), Georgia, serif` also fell back to a
                          serif whenever Montserrat hadn't loaded yet, so the
                          title could visibly swap fonts mid-paint. */}
                      <h1 className="font-brand text-4xl font-medium">
                        {selectedMonologue.character_name}
                      </h1>
                      <p className="text-muted-foreground">
                        {selectedMonologue.play_title}
                        {selectedMonologue.author ? ` · ${selectedMonologue.author}` : ""}
                      </p>
                    </div>

                    {/* Monologue Text - Large and Centered */}
                    <div className="bg-background p-8 rounded-lg">
                      <p className="text-xl leading-relaxed font-typewriter max-w-3xl mx-auto text-center">
                        <MonologueText text={selectedMonologue.text} />
                      </p>
                    </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="detail"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                  <MonologueDetailContent
                    monologue={selectedMonologue}
                    onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                    headerActions={
                      <button
                        onClick={() => router.push(`/monologue/${selectedMonologue.id}/work`)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Rehearse
                      </button>
                    }
                  />
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <EditMonologueModal
        monologueId={editMonologueId}
        onClose={() => setEditMonologueId(null)}
        onSave={async (body: EditMonologueBody) => {
          if (editMonologueId == null) return;
          setEditMonologueSaving(true);
          try {
            await api.patch(`/api/admin/monologues/${editMonologueId}`, body);
            toast.success("Monologue updated");
            setEditMonologueId(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Update failed");
          } finally {
            setEditMonologueSaving(false);
          }
        }}
        isSaving={editMonologueSaving}
      />

      <AnimatePresence>
        {showSearchTour && (
          <SearchTour onDismiss={dismissSearchTour} />
        )}
      </AnimatePresence>
      <ContactModal
        open={contactOpen}
        onOpenChange={setContactOpen}
        initialCategory="feedback"
      />

      <Dialog open={showProfileCompleteModal} onOpenChange={setShowProfileCompleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">Complete your profile</DialogTitle>
            <DialogDescription>
              Add your actor details so we can give you AI-powered recommendations tailored to your type and casting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowProfileCompleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowProfileCompleteModal(false);
                router.push("/profile");
              }}
            >
              Go to Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug timing overlay — Ctrl+Shift+D to toggle (dev or admin only) */}
      {showDebug && debugTiming && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-black/90 text-green-400 font-mono text-xs p-4 rounded-lg shadow-2xl max-w-sm border border-green-500/30 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-300 font-bold text-sm">Search Debug</span>
            <button onClick={() => setShowDebug(false)} className="text-green-500 hover:text-white">x</button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-green-500/70">Frontend total</span>
              <span>{frontendSearchMs != null ? `${frontendSearchMs}ms` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-500/70">Backend total</span>
              <span>{debugTiming.total_ms != null ? `${debugTiming.total_ms}ms` : "—"}</span>
            </div>
            <div className="border-t border-green-500/20 my-1" />
            <div className="flex justify-between">
              <span className="text-green-500/70">Query tier</span>
              <span>{debugTiming.tier ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-500/70">AI parse</span>
              <span>{debugTiming.ai_parse_ms != null ? `${debugTiming.ai_parse_ms}ms` : "—"} <span className="text-green-500/50">({debugTiming.ai_parse_source ?? "skipped"})</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-500/70">Embedding</span>
              <span>{debugTiming.embedding_ms != null ? `${debugTiming.embedding_ms}ms` : "—"} <span className="text-green-500/50">({debugTiming.embedding_source ?? "—"})</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-500/70">Results</span>
              <span>{debugTiming.result_count ?? "—"} / {debugTiming.candidates ?? "—"} candidates</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-500/70">Source</span>
              <span>{debugTiming.results_source ?? "—"}</span>
            </div>
            {debugTiming.filters_merged && Object.keys(debugTiming.filters_merged).length > 0 && (
              <>
                <div className="border-t border-green-500/20 my-1" />
                <div className="text-green-500/70 mb-1">Extracted filters:</div>
                {Object.entries(debugTiming.filters_merged).map(([k, v]) => (
                  <div key={k} className="flex justify-between pl-2">
                    <span className="text-green-500/50">{k}</span>
                    <span>{String(v)}</span>
                  </div>
                ))}
              </>
            )}
            <div className="border-t border-green-500/20 my-1" />
            <div className="text-green-500/40 text-center">Ctrl+Shift+D to hide</div>
          </div>
        </div>
      )}
    </div>
  );
}
