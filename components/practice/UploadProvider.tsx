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
import { UploadStage } from "@/components/practice/UploadStage";
import { ScenePicker, type ScannedScene } from "@/components/practice/ScenePicker";
import { API_URL } from "@/lib/api";
import { clearPending, loadPending, savePending } from "@/lib/pending-upload";
import { SCRIPTS_QUERY_KEY, useScripts } from "@/hooks/useScripts";
import { useSubscription, useUsageLimits } from "@/hooks/useSubscription";

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
  { match: "Set aside", label: "Assembling your rehearsal scenes" },
  { match: "Folded", label: "Assembling your rehearsal scenes" },
  { match: "No title page", label: "Naming the script" },
  { match: "Figuring", label: "Figuring out the tone, emotions, dynamics" },
  { match: "Analyzed", label: "Figuring out the tone, emotions, dynamics" },
  { match: "Extracting", label: "Pulling every line of dialogue" },
  { match: "Extracted", label: "Assembling your rehearsal scenes" },
  { match: "Cleaning", label: "Cleaning up dialogue" },
  { match: "AI cleanup", label: "Cleaning up dialogue" },
  { match: "rehearsal-ready", label: "Assembling your rehearsal scenes" },
];

/**
 * Past this, waiting on the screen is the wrong shape. Hand the script over and
 * let it be read on the server: the streaming upload dies with the connection,
 * so a refresh used to throw minutes of work away.
 */
const BACKGROUND_AFTER_SECONDS = 45;

function groupLabel(raw: string): string {
  for (const g of STEP_GROUPS) {
    if (raw.startsWith(g.match)) return g.label;
  }
  return raw;
}


type ScanResult = {
  page_count: number;
  has_structure: boolean;
  num_acts: number;
  num_sections: number;
  show_mode_choice: boolean;
  estimated_quick_seconds: number;
  estimated_full_seconds: number;
  /** Every scene in the file. Absent from older backends. */
  scenes?: ScannedScene[];
};

/**
 * How many scenes a plan builds at a time.
 *
 * Mirrored on the client so the picker can show the limit while you are picking.
 * The server gate is still the authority — this only decides what the UI offers.
 */
const SCENE_ALLOWANCE: Record<string, number | null> = {
  free: 1,
  solo: 10,
  plus: 40,
  pro: null,
};

/** Below this there is nothing to choose between, so we do not ask. */
const PICKER_MIN_SCENES = 2;

interface UploadContextValue {
  /** True while scanning, awaiting a mode choice, or extracting. Triggers should disable. */
  isUploading: boolean;
  /** Human label for the current phase ("Scanning…" / "Uploading…") or null. */
  phaseLabel: string | null;
  /** False when the user has hit their plan's script-upload limit. */
  canUpload: boolean;
  /** Validate + scan + extract a picked file. Safe to call from any trigger. */
  start: (file: File) => Promise<void>;
  /** Open the upgrade modal directly (used when canUpload is false). */
  openUpgrade: () => void;
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
  const { usage } = useUsageLimits();
  const { subscription } = useSubscription();

  // Unknown tier reads as free: offering a picker that promises more than the
  // server will build is worse than offering less and being right.
  const sceneLimit =
    SCENE_ALLOWANCE[subscription?.tier_name ?? "free"] ?? SCENE_ALLOWANCE.free;

  // Can the user upload another script? Unknown (still loading) defaults to true
  // so we never block on a slow request — the backend gate is the backstop.
  const canUpload =
    !usage || usage.scripts_limit === -1 || usage.scripts_used < usage.scripts_limit;

  const abortControllerRef = useRef<AbortController | null>(null);
  /** Set once a script is being read server-side, where aborting a fetch does nothing. */
  const cancelBackgroundRef = useRef<(() => Promise<void>) | null>(null);

