"use client";

import { useParams, useSearchParams } from "next/navigation";
import { RehearsalRoom } from "@/components/greenroom/RehearsalRoom";

export default function RoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const roomId = String(params.roomId);
  const scriptId = Number(search.get("script"));

  if (!scriptId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-muted-foreground">
        This room link is missing its scene.
      </div>
    );
  }
  return <RehearsalRoom roomId={roomId} scriptId={scriptId} />;
}
