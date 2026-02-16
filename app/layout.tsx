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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ActorRise - World's Largest AI-Powered Monologue Search | 8,600+ Monologues",
    template: "%s | ActorRise",
  },
  description:
    "Find audition-ready monologues in seconds. 8,600+ searchable monologues (4–8x larger than Backstage), AI semantic search that understands what you need. Free tier available.",
  keywords: [
    "monologue search",
    "audition monologues",
    "AI monologue finder",
    "actor monologues",
    "theatre monologues",
    "monologue database",
    "semantic search monologues",
    "contemporary monologues",
    "classical monologues",
    "acting auditions",
  ],
  authors: [{ name: "ActorRise", url: siteUrl }],
  creator: "ActorRise",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ActorRise",
    title: "ActorRise - World's Largest AI-Powered Monologue Search | 8,600+ Monologues",
    description:
      "Find audition-ready monologues in seconds. 8,600+ searchable monologues (4–8x larger than Backstage), AI semantic search that understands what you need.",
    // OG image from app/opengraph-image.tsx (1200×630) – sharp on Facebook, LinkedIn, Twitter
  },
  twitter: {
    card: "summary_large_image",
    title: "ActorRise - World's Largest AI-Powered Monologue Search | 8,600+ Monologues",
    description:
      "Find audition-ready monologues in seconds. 8,600+ monologues, AI semantic search. Free tier available.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: { canonical: siteUrl },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "ActorRise",
      url: siteUrl,
      description:
        "World's largest AI-powered monologue discovery platform. 8,600+ searchable monologues with semantic search for actors.",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo.png` },
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "ActorRise",
      url: siteUrl,
      description:
        "Find audition-ready monologues in seconds. 8,600+ monologues (4–8x larger than competitors), AI semantic search that understands natural language.",
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
