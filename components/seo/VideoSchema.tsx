/**
 * Renders VideoObject JSON-LD for a single video so Google can index it as a
 * video result (fixes GSC "Video isn't on a watch page"). Drop one next to each
 * embedded video — homepage demo, /help tutorials, etc.
 *
 * Plain component (no hooks) so it works inside both server and client trees.
 *
 * Google requires: name, description, thumbnailUrl, uploadDate, and one of
 * embedUrl / contentUrl. duration is recommended.
 */
export type VideoSchemaProps = {
  name: string;
  description: string;
  /** Absolute thumbnail URL(s). For YouTube: https://img.youtube.com/vi/<id>/maxresdefault.jpg */
  thumbnailUrl: string | string[];
  /** ISO 8601 date the video was published, e.g. "2026-03-01". */
  uploadDate: string;
  /** YouTube embed URL, e.g. https://www.youtube.com/embed/<id>. Provide this or contentUrl. */
  embedUrl?: string;
  /** Direct file URL (e.g. a Vercel Blob .mp4). Provide this or embedUrl. */
  contentUrl?: string;
  /** ISO 8601 duration, e.g. "PT1M30S" for 1:30. */
  duration?: string;
};

export function VideoSchema({
  name,
  description,
  thumbnailUrl,
  uploadDate,
  embedUrl,
  contentUrl,
  duration,
}: VideoSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name,
    description,
    thumbnailUrl,
    uploadDate,
    ...(embedUrl ? { embedUrl } : {}),
    ...(contentUrl ? { contentUrl } : {}),
    ...(duration ? { duration } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
