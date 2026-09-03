import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";

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

export default function PrivacyPage() {
  return (
    <>
      <StageHero
        direction="(the fine print.)"
        title={<>Privacy Policy</>}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
      <p className="text-sm text-muted-foreground mb-10">
        Last updated: August 31, 2026
      </p>

      <div className="space-y-8 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
          <p>
            ActorRise (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website and platform at actorrise.com and our mobile applications, including Ghost Light: Monologues for iOS (together, the &quot;Service&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. By accessing or using the Service, you agree to this Privacy Policy. If you do not agree, please do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
          <p className="mb-3">We collect information that you provide directly and information we obtain automatically:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-foreground">Account information:</strong> When you sign up (via email or third-party sign-in such as Google or Apple), we receive your email address and, if provided, your name. We do not store your password when you use third-party sign-in.</li>
            <li><strong className="text-foreground">Profile information:</strong> You may choose to provide name, age range, gender, ethnicity, height, build, location, experience level, actor type, training background, union status, preferred genres, and similar details to personalize recommendations and features.</li>
            <li><strong className="text-foreground">Headshot and images:</strong> If you upload a headshot or other images, we store and process them to provide the Service (e.g., display on your profile).</li>
            <li><strong className="text-foreground">Usage and preferences:</strong> We collect data about how you use the Service (e.g., searches, bookmarks, feature usage) to operate, improve, and personalize the Service.</li>
            <li><strong className="text-foreground">Payment information:</strong> If you subscribe on the web, payment is processed by our payment provider (e.g., Stripe). If you subscribe inside our iOS app, payment is processed by Apple through in-app purchase. In neither case do we store your full card number; we receive and store only what is necessary for billing and support (e.g., last four digits or a receipt identifier, and billing email).</li>
            <li><strong className="text-foreground">Technical and device data:</strong> We may collect IP address, browser type, device type, and similar technical data for security, fraud prevention, and analytics.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
          <p className="mb-3">We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Authenticate you and manage your account.</li>
            <li>Personalize content and recommendations (e.g., monologue matches, AI-based features).</li>
            <li>Process payments and manage subscriptions.</li>
            <li>Send you service-related communications (e.g., account or billing notices).</li>
            <li>Respond to your requests and support inquiries.</li>
            <li>Detect, prevent, and address fraud, abuse, or security issues.</li>
            <li>Comply with legal obligations and enforce our Terms of Service.</li>
            <li>Analyze usage to improve the Service (including via aggregated or anonymized data).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Legal Basis for Processing (EEA/UK)</h2>
          <p>
            Where applicable under data protection laws (e.g., GDPR), we process your data on the basis of: (a) performance of our contract with you (providing the Service); (b) your consent where we ask for it (e.g., marketing); (c) our legitimate interests (e.g., security, analytics, improving the Service); and (d) compliance with legal obligations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Third-Party Services and Sharing</h2>
          <p className="mb-3">We use trusted third parties to operate the Service. They may process your data on our behalf under strict agreements:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-foreground">Authentication and storage:</strong> Supabase (auth and cloud storage). Their privacy practices apply to data they process.</li>
            <li><strong className="text-foreground">Sign-in providers:</strong> If you sign in with Google or Apple, those providers share with us the information you consent to (e.g., email, name) in accordance with their policies.</li>
            <li><strong className="text-foreground">Payments on the web:</strong> Stripe or another payment processor for subscriptions bought on actorrise.com. Payment data is handled by them; we do not store full payment card details.</li>
            <li><strong className="text-foreground">Payments in our iOS app:</strong> Subscriptions bought inside Ghost Light: Monologues are processed by Apple through in-app purchase. Apple does not share your payment details with us. We use RevenueCat to record which subscription you hold and to keep it in sync across your devices; it receives a pseudonymous identifier for your account, your purchase and receipt history, and basic device and app-version data. We never receive your card number.</li>
            <li><strong className="text-foreground">AI providers:</strong> We use OpenAI to power search, recommendations, speech transcription, the scene partner voice, self-tape feedback, and script parsing. Section 6 describes exactly what is sent, and what is kept. Under our provider&rsquo;s API terms, content sent through the API is not used to train their models.</li>
            <li><strong className="text-foreground">Product analytics in our iOS app:</strong> Ghost Light: Monologues uses PostHog so we can see which parts of the app earn their place and where people get stuck. It receives events describing what happened &mdash; that a search was run, that a monologue was opened, that the subscription screen appeared &mdash; together with a pseudonymous identifier, your device type and the app version. <strong className="text-foreground">It does not receive the words you search for, and it does not receive the monologues you read.</strong> If you sign in, these events are associated with your account identifier and never with your email address.</li>
          </ul>
          <p className="mt-3">
            <strong className="text-foreground">Community feed (the callboard).</strong> ActorRise includes a community activity feed visible to other signed-in users. It can show your first name, city, and profile photo alongside activity such as joining, reading, saving, or rehearsing a particular monologue. It never shows the text of your searches: raw search queries are not stored in the feed at all, and a search appears only as a general description (for example, &ldquo;searched for a comedic monologue&rdquo;). You can turn this off at any time using &ldquo;Hide my activity&rdquo; on the callboard, which also hides your past activity, not just future activity. A logged-out preview of the feed shows only a first initial and no photo.
          </p>
          <p className="mt-3">
            We do not sell your personal information. We may disclose your information if required by law, to protect our rights or safety, or in connection with a merger, sale, or transfer of assets (with notice where required).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">6. Voice, Video, and Script Content</h2>
          <p className="mb-3">
            Several features work by sending what you record or upload to our AI provider. This section sets out exactly what leaves your device, where it goes, and what is kept. If you never use these features, none of it applies to you.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-foreground">Your voice during rehearsal.</strong> When you rehearse a scene or monologue and speak your lines, short audio clips are captured by your browser or app and sent to our transcription provider (OpenAI Whisper) to be turned into text, so the scene partner knows when you have finished a line. The audio file is deleted as soon as the text comes back. We do not store your recordings, we do not keep them in our database, and no one at ActorRise listens to them.
            </li>
            <li>
              <strong className="text-foreground">The scene partner&rsquo;s voice.</strong> The other character&rsquo;s lines are spoken using a synthetic voice generated from the script text by our provider. This is generated audio, not a recording of a person.
            </li>
            <li>
              <strong className="text-foreground">Self-tape video.</strong> In Audition Mode, your video is recorded and stays on your device. Your device extracts a small number of still frames and sends only those frames to our AI provider to generate feedback on framing, lighting, and performance. The video file itself is never uploaded to us. The frames are not stored after the feedback is produced.
            </li>
            <li>
              <strong className="text-foreground">Scripts and sides you upload.</strong> Scripts you upload are stored in your account so you can rehearse them again. To identify characters and split the dialogue, the text is sent to our AI provider for parsing. Your uploaded scripts are private to your account unless you choose to share one, and we do not add them to our public monologue library.
            </li>
          </ul>
          <p className="mt-3">
            Content sent to our AI provider through their API is not used to train their models. They may retain it briefly for abuse monitoring under their API terms. You can stop all microphone and camera processing at any time by declining or revoking the browser or device permission, or by not using these features; the rest of the Service continues to work without them.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">7. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active or as needed to provide the Service and fulfill the purposes described in this policy. We may retain certain data longer where required by law (e.g., tax, legal claims) or for legitimate business purposes (e.g., security, dispute resolution). After account deletion, we delete or anonymize your personal data within a reasonable period, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">8. Your Rights</h2>
          <p className="mb-3">Depending on where you live, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-foreground">Access</strong> your personal data and receive a copy.</li>
            <li><strong className="text-foreground">Correct</strong> inaccurate or incomplete data.</li>
            <li><strong className="text-foreground">Delete</strong> your data (subject to legal exceptions).</li>
            <li><strong className="text-foreground">Restrict or object</strong> to certain processing.</li>
            <li><strong className="text-foreground">Data portability</strong> (receive your data in a structured, machine-readable format).</li>
            <li><strong className="text-foreground">Withdraw consent</strong> where processing is based on consent.</li>
            <li><strong className="text-foreground">Lodge a complaint</strong> with a supervisory authority (e.g., in your country or region).</li>
          </ul>
          <p className="mt-3">
            To exercise these rights, contact us at the email below. You can also update or delete your account and profile from within the Service where we provide those options.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">9. International Transfers</h2>
          <p>
            Your data may be processed in countries other than your own. We ensure appropriate safeguards (e.g., standard contractual clauses, adequacy decisions) where required by law so that your data remains protected in line with this policy and applicable regulations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">10. Security</h2>
          <p>
            We implement technical and organizational measures to protect your data against unauthorized access, loss, or alteration. No method of transmission or storage is 100% secure; we cannot guarantee absolute security and you use the Service at your own risk in that regard.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">11. Children</h2>
          <p>
            The Service is not directed at children under 16 (or higher age where required). We do not knowingly collect personal data from children. If you believe we have collected data from a child, please contact us and we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the updated policy on this page and, for material changes, we will provide additional notice (e.g., email or in-product notice) where required by law. Your continued use of the Service after the effective date of changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">13. Contact</h2>
          <p>
            For privacy-related questions, requests, or complaints, contact us at:{" "}
            <Link href="/contact" className="text-foreground underline hover:no-underline">
              Contact page
            </Link>
            {" "}or by email at the address listed there. We will respond in accordance with applicable law.
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        <Link href="/" className="text-foreground underline hover:no-underline">Back to home</Link>
        {" · "}
        <Link href="/terms" className="text-foreground underline hover:no-underline">Terms of Service</Link>
      </p>
      </div>
    </>
  );
}
