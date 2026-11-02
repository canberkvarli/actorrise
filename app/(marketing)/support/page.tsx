import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

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
            <em className="italic text-primary"><T k="marketingSupport.title" /></em>
            <T k="marketingSupport.titleEnd" />
          </>
        }
        lede={<T k="marketingSupport.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3"><T k="marketingSupport.getHelp" /></h2>
            <p className="mb-3">
              <T k="marketingSupport.getHelpBody" />
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
              <T k="marketingSupport.replyTime" />
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3"><T k="marketingSupport.common" /></h2>
            <ul className="space-y-3">
              <li>
                <span className="text-foreground font-medium"><T k="marketingSupport.subLabel" /></span>{" "}
                <T k="marketingSupport.subBody" />
              </li>
              <li>
                <span className="text-foreground font-medium"><T k="marketingSupport.refundLabel" /></span>{" "}
                <T k="marketingSupport.refundBody" />
              </li>
              <li>
                <span className="text-foreground font-medium"><T k="marketingSupport.findLabel" /></span>{" "}
                <T k="marketingSupport.findBody" />
              </li>
              <li>
                <span className="text-foreground font-medium"><T k="marketingSupport.deleteLabel" /></span>{" "}
                <T k="marketingSupport.deleteBody" />
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3"><T k="marketingSupport.more" /></h2>
            <ul className="space-y-2">
              <li>
                <Link prefetch={false} href="/contact" className="text-foreground underline hover:no-underline">
                  <T k="marketingSupport.contactForm" />
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/privacy" className="text-foreground underline hover:no-underline">
                  <T k="marketingContact.privacy" />
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/terms" className="text-foreground underline hover:no-underline">
                  <T k="marketingContact.terms" />
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
