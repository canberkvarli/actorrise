import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "ActorRise Terms of Service. Rules and conditions for using our platform and services.",
  openGraph: {
    title: "Terms of Service | ActorRise",
    description: "Rules and conditions for using ActorRise.",
  },
};

export default function TermsPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">
        Terms of Service
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        Last updated: February 2025
      </p>

      <div className="space-y-8 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) are a binding agreement between you and ActorRise (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) governing your access to and use of the website and platform at actorrise.com and related services (the &quot;Service&quot;). By creating an account, signing in, or otherwise using the Service, you agree to these Terms and our Privacy Policy. If you do not agree, you must not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Description of the Service</h2>
          <p>
            ActorRise provides tools for actors, including monologue search and discovery, profile management, AI-powered recommendations, scene partner and coaching features, and related content and functionality. We may add, change, or discontinue features at any time. The Service is provided &quot;as is&quot; subject to the disclaimers and limitations in these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Eligibility and Account</h2>
          <p>
            You must be at least 16 years old (or the age of majority in your jurisdiction, if higher) and able to form a binding contract to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate and complete information and update it as needed. We may suspend or terminate your account if you breach these Terms or for other reasons we deem necessary.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Acceptable Use</h2>
          <p className="mb-3">You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Use the Service for any illegal purpose or in violation of any applicable laws.</li>
            <li>Infringe any third party&apos;s intellectual property, privacy, or other rights.</li>
            <li>Upload or share content that is defamatory, harassing, abusive, obscene, or otherwise objectionable.</li>
            <li>Attempt to gain unauthorized access to the Service, other accounts, or our or our providers&apos; systems or data.</li>
            <li>Use automated means (e.g., scrapers, bots) to access the Service except where we expressly allow it.</li>
            <li>Resell, sublicense, or commercially exploit the Service or content except as we expressly permit.</li>
            <li>Circumvent any usage limits, security measures, or access controls.</li>
          </ul>
          <p className="mt-3">
            We may remove content and suspend or terminate accounts that violate these rules. We are not obligated to monitor all content but may do so at our discretion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Subscriptions and Payment</h2>
          <p className="mb-3">
            Some parts of the Service may require a paid subscription. By subscribing, you agree to pay the fees stated at the time of purchase (e.g., monthly or annual). Fees are charged in advance and are generally non-refundable except as required by law or as we explicitly state (e.g., in a refund policy on the pricing or checkout page). Payment is processed by our payment provider (e.g., Stripe); their terms apply to the payment transaction. You are responsible for any taxes that apply to your purchase.
          </p>
          <p>
            You may cancel your subscription in accordance with the options we provide (e.g., in account or billing settings). Cancellation will stop future charges; you will retain access until the end of the current billing period. We may change subscription fees with reasonable notice; continued use after the change constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">6. Intellectual Property and Content</h2>
          <p className="mb-3">
            <strong className="text-foreground">Our content and IP:</strong> The Service (including design, text, graphics, code, and other materials we provide) and our name and branding are owned by us or our licensors and are protected by copyright and other laws. You may not copy, modify, distribute, or create derivative works from our content or IP except as we expressly allow.
          </p>
          <p className="mb-3">
            <strong className="text-foreground">Monologues and scripts:</strong> Monologue and script content we make available is from public domain or licensed sources. Your use of that content is subject to applicable copyright and our display terms. We do not grant you rights to use third-party copyrighted works beyond what the source license allows; see our{" "}
            <Link href="/sources" className="text-foreground underline hover:no-underline">Sources &amp; copyright</Link>
            {" "}page for more information.
          </p>
          <p className="mb-3">
            <strong className="text-foreground">Film and television reference:</strong> Film and television reference entries contain only factual metadata (character name, source title, thematic descriptions, and links) and do not include copyrighted script text. Links to third-party script sources are provided for convenience only; ActorRise is not responsible for third-party content.
          </p>
          <p>
            <strong className="text-foreground">Your content:</strong> You retain ownership of content you upload (e.g., headshots, profile text). You grant us a non-exclusive, royalty-free, worldwide license to use, store, display, and process that content as needed to provide and improve the Service and as described in our Privacy Policy. You represent that you have the rights to grant this license and that your content does not violate these Terms or any third-party rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">7. Disclaimers</h2>
          <p className="mb-3">THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>We do not guarantee that the Service will be uninterrupted, error-free, or secure.</li>
            <li>We are not a talent agency, employer, or casting service. The Service does not create an employment or agency relationship. We do not guarantee auditions, roles, or career outcomes.</li>
            <li>AI-generated or AI-assisted features (e.g., recommendations, feedback) are for informational and creative support only and do not constitute professional, legal, or career advice.</li>
            <li>You use the Service and any content or recommendations at your own risk.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">8. Limitation of Liability</h2>
          <p className="mb-3">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ACTORRISE, ITS AFFILIATES, OR THEIR RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL) ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p>
            OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM AROSE, OR (B) ONE HUNDRED U.S. DOLLARS (USD $100). SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES; IN SUCH CASES, THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU TO THAT EXTENT.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">9. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless ActorRise and its affiliates, officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising out of or related to (a) your use of the Service, (b) your content or conduct, (c) your violation of these Terms or any law, or (d) your violation of any third-party rights. We reserve the right to assume exclusive defense and control of any matter subject to indemnification by you; you will cooperate with us in that defense.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">10. Termination</h2>
          <p>
            You may stop using the Service and close your account at any time. We may suspend or terminate your access to the Service, with or without notice, for any reason, including breach of these Terms. Upon termination, your right to use the Service ceases. Provisions that by their nature should survive (including disclaimers, limitation of liability, indemnification, and governing law) will survive termination.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">11. Disputes and Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any dispute arising from or related to these Terms or the Service shall be resolved exclusively in the state or federal courts located in Delaware, and you consent to personal jurisdiction there. You waive any right to a jury trial and any right to participate in a class or representative action to the extent permitted by applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">12. General</h2>
          <p className="mb-3">
            These Terms, together with our Privacy Policy and any other policies we reference, constitute the entire agreement between you and ActorRise regarding the Service. Our failure to enforce any right or provision does not waive that right or provision. If any provision is held invalid or unenforceable, the remaining provisions remain in effect. We may assign our rights and obligations under these Terms; you may not assign without our prior written consent.
          </p>
          <p>
            We may modify these Terms at any time. We will post the updated Terms on this page and update the &quot;Last updated&quot; date. Material changes may be communicated via email or in-product notice where required. Your continued use of the Service after the effective date of changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">13. Contact</h2>
          <p>
            For questions about these Terms, please contact us via our{" "}
            <Link href="/contact" className="text-foreground underline hover:no-underline">
              Contact page
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">14. DMCA Notice</h2>
          <p>
            If you believe content on ActorRise infringes your copyright, contact us at{" "}
            <a href="mailto:canberkvarli@gmail.com" className="text-foreground underline hover:no-underline">canberkvarli@gmail.com</a>
            {" "}with: (1) identification of the copyrighted work; (2) identification of the allegedly infringing material and its URL; (3) your contact information; (4) a statement of good faith belief that the use is not authorized by the copyright owner; and (5) your electronic or physical signature. We will investigate and remove infringing content where appropriate.
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        <Link href="/" className="text-foreground underline hover:no-underline">Back to home</Link>
        {" · "}
        <Link href="/privacy" className="text-foreground underline hover:no-underline">Privacy Policy</Link>
      </p>
    </div>
  );
}
