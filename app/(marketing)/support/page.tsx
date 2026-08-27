import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with ActorRise. Account, billing, and technical support for the web app and the iOS app. Email canberk@actorrise.com.",
  openGraph: {
    title: "Support | ActorRise",
    description: "Get help with your ActorRise account, billing, or the app.",
    url: `${siteUrl}/support`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Support | ActorRise",
    description: "Get help with your ActorRise account, billing, or the app.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/support` },
};

export default function SupportPage() {
  return (
    <>
      <StageHero
        direction="(need a hand?)"
        title={
          <>
            <em className="italic text-primary">Support</em>.
          </>
        }
        lede="Something not working, a billing question, or stuck on your account? Email me and I read every message myself."
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Get help</h2>
            <p className="mb-3">
              For anything at all, account issues, billing and subscriptions, a bug, or a
              monologue you cannot find, email me directly:
            </p>
            <p>
              <a
                href="mailto:canberk@actorrise.com"
                className="text-foreground underline hover:no-underline font-medium"
              >
                canberk@actorrise.com
              </a>
            </p>
            <p className="mt-4 text-sm">
              I am a solo founder and I read everything. I aim to reply within 1 to 2 business days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">Common questions</h2>
            <ul className="space-y-3">
              <li>
                <span className="text-foreground font-medium">Managing your subscription.</span>{" "}
                You can start, change, or cancel your membership from your account settings in the
                app. If you are stuck, email me and I will sort it out.
              </li>
              <li>
                <span className="text-foreground font-medium">Refunds or billing.</span>{" "}
                Email me at the address above with the email you signed up with and I will help.
              </li>
              <li>
                <span className="text-foreground font-medium">Can&apos;t find a monologue.</span>{" "}
                Tell me what you searched for and what you were hoping to find. I add and fix
                content constantly.
              </li>
              <li>
                <span className="text-foreground font-medium">Deleting your account.</span>{" "}
                You can delete your account and data from account settings, or email me to do it
                for you.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">More</h2>
            <ul className="space-y-2">
              <li>
                <Link href="/contact" className="text-foreground underline hover:no-underline">
                  Contact form
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-foreground underline hover:no-underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-foreground underline hover:no-underline">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
