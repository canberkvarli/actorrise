'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Theater, Users, Clock, TrendingUp, ChevronRight, Sparkles, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Scene {
  id: number;
  play_id: number;
  play_title: string;
  play_author: string;
  title: string;
  description: string;
  character_1_name: string;
  character_2_name: string;
  character_1_gender: string | null;
  character_2_gender: string | null;
  line_count: number;
  estimated_duration_seconds: number;
  primary_emotions: string[];
  relationship_dynamic: string;
  tone: string;
  setting: string;
  rehearsal_count: number;
  favorite_count: number;
  is_favorited: boolean;
}

export default function ScenesPage() {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState({
    tone: ''
  });

  useEffect(() => {
    fetchScenes();
  }, [filter]);

  const fetchScenes = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();

      // Use trailing slash to avoid 307 redirect
      const url = params.toString() 
        ? `/api/scenes/?${params.toString()}`
        : `/api/scenes/`;
      const response = await api.get<Scene[]>(url);
      console.log('Scenes API response:', response.data);
      // Ensure response.data is an array
      setScenes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching scenes:', error);
      setScenes([]); // Ensure scenes is set to empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };



  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Theater className="w-8 h-8 text-primary" />
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold mb-2">ScenePartner</h1>
              <p className="text-muted-foreground max-w-2xl">
                Practice two-person scenes with your AI scene partner. Available 24/7, always ready to rehearse.
              </p>
            </div>
            <Button
              onClick={() => router.push('/my-scripts')}
              variant="outline"
              size="lg"
              className="gap-2"
            >
              <Upload className="h-5 w-5" />
              Upload Script
            </Button>
          </div>
        </motion.div>
        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="tone" className="mb-2">
                    Tone
                  </Label>
                  <Select
                    id="tone"
                    value={filter.tone}
                    onChange={(e) => setFilter({ ...filter, tone: e.target.value })}
                  >
                    <option value="">All Tones</option>
                    <option value="romantic">Romantic</option>
                    <option value="comedic">Comedic</option>
                    <option value="tragic">Tragic</option>
                    <option value="tense">Tense</option>
                    <option value="dramatic">Dramatic</option>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Scenes Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-6 bg-muted rounded mb-4 w-3/4" />
                  <div className="h-4 bg-muted rounded mb-2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenes.map((scene, index) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    onClick={() => router.push(`/scenes/${scene.id}`)}
                    className="group hover:shadow-xl transition-all cursor-pointer h-full flex flex-col hover:border-primary/50"
                  >
                    <CardHeader>
                      <CardTitle className="group-hover:text-primary transition-colors">
                        {scene.title}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        from <span className="font-semibold">{scene.play_title}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">by {scene.play_author}</p>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col">
                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                        {scene.description}
                      </p>

                      {/* Characters */}
                      <div className="flex items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">
                          {scene.character_1_name} & {scene.character_2_name}
                        </span>
                      </div>

                      {/* Metadata */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(scene.estimated_duration_seconds)}</span>
                          <span className="text-muted-foreground/50">•</span>
                          <span>{scene.line_count} lines</span>
                        </div>

                        {scene.rehearsal_count > 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <TrendingUp className="w-4 h-4 text-primary" />
                            <span>{scene.rehearsal_count} rehearsals</span>
                          </div>
                        )}
                      </div>

                      {/* Emotions */}
                      {scene.primary_emotions && scene.primary_emotions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {scene.primary_emotions.slice(0, 3).map((emotion) => (
                            <Badge
                              key={emotion}
                              variant="secondary"
                              className="text-xs capitalize"
                            >
                              {emotion}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* CTA */}
                      <div className="pt-4 border-t mt-auto">
                        <div className="flex items-center justify-between text-primary font-medium">
                          <span>Start Rehearsal</span>
                          <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}

        {!isLoading && scenes.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Theater className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              No scenes found
            </h3>
            <p className="text-muted-foreground mb-4">
              {filter.tone
                ? "Try adjusting your filters or check back soon for new scenes!"
                : "Scenes are being extracted from plays. Check back soon!"}
            </p>
            {filter.tone && (
              <button
                onClick={() => setFilter({ tone: '' })}
                className="text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
