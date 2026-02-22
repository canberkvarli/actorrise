"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Edit2, Check, X, Trash2, Play, Users, Clock,
  FileText, Sparkles, ChevronRight, Settings
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SceneSettingsModal } from "@/components/scenepartner/SceneSettingsModal";

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
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const params = useParams();
  const scriptId = parseInt(params.id as string);

  const [script, setScript] = useState<UserScript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  /** Which character the user will play per scene (sceneId -> character name) */
  const [selectedCharacter, setSelectedCharacter] = useState<Record<number, string>>({});
  const [startingRehearsalFor, setStartingRehearsalFor] = useState<number | null>(null);
  const [deleteSceneDialogOpen, setDeleteSceneDialogOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<number | null>(null);
  const deleteSceneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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

  const handleStartRehearsal = async (scene: Scene) => {
    const userCharacter = selectedCharacter[scene.id] ?? scene.character_1_name;
    setStartingRehearsalFor(scene.id);
    try {
      const { data } = await api.post<{ id: number }>('/api/scenes/rehearse/start', {
        scene_id: scene.id,
        user_character: userCharacter,
      });
      router.push(`/scenes/${scene.id}/rehearse?session=${data.id}`);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Failed to start rehearsal';
      toast.error(typeof message === 'string' ? message : 'Failed to start rehearsal');
    } finally {
      setStartingRehearsalFor(null);
    }
  };

  const performDeleteScene = async (sceneId: number) => {
    try {
      await api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}`);
      toast.success("Scene deleted");
      fetchScript();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete scene");
    }
  };

  const handleDeleteSceneClick = (sceneId: number) => {
    setSceneToDelete(sceneId);
    setDeleteSceneDialogOpen(true);
  };

  const handleConfirmDeleteScene = () => {
    const sceneId = sceneToDelete;
    if (sceneId == null) return;
    setSceneToDelete(null);

    const UNDO_SECONDS = 5;
    const toastId = toast("Deleting scene in " + UNDO_SECONDS + " seconds…", {
      duration: (UNDO_SECONDS + 2) * 1000,
      action: {
        label: "Undo",
        onClick: () => {
          if (deleteSceneTimeoutRef.current) {
            clearTimeout(deleteSceneTimeoutRef.current);
            deleteSceneTimeoutRef.current = null;
          }
          toast.dismiss(toastId);
          toast.success("Delete cancelled");
        },
      },
    });

    deleteSceneTimeoutRef.current = setTimeout(() => {
      deleteSceneTimeoutRef.current = null;
      toast.dismiss(toastId);
      performDeleteScene(sceneId);
    }, UNDO_SECONDS * 1000);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 max-w-3xl relative min-h-[320px]">
      {/* Skeleton overlay — fades out when data is loaded */}
      <motion.div
        className="absolute inset-0 z-10"
        initial={false}
        animate={{ opacity: isLoading ? 1 : 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{ pointerEvents: isLoading ? "auto" : "none" }}
        aria-hidden={!isLoading}
      >
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="space-y-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </motion.div>

      {/* Not found — fades in when loaded but no script */}
      {!isLoading && !script && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="text-center py-8"
        >
          <h1 className="text-2xl font-bold mb-4 font-serif">Script not found</h1>
          <Button onClick={() => router.push("/my-scripts")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Scripts
          </Button>
        </motion.div>
      )}

      {/* Main content — fades in when script is loaded */}
      {!isLoading && script && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm min-h-[44px] sm:min-h-0" aria-label="Breadcrumb">
        <Link
          href="/my-scripts"
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" />
          My Scripts
        </Link>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground/60" />
        <span className="font-medium text-foreground truncate" aria-current="page">
          {script.title}
        </span>
      </nav>

      {/* Script info card */}
      <Card className="mb-6 border-border/80 shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editingField === "title" ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 h-10 text-lg"
                    autoFocus
                  />
                  <Button size="sm" className="h-9" onClick={() => saveField("title")}><Check className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-9" onClick={cancelEditing}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <div
                  className="group flex items-center gap-2 cursor-pointer"
                  onClick={() => startEditing("title", script.title)}
                >
                  <h1 className="text-xl font-semibold text-foreground truncate font-serif">{script.title}</h1>
                  <Edit2 className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 shrink-0" />
                  {script.num_characters} characters
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 shrink-0" />
                  {script.num_scenes_extracted} scenes
                </span>
                {script.estimated_length_minutes != null && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 shrink-0" />
                    ~{script.estimated_length_minutes} min
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/80 text-sm">
            {editingField === "author" ? (
              <div className="flex items-center gap-2">
                <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-9 w-44 text-sm" autoFocus />
                <Button size="sm" className="h-8" onClick={() => saveField("author")}><Check className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={cancelEditing}><X className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <button type="button" className="group flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => startEditing("author", script.author)}>
                <span className="font-medium text-foreground/80">Author</span>
                <span>{script.author}</span>
                <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            {editingField === "genre" ? (
              <div className="flex items-center gap-2">
                <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Genre" className="h-9 w-32 text-sm" autoFocus />
                <Button size="sm" className="h-8" onClick={() => saveField("genre")}><Check className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={cancelEditing}><X className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <button type="button" className="group flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => startEditing("genre", script.genre || "")}>
                <span className="font-medium text-foreground/80">Genre</span>
                <span>{script.genre || "—"}</span>
                <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
          {script.description != null && script.description !== "" ? (
            editingField === "description" ? (
              <div className="space-y-2 pt-2 border-t border-border/80">
                <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Description..." rows={3} autoFocus className="text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveField("description")}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditing}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button type="button" className="block w-full text-left pt-2 border-t border-border/80 group" onClick={() => startEditing("description", script.description || "")}>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</span>
                <p className="text-sm text-foreground/90 mt-1 line-clamp-2 leading-relaxed">{script.description}</p>
                <Edit2 className="w-3.5 h-3.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground inline-block" />
              </button>
            )
          ) : editingField === "description" ? (
            <div className="space-y-2 pt-2 border-t border-border/80">
              <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Add a description..." rows={3} autoFocus className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveField("description")}>Save</Button>
                <Button size="sm" variant="ghost" onClick={cancelEditing}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button type="button" className="pt-2 border-t border-border/80 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2" onClick={() => startEditing("description", "")}>
              <Edit2 className="w-3.5 h-3.5" />
              Add summary
            </button>
          )}
        </CardContent>
      </Card>

      {/* Characters card */}
      {script.characters && script.characters.length > 0 && (
        <Card className="mb-6 border-border/80 shadow-sm">
          <CardContent className="py-3 px-5 sm:px-6">
            <span className="text-sm font-medium text-foreground/90">Characters</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {script.characters.map((character, idx) => (
                <Badge key={idx} variant="secondary" className="font-normal text-sm py-1">
                  {character.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenes section */}
      <section aria-label="Scenes in this script" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 font-serif">
            <Sparkles className="w-5 h-5 text-primary" />
            Scenes ({script.scenes.length})
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 text-sm font-normal"
            onClick={() => setShowSettingsModal(true)}
            aria-label="Scene settings"
          >
            <Settings className="w-4 h-4" />
            Scene settings
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick a scene, choose your character, and tap Rehearse. Use Edit to fix titles or lines.
        </p>

        {script.scenes.length === 0 ? (
          <>
            <Alert variant="destructive" className="border-destructive bg-destructive/10">
              <AlertTitle className="text-base font-serif">No two-person scenes found</AlertTitle>
              <AlertDescription>
                We couldn&apos;t find any dialogue in the format <strong>CHARACTER: line</strong>. Paste script text with at least two characters and dialogue (e.g. JORDAN: Hello. SAM: Hi.). If this was a mistake, delete this script from My Scripts and try again.
              </AlertDescription>
            </Alert>
            <Card className="border-dashed border-border/80">
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-foreground mb-1 font-serif">No scenes extracted</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Use Edit on another script or try pasting again with the correct format.
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <ul className="space-y-3 list-none p-0 m-0">
            {script.scenes.map((scene) => (
              <motion.li key={scene.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <Card className="overflow-hidden border-border/80 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-foreground truncate font-serif">{scene.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {scene.character_1_name} & {scene.character_2_name}
                          <span className="mx-2">·</span>
                          {scene.line_count} lines
                          <span className="mx-2">·</span>
                          {formatDuration(scene.estimated_duration_seconds)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                        <label className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-foreground/90 whitespace-nowrap">I play</span>
                          <select
                            className="rounded-lg border border-input bg-background px-3 py-2 text-sm h-9 min-w-[110px] text-foreground"
                            value={selectedCharacter[scene.id] ?? scene.character_1_name}
                            onChange={(e) => setSelectedCharacter((prev) => ({ ...prev, [scene.id]: e.target.value }))}
                          >
                            <option value={scene.character_1_name}>{scene.character_1_name}</option>
                            <option value={scene.character_2_name}>{scene.character_2_name}</option>
                          </select>
                        </label>
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-2 h-9 px-4"
                          onClick={() => handleStartRehearsal(scene)}
                          disabled={startingRehearsalFor === scene.id}
                        >
                          {startingRehearsalFor === scene.id ? (
                            <span className="animate-pulse">Starting…</span>
                          ) : (
                            <>
                              <Play className="w-4 h-4" />
                              Rehearse
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 p-0"
                          onClick={() => router.push(`/my-scripts/${scriptId}/scenes/${scene.id}/edit`)}
                          aria-label="Edit scene"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteSceneClick(scene.id)}
                          aria-label="Delete scene"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDeleteDialog
        open={deleteSceneDialogOpen}
        onOpenChange={(open) => {
          setDeleteSceneDialogOpen(open);
          if (!open) setSceneToDelete(null);
        }}
        title="Delete this scene?"
        description="This will permanently remove the scene. You can undo in the next few seconds after confirming."
        confirmLabel="Delete scene"
        onConfirm={handleConfirmDeleteScene}
      />

      <SceneSettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
    </motion.div>
      )}
    </div>
  );
}
