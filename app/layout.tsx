import type { Metadata } from "next";
import { Montserrat, JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
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

export const metadata: Metadata = {
  title: "ActorRise - Your Complete Acting Platform",
  description: "MonologueMatch, ScenePartner, CraftCoach, and more - all in one place for actors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${jetbrainsMono.variable} ${cormorantGaramond.variable} font-sans antialiased`}
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
