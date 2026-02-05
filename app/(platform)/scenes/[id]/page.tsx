'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Play,
  Users,
  Clock,
  MapPin,
  Heart,
  BookOpen,
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface SceneLine {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
  word_count: number;
  primary_emotion: string | null;
}

interface Scene {
  id: number;
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
  context_before: string;
  context_after: string;
  rehearsal_count: number;
  is_favorited: boolean;
  lines: SceneLine[];
}

export default function SceneDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sceneId = params.id as string;

  const [scene, setScene] = useState<Scene | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [showCharacterModal, setShowCharacterModal] = useState(false);

  useEffect(() => {
    fetchScene();
  }, [sceneId]);

  const fetchScene = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Scene>(`/api/scenes/${sceneId}`);
      setScene(response.data);
    } catch (error) {
      console.error('Error fetching scene:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRehearsal = async () => {
    if (!selectedCharacter || !scene) return;

    try {
      const response = await api.post<{ id: string }>('/api/scenes/rehearse/start', {
        scene_id: scene.id,
        user_character: selectedCharacter
      });

      // Navigate to rehearsal page
      router.push(`/scenes/${scene.id}/rehearse?session=${response.data.id}`);
    } catch (error) {
      console.error('Error starting rehearsal:', error);
    }
  };

  const toggleFavorite = async () => {
    if (!scene) return;

    try {
      await api.post(`/api/scenes/${scene.id}/favorite`);
      setScene({ ...scene, is_favorited: !scene.is_favorited });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-8 w-32 mb-8" />
        <Card>
          <CardContent className="pt-6 space-y-6">
            <Skeleton className="h-10 w-3/4" />
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

  if (!scene) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Scene not found</h3>
            <Button onClick={() => router.push('/scenes')} className="mt-4">
              Back to Scenes
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
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4 hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Main Card */}
        <Card>
          <CardContent className="pt-8 space-y-6">
            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold mb-2">{scene.title}</h1>
                  <p className="text-lg text-muted-foreground">
                    From <span className="font-semibold">{scene.play_title}</span> by {scene.play_author}
                  </p>
                </div>
                <Button
                  variant={scene.is_favorited ? "default" : "outline"}
                  size="icon"
                  onClick={toggleFavorite}
                  className={`ml-4 ${scene.is_favorited ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'hover:text-accent'}`}
                  title={scene.is_favorited ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart className={`h-5 w-5 ${scene.is_favorited ? 'fill-current' : ''}`} />
                </Button>
              </div>

              {/* Description */}
              {scene.description && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-muted/50 p-4 rounded-lg border border-border"
                >
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                    {scene.description}
                  </p>
                </motion.div>
              )}
            </div>

            <Separator />

            {/* Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Details
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Characters:</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="font-normal">
                      {scene.character_1_name}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {scene.character_2_name}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tone:</p>
                  <Badge variant="outline" className="font-normal capitalize">
                    {scene.tone}
                  </Badge>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Duration:</p>
                  <Badge variant="outline" className="font-normal">
                    {formatDuration(scene.estimated_duration_seconds)}
                  </Badge>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Lines:</p>
                  <Badge variant="outline" className="font-normal">
                    {scene.line_count} total
                  </Badge>
                </div>

                {scene.setting && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Setting:</p>
                    <Badge variant="outline" className="font-normal">
                      {scene.setting}
                    </Badge>
                  </div>
                )}

                {scene.relationship_dynamic && (
                  <div className="col-span-2 md:col-span-3">
                    <p className="text-xs text-muted-foreground mb-1">Relationship Dynamic:</p>
                    <Badge variant="outline" className="font-normal capitalize">
                      {scene.relationship_dynamic}
                    </Badge>
                  </div>
                )}

                {scene.primary_emotions && scene.primary_emotions.length > 0 && (
                  <div className="col-span-2 md:col-span-3">
                    <p className="text-xs text-muted-foreground mb-2">Primary Emotions:</p>
                    <div className="flex flex-wrap gap-2">
                      {scene.primary_emotions.map((emotion) => (
                        <Badge key={emotion} variant="secondary" className="font-normal capitalize">
                          {emotion}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Context */}
            {(scene.context_before || scene.context_after) && (
              <>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Context
                  </h3>
                  {scene.context_before && (
                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Before This Scene
                      </p>
                      <p className="text-sm text-muted-foreground">{scene.context_before}</p>
                    </div>
                  )}
                  {scene.context_after && (
                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        After This Scene
                      </p>
                      <p className="text-sm text-muted-foreground">{scene.context_after}</p>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Script */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  The Script
                </h3>
                <Button
                  onClick={() => setShowCharacterModal(true)}
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Rehearsal
                </Button>
              </div>
              <div className="bg-muted/30 p-6 rounded-lg border border-border space-y-4">
                {scene.lines.map((line) => (
                  <div key={line.id} className="border-l-4 border-primary/30 pl-4 py-2">
                    <div className="font-semibold text-foreground mb-1">
                      {line.character_name}
                      {line.stage_direction && (
                        <span className="ml-2 text-muted-foreground italic font-normal text-xs">
                          [{line.stage_direction}]
                        </span>
                      )}
                    </div>
                    <div className="text-sm leading-relaxed">{line.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Stats */}
            {scene.rehearsal_count > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>{scene.rehearsal_count} actors have rehearsed this scene</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Character Selection Modal */}
      {showCharacterModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-background rounded-lg shadow-lg max-w-md w-full p-6 border border-border"
          >
            <h3 className="text-xl font-bold mb-2">Choose Your Character</h3>
            <p className="text-muted-foreground mb-6">
              Select which character you'd like to play in this scene.
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => setSelectedCharacter(scene.character_1_name)}
                className={`w-full p-4 rounded-lg border-2 transition text-left ${
                  selectedCharacter === scene.character_1_name
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-semibold">{scene.character_1_name}</div>
                {scene.character_1_gender && (
                  <div className="text-sm text-muted-foreground capitalize">{scene.character_1_gender}</div>
                )}
              </button>

              <button
                onClick={() => setSelectedCharacter(scene.character_2_name)}
                className={`w-full p-4 rounded-lg border-2 transition text-left ${
                  selectedCharacter === scene.character_2_name
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-semibold">{scene.character_2_name}</div>
                {scene.character_2_gender && (
                  <div className="text-sm text-muted-foreground capitalize">{scene.character_2_gender}</div>
                )}
              </button>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCharacterModal(false);
                  setSelectedCharacter('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleStartRehearsal}
                disabled={!selectedCharacter}
                className="flex-1"
              >
                Start Rehearsal
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
