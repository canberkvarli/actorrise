import type { Metadata } from "next";
import { Montserrat, JetBrains_Mono, Cormorant_Garamond, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProviderWrapper } from "@/components/providers/AuthProviderWrapper";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";
import { FontLoader } from "@/components/FontLoader";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Brand/logo font – use for "ActorRise" wordmark. Same font is in Canva as "Playfair Display". */
const playfairDisplay = Playfair_Display({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ActorRise - Your Complete Acting Platform",
  description: "MonologueMatch, ScenePartner, CraftCoach, and more - all in one place for actors",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "ActorRise - Your Complete Acting Platform",
    description: "MonologueMatch, ScenePartner, CraftCoach, and more - all in one place for actors",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary",
    title: "ActorRise - Your Complete Acting Platform",
    description: "MonologueMatch, ScenePartner, CraftCoach, and more - all in one place for actors",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${jetbrainsMono.variable} ${cormorantGaramond.variable} ${playfairDisplay.variable} font-sans antialiased`}
      >
        <FontLoader />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProviderWrapper>{children}</AuthProviderWrapper>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
