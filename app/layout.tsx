import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { Montserrat, JetBrains_Mono, Cormorant_Garamond, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProviderWrapper } from "@/components/providers/AuthProviderWrapper";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { FontLoader } from "@/components/FontLoader";
import { OAuthCallbackRedirect } from "@/components/auth/OAuthCallbackRedirect";

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
    default: "ActorRise - Find the Right Monologue in Less Than 20 Seconds | AI Search",
    template: "%s | ActorRise",
  },
  description:
    "Find the right audition monologue in less than 20 seconds. One search, no keyword hunting. AI that understands what you need. 8,600+ monologues. Free tier available.",
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
    title: "ActorRise - Find the Right Monologue in Less Than 20 Seconds | AI Search",
    description:
      "Find the right audition monologue in less than 20 seconds. One search, no keyword hunting. AI that understands what you need. Free tier available.",
    // OG image from app/opengraph-image.tsx (1200×630) – sharp on Facebook, LinkedIn, Twitter
  },
  twitter: {
    card: "summary_large_image",
    title: "ActorRise - Find the Right Monologue in Less Than 20 Seconds | AI Search",
    description:
      "Find the right audition monologue in less than 20 seconds. One search, no keyword hunting. AI that understands what you need. Free tier available.",
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
        "Find the right audition monologue in less than 20 seconds. AI-powered monologue search for actors. 8,600+ searchable monologues.",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo.png` },
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "ActorRise",
      url: siteUrl,
      description:
        "Find the right audition monologue in less than 20 seconds. AI semantic search that understands what you need. 8,600+ monologues.",
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
      <head>
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="beforeInteractive"
            />
            <Script id="google-analytics" strategy="beforeInteractive">
              {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${gaId}');`}
            </Script>
          </>
        )}
      </head>
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
          <Suspense fallback={null}>
            <OAuthCallbackRedirect />
          </Suspense>
          <AuthProviderWrapper>{children}</AuthProviderWrapper>
          <Toaster position="top-center" richColors />
          <Analytics />
          <GoogleAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
