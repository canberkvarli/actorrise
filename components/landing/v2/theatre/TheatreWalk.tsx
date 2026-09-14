import { theatreFontVars } from "@/lib/fonts/theatre";
import { HouseCurtain } from "@/components/landing/v2/HouseCurtain";
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
 * The one borrowed part is `HouseCurtain`, which flies out over the hero once
 * per tab session. `--curtain-delay` is the single clock: the hero's entrance
 * animations hang off it, so the copy rises exactly as the velvet clears.
 */
export function TheatreWalk() {
  return (
    <div className={`theatre ${theatreFontVars}`}>
      <HouseCurtain />
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
