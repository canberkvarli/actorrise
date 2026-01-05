"use client";

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";

export function useBookmarkCount() {
  const [count, setCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCount = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Monologue[]>("/api/monologues/favorites/my");
      setCount(response.data.length);
    } catch (error) {
      console.error("Error fetching bookmark count:", error);
      setCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  const refresh = useCallback(async () => {
    await fetchCount();
  }, [fetchCount]);

  return { count, isLoading, refresh };
}
