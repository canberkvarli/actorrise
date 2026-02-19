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
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ActorRise - Find the monologue. In seconds.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ActorRise - Find the Right Monologue in Less Than 20 Seconds | AI Search",
    description:
      "Find the right audition monologue in less than 20 seconds. One search, no keyword hunting. AI that understands what you need. Free tier available.",
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
          <AuthProviderWrapper>{children}</AuthProviderWrapper>
          <Toaster
            position="top-center"
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
