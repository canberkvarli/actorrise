"use client";

import { useRef, type ReactNode } from "react";
import { IconUpload, IconLoader2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { useUpload } from "@/components/practice/UploadProvider";

interface UploadScriptButtonProps {
  /** Visual variant. `primary` = large hero CTA (orange), `compact` = small inline button. */
  variant?: "primary" | "compact";
  /** Optional override for the button label. */
  children?: ReactNode;
  /** Extra classes for the trigger button. */
  className?: string;
}

/**
 * Thin upload trigger: a button + a hidden file input. All upload state and UI
 * (scan, mode dialog, streaming progress banner, upgrade modal) live in
 * <UploadProvider> at the platform-layout level, so the in-flight upload
 * survives in-app navigation and every trigger stays in sync.
 *
 * Used in:
 *  - /practice header, next to the greeting ("Upload script", compact)
 *  - <PracticeLibrary /> empty state ("Upload a script", primary)
 */
export function UploadScriptButton({
  variant = "compact",
  children,
  className,
}: UploadScriptButtonProps) {
  const { isUploading, phaseLabel, canUpload, start, openUpgrade } = useUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerPicker = () => {
    if (isUploading) return;
    // Over the plan's upload limit? Show the upgrade modal up front instead of
    // opening a file picker only to reject the upload after the fact.
    if (!canUpload) {
      openUpgrade();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset so the same file can be re-selected later
    if (file) await start(file);
  };

  const busyLabel = phaseLabel ?? "Uploading…";
  const isPrimary = variant === "primary";
  const iconSize = isPrimary ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
      />
      <Button
        size={isPrimary ? "lg" : "sm"}
        onClick={triggerPicker}
        disabled={isUploading}
        className={
          className ??
          (isPrimary
            ? "gap-2 h-11 px-5 font-medium bg-[#CB4B00] hover:bg-[#B03000] text-white border-[#CB4B00] hover:border-[#B03000]"
            : "gap-1.5 h-9 px-3 font-medium bg-[#CB4B00] hover:bg-[#B03000] text-white border-[#CB4B00] hover:border-[#B03000]")
        }
      >
        {isUploading ? (
          <>
            <IconLoader2 className={`${iconSize} animate-spin`} />
            {busyLabel}
          </>
        ) : (
          <>
            <IconUpload className={iconSize} />
            {children ?? (isPrimary ? "Upload your first script" : "Upload script")}
          </>
        )}
      </Button>
    </>
  );
}

export default UploadScriptButton;
