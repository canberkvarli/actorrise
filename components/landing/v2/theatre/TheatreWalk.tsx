import { theatreFontVars } from "@/lib/fonts/theatre";
import { TheatreNav } from "./TheatreNav";
import { BackstageHero } from "./BackstageHero";
import { PlayMarquee } from "./PlayMarquee";
import { StageAct } from "./StageAct";
import { HouseLightsUp } from "./HouseLightsUp";
import { HouseAct } from "./HouseAct";
import { CurtainAct } from "./CurtainAct";
import { TheatreFooter } from "./TheatreFooter";

/**
 * The landing page: one continuous walk through a theatre.
 *
 *   backstage → the fly system → the stage → house lights up → the house →
 *   the curtain → out
 *
 * It is deliberately dark for the first two screens and cream for the middle
 * one, in both light and dark mode. `.theatre` carries its own palette and its
 * own three faces; nothing here reads the app's semantic tokens, and nothing
 * here leaks back out to them.
 *
 * There is no opening curtain. One flew out over the hero on first visit each
 * tab session; it is gone because the page does not need a gate in front of
 * it — the first thing a visitor should meet is the headline, not a wait.
 * `.theatre` zeroes `--curtain-delay` to match, so the hero's entrances (which
 * still hang off that clock) start immediately instead of holding for velvet
 * that no longer exists. The Act IV traveler is untouched: that one is scrolled
 * to, not sprung on anyone.
 */
export function TheatreWalk() {
  return (
    <div className={`theatre ${theatreFontVars}`}>
      <TheatreNav />
      <main>
        <BackstageHero />
        <PlayMarquee />
        <StageAct />
        <HouseLightsUp />
        <HouseAct />
        <CurtainAct />
      </main>
      <TheatreFooter />
    </div>
  );
}
