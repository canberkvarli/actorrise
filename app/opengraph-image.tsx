import { ImageResponse } from "next/og";

export const alt = "ActorRise - Find the monologue. In seconds.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const logoUrl = `${siteUrl}/logo.png`;

// Google Fonts (latin) – same as landing: Playfair Display for brand, Montserrat for tagline
const playfairUrl =
  "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKebunDXbtPK-F2qC0s.woff2";
const montserratUrl =
  "https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Hw5aXp-p7K4KLg.woff2";

export default async function Image() {
  const [playfairRes, montserratRes] = await Promise.all([
    fetch(playfairUrl),
    fetch(montserratUrl),
  ]);
  const playfairData = await playfairRes.arrayBuffer();
  const montserratData = await montserratRes.arrayBuffer();

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
          {/* Logo + ActorRise (same as header) */}
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
                fontFamily: "Playfair Display",
                fontWeight: 600,
                fontSize: 56,
                color: "#fafafa",
                letterSpacing: "-0.02em",
              }}
            >
              ActorRise
            </span>
          </div>
          {/* Tagline – same font as landing hero "Find the monologue. In seconds." */}
          <div
            style={{
              fontFamily: "Montserrat",
              fontWeight: 500,
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
    {
      ...size,
      fonts: [
        {
          name: "Playfair Display",
          data: playfairData,
          style: "normal",
          weight: 600,
        },
        {
          name: "Montserrat",
          data: montserratData,
          style: "normal",
          weight: 500,
        },
      ],
    }
  );
}
