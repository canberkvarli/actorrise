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
import { MicAccessWarning } from "@/components/scenepartner/MicAccessWarning";
import { GenreSelect } from "@/components/ui/genre-select";
import { ScenePreviewTooltip } from "@/components/scenepartner/ScenePreviewTooltip";
import { cn } from "@/lib/utils";

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
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 max-w-6xl relative min-h-[320px]">
      {/* Skeleton overlay: fades out when data is loaded */}
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

      {/* Not found: fades in when loaded but no script */}
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

      {/* Main content: fades in when script is loaded */}
      {!isLoading && script && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <MicAccessWarning />
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

      {/* Two-column layout: script info (left) + scenes (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      {/* LEFT COLUMN: Script Info */}
      <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
      {/* Script info card */}
      <Card className="border-border/80 shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 relative">
              <AnimatePresence mode="wait">
                {editingField === "title" ? (
                  <motion.div
                    key="editing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative"
                  >
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 h-10 text-lg pr-20"
                      maxLength={100}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveField("title");
                        if (e.key === "Escape") cancelEditing();
                      }}
                    />
                    {/* Overlay buttons - positioned absolutely to avoid layout shift */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <Button
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => saveField("title")}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={cancelEditing}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="viewing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="group flex items-center gap-2 cursor-pointer border border-transparent rounded-md px-2.5 py-1.5 -mx-2.5 hover:border-border/50 transition-colors"
                    onClick={() => startEditing("title", script.title)}
                  >
                    <h1 className="text-xl font-semibold text-foreground truncate font-serif">
                      {script.title}
                    </h1>
                    <Edit2 className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
                  </motion.div>
                )}
              </AnimatePresence>
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
            <AnimatePresence mode="wait">
              {editingField === "author" ? (
                <motion.div
                  key="editing"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1.5 bg-muted/80 rounded-md px-2 py-1"
                >
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-7 w-32 text-sm"
                    maxLength={60}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveField("author");
                      if (e.key === "Escape") cancelEditing();
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => saveField("author")}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={cancelEditing}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </motion.div>
              ) : (
                <motion.button
                  key="viewing"
                  type="button"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="group inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => startEditing("author", script.author)}
                >
                  <span className="font-medium text-foreground/80">Author</span>
                  <span>{script.author}</span>
                  <Edit2 className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </motion.button>
              )}
            </AnimatePresence>
            <AnimatePresence mode="wait">
              {editingField === "genre" ? (
                <motion.div
                  key="editing"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1.5 bg-muted/80 rounded-md px-2 py-1"
                >
                  <GenreSelect
                    value={editValue}
                    onValueChange={setEditValue}
                    placeholder="Select genre"
                    className="h-7 w-40 text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => saveField("genre")}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={cancelEditing}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </motion.div>
              ) : (
                <motion.button
                  key="viewing"
                  type="button"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="group inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => startEditing("genre", script.genre || "")}
                >
                  <span className="font-medium text-foreground/80">Genre</span>
                  <span>{script.genre || "-"}</span>
                  <Edit2 className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            {script.description != null && script.description !== "" ? (
              editingField === "description" ? (
                <motion.div
                  key="editing-with-content"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-2 pt-2 border-t border-border/80"
                >
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Description..."
                    rows={3}
                    maxLength={500}
                    autoFocus
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveField("description")}>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="w-3.5 h-3.5 mr-1.5" />
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="viewing-with-content"
                  type="button"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="block w-full text-left pt-2 border-t border-border/80 group"
                  onClick={() => startEditing("description", script.description || "")}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Summary
                    </span>
                    <Edit2 className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                  <p className="text-sm text-foreground/90 mt-1 line-clamp-2 leading-relaxed">
                    {script.description}
                  </p>
                </motion.button>
              )
            ) : editingField === "description" ? (
              <motion.div
                key="editing-no-content"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-2 pt-2 border-t border-border/80"
              >
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  maxLength={500}
                  autoFocus
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveField("description")}>
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditing}>
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="viewing-no-content"
                type="button"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="pt-2 border-t border-border/80 text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors"
                onClick={() => startEditing("description", "")}
              >
                <Edit2 className="w-3.5 h-3.5" />
                Add summary
              </motion.button>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      </aside>

      {/* RIGHT COLUMN: Scenes */}
      <main>
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
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {script.scenes.map((scene) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ y: -2, transition: { duration: 0.15 } }}
                  whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.2 }}
                  layout
                  className="h-full"
                >
                  <Card
                    className={cn(
                      "overflow-hidden border-2 cursor-pointer transition-all h-full",
                      "hover:shadow-lg hover:border-primary/50"
                    )}
                    onClick={() => router.push(`/my-scripts/${scriptId}/scenes/${scene.id}/edit`)}
                  >
                    <CardContent className="p-5 space-y-4">
                      {/* Scene title */}
                      <div>
                        <h3 className="text-lg font-semibold font-serif line-clamp-2 mb-2">
                          {scene.title}
                        </h3>

                        {/* Character badges */}
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {scene.character_1_name}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {scene.character_2_name}
                          </Badge>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <ScenePreviewTooltip sceneId={scene.id}>
                          <span className="flex items-center gap-1 cursor-default hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>
                            <FileText className="w-3.5 h-3.5" />
                            {scene.line_count} lines
                          </span>
                        </ScenePreviewTooltip>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(scene.estimated_duration_seconds)}
                        </span>
                      </div>

                      {/* Action hint */}
                      <div className="flex items-center gap-1.5 text-xs text-primary font-medium pt-2 border-t border-border/50">
                        <span>Open scene</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
      </main>

      </div>{/* End two-column grid */}

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
