import { cn } from "@/lib/utils";
import { Monologue } from "@/types/actor";

type TextSegment = NonNullable<Monologue["text_segments"]>[number];

export interface MonologueTextRendererProps {
  text: string;
  segments?: TextSegment[] | null;
  className?: string;
}

export function MonologueTextRenderer({
  text,
  segments,
  className,
}: MonologueTextRendererProps) {
  if (!segments || segments.length === 0) {
    return (
      <p className={cn("whitespace-pre-wrap leading-relaxed", className)}>
        {text}
      </p>
    );
  }

  return (
    <div className={cn("space-y-4 leading-relaxed", className)}>
      {segments.map((seg, i) => {
        if (seg.type === "direction") {
          return (
            <p key={i} className="italic text-muted-foreground/70">
              {seg.text}
            </p>
          );
        }
        if (seg.type === "interjection") {
          return (
            <p key={i} className="text-muted-foreground">
              {seg.speaker && (
                <span className="not-italic font-semibold text-sm mr-1.5">
                  {seg.speaker}:
                </span>
              )}
              <span className="italic">{seg.text}</span>
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {seg.text}
          </p>
        );
      })}
    </div>
  );
}
