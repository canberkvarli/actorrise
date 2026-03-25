"use client";

import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { SearchTour } from "@/components/onboarding/SearchTour";
import { useTypewriterPlaceholder } from "@/hooks/useTypewriterPlaceholder";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { toastBookmark } from "@/lib/toast";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconBookmark, IconExternalLink, IconEye, IconEyeOff, IconDownload, IconInfoCircle, IconAdjustments, IconTargetArrow, IconSend, IconFlag, IconDeviceTv, IconEdit, IconCheck, IconBulb } from "@tabler/icons-react";

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
  "Rifling through 9,500+ scripts and plays",
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
import { addSearchToHistory, getSearchById } from "@/lib/searchHistory";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueResultCard } from "@/components/monologue/MonologueResultCard";
import { SearchFiltersSheet, getDurationLabel } from "@/components/search/SearchFiltersSheet";
import { FilmTvReferenceCard } from "@/components/search/FilmTvReferenceCard";
import { accentTeal } from "@/components/search/MatchIndicatorTag";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { FilmTvInfoModal } from "@/components/search/FilmTvInfoModal";
import { ReportMonologueModal } from "@/components/monologue/ReportMonologueModal";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";
import { FreshnessToggle } from "@/components/search/FreshnessToggle";
import { ContactModal } from "@/components/contact/ContactModal";
import { ResultsFeedbackPrompt } from "@/components/feedback/ResultsFeedbackPrompt";
import { extractQueryHighlights } from "@/lib/queryMatchHighlight";
import { ActiveFilterChips } from "@/components/search/ActiveFilterChips";
import { computeMatchReasons, computeFilmTvMatchReasons } from "@/lib/matchReasons";
import { QuickFilterChips } from "@/components/search/QuickFilterChips";
import { ContentGapBanner } from "@/components/search/ContentGapBanner";
import type { FilmTvReference } from "@/types/filmTv";
import { getFilmTvScriptUrl } from "@/lib/utils";
import { ScriptSourcePicker } from "@/components/search/ScriptSourcePicker";
import { useFilmTvFavorites, useToggleFilmTvFavorite } from "@/hooks/useFilmTvFavorites";
import { useProfileStats, useProfileFormData } from "@/hooks/useDashboardData";
import { computeProfileMatch, type ProfileMatch } from "@/lib/profileMatch";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SearchPage() {
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
  const [showFilmTvBookmarkedOnly, setShowFilmTvBookmarkedOnly] = useState(false);
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
  const [filmTvResults, setFilmTvResults] = useState<FilmTvReference[]>([]);
  const [filmTvTotal, setFilmTvTotal] = useState(0);
  const [filmTvHasSearched, setFilmTvHasSearched] = useState(false);
  const [showFilmTvInfoModal, setShowFilmTvInfoModal] = useState(false);
  const [filmTvFilters, setFilmTvFilters] = useState({
    type: "",
    genre: "",
    year_min: "",
    year_max: "",
    director: "",
    imdb_rating_min: "",
  });
  /** Brief viewport outline "woosh" when switching tabs: orange (plays) or purple (film/tv) */
  const [outlineFlash, setOutlineFlash] = useState<"plays" | "film_tv" | null>(null);
  const [showFilmTvFilters, setShowFilmTvFilters] = useState(false);
  const [selectedFilmTvRef, setSelectedFilmTvRef] = useState<FilmTvReference | null>(null);
  const [filmTvPosterError, setFilmTvPosterError] = useState(false);
  const [filmTvEditScriptOpen, setFilmTvEditScriptOpen] = useState(false);
  const [filmTvEditScriptValue, setFilmTvEditScriptValue] = useState("");
  const [filmTvEditScriptSaving, setFilmTvEditScriptSaving] = useState(false);
  const [editMonologueId, setEditMonologueId] = useState<number | null>(null);
  const [editMonologueSaving, setEditMonologueSaving] = useState(false);
  const [showProfileCompleteModal, setShowProfileCompleteModal] = useState(false);
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
  const [contentGap, setContentGap] = useState<{ play: string | null; author: string | null } | null>(null);
  const [queryInvalidReason, setQueryInvalidReason] = useState<string | null>(null);
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

  const { data: filmTvFavorites = [] } = useFilmTvFavorites();
  const toggleFilmTvFavoriteMutation = useToggleFilmTvFavorite();
  const savedFilmTvIds = useMemo(() => new Set(filmTvFavorites.map((r) => r.id)), [filmTvFavorites]);

  // Show search tour for first-time visitors
  useEffect(() => {
    if (user && user.has_seen_search_tour === false) {
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

  // Scroll panel to top when monologue is selected
  useEffect(() => {
    if (selectedMonologue && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [selectedMonologue]);

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
  }, [filmTvHasSearched, filmTvResults.length, filmTvResultsViewCount]);

  // Restore search state from URL and sessionStorage whenever this page is (re)visited.
  // This allows search results to persist across refreshes AND when navigating away
  // to other pages and then back to /search. Supports both Plays and Film & TV.
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
      const urlFilmTvFilters: typeof filmTvFilters = {
        type: searchParams.get("type") ?? "",
        genre: searchParams.get("genre") ?? "",
        year_min: searchParams.get("year_min") ?? "",
        year_max: searchParams.get("year_max") ?? "",
        director: searchParams.get("director") ?? "",
        imdb_rating_min: searchParams.get("imdb_rating_min") ?? "",
      };
      setFilmTvQuery(urlQuery);
      setFilmTvFilters(urlFilmTvFilters);
      setRestoredFromLastSearch(false);

      const cacheKey = `film_tv_results_${urlQuery}_${JSON.stringify(urlFilmTvFilters)}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { results: cachedResults, total: cachedTotal } = JSON.parse(cached) as { results: FilmTvReference[]; total: number };
          setFilmTvResults(cachedResults);
          setFilmTvTotal(cachedTotal);
          setFilmTvHasSearched(true);
          return;
        } catch (e) {
          console.error("Error parsing cached film_tv results:", e);
        }
      }

      const hasFilmTvParams = urlQuery.trim() !== "" || Object.values(urlFilmTvFilters).some((v) => v !== "");
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
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1" });
            if (urlQuery.trim()) params.set("q", urlQuery.trim());
            Object.entries(urlFilmTvFilters).forEach(([key, value]) => {
              if (value) params.set(key, value);
            });
            const res = await api.get<{ results: FilmTvReference[]; total: number }>(`/api/film-tv/search?${params.toString()}`, { signal: ctrl.signal });
            setFilmTvResults(res.data.results);
            setFilmTvTotal(res.data.total);
            setFilmTvHasSearched(true);
            const payload = { query: urlQuery.trim(), filmTvFilters: urlFilmTvFilters, results: res.data.results, total: res.data.total };
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
          const last = JSON.parse(lastFilmTvRaw) as { query: string; filmTvFilters: typeof filmTvFilters; results: FilmTvReference[]; total: number };
          setFilmTvQuery(last.query);
          setFilmTvFilters(last.filmTvFilters);
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
            tone: (last.filters as any).tone ?? "",
            difficulty: (last.filters as any).difficulty ?? "",
            author: (last.filters as any).author ?? "",
            max_duration: (last.filters as any).max_duration ?? "",
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
          const last = JSON.parse(lastFilmTvRaw) as { query: string; filmTvFilters: typeof filmTvFilters; results: FilmTvReference[]; total: number };
          setSearchMode("film_tv");
          setFilmTvQuery(last.query);
          setFilmTvFilters(last.filmTvFilters);
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
          tone: (last.filters as any).tone ?? "",
          difficulty: (last.filters as any).difficulty ?? "",
          author: (last.filters as any).author ?? "",
          max_duration: (last.filters as any).max_duration ?? "",
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

  // Auto-open monologue from URL on mount (e.g. shared link /search?m=123)
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

  type SearchResponseShape = {
    results: Monologue[];
    total: number;
    page: number;
    page_size: number;
    corrected_query?: string | null;
    query_may_have_typos?: boolean;
    content_gap?: { play: string | null; author: string | null } | null;
    query_invalid_reason?: string | null;
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
    } else {
      setIsLoadingMore(true);
    }
    setHasSearched(true);
    setRestoredFromLastSearch(false);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(pageNum) });
      if (searchQuery.trim()) params.set("q", searchQuery);
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      if (effectiveMaxOverdone < 1) params.set("max_overdone_score", String(effectiveMaxOverdone));

      const response = await api.get<SearchResponseShape>(
        `/api/monologues/search?${params.toString()}`,
        { timeoutMs: 180000, signal: controller.signal }
      );
      const data = response.data;
      const newResults = data.results;

      if (append) {
        setResults((prev) => [...prev, ...newResults]);
      } else {
        setResults(newResults);
        setCorrectedQuery(data.corrected_query ?? null);
        setQueryMayHaveTypos(data.query_may_have_typos ?? false);
        setContentGap(data.content_gap ?? null);
        setQueryInvalidReason(data.query_invalid_reason ?? null);
      }
      setTotal(data.total);
      setPage(data.page);
      setHasMore(newResults.length === PAGE_SIZE && newResults.length < data.total);

      // Cache results (first page only) in sessionStorage keyed by query+filters
      if (pageNum === 1) {
        playsActionAtRef.current = Date.now();
        const storageKey = `search_results_${searchQuery}_${JSON.stringify(searchFilters)}_${effectiveMaxOverdone}`;
        sessionStorage.setItem(storageKey, JSON.stringify({ items: newResults, total: data.total }));
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
        router.replace(`/search?${newParams.toString()}`, { scroll: false });
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
      setShowFilmTvFilters(false);
      const hasQueryOrFilters = filmTvQuery.trim() !== "" || Object.values(filmTvFilters).some((v) => v !== "");
      // Only set filmTvHasSearched and results when we actually run a fetch (query/filters or explicit "Browse all").
      // Cancel any in-flight search
      userStoppedRef.current = false;

      if (filmTvAbortRef.current) filmTvAbortRef.current.abort();
      const controller = new AbortController();
      filmTvAbortRef.current = controller;
      setFilmTvHasSearched(true);
      setIsFilmTvLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: "1" });
        if (filmTvQuery.trim()) params.set("q", filmTvQuery.trim());
        Object.entries(filmTvFilters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const res = await api.get<{ results: FilmTvReference[]; total: number }>(
          `/api/film-tv/search?${params.toString()}`,
          { signal: controller.signal }
        );
        const results = res.data.results;
        const total = res.data.total;
        setFilmTvResults(results);
        setFilmTvTotal(total);
        // Persist so refresh or navigating away and back keeps Film & TV results (like plays).
        try {
          const payload = { query: filmTvQuery.trim(), filmTvFilters, results, total };
          sessionStorage.setItem(FILM_TV_LAST_SEARCH_KEY, JSON.stringify(payload));
          const cacheKey = `film_tv_results_${filmTvQuery.trim()}_${JSON.stringify(filmTvFilters)}`;
          sessionStorage.setItem(cacheKey, JSON.stringify({ results, total }));
          sessionStorage.setItem(SEARCH_LAST_MODE_KEY, "film_tv");
        } catch (e) {
          console.error("Error persisting film_tv search:", e);
        }
        // Increment results view count for feedback prompt ("Were these results what you expected?")
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
        Object.entries(filmTvFilters).forEach(([key, value]) => {
          if (value) urlParams.set(key, value);
        });
        router.replace(`/search?${urlParams.toString()}`, { scroll: false });
      } catch (err: unknown) {
        if (userStoppedRef.current) { userStoppedRef.current = false; return; }
        if (filmTvAbortRef.current !== controller) return;
        const msg = err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Search failed.";
        setSearchError(typeof msg === "string" ? msg : "Search failed.");
        setFilmTvResults([]);
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
    // If we already know profile is incomplete, show modal without calling the API
    const profileIncomplete = profileStats != null && profileStats.completion_percentage < 50;
    if (profileIncomplete) {
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
      // navigating away and back to /search keeps them visible.
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
      router.replace("/search?ai=true", { scroll: false });

      // Increment results view count for "every other search" feedback prompt
      try {
        const prev = parseInt(sessionStorage.getItem(RESULTS_VIEW_COUNT_KEY) || "0", 10);
        const next = (Number.isNaN(prev) ? 0 : prev) + 1;
        sessionStorage.setItem(RESULTS_VIEW_COUNT_KEY, String(next));
        setResultsViewCount(next);
      } catch {
        // ignore
      }
    } catch (error: any) {
      const isProfileError =
        error?.response?.status === 400 ||
        (typeof error?.message === "string" && /profile|complete your profile|actor profile not found/i.test(error.message));
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

  const openMonologue = (mono: Monologue) => {
    setSelectedMonologue(mono);
    setIsLoadingDetail(false);
    setIsReadingMode(false);
    // Reflect the open monologue in the URL so it's shareable
    const params = new URLSearchParams(searchParams.toString());
    params.set("m", mono.id.toString());
    router.replace(`/search?${params.toString()}`, { scroll: false });
    // Fetch fresh data in background (view count, etc.)
    api.get<Monologue>(`/api/monologues/${mono.id}`)
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
    const newUrl = params.toString() ? `/search?${params.toString()}` : "/search";
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
  const toggleFavorite = async (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    const previousResults = results;
    const previousSelected = selectedMonologue;
    const monologueId = mono.id;

    try {
      if (mono.is_favorited) {
        setResults(results.map(m => m.id === mono.id ? { ...m, is_favorited: false, favorite_count: m.favorite_count - 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue(prev => prev ? { ...prev, is_favorited: false, favorite_count: prev.favorite_count - 1 } : null);
        }
        await api.delete(`/api/monologues/${mono.id}/favorite`);
        toastBookmark(false, {
          duration: 5000,
          label: "Monologue",
          onUndo: async () => {
            try {
              await api.post(`/api/monologues/${monologueId}/favorite`);
              setResults(prev => prev.map(m => m.id === monologueId ? { ...m, is_favorited: true, favorite_count: (m.favorite_count ?? 0) + 1 } : m));
              setSelectedMonologue(prev => prev?.id === monologueId ? { ...prev, is_favorited: true, favorite_count: (prev.favorite_count ?? 0) + 1 } : prev);
              queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
            } catch {
              toast.error("Couldn't restore bookmark.");
            }
          },
        });
      } else {
        setResults(results.map(m => m.id === mono.id ? { ...m, is_favorited: true, favorite_count: (m.favorite_count ?? 0) + 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue(prev => prev ? { ...prev, is_favorited: true, favorite_count: (prev.favorite_count ?? 0) + 1 } : null);
        }
        await api.post(`/api/monologues/${mono.id}/favorite`);
        toastBookmark(true, {
          duration: 5000,
          label: "Monologue",
          onUndo: async () => {
            try {
              await api.delete(`/api/monologues/${monologueId}/favorite`);
              setResults(prev => prev.map(m => m.id === monologueId ? { ...m, is_favorited: false, favorite_count: Math.max(0, (m.favorite_count ?? 1) - 1) } : m));
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
      setSelectedMonologue(previousSelected);
      toast.error("Couldn't update bookmark. Please try again.");
      console.error("Error toggling favorite:", error);
    }
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
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-7xl relative">
      {outlineOverlay}

      {/* Hero Search Section - compact on mobile */}
      <div className="mb-4 sm:mb-6 md:mb-10">
        <div className="text-center mb-3 sm:mb-4 md:mb-8">
          <p className="hidden md:inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-primary font-medium mb-4">
            <IconSparkles className="h-3 w-3" />
            AI-Powered Search
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-1 md:mb-3">Find your next piece</h1>
          <p className="hidden md:block text-muted-foreground text-lg max-w-lg mx-auto">
            Describe what you&apos;re looking for in plain English; filters narrow results or let you browse by criteria.
          </p>
        </div>

        {/* Plays vs Film & TV toggle: spacious on mobile, 44px touch targets */}
        <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4 px-1">
          <div className="w-full max-w-sm sm:max-w-none sm:w-auto inline-flex rounded-xl border border-border bg-muted/40 p-2 gap-2 sm:p-1 sm:gap-0">
            <button
              type="button"
              className={`flex-1 sm:flex-none min-h-[44px] sm:min-w-0 sm:px-4 sm:py-2 rounded-lg sm:rounded-md text-sm font-medium transition-colors touch-manipulation ${
                searchMode === "plays"
                  ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30 ring-inset"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
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
                router.replace(`/search?${params.toString()}`, { scroll: false });
              }}
            >
              Plays
            </button>
            <button
              type="button"
              className={`flex-1 sm:flex-none min-h-[44px] sm:min-w-0 sm:px-4 sm:py-2 rounded-lg sm:rounded-md text-sm font-medium transition-colors touch-manipulation ${
                searchMode === "film_tv"
                  ? "bg-[rgba(167,139,250,0.12)] shadow text-foreground ring-1 ring-[rgba(167,139,250,0.45)] ring-inset"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
              onClick={() => {
                filmTvActionAtRef.current = Date.now();
                setSearchMode("film_tv");
                setSearchError(null);
                setOutlineFlash("film_tv");
                const params = new URLSearchParams();
                params.set("mode", "film_tv");
                if (filmTvQuery) params.set("q", filmTvQuery);
                Object.entries(filmTvFilters).forEach(([key, value]) => {
                  if (value) params.set(key, value);
                });
                router.replace(`/search?${params.toString()}`, { scroll: false });
                if (typeof window !== "undefined" && !localStorage.getItem("film_tv_info_seen")) {
                  setShowFilmTvInfoModal(true);
                }
              }}
            >
              Film &amp; TV
            </button>
          </div>
          <div className="w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
            {searchMode === "film_tv" ? (
              <button
                type="button"
                onClick={() => setShowFilmTvInfoModal(true)}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                aria-label="Learn about Film & TV reference"
              >
                <IconInfoCircle className="h-4 w-4" />
              </button>
            ) : (
              <span className="w-10 h-10" aria-hidden />
            )}
          </div>
        </div>
        <FilmTvInfoModal
          open={showFilmTvInfoModal}
          onOpenChange={(open) => {
            setShowFilmTvInfoModal(open);
            if (typeof window !== "undefined" && !open) localStorage.setItem("film_tv_info_seen", "1");
          }}
        />

        {/* Search Bar - stacked on mobile for easier tap targets */}
        <div className="max-w-3xl mx-auto">
          <div className="relative group">
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
              className={`relative flex flex-col md:flex-row md:items-center gap-2 p-2 bg-card border rounded-xl shadow-sm transition-all duration-300 ${
                isTyping
                  ? searchMode === "film_tv"
                    ? "border-violet-400/50 shadow-lg shadow-violet-400/5"
                    : "border-primary/50 shadow-lg shadow-primary/5"
                  : "border-border"
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
                  className="pl-12 pr-10 min-h-[48px] md:h-12 text-base border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
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
              <Button
                onClick={isLoading ? stopSearch : handleSearch}
                size="default"
                variant={isLoading ? "outline" : "default"}
                className={`shrink-0 min-h-[44px] min-w-[44px] md:min-h-[2.5rem] md:min-w-0 px-4 md:px-6 rounded-lg transition-all duration-300 ${
                  isLoading ? "" : isTyping ? (searchMode === "film_tv" ? "shadow-md shadow-violet-400/20" : "shadow-md shadow-primary/20") : ""
                }`}
              >
                {isLoading ? (
                  <>
                    <IconX className="h-4 w-4" />
                    <span className="hidden md:inline ml-1">Stop</span>
                  </>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </div>

          {/* Action Row - Filters (Plays or Film & TV) + Find for me (Plays only) */}
          <div id="search-filters" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-3 sm:mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              {searchMode === "plays" && (
                <>
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
                  <Link
                    href="/submit-monologue"
                    className="hidden md:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <IconSend className="h-4 w-4" />
                    Submit monologue
                  </Link>
                </>
              )}
              {searchMode === "film_tv" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilmTvFilters(!showFilmTvFilters)}
                    className={`gap-2 text-muted-foreground hover:text-foreground min-h-[44px] md:min-h-0 ${showFilmTvFilters ? "text-foreground bg-muted" : ""}`}
                  >
                    <IconAdjustments className="h-4 w-4" />
                    Filters
                    {Object.values(filmTvFilters).some((v) => v !== "") && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {Object.values(filmTvFilters).filter((v) => v !== "").length}
                      </Badge>
                    )}
                  </Button>
                  {Object.values(filmTvFilters).some((v) => v !== "") && (
                    <button
                      type="button"
                      onClick={() => setFilmTvFilters({ type: "", genre: "", year_min: "", year_max: "", director: "", imdb_rating_min: "" })}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Clear filters
                    </button>
                  )}
                </>
              )}
            </div>

            {searchMode === "plays" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      id="search-find-for-me"
                      onClick={handleFindForMe}
                      disabled={isLoading}
                      variant="outline"
                      size="sm"
                      className="gap-2 min-h-[44px] md:min-h-0"
                    >
                      <IconSparkles className="h-4 w-4 text-primary" />
                      Find for me
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      Get AI-powered recommendations based on your actor profile.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Quick filter chips — one-tap popular filters (Plays only) */}
          {searchMode === "plays" && (
            <div className="mt-3">
              <QuickFilterChips
                filters={filters}
                onToggle={(key, value) => setFilters({ ...filters, [key]: value })}
              />
            </div>
          )}

          {/* Mobile: filters in sheet (SearchFiltersSheet). Desktop: expandable inline filters (Plays only) */}
          {searchMode === "plays" && (
            <SearchFiltersSheet
              open={showFiltersSheet}
              onOpenChange={setShowFiltersSheet}
              filters={filters}
              setFilters={setFilters}
              maxOverdoneScore={maxOverdoneScore}
              setMaxOverdoneScore={setMaxOverdoneScore}
            />
          )}

          {selectedMonologue && (
            <ReportMonologueModal
              open={reportOpen}
              onOpenChange={setReportOpen}
              monologueId={selectedMonologue.id}
              characterName={selectedMonologue.character_name}
              playTitle={selectedMonologue.play_title}
            />
          )}

          {/* Film & TV: expandable filters panel */}
          {searchMode === "film_tv" && showFilmTvFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 bg-card border border-border rounded-lg"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select
                    value={filmTvFilters.type || "__any__"}
                    onValueChange={(v) => setFilmTvFilters((f) => ({ ...f, type: v === "__any__" ? "" : v }))}
                  >
                    <SelectTrigger className="w-full min-h-[44px] px-3 py-2 text-sm">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      <SelectItem value="movie">Movie</SelectItem>
                      <SelectItem value="tvSeries">TV Series</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Genre</Label>
                  <Select
                    value={filmTvFilters.genre || "__any__"}
                    onValueChange={(v) => setFilmTvFilters((f) => ({ ...f, genre: v === "__any__" ? "" : v }))}
                  >
                    <SelectTrigger className="w-full min-h-[44px] px-3 py-2 text-sm">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      <SelectItem value="drama">Drama</SelectItem>
                      <SelectItem value="comedy">Comedy</SelectItem>
                      <SelectItem value="crime">Crime</SelectItem>
                      <SelectItem value="thriller">Thriller</SelectItem>
                      <SelectItem value="biography">Biography</SelectItem>
                      <SelectItem value="romance">Romance</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                      <SelectItem value="history">History</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Year from</Label>
                  <input
                    type="number"
                    placeholder="e.g. 1990"
                    value={filmTvFilters.year_min}
                    onChange={(e) => setFilmTvFilters((f) => ({ ...f, year_min: e.target.value }))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-input bg-background"
                    min={1950}
                    max={2025}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Year to</Label>
                  <input
                    type="number"
                    placeholder="e.g. 2010"
                    value={filmTvFilters.year_max}
                    onChange={(e) => setFilmTvFilters((f) => ({ ...f, year_max: e.target.value }))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-input bg-background"
                    min={1950}
                    max={2025}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Min IMDb rating</Label>
                  <Select
                    value={filmTvFilters.imdb_rating_min || "__any__"}
                    onValueChange={(v) => setFilmTvFilters((f) => ({ ...f, imdb_rating_min: v === "__any__" ? "" : v }))}
                  >
                    <SelectTrigger className="w-full min-h-[44px] px-3 py-2 text-sm">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      <SelectItem value="6">6+</SelectItem>
                      <SelectItem value="7">7+</SelectItem>
                      <SelectItem value="7.5">7.5+</SelectItem>
                      <SelectItem value="8">8+</SelectItem>
                      <SelectItem value="8.5">8.5+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Director</Label>
                  <input
                    type="text"
                    placeholder="e.g. Nolan"
                    value={filmTvFilters.director}
                    onChange={(e) => setFilmTvFilters((f) => ({ ...f, director: e.target.value }))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-input bg-background"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Expandable Filters - desktop only (Plays mode) */}
          {searchMode === "plays" && showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="hidden md:block mt-4 p-4 bg-card border border-border rounded-lg"
            >
              {/* 3-section grouped layout: Character | Mood & Style | Practical */}
              <div className="grid grid-cols-3 gap-6">
                {/* Character */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Character</h4>
                  {[
                    { key: "gender", label: "Gender", options: ["male", "female", "any"] },
                    { key: "age_range", label: "Age Range", options: ["teens", "20s", "30s", "40s", "50s", "60+"] },
                  ].map(({ key, label, options }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Select
                        value={filters[key as keyof typeof filters] || "__any__"}
                        onValueChange={(v) => setFilters({ ...filters, [key]: v === "__any__" ? "" : v })}
                      >
                        <SelectTrigger className="w-full h-9 px-2.5 text-sm">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any__">Any</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {/* Mood & Style */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Mood & Style</h4>
                  {[
                    { key: "emotion", label: "Emotion", options: ["joy", "sadness", "anger", "fear", "melancholy", "hope"] },
                    { key: "tone", label: "Tone", options: ["dramatic", "comedic", "dark", "romantic", "philosophical", "contemplative"] },
                    { key: "theme", label: "Theme", options: ["love", "death", "betrayal", "identity", "power", "revenge"] },
                  ].map(({ key, label, options }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Select
                        value={filters[key as keyof typeof filters] || "__any__"}
                        onValueChange={(v) => setFilters({ ...filters, [key]: v === "__any__" ? "" : v })}
                      >
                        <SelectTrigger className="w-full h-9 px-2.5 text-sm">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any__">Any</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {/* Practical */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">Practical</h4>
                  {[
                    { key: "category", label: "Category", options: ["classical", "contemporary"] },
                    { key: "difficulty", label: "Difficulty", options: ["beginner", "intermediate", "advanced"] },
                    { key: "max_duration", label: "Max Duration", options: [
                      { value: "60", label: "1 min" },
                      { value: "90", label: "1.5 min" },
                      { value: "120", label: "2 min" },
                      { value: "180", label: "3 min" },
                      { value: "300", label: "5 min" },
                    ] },
                  ].map(({ key, label, options }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Select
                        value={filters[key as keyof typeof filters] || "__any__"}
                        onValueChange={(v) => setFilters({ ...filters, [key]: v === "__any__" ? "" : v })}
                      >
                        <SelectTrigger className="w-full h-9 px-2.5 text-sm">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any__">Any</SelectItem>
                          {(options as Array<string | { value: string; label: string }>).map((opt) =>
                            typeof opt === "string" ? (
                              <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>
                            ) : (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Author</Label>
                    <input
                      type="text"
                      placeholder="e.g. Shakespeare"
                      value={filters.author}
                      onChange={(e) => setFilters({ ...filters, author: e.target.value })}
                      className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* Originality toggle — full width below the 3 columns */}
              <div className="mt-4 pt-4 border-t border-border/60">
                <FreshnessToggle value={maxOverdoneScore} onChange={setMaxOverdoneScore} />
              </div>

              {(activeFilters.length > 0 || hasFreshnessFilter) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t">
                  {activeFilters.map(([key, value]) => (
                    <span key={key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/80 text-foreground border border-border/40 capitalize">
                      <span className="text-muted-foreground">{key.replace(/_/g, " ")}:</span> {getFilterDisplay(key, value).split(": ").pop()}
                      <button
                        onClick={() => setFilters({ ...filters, [key]: "" })}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {hasFreshnessFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted/80 text-foreground border border-border/40">
                      <span className="text-muted-foreground">originality:</span> {maxOverdoneScore <= 0.3 ? "Fresh picks" : "Popular too"}
                      <button
                        onClick={() => setMaxOverdoneScore(1)}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={() => { setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" }); setMaxOverdoneScore(1); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="space-y-6">

        {/* Error banner with retry */}
        {searchError && (
          <Card className="border-destructive/50 bg-destructive/5 max-w-md mx-auto">
            <CardContent className="pt-4 pb-4 flex flex-col items-center text-center gap-3">
              <p className="text-sm text-destructive font-medium">{searchError}</p>
              {searchUpgradeUrl && (
                <Link href={searchUpgradeUrl}>
                  <Button variant="default" size="sm">View plans & upgrade</Button>
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={() => { setSearchError(null); setSearchUpgradeUrl(null); searchMode === "film_tv" ? handleSearch() : performSearch(playsQuery, filters); }}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

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
            ) : !filmTvHasSearched ? (
              <motion.div
                key="film-tv-empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border border-border/60 bg-gradient-to-b from-muted/30 to-muted/10 shadow-sm overflow-hidden max-w-md mx-auto">
                  <CardContent className="pt-10 pb-10 px-5 sm:px-6 text-center">
                    <div className="flex justify-center mb-4">
                      <div className="rounded-full bg-muted/80 p-3">
                        <IconDeviceTv className="h-7 w-7 text-foreground" aria-hidden />
                      </div>
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1.5">
                      Film & TV references
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                      Search by mood or scene, same as plays. Or browse all references.
                    </p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleSearch()}
                      className="rounded-full px-6 font-medium"
                      disabled={isLoading}
                    >
                      Browse all
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ) : filmTvResults.length === 0 ? (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="pt-12 pb-12 text-center">
                  <p className="text-muted-foreground text-sm">No references match. Try a different search or filters.</p>
                </CardContent>
              </Card>
            ) : (
              <div id="search-results" className="space-y-4">
                <ActiveFilterChips
                  filters={filmTvFilters}
                  labels={{ type: "Type", genre: "Genre", year_min: "From", year_max: "To", imdb_rating_min: "Min Rating", director: "Director" }}
                  onRemove={(key) => setFilmTvFilters((f) => ({ ...f, [key]: "" }))}
                  onClearAll={() => setFilmTvFilters({ type: "", genre: "", year_min: "", year_max: "", director: "", imdb_rating_min: "" })}
                />
                {/* Results header: count left, feedback center, Bookmarked only right (one row, same as plays) */}
                {(() => {
                  const filmTvBookmarked = filmTvResults.filter((r) => savedFilmTvIds.has(r.id));
                  const displayList = showFilmTvBookmarkedOnly ? filmTvBookmarked : filmTvResults;
                  return (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 mb-8">
                        <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-0 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap shrink-0">
                            <span className="text-2xl font-semibold tabular-nums text-foreground">
                              {showFilmTvBookmarkedOnly ? filmTvBookmarked.length : filmTvTotal}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {showFilmTvBookmarkedOnly ? "saved" : "references"}
                            </span>
                          </div>
                          <Button
                            variant={showFilmTvBookmarkedOnly ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setShowFilmTvBookmarkedOnly(!showFilmTvBookmarkedOnly)}
                            className="gap-2 rounded-full shrink-0 sm:hidden"
                          >
                            <IconBookmark className={`h-4 w-4 ${showFilmTvBookmarkedOnly ? "fill-current" : ""}`} />
                            Bookmarked
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
                          variant={showFilmTvBookmarkedOnly ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setShowFilmTvBookmarkedOnly(!showFilmTvBookmarkedOnly)}
                          className="hidden sm:inline-flex gap-2 rounded-full shrink-0"
                        >
                          <IconBookmark className={`h-4 w-4 ${showFilmTvBookmarkedOnly ? "fill-current" : ""}`} />
                          Bookmarked only
                        </Button>
                      </div>
                      {displayList.length === 0 ? (
                        <Card className="border-dashed bg-muted/20">
                          <CardContent className="pt-12 pb-12 text-center">
                            <p className="text-muted-foreground text-sm">
                              {showFilmTvBookmarkedOnly
                                ? "No saved references in this search. Save some to see them here."
                                : "No references match. Try a different search or filters."}
                            </p>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {displayList.map((ref, idx) => (
                            <FilmTvReferenceCard
                              key={ref.id}
                              ref_item={ref}
                              index={idx}
                              onSelect={() => setSelectedFilmTvRef(ref)}
                              isFavorited={savedFilmTvIds.has(ref.id)}
                              matchReasons={computeFilmTvMatchReasons(ref, filmTvQuery, filmTvFilters)}
                              onToggleFavorite={() => {
                                toggleFilmTvFavoriteMutation.mutate({
                                  referenceId: ref.id,
                                  isFavorited: savedFilmTvIds.has(ref.id),
                                  refForOptimistic: ref,
                                });
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </>
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
          ) : hasSearched && results.length === 0 ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="pt-12 pb-12 text-center max-w-md mx-auto">
                <IconSearch className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                {contentGap ? (
                  <ContentGapBanner play={contentGap.play} author={contentGap.author} />
                ) : queryInvalidReason === "gibberish" ? (
                  <>
                    <h3 className="text-2xl font-semibold mb-2">We couldn&apos;t understand that search</h3>
                    <p className="text-sm text-muted-foreground">
                      Try describing what you&apos;re looking for, like &quot;funny monologue for a woman in her 20s&quot; or a play title like &quot;Hamlet&quot;
                    </p>
                  </>
                ) : queryInvalidReason ? (
                  <>
                    <h3 className="text-2xl font-semibold mb-2">That search is too short</h3>
                    <p className="text-sm text-muted-foreground">
                      Try adding more detail, like &quot;sad monologue about loss&quot;
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-2xl font-semibold mb-2">Nothing matched your search</h3>
                    <p className="text-sm text-muted-foreground">
                      Try different words or remove some filters to see more results
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          ) : results.length > 0 ? (
            <div id="search-results" className="space-y-4">
              <ActiveFilterChips
                filters={filters}
                labels={{ gender: "Gender", age_range: "Age", emotion: "Emotion", theme: "Theme", category: "Category", tone: "Tone", difficulty: "Difficulty", author: "Author", max_duration: "Max Duration" }}
                onRemove={(key) => setFilters((f) => ({ ...f, [key]: "" }))}
                onClearAll={() => setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "", tone: "", difficulty: "", author: "", max_duration: "" })}
              />
              {searchParams.get("ai") === "true" && (
                <div className="flex items-center gap-2 p-4 bg-secondary/10 border border-secondary/30 rounded-lg">
                  <IconSparkles className="h-5 w-5 text-foreground flex-shrink-0" />
                  <p className="text-sm font-medium text-secondary-foreground">
                    AI-powered recommendations based on your profile
                  </p>
                </div>
              )}
              {/* Profile completeness nudge — only when user has searched but has no personalization data */}
              {hasSearched && results.length > 0 && profileData && !isPersonalized &&
                !profileData.preferred_genres?.length && !profileData.experience_level && !isDemoUser && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded border border-border bg-muted/30 text-sm text-muted-foreground">
                  <span>Complete your profile to get personalized results.</span>
                  <Link href="/profile" className="text-primary underline underline-offset-2 shrink-0">Set it up →</Link>
                </div>
              )}
              {correctedQuery && (
                <p className="text-sm text-muted-foreground">
                  Showing results for <span className="font-medium text-foreground">{correctedQuery}</span>
                </p>
              )}
              {contentGap && (
                <ContentGapBanner play={contentGap.play} author={contentGap.author} />
              )}
              {/* Results header: 3-col grid on desktop so feedback is always truly centered */}
              <div className="flex flex-col gap-3 mb-8 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
                {/* Left: count + mobile bookmark */}
                <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-semibold tabular-nums text-foreground">
                        {showBookmarkedOnly
                          ? results.filter((m) => m.is_favorited).length
                          : total > 0 ? total : results.length}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {showBookmarkedOnly ? "bookmarked" : "monologues found"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      {!showBookmarkedOnly && queryUsedForResults && (
                        <span className="text-muted-foreground/50">from 9,500+ in our library</span>
                      )}
                      {!showBookmarkedOnly && queryUsedForResults && !showConfidence && relatedResults.length > 0 && (
                        <span aria-hidden className="text-border">·</span>
                      )}
                      {!showBookmarkedOnly && !showConfidence && relatedResults.length > 0 && (
                        <span>Sorted by relevance</span>
                      )}
                      {restoredFromLastSearch && searchParams.get("q") === null && (
                        <>
                          {!showBookmarkedOnly && !showConfidence && relatedResults.length > 0 && (
                            <span aria-hidden className="text-border">·</span>
                          )}
                          <span>From your last search</span>
                        </>
                      )}
                    </div>
                    {isPersonalized && !showBookmarkedOnly && (
                      <span className="text-xs text-primary dark:text-orange-400">Matched to your profile</span>
                    )}
                  </div>
                  <Button
                    variant={showBookmarkedOnly ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                    className={`sm:hidden gap-2 rounded-full shrink-0 ${!showBookmarkedOnly ? "hover:bg-teal-500/15 hover:text-teal-600 hover:border-teal-500/30 dark:hover:text-teal-400 dark:hover:border-teal-400/30" : ""}`}
                  >
                    <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                    Bookmarked
                  </Button>
                </div>
                {/* Center: feedback — flex justify-center fills the 1fr middle column */}
                <div className="flex justify-center">
                  <ResultsFeedbackPrompt
                    context="search"
                    resultsViewCount={resultsViewCount}
                    onOpenContact={() => setContactOpen(true)}
                  />
                </div>
                {/* Right: desktop bookmark button */}
                <Button
                  variant={showBookmarkedOnly ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                  className={`hidden sm:inline-flex gap-2 rounded-full shrink-0 justify-self-end ${!showBookmarkedOnly ? "hover:bg-teal-500/15 hover:text-teal-600 hover:border-teal-500/30 dark:hover:text-teal-400 dark:hover:border-teal-400/30" : ""}`}
                >
                  <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                  Bookmarked only
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
                return (
                  <>
                    {!showBookmarkedOnly && showConfidence && bestMatches.length > 0 && (
                      <div className="flex items-center gap-2 mb-8">
                        <div className="p-2 rounded-lg bg-muted/80 ring-1 ring-border">
                          <IconTargetArrow className="h-5 w-5 text-foreground" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">This is the monologue</h2>
                          <p className="text-sm text-muted-foreground">We found the piece that contains your quote</p>
                        </div>
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {!showBookmarkedOnly && bestMatches.map((mono, idx) => (
                        <MonologueResultCard
                          key={mono.id}
                          mono={mono}
                          onSelect={() => openMonologue(mono)}
                          onToggleFavorite={toggleFavorite}
                          variant="bestMatch"
                          index={idx}
                          showMatchBadge={showBadges}
                          isModerator={!!user?.is_moderator}
                          onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                          highlightFields={queryHighlights}
                          matchReasons={computeMatchReasons(mono, queryHighlights, filters, profileMatchMap.get(mono.id))}
                        />
                      ))}
                      {relatedOrBookmarked.map((mono, idx) => (
                        <MonologueResultCard
                          key={mono.id}
                          mono={mono}
                          onSelect={() => openMonologue(mono)}
                          onToggleFavorite={toggleFavorite}
                          variant="default"
                          index={(!showBookmarkedOnly ? bestMatches.length : 0) + idx}
                          showMatchBadge={showBadges}
                          isModerator={!!user?.is_moderator}
                          onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                          highlightFields={queryHighlights}
                          matchReasons={computeMatchReasons(mono, queryHighlights, filters, profileMatchMap.get(mono.id))}
                        />
                      ))}
                    </div>
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
            </div>
          ) : null}
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
                        aria-label={selectedMonologue.is_favorited ? "Remove bookmark" : "Add bookmark"}
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
                      <h1 className="text-4xl font-bold font-typewriter">{selectedMonologue.character_name}</h1>
                      <div>
                        <p className="text-xl font-semibold font-typewriter text-muted-foreground">{selectedMonologue.play_title}</p>
                        <p className="text-muted-foreground font-typewriter">by {selectedMonologue.author}</p>
                      </div>
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

      {/* Film & TV reference detail panel */}
      <AnimatePresence>
        {selectedFilmTvRef && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFilmTvRef(null)}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 z-[10000] bg-black/50"
            />
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", opacity: { duration: 0.25 } }}
              className="fixed right-0 top-0 bottom-0 z-[10001] w-full md:w-[600px] lg:w-[700px] bg-background border-l shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10002]">
                <div className="flex items-center justify-between gap-2 p-6">
                  <h2 className="text-2xl font-bold truncate">
                    {selectedFilmTvRef.type === "tvSeries" ? "TV details" : "Movie details"}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedFilmTvRef)
                          toggleFilmTvFavoriteMutation.mutate({
                            referenceId: selectedFilmTvRef.id,
                            isFavorited: savedFilmTvIds.has(selectedFilmTvRef.id),
                            refForOptimistic: selectedFilmTvRef,
                          });
                      }}
                      className="hover:bg-muted min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground transition-colors duration-200 ease-out"
                      title={savedFilmTvIds.has(selectedFilmTvRef.id) ? "Remove from saved" : "Add to saved"}
                      aria-label={savedFilmTvIds.has(selectedFilmTvRef.id) ? "Remove from saved" : "Add to saved"}
                    >
                      <BookmarkIcon filled={savedFilmTvIds.has(selectedFilmTvRef.id)} size="md" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContactOpen(true);
                      }}
                      className="hover:bg-muted min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground"
                      title="Report an issue"
                      aria-label="Report an issue with this reference"
                    >
                      <IconFlag className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedFilmTvRef(null)}
                      className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                    >
                      <IconX className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {/* Poster + title */}
                <div className="flex items-start gap-4">
                  {selectedFilmTvRef.poster_url && !filmTvPosterError ? (
                    <img
                      src={selectedFilmTvRef.poster_url}
                      alt={selectedFilmTvRef.title}
                      className="w-40 rounded-md object-cover shadow-sm shrink-0"
                      onError={() => setFilmTvPosterError(true)}
                    />
                  ) : (
                    <div className="w-40 shrink-0 rounded-md bg-muted flex items-center justify-center aspect-[2/3] text-muted-foreground/40">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h1 className="text-2xl font-bold text-foreground leading-tight">{selectedFilmTvRef.title}</h1>
                      {selectedFilmTvRef.is_best_match && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted/90 text-foreground border border-border">
                          Best Match
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {selectedFilmTvRef.year ?? ""}
                      {selectedFilmTvRef.director ? ` · Directed by ${selectedFilmTvRef.director}` : ""}
                    </p>
                    {selectedFilmTvRef.imdb_rating != null && (
                      <p className="text-sm font-semibold text-amber-500 mt-1">
                        ★ {selectedFilmTvRef.imdb_rating.toFixed(1)} IMDb
                      </p>
                    )}
                  </div>
                </div>

                {/* Type + genre */}
                <div className="flex flex-wrap gap-2">
                  {selectedFilmTvRef.type && (
                    <Badge variant="secondary" className="capitalize">
                      {selectedFilmTvRef.type === "tvSeries" ? "TV Series" : "Movie"}
                    </Badge>
                  )}
                  {selectedFilmTvRef.genre?.map((g) => (
                    <Badge key={g} variant="outline" className="capitalize">{g}</Badge>
                  ))}
                </div>

                {/* Actors */}
                {selectedFilmTvRef.actors && selectedFilmTvRef.actors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Cast</p>
                    <p className="text-sm text-foreground">{selectedFilmTvRef.actors.join(", ")}</p>
                  </div>
                )}

                {/* Full plot */}
                {selectedFilmTvRef.plot && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Plot</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedFilmTvRef.plot}</p>
                  </div>
                )}

                {/* Confidence (informational tag, not a button) */}
                {selectedFilmTvRef.confidence_score != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium tabular-nums w-fit bg-muted/90 text-foreground border border-border">
                    {Math.round(selectedFilmTvRef.confidence_score * 100)}% match
                  </span>
                )}

                {user?.is_moderator && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>ID: {selectedFilmTvRef.id}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilmTvEditScriptValue(
                          selectedFilmTvRef.imsdb_url?.trim() ?? getFilmTvScriptUrl(selectedFilmTvRef)
                        );
                        setFilmTvEditScriptOpen(true);
                      }}
                    >
                      <IconEdit className="h-3.5 w-3.5" />
                      Edit script link
                    </Button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <ScriptSourcePicker ref_item={selectedFilmTvRef} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(`https://www.imdb.com/title/${selectedFilmTvRef.imdb_id}/`, "_blank", "noopener,noreferrer")}
                  >
                    <IconExternalLink className="h-4 w-4" />
                    IMDb page
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Dialog open={filmTvEditScriptOpen} onOpenChange={setFilmTvEditScriptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit script link</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Override the IMSDb script URL for this title (e.g. IMSDb uses &quot;Godfather&quot; but we show &quot;The Godfather&quot;). Leave empty to use the auto-generated URL from the title.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="film-tv-script-url">Script URL</Label>
            <Input
              id="film-tv-script-url"
              value={filmTvEditScriptValue}
              onChange={(e) => setFilmTvEditScriptValue(e.target.value)}
              placeholder="https://imsdb.com/scripts/Godfather.html"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFilmTvEditScriptOpen(false)}
              disabled={filmTvEditScriptSaving}
            >
              Cancel
            </Button>
            <Button
              disabled={filmTvEditScriptSaving}
              onClick={async () => {
                if (!selectedFilmTvRef) return;
                setFilmTvEditScriptSaving(true);
                try {
                  const res = await api.patch<{ imsdb_url: string | null }>(
                    `/api/admin/film-tv/${selectedFilmTvRef.id}`,
                    { imsdb_url: filmTvEditScriptValue.trim() || null }
                  );
                  setSelectedFilmTvRef((prev) =>
                    prev ? { ...prev, imsdb_url: res.data.imsdb_url } : null
                  );
                  setFilmTvEditScriptOpen(false);
                  toast.success("Script link updated");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Update failed");
                } finally {
                  setFilmTvEditScriptSaving(false);
                }
              }}
            >
              {filmTvEditScriptSaving ? (
                <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
