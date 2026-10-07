import { Suspense } from "react";

import { AuditionsShell } from "@/components/auditions/AuditionsShell";

export const metadata = { title: "Auditions | ActorRise" };

export default function AuditionsPage() {
  return (
    <Suspense>
      <AuditionsShell selectedId={null} />
    </Suspense>
  );
}
