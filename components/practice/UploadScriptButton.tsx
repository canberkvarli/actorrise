"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  IconUpload,
  IconLoader2,
  IconCheck,
  IconBolt,
  IconBook,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
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

interface UploadScriptButtonProps {
  /** Visual variant. `primary` = large hero CTA (orange), `compact` = small inline button. */
  variant?: "primary" | "compact";
  /** Optional override for the button label. */
  children?: ReactNode;
  /** Extra classes for the trigger button. */
  className?: string;
}

/**
 * Self-contained upload trigger. Renders a button + a hidden file input + the
 * "Quick vs Full" mode-choice dialog + a fullscreen extraction-progress overlay.
 *
 * Used in:
 *  - <PracticeEmptyState /> ("Upload your first script")
 *  - <YourScriptsList /> ("+ Upload script")
 */
export function UploadScriptButton({
  variant = "compact",
  children,
  className,
}: UploadScriptButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: scripts = [] } = useScripts();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressScrollRef = useRef<HTMLDivElement | null>(null);

  const [scanning, setScanning] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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

  const [progressSteps, setProgressSteps] = useState<{ group: string; detail: string }[]>([]);
  const [extractionDone, setExtractionDone] = useState(false);

  const mutateScripts = () =>
    queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });

  const isProcessing = uploadingFile;

  // Auto-scroll progress steps to bottom as new ones arrive
  useEffect(() => {
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Block duplicate by filename
    if (scripts.some((s) => s.original_filename === file.name)) {
      toast.error(
        "You already have a script with this filename. Delete it from your scripts first, or upload with a different name."
      );
      event.target.value = "";
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "txt", "text"].includes(ext)) {
      toast.error("Only PDF and TXT files are supported");
      event.target.value = "";
      return;
    }

    const MAX_SIZE_MB = 15;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_SIZE_MB}MB)`);
      event.target.value = "";
      return;
    }

    // Small files: skip scan, go straight to extraction
    if (file.size < 50_000) {
      await startExtraction(file, "full");
      return;
    }

    setScanning(true);
    try {
      const {
        data: { session },
      } = await (await import("@/lib/supabase")).supabase.auth.getSession();
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
        throw new Error(
          typeof err.detail === "string" ? err.detail : "Scan failed"
        );
      }

      const scan = await scanRes.json();
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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      const {
        data: { session },
      } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Please sign in again to upload.");
        return;
      }

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
        const message =
          typeof detail === "string"
            ? detail
            : detail?.message || "Upload failed";
        throw new Error(message);
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
                `Script uploaded! Extracted ${result.num_scenes_extracted} scenes.`
              );
              mutateScripts();
              queryClient.setQueryData(["scripts", result.id], result);
              reader.cancel();
              await new Promise((r) => setTimeout(r, 800));
              router.push(`/practice/${result.id}`);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerPicker = () => {
    if (uploadingFile || scanning) return;
    fileInputRef.current?.click();
  };

  const renderTriggerButton = () => {
    if (variant === "primary") {
      return (
        <Button
          size="lg"
          onClick={triggerPicker}
          disabled={uploadingFile || scanning}
          className={
            className ??
            "gap-2 h-11 px-5 font-medium bg-[#CB4B00] hover:bg-[#B03000] text-white border-[#CB4B00] hover:border-[#B03000]"
          }
        >
          {uploadingFile || scanning ? (
            <>
              <IconLoader2 className="h-4 w-4 animate-spin" />
              {scanning ? "Scanning…" : "Uploading…"}
            </>
          ) : (
            <>
              <IconUpload className="h-4 w-4" />
              {children ?? "Upload your first script"}
            </>
          )}
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        onClick={triggerPicker}
        disabled={uploadingFile || scanning}
        className={
          className ??
          "gap-1.5 h-9 px-3 font-medium bg-[#CB4B00] hover:bg-[#B03000] text-white border-[#CB4B00] hover:border-[#B03000]"
        }
      >
        {uploadingFile || scanning ? (
          <>
            <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
            {scanning ? "Scanning…" : "Uploading…"}
          </>
        ) : (
          <>
            <IconUpload className="h-3.5 w-3.5" />
            {children ?? "Upload script"}
          </>
        )}
      </Button>
    );
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={handleFileChange}
        className="hidden"
        disabled={uploadingFile || scanning}
      />

      {renderTriggerButton()}

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
              <IconLoader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Scanning script...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extraction progress overlay */}
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
                {progressSteps.length > 6 && (
                  <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background/95 to-transparent z-10 pointer-events-none" />
                )}
                <div
                  ref={progressScrollRef}
                  className="border-l-2 border-border/80 pl-4 space-y-0 max-h-[50vh] overflow-y-auto scrollbar-thin"
                >
                  <AnimatePresence initial={false}>
                    {progressSteps.map((step, i) => {
                      const isLatest =
                        i === progressSteps.length - 1 && !extractionDone;
                      const isCompleted =
                        i < progressSteps.length - 1 || extractionDone;
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
                                  transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 20,
                                  }}
                                >
                                  <IconCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                </motion.div>
                              ) : (
                                <IconLoader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                              )}
                            </div>
                            <div>
                              <span
                                className={`text-[13px] leading-snug ${
                                  isCompleted
                                    ? "text-muted-foreground/70"
                                    : "text-foreground"
                                }`}
                              >
                                {step.group}
                                {isLatest && !showDetail && (
                                  <motion.span
                                    animate={{ opacity: [0.2, 1, 0.2] }}
                                    transition={{
                                      duration: 1.8,
                                      repeat: Infinity,
                                      ease: "easeInOut",
                                    }}
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
                                  className={`text-[11px] leading-snug mt-0.5 ${
                                    isCompleted
                                      ? "text-muted-foreground/70"
                                      : "text-muted-foreground/80"
                                  }`}
                                >
                                  {step.detail}
                                  {isLatest && (
                                    <motion.span
                                      animate={{ opacity: [0.2, 1, 0.2] }}
                                      transition={{
                                        duration: 1.8,
                                        repeat: Infinity,
                                        ease: "easeInOut",
                                      }}
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
                      <IconLoader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                      <span className="text-[13px] text-foreground">
                        Preparing...
                      </span>
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
                {scanResult.num_acts > 0
                  ? `${scanResult.num_acts} acts with `
                  : ""}
                {scanResult.num_sections} scenes in {scanResult.page_count}{" "}
                pages.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleModeChoice("quick")}
                  className="w-full text-left border border-border hover:border-primary/50 hover:shadow-md p-4 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <IconBolt className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-foreground">
                        Quick Extract
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ~{formatTime(scanResult.estimated_quick_seconds)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-snug">
                    Two-person scenes only. Fastest option, great for focused
                    rehearsal.
                  </p>
                </button>
                <button
                  onClick={() => handleModeChoice("full")}
                  className="w-full text-left border border-border hover:border-primary/50 hover:shadow-md p-4 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <IconBook className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-foreground">
                        Full Extract
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ~{formatTime(scanResult.estimated_full_seconds)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-snug">
                    All dialogue scenes (2+ characters). Full coverage of the
                    script.
                  </p>
                </button>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Both options use 1 upload from your quota. You can always
                re-upload later.
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
    </>
  );
}

export default UploadScriptButton;
