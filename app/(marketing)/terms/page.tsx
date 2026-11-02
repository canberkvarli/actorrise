import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { TrOnly } from "@/components/seo/ContentT";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "ActorRise Terms of Service. Rules and conditions for using our platform and services.",
  openGraph: {
    title: "Terms of Service | ActorRise",
    description: "Rules and conditions for using ActorRise.",
    url: `${siteUrl}/terms`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service | ActorRise",
    description:
      "Rules and conditions for using ActorRise.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/terms` },
};

const H2 = "text-xl font-semibold text-foreground mb-3";
const LINK = "text-foreground underline hover:no-underline";
const P = "contentTerms";

function Section({ title, children }: { title: MessageKey; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={H2}><T k={title} /></h2>
      {children}
    </section>
  );
}

/** A paragraph that opens on a bold label: "<strong>Label:</strong> body". */
function Labelled({ label, body, className }: { label: MessageKey; body: React.ReactNode; className?: string }) {
  return (
    <p className={className}>
      <strong className="text-foreground"><T k={label} /></strong> {body}
    </p>
  );
}

export default function TermsPage() {
  return (
    <>
      <StageHero
        direction={<T k={`${P}.direction`} />}
        title={<T k={`${P}.title`} />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
      <TrOnly>
        <p className="text-sm text-foreground mb-4">
          <T k="contentLegal.trNotice" />
        </p>
      </TrOnly>
      <p className="text-sm text-muted-foreground mb-10">
        <T k={`${P}.updated`} />
      </p>

      <div className="space-y-8 text-muted-foreground">
        <Section title={`${P}.s1Title`}>
          <p><T k={`${P}.s1Body`} /></p>
        </Section>

        <Section title={`${P}.s2Title`}>
          <p><T k={`${P}.s2Body`} /></p>
        </Section>

        <Section title={`${P}.s3Title`}>
          <p><T k={`${P}.s3Body`} /></p>
        </Section>

        <Section title={`${P}.s4Title`}>
          <p className="mb-3"><T k={`${P}.s4Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <li><T k={`${P}.s4i1`} /></li>
            <li><T k={`${P}.s4i2`} /></li>
            <li><T k={`${P}.s4i3`} /></li>
            <li><T k={`${P}.s4i4`} /></li>
            <li><T k={`${P}.s4i5`} /></li>
            <li><T k={`${P}.s4i6`} /></li>
            <li><T k={`${P}.s4i7`} /></li>
          </ul>
          <p className="mt-3"><T k={`${P}.s4After`} /></p>
        </Section>

        <Section title={`${P}.s5Title`}>
          <p className="mb-3"><T k={`${P}.s5p1`} /></p>
          <p className="mb-3"><T k={`${P}.s5p2`} /></p>
          <h3 className="text-base font-semibold text-foreground mt-6 mb-2"><T k={`${P}.s5AppleTitle`} /></h3>
          <p className="mb-3"><T k={`${P}.s5p3`} /></p>
          <p className="mb-3"><T k={`${P}.s5p4`} /></p>
          <p><T k={`${P}.s5p5`} /></p>
        </Section>

        <Section title={`${P}.s6Title`}>
          <Labelled className="mb-3" label={`${P}.s6OursLabel`} body={<T k={`${P}.s6Ours`} />} />
          <Labelled
            className="mb-3"
            label={`${P}.s6ScriptsLabel`}
            body={
              <SeoT
                k={`${P}.s6Scripts`}
                slots={{
                  link: (
                    <Link prefetch={false} href="/sources" className={LINK}>
                      <T k={`${P}.s6SourcesLink`} />
                    </Link>
                  ),
                }}
              />
            }
          />
          <Labelled className="mb-3" label={`${P}.s6FilmLabel`} body={<T k={`${P}.s6Film`} />} />
          <Labelled label={`${P}.s6YoursLabel`} body={<T k={`${P}.s6Yours`} />} />
        </Section>

        <Section title={`${P}.s7Title`}>
          <p className="mb-3"><T k={`${P}.s7Caps`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <li><T k={`${P}.s7i1`} /></li>
            <li><T k={`${P}.s7i2`} /></li>
            <li><T k={`${P}.s7i3`} /></li>
            <li><T k={`${P}.s7i4`} /></li>
          </ul>
        </Section>

        <Section title={`${P}.s8Title`}>
          <p className="mb-3"><T k={`${P}.s8p1`} /></p>
          <p><T k={`${P}.s8p2`} /></p>
        </Section>

        <Section title={`${P}.s9Title`}>
          <p><T k={`${P}.s9Body`} /></p>
        </Section>

        <Section title={`${P}.s10Title`}>
          <p><T k={`${P}.s10Body`} /></p>
        </Section>

        <Section title={`${P}.s11Title`}>
          <p><T k={`${P}.s11Body`} /></p>
        </Section>

        <Section title={`${P}.s12Title`}>
          <p className="mb-3"><T k={`${P}.s12p1`} /></p>
          <p><T k={`${P}.s12p2`} /></p>
        </Section>

        <Section title={`${P}.s13Title`}>
          <p>
            <SeoT
              k={`${P}.s13Body`}
              slots={{
                link: (
                  <Link prefetch={false} href="/contact" className={LINK}>
                    <T k="contentLegal.contactPage" />
                  </Link>
                ),
              }}
            />
          </p>
        </Section>

        <Section title={`${P}.s14Title`}>
          <p>
            <SeoT
              k={`${P}.s14Body`}
              slots={{
                email: (
                  <a href="mailto:canberk@actorrise.com" className={LINK}>canberk@actorrise.com</a>
                ),
              }}
            />
          </p>
        </Section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        <Link prefetch={false} href="/" className={LINK}><T k="contentLegal.backHome" /></Link>
        {" · "}
        <Link prefetch={false} href="/privacy" className={LINK}><T k={`${P}.privacyLink`} /></Link>
      </p>
      </div>
    </>
  );
}
