"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { MasksSketch } from "@/components/brand/sketches";
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

/**
 * Write a scene in by hand.
 *
 * The rebuild is mostly one idea: the card reads the dialogue WHILE you type
 * and shows you what it found.
 *
 * Before, you pasted a block of text into a grey textarea, pressed "Add
 * scene", and only then learned that the format was wrong — "A scene needs at
 * least 2 characters. Use CHARACTER: text format" — which is the app grading a
 * page you have already written. The rule was never visible while it mattered.
 * Now the cast list fills in under the box as each name is recognised, the
 * line count moves as you go, and the button says how many lines it is about
 * to add. Getting it wrong is something you see happening rather than
 * something you are told afterwards.
 *
 * The parse here must stay in step with the one in handleSubmit, so there is
 * exactly one of it: `readScene`.
 */

/** CHARACTER: line. The same pattern the submit check used, in one place. */
const CUE = /^([A-Za-z][A-Za-z\s'.\-]*?):\s*(.+)$/;

interface ReadScene {
  lines: number;
  cast: string[];
}

/** What the dialogue box currently contains, as the server will see it. */
function readScene(body: string): ReadScene {
  const rows = body.trim().split("\n").filter((l) => l.trim());
  const cast: string[] = [];
  let lines = 0;
  for (const row of rows) {
    const m = row.match(CUE);
    if (!m) continue;
    lines += 1;
    const name = m[1].trim();
    // Case-insensitive, but keep the spelling the actor typed first.
    if (!cast.some((c) => c.toLowerCase() === name.toLowerCase())) cast.push(name);
  }
  return { lines, cast };
}

const CURTAIN_LINES = [
  "Setting the stage…",
  "Cue the actors…",
  "Raising the curtain…",
  "Places, everyone…",
];

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
  const [curtain, setCurtain] = useState(CURTAIN_LINES[0]);
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const read = useMemo(() => readScene(body), [body]);
  /* A scene is two people talking. Said as a state of the thing being built,
     not as an error after the fact. */
  const ready = read.lines >= 2 && read.cast.length >= 2;

  useEffect(() => {
    if (!submitting) return;
    let i = 0;
    setCurtain(CURTAIN_LINES[0]);
    const interval = setInterval(() => {
      i = (i + 1) % CURTAIN_LINES.length;
      setCurtain(CURTAIN_LINES[i]);
    }, 1200);
    return () => clearInterval(interval);
  }, [submitting]);

  useEffect(() => {
    if (!open) return;
    if (defaultAct) setAct(defaultAct);
    else if (existingActs.length > 0) setAct(existingActs[0]);
    else setAct("__none__");
    setErrors({});
  }, [open, defaultAct, existingActs]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setCustomAct("");
    setSceneNumber("");
    setBody("");
    setErrors({});
  };

  const handleSubmit = async () => {
    const next: { title?: string; body?: string } = {};
    if (!title.trim()) next.title = "Give the scene a name.";
    if (!body.trim()) next.body = "There's nothing to rehearse yet.";
    else if (read.lines < 2) next.body = "Two lines at least — it takes two to play it.";
    else if (read.cast.length < 2) next.body = "Only one voice so far. Who are they talking to?";

    if (Object.keys(next).length > 0) {
      setErrors(next);
      (next.title ? titleRef.current : bodyRef.current)?.focus();
      return;
    }
    setErrors({});

    const resolvedAct =
      act === "__new__" ? customAct.trim() : act === "__none__" ? undefined : act;

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
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (error instanceof Error ? error.message : null);
      toast.error(typeof detail === "string" ? detail : "Couldn't add that scene");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className={`t-sheet theatre-tokens ${theatreFontVars} max-w-[620px] gap-0 border-0 p-0`}
      >
        <DialogTitle className="sr-only">Add a scene</DialogTitle>

        {/* The curtain, while it is being filed. */}
        <AnimatePresence>
          {submitting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[10px]"
              style={{ background: "color-mix(in oklab, var(--t-paper) 88%, transparent)" }}
            >
              <span style={{ color: "var(--t-gel-ink)" }}>
                <MasksSketch size={56} />
              </span>
              <AnimatePresence mode="wait">
                <motion.p
                  key={curtain}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="m-0 mt-4 text-[13px] italic tracking-[0.06em]"
                  style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark)" }}
                >
                  {curtain}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-h-[68vh] overflow-y-auto px-7 pb-5 pt-7 sm:px-8">
          <p className="t-sheet__slug">(written in by hand.)</p>
          <h2 className="t-sheet__title">Add a scene</h2>

          <div className="mt-6 space-y-4">
            <div>
              <label className="t-field__label" htmlFor="add-scene-title">
                What&apos;s the scene?
              </label>
              <input
                ref={titleRef}
                id="add-scene-title"
                className="t-field__input"
                data-invalid={!!errors.title}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
                }}
                placeholder="The confrontation"
                maxLength={200}
                autoFocus
              />
              {errors.title && <p className="t-field__error">{errors.title}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="t-field__label">
                  Act {existingActs.length === 0 && <em>optional</em>}
                </label>
                {existingActs.length > 0 ? (
                  <Select value={act} onValueChange={setAct}>
                    <SelectTrigger className="t-field__input h-auto">
                      <SelectValue placeholder="Which act" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      <SelectItem value="__none__">No act</SelectItem>
                      {existingActs.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">A new act…</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    className="t-field__input"
                    value={customAct}
                    onChange={(e) => setCustomAct(e.target.value)}
                    placeholder="Act 2"
                    maxLength={100}
                  />
                )}
                {act === "__new__" && (
                  <input
                    className="t-field__input mt-2"
                    value={customAct}
                    onChange={(e) => setCustomAct(e.target.value)}
                    placeholder="Act 3"
                    maxLength={100}
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className="t-field__label">
                  Scene <em>optional</em>
                </label>
                <input
                  className="t-field__input"
                  value={sceneNumber}
                  onChange={(e) => setSceneNumber(e.target.value)}
                  placeholder="Scene 2"
                  maxLength={50}
                />
              </div>
            </div>

            <div>
              <label className="t-field__label" htmlFor="add-scene-desc">
                What happens <em>optional</em>
              </label>
              <input
                id="add-scene-desc"
                className="t-field__input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="They finally say it out loud."
                maxLength={500}
              />
            </div>

            <div>
              <label className="t-field__label" htmlFor="add-scene-body">
                The dialogue
              </label>
              <p
                className="m-0 mb-2 text-[12px]"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
              >
                One line each, the way a script sets it:{" "}
                <span style={{ color: "var(--t-text)", fontWeight: 700 }}>NAME: the line</span>
              </p>
              <textarea
                ref={bodyRef}
                id="add-scene-body"
                className="t-field__area"
                data-invalid={!!errors.body}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (errors.body) setErrors((p) => ({ ...p, body: undefined }));
                }}
                placeholder={
                  "QUINCE: Is all our company here?\nBOTTOM: You were best to call them generally, man by man.\nQUINCE: Here is the scroll of every man's name."
                }
                rows={7}
              />
              {errors.body && <p className="t-field__error">{errors.body}</p>}

              {/* The read-back. This is the whole point of the rebuild: what
                  the app has understood, while there is still time to change
                  it. Silent on an empty box — an empty cast list under an
                  empty field is just noise. */}
              <AnimatePresence initial={false}>
                {body.trim().length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div
                      className="mt-3 rounded-xl border-[1.5px] px-4 py-3"
                      style={{
                        borderColor: ready ? "var(--t-gel-ink)" : "var(--t-line-light)",
                        background: "var(--t-paper-2)",
                      }}
                    >
                      <p
                        className="m-0 text-[11px] uppercase tracking-[0.14em]"
                        style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
                      >
                        {read.cast.length === 0
                          ? "nobody yet"
                          : `in this scene · ${read.lines} line${read.lines === 1 ? "" : "s"}`}
                      </p>

                      {read.cast.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <AnimatePresence initial={false}>
                            {read.cast.map((name) => (
                              <motion.span
                                key={name.toLowerCase()}
                                layout
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                className="inline-flex items-center rounded-full border-[1.5px] px-3 py-1 text-[12px] font-bold uppercase tracking-[0.1em]"
                                style={{
                                  fontFamily: "var(--t-direction)",
                                  borderColor: "var(--t-text)",
                                  color: "var(--t-text)",
                                }}
                              >
                                {name}
                              </motion.span>
                            ))}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <p
                          className="m-0 mt-2 text-[13px]"
                          style={{ color: "var(--t-muted-dark)" }}
                        >
                          I can&apos;t see a name yet. Put the character before a colon and
                          I&apos;ll pick them up.
                        </p>
                      )}

                      {read.cast.length === 1 && (
                        <p
                          className="m-0 mt-2.5 text-[13px]"
                          style={{ color: "var(--t-muted-dark)" }}
                        >
                          One voice so far. A scene needs someone to play against.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <hr className="t-sheet__rule" />

        <div className="flex items-center justify-between gap-3 px-7 py-4 sm:px-8">
          <p
            className="m-0 text-[12px] italic"
            style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
          >
            {ready
              ? `(${read.cast.length} in it, ${read.lines} lines.)`
              : "(two people, two lines.)"}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="t-mem__ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="t-mem__go"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Adding…" : ready ? `Add ${read.lines} lines` : "Add scene"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddSceneToScriptModal;
