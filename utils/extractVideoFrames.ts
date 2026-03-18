/**
 * Extract evenly-spaced frames from a video Blob as base64 JPEG strings.
 *
 * Uses an off-screen <video> + <canvas> to seek through the video
 * and capture frames at regular intervals.
 *
 * @param blob - The recorded video Blob
 * @param numFrames - How many frames to extract (default 6)
 * @param quality - JPEG quality 0-1 (default 0.7)
 * @returns Array of base64 JPEG strings (without data URL prefix)
 */
export async function extractVideoFrames(
  blob: Blob,
  numFrames = 6,
  quality = 0.7
): Promise<string[]> {
  const url = URL.createObjectURL(blob);

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    // Wait for metadata to load so we know the duration
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });

    const duration = video.duration;
    if (!duration || duration < 1) {
      throw new Error('Video too short to extract frames');
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, 640); // Cap at 640px wide for cost
    canvas.height = Math.round(
      (canvas.width / video.videoWidth) * video.videoHeight
    );
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    const frames: string[] = [];

    // Calculate seek times — skip first and last 0.5s to avoid blank frames
    const start = Math.min(0.5, duration * 0.05);
    const end = Math.max(duration - 0.5, duration * 0.95);
    const interval = (end - start) / (numFrames - 1);

    for (let i = 0; i < numFrames; i++) {
      const seekTime = start + i * interval;

      await new Promise<void>((resolve) => {
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          // Strip the "data:image/jpeg;base64," prefix
          const base64 = dataUrl.split(',')[1];
          frames.push(base64);
          resolve();
        };
        video.currentTime = seekTime;
      });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
