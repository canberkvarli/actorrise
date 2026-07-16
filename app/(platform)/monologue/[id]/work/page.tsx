"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { MonologueCueing } from "@/components/monologue-work/MonologueCueing";

export default function MonologueWorkPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<Monologue>(`/api/monologues/${id}`);
        if (!active) return;
        setMonologue(res.data);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        const code = (error as Error & { response?: { status?: number } })?.response?.status;
        setStatus(code === 404 ? "notfound" : "error");
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0b0908]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#CB4B00]" />
      </div>
    );
  }

  if (status === "notfound" || status === "error" || !monologue) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#0b0908] text-[#ece5d8]">
        <p className="text-white/60" style={{ fontFamily: "var(--font-sans), Georgia, serif" }}>
          {status === "notfound" ? "This piece has left the stage." : "Something went dark loading this piece."}
        </p>
        <button onClick={() => router.back()} className="text-sm text-[#CB4B00] hover:underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="h-dvh">
      <MonologueCueing monologue={monologue} onExit={() => router.back()} />
    </div>
  );
}
