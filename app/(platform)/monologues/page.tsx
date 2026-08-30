"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { SearchTour } from "@/components/onboarding/SearchTour";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";
import { useTypewriterPlaceholder } from "@/hooks/useTypewriterPlaceholder";
import { useAuth } from "@/lib/auth";
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
import { IconSearch, IconSparkles, IconLoader2, IconX, IconBookmark, IconEye, IconEyeOff, IconDownload, IconAdjustments, IconFlag, IconDeviceTv, IconCheck } from "@tabler/icons-react";

// Fun loading messages for AI search (theater)
const LOADING_MESSAGES = [
  "Asking Shakespeare for advice...",
  "Consulting the drama gods...",
  "Squeezing the monologue database...",
  "Searching backstage...",
  "Finding your perfect piece...",
  "Digging through the classics...",
  "Working our magic...",
  "Rifling through the script pile...",
];

// Playful loading messages for film/TV search
const LOADING_MESSAGES_FILM_TV = [
  "Checking the IMDb files…",
  "Asking the director's cut…",
  "Scanning the credits…",
  "Rolling through the reels…",
  "Searching the green room…",
  "Reading the script supervisor's notes…",
  "Finding your scene…",
  "Checking the call sheet…",
];

const SEARCH_LOADING_STEPS = [
  "Consulting the drama gods",
  "Rifling through 12,000+ scripts and plays",
  "Asking Shakespeare which one hits hardest",
  "Weighing every speech for emotional weight",
  "Finding the ones that'll stop the room",
  "Curating your shortlist",
];

