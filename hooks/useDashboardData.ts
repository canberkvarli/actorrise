"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import type { FilmTvReference } from "@/types/filmTv";

interface ProfileStats {
  completion_percentage: number;
  has_headshot: boolean;
  preferred_genres_count: number;
  profile_bias_enabled: boolean;
}

interface ActorProfile {
  name?: string | null;
  headshot_url?: string | null;
}

const DASHBOARD_REQUEST_TIMEOUT_MS = 12_000; // avoid stuck loading after sign-in if API is slow

// ---------------------------------------------------------------------------
// Demo account mock data – returned instantly so the dashboard never waits
// ---------------------------------------------------------------------------
const DEMO_STATS: ProfileStats = {
  completion_percentage: 40,
  has_headshot: false,
  preferred_genres_count: 2,
  profile_bias_enabled: false,
};

const DEMO_PROFILE: ActorProfile = {
  name: "Dev User",
  headshot_url: "/transparent_icon_logo.png",
};

const DEMO_MONOLOGUES: Monologue[] = [
  {
    id: -1,
    title: "Hamlet - To be or not to be",
    character_name: "Hamlet",
    text: "To be, or not to be, that is the question: Whether ‘tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles, and by opposing end them...",
    play_title: "Hamlet",
    play_id: 0,
    author: "William Shakespeare",
    category: "classical",
    character_gender: "Male",
    character_age_range: "20s-30s",
    primary_emotion: "Contemplative",
    word_count: 276,
    estimated_duration_seconds: 120,
    view_count: 0,
    favorite_count: 0,
    is_favorited: false,
    overdone_score: 0,
  },
  {
    id: -2,
    title: "A Streetcar Named Desire - Blanche",
    character_name: "Blanche DuBois",
    text: "I don’t want realism. I want magic! Yes, yes, magic! I try to give that to people. I misrepresent things to them. I don’t tell the truth, I tell what ought to be truth. And if that is sinful, then let me be damned for it!",
    play_title: "A Streetcar Named Desire",
    play_id: 0,
    author: "Tennessee Williams",
    category: "dramatic",
    character_gender: "Female",
    character_age_range: "30s",
    primary_emotion: "Desperate",
    word_count: 210,
    estimated_duration_seconds: 90,
    view_count: 0,
    favorite_count: 0,
    is_favorited: false,
    overdone_score: 0,
  },
  {
    id: -3,
    title: "Death of a Salesman - Biff",
    character_name: "Biff Loman",
    text: "I stopped in the middle of that building and I saw — the sky. I saw the things that I love in this world. The work and the food and the time to sit and smoke. And I looked at the pen and I thought, what the hell am I grabbing this for?",
    play_title: "Death of a Salesman",
    play_id: 0,
    author: "Arthur Miller",
    category: "dramatic",
    character_gender: "Male",
    character_age_range: "30s",
    primary_emotion: "Revelatory",
    word_count: 185,
    estimated_duration_seconds: 80,
    view_count: 0,
    favorite_count: 0,
    is_favorited: false,
    overdone_score: 0,
  },
  {
    id: -4,
    title: "The Glass Menagerie - Tom",
    character_name: "Tom Wingfield",
    text: "I didn’t go to the moon, I went much further — for time is the longest distance between two places. I left Saint Louis. I descended the steps of this fire escape for a last time and followed, from then on, in my father’s footsteps...",
    play_title: "The Glass Menagerie",
    play_id: 0,
    author: "Tennessee Williams",
    category: "dramatic",
    character_gender: "Male",
    character_age_range: "20s",
    primary_emotion: "Melancholic",
    word_count: 195,
    estimated_duration_seconds: 85,
    view_count: 0,
    favorite_count: 0,
    is_favorited: false,
    overdone_score: 0,
  },
];

