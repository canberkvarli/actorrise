import React from "react";
import { Composition } from "remotion";
import { StoryVideo, StorySpec, storyFrames, FPS } from "./StoryVideo";
import { ReelVideo, ReelSpec, reelFrames, RFPS } from "./ReelVideo";
import story from "../specs/story-night-before.json";

const reelDefault: ReelSpec = {
  id: "reel-default",
  beats: [{ kind: "title", seconds: 2, text: "Ghost Light", accent: "Light" }],
};

export const Root: React.FC = () => (
  <>
    {/* The drawn paper story (one of the formats). */}
    <Composition
      id="StoryVideo"
      component={StoryVideo}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={storyFrames(story as StorySpec)}
      defaultProps={{ spec: story as StorySpec }}
      calculateMetadata={({ props }) => ({ durationInFrames: storyFrames(props.spec) })}
    />
    {/* Beats: type cards, stock footage, real app recordings, end card. */}
    <Composition
      id="ReelVideo"
      component={ReelVideo}
      width={1080}
      height={1920}
      fps={RFPS}
      durationInFrames={reelFrames(reelDefault)}
      defaultProps={{ spec: reelDefault }}
      calculateMetadata={({ props }) => ({ durationInFrames: reelFrames(props.spec) })}
    />
  </>
);
