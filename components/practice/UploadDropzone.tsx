"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { IconUpload, IconLoader2, IconArrowRight } from "@tabler/icons-react";
import { useUpload } from "@/components/practice/UploadProvider";

/**
 * The key CTA on /practice — a warm drag-and-drop zone to bring in sides and
 * start a rehearsal. Reuses the shared upload flow (scan → mode → progress) via
 * useUpload, so an in-flight upload survives navigation like the button does.
 */
export function UploadDropzone() {
  const { isUploading, phaseLabel, canUpload, start, openUpgrade } = useUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => {
    if (isUploading) return;
    if (!canUpload) return openUpgrade();
    inputRef.current?.click();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (isUploading) return;
    if (!canUpload) return openUpgrade();
    const file = e.dataTransfer.files?.[0];
    if (file) start(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`group relative overflow-hidden rounded-2xl border-2 border-dashed p-5 transition-all sm:p-6 ${
        dragging
          ? "border-primary bg-primary/[0.06] shadow-[0_0_40px_-12px_var(--primary)]"
          : "border-border/60 bg-card/30 hover:border-primary/50 hover:bg-primary/[0.03]"
      }`}
    >
      {/* warm wash from the top, like a light on the page */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-8 h-24 opacity-70"
        style={{ background: "radial-gradient(50% 100% at 50% 0%, rgba(203,75,0,0.10), transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <button
          type="button"
          onClick={pick}
          disabled={isUploading}
          aria-label="Upload a script"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#CB4B00] text-white shadow-[0_0_28px_-6px_var(--primary)] transition-transform group-hover:scale-105 disabled:opacity-70"
        >
          {isUploading ? (
            <IconLoader2 className="h-6 w-6 animate-spin" />
          ) : (
            <IconUpload className="h-6 w-6" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={pick}
            disabled={isUploading}
            className="text-lg font-semibold text-foreground hover:text-primary disabled:cursor-default"
          >
            {isUploading ? (phaseLabel ?? "Uploading your sides…") : "Upload your sides"}
          </button>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isUploading
              ? "Pulling out the scenes — hang tight."
              : "Drag a PDF here or click to browse. I'll pull out the scenes and rehearse them with you."}
          </p>
        </div>

        {!isUploading && (
          <Link
            href="/greenroom"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            No sides yet? Open a scene
            <IconArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) start(file);
        }}
        className="hidden"
        disabled={isUploading}
      />
    </div>
  );
}
