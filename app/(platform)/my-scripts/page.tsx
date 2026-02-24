"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { ScenePartnerTutorial } from "@/components/scenepartner/ScenePartnerTutorial";
import { ScenePartnerAudioCheck } from "@/components/scenepartner/ScenePartnerAudioCheck";
import { MicAccessWarning } from "@/components/scenepartner/MicAccessWarning";
import { getScenePartnerTutorialSeen, getScenePartnerAudioCheckDone } from "@/lib/scenepartnerStorage";
import { NewSceneModal } from "@/components/scenepartner/NewSceneModal";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload,
  Trash2,
  Loader2,
  ChevronRight,
  Sparkles,
  ClipboardPaste,
  Plus,
  FileText,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api, { API_URL } from "@/lib/api";
import { toast } from "sonner";

// Fun loading messages while script is processing (like monologue search)
const SCRIPT_LOADING_MESSAGES = [
  "Reading your script...",
  "Finding the characters...",
  "Extracting scenes...",
  "Consulting the drama gods...",
  "Squeezing the script...",
  "Almost there...",
  "Getting ready to rehearse...",
];

interface UserScript {
  id: number;
  title: string;
  author: string;
  description?: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processing_error?: string;
  ai_extraction_completed: boolean;
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
  updated_at?: string;
  first_scene_title?: string | null;
  first_scene_description?: string | null;
  scene_titles?: string[];
}

