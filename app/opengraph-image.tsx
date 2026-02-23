import { ImageResponse } from "next/og";

export const alt = "ActorRise - Find the monologue. In seconds.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Logo: use your deployed origin so the OG generator can fetch it. Ensure public/logo.png exists.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const logoUrl = `${siteUrl}/logo.png`;

// Optional: drop a pre-made 1200×630 image at public/og-image.png and we can serve that instead.
// Primary (landing hero keyword): oklch(0.58 0.18 45) ≈ #e07a0d
const primary = "#e07a0d";
const background = "#171717";
const cardBg = "rgba(38, 38, 38, 0.6)";
const border = "rgba(255,255,255,0.08)";
const muted = "#a1a1aa";

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
          background,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 72,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {/* Pill badge – matches landing hero pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 40,
              paddingLeft: 14,
              paddingRight: 14,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 9999,
              border: `1px solid ${border}`,
              backgroundColor: cardBg,
              fontSize: 22,
              color: muted,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: primary,
              }}
            />
            Search engine · Monologues, scenes & TV/film
          </div>

          {/* Headline: "Find the monologue." / "In seconds." on two lines */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              marginBottom: 48,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "baseline",
                gap: 0,
              }}
            >
              <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 64, color: "#fafafa" }}>
                Find the{" "}
              </span>
              <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 64, color: primary }}>
                monologue
              </span>
              <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 64, color: "#fafafa" }}>
                .
              </span>
            </div>
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 600,
                fontSize: 64,
                color: "#fafafa",
              }}
            >
              In seconds.
            </div>
          </div>

          {/* Logo icon + wordmark */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <img
              src={logoUrl}
              alt=""
              width={48}
              height={48}
              style={{ display: "block", objectFit: "contain" }}
            />
            <span
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 600,
                fontSize: 28,
                color: "#fafafa",
                letterSpacing: "0.02em",
              }}
            >
              ActorRise
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
