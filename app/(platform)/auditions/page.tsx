import { Suspense } from "react";

import { AuditionsShell } from "@/components/auditions/AuditionsShell";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Auditions | ${BRAND.name}` };

export default function AuditionsPage() {
  return (
    <Suspense>
      <AuditionsShell selectedId={null} />
    </Suspense>
  );
}
