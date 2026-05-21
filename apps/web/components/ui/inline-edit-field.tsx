"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface InlineEditFieldProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  inputClassName?: string;
  displayClassName?: string;
  renderDisplay?: (value: string, startEdit: () => void) => React.ReactNode;
  renderEdit?: (
    value: string,
    onChange: (v: string) => void,
    save: () => void,
    cancel: () => void,
    saving: boolean
  ) => React.ReactNode;
}

export function InlineEditField({
  value,
  onSave,
  multiline = false,
  className,
  placeholder,
  inputClassName,
  displayClassName,
  renderDisplay,
  renderEdit,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);

  // Update editValue when value prop changes
  React.useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const startEdit = () => {
    setEditValue(value);
    setIsEditing(true);
  };

  const cancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const save = async () => {
    if (editValue.trim() === value.trim()) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(editValue.trim());
      setIsEditing(false);
      toast.success("Saved");
    } catch (error) {
      toast.error("Failed to save");
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !multiline) {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  // Calculate min-height to prevent layout shift
  const minHeight = multiline ? "min-h-[80px]" : "min-h-[40px]";

  return (
    <div className={cn(minHeight, "relative", className)}>
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {renderEdit ? (
              renderEdit(editValue, setEditValue, save, cancel, saving)
            ) : (
              <div className="space-y-2">
                {multiline ? (
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={cn("resize-none", inputClassName)}
                    rows={3}
                    autoFocus
                    disabled={saving}
                  />
                ) : (
                  <div className="relative">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={placeholder}
                      className={cn("pr-20", inputClassName)}
                      autoFocus
                      disabled={saving}
                    />
                    {/* Overlay buttons - absolute positioned, no layout shift */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={save}
                        disabled={saving}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={cancel}
                        disabled={saving}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
                {multiline && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={save} disabled={saving}>
                      <Check className="w-3 h-3 mr-1.5" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
                      <X className="w-3 h-3 mr-1.5" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="display"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {renderDisplay ? (
              renderDisplay(value, startEdit)
            ) : (
              <button
                onClick={startEdit}
                className={cn(
                  "w-full text-left p-2 rounded hover:bg-muted/50 transition-colors",
                  displayClassName
                )}
              >
                {value || <span className="text-muted-foreground italic">Click to edit</span>}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
