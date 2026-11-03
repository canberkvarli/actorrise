import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";

// The Studio's own environment, Linear's: Inter for everything it says (the
// optical-size axis gives the display cut at large sizes from one file),
// Geist Mono for the words of the play. Local files, never Google.
const inter = localFont({
  src: [{ path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2", weight: "100 900" }],
  variable: "--font-studio",
  display: "swap",
});

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`studio-root ${inter.variable} ${GeistMono.variable}`}
      style={{
        fontFamily: "var(--font-studio), system-ui, sans-serif",
        fontFeatureSettings: '"cv01", "ss03"',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {children}
    </div>
  );
}
