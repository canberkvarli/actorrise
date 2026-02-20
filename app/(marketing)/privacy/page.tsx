import type { Metadata } from "next";
import Link from "next/link";

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
  alternates: { canonical: `${siteUrl}/privacy` },
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Last updated: February 2025
      </p>

      <div className="space-y-8 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
          <p>
            ActorRise (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website and platform at actorrise.com (the &quot;Service&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. By accessing or using the Service, you agree to this Privacy Policy. If you do not agree, please do not use the Service.
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
            <li><strong className="text-foreground">Payment information:</strong> If you subscribe to a paid plan, payment is processed by our payment provider (e.g., Stripe). We do not store your full card number; we receive and store only what is necessary for billing and support (e.g., last four digits, billing email).</li>
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
            <li><strong className="text-foreground">Payments:</strong> Stripe or another payment processor for subscriptions. Payment data is handled by them; we do not store full payment card details.</li>
            <li><strong className="text-foreground">AI and analytics:</strong> We may use services (e.g., OpenAI) to power features such as search and recommendations. Data sent to such providers is used only to provide the feature and in accordance with their data terms.</li>
          </ul>
          <p className="mt-3">
            We do not sell your personal information. We may disclose your information if required by law, to protect our rights or safety, or in connection with a merger, sale, or transfer of assets (with notice where required).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">6. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active or as needed to provide the Service and fulfill the purposes described in this policy. We may retain certain data longer where required by law (e.g., tax, legal claims) or for legitimate business purposes (e.g., security, dispute resolution). After account deletion, we delete or anonymize your personal data within a reasonable period, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">7. Your Rights</h2>
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
          <h2 className="text-xl font-semibold text-foreground mb-3">8. International Transfers</h2>
          <p>
            Your data may be processed in countries other than your own. We ensure appropriate safeguards (e.g., standard contractual clauses, adequacy decisions) where required by law so that your data remains protected in line with this policy and applicable regulations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">9. Security</h2>
          <p>
            We implement technical and organizational measures to protect your data against unauthorized access, loss, or alteration. No method of transmission or storage is 100% secure; we cannot guarantee absolute security and you use the Service at your own risk in that regard.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">10. Children</h2>
          <p>
            The Service is not directed at children under 16 (or higher age where required). We do not knowingly collect personal data from children. If you believe we have collected data from a child, please contact us and we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the updated policy on this page and, for material changes, we will provide additional notice (e.g., email or in-product notice) where required by law. Your continued use of the Service after the effective date of changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">12. Contact</h2>
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
  );
}
