import { ImageResponse } from "next/og";

export const alt = "ActorRise - Find the right monologue in less than 20 seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const logoUrl = `${siteUrl}/logo.png`;

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
          <img
            src={logoUrl}
            alt=""
            width={160}
            height={160}
            style={{ marginBottom: 32, borderRadius: 12 }}
          />
          <div
            style={{
              fontSize: 36,
              color: "#a1a1a1",
              maxWidth: 700,
              lineHeight: 1.4,
            }}
          >
            Find the right monologue in less than 20 seconds
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
