import type { Metadata } from "next";
import Link from "next/link";
import { ContactPageForm } from "@/components/contact/ContactPageForm";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with ActorRise. Questions, support, or feedback. We're here to help.",
  openGraph: {
    title: "Contact | ActorRise",
    description: "Get in touch with ActorRise for support and inquiries.",
    url: `${siteUrl}/contact`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact | ActorRise",
    description:
      "Get in touch with ActorRise for support and inquiries.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/contact` },
};

export default function ContactPage() {
  return (
    <>
      <StageHero
        direction={<T k="marketingContact.heroDirection" />}
        title={
          <>
            <T k="marketingContact.titleA" />
            <em className="italic text-primary"><T k="marketingContact.titleB" /></em>
            <T k="marketingContact.titleC" />
          </>
        }
        lede={<T k="marketingContact.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
      <div className="space-y-8 text-muted-foreground">
        <section>
          <ContactPageForm />
        </section>
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3"><T k="marketingContact.emailTitle" /></h2>
          <p className="mb-3">
            <T k="marketingContact.emailBody" />
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
            <T k="marketingContact.responseTime" />
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3"><T k="marketingContact.otherLinks" /></h2>
          <ul className="space-y-2">
            <li>
              <Link prefetch={false} href="/terms" className="text-foreground underline hover:no-underline">
                <T k="marketingContact.terms" />
              </Link>
            </li>
            <li>
              <Link prefetch={false} href="/privacy" className="text-foreground underline hover:no-underline">
                <T k="marketingContact.privacy" />
              </Link>
            </li>
            <li>
              <Link prefetch={false} href="/sources" className="text-foreground underline hover:no-underline">
                <T k="marketingFooter.sources" />
              </Link>
            </li>
          </ul>
        </section>
      </div>
      </div>
    </>
  );
}
