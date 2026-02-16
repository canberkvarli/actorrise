import type { Metadata } from "next";
import Link from "next/link";
import { ContactPageForm } from "@/components/contact/ContactPageForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with ActorRise. Questions, support, or feedback—we're here to help.",
  openGraph: {
    title: "Contact | ActorRise",
    description: "Get in touch with ActorRise for support and inquiries.",
  },
};

export default function ContactPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">
        Contact
      </h1>
      <p className="text-muted-foreground mb-10">
        Have a question, feedback, or need support? I&apos;d love to hear from you.
      </p>

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
              href="mailto:canberkvarli@gmail.com"
              className="text-foreground underline hover:no-underline font-medium"
            >
              canberkvarli@gmail.com
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
  );
}
