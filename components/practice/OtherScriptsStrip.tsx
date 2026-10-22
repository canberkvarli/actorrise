"use client";

import { getGenreInkColor, getGenreSpineColor } from "@/lib/genreColors";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import type { UserScript } from "@/hooks/useScripts";

interface OtherScriptsStripProps {
  /** The shelf in its order; the open one is left out here. */
  scripts: UserScript[];
  openId: number;
  onSelect: (id: number) => void;
}

/**
 * The shelf, while a script is open.
 *
 * The full shelf used to sit under the opened script at full height, so a play
 * with twenty scenes put the other scripts two screens down, and a play with
 * one put a second list on the page competing with the first. Open, the shelf
 * is a row of spines along the bottom: enough to jump to another script, and
 * nothing to manage. Reordering, deleting and flagging live on the full shelf,
 * one "back to the stage" away.
 */
export function OtherScriptsStrip({ scripts, openId, onSelect }: OtherScriptsStripProps) {
  const others = scripts.filter((s) => s.id !== openId);

  return (
    <nav aria-label="Other scripts" className="t-strip">
      <div className="t-strip__head">
        <h2 className="t-shelf-heading">On the shelf</h2>
        <span id="scenepartner-bring-in">
          <UploadScriptButton variant="compact" className="t-bring-in">
            Bring in a script
          </UploadScriptButton>
        </span>
      </div>
      {others.length > 0 && (
        <ul id="scenepartner-shelf" className="t-strip__list">
          {others.map((s) => (
            <li key={s.id} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className="t-strip__chip"
                style={{
                  ["--spine" as string]: getGenreSpineColor(s.genre),
                  ["--spine-ink" as string]: getGenreInkColor(s.genre),
                }}
              >
                <span aria-hidden className="t-strip__bind" />
                <span className="t-strip__title">{s.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

export default OtherScriptsStrip;
