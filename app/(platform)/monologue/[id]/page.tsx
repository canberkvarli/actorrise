"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconBookmark, IconArrowLeft } from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import api from "@/lib/api";
import { motion } from "framer-motion";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";

export default function MonologueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchMonologue(params.id as string);
    }
  }, [params.id]);

  const fetchMonologue = async (id: string) => {
    try {
      const response = await api.get<Monologue>(`/api/monologues/${id}`);
      setMonologue(response.data);
      setIsFavorited(response.data.is_favorited);
    } catch (error) {
      console.error("Error fetching monologue:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!monologue) return;

    try {
      if (isFavorited) {
        await api.delete(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(false);
      } else {
        await api.post(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(true);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-8 w-32 mb-8" />
        <Card className="rounded-lg">
          <CardContent className="pt-6 space-y-6">
            <Skeleton className="h-10 w-3/4 rounded-lg" />
            <Skeleton className="h-6 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!monologue) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="rounded-lg">
          <CardContent className="pt-12 pb-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Monologue not found</h3>
            <Button onClick={() => router.push("/search")} className="mt-4">
              Back to Search
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4 hover:text-primary"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <Card className="rounded-lg">
          <CardContent className="pt-8">
            <MonologueDetailContent
              monologue={monologue}
              headerActions={
                <Button
                  variant={isFavorited ? "default" : "outline"}
                  size="icon"
                  onClick={toggleFavorite}
                  className={`flex-shrink-0 ${isFavorited ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:text-accent"}`}
                >
                  <IconBookmark className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
                </Button>
              }
            />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