const DEMO_FILM_TV: FilmTvReference[] = [
  {
    id: -1,
    title: "Good Will Hunting",
    year: 1997,
    type: "movie",
    genre: ["Drama"],
    plot_snippet: "Will Hunting, a janitor at M.I.T., has a gift for mathematics, but needs help from a psychologist to find direction in his life.",
    plot: null,
    director: "Gus Van Sant",
    actors: ["Robin Williams", "Matt Damon", "Ben Affleck"],
    imdb_rating: 8.3,
    poster_url: null,
    imdb_id: "tt0119217",
    imsdb_url: null,
    confidence_score: null,
    is_best_match: false,
  },
  {
    id: -2,
    title: "Dead Poets Society",
    year: 1989,
    type: "movie",
    genre: ["Drama", "Comedy"],
    plot_snippet: "Maverick teacher John Keating uses poetry to embolden his boarding school students to new heights of self-expression.",
    plot: null,
    director: "Peter Weir",
    actors: ["Robin Williams", "Robert Sean Leonard", "Ethan Hawke"],
    imdb_rating: 8.1,
    poster_url: null,
    imdb_id: "tt0097165",
    imsdb_url: null,
    confidence_score: null,
    is_best_match: false,
  },
  {
    id: -3,
    title: "The Shawshank Redemption",
    year: 1994,
    type: "movie",
    genre: ["Drama"],
    plot_snippet: "Over the course of several years, two convicts form a friendship, seeking consolation and eventual redemption through acts of common decency.",
    plot: null,
    director: "Frank Darabont",
    actors: ["Tim Robbins", "Morgan Freeman"],
    imdb_rating: 9.3,
    poster_url: null,
    imdb_id: "tt0111161",
    imsdb_url: null,
    confidence_score: null,
    is_best_match: false,
  },
  {
    id: -4,
    title: "A Few Good Men",
    year: 1992,
    type: "movie",
    genre: ["Drama", "Thriller"],
    plot_snippet: "Military lawyer Lieutenant Daniel Kaffee defends Marines accused of murder and tangles with a powerful Colonel who ordered a disciplinary action that went too far.",
    plot: null,
    director: "Rob Reiner",
    actors: ["Tom Cruise", "Jack Nicholson", "Demi Moore"],
    imdb_rating: 7.7,
    poster_url: null,
    imdb_id: "tt0104257",
    imsdb_url: null,
    confidence_score: null,
    is_best_match: false,
  },
];

// Full profile response for the profile edit form (cached so revisits are instant)
export interface FullProfileResponse {
  name?: string | null;
  age_range?: string | null;
  gender?: string | null;
  ethnicity?: string | null;
  height?: string | null;
  build?: string | null;
  location?: string | null;
  experience_level?: string | null;
  type?: string | string[] | null;
  training_background?: string | null;
  union_status?: string | null;
  preferred_genres?: string[] | null;
  overdone_alert_sensitivity?: number | null;
  profile_bias_enabled?: boolean | null;
  headshot_url?: string | null;
}

export function useProfileFormData() {
  return useQuery<FullProfileResponse>({
    queryKey: ["profile-form"],
    queryFn: async () => {
      const response = await api.get<FullProfileResponse>("/api/profile", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes — show cached data instantly on revisit
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// Hook for profile stats
export function useProfileStats(isDemoUser: boolean = false) {
  return useQuery<ProfileStats>({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const response = await api.get<ProfileStats>("/api/profile/stats", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    enabled: !isDemoUser,
    ...(isDemoUser && { initialData: DEMO_STATS }),
    staleTime: 30 * 1000, // 30 seconds — profile saves invalidate this, keep it fresh
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

// Hook for profile data (backend returns 200 with empty profile when none exists)
export function useProfile(isDemoUser: boolean = false) {
  return useQuery<ActorProfile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const response = await api.get<ActorProfile & { id?: number }>("/api/profile", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      const data = response.data;
      // Backend returns id=0 when no profile row exists; treat as null for display
      if (data && (data as { id?: number }).id === 0) {
        return null;
      }
      return data as ActorProfile;
    },
    enabled: !isDemoUser,
    ...(isDemoUser && { initialData: DEMO_PROFILE }),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

// Hook for discover monologues (no profile required – used when profile incomplete)
export function useDiscover(enabled: boolean = true, isDemoUser: boolean = false) {
  return useQuery<Monologue[]>({
    queryKey: ["discover"],
    queryFn: async () => {
      const response = await api.get<Monologue[]>("/api/monologues/discover?limit=6", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    enabled: enabled && !isDemoUser,
    ...(isDemoUser && { initialData: DEMO_MONOLOGUES }),
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}

// Hook for recommendations (fast=true uses SQL-only for quicker dashboard load; requires profile)
export function useRecommendations(enabled: boolean = true, fast: boolean = true, isDemoUser: boolean = false) {
  return useQuery<Monologue[]>({
    queryKey: ["recommendations", fast],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "4" });
      if (fast) params.set("fast", "true");
      const response = await api.get<Monologue[]>(`/api/monologues/recommendations?${params}`, { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    enabled: enabled && !isDemoUser,
    ...(isDemoUser && { initialData: DEMO_MONOLOGUES }),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 1,
  });
}

// Hook for discover Film & TV. When personalized=true, results are matched to actor’s preferred genres.
export function useDiscoverFilmTv(enabled: boolean = true, personalized: boolean = false, isDemoUser: boolean = false) {
  return useQuery<FilmTvReference[]>({
    queryKey: ["discover-film-tv", personalized],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "6" });
      if (personalized) params.set("personalized", "true");
      const response = await api.get<{ results: FilmTvReference[]; total: number }>(
        `/api/film-tv/search?${params}`,
        { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS }
      );
      return response.data.results;
    },
    enabled: enabled && !isDemoUser,
    ...(isDemoUser && { initialData: DEMO_FILM_TV }),
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}

// Hook for updating profile (with cache invalidation)
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData: any) => {
      const response = await api.post("/api/profile", profileData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate profile-related queries
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
