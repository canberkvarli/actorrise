import { ScenePreviewSkeleton } from "@/components/practice/ScenePreviewSkeleton";

/**
 * Held while this route's chunk loads. The page renders the SAME skeleton
 * while its data arrives, so the two states are one shape — see the component.
 */
export default function Loading() {
  return <ScenePreviewSkeleton />;
}
