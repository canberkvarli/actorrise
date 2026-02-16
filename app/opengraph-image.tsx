import { ImageResponse } from "next/og";

export const alt = "ActorRise - Find the monologue. In seconds.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const logoUrl = `${siteUrl}/logo.png`;

// Same fonts as landing: Playfair Display (brand), Cormorant Garamond (h1 / “Find the monologue. In seconds.”)
const playfairLatin =
  "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKebunDXbtM.woff2";
const cormorantLatin =
  "https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_iE9KnTOig.woff2";

export default async function Image() {
  const [playfairRes, cormorantRes] = await Promise.all([
    fetch(playfairLatin),
    fetch(cormorantLatin),
  ]);
  const playfairData = await playfairRes.arrayBuffer();
  const cormorantData = await cormorantRes.arrayBuffer();

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
          {/* Same font as landing h1: Cormorant Garamond (--font-serif) */}
          <div
            style={{
              fontFamily: "Cormorant Garamond",
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
    {
      ...size,
      fonts: [
        { name: "Playfair Display", data: playfairData, style: "normal", weight: 600 },
        { name: "Cormorant Garamond", data: cormorantData, style: "normal", weight: 600 },
      ],
    }
  );
}
