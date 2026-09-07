"use client";

import Image from "next/image";
import { motion } from "framer-motion";

import { PlayCover } from "@/components/monologue/PlayCover";
import { posterAt } from "@/lib/poster";
import { leadName } from "@/lib/collectionMeta";
import { cn } from "@/lib/utils";
import type { Monologue } from "@/types/actor";

/**
 * Everything else you have saved.
 *
 * Selects rather than navigates: tapping a cover moves that piece onto the
 * bench above, so the bench stays the only place work is started and the
 * shelf is only ever the answer to "not that one, this one".
 *
 * Renders nothing at a collection of one, which is 46% of actors — they get
 * the bench and nothing else, which is the correct screen for owning one
 * piece. It holds up at 17, the largest collection in the product.
 */
export function Shelf({
  items,
  selectedId,
  onSelect,
}: {
  items: Monologue[];
  selectedId: number;
  onSelect: (m: Monologue) => void;
}) {
  const rest = items.filter((m) => m.id !== selectedId);
  if (rest.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="stage-direction text-sm text-muted-foreground/70">
        {rest.length === 1 ? "(one more on the shelf.)" : "(also on the shelf.)"}
      </h2>

      {/* Scrolls rather than wraps. A collection is a row of spines you run
          your eye along; a grid of two items with a gap where a third would go
          reads as a page that failed to fill. */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex gap-4 sm:gap-5">
          {rest.map((m, i) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: Math.min(0.25 + i * 0.05, 0.6),
                ease: [0.22, 1, 0.36, 1],
              }}
              className="w-[104px] shrink-0 sm:w-[124px]"
            >
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="group block w-full text-left"
              >
                <ShelfCover monologue={m} />
                <p className="mt-2 line-clamp-2 font-typewriter text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                  {leadName(m)}
                </p>
                <p className="line-clamp-1 font-typewriter text-[11px] text-muted-foreground">
                  {m.play_title}
                </p>
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ShelfCover({ monologue }: { monologue: Monologue }) {
  const poster = posterAt(monologue.poster_url, 300);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-sm shadow-[0_10px_26px_-12px_rgba(0,0,0,0.6)] ring-1 ring-border/60",
        "transition-transform duration-300 group-hover:-translate-y-1",
      )}
    >
      {/* Off-book pieces carry the same amber the bulb uses, so the one mark
          in the app that means "you know this" means it here too. */}
      {monologue.memorized && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 z-10 h-[3px] bg-amber-400/90"
        />
      )}
      {poster ? (
        <div className="relative aspect-[2/3]">
          <Image
            src={poster}
            alt=""
            fill
            unoptimized
            sizes="124px"
            className="object-cover"
          />
        </div>
      ) : (
        <PlayCover
          title={monologue.play_title}
          author={monologue.author}
          year={monologue.year}
          genre={monologue.genre}
          category={monologue.category}
          themes={monologue.themes}
        />
      )}
    </div>
  );
}

export default Shelf;
