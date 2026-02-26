"use client";

import { useState, useEffect } from "react";
import { LandingDemoSearch } from "./LandingDemoSearch";

/**
 * Hero media component with video placeholder structure.
 * Automatically switches from interactive demo to video when demo-video.mp4 is available.
 *
 * To add video: Simply drop demo-video.mp4 in /public/ directory and it will auto-switch.
 */
export function LandingHeroMedia() {
  const [videoAvailable, setVideoAvailable] = useState(false);

  useEffect(() => {
    // Check if video file exists
    fetch("/demo-video.mp4", { method: "HEAD" })
      .then((res) => setVideoAvailable(res.ok))
      .catch(() => setVideoAvailable(false));
  }, []);

  // No video yet: show interactive demo
  if (!videoAvailable) {
    return <LandingDemoSearch />;
  }

  // Video ready: autoplay loop with fallback
  return (
    <div className="relative aspect-video max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-border/40">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-full object-cover"
      >
        <source src="/demo-video.mp4" type="video/mp4" />
        {/* Fallback to interactive demo if video fails to load */}
        <LandingDemoSearch />
      </video>
      {/* Decorative border overlay */}
      <div
        className="absolute inset-0 border-2 border-border/20 rounded-xl pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
