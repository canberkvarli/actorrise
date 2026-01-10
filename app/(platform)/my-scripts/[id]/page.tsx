"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Edit2, Check, X, Trash2, Play, Users, Clock,
  FileText, Sparkles, Save
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";

interface Scene {
  id: number;
  title: string;
  character_1_name: string;
  character_2_name: string;
  line_count: number;
  estimated_duration_seconds: number;
}

interface UserScript {
  id: number;
  title: string;
  author: string;
  description?: string;
  original_filename: string;
  file_type: string;
  processing_status: string;
  genre?: string;
  estimated_length_minutes?: number;
  num_characters: number;
  num_scenes_extracted: number;
  characters: Array<{
    name: string;
    gender?: string;
    age_range?: string;
    description?: string;
  }>;
  created_at: string;
  scenes: Scene[];
}

export default function ScriptDetailPage() {
  const router = useRouter();
  const params = useParams();
  const scriptId = parseInt(params.id as string);

  const [script, setScript] = useState<UserScript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetchScript();
  }, [scriptId]);

  const fetchScript = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<UserScript>(`/api/scripts/${scriptId}`);
      setScript(response.data);
    } catch (error) {
      console.error("Error fetching script:", error);
      toast.error("Failed to load script");
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = async (field: string) => {
    if (!script) return;

    try {
      const update: any = {};
      update[field] = editValue;

      await api.patch(`/api/scripts/${scriptId}`, update);
      toast.success("Updated successfully");

      // Update local state
      setScript({ ...script, [field]: editValue });
      setEditingField(null);
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update");
    }
  };

  const handleDeleteScene = async (sceneId: number) => {
    if (!confirm("Delete this scene? This cannot be undone.")) {
      return;
    }

    try {
      await api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}`);
      toast.success("Scene deleted");
      fetchScript(); // Refresh
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete scene");
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="space-y-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl text-center">
        <h1 className="text-2xl font-bold mb-4">Script not found</h1>
        <Button onClick={() => router.push("/my-scripts")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Scripts
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => router.push("/my-scripts")}
        className="mb-6 gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Scripts
      </Button>

      {/* Script Header */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Title
            </label>
            {editingField === "title" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={() => saveField("title")}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEditing}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 group cursor-pointer"
                onClick={() => startEditing("title", script.title)}
              >
                <h1 className="text-3xl font-bold">{script.title}</h1>
                <Edit2 className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Author */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Author
            </label>
            {editingField === "author" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
                <Button size="sm" onClick={() => saveField("author")}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEditing}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 group cursor-pointer"
                onClick={() => startEditing("author", script.author)}
              >
                <p className="text-lg">{script.author}</p>
                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Genre */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Genre
            </label>
            {editingField === "genre" ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="e.g., Drama, Comedy"
                  autoFocus
                />
                <Button size="sm" onClick={() => saveField("genre")}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEditing}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 group cursor-pointer"
                onClick={() => startEditing("genre", script.genre || "")}
              >
                <p>{script.genre || "Not specified"}</p>
                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Description
            </label>
            {editingField === "description" ? (
              <div className="space-y-2">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => saveField("description")}>
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditing}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-start gap-2 group cursor-pointer"
                onClick={() => startEditing("description", script.description || "")}
              >
                <p className="text-muted-foreground">
                  {script.description || "Click to add a description..."}
                </p>
                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground flex-shrink-0 mt-1" />
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 flex-wrap pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>
                <span className="font-semibold">{script.num_characters}</span> characters
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span>
                <span className="font-semibold">{script.num_scenes_extracted}</span> scenes
              </span>
            </div>
            {script.estimated_length_minutes && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>~{script.estimated_length_minutes} min</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Characters Section */}
      {script.characters && script.characters.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Characters ({script.characters.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {script.characters.map((character, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <h3 className="font-semibold">{character.name}</h3>
                  <div className="text-sm text-muted-foreground space-y-1 mt-1">
                    {character.gender && <p>Gender: {character.gender}</p>}
                    {character.age_range && <p>Age: {character.age_range}</p>}
                    {character.description && (
                      <p className="text-xs mt-2">{character.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenes Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Extracted Scenes ({script.scenes.length})
          </h2>
        </div>

        {script.scenes.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No scenes extracted</h3>
              <p className="text-sm text-muted-foreground">
                AI couldn't find any two-person scenes in this script.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {script.scenes.map((scene) => (
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <h3 className="text-lg font-semibold">{scene.title}</h3>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span>
                              {scene.character_1_name} & {scene.character_2_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            <span>{scene.line_count} lines</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>{formatDuration(scene.estimated_duration_seconds)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => router.push(`/scenes/${scene.id}/rehearse`)}
                          className="gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Rehearse
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteScene(scene.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
