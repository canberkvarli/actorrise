"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconPlayerPlayFilled, IconPlayerStopFilled } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface PickerVoice {
  id: string;
  /** "Puck · upbeat, playful, 30s": the name, then what it sounds like. */
  label: string;
  gender: string;
  sample?: string | null;
}

/** The label's two halves. A label with no " · " is all name. */
export function splitLabel(label: string): { name: string; sound: string } {
  const at = label.indexOf(" · ");
  return at < 0 ? { name: label, sound: "" } : { name: label.slice(0, at), sound: label.slice(at + 3) };
}

/**
 * The voice for one partner part.
 *
 * This was a native <select>, and a native select can only show one line per
 * option, at the width of the pill: "Algenib · gravelly, weathered, 50s+" came
 * out as "Algenib · gravel…", which is the half that tells you anything. Here
 * the pill shows the name with as much of the sound as fits, and the list opens
 * wide, women and men apart, each voice on two lines and each with its own ▶,
 * so trying them does not mean choosing them first.
 */
export function VoicePicker({
  character,
  voices,
  value,
  onChange,
  sampleFor,
}: {
  character: string;
  voices: PickerVoice[];
  value: string | undefined;
  onChange: (voiceId: string) => void;
  sampleFor: (voice: PickerVoice) => string;
}) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  };
  // Closing the list, or leaving the page, ends a sample mid-sentence.
  const toggle = (next: boolean) => {
    if (!next) stop();
    setOpen(next);
  };
  useEffect(() => () => audioRef.current?.pause(), []);

  const play = (voice: PickerVoice) => {
    if (playing === voice.id) return stop();
    stop();
    const audio = new Audio(sampleFor(voice));
    audioRef.current = audio;
    setPlaying(voice.id);
    audio.onended = () => setPlaying((p) => (p === voice.id ? null : p));
    audio.play().catch(() => setPlaying(null));
  };

  const current = voices.find((v) => v.id === value);
  const { name, sound } = splitLabel(current?.label ?? value ?? "Choose a voice");
  const groups = [
    { title: "Women", list: voices.filter((v) => v.gender === "female") },
    { title: "Men", list: voices.filter((v) => v.gender === "male") },
    { title: "Other", list: voices.filter((v) => v.gender !== "female" && v.gender !== "male") },
  ].filter((g) => g.list.length);

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Voice for ${character}: ${current?.label ?? "none"}`} className="t-prev__voice t-prev__voicebtn">
          <span className="t-prev__voicename">{name}</span>
          {sound && <span className="t-prev__voicesound">{sound}</span>}
          <IconChevronDown className="t-prev__voicechev" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="t-voicelist w-[min(320px,calc(100vw-2rem))] p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="t-voicelist__head">Who reads {character}</p>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto">
          {groups.map((g) => (
            <div key={g.title} role="group" aria-label={g.title}>
              {groups.length > 1 && <p className="t-voicelist__group">{g.title}</p>}
              {g.list.map((voice) => {
                const parts = splitLabel(voice.label);
                const on = voice.id === value;
                return (
                  <div key={voice.id} className="t-voicelist__row" data-on={on}>
                    <button
                      type="button"
                      className="t-voicelist__pick"
                      aria-pressed={on}
                      onClick={() => {
                        onChange(voice.id);
                        toggle(false);
                      }}
                    >
                      <span className="t-voicelist__name">
                        {parts.name}
                        {on && <IconCheck className="h-3.5 w-3.5" aria-hidden />}
                      </span>
                      {parts.sound && <span className="t-voicelist__sound">{parts.sound}</span>}
                    </button>
                    <button
                      type="button"
                      className="t-voicelist__play"
                      data-on={playing === voice.id}
                      aria-label={playing === voice.id ? `Stop ${parts.name}` : `Hear ${parts.name}`}
                      onClick={() => play(voice)}
                    >
                      {playing === voice.id ? (
                        <IconPlayerStopFilled className="h-3 w-3" />
                      ) : (
                        <IconPlayerPlayFilled className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
