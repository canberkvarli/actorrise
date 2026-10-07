import { Suspense } from "react";

import { AuditionsShell } from "@/components/auditions/AuditionsShell";

export const metadata = { title: "Prep room | ActorRise" };

export default async function AuditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  return (
    <Suspense>
      <AuditionsShell selectedId={Number.isInteger(n) && n > 0 ? n : null} />
    </Suspense>
  );
}
