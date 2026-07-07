import type { Metadata } from "next";
import Link from "next/link";
import { ContactPageForm } from "@/components/contact/ContactPageForm";
import { StageHero } from "@/components/marketing/StageHero";

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
        direction="(a note to the director.)"
        title={
          <>
            Say <em className="italic text-primary">hello</em>.
          </>
        }
        lede="Questions, feedback, bug reports, anything. It goes straight to my inbox, and I read every message."
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
      <div className="space-y-8 text-muted-foreground">
        <section>
          <ContactPageForm />
        </section>
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Or email directly</h2>
          <p className="mb-3">
            For account issues, billing questions, or technical support:
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
            I aim to respond within 1–2 business days.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Other links</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/terms" className="text-foreground underline hover:no-underline">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-foreground underline hover:no-underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/sources" className="text-foreground underline hover:no-underline">
                Sources & copyright
              </Link>
            </li>
          </ul>
        </section>
      </div>
      </div>
    </>
  );
}
