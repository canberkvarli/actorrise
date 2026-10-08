"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { directionsUrl, type Audition, type Travel } from "@/lib/auditions";
import { useAssist, useSaveTravel } from "@/hooks/useAuditions";
import { TripSketch } from "./TripSketch";

/** The one place the actor tells me where they leave from. Shown from the details column and here. */
export function LeavingFrom({ travel, onDone }: { travel: Travel | undefined; onDone?: () => void }) {
  const save = useSaveTravel();
  const [value, setValue] = useState(travel?.leaving_from ?? "");
  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ leaving_from: value.trim() || null }, {
          onSuccess: () => onDone?.(),
          onError: () => toast.error("That didn't save. Try again in a moment."),
        });
      }}
    >
      <label className="sr-only" htmlFor="aud-leaving">Where you leave from</label>
      <input
        id="aud-leaving"
        autoFocus
        className="aud-input w-full px-3 py-2 text-[15px]"
        placeholder="home, work, a street and a city"
        maxLength={300}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="flex items-center gap-3 text-[13.5px]">
        <button type="submit" disabled={save.isPending} className="aud-quiet-chip aud-focus px-3.5 py-1.5 font-semibold">
          {save.isPending ? "Saving" : "Save"}
        </button>
        {onDone && <button type="button" className="aud-link aud-cap-muted" onClick={onDone}>never mind</button>}
      </span>
      <span className="aud-cap-muted text-[12.5px]">Only you see it. I use it to plan the trip to each audition.</span>
    </form>
  );
}

/**
 * The trip, planned by Google and written up by me. Only for an in person
 * audition with an address, a time, and a starting point the actor gave me;
 * without those the page goes without this section (the details column still
 * has the plain directions link).
 */
export function GettingThere({ a, travel }: { a: Audition; travel: Travel | undefined }) {
  const assist = useAssist();
  const save = useSaveTravel();
  const [changing, setChanging] = useState(false);
  const origin = travel?.leaving_from;
  const mode = travel?.travel_mode ?? "transit";
  const ready = a.kind === "in_person" && !!a.location && !!a.starts_at && !!origin;

  // Once per set of inputs: the server hands back the saved trip when nothing changed.
  const asked = useRef<string | null>(null);
  const key = `${a.id}|${origin}|${mode}|${a.location}|${a.starts_at}`;
  useEffect(() => {
    if (!ready || asked.current === key) return;
    asked.current = key;
    assist.mutate({ id: a.id, part: "trip" });
  }, [ready, key, a.id, assist]);

  if (!ready) return null;
  const trip = a.assist.trip;
  const failed = !trip && (assist.isError || assist.isSuccess);

  return (
    <section id="aud-trip" aria-labelledby="aud-trip-h">
      <div className="aud-sec-head">
        <h2 id="aud-trip-h" className="aud-sec-title text-[26px]">Getting there</h2>
        <button type="button" className="aud-link aud-cap-muted text-[13px]" onClick={() => setChanging((v) => !v)}>
          {changing ? "close" : "leaving from somewhere else?"}
        </button>
      </div>
      {changing ? (
        <LeavingFrom travel={travel} onDone={() => setChanging(false)} />
      ) : (
        <div className="aud-card flex items-start gap-4 p-4 max-sm:flex-col">
          {trip && <TripSketch points={trip.points} from={trip.from_label} to={trip.to_label} />}
          <div className="min-w-0">
            {trip ? (
              <p className="aud-pencil text-[19px] leading-snug">{trip.line}</p>
            ) : failed ? (
              <p className="aud-pencil-muted text-[18px]">(I couldn&apos;t plan this one. Google Maps will.)</p>
            ) : (
              <p className="aud-pencil-muted aud-thinking text-[19px]" role="status">(working out your trip)</p>
            )}
            <p className="aud-cap-muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
              <a className="aud-link" href={trip?.maps_url ?? directionsUrl(a.location!)} target="_blank" rel="noreferrer">
                open in Google Maps
              </a>
              <button
                type="button"
                className="aud-link"
                disabled={save.isPending}
                onClick={() => save.mutate({ travel_mode: mode === "drive" ? "transit" : "drive" })}
              >
                {mode === "drive" ? "I'm taking transit" : "I'm driving"}
              </button>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
