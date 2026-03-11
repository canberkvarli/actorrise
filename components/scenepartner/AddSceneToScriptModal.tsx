"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface AddSceneToScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scriptId: number;
  existingActs: string[];
  defaultAct?: string | null;
  onSceneAdded: () => void;
}

/** Inline field error with shake animation. Uses min-height so it doesn't shift layout. */
function FieldError({ message }: { message?: string }) {
  return (
    <div className="h-4 mt-0.5">
      {message && (
        <p className="text-xs text-destructive animate-[shake_0.3s_ease-in-out]">
          {message}
        </p>
      )}
    </div>
  );
}

export function AddSceneToScriptModal({
  open,
  onOpenChange,
  scriptId,
  existingActs,
  defaultAct,
  onSceneAdded,
}: AddSceneToScriptModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [act, setAct] = useState("__none__");
  const [customAct, setCustomAct] = useState("");
  const [sceneNumber, setSceneNumber] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittingText, setSubmittingText] = useState("Adding scene...");
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const WHIMSICAL_TEXTS = [
    "Adding scene...",
    "Setting the stage...",
    "Cue the actors...",
    "Raising the curtain...",
    "Places, everyone...",
  ];

  useEffect(() => {
    if (!submitting) return;
    let i = 0;
    setSubmittingText(WHIMSICAL_TEXTS[0]);
    const interval = setInterval(() => {
      i = (i + 1) % WHIMSICAL_TEXTS.length;
      setSubmittingText(WHIMSICAL_TEXTS[i]);
    }, 1200);
    return () => clearInterval(interval);
  }, [submitting]);

  useEffect(() => {
    if (open) {
      if (defaultAct) {
        setAct(defaultAct);
      } else if (existingActs.length > 0) {
        setAct(existingActs[0]);
      } else {
        setAct("__none__");
      }
      setErrors({});
    }
  }, [open, defaultAct, existingActs]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setCustomAct("");
    setSceneNumber("");
    setBody("");
    setErrors({});
  };

  const shake = (el: HTMLElement | null) => {
    if (!el) return;
    el.classList.remove("animate-[shake_0.3s_ease-in-out]");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("animate-[shake_0.3s_ease-in-out]");
  };

  const handleSubmit = async () => {
    const newErrors: { title?: string; body?: string } = {};

    if (!title.trim()) {
      newErrors.title = "Scene title is required";
    }

    const lines = body.trim().split("\n").filter(l => l.trim());
    if (!body.trim()) {
      newErrors.body = "Dialogue is required";
    } else if (lines.length < 2) {
      newErrors.body = "Enter at least 2 lines of dialogue";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (newErrors.title) shake(titleRef.current);
      else if (newErrors.body) shake(bodyRef.current);
      return;
    }

    setErrors({});

    const resolvedAct =
      act === "__new__" ? customAct.trim() :
      act === "__none__" ? undefined :
      act;

    setSubmitting(true);
    try {
      await api.post(`/api/scripts/${scriptId}/scenes`, {
        title: title.trim(),
        description: description.trim() || undefined,
        act: resolvedAct || undefined,
        scene_number: sceneNumber.trim() || undefined,
        body: body.trim(),
      });

      toast.success("Scene added");
      reset();
      onOpenChange(false);
      onSceneAdded();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error.message || "Failed to add scene";
      toast.error(typeof msg === "string" ? msg : "Failed to add scene");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Add Scene</DialogTitle>
        </DialogHeader>

        <style jsx global>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-4px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-3px); }
            80% { transform: translateX(2px); }
          }
        `}</style>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <Label htmlFor="add-scene-title">Scene title</Label>
            <Input
              ref={titleRef}
              id="add-scene-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors(prev => ({ ...prev, title: undefined })); }}
              placeholder="e.g. The Confrontation"
              maxLength={200}
              autoFocus
              className={errors.title ? "border-destructive" : ""}
            />
            <FieldError message={errors.title} />
          </div>

          {/* Act + Scene number row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Act{existingActs.length === 0 && <span className="text-muted-foreground/60 font-normal"> (optional)</span>}</Label>
              {existingActs.length > 0 ? (
                <Select value={act} onValueChange={setAct}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select act" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="__none__">None</SelectItem>
                    {existingActs.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                    <SelectItem value="__new__">New act...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={customAct}
                  onChange={(e) => setCustomAct(e.target.value)}
                  placeholder="e.g. Act 2"
                  maxLength={100}
                />
              )}
              {act === "__new__" && (
                <Input
                  value={customAct}
                  onChange={(e) => setCustomAct(e.target.value)}
                  placeholder="e.g. Act 3"
                  maxLength={100}
                  className="mt-1.5"
                  autoFocus
                />
              )}
            </div>
            <div>
              <Label>Scene number <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
              <Input
                value={sceneNumber}
                onChange={(e) => setSceneNumber(e.target.value)}
                placeholder="e.g. Scene 2"
                maxLength={50}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>Description <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief scene summary"
              maxLength={500}
            />
          </div>

          {/* Dialogue */}
          <div>
            <Label htmlFor="add-scene-body">Dialogue</Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              One line per row: <span className="font-mono text-foreground/70">CHARACTER: dialogue text</span>
            </p>
            <Textarea
              ref={bodyRef}
              id="add-scene-body"
              value={body}
              onChange={(e) => { setBody(e.target.value); if (errors.body) setErrors(prev => ({ ...prev, body: undefined })); }}
              placeholder={`HAMLET: To be or not to be, that is the question.\nHORATIO: My lord, I came to see your father's funeral.\nHAMLET: I pray thee, do not mock me, fellow student.`}
              rows={8}
              className={`font-mono text-sm leading-relaxed resize-y ${errors.body ? "border-destructive" : ""}`}
            />
            <FieldError message={errors.body} />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {submittingText}
                </>
              ) : (
                "Add scene"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
