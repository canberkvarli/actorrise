import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.actorrise.com";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const res = await fetch(`${apiUrl}/api/founding-actors/${slug}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return { title: "Actor Not Found" };
    }

    const actor = await res.json();
    const title = actor.name;
    const description = actor.descriptor
      ? `${actor.name}, ${actor.descriptor}. Founding actor at ActorRise.`
      : `${actor.name} is a founding actor at ActorRise, helping shape the platform for actors everywhere.`;

    return {
      title,
      description,
      openGraph: {
        title: `${title} | ActorRise`,
        description,
        url: `${siteUrl}/actors/${slug}`,
        images: actor.headshots?.[0]?.url
          ? [{ url: actor.headshots[0].url, alt: actor.name }]
          : undefined,
      },
      alternates: { canonical: `${siteUrl}/actors/${slug}` },
    };
  } catch {
    return { title: "Actor Not Found" };
  }
}

export default function ActorSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