  /** Whatever "stop this" means at the point it is pressed. */
  const cancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    const stopServer = cancelBackgroundRef.current;
    cancelBackgroundRef.current = null;
    void stopServer?.();
  }, []);
  const progressScrollRef = useRef<HTMLDivElement | null>(null);

  const [scanning, setScanning] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  /** The upgrade modal was opened from the picker, so closing it goes back there. */
  const [upgradeReturnsToPicker, setUpgradeReturnsToPicker] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** A scanned script waiting to be picked from, offered back rather than lost. */
  const [resumable, setResumable] = useState<{ file: File; scan: ScanResult } | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [progressSteps, setProgressSteps] = useState<{ group: string; detail: string }[]>([]);
  const [extractionDone, setExtractionDone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The stage holds the screen; minimising drops it to the bottom bar so a long
  // extraction never blocks the app.
  const [minimized, setMinimized] = useState(false);
  const [doneInfo, setDoneInfo] = useState<{ id: number; scenes: number } | null>(null);

  const isBusy = scanning || uploadingFile || scanResult !== null;
  const phaseLabel = scanning ? "Scanning…" : uploadingFile ? "Uploading…" : null;

  const mutateScripts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY }),
    [queryClient],
  );

  const openUpgrade = useCallback(() => setShowUpgradeModal(true), []);

  /**
   * Pick up a script that was scanned but never built.
   *
   * This is the return leg from Stripe. Upgrading is a full page navigation, so
   * nothing in React state survives it — you would come back a subscriber with
   * a bigger allowance and no map to spend it on. The scan is on the device, so
   * it comes back with you.
   *
   * Offered, not forced: no modal opens by itself on a page you navigated to for
   * some other reason.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadPending<ScanResult>();
      if (cancelled || !saved) return;
      setResumable({ file: saved.file, scan: saved.scan });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Auto-clear the "done" banner after a few seconds. The stage holds longer —
  // it is the payoff, and dismissing it out from under someone reads as a bug.
  useEffect(() => {
    if (!doneInfo) return;
    const t = setTimeout(() => setDoneInfo(null), minimized ? 6000 : 12000);
    return () => clearTimeout(t);
  }, [doneInfo, minimized]);

  // Escape drops the stage without cancelling the extraction behind it.
  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMinimized(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minimized]);

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
      setMinimized(false);

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
                  router.push(`/practice?script=${result.id}`);
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

  const startBackground = useCallback(
    async (file: File, mode: "quick" | "full", picks?: ScannedScene[]) => {
      setUploadingFile(true);
      setFileName(file.name);
      setProgressSteps([{ group: "Taking your script", detail: "Taking your script" }]);
      setExtractionDone(false);
      setDoneInfo(null);
      setMinimized(false);

      // Cancel has to work on this path too, and it never did: the button is
      // wired to abortControllerRef, which only startExtraction ever set. So on
      // exactly the scripts long enough to want cancelling — the ones routed
      // here because they take minutes — pressing it did nothing at all.
      // Aborting this fetch is only half of it; the server keeps reading after
      // the request returns, so cancelBackgroundRef below tells it to stop.
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const token = await getToken();
        if (!token) throw new Error("Please sign in again to upload.");

        const form = new FormData();
        form.append("file", file);
        form.append("mode", mode);
        if (picks?.length) form.append("scenes", JSON.stringify(picks));
        const res = await fetch(`${API_URL}/api/scripts/upload-background`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.detail?.error === "feature_not_available") {
            setShowUpgradeModal(true);
            return;
          }
          throw new Error(typeof err.detail === "string" ? err.detail : "Upload failed");
        }

        const script = await res.json();

        // From here the reading happens on the server, past the end of this
        // request. Cancel now means telling it to stop, not dropping a
        // connection nobody is holding.
        cancelBackgroundRef.current = async () => {
          try {
            const t = await getToken();
            await fetch(`${API_URL}/api/scripts/${script.id}/cancel-extraction`, {
              method: "POST",
              headers: { Authorization: `Bearer ${t}` },
            });
            await queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
            toast.info("Stopped reading it. Nothing was saved.");
          } catch {
            toast.error("Could not stop it. Delete the script from your shelf instead.");
          }
        };

        await queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
        toast.success("Reading your script. Carry on — it'll be waiting on your shelf.");
        router.push(`/practice?script=${script.id}`);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          toast.info("Upload cancelled");
        } else {
          toast.error(e instanceof Error ? e.message : "Upload failed");
        }
      } finally {
        abortControllerRef.current = null;
        setUploadingFile(false);
        setProgressSteps([]);
      }
    },
    [getToken, queryClient, router],
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

        // A side has one scene. There is nothing to choose between, so we do not
        // stand a dialog in front of the thing they already asked for.
        if ((scan.scenes?.length ?? 0) >= PICKER_MIN_SCENES) {
          // Keep the file and the map on the device before showing the picker.
          // Closing it, reloading, or leaving for Stripe must not cost the
          // upload — the scan already happened, and asking for the same file
          // twice is asking someone to pay for our forgetfulness.
          void savePending(file, scan);
          setPendingFile(file);
          setScanResult(scan);
          return;
        }
        if (scan.estimated_full_seconds > BACKGROUND_AFTER_SECONDS) {
          await startBackground(file, "full");
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
    [isBusy, scripts, getToken, startExtraction, startBackground],
  );

  /**
   * Build the scenes that were ticked.
   *
   * Always the background path. Reading is minutes on anything with a picker in
   * front of it, and the streaming upload dies with the connection — a refresh
   * would throw the work away after they had just chosen it.
   */
  const handleScenePick = async (picks: ScannedScene[]) => {
    const file = pendingFile;
    setScanResult(null);
    setPendingFile(null);
    if (!file || picks.length === 0) return;
    // Chosen and building: the pending copy has done its job.
    void clearPending();
    await startBackground(file, "full", picks);
  };

  /**
   * Close the picker without losing the script.
   *
   * The map stays on the device, and `resumable` below offers it back. Closing a
   * dialog is not a decision to throw the upload away — most of the time it is
   * "not right now", and the only way to undo it used to be uploading the same
   * file again.
   */
  const dismissModeChoice = () => {
    if (scanResult && pendingFile) {
      setResumable({ file: pendingFile, scan: scanResult });
    }
    setScanResult(null);
    setPendingFile(null);
  };

  /** Give up on it properly, and stop offering it back. */
  const discardPending = () => {
    setResumable(null);
    setScanResult(null);
    setPendingFile(null);
    void clearPending();
  };

  const resumePicking = () => {
    if (!resumable) return;
    setPendingFile(resumable.file);
    setScanResult(resumable.scan);
    setResumable(null);
  };

  const latestStep = progressSteps[progressSteps.length - 1]?.group ?? "Preparing…";
  const showBanner = scanning || uploadingFile || doneInfo !== null;

  return (
    <UploadContext.Provider value={{ isUploading: isBusy, phaseLabel, canUpload, start, openUpgrade }}>
      {children}

      {/* Centre stage while the script is being read */}
      <AnimatePresence>
        {showBanner && !minimized && (
          <UploadStage
            key="upload-stage"
            scanning={scanning}
            fileName={fileName}
            steps={progressSteps}
            extractionDone={extractionDone}
            doneInfo={doneInfo}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            onCancel={cancelUpload}
            onView={() => {
              const id = doneInfo!.id;
              setDoneInfo(null);
              router.push(`/practice?script=${id}`);
            }}
            onMinimize={() => setMinimized(true)}
          />
        )}
      </AnimatePresence>

      {/* Minimised: the same job, out of the way */}
      <AnimatePresence>
        {showBanner && minimized && (
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
                  <IconLoader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                )}

                <button
                  type="button"
                  onClick={() => setMinimized(false)}
                  aria-label="Back to the full view"
                  className="min-w-0 flex-1 text-left"
                >
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
                </button>

                {doneInfo ? (
                  <button
                    type="button"
                    onClick={() => {
                      const id = doneInfo.id;
                      setDoneInfo(null);
                      router.push(`/practice?script=${id}`);
                    }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 h-8 text-xs font-medium transition-colors"
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
                      onClick={cancelUpload}
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

      {/* A script that was scanned but never built. Sits out of the way until
          it is wanted — including after a trip through Stripe, which is a full
          page load and takes every bit of React state with it. */}
      <AnimatePresence>
        {resumable && !isBusy && !showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-1/2 z-[9985] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
          >
            <div className="flex items-center gap-3 rounded-lg border border-paper-rule bg-paper px-4 py-3 shadow-lg shadow-black/10">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-typewriter text-[13px] text-paper-ink">
                  {resumable.file.name.replace(/\.[^.]+$/, "")}
                </span>
                <span className="block text-[12px] text-paper-muted">
                  {resumable.scan.scenes?.length ?? 0} scenes, none built yet
                </span>
              </span>
              <button
                type="button"
                onClick={resumePicking}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:brightness-110"
              >
                Choose scenes
              </button>
              <button
                type="button"
                onClick={discardPending}
                aria-label="Discard this script"
                className="shrink-0 rounded p-1 text-paper-muted transition-colors hover:text-paper-ink"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pick what to build.
          This replaced a two-option dialog that asked how hard to work — "quick"
          or "full" — rather than what the actor wanted. Nobody rehearses all of
          Hamlet; they want the nunnery scene. */}
      <Dialog
        open={scanResult !== null}
        onOpenChange={(open) => {
          if (!open) dismissModeChoice();
        }}
      >
        <DialogContent className="w-full max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Choose which scenes to build</DialogTitle>
          </DialogHeader>
          {scanResult?.scenes && (
            <ScenePicker
              scenes={scanResult.scenes}
              pageCount={scanResult.page_count}
              fileName={pendingFile?.name ?? fileName}
              limit={sceneLimit}
              onConfirm={handleScenePick}
              onCancel={dismissModeChoice}
              onUpgrade={() => {
                // Park the picker, don't destroy it. Whether they subscribe or
                // change their mind, the map is what they come back to — and if
                // they subscribe, they come back with a bigger allowance and the
                // picker reopens already knowing it.
                setUpgradeReturnsToPicker(true);
                dismissModeChoice();
                setShowUpgradeModal(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={(open) => {
          setShowUpgradeModal(open);
          // Closed the upgrade modal without leaving the page — "maybe later".
          // Go straight back to the scenes, not to an empty screen.
          if (!open && upgradeReturnsToPicker) {
            setUpgradeReturnsToPicker(false);
            resumePicking();
          }
        }}
        feature="Script uploads"
        message="Upload and manage scripts with a Plus or Pro plan. Upgrade to get started."
      />
    </UploadContext.Provider>
  );
}

export default UploadProvider;
