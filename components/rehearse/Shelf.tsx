"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

import { PlayCover } from "@/components/monologue/PlayCover";
import { posterAt } from "@/lib/poster";
import { leadName } from "@/lib/collectionMeta";
import type { Monologue } from "@/types/actor";

/**
 * Everything else you have saved, stood up as a run of spines.
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
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="t-shelf"
    >
      <div className="t-shelf__head">
        <h2 className="t-shelf__label">
          {rest.length === 1 ? "(one more on the shelf.)" : "(also on the shelf.)"}
        </h2>
        <span className="t-shelf__count">{items.length} saved</span>
      </div>

      <div className="t-shelf__rail">
        <ul className="t-shelf__row">
          {rest.map((m, i) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.5,
                delay: Math.min(0.25 + i * 0.06, 0.6),
                ease: [0.34, 1.56, 0.64, 1],
              }}
              className="t-spine-item"
              /* Alternating tilt, so the row reads as objects stood on a shelf
                 rather than a grid of thumbnails. */
              style={{ "--tilt": i % 2 ? "1.5deg" : "-1.5deg" } as React.CSSProperties}
            >
              <button type="button" onClick={() => onSelect(m)} className="t-spine">
                <ShelfCover monologue={m} />
                <span className="t-spine__who">{leadName(m)}</span>
                <span className="t-spine__play">{m.play_title}</span>
              </button>
            </motion.li>
          ))}

          {/* The empty slot at the end of the row: the shelf asking for the
              next one, in the one place the actor is already looking at what
              they own and noticing what they do not. */}
          <li className="t-spine-item">
            <Link href="/monologues" className="t-shelf__more">
              <span aria-hidden>+</span>
              find another
            </Link>
          </li>
        </ul>
      </div>
    </motion.section>
  );
}

function ShelfCover({ monologue }: { monologue: Monologue }) {
  const poster = posterAt(monologue.poster_url, 300);
  return (
    <div className="t-spine__cover">
      {/* Off-book pieces carry the same gel the bulb uses, so the one mark in
          the app that means "you know this" means it here too. */}
      {monologue.memorized && <span aria-hidden className="t-cover__mark" />}
      {poster ? (
        <div className="relative aspect-[2/3]">
          <Image src={poster} alt="" fill unoptimized sizes="124px" className="object-cover" />
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
