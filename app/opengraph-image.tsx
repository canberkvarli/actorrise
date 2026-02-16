import { ImageResponse } from "next/og";

export const alt = "ActorRise - World's largest AI-powered monologue search";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0f0f0f 0%, #1a1a1a 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 80,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 8,
              height: 48,
              background: "#e85d04",
              borderRadius: 4,
              marginBottom: 40,
            }}
          />
          <div
            style={{
              fontSize: 88,
              fontWeight: 600,
              color: "#fafafa",
              letterSpacing: "-0.02em",
              marginBottom: 24,
            }}
          >
            ActorRise
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#a1a1a1",
              maxWidth: 700,
              lineHeight: 1.4,
            }}
          >
            World&apos;s largest AI-powered monologue search
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#737373",
              marginTop: 12,
            }}
          >
            8,600+ monologues · Find your next piece in seconds
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
