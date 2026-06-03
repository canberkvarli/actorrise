"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  IconLoader2,
  IconCheck,
  IconBolt,
  IconBook,
  IconChevronDown,
  IconX,
  IconArrowRight,
} from "@tabler/icons-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { API_URL } from "@/lib/api";
import { SCRIPTS_QUERY_KEY, useScripts } from "@/hooks/useScripts";

// Known backend progress prefixes and their friendly group labels.
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

function formatTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

type ScanResult = {
  page_count: number;
  has_structure: boolean;
  num_acts: number;
  num_sections: number;
  show_mode_choice: boolean;
  estimated_quick_seconds: number;
  estimated_full_seconds: number;
};

interface UploadContextValue {
  /** True while scanning, awaiting a mode choice, or extracting. Triggers should disable. */
  isUploading: boolean;
  /** Human label for the current phase ("Scanning…" / "Uploading…") or null. */
  phaseLabel: string | null;
  /** Validate + scan + extract a picked file. Safe to call from any trigger. */
  start: (file: File) => Promise<void>;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within <UploadProvider>");
  return ctx;
}

/**
 * App-level upload lifecycle. Mounted in the platform layout (above the page
 * transition) so an in-flight upload survives in-app navigation. Renders a
 * persistent progress banner, the quick/full mode dialog, and the upgrade modal.
 *
 * Honest limitation: the extraction runs inside the streaming request, so a
 * hard refresh/close still cancels it — guarded by a `beforeunload` prompt.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: scripts = [] } = useScripts();

  const abortControllerRef = useRef<AbortController | null>(null);
  const progressScrollRef = useRef<HTMLDivElement | null>(null);

  const [scanning, setScanning] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [progressSteps, setProgressSteps] = useState<{ group: string; detail: string }[]>([]);
  const [extractionDone, setExtractionDone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [doneInfo, setDoneInfo] = useState<{ id: number; scenes: number } | null>(null);

  const isBusy = scanning || uploadingFile || scanResult !== null;
  const phaseLabel = scanning ? "Scanning…" : uploadingFile ? "Uploading…" : null;

  const mutateScripts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY }),
    [queryClient],
  );

  // Warn before a refresh/close cancels an in-flight upload.
  useEffect(() => {
    if (!scanning && !uploadingFile) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [scanning, uploadingFile]);

  // Auto-clear the "done" banner after a few seconds.
  useEffect(() => {
    if (!doneInfo) return;
    const t = setTimeout(() => setDoneInfo(null), 6000);
    return () => clearTimeout(t);
  }, [doneInfo]);

  // Auto-scroll the expanded step list as new steps arrive.
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => {
      progressScrollRef.current?.scrollTo({
        top: progressScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 250);
    return () => clearTimeout(t);
  }, [progressSteps, expanded]);

  const getToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await (await import("@/lib/supabase")).supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const startExtraction = useCallback(
    async (file: File, mode: "quick" | "full") => {
      setUploadingFile(true);
      setFileName(file.name);
      setProgressSteps([{ group: "Uploading file", detail: "Uploading file" }]);
      setExtractionDone(false);
      setDoneInfo(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const token = await getToken();
        if (!token) {
          toast.error("Please sign in again to upload.");
          return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", mode);

        const response = await fetch(`${API_URL}/api/scripts/upload-stream`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
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
          throw new Error(
            typeof detail === "string" ? detail : detail?.message || "Upload failed",
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "progress") {
                const group = groupLabel(event.step);
                setProgressSteps((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.group === group) {
                    return [...prev.slice(0, -1), { group, detail: event.step }];
                  }
                  return [...prev, { group, detail: event.step }];
                });
              } else if (event.type === "done") {
                setExtractionDone(true);
                const result = event.data;
                toast.success(
                  `Script uploaded! Extracted ${result.num_scenes_extracted} scenes.`,
                );
                mutateScripts();
                queryClient.setQueryData(["scripts", result.id], result);
                reader.cancel();

                const onPractice =
                  typeof window !== "undefined" &&
                  window.location.pathname === "/practice";
                if (onPractice) {
                  await new Promise((r) => setTimeout(r, 500));
                  router.push(`/practice/${result.id}`);
                } else {
                  // Wandered off — leave a dismissible "ready" banner instead.
                  setDoneInfo({ id: result.id, scenes: result.num_scenes_extracted });
                }
                return;
              } else if (event.type === "error") {
                throw new Error(event.detail || "Extraction failed");
              }
            } catch (parseErr) {
              const m = parseErr instanceof Error ? parseErr.message : "";
              if (m && !m.includes("JSON")) throw parseErr;
            }
          }
        }
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") {
          toast.info("Upload cancelled");
        } else {
          const message = err instanceof Error ? err.message : "Failed to upload script";
          console.error("Upload error:", err);
          toast.error(message);
        }
      } finally {
        abortControllerRef.current = null;
        setUploadingFile(false);
        setExpanded(false);
      }
    },
    [getToken, mutateScripts, queryClient, router],
  );

  const start = useCallback(
    async (file: File) => {
      if (isBusy) return;

      // Validation
      if (scripts.some((s) => s.original_filename === file.name)) {
        toast.error(
          "You already have a script with this filename. Delete it from your scripts first, or upload with a different name.",
        );
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "txt", "text"].includes(ext)) {
        toast.error("Only PDF and TXT files are supported");
        return;
      }
      const MAX_SIZE_MB = 15;
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`File too large (max ${MAX_SIZE_MB}MB)`);
        return;
      }

      // Small files: skip scan, go straight to extraction.
      if (file.size < 50_000) {
        await startExtraction(file, "full");
        return;
      }

      setScanning(true);
      try {
        const token = await getToken();
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
            setShowUpgradeModal(true);
            return;
          }
          throw new Error(typeof err.detail === "string" ? err.detail : "Scan failed");
        }

        const scan: ScanResult = await scanRes.json();
        setScanning(false);

        if (scan.show_mode_choice) {
          setPendingFile(file);
          setScanResult(scan);
          return;
        }
        await startExtraction(file, "full");
      } catch (err: unknown) {
        setScanning(false);
        const message = err instanceof Error ? err.message : "Failed to scan script";
        console.error("Scan error:", err);
        toast.error(message);
      }
    },
    [isBusy, scripts, getToken, startExtraction],
  );

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
  };

  const latestStep = progressSteps[progressSteps.length - 1]?.group ?? "Preparing…";
  const showBanner = scanning || uploadingFile || doneInfo !== null;

  return (
    <UploadContext.Provider value={{ isUploading: isBusy, phaseLabel, start }}>
      {children}

      {/* Persistent progress banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-1/2 -translate-x-1/2 z-[9990] w-[calc(100%-2rem)] max-w-md bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
            role="status"
            aria-live="polite"
          >
            <div className="rounded-lg border border-border bg-card shadow-lg shadow-black/20 overflow-hidden">
              {/* Expanded step list */}
              <AnimatePresence initial={false}>
                {expanded && uploadingFile && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-border/60"
                  >
                    <div
                      ref={progressScrollRef}
                      className="max-h-[40vh] overflow-y-auto scrollbar-thin px-4 py-3 space-y-0 border-l-2 border-border/60 ml-3"
                    >
                      {progressSteps.map((step, i) => {
                        const isLatest = i === progressSteps.length - 1 && !extractionDone;
                        const isCompleted = i < progressSteps.length - 1 || extractionDone;
                        return (
                          <div key={`${step.group}_${i}`} className="flex items-start gap-2.5 py-1.5">
                            <span className="mt-0.5">
                              {isCompleted ? (
                                <IconCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <IconLoader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                              )}
                            </span>
                            <span
                              className={`text-[13px] leading-snug ${isCompleted ? "text-muted-foreground/70" : "text-foreground"}`}
                            >
                              {step.group}
                              {isLatest && (
                                <motion.span
                                  animate={{ opacity: [0.2, 1, 0.2] }}
                                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                  className="text-muted-foreground"
                                >
                                  …
                                </motion.span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Compact bar */}
              <div className="flex items-center gap-3 px-4 py-3">
                {doneInfo ? (
                  <IconCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <IconLoader2 className="h-4 w-4 shrink-0 animate-spin text-[#CB4B00]" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {doneInfo
                      ? "Script ready"
                      : scanning
                        ? "Scanning script…"
                        : fileName || "Uploading…"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doneInfo
                      ? `Extracted ${doneInfo.scenes} scene${doneInfo.scenes !== 1 ? "s" : ""}`
                      : scanning
                        ? "Checking length and structure"
                        : latestStep}
                  </p>
                </div>

                {doneInfo ? (
                  <button
                    type="button"
                    onClick={() => {
                      const id = doneInfo.id;
                      setDoneInfo(null);
                      router.push(`/practice/${id}`);
                    }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[#CB4B00] hover:bg-[#B03000] text-white px-3 h-8 text-xs font-medium transition-colors"
                  >
                    View
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : uploadingFile ? (
                  <>
                    <button
                      type="button"
                      aria-label={expanded ? "Hide details" : "Show details"}
                      onClick={() => setExpanded((v) => !v)}
                      className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <IconChevronDown
                        className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => abortControllerRef.current?.abort()}
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <IconX className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode choice dialog */}
      <Dialog
        open={scanResult !== null}
        onOpenChange={(open) => {
          if (!open) dismissModeChoice();
        }}
      >
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif">
              How should we extract scenes?
            </DialogTitle>
          </DialogHeader>
          {scanResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found{" "}
                {scanResult.num_acts > 0 ? `${scanResult.num_acts} acts with ` : ""}
                {scanResult.num_sections} scenes in {scanResult.page_count} pages.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleModeChoice("quick")}
                  className="w-full text-left border border-border hover:border-primary/50 hover:shadow-md p-4 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <IconBolt className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-foreground">Quick Extract</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ~{formatTime(scanResult.estimated_quick_seconds)}
                    </span>
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
                      <IconBook className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-foreground">Full Extract</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ~{formatTime(scanResult.estimated_full_seconds)}
                    </span>
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

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        feature="Script uploads"
        message="Upload and manage scripts with a Plus or Pro plan. Upgrade to get started."
      />
    </UploadContext.Provider>
  );
}

export default UploadProvider;
