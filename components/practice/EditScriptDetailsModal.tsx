"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SCRIPT_GENRES } from "@/lib/genreOptions";
import { cn } from "@/lib/utils";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { clothFor, emblemFor } from "@/components/monologue/PlayCover";
import { Glyph } from "@/components/brand/glyphs";
import api from "@/lib/api";
import { SCRIPTS_QUERY_KEY, type UserScript } from "@/hooks/useScripts";

interface EditScriptDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: UserScript;
}

/** A script can be more than one thing ("Comedy, Drama"), but not everything. */
const MAX_GENRES = 3;

/**
 * Edit a script's metadata: title, author, genres, synopsis.
 *
 * It was a stack of four grey shadcn fields under "Edit details" in the sans
 * face — a settings dialog, opened from a room set in Playfair on paper. What
 * an actor is actually doing here is re-binding their copy, so the card shows
 * the binding: the cover restitches itself live as the fields change, cloth
 * colour and emblem following the genre, the title set in the display face on
 * the spine. The same drawing the shelf uses, so you are editing the thing you
 * can see rather than four rows of metadata that happen to feed it.
 */
export function EditScriptDetailsModal({
  open,
  onOpenChange,
  script,
}: EditScriptDetailsModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(script.title ?? "");
  const [author, setAuthor] = useState(script.author ?? "");
  const [genres, setGenres] = useState<string[]>(
    script.genres?.length ? script.genres : script.genre ? [script.genre] : [],
  );
  const [description, setDescription] = useState(script.description ?? "");
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const genre = genres[0] ?? "";
  // The list, plus anything this script already carries that is not on it.
  const genreChoices = [...SCRIPT_GENRES, ...genres.filter((g) => !(SCRIPT_GENRES as readonly string[]).includes(g))];

  /** Tap order is rank: the first one picked is the main genre and sets the cloth. */
  const toggleGenre = (g: string) =>
    setGenres((cur) =>
      cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= MAX_GENRES ? cur : [...cur, g],
    );

  /** A fresh synopsis from the script itself. Fills the field; saving is still theirs. */
  const writeSynopsis = async () => {
    setWriting(true);
    try {
      const res = await api.post<{ synopsis: string }>(`/api/scripts/${script.id}/synopsis`);
      setDescription(res.data.synopsis);
    } catch {
      toast.error("Couldn't write one just now. Try again.");
    } finally {
      setWriting(false);
    }
  };
  const [touchedTitle, setTouchedTitle] = useState(false);

  const titleMissing = touchedTitle && !title.trim();

  /* The live binding. clothFor keys off the title and emblemFor off the genre,
     so both halves of the cover move while you type. */
  const shownTitle = title.trim() || script.title || "Untitled";
  const cloth = clothFor(shownTitle);
  const emblem = emblemFor({
    genre,
    category: undefined,
    themes: undefined,
    title: shownTitle,
    author,
  });

  const handleSave = async () => {
    if (!title.trim()) {
      setTouchedTitle(true);
      return;
    }
    const update = {
      title: title.trim(),
      author: author.trim(),
      genre,
      genres,
      description: description.trim(),
    };
    setSaving(true);
    try {
      await api.patch(`/api/scripts/${script.id}`, update);
      // Refresh both the detail (scenes panel header) and the list (rail).
      queryClient.setQueryData<UserScript>(["scripts", script.id], (prev) =>
        prev ? { ...prev, ...update } : prev,
      );
      queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
      toast.success("Rebound");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`t-formsheet theatre-tokens ${theatreFontVars} max-w-[560px] gap-0 border-0 p-0`}
      >
        <DialogTitle className="sr-only">Edit script details</DialogTitle>

        <div className="px-7 pb-6 pt-7 sm:px-8">
          <p className="t-formsheet__slug">(the binding.)</p>
          <h2 className="t-formsheet__title">Edit details</h2>

          <div className="mt-6 flex gap-6">
            {/* The cover, restitching itself. Hidden on a phone, where the
                fields need every pixel of the width. */}
            <div className="hidden shrink-0 sm:block">
              <div
                className="flex h-[150px] w-[104px] flex-col items-center justify-between rounded-[3px] px-2.5 py-3.5 text-center transition-colors duration-500"
                style={{
                  background: cloth.bg,
                  color: cloth.ink,
                  boxShadow: "5px 5px 0 var(--t-hard-shadow)",
                }}
              >
                <Glyph name={emblem} size={26} stroke={4} />
                <span
                  className="line-clamp-3 text-[13px] leading-[1.15]"
                  style={{ fontFamily: "var(--t-display)" }}
                >
                  {shownTitle}
                </span>
                <span
                  className="w-full truncate text-[8px] uppercase tracking-[0.14em] opacity-70"
                  style={{ fontFamily: "var(--t-direction)" }}
                >
                  {author.trim() || " "}
                </span>
              </div>
              <p
                className="mt-2 text-center text-[11px] italic"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
              >
                (on the shelf.)
              </p>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <label className="t-field__label" htmlFor="edit-script-title">
                  Title
                </label>
                <input
                  id="edit-script-title"
                  className="t-field__input"
                  data-invalid={titleMissing}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTouchedTitle(true)}
                  placeholder="A Midsummer Night's Dream"
                />
                {titleMissing && <p className="t-field__error">A script needs a name.</p>}
              </div>

              <div>
                <label className="t-field__label" htmlFor="edit-script-author">
                  Author <em>optional</em>
                </label>
                <input
                  id="edit-script-author"
                  className="t-field__input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="William Shakespeare"
                />
              </div>

              <div>
                <label className="t-field__label">
                  Genre <em>up to {MAX_GENRES}, the first sets the cloth</em>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {genreChoices.map((g) => {
                    const rank = genres.indexOf(g);
                    const on = rank >= 0;
                    const full = !on && genres.length >= MAX_GENRES;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGenre(g)}
                        disabled={full}
                        aria-pressed={on}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-current/20 opacity-80 hover:opacity-100",
                          full && "cursor-not-allowed opacity-35 hover:opacity-35",
                        )}
                      >
                        {g}
                        {on && genres.length > 1 && rank === 0 && (
                          <span className="ml-1 opacity-75">· main</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <label className="t-field__label" htmlFor="edit-script-synopsis">
                Synopsis <em>optional</em>
              </label>
              <button
                type="button"
                onClick={writeSynopsis}
                disabled={writing}
                className="text-[12.5px] text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary disabled:opacity-50"
              >
                {writing ? "Reading the script…" : description.trim() ? "Write it again" : "Write it for me"}
              </button>
            </div>
            <textarea
              id="edit-script-synopsis"
              className="t-field__area"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happens, in a sentence or two."
              rows={3}
            />
          </div>
        </div>

        <hr className="t-formsheet__rule" />

        <div className="flex items-center justify-end gap-2.5 px-7 py-4 sm:px-8">
          <button type="button" className="t-mem__ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className="t-mem__go" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditScriptDetailsModal;
