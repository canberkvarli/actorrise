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
          {/* Pill badge – matches landing "Search engine · 8,600+ real scripts" */}
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
            Search engine · 8,600+ real scripts · not AI-generated
          </div>

          {/* Headline: "Find the monologue. In seconds." with "monologue" in primary */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "baseline",
              gap: 0,
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              marginBottom: 20,
            }}
          >
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 64, color: "#fafafa" }}>
              Find the{" "}
            </span>
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 64, color: primary }}>
              monologue
            </span>
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 64, color: "#fafafa" }}>
              . In seconds.
            </span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 28,
              color: muted,
              marginBottom: 48,
            }}
          >
            Real monologues by playwrights. Not AI-generated.
          </div>

          {/* Logo + wordmark */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <img
              src={logoUrl}
              alt=""
              width={56}
              height={56}
              style={{ borderRadius: 10 }}
            />
            <span
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: 600,
                fontSize: 32,
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
