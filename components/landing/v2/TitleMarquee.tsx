/**
 * Two counter-scrolling rows of source titles in typewriter type.
 * Pure CSS animation, server-renderable, masked at the edges.
 */
const ROW_ONE = [
  "Hamlet",
  "A Doll's House",
  "Twelfth Night",
  "The Seagull",
  "Miss Julie",
  "Macbeth",
  "Hedda Gabler",
  "Much Ado About Nothing",
  "Uncle Vanya",
  "The Importance of Being Earnest",
];

const ROW_TWO = [
  "Romeo and Juliet",
  "Three Sisters",
  "Othello",
  "The Cherry Orchard",
  "A Midsummer Night's Dream",
  "Ghosts",
  "King Lear",
  "The Master Builder",
  "As You Like It",
  "An Enemy of the People",
];

function MarqueeRow({ titles, reverse }: { titles: string[]; reverse?: boolean }) {
  const items = [...titles, ...titles];
  return (
    <div className="marquee-mask overflow-hidden">
      <div
        className={`flex w-max items-center whitespace-nowrap ${
          reverse ? "animate-marquee-right" : "animate-marquee-left"
        }`}
      >
        {items.map((title, i) => (
          <span
            key={`${title}-${i}`}
            aria-hidden={i >= titles.length}
            className="font-typewriter text-sm sm:text-base text-[var(--stage-faint)] px-5 sm:px-7 flex items-center gap-10 sm:gap-14"
          >
            {title}
            <span className="text-primary/50 text-xs">✳</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function TitleMarquee() {
  return (
    <section aria-label="A few of the plays in the library" className="py-10 sm:py-14">
      <p className="stage-direction text-center text-xs text-[var(--stage-faint)] mb-6">
        (7,500+ pieces. plays, film, and tv. these are a few of the plays.)
      </p>
      <div className="space-y-4">
        <MarqueeRow titles={ROW_ONE} />
        <MarqueeRow titles={ROW_TWO} reverse />
      </div>
    </section>
  );
}
