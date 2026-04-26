"use client";

import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScripts, SCRIPTS_QUERY_KEY, type UserScript as UserScriptType } from "@/hooks/useScripts";
import { useRouter } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { ScenePartnerTutorial } from "@/components/scenepartner/ScenePartnerTutorial";
import { ScenePartnerAudioCheck } from "@/components/scenepartner/ScenePartnerAudioCheck";
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
  Check,
  Flag,
  Zap,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api, { API_URL } from "@/lib/api";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { getGenreBadgeClassName, getGenreBorderClassName } from "@/lib/genreColors";
import { toast } from "sonner";
import { trackScenePartnerOpened } from "@/lib/analytics";

// Known backend progress prefixes and their friendly group labels.
// Steps sharing the same group appear as sub-steps under one heading.
const STEP_GROUPS: { match: string; label: string }[] = [
  { match: "Opening", label: "Opening the script" },
  { match: "Read ", label: "Reading through every page" },
  { match: "Stripped", label: "Reading through every page" },
  { match: "Analyzing", label: "Analyzing script and extracting scenes" },
  { match: "Learning", label: "Learning who the characters are" },
  { match: "Found ", label: "Pulling every line of dialogue" },
  { match: "Mapping", label: "Mapping out the acts and scenes" },
  { match: "Detected", label: "Mapping out the acts and scenes" },
  { match: "No act", label: "Mapping out the acts and scenes" },
  { match: "Pulling", label: "Pulling every line of dialogue" },
  { match: "Regex parsed", label: "Pulling every line of dialogue" },
  { match: "Skipped", label: "Pulling every line of dialogue" },
  { match: "No scenes", label: "Pulling every line of dialogue" },
  { match: "Filtered", label: "Assembling your rehearsal scenes" },
  { match: "Figuring", label: "Figuring out the tone, emotions, dynamics" },
  { match: "Analyzed", label: "Figuring out the tone, emotions, dynamics" },
  { match: "Extracting", label: "Pulling every line of dialogue" },
  { match: "Extracted", label: "Assembling your rehearsal scenes" },
  { match: "Cleaning", label: "Cleaning up dialogue" },
  { match: "AI cleanup", label: "Cleaning up dialogue" },
  { match: "rehearsal-ready", label: "Assembling your rehearsal scenes" },
];

function groupLabel(raw: string): string {
  for (const g of STEP_GROUPS) {
    if (raw.startsWith(g.match)) return g.label;
  }
  return raw;
}

type UserScript = UserScriptType;

