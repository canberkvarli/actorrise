import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { TrOnly } from "@/components/seo/ContentT";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "ActorRise Privacy Policy. How we collect, use, and protect your personal data when you use our platform.",
  openGraph: {
    title: "Privacy Policy | ActorRise",
    description: "How we collect, use, and protect your personal data.",
    url: `${siteUrl}/privacy`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | ActorRise",
    description:
      "How we collect, use, and protect your personal data.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/privacy` },
};

const H2 = "text-xl font-semibold text-foreground mb-3";
const LINK = "text-foreground underline hover:no-underline";
const P = "contentPrivacy";

/** A bullet that opens on a bold label: "<strong>Label:</strong> body". */
function Item({ label, body }: { label: MessageKey; body: MessageKey }) {
  return (
    <li>
      <strong className="text-foreground"><T k={label} /></strong> <T k={body} />
    </li>
  );
}

/** A rights bullet: the template places the bold label, so Turkish can move it. */
function Right({ label, body }: { label: MessageKey; body: MessageKey }) {
  return (
    <li>
      <SeoT k={body} slots={{ label: <strong className="text-foreground"><T k={label} /></strong> }} />
    </li>
  );
}

function Section({ title, children }: { title: MessageKey; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={H2}><T k={title} /></h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
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
          <p className="mb-3"><T k={`${P}.s2Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <Item label={`${P}.s2AccountLabel`} body={`${P}.s2Account`} />
            <Item label={`${P}.s2ProfileLabel`} body={`${P}.s2Profile`} />
            <Item label={`${P}.s2HeadshotLabel`} body={`${P}.s2Headshot`} />
            <Item label={`${P}.s2UsageLabel`} body={`${P}.s2Usage`} />
            <Item label={`${P}.s2PaymentLabel`} body={`${P}.s2Payment`} />
            <Item label={`${P}.s2TechLabel`} body={`${P}.s2Tech`} />
          </ul>
        </Section>

        <Section title={`${P}.s3Title`}>
          <p className="mb-3"><T k={`${P}.s3Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <li><T k={`${P}.s3i1`} /></li>
            <li><T k={`${P}.s3i2`} /></li>
            <li><T k={`${P}.s3i3`} /></li>
            <li><T k={`${P}.s3i4`} /></li>
            <li><T k={`${P}.s3i5`} /></li>
            <li><T k={`${P}.s3i6`} /></li>
            <li><T k={`${P}.s3i7`} /></li>
            <li><T k={`${P}.s3i8`} /></li>
            <li><T k={`${P}.s3i9`} /></li>
          </ul>
        </Section>

        <Section title={`${P}.s4Title`}>
          <p><T k={`${P}.s4Body`} /></p>
        </Section>

        <Section title={`${P}.s5Title`}>
          <p className="mb-3"><T k={`${P}.s5Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <Item label={`${P}.s5AuthLabel`} body={`${P}.s5Auth`} />
            <Item label={`${P}.s5SignInLabel`} body={`${P}.s5SignIn`} />
            <Item label={`${P}.s5WebPayLabel`} body={`${P}.s5WebPay`} />
            <Item label={`${P}.s5IosPayLabel`} body={`${P}.s5IosPay`} />
            <Item label={`${P}.s5AiLabel`} body={`${P}.s5Ai`} />
            <Item label={`${P}.s5CueLabel`} body={`${P}.s5Cue`} />
            <Item label={`${P}.s5WebAnalyticsLabel`} body={`${P}.s5WebAnalytics`} />
            <li>
              <strong className="text-foreground"><T k={`${P}.s5AppAnalyticsLabel`} /></strong>{" "}
              <T k={`${P}.s5AppAnalyticsA`} />{" "}
              <strong className="text-foreground"><T k={`${P}.s5AppAnalyticsB`} /></strong>{" "}
              <T k={`${P}.s5AppAnalyticsC`} />
            </li>
          </ul>
          <p className="mt-3">
            <strong className="text-foreground"><T k={`${P}.s5FeedLabel`} /></strong> <T k={`${P}.s5Feed`} />
          </p>
          <p className="mt-3"><T k={`${P}.s5NoSell`} /></p>
        </Section>

        <Section title={`${P}.s6Title`}>
          <p className="mb-3"><T k={`${P}.s6Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <Item label={`${P}.s6VoiceLabel`} body={`${P}.s6Voice`} />
            <Item label={`${P}.s6PartnerLabel`} body={`${P}.s6Partner`} />
            <Item label={`${P}.s6VideoLabel`} body={`${P}.s6Video`} />
            <Item label={`${P}.s6ScriptsLabel`} body={`${P}.s6Scripts`} />
          </ul>
          <p className="mt-3"><T k={`${P}.s6After`} /></p>
        </Section>

        <Section title={`${P}.s7Title`}>
          <p><T k={`${P}.s7Body`} /></p>
        </Section>

        <Section title={`${P}.s8Title`}>
          <p className="mb-3"><T k={`${P}.s8Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <Right label={`${P}.s8AccessLabel`} body={`${P}.s8Access`} />
            <Right label={`${P}.s8CorrectLabel`} body={`${P}.s8Correct`} />
            <Right label={`${P}.s8DeleteLabel`} body={`${P}.s8Delete`} />
            <Right label={`${P}.s8RestrictLabel`} body={`${P}.s8Restrict`} />
            <Right label={`${P}.s8PortLabel`} body={`${P}.s8Port`} />
            <Right label={`${P}.s8WithdrawLabel`} body={`${P}.s8Withdraw`} />
            <Right label={`${P}.s8ComplainLabel`} body={`${P}.s8Complain`} />
          </ul>
          <p className="mt-3"><T k={`${P}.s8After`} /></p>
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
          <p className="mb-3"><T k={`${P}.s12Intro`} /></p>
          <ul className="list-disc pl-6 space-y-2">
            <Item label={`${P}.s12GivesLabel`} body={`${P}.s12Gives`} />
            <li>
              <strong className="text-foreground"><T k={`${P}.s12TeacherLabel`} /></strong>{" "}
              <T k={`${P}.s12TeacherA`} />{" "}
              <strong className="text-foreground"><T k={`${P}.s12TeacherB`} /></strong>
            </li>
            <Item label={`${P}.s12OthersLabel`} body={`${P}.s12Others`} />
            <Item label={`${P}.s12EmailLabel`} body={`${P}.s12Email`} />
            <Item label={`${P}.s12NoSellLabel`} body={`${P}.s12NoSell`} />
            <Item label={`${P}.s12DeleteLabel`} body={`${P}.s12Delete`} />
          </ul>
        </Section>

        <Section title={`${P}.s13Title`}>
          <p><T k={`${P}.s13Body`} /></p>
        </Section>

        <Section title={`${P}.s14Title`}>
          <p>
            <SeoT
              k={`${P}.s14Body`}
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
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        <Link prefetch={false} href="/" className={LINK}><T k="contentLegal.backHome" /></Link>
        {" · "}
        <Link prefetch={false} href="/terms" className={LINK}><T k={`${P}.termsLink`} /></Link>
      </p>
      </div>
    </>
  );
}
