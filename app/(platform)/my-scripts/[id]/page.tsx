"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Edit2, Check, X, Trash2, ChevronRight, ChevronDown, Flag, Settings
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { GenreSelect } from "@/components/ui/genre-select";
import { ScenePreviewTooltip } from "@/components/scenepartner/ScenePreviewTooltip";
import { SceneSettingsModal } from "@/components/scenepartner/SceneSettingsModal";

interface Scene {
  id: number;
  title: string;
  description?: string | null;
  character_1_name: string;
  character_2_name: string;
  line_count: number;
  estimated_duration_seconds: number;
  act?: string | null;
  scene_number?: string | null;
}

interface ActGroup {
  act: string | null;
  scenes: Scene[];
}

function groupScenesByAct(scenes: Scene[]): ActGroup[] {
  const hasActs = scenes.some(s => s.act);
  if (!hasActs) {
    return [{ act: null, scenes }];
  }

  // Group all scenes with the same act together (not just consecutive)
  const actMap = new Map<string, Scene[]>();

  for (const scene of scenes) {
    const key = scene.act ?? "__none__";
    if (!actMap.has(key)) {
      actMap.set(key, []);
    }
    actMap.get(key)!.push(scene);
  }

  // Sort acts in play order: Prologue first, then Act 1-N, then Epilogue, then unknown
  const actKeys = Array.from(actMap.keys());
  actKeys.sort((a, b) => {
    const rank = (key: string): number => {
      const lower = key.toLowerCase();
      if (lower === "__none__") return 9999;
      if (lower.includes("prologue")) return -1;
      if (lower.includes("epilogue")) return 1000;
      // Extract act number: "Act 2" → 2, "Act III" → roman numeral
      const numMatch = lower.match(/act\s+(\d+)/);
      if (numMatch) return parseInt(numMatch[1]);
      const romanMatch = lower.match(/act\s+([ivxlc]+)/i);
      if (romanMatch) {
        const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
        return roman[romanMatch[1].toLowerCase()] ?? 500;
      }
      return 500; // unknown acts in the middle
    };
    return rank(a) - rank(b);
  });

  return actKeys.map(key => ({
    act: key === "__none__" ? null : key,
    scenes: actMap.get(key)!,
  }));
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

  const { data: script, isLoading, mutate: mutateScript } = useSWR<UserScript>(
    scriptId ? `/api/scripts/${scriptId}` : null,
    () => api.get<UserScript>(`/api/scripts/${scriptId}`).then((r) => r.data),
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  /** Which character the user will play per scene (sceneId -> character name) */
  const [selectedCharacter, setSelectedCharacter] = useState<Record<number, string>>({});
  const [startingRehearsalFor, setStartingRehearsalFor] = useState<number | null>(null);
  const [deleteSceneDialogOpen, setDeleteSceneDialogOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<number | null>(null);
  const [expandedActs, setExpandedActs] = useState<Record<string, boolean | undefined>>({});
  const [reportingSceneId, setReportingSceneId] = useState<number | null>(null);
  const [reportCategory, setReportCategory] = useState("missing_lines");
  const [reportComment, setReportComment] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [castPopoverOpen, setCastPopoverOpen] = useState(false);
  const castHoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteSceneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmitReport = async (sceneId: number) => {
    setReportSubmitting(true);
    try {
      await api.post("/api/feedback", {
        context: "scene_extraction",
        rating: "negative",
        scene_id: sceneId,
        script_id: Number(scriptId),
        category: reportCategory,
        comment: reportComment || null,
      });
      toast.success("Report sent, thanks for the feedback!");
      setReportingSceneId(null);
      setReportComment("");
      setReportCategory("missing_lines");
    } catch {
      toast.error("Failed to send report. Try again.");
    } finally {
      setReportSubmitting(false);
    }
  };
  const synopsisRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = (field: string) => {
    if (!script) return;
    const value = editValue;

    // Update UI immediately
    mutateScript((prev) => prev ? { ...prev, [field]: value } : prev, false);
    setEditingField(null);

    // Fire API call in background
    const update: any = {};
    update[field] = value;
    api.patch(`/api/scripts/${scriptId}`, update).catch((error) => {
      console.error("Update error:", error);
      toast.error("Failed to update");
      // Revert on failure
      mutateScript();
    });
  };

  const handleStartRehearsal = async (scene: Scene) => {
    const userCharacter = selectedCharacter[scene.id] ?? scene.character_1_name;
    setStartingRehearsalFor(scene.id);
    try {
      const { data } = await api.post<{ id: number } & Record<string, unknown>>('/api/scenes/rehearse/start', {
        scene_id: scene.id,
        user_character: userCharacter,
      });
      // Cache session data so rehearsal page skips the GET round-trip
      try { sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data)); } catch { /* quota */ }
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
      mutateScript();
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
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 2) return s > 0 ? `${m}m ${s}s` : `${m} min`;
    return `${m} min`;
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
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          className="ml-auto h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Rehearsal settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </nav>

      <div className="space-y-8 max-w-3xl">

      {/* Script Info */}
      <section className="space-y-4">
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
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                <Popover open={castPopoverOpen} onOpenChange={setCastPopoverOpen}>
                  <PopoverTrigger asChild>
                    <span
                      className="cursor-help underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
                      onMouseEnter={() => {
                        castHoverRef.current = setTimeout(() => setCastPopoverOpen(true), 200);
                      }}
                      onMouseLeave={() => {
                        if (castHoverRef.current) { clearTimeout(castHoverRef.current); castHoverRef.current = null; }
                        setCastPopoverOpen(false);
                      }}
                    >
                      {script.num_characters} characters
                    </span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-80 max-h-[320px] overflow-y-auto p-0"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onMouseEnter={() => { if (castHoverRef.current) clearTimeout(castHoverRef.current); }}
                    onMouseLeave={() => setCastPopoverOpen(false)}
                  >
                    <div className="px-3 py-2 border-b border-border/60 sticky top-0 bg-popover z-10">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Cast ({script.characters.length})
                      </p>
                    </div>
                    <div className="divide-y divide-border/40">
                      {script.characters.map((char, i) => (
                        <div key={i} className="px-3 py-2 hover:bg-muted/40 transition-colors">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{char.name}</span>
                            {(char.gender || char.age_range) && (
                              <span className="text-[10px] text-muted-foreground/70 shrink-0">
                                {[char.gender, char.age_range].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </div>
                          {char.description && (
                            <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">{char.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground/40">·</span>
                <span>{script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""}</span>
                {script.estimated_length_minutes != null && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span>~{script.estimated_length_minutes} min</span>
                  </>
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
                    className="h-7 w-48 text-sm"
                    maxLength={40}
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
                  className="group inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors max-w-full min-w-0"
                  onClick={() => startEditing("author", script.author)}
                >
                  <span className="font-medium text-foreground/80 shrink-0">Author</span>
                  <span className="truncate max-w-[200px]">{script.author}</span>
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
                    ref={synopsisRef}
                    value={editValue}
                    onChange={(e) => {
                      setEditValue(e.target.value);
                      if (synopsisRef.current) {
                        synopsisRef.current.style.height = "auto";
                        synopsisRef.current.style.height = synopsisRef.current.scrollHeight + "px";
                      }
                    }}
                    onFocus={() => {
                      requestAnimationFrame(() => {
                        if (synopsisRef.current) {
                          synopsisRef.current.style.height = "auto";
                          synopsisRef.current.style.height = synopsisRef.current.scrollHeight + "px";
                        }
                      });
                    }}
                    placeholder="Description..."
                    rows={2}
                    maxLength={500}
                    autoFocus
                    className="text-sm resize-none overflow-hidden"
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
                      Synopsis <span className="normal-case text-muted-foreground/60">(optional)</span>
                    </span>
                    <Edit2 className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                  <p className="text-sm text-foreground/90 mt-1 leading-relaxed break-words">
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
                  ref={synopsisRef}
                  value={editValue}
                  onChange={(e) => {
                    setEditValue(e.target.value);
                    if (synopsisRef.current) {
                      synopsisRef.current.style.height = "auto";
                      synopsisRef.current.style.height = synopsisRef.current.scrollHeight + "px";
                    }
                  }}
                  placeholder="Add a description..."
                  rows={2}
                  maxLength={500}
                  autoFocus
                  className="text-sm resize-none overflow-hidden"
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
                Add synopsis (optional)
              </motion.button>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      </section>

      {/* Extracted Scenes */}
      <section aria-label="Scenes in this script" className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground font-serif">
          Extracted Scenes ({script.scenes.length})
        </h2>

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
                <h3 className="text-base font-semibold text-foreground mb-1 font-serif">No scenes extracted</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Try pasting again with the correct format.
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="space-y-2">
            {groupScenesByAct(script.scenes).map((group, groupIdx) => {
              const actKey = group.act ? `${group.act}_${groupIdx}` : "__flat__";
              // Acts default collapsed; flat (no acts) default expanded
              const isExpanded = group.act ? expandedActs[actKey] === true : expandedActs[actKey] !== false;
              const groupDuration = group.scenes.reduce((sum, s) => sum + s.estimated_duration_seconds, 0);

              return (
                <div key={actKey}>
                  {/* Act header — only shown for scripts with acts */}
                  {group.act && (
                    <button
                      onClick={() => setExpandedActs(prev => ({ ...prev, [actKey]: !isExpanded }))}
                      className="w-full flex items-center justify-between py-3.5 px-4 bg-muted/50 border border-border/60 mb-0 text-left hover:bg-muted/80 transition-colors"
                    >
                      <h3 className="text-base font-semibold text-foreground font-serif">
                        {group.act}
                      </h3>
                      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <span>
                          {group.scenes.length} {group.scenes.length === 1 ? "scene" : "scenes"}
                          <span className="text-muted-foreground/40 mx-1.5">·</span>
                          {formatDuration(groupDuration)}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground/60 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                        />
                      </div>
                    </button>
                  )}

                  {/* Scene cards */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 gap-3 py-3 px-1">
                          {group.scenes.map((scene) => (
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
                                className="overflow-hidden cursor-pointer transition-all h-full hover:shadow-md hover:border-primary/40"
                                onClick={() => router.push(`/my-scripts/${scriptId}/scenes/${scene.id}/edit`)}
                              >
                                <CardContent className="p-5 space-y-3">
                                  <div>
                                    <h3 className="text-base font-semibold font-serif line-clamp-2" title={scene.title}>
                                      {scene.title}
                                    </h3>
                                    {scene.description && (
                                      <p className="text-sm text-muted-foreground/80 line-clamp-2 mt-1 leading-relaxed">
                                        {scene.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    {scene.scene_number && (
                                      <>
                                        <span className="text-muted-foreground/70">{scene.scene_number}</span>
                                        <span className="text-muted-foreground/40">·</span>
                                      </>
                                    )}
                                    <span>{scene.character_1_name}</span>
                                    <span className="text-muted-foreground/40">·</span>
                                    <span>{scene.character_2_name}</span>
                                    <span className="text-muted-foreground/40">·</span>
                                    <ScenePreviewTooltip sceneId={scene.id}>
                                      <span className="cursor-help underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>
                                        {scene.line_count} lines
                                      </span>
                                    </ScenePreviewTooltip>
                                    <span className="text-muted-foreground/40">·</span>
                                    <span>{formatDuration(scene.estimated_duration_seconds)}</span>

                                    <span className="ml-auto">
                                      <Popover
                                        open={reportingSceneId === scene.id}
                                        onOpenChange={(open) => {
                                          if (open) {
                                            setReportingSceneId(scene.id);
                                          } else {
                                            setReportingSceneId(null);
                                            setReportComment("");
                                            setReportCategory("missing_lines");
                                          }
                                        }}
                                      >
                                        <PopoverTrigger asChild>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setReportingSceneId(scene.id);
                                            }}
                                            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5"
                                            title="Report an issue"
                                          >
                                            <Flag className="w-3 h-3" />
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-72 p-3"
                                          align="end"
                                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                        >
                                          <div className="space-y-3">
                                            <p className="text-sm font-medium">Report an issue</p>
                                            <select
                                              value={reportCategory}
                                              onChange={(e) => setReportCategory(e.target.value)}
                                              className="w-full text-sm border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                                            >
                                              <option value="missing_lines">Missing lines</option>
                                              <option value="wrong_character">Wrong character name</option>
                                              <option value="missing_scene">Missing scene</option>
                                              <option value="wrong_metadata">Wrong info (tone, setting, etc.)</option>
                                              <option value="other">Other</option>
                                            </select>
                                            <Textarea
                                              placeholder="Details (optional)"
                                              value={reportComment}
                                              onChange={(e) => setReportComment(e.target.value)}
                                              className="text-sm min-h-[60px] resize-none"
                                              maxLength={500}
                                            />
                                            <Button
                                              size="sm"
                                              className="w-full"
                                              disabled={reportSubmitting}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleSubmitReport(scene.id);
                                              }}
                                            >
                                              {reportSubmitting ? "Sending..." : "Send report"}
                                            </Button>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </section>

      </div>

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
      <SceneSettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />

    </motion.div>
      )}
    </div>
  );
}