const FILM_TV_LOADING_STEPS = [
  "Scanning the IMDb archives",
  "Checking with Scorsese's casting notes",
  "Digging through iconic film scenes",
  "Matching roles to your search",
  "Pulling the best audition-worthy moments",
  "Lining up your shortlist",
];
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingPreSearch } from "@/components/monologue/TrendingPreSearch";
import { ForYouShelf } from "@/components/monologue/ForYouShelf";
import { MasksSketch } from "@/components/brand/sketches";
import { SearchFiltersPanel } from "@/components/monologue/SearchFiltersPanel";
import { NoResultsState } from "@/components/monologue/NoResultsState";
import { StartingPoints } from "@/components/monologue/StartingPoints";
import { addSearchToHistory, getSearchById } from "@/lib/searchHistory";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueResultCard } from "@/components/monologue/MonologueResultCard";
import { SearchFiltersSheet, getDurationLabel } from "@/components/search/SearchFiltersSheet";
import { accentTeal } from "@/components/search/MatchIndicatorTag";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { ReportMonologueModal } from "@/components/monologue/ReportMonologueModal";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { ContactModal } from "@/components/contact/ContactModal";
import { ResultsFeedbackPrompt } from "@/components/feedback/ResultsFeedbackPrompt";
import { extractQueryHighlights } from "@/lib/queryMatchHighlight";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import { computeMatchReasons } from "@/lib/matchReasons";
import { QuickFilterChips } from "@/components/search/QuickFilterChips";
import { ContentGapBanner } from "@/components/search/ContentGapBanner";
import { RequestQueryButton } from "@/components/search/RequestQueryButton";
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

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isDemoUser, refreshUser } = useAuth();
  const [showSearchTour, setShowSearchTour] = useState(false);
  const [playsQuery, setPlaysQuery] = useState("");
  const [filmTvQuery, setFilmTvQuery] = useState("");
  const [filters, setFilters] = useState({
    gender: "",
    age_range: "",
    emotion: "",
    theme: "",
    category: "",
    tone: "",
    difficulty: "",
    author: "",
    max_duration: "",
  });
  /** 0 = freshest only, 0.3 = fresh, 0.5 = some overdone OK, 1 = show all. Separate from filters for clearer UX. */
  const [maxOverdoneScore, setMaxOverdoneScore] = useState(1);
  const [results, setResults] = useState<Monologue[]>([]);
  const [isPlaysLoading, setIsPlaysLoading] = useState(false);
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
  const [contentGap, setContentGap] = useState<{ play: string | null; author: string | null; available_in?: string[] | null } | null>(null);
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
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [loadingSteps, setLoadingSteps] = useState<string[]>([]);
  const loadingStepsTimers = useRef<NodeJS.Timeout[]>([]);
  const loadingScrollRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [jitter, setJitter] = useState(false);
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

  // Show search tour for first-time visitors — but only AFTER they've finished
  // onboarding, so it never stacks on top of the welcome/first-rehearsal flow
  // (especially cramped on mobile).
  useEffect(() => {
    if (
      user &&
      user.has_seen_search_tour === false &&
      user.has_completed_onboarding === true
    ) {
      const timer = setTimeout(() => setShowSearchTour(true), 800);
      return () => clearTimeout(timer);
    }
  }, [user]);

  // Rotate loading messages every 2 seconds while searching
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const currentLoadingMessage =
    searchMode === "film_tv"
      ? LOADING_MESSAGES_FILM_TV[loadingMessageIndex % LOADING_MESSAGES_FILM_TV.length]
      : LOADING_MESSAGES[loadingMessageIndex % LOADING_MESSAGES.length];

  // Build whimsical step-by-step loading list for both search modes
  // Steps are spread evenly across the search duration (not fixed interval)
  // so the last step never "gets stuck" — all 6 finish just before results arrive.
  const loadingStartRef = useRef<number>(0);
  const searchModeRef = useRef(searchMode);
  searchModeRef.current = searchMode;
  const anyLoading = isPlaysLoading || isFilmTvLoading;
  useEffect(() => {
    if (!anyLoading) {
      loadingStepsTimers.current.forEach(clearTimeout);
      loadingStepsTimers.current = [];
      setLoadingSteps([]);
      return;
    }
    loadingStartRef.current = Date.now();
    setLoadingSteps([]);
    const steps = isFilmTvLoading ? FILM_TV_LOADING_STEPS : SEARCH_LOADING_STEPS;
    // Steps spaced to feel synced with a real backend process (~3-8s search).
    // Intervals increase so early steps feel quick, later ones feel like heavy work.
    const delays = [0, 1200, 2800, 4800, 7000, 9500];
    const timers = steps.map((step, i) =>
      setTimeout(() => setLoadingSteps((prev) => [...prev, step]), delays[i])
    );
    loadingStepsTimers.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [anyLoading, isFilmTvLoading]);

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
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1", source_type: "film,tv" });
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
      if (searchQuery.trim()) params.set("q", searchQuery);
      Object.entries(searchFilters).forEach(([key, value]) => {
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
        setJitter(true);
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
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1", source_type: "film,tv" });
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
      setJitter(true);
      return;
    }
    await performSearch(playsQuery, filters);
  };

  const handleFindForMe = async () => {
    // Only block if the profile is truly empty (0%). Any partial info is
    // enough to surface useful recommendations — the backend handles
    // missing fields gracefully.
    const profileEmpty = profileStats != null && profileStats.completion_percentage === 0;
    if (profileEmpty) {
      setShowProfileCompleteModal(true);
      return;
    }

    setIsPlaysLoading(true);
    setHasSearched(true);
    setPlaysQuery(""); // Clear query to show it's AI-based
    setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" }); // Clear filters

    try {
      const response = await api.get<Monologue[]>("/api/monologues/recommendations?limit=20");
      setResults(response.data);
      setCorrectedQuery(null);

      // Persist AI "Find for me" results as the last search so that
      // navigating away and back to /monologues keeps them visible.
      sessionStorage.setItem(
        LAST_SEARCH_KEY,
        JSON.stringify({
          query: "",
          filters: { gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" },
          results: response.data,
          total: response.data.length,
        })
      );
      sessionStorage.setItem(SEARCH_LAST_MODE_KEY, "plays");

      // Update URL to reflect AI search
      router.replace("/monologues?ai=true", { scroll: false });

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
      setResults([]);
    } finally {
      setIsPlaysLoading(false);
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
    // back to the search that produced it.
    const slid = searchLogIdRef.current;
    api.get<Monologue>(`/api/monologues/${mono.id}${slid ? `?slid=${slid}` : ""}`)
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

  const isPersonalized = !!(
    profileData?.profile_bias_enabled &&
    ((profileData.preferred_genres?.length ?? 0) > 0 || profileData.experience_level || profileData.training_background)
  );

  const profileMatchMap = useMemo(() => {
    if (!isPersonalized) return new Map<number, ProfileMatch>();
    const map = new Map<number, ProfileMatch>();
    results.forEach((mono) => map.set(mono.id, computeProfileMatch(mono, profileData)));
    return map;
  }, [results, profileData, isPersonalized]);

  const sortedRelated = useMemo(() => {
    if (!isPersonalized) return relatedResults;
    return [...relatedResults].sort(
      (a, b) => (profileMatchMap.get(b.id)?.score ?? 0) - (profileMatchMap.get(a.id)?.score ?? 0),
    );
  }, [relatedResults, profileMatchMap, isPersonalized]);

  // Portal: gentle hue-style highlight around the edges (no hard border), soft bloom
  const outlineOverlay =
    typeof document !== "undefined" &&
    outlineFlash &&
    createPortal(
      <AnimatePresence>
        <motion.div
          key={outlineFlash}
          className="fixed inset-0 pointer-events-none rounded-none"
          style={{
            zIndex: 2147483647,
            border: "none",
            // Soft edge vignette: large inset blur/spread, stronger hue on change
            boxShadow:
              outlineFlash === "plays"
                ? "inset 0 0 160px 90px rgba(251, 146, 60, 0.22), inset 0 0 70px 35px rgba(255, 180, 120, 0.14)"
                : "inset 0 0 160px 90px rgba(167, 139, 250, 0.22), inset 0 0 70px 35px rgba(196, 181, 255, 0.14)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{
            duration: 1.2,
            times: [0, 0.3, 1],
            ease: "easeInOut",
          }}
          onAnimationComplete={() => setOutlineFlash(null)}
        />
      </AnimatePresence>,
      document.body
    );

  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-[88rem] relative">
      {outlineOverlay}

      {/* Hero Search Section. Once a search has run the title gets out of the
          way and the search bar sticks to the top — otherwise the answer opens
          below the fold and every search costs a scroll. */}
      <div
        className={
          hasSearched
            /* top offsets clear the sticky nav, which measures 65px on mobile
               and 81px from sm up — any less and the mode toggle tucks under it.
               From sm up the mode toggle and the search bar sit on one line;
               the title has animated away by then, so they're the only children. */
            ? "sticky top-16 z-30 -mx-4 mb-4 border-b border-border/50 bg-background/90 px-4 py-2.5 backdrop-blur-md sm:top-20 sm:-mx-6 sm:px-6"
            : "mb-4 sm:mb-6 md:mb-10"
        }
      >
        <AnimatePresence initial={false}>
          {!hasSearched && (
            <motion.div
              key="hero-title"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="text-center mb-3 sm:mb-4 md:mb-8">
                <p className="hidden md:block stage-direction text-sm md:text-base text-muted-foreground/70 mb-3">
                  (the search.)
                </p>
                <h1 className="font-brand font-medium leading-[1.05] text-4xl sm:text-5xl md:text-6xl">
                  Find your next <em className="italic text-primary">piece</em>
                </h1>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plays vs Film & TV toggle: spacious on mobile, 44px touch targets */}
        <div
          className={`flex items-center justify-center gap-2 px-1 ${
            hasSearched ? "mb-1.5" : "mb-3 sm:mb-4"
          }`}
        >
          {/* Boxed segmented control while it's the hero; once you've searched
              it drops to quiet text tabs so the bar reads as one thing. */}
          <div
            className={
              hasSearched
                ? "inline-flex shrink-0 gap-1 sm:gap-0.5"
                : "w-full max-w-sm sm:max-w-none sm:w-auto inline-flex rounded-xl border border-border bg-muted/40 p-2 gap-2 sm:p-1 sm:gap-0"
            }
          >
            <button
              type="button"
              className={
                hasSearched
                  ? `shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      searchMode === "plays"
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`
                  : `flex-1 sm:flex-none min-h-[44px] sm:min-w-0 sm:px-4 sm:py-2 rounded-lg sm:rounded-md text-sm font-medium transition-colors touch-manipulation ${
                      searchMode === "plays"
                        ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30 ring-inset"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`
              }
              onClick={() => {
                playsActionAtRef.current = Date.now();
                setSearchMode("plays");
                setSearchError(null);
                setOutlineFlash("plays");
                const params = new URLSearchParams();
                params.set("mode", "plays");
                if (playsQuery) params.set("q", playsQuery);
                Object.keys(filters).forEach((key) => {
                  const value = filters[key as keyof typeof filters];
                  if (value) params.set(key, value);
                });
                if (maxOverdoneScore < 1) params.set("max_overdone_score", String(maxOverdoneScore));
                router.replace(`/monologues?${params.toString()}`, { scroll: false });
              }}
            >
              Plays
            </button>
            <button
              type="button"
              className={
                hasSearched
                  ? `shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      searchMode === "film_tv"
                        ? "font-medium text-[rgb(167,139,250)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`
                  : `flex-1 sm:flex-none min-h-[44px] sm:min-w-0 sm:px-4 sm:py-2 rounded-lg sm:rounded-md text-sm font-medium transition-colors touch-manipulation ${
                      searchMode === "film_tv"
                        ? "bg-[rgba(167,139,250,0.12)] shadow text-foreground ring-1 ring-[rgba(167,139,250,0.45)] ring-inset"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`
              }
              onClick={() => {
                filmTvActionAtRef.current = Date.now();
                setSearchMode("film_tv");
                setSearchError(null);
                setOutlineFlash("film_tv");
                const params = new URLSearchParams();
                params.set("mode", "film_tv");
                if (filmTvQuery) params.set("q", filmTvQuery);
                router.replace(`/monologues?${params.toString()}`, { scroll: false });
              }}
            >
              Film &amp; TV
            </button>
          </div>
          {!hasSearched && (
            <div className="w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
              <span className="w-10 h-10" aria-hidden />
            </div>
          )}
        </div>
        {/* Search Bar - stacked on mobile for easier tap targets. Searched or
            not, it stays a centred column on the same axis as the hero rather
            than stretching across the viewport. */}
        <div className={hasSearched ? "mx-auto w-full max-w-2xl" : "max-w-3xl mx-auto"}>
          <div className={hasSearched ? "flex items-center gap-2" : ""}>
          <div className="relative group flex-1 min-w-0">
            {/* Ambient glow effect - subtle background */}
            <div
              className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0 blur-lg transition-all duration-500 ${
                isTyping ? "opacity-100 scale-105" : "opacity-0 scale-100"
              }`}
            />

            {/* Sweeping spotlight overlay */}
            <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
              <div
                className={`absolute inset-0 bg-gradient-to-r from-transparent ${searchMode === "film_tv" ? "via-violet-400/10" : "via-primary/10"} to-transparent transition-transform duration-700 ease-out ${
                  isTyping ? "translate-x-full" : "-translate-x-full"
                }`}
              />
            </div>

            <div
              className={`relative flex ${
                /* stacked is roomier for a first search, but inside the sticky
                   bar it costs a button's height of results on every phone */
                hasSearched
                  ? "flex-row items-center gap-1 rounded-full border bg-muted/30 p-1 pl-1.5"
                  : "flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm"
              } md:flex-row md:items-center transition-all duration-300 ${
                isTyping
                  ? searchMode === "film_tv"
                    ? "border-violet-400/50"
                    : "border-primary/50"
                  : "border-border/70"
              } ${jitter ? "search-jitter" : ""}`}
              onAnimationEnd={() => setJitter(false)}
            >
              <div className="flex-1 relative min-w-0 w-full">
                <IconSearch className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors duration-300 ${
                  isTyping ? (searchMode === "film_tv" ? "text-violet-400" : "text-primary") : "text-muted-foreground"
                }`} />
                <Input
                  id="search-input"
                  placeholder={typewriterText || (searchMode === "film_tv" ? "Search scripts, scenes, speeches..." : "Search monologues...")}
                  value={searchMode === "plays" ? playsQuery : filmTvQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (searchMode === "plays") setPlaysQuery(v);
                    else setFilmTvQuery(v);
                    pauseTypewriter();
                    setIsTyping(true);
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    }
                    typingTimeoutRef.current = setTimeout(() => {
                      setIsTyping(false);
                    }, 800);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  onFocus={() => {
                    pauseTypewriter();
                    if (currentQuery) setIsTyping(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setIsTyping(false), 200);
                    if (!currentQuery) resumeTypewriter();
                  }}
                  /* pr clears the absolutely-positioned clear button (44px wide
                     at right-3); pr-10 let long queries run underneath it. */
                  className={`pl-11 pr-14 text-base border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 ${
                    hasSearched ? "min-h-[40px] h-10" : "min-h-[48px] md:h-12"
                  }`}
                />
                {!isLoading && (searchMode === "plays" ? playsQuery : filmTvQuery) && (
                  <button
                    type="button"
                    onClick={() => searchMode === "plays" ? setPlaysQuery("") : setFilmTvQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                    aria-label="Clear search"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* The labelled button belongs to the hero, where searching is
                  the whole point of the screen. Once results are up the query
                  sits in the field and Enter re-runs it, so the button would
                  only be another thing competing inside the bar. */}
              {(!hasSearched || isLoading) && (
                <Button
                  onClick={isLoading ? stopSearch : handleSearch}
                  size="default"
                  variant={isLoading ? "outline" : "default"}
                  aria-label={isLoading ? "Stop search" : "Search"}
                  className={`shrink-0 transition-all duration-300 ${
                    hasSearched
                      ? "h-9 w-9 min-h-0 min-w-0 rounded-full p-0"
                      : `min-h-[44px] min-w-[44px] md:min-h-[2.5rem] md:min-w-0 px-4 md:px-6 rounded-lg ${
                          isLoading ? "" : isTyping ? (searchMode === "film_tv" ? "shadow-md shadow-violet-400/20" : "shadow-md shadow-primary/20") : ""
                        }`
                  }`}
                >
                  {isLoading ? (
                    <>
                      <IconX className="h-4 w-4" />
                      {!hasSearched && <span className="hidden md:inline ml-1">Stop</span>}
                    </>
                  ) : (
                    "Search"
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Filters sits beside the field, not crammed inside it */}
          {hasSearched && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFiltersSheet(true)}
                className="md:hidden shrink-0 gap-1 min-h-[40px] min-w-[40px] px-2 text-muted-foreground hover:text-foreground"
                aria-label="Filters"
              >
                <IconAdjustments className="h-4 w-4" />
                {(activeFilters.length > 0 || hasFreshnessFilter) && (
                  <span className="tabular-nums text-xs text-primary">
                    {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(true)}
                className="hidden md:inline-flex shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <IconAdjustments className="h-4 w-4" />
                Filters
                {(activeFilters.length > 0 || hasFreshnessFilter) && (
                  <span className="tabular-nums text-xs text-primary">
                    {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  </span>
                )}
              </Button>
            </>
          )}
          </div>

          {/* Action Row - Filters (Plays or Film & TV) + Find for me (Plays only).
              After a search these controls move inside the search bar itself,
              so this row would just be a duplicate taking up sticky height. */}
          <div
            id="search-filters"
            className={`flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              hasSearched ? "hidden" : "flex mt-3 sm:mt-4"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFiltersSheet(true)}
                className="md:hidden gap-2 text-muted-foreground hover:text-foreground min-h-[44px]"
              >
                <IconAdjustments className="h-4 w-4" />
                Filters
                {(activeFilters.length > 0 || hasFreshnessFilter) && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  </Badge>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`hidden md:flex gap-2 text-muted-foreground hover:text-foreground ${showFilters ? "text-foreground bg-muted" : ""}`}
              >
                <IconAdjustments className="h-4 w-4" />
                Filters
                {(activeFilters.length > 0 || hasFreshnessFilter) && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </div>

            {searchMode === "plays" && (
              <Button
                id="search-find-for-me"
                onClick={handleFindForMe}
                disabled={isLoading}
                variant="outline"
                size="sm"
                /* a way in before you've searched; on a phone afterwards it's
                   just another row between the actor and the results */
                className={`gap-2 min-h-[44px] md:min-h-0 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary ${
                  hasSearched ? "hidden md:inline-flex" : ""
                }`}
              >
                <IconSparkles className="h-4 w-4" />
                Find for me
              </Button>
            )}
          </div>

          {/* Quick filter chips — one-tap popular filters. They're a way in to
              the first search; after that the parsed-constraint chips and the
              filter panel do this job, and keeping them would fatten the
              sticky bar. */}
          {!hasSearched && (
            <div className="mt-3">
              <QuickFilterChips
                filters={filters}
                onToggle={(key, value) => setFilters({ ...filters, [key]: value })}
                hideCategory={searchMode === "film_tv"}
              />
            </div>
          )}

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
      </div>

      <div className="space-y-6">

        {/* Error banner with retry */}
        {/* A real error (network/timeout) shows the retry card. A quota wall
            (searchUpgradeUrl set) shows the polished Plus paywall modal instead. */}
        {searchError && !searchUpgradeUrl && (
          <Card className="border-destructive/50 bg-destructive/5 max-w-md mx-auto">
            <CardContent className="pt-4 pb-4 flex flex-col items-center text-center gap-3">
              <p className="text-sm text-destructive font-medium">{searchError}</p>
              <Button variant="outline" size="sm" onClick={() => { setSearchError(null); setSearchUpgradeUrl(null); searchMode === "film_tv" ? handleSearch() : performSearch(playsQuery, filters); }}>
                Try again
              </Button>
            </CardContent>
          </Card>
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
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pt-6 pb-10"
              >
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    {loadingSteps.length > 3 && (
                      <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
                    )}
                    <div
                      ref={loadingScrollRef}
                      className="border-l-2 border-violet-400/40 pl-3 sm:pl-5 max-h-44 sm:max-h-64 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    >
                      <AnimatePresence initial={false}>
                        {loadingSteps.map((step, i) => {
                          const isLatest = i === loadingSteps.length - 1;
                          const isCompleted = i < loadingSteps.length - 1;
                          return (
                            <motion.div
                              key={`step-${i}`}
                              initial={{ opacity: 0, height: 0, x: -8 }}
                              animate={{ opacity: 1, height: "auto", x: 0 }}
                              transition={{ duration: 0.35, ease: "easeOut" }}
                              className="overflow-hidden"
                              ref={isLatest ? (el: HTMLDivElement | null) => {
                                if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "end" }), 150);
                              } : undefined}
                            >
                              <div className="flex items-center gap-3 py-2.5">
                                <div className="shrink-0">
                                  {isCompleted ? (
                                    <motion.div
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                    >
                                      <IconCheck className="w-4 h-4 text-emerald-500" />
                                    </motion.div>
                                  ) : (
                                    <IconLoader2 className="w-4 h-4 text-violet-400 animate-spin" />
                                  )}
                                </div>
                                <span
                                  className={`text-sm sm:text-base leading-snug ${
                                    isLatest
                                      ? "text-violet-400 font-medium"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {step}{isLatest && <span className="animate-pulse">...</span>}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : filmTvResults.length === 0 && !filmTvHasSearched ? (
              <div />
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
                      <MasksSketch size={56} className="text-muted-foreground/50" />
                      <p className="stage-direction mt-5 text-sm text-muted-foreground">
                        (nothing on this bill.)
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div id="search-results" className="space-y-4">
                <ActiveFilterChips
                  filters={filters}
                  labels={{ gender: "Gender", age_range: "Age", emotion: "Emotion", theme: "Theme", category: "Category", tone: "Tone", difficulty: "Difficulty", author: "Author", max_duration: "Max Duration" }}
                  onRemove={(key) => setFilters((f) => ({ ...f, [key]: "" }))}
                  onClearAll={() => setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" })}
                />
                {/* Results header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 mb-8">
                  <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-0 min-w-0">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-2xl font-semibold tabular-nums text-foreground">
                          {showBookmarkedOnly
                            ? filmTvResults.filter((m) => m.is_favorited).length
                            : filmTvTotal > 0 ? filmTvTotal : filmTvResults.length}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {showBookmarkedOnly ? "in your collection" : "monologues found"}
                        </span>
                      </div>
                      {!showBookmarkedOnly && queryUsedForResults && (
                        <span className="text-xs text-muted-foreground/50">from Film & TV scripts in our library</span>
                      )}
                    </div>
                    <Button
                      variant={showBookmarkedOnly ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                      className={`sm:hidden gap-2 rounded-full shrink-0 ${!showBookmarkedOnly ? "hover:bg-teal-500/15 hover:text-teal-600 hover:border-teal-500/30 dark:hover:text-teal-400 dark:hover:border-teal-400/30" : ""}`}
                    >
                      <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                      Collection
                    </Button>
                  </div>
                  <div className="flex-1 flex justify-center min-w-0">
                    <ResultsFeedbackPrompt
                      context="film_tv_search"
                      resultsViewCount={filmTvResultsViewCount}
                      onOpenContact={() => setContactOpen(true)}
                    />
                  </div>
                  <Button
                    variant={showBookmarkedOnly ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                    className={`hidden sm:inline-flex gap-2 rounded-full shrink-0 ${!showBookmarkedOnly ? "hover:bg-teal-500/15 hover:text-teal-600 hover:border-teal-500/30 dark:hover:text-teal-400 dark:hover:border-teal-400/30" : ""}`}
                  >
                    <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                    In your collection
                  </Button>
                </div>
                {/* Monologue cards grid */}
                {(() => {
                  const filmTvDisplay = showBookmarkedOnly ? filmTvResults.filter((m) => m.is_favorited) : filmTvResults;
                  if (filmTvDisplay.length === 0) {
                    return (
                      <Card className="border-dashed bg-muted/20">
                        <CardContent className="flex flex-col items-center pt-12 pb-12 text-center">
                          <MasksSketch size={56} className="text-muted-foreground/50" />
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
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filmTvDisplay.map((mono, idx) => (
                        <MonologueResultCard
                          key={mono.id}
                          mono={mono}
                          index={idx}
                          onSelect={() => openMonologue(mono, idx, "film_tv")}
                          onToggleFavorite={toggleFavorite}
                          isModerator={!!user?.is_moderator}
                          onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                          matchReasons={computeMatchReasons(mono, undefined, filters)}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            )
          ) : isPlaysLoading ? (
            <motion.div
              key="plays-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pt-6 pb-10"
            >
              <div className="max-w-3xl mx-auto">
                <div className="relative">
                  {loadingSteps.length > 3 && (
                    <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
                  )}
                  <div
                    ref={loadingScrollRef}
                    className="border-l-2 border-border/60 pl-3 sm:pl-5 max-h-44 sm:max-h-64 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  >
                    <AnimatePresence initial={false}>
                      {loadingSteps.map((step, i) => {
                        const isLatest = i === loadingSteps.length - 1;
                        const isCompleted = i < loadingSteps.length - 1;
                        return (
                          <motion.div
                            key={`step-${i}`}
                            initial={{ opacity: 0, height: 0, x: -8 }}
                            animate={{ opacity: 1, height: "auto", x: 0 }}
                            transition={{ duration: 0.35, ease: "easeOut" }}
                            className="overflow-hidden"
                            ref={isLatest ? (el: HTMLDivElement | null) => {
                              if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "end" }), 150);
                            } : undefined}
                          >
                            <div className="flex items-center gap-3 py-2.5">
                              <div className="shrink-0">
                                {isCompleted ? (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                  >
                                    <IconCheck className="w-4 h-4 text-emerald-500" />
                                  </motion.div>
                                ) : (
                                  <IconLoader2 className="w-4 h-4 text-primary animate-spin" />
                                )}
                              </div>
                              <span
                                className={`text-sm sm:text-base leading-snug ${
                                  isLatest
                                    ? "text-primary font-medium"
                                    : "text-muted-foreground/60"
                                }`}
                              >
                                {step}
                                {isLatest && (
                                  <motion.span
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                  >
                                    ...
                                  </motion.span>
                                )}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {loadingSteps.length === 0 && (
                      <div className="flex items-center gap-3 py-2.5">
                        <IconLoader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                        <span className="text-sm sm:text-base text-primary font-medium">
                          Waking the theater up
                          <motion.span
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                          >
                            ...
                          </motion.span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                    onSwitchSource={(st) => setSearchMode(st === "play" ? "plays" : "film_tv")}
                  />
                </div>
              ) : (
                <NoResultsState
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
                </NoResultsState>
              )}
            </motion.div>
          ) : results.length > 0 ? (
            <div id="search-results" className="space-y-4">
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
                  onSwitchSource={(st) => setSearchMode(st === "play" ? "plays" : "film_tv")}
                />
              )}
              {sceneGap && <SceneGapBanner />}
              {/* Never relax silently: say which constraint was loosened to fill results. */}
              {broadened && broadened.relaxed.length > 0 && (
                <div className="border border-border border-l-2 border-l-[#CB4B00] bg-muted/40 px-4 py-3">
                  <p className="text-sm text-foreground">
                    Only a few exact matches, so I broadened the{" "}
                    <span className="font-medium">{formatRelaxed(broadened.relaxed)}</span>.
                  </p>
                </div>
              )}
              {/* Weak result set with no named-title gap: offer to request the query. */}
              {weakMatch && !contentGap && (
                <div className="border border-border bg-card p-4 space-y-2">
                  <p className="text-sm text-foreground">
                    No strong match for{" "}
                    <span className="font-semibold">{queryUsedForResults}</span>. Here are the
                    closest ones.
                  </p>
                  <RequestQueryButton query={queryUsedForResults} className="flex items-center" />
                </div>
              )}
              {/* One toolbar: how many, what shaped the search, and the
                  collection toggle. These used to be four stacked strips —
                  filter chips, "Understood:" chips, a profile nudge and the
                  count row — which pushed the results down and read as noise. */}
              <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/50 pb-4">
                <div className="flex items-baseline gap-2 shrink-0">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {showBookmarkedOnly
                      ? results.filter((m) => m.is_favorited).length
                      : total > 0 ? total : results.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {showBookmarkedOnly ? "in your collection" : "monologues"}
                  </span>
                </div>

                {/* basis-full drops the chips onto their own line on a phone,
                    where squeezing them between the count and the button
                    interleaved everything; inline from sm up. */}
                <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-2 sm:order-none sm:basis-auto sm:flex-1">
                  <ActiveFilterChips
                    filters={filters}
                    labels={{ gender: "Gender", age_range: "Age", emotion: "Emotion", theme: "Theme", category: "Category", tone: "Tone", difficulty: "Difficulty", author: "Author", max_duration: "Max Duration" }}
                    onRemove={(key) => setFilters((f) => ({ ...f, [key]: "" }))}
                    onClearAll={() => setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" })}
                  />
                  <ParsedConstraintChips constraints={parsedConstraints} onRemove={handleRemoveConstraint} />
                </div>

                <Button
                  variant={showBookmarkedOnly ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                  className={`ml-auto gap-2 rounded-full shrink-0 ${!showBookmarkedOnly ? "hover:bg-teal-500/15 hover:text-teal-600 hover:border-teal-500/30 dark:hover:text-teal-400 dark:hover:border-teal-400/30" : ""}`}
                >
                  <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                  <span className="hidden sm:inline">In your collection</span>
                  <span className="sm:hidden">Collection</span>
                </Button>
              </div>

              {/* Unified results grid: Best Match + Related use same card layout; hide confidence for broad queries */}
              {(() => {
                const relatedOrBookmarked = showBookmarkedOnly ? results.filter((m) => m.is_favorited) : sortedRelated;
                const hasCards = (!showBookmarkedOnly && bestMatches.length > 0) || relatedOrBookmarked.length > 0;
                if (!hasCards) return null;
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
                const showDivider =
                  !showBookmarkedOnly &&
                  looserRelated.length > 0 &&
                  bestMatches.length + strongRelated.length > 0;
                const renderCard = (mono: Monologue, idx: number, variant: "bestMatch" | "default") => (
                  <MonologueResultCard
                    key={mono.id}
                    mono={mono}
                    onSelect={() => openMonologue(mono, idx, "monologue")}
                    onToggleFavorite={toggleFavorite}
                    variant={variant}
                    index={idx}
                    /* The rank label comes from position alone, so a piece below
                       the divider could read "Great match" while the divider
                       above it says these are the further-afield ones. The
                       divider already states the band; drop the badge there. */
                    showMatchBadge={showBadges && mono.band !== "looser"}
                    isModerator={!!user?.is_moderator}
                    onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                    highlightFields={queryHighlights}
                    matchReasons={computeMatchReasons(mono, queryHighlights, filters, profileMatchMap.get(mono.id))}
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
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {!showBookmarkedOnly && bestMatches.map((mono, idx) => renderCard(mono, idx, "bestMatch"))}
                      {strongRelated.map((mono, idx) => renderCard(mono, baseOffset + idx, "default"))}
                    </div>
                    {showDivider && (
                      <>
                        {/* "Looser matches" read like a verdict on the actor's
                            taste. Same meaning, said as a stage direction. */}
                        <div className="mt-8 mb-4 border-t border-border pt-3">
                          <span className="stage-direction text-sm text-muted-foreground/70">
                            (further afield.)
                          </span>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {looserRelated.map((mono, idx) =>
                            renderCard(mono, baseOffset + strongRelated.length + idx, "default"),
                          )}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
              {hasMore && !showBookmarkedOnly && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="rounded-full px-8"
                  >
                    {isLoadingMore ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
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
            </div>
          ) : (
            // Pre-search: fill the space with something that helps them start —
            // the pieces actors are working on right now. On search this exits
            // (mode="wait") and results take the stage.
            <motion.div
              key="trending-presearch"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {/* Personalization, surfaced by default (not hidden behind "Find
                  for me"): profile-havers rehearse ~1.6x more. Recruits a profile
                  when there isn't one. Plays only — film/TV recs are separate. */}
              {searchMode === "plays" && <ForYouShelf />}
              <TrendingPreSearch />
              {/* Last, not first: the shelves are personal and current, these
                  are the fallback for when nothing there catches you. */}
              <StartingPoints mode={searchMode} />
            </motion.div>
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
              className="fixed inset-0 z-[10000] bg-black"
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
              className={`fixed right-0 top-0 bottom-0 z-[10001] overflow-y-auto bg-background border-l shadow-2xl transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
                isReadingMode
                  ? "w-full"
                  : "w-full md:w-[600px] lg:w-[700px]"
              }`}
            >
              <div className={`sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10002] ${
                isReadingMode ? "border-b-0" : ""
              }`}>
                <div className="flex items-center justify-end px-4 py-3">
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
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#CB4B00] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B03000]"
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
          <SearchTour onDismiss={async () => { setShowSearchTour(false); await refreshUser(); }} />
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