export default function MyScriptsPage() {
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const [showTutorial, setShowTutorial] = useState<boolean | null>(null);
  const [showAudioCheck, setShowAudioCheck] = useState<boolean | null>(null);
  const [scripts, setScripts] = useState<UserScript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteAuthor, setPasteAuthor] = useState("");
  const [pasteDescription, setPasteDescription] = useState("");
  const [pasting, setPasting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showNewSceneModal, setShowNewSceneModal] = useState(false);
  const [deleteScriptDialogOpen, setDeleteScriptDialogOpen] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState<number | null>(null);
  const deleteScriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShowTutorial(!getScenePartnerTutorialSeen());
    setShowAudioCheck(!getScenePartnerAudioCheckDone());
  }, []);

  useEffect(() => {
    fetchScripts();
  }, []);

  // Rotate loading message every 2s while uploading or pasting
  useEffect(() => {
    if (!uploadingFile && !pasting) {
      setLoadingMessageIndex(0);
      return;
    }
    const id = setInterval(
      () => setLoadingMessageIndex((prev) => (prev + 1) % SCRIPT_LOADING_MESSAGES.length),
      2000
    );
    return () => clearInterval(id);
  }, [uploadingFile, pasting]);

  const fetchScripts = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<UserScript[]>("/api/scripts/");
      let list = response.data;
      if (list.length === 0) {
        await api.post<unknown>("/api/scripts/ensure-example");
        const retry = await api.get<UserScript[]>("/api/scripts/");
        list = retry.data;
      }
      setScripts(list);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      toast.error("Failed to load scripts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Block duplicate: already have a script with this filename
    if (scripts.some((s) => s.original_filename === file.name)) {
      toast.error("You already have a script with this filename. Delete it from My Scripts first, or upload with a different name.");
      event.target.value = "";
      return;
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "txt", "text"].includes(ext)) {
      toast.error("Only PDF and TXT files are supported");
      return;
    }

    // Max 15MB (ScenePartner limit)
    const MAX_SIZE_MB = 15;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_SIZE_MB}MB)`);
      return;
    }

    // Soft warning for large files (2MB+)
    if (file.size > 2 * 1024 * 1024) {
      toast.info("Large file - we recommend one scene or short scripts (up to ~100 lines) for best results.");
    }

    setUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Please sign in again to upload.");
        return;
      }

      const response = await fetch(`${API_URL}/api/scripts/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Upload failed");
      }

      const result = await response.json();
      toast.success(`Script uploaded! Extracted ${result.num_scenes_extracted} scenes.`);

      // Refresh scripts list
      fetchScripts();

      // Navigate to the script detail view
      router.push(`/my-scripts/${result.id}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload script");
    } finally {
      setUploadingFile(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handlePasteSubmit = async () => {
    const body = pasteText.trim();
    if (body.length < 100) {
      toast.error("Paste at least a few lines of dialogue (100+ characters) so we can extract a scene.");
      return;
    }
    setPasting(true);
    try {
      const { data } = await api.post<{ id: number; num_scenes_extracted: number }>(
        "/api/scripts/from-text",
        {
          body,
          title: pasteTitle.trim() || undefined,
          author: pasteAuthor.trim() || undefined,
          description: pasteDescription.trim() || undefined,
        }
      );
      if (data.num_scenes_extracted === 0) {
        toast.error(
          "No two-person scenes were found. Use format: CHARACTER: line (e.g. JORDAN: Hello. SAM: Hi.). You can delete this script below.",
          { duration: 8000 }
        );
      } else {
        toast.success(`Script created! Extracted ${data.num_scenes_extracted} scenes.`);
      }
      setShowPasteModal(false);
      setPasteText("");
      setPasteTitle("");
      setPasteAuthor("");
      setPasteDescription("");
      fetchScripts();
      router.push(`/my-scripts/${data.id}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Failed to create script";
      toast.error(typeof msg === "string" ? msg : "Failed to create script");
    } finally {
      setPasting(false);
    }
  };

  const performDeleteScript = async (scriptId: number) => {
    try {
      await api.delete(`/api/scripts/${scriptId}`);
      toast.success("Script deleted");
      fetchScripts();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete script");
    }
  };

  const handleDeleteScriptClick = (scriptId: number) => {
    setScriptToDelete(scriptId);
    setDeleteScriptDialogOpen(true);
  };

  const handleConfirmDeleteScript = () => {
    const scriptId = scriptToDelete;
    if (scriptId == null) return;
    setScriptToDelete(null);

    const UNDO_SECONDS = 5;
    const toastId = toast("Deleting script in " + UNDO_SECONDS + " seconds…", {
      duration: (UNDO_SECONDS + 2) * 1000,
      action: {
        label: "Undo",
        onClick: () => {
          if (deleteScriptTimeoutRef.current) {
            clearTimeout(deleteScriptTimeoutRef.current);
            deleteScriptTimeoutRef.current = null;
          }
          toast.dismiss(toastId);
          toast.success("Delete cancelled");
        },
      },
    });

    deleteScriptTimeoutRef.current = setTimeout(() => {
      deleteScriptTimeoutRef.current = null;
      toast.dismiss(toastId);
      performDeleteScript(scriptId);
    }, UNDO_SECONDS * 1000);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: UserScript["processing_status"]) => {
    const tagClass = "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-muted/90 text-foreground border border-border";
    if (status === "failed") {
      return <Badge variant="destructive" className="font-normal text-xs">Failed</Badge>;
    }
    const text = { pending: "Pending", processing: "Processing…", completed: "Ready" }[status];
    return (
      <span className={tagClass}>
        {status === "processing" && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
        {text}
      </span>
    );
  };

  const isProcessing = uploadingFile || pasting;
  const currentLoadingMessage = SCRIPT_LOADING_MESSAGES[loadingMessageIndex];

  if (showTutorial === null) {
    return <div className="min-h-[60vh] flex items-center justify-center" aria-hidden="true" />;
  }
  if (showTutorial === true) {
    return (
      <ScenePartnerTutorial
        onComplete={() => setShowTutorial(false)}
      />
    );
  }
  if (showAudioCheck === true) {
    return (
      <ScenePartnerAudioCheck
        onComplete={() => setShowAudioCheck(false)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-5xl">
      <MicAccessWarning />
      <input
        type="file"
        id="script-upload"
        accept=".pdf,.txt"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploadingFile}
      />

      {/* Full-page fun loading state while processing script */}
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm"
        >
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
            <Sparkles className="h-7 w-7 text-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <motion.p
            key={loadingMessageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-medium text-foreground"
          >
            {currentLoadingMessage}
          </motion.p>
        </motion.div>
      )}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6 sm:mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1.5 font-serif">My Scripts</h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              Each script can have one or more scenes. <strong>New Script</strong>: create from scratch. <strong>Upload</strong> or <strong>Paste</strong>: we extract scenes from a file or text.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-1.5">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-2 py-1.5">
              <Button
                size="sm"
                className="gap-1.5 h-8 px-3 font-medium shadow-sm"
                onClick={() => setShowNewSceneModal(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                New Script
              </Button>
              {uploadingFile ? (
                <Button
                  disabled
                  size="sm"
                  variant="outline"
                  className="gap-2 h-8 px-3 font-normal"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading…
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => document.getElementById("script-upload")?.click()}
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 px-3 font-normal"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px]">
                    PDF or TXT, max 15MB. We extract characters and scenes; best with one scene or up to ~100 lines.
                  </TooltipContent>
                </Tooltip>
              )}
              {pasting ? (
                <Button disabled size="sm" variant="outline" className="gap-1.5 h-8 px-3 font-normal">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Pasting…
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 px-3 font-normal"
                      onClick={() => setShowPasteModal(true)}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      Paste
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px]">
                    Paste script text; we extract scenes and characters so you can rehearse with the AI.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Content: crossfade skeleton → content to avoid flicker */}
      <div className="relative min-h-[340px]">
        {/* Skeleton overlay: fades out when data is loaded */}
        <motion.div
          className="absolute inset-0 z-10 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
          initial={false}
          animate={{ opacity: isLoading ? 1 : 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{ pointerEvents: isLoading ? "auto" : "none" }}
          aria-hidden={!isLoading}
        >
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="min-h-[320px]">
              <CardHeader className="pt-5 px-5 sm:px-6">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent className="px-5 sm:px-6 space-y-4">
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </CardContent>
              <CardFooter className="px-5 sm:px-6 pb-5">
                <Skeleton className="h-9 w-28" />
              </CardFooter>
            </Card>
          ))}
        </motion.div>

        {/* Actual content: fades in when loaded */}
        {!isLoading && (
          scripts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="rounded-2xl border border-dashed border-border bg-muted/30 py-16 px-6 text-center"
            >
              <p className="text-muted-foreground text-base">No scripts yet. Use the buttons above to add one.</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
            >
              <AnimatePresence mode="popLayout">
                {scripts.map((script, index) => (
                  <motion.div
                    key={script.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.15) }}
                  >
                <motion.div
                  whileHover={{ scale: 1.01, y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="touch-manipulation h-full"
                >
                  <Card
                    className="cursor-pointer group h-full flex flex-col border-border/80 hover:border-border hover:shadow-lg transition-all duration-300 hover:border-primary/40 min-h-[300px] sm:min-h-[320px] active:scale-[0.99]"
                    onClick={() => router.push(`/my-scripts/${script.id}`)}
                  >
                    <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-lg font-semibold leading-tight line-clamp-2 font-serif">
                            {script.title}
                          </CardTitle>
                          <CardDescription className="mt-1.5 text-sm text-muted-foreground">
                            {script.author}
                            {script.genre ? ` · ${script.genre}` : ""}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                          {script.title.startsWith("Example:") && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block">
                                  <Badge variant="outline" className="font-normal text-xs cursor-help">Example</Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[240px]">
                                Sample script included so you can try ScenePartner right away.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {getStatusBadge(script.processing_status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 px-5 pb-4 sm:px-6">
                      {script.processing_status === "completed" && (
                        <>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                            {script.characters?.length > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1.5 cursor-help underline decoration-dotted underline-offset-2">
                                    <Users className="w-4 h-4 shrink-0" />
                                    {script.num_characters} character{script.num_characters !== 1 ? "s" : ""}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px]">
                                  <p className="font-medium mb-1">Characters</p>
                                  <p className="text-sm">{script.characters.map((c) => c.name).join(", ")}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <Users className="w-4 h-4 shrink-0" />
                                {script.num_characters} character{script.num_characters !== 1 ? "s" : ""}
                              </span>
                            )}
                            {(script.scene_titles?.length ?? 0) > 0 || script.first_scene_title || script.first_scene_description ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1.5 cursor-help underline decoration-dotted underline-offset-2">
                                    <FileText className="w-4 h-4 shrink-0" />
                                    {script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""} inside
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[320px]">
                                  <p className="font-medium mb-1.5">Scenes</p>
                                  {script.scene_titles?.length ? (
                                    <ul className="text-sm space-y-1 list-disc list-inside">
                                      {script.scene_titles.slice(0, 5).map((t, i) => (
                                        <li key={i}>{t}</li>
                                      ))}
                                      {(script.scene_titles?.length ?? 0) > 5 && (
                                        <li className="text-muted-foreground">+{script.scene_titles!.length - 5} more</li>
                                      )}
                                    </ul>
                                  ) : script.first_scene_title ? (
                                    <p className="text-sm">
                                      {script.first_scene_title}
                                      {(script.first_scene_description?.trim() || script.description?.trim()) && (
                                        <span className="block mt-1 text-muted-foreground line-clamp-2">
                                          {script.first_scene_description?.trim() || script.description?.trim()}
                                        </span>
                                      )}
                                    </p>
                                  ) : null}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <FileText className="w-4 h-4 shrink-0" />
                                {script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""} inside
                              </span>
                            )}
                            {script.estimated_length_minutes != null && (
                              <span>~{script.estimated_length_minutes} min</span>
                            )}
                          </div>
                          {(script.description?.trim() || script.first_scene_title || script.first_scene_description?.trim()) ? (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</span>
                              {script.first_scene_title && (
                                <p className="text-sm font-medium text-foreground line-clamp-1">
                                  {script.num_scenes_extracted === 1 ? "Scene: " : "First scene: "}{script.first_scene_title}
                                </p>
                              )}
                              {(script.first_scene_description?.trim() || script.description?.trim()) ? (
                                <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed border-l-2 border-primary/30 pl-3">
                                  {(script.first_scene_description?.trim() || script.description?.trim() || "").slice(0, 180)}
                                  {(script.first_scene_description?.trim() || script.description?.trim() || "").length > 180 ? "…" : ""}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {script.characters?.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">Characters:</span>
                              {script.characters.slice(0, 5).map((c, i) => (
                                <Badge key={i} variant="secondary" className="font-normal text-xs">
                                  {c.name}
                                </Badge>
                              ))}
                              {script.characters.length > 5 && (
                                <span className="text-xs text-muted-foreground">+{script.characters.length - 5}</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {script.processing_error && (
                        <p className="text-xs text-destructive">{script.processing_error}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-auto">{formatDate(script.created_at)}</p>
                    </CardContent>
                    <CardFooter className="flex justify-between items-center pt-4 pb-5 px-5 sm:px-6 mt-auto border-t bg-muted/20" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => router.push(`/my-scripts/${script.id}`)}
                      >
                        Open script
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteScriptClick(script.id)}
                        aria-label="Delete script"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              </motion.div>
            ))}
              </AnimatePresence>
            </motion.div>
          )
        )}
        </div>

      <NewSceneModal
        open={showNewSceneModal}
        onOpenChange={setShowNewSceneModal}
        onSuccess={fetchScripts}
      />
      <ConfirmDeleteDialog
        open={deleteScriptDialogOpen}
        onOpenChange={(open) => {
          setDeleteScriptDialogOpen(open);
          if (!open) setScriptToDelete(null);
        }}
        title="Delete this script?"
        description="This will permanently remove the script and all its scenes. You can undo in the next few seconds after confirming."
        confirmLabel="Delete script"
        onConfirm={handleConfirmDeleteScript}
      />

      <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-serif">Paste script</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Paste your scene or script text below. AI will extract title, characters, and two-person scenes. Use the format <strong>CHARACTER: line</strong> (e.g. JORDAN: Hello. SAM: Hi.). Best for one scene or short script.
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="paste-body" className="text-base">Script text (required)</Label>
              <Textarea
                id="paste-body"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"JOHN: I need to tell you something.\nJANE: What is it?\nJOHN: I've been thinking about us..."}
                rows={12}
                className="mt-2 resize-y font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">At least 100 characters. Max 10MB. Include character names and dialogue in the form CHARACTER: line.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paste-title">Title (optional)</Label>
                <Input
                  id="paste-title"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="e.g. Kitchen Scene"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="paste-author">Author (optional)</Label>
                <Input
                  id="paste-author"
                  value={pasteAuthor}
                  onChange={(e) => setPasteAuthor(e.target.value)}
                  placeholder="e.g. Unknown"
                  className="mt-2"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="paste-description">Description (optional)</Label>
              <Textarea
                id="paste-description"
                value={pasteDescription}
                onChange={(e) => setPasteDescription(e.target.value)}
                placeholder="Brief note about this script..."
                rows={2}
                className="mt-2 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowPasteModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePasteSubmit}
                disabled={pasting || pasteText.trim().length < 100}
                className="gap-2"
              >
                {pasting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create script
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
