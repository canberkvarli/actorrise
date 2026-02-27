import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { Montserrat, JetBrains_Mono, Cormorant_Garamond, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProviderWrapper } from "@/components/providers/AuthProviderWrapper";
import { AuthModalProvider } from "@/components/auth/AuthModalContext";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { FontLoader } from "@/components/FontLoader";
import { OAuthCallbackRedirect } from "@/components/auth/OAuthCallbackRedirect";
import { LastAuthCookieSync } from "@/components/auth/LastAuthCookieSync";

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
    default: "ActorRise - Find Your Monologue in 20 Seconds, Spend Your Time Rehearsing",
    template: "%s | ActorRise",
  },
  description:
    "Stop wasting hours searching books. Find your perfect audition monologue in 20 seconds with AI search. 8,600+ theatrical monologues + 14,000 film & TV scenes. Free forever, no credit card required.",
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
    icon: [
      { url: "/favicon.ico?v=5", sizes: "any" },
      { url: "/icon-192.png?v=5", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=5", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=5",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "ActorRise",
    title: "ActorRise - Find Your Monologue in 20 Seconds, Spend Your Time Rehearsing",
    description:
      "Stop wasting hours searching books. Find your perfect audition monologue in 20 seconds with AI search. 8,600+ theatrical monologues + 14,000 film & TV scenes. Free forever.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ActorRise - Find your monologue in 20 seconds. Spend your time rehearsing.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ActorRise - Find Your Monologue in 20 Seconds, Spend Your Time Rehearsing",
    description:
      "Stop wasting hours searching books. Find your perfect audition monologue in 20 seconds with AI search. 8,600+ theatrical monologues + 14,000 film & TV scenes. Free forever.",
    images: ["/opengraph-image"],
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
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "ActorRise",
      url: siteUrl,
      description: "Find your perfect audition monologue in 20 seconds with AI search. 8,600+ theatrical monologues + 14,000 film & TV scenes. Spend your time rehearsing.",
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "ActorRise",
      url: siteUrl,
      description:
        "Stop wasting hours searching books. Find your perfect audition monologue in 20 seconds with AI search. Free forever, no credit card required.",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo.png` },
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#webapp`,
      name: "ActorRise",
      url: siteUrl,
      description:
        "Find your monologue in 20 seconds. Spend your time rehearsing. AI semantic search over 8,600+ theatrical monologues and 14,000+ film & TV scenes.",
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
        {/* Preload auth modal logo so it’s cached before first open (avoids flash of missing logo) */}
        <link rel="preload" href="/transparent_textlogo.png" as="image" />
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
        {/* Persist OAuth "last used" before React: from sessionStorage (set when user clicked Google/Apple) or URL */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=null;try{var pending=sessionStorage.getItem("actorrise_pending_oauth_provider");if(pending==="google"||pending==="apple"){p=pending;sessionStorage.removeItem("actorrise_pending_oauth_provider");}}catch(e){}if(!p&&window.location.search){var q=new URLSearchParams(window.location.search).get("provider");if(q==="google"||q==="apple")p=q;}if(p){try{localStorage.setItem("actorrise_last_auth_method",p);if(window.location.search){var u=new URLSearchParams(window.location.search);u.delete("provider");var path=window.location.pathname+(u.toString()?"?"+u.toString():"");if(window.history.replaceState)window.history.replaceState({},"",path);}}catch(e){}}})();`,
          }}
        />
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
            <LastAuthCookieSync />
          </Suspense>
          <AuthProviderWrapper>
            <AuthModalProvider>{children}</AuthModalProvider>
          </AuthProviderWrapper>
          <Toaster
            position="bottom-center"
            richColors={false}
            toastOptions={{
              classNames: {
                toast: "actorrise-toast",
                success: "actorrise-toast-success",
                error: "actorrise-toast-error",
                warning: "actorrise-toast-warning",
                info: "actorrise-toast-info",
              },
            }}
          />
          <Analytics />
          <GoogleAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