function CastTooltip({ characters, count }: { characters: { name: string }[]; count: number }) {
  const shown = characters.slice(0, 6);
  const extra = characters.length - shown.length;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors">
          {count} character{count !== 1 ? "s" : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[260px]">
        <div className="flex flex-wrap gap-1">
          {shown.map((c, i) => (
            <span key={i} className="text-xs bg-muted border border-border/60 px-1.5 py-0.5">{c.name}</span>
          ))}
          {extra > 0 && (
            <span className="text-xs text-muted-foreground px-1 py-0.5">+{extra} more</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function MyScriptsPage() {
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const queryClient = useQueryClient();
  const [showTutorial, setShowTutorial] = useState<boolean | null>(null);
  const [showAudioCheck, setShowAudioCheck] = useState<boolean | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteAuthor, setPasteAuthor] = useState("");
  const [pasteDescription, setPasteDescription] = useState("");
  const [pasting, setPasting] = useState(false);
  // SSE-driven progress steps: each entry is { group, detail }
  const [progressSteps, setProgressSteps] = useState<{ group: string; detail: string }[]>([]);
  const [extractionDone, setExtractionDone] = useState(false);
  const [showNewSceneModal, setShowNewSceneModal] = useState(false);
  const [deleteScriptDialogOpen, setDeleteScriptDialogOpen] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState<number | null>(null);
  // Pre-extraction scan + choice dialog state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    page_count: number;
    has_structure: boolean;
    num_acts: number;
    num_sections: number;
    show_mode_choice: boolean;
    estimated_quick_seconds: number;
    estimated_full_seconds: number;
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const pendingInputRef = useRef<HTMLInputElement | null>(null);

  const deleteScriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressScrollRef = useRef<HTMLDivElement>(null);

  const { data: scripts = [], isLoading } = useScripts();
  const mutateScripts = () => queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Track ScenePartner page open — infer source from referrer
    const ref = typeof document !== "undefined" ? document.referrer : "";
    const source = ref.includes("/search") ? "search_result" as const : ref.includes("/my-scripts") ? "nav" as const : "direct" as const;
    trackScenePartnerOpened({ source });
  }, []);

  useEffect(() => {
    setShowTutorial(!getScenePartnerTutorialSeen());
    setShowAudioCheck(!getScenePartnerAudioCheckDone());
  }, []);

  // Auto-scroll progress to bottom when new steps arrive
  useEffect(() => {
    // Delay to let framer-motion animation expand the element before scrolling
    const t = setTimeout(() => {
      if (progressScrollRef.current) {
        progressScrollRef.current.scrollTo({
          top: progressScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [progressSteps]);




  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    pendingInputRef.current = event.target;

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

    // Small files (<50KB / ~15 pages): skip scan, go straight to extraction
    if (file.size < 50_000) {
      await startExtraction(file, "full");
      return;
    }

    // Phase 1: Quick scan to detect structure (large files only)
    setScanning(true);
    try {
      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Please sign in again to upload.");
        setScanning(false);
        return;
      }

      const scanForm = new FormData();
      scanForm.append("file", file);

      const scanRes = await fetch(`${API_URL}/api/scripts/scan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: scanForm,
      });

      if (!scanRes.ok) {
        const err = await scanRes.json();
        if (err.detail?.error === "feature_not_available") {
          setScanning(false);
          event.target.value = "";
          setShowUpgradeModal(true);
          return;
        }
        throw new Error(typeof err.detail === "string" ? err.detail : "Scan failed");
      }

      const scan = await scanRes.json();
      setScanning(false);

      if (scan.show_mode_choice) {
        // Show choice dialog — extraction starts after user picks
        setPendingFile(file);
        setScanResult(scan);
        return;
      }

      // Medium script without mode choice — go straight to full extraction
      await startExtraction(file, "full");
    } catch (error: any) {
      setScanning(false);
      console.error("Scan error:", error);
      toast.error(error.message || "Failed to scan script");
      if (pendingInputRef.current) pendingInputRef.current.value = "";
    }
  };

  const handleModeChoice = async (mode: "quick" | "full") => {
    const file = pendingFile;
    setScanResult(null);
    setPendingFile(null);
    if (!file) return;
    await startExtraction(file, mode);
  };

  const dismissModeChoice = () => {
    setScanResult(null);
    setPendingFile(null);
    if (pendingInputRef.current) pendingInputRef.current.value = "";
  };

  const startExtraction = async (file: File, mode: "quick" | "full") => {
    setUploadingFile(true);
    setProgressSteps([{ group: "Uploading file", detail: "Uploading file" }]);
    setExtractionDone(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);

      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Please sign in again to upload.");
        return;
      }

      const response = await fetch(`${API_URL}/api/scripts/upload-stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        const detail = error.detail;
        if (detail?.error === "feature_not_available") {
          setShowUpgradeModal(true);
          return;
        }
        const message = typeof detail === "string"
          ? detail
          : detail?.message || "Upload failed";
        throw new Error(message);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "progress") {
              const group = groupLabel(event.step);
              setProgressSteps((prev) => {
                // If same group as last, update detail; otherwise add new group
                const last = prev[prev.length - 1];
                if (last && last.group === group) {
                  return [...prev.slice(0, -1), { group, detail: event.step }];
                }
                return [...prev, { group, detail: event.step }];
              });
            } else if (event.type === "done") {
              setExtractionDone(true);
              const result = event.data;
              toast.success(`Script uploaded! Extracted ${result.num_scenes_extracted} scenes.`);
              mutateScripts();
              // Pre-populate React Query cache so detail page loads instantly
              queryClient.setQueryData(["scripts", result.id], result);
              // Close the reader before navigating to avoid "client disconnected" on backend
              reader.cancel();
              // Brief pause so user sees the final state
              await new Promise((r) => setTimeout(r, 800));
              router.push(`/my-scripts/${result.id}`);
            } else if (event.type === "error") {
              throw new Error(event.detail || "Extraction failed");
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            // Ignore JSON parse errors from partial SSE data
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        toast.info("Upload cancelled");
      } else {
        console.error("Upload error:", error);
        toast.error(error.message || "Failed to upload script");
      }
    } finally {
      abortControllerRef.current = null;
      setUploadingFile(false);
      if (pendingInputRef.current) pendingInputRef.current.value = "";
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
          "No two-person scenes found. Use format: CHARACTER: line",
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
      mutateScripts();
      router.push(`/my-scripts/${data.id}`);
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: any } } }).response?.data?.detail
          : undefined;
      if (detail?.error === "feature_not_available") {
        setShowUpgradeModal(true);
      } else {
        const msg = typeof detail === "string" ? detail : "Failed to create script";
        toast.error(msg);
      }
    } finally {
      setPasting(false);
    }
  };

  const performDeleteScript = async (scriptId: number) => {
    // Optimistic: remove from UI instantly
    queryClient.setQueryData<UserScript[]>(SCRIPTS_QUERY_KEY, (prev) => (prev ?? []).filter((s) => s.id !== scriptId));
    try {
      await api.delete(`/api/scripts/${scriptId}`);
      localStorage.setItem("dismissed_example_script", "true");
      toast.success("Script deleted");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete script");
      mutateScripts();
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

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.round(seconds / 60);
    return `${mins} min`;
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
    const tagClass = "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-muted/90 text-foreground border border-border";
    if (status === "failed") {
      return <Badge variant="destructive" className="font-normal text-xs">Failed</Badge>;
    }
    if (status === "completed") return null;
    const text = { pending: "Pending", processing: "Processing…" }[status];
    return (
      <span className={tagClass}>
        {status === "processing" && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
        {text}
      </span>
    );
  };

  const isProcessing = uploadingFile || pasting;

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
        dismissible
        onDismiss={() => setShowAudioCheck(false)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-5xl">
      <input
        type="file"
        id="script-upload"
        accept=".pdf,.txt"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploadingFile || scanning}
      />

      {/* Scanning overlay */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Scanning script...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extraction progress — reasoning/thinking style */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm mx-4">
              <div className="relative">
                {/* Fade-out gradient at top when scrollable */}
                {progressSteps.length > 6 && (
                  <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background/95 to-transparent z-10 pointer-events-none" />
                )}
                <div
                  ref={progressScrollRef}
                  className="border-l-2 border-border/80 pl-4 space-y-0 max-h-[50vh] overflow-y-auto scrollbar-thin"
                >
                <AnimatePresence initial={false}>
                  {progressSteps.map((step, i) => {
                    const isLatest = i === progressSteps.length - 1 && !extractionDone;
                    const isCompleted = i < progressSteps.length - 1 || extractionDone;
                    const showDetail = step.detail !== step.group;
                    return (
                      <motion.div
                        key={`${step.group}_${i}`}
                        initial={{ opacity: 0, height: 0, x: -8 }}
                        animate={{ opacity: 1, height: "auto", x: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2.5 py-2">
                          <div className="mt-0.5">
                            {isCompleted ? (
                              <motion.div
                                initial={{ scale: 0, rotate: -90 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              </motion.div>
                            ) : (
                              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                            )}
                          </div>
                          <div>
                            <span className={`text-[13px] leading-snug ${isCompleted ? "text-muted-foreground/70" : "text-foreground"}`}>
                              {step.group}
                              {isLatest && !showDetail && (
                                <motion.span
                                  animate={{ opacity: [0.2, 1, 0.2] }}
                                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                  className="text-muted-foreground"
                                >
                                  ...
                                </motion.span>
                              )}
                            </span>
                            {showDetail && (
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={`text-[11px] leading-snug mt-0.5 ${isCompleted ? "text-muted-foreground/70" : "text-muted-foreground/80"}`}
                              >
                                {step.detail}
                                {isLatest && (
                                  <motion.span
                                    animate={{ opacity: [0.2, 1, 0.2] }}
                                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                    className="text-muted-foreground"
                                  >
                                    ...
                                  </motion.span>
                                )}
                              </motion.p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {progressSteps.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2.5 py-2"
                  >
                    <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                    <span className="text-[13px] text-foreground">Preparing...</span>
                  </motion.div>
                )}
                </div>
              </div>
              <button
                onClick={() => abortControllerRef.current?.abort()}
                className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel upload
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 sm:mb-10"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-serif">My Scripts</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-xl mt-1.5">
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
                <Button
                  onClick={() => document.getElementById("script-upload")?.click()}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 px-3 font-normal"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </Button>
              )}
              {pasting ? (
                <Button disabled size="sm" variant="outline" className="gap-1.5 h-8 px-3 font-normal">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Pasting…
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 px-3 font-normal"
                  onClick={() => setShowPasteModal(true)}
                  title="Paste script text to extract scenes"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Paste
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Content: crossfade skeleton → content to avoid flicker */}
      <div className="relative min-h-[340px]">
        {/* Skeleton overlay: fades out when data is loaded */}
        <motion.div
          className="absolute inset-x-0 top-4 z-10 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
          initial={false}
          animate={{ opacity: !mounted || isLoading ? 1 : 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{ pointerEvents: !mounted || isLoading ? "auto" : "none" }}
          aria-hidden={mounted && !isLoading}
        >
          {[1, 2].map((i) => (
            <Card key={i}>
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
        {mounted && !isLoading && (
          scripts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="border border-dashed border-primary/30 bg-muted/30 py-16 px-6 text-center"
            >
              <p className="text-muted-foreground text-base">No scripts yet</p>
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
                  whileHover={{ scale: 1.005, y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="touch-manipulation h-full"
                >
                  <Card
                    className={`cursor-pointer group h-full flex flex-col border-border/80 hover:border-border hover:shadow-md transition-all duration-200 hover:border-primary/40 active:scale-[0.99] border-l-[3px] ${script.genre ? getGenreBorderClassName(script.genre) : "border-l-border/80"}`}
                    onClick={() => router.push(`/my-scripts/${script.id}`)}
                  >
                    <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-lg font-semibold leading-tight line-clamp-2 font-serif">
                            {script.title}
                          </CardTitle>
                          <CardDescription className="mt-1.5 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>{script.author}</span>
                            {script.genre && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border ${getGenreBadgeClassName(script.genre)}`}>
                                {script.genre}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                          {(script.is_sample || script.title.startsWith("Example:")) && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 border border-border">Sample</span>
                          )}
                          {script.num_scenes_extracted > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 border cursor-default ${script.ai_extraction_completed ? "text-blue-400 bg-blue-400/10 border-blue-400/30" : "text-amber-500 bg-amber-500/10 border-amber-500/30"}`}>
                                  {script.ai_extraction_completed ? <BookOpen className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                                  {script.ai_extraction_completed ? "Full Extract" : "Quick Extract"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-sm font-medium">{script.ai_extraction_completed ? "Full Extract" : "Quick Extract"}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""} extracted
                                  {script.ai_extraction_completed ? " — all dialogue scenes" : " — two-person scenes only"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {getStatusBadge(script.processing_status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-3 px-5 pb-4 sm:px-6">
                      {script.processing_status === "completed" && (
                        <>
                          <div className="flex items-center flex-wrap gap-1.5 text-sm text-muted-foreground">
                            {script.characters?.length > 0 ? (
                              <CastTooltip characters={script.characters} count={script.num_characters} />
                            ) : (
                              <span>{script.num_characters} character{script.num_characters !== 1 ? "s" : ""}</span>
                            )}
                            <span className="text-muted-foreground/70">·</span>
                            {(script.scene_titles?.length ?? 0) > 0 || script.first_scene_title ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help underline decoration-dotted underline-offset-2">
                                    {script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[320px]">
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
                                    <p className="text-sm">{script.first_scene_title}</p>
                                  ) : null}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span>{script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""}</span>
                            )}
                            {script.estimated_length_minutes != null && (
                              <>
                                <span className="text-muted-foreground/70">·</span>
                                <span>~{script.estimated_length_minutes} min</span>
                              </>
                            )}
                          </div>
                          {(script.description?.trim() || script.first_scene_description?.trim()) && (
                            <p className="text-sm text-muted-foreground/80 line-clamp-2 leading-relaxed italic">
                              {(script.description?.trim() || script.first_scene_description?.trim() || "").slice(0, 160)}
                              {(script.description?.trim() || script.first_scene_description?.trim() || "").length > 160 ? "…" : ""}
                            </p>
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
                      {!script.is_sample && (
                      <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/60"
                            onClick={() => {
                              toast("Report issues from the script detail page — open the script and use the flag on each scene.", { duration: 4000 });
                            }}
                            aria-label="Report issue"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Report an issue</TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteScriptClick(script.id)}
                        aria-label="Delete script"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      </div>
                      )}
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
        onSuccess={() => mutateScripts()}
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

      {/* Extraction mode choice dialog */}
      <Dialog open={scanResult !== null} onOpenChange={(open) => { if (!open) dismissModeChoice(); }}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif">How should we extract scenes?</DialogTitle>
          </DialogHeader>
          {scanResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We found {scanResult.num_acts > 0 ? `${scanResult.num_acts} acts with ` : ""}{scanResult.num_sections} scenes in {scanResult.page_count} pages.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleModeChoice("quick")}
                  className="w-full text-left border border-border hover:border-primary/50 hover:shadow-md p-4 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-foreground">Quick Extract</span>
                    </div>
                    <span className="text-xs text-muted-foreground">~{formatTime(scanResult.estimated_quick_seconds)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-snug">
                    Two-person scenes only. Fastest option, great for focused rehearsal.
                  </p>
                </button>
                <button
                  onClick={() => handleModeChoice("full")}
                  className="w-full text-left border border-border hover:border-primary/50 hover:shadow-md p-4 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-foreground">Full Extract</span>
                    </div>
                    <span className="text-xs text-muted-foreground">~{formatTime(scanResult.estimated_full_seconds)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-snug">
                    All dialogue scenes (2+ characters). Full coverage of the script.
                  </p>
                </button>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Both options use 1 upload from your quota. You can always re-upload later.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-serif">Paste script</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Format: <strong>CHARACTER: line</strong>. AI extracts scenes automatically.
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
              <p className="text-xs text-muted-foreground mt-1">Min 100 characters</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paste-title">Title (optional)</Label>
                <Input
                  id="paste-title"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="Kitchen Scene"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="paste-author">Author (optional)</Label>
                <Input
                  id="paste-author"
                  value={pasteAuthor}
                  onChange={(e) => setPasteAuthor(e.target.value)}
                  placeholder="Unknown"
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

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        feature="Script uploads"
        message="Upload and manage scripts with a Plus or Unlimited plan. Upgrade to get started."
      />
    </div>
  );
}
