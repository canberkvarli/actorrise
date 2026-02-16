import { ImageResponse } from "next/og";

export const alt = "ActorRise - Find the monologue. In seconds.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const logoUrl = `${siteUrl}/logo.png`;

// Same fonts as landing: Playfair Display (brand), Cormorant Garamond (h1 / “Find the monologue. In seconds.”)
// System serif only: Satori does not support WOFF2; external TTF unreliable at build.
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
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 56,
            }}
          >
            <img
              src={logoUrl}
              alt=""
              width={96}
              height={96}
              style={{ borderRadius: 12 }}
            />
            <span
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 600,
                fontSize: 56,
                color: "#fafafa",
                letterSpacing: "-0.02em",
              }}
            >
              ActorRise
            </span>
          </div>
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontWeight: 600,
              fontSize: 42,
              color: "#a1a1aa",
              lineHeight: 1.25,
              letterSpacing: "-0.04em",
              maxWidth: 720,
            }}
          >
            Find the monologue. In seconds.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
