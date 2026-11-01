import React from "react";
import { Composition } from "remotion";
import { StoryVideo, StorySpec, storyFrames, FPS } from "./StoryVideo";
import story from "../specs/story-night-before.json";

export const Root: React.FC = () => (
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
);
