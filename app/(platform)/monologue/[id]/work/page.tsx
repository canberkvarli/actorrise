"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { MonologueReference } from "@/components/audition/MonologueReference";
import { MonologueCueing } from "@/components/monologue-work/MonologueCueing";

export default function MonologueWorkPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [refOpen, setRefOpen] = useState(false);

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
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (status === "notfound" || status === "error" || !monologue) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {status === "notfound"
            ? "This monologue no longer exists."
            : "Something went wrong loading this piece."}
        </p>
        <button onClick={() => router.back()} className="text-[#CB4B00] hover:underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{monologue.title}</h1>
          <p className="truncate text-xs text-muted-foreground">{monologue.character_name}</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6">
        <MonologueCueing monologue={monologue} />
      </main>

      <MonologueReference
        monologue={monologue}
        open={refOpen}
        onToggle={() => setRefOpen((o) => !o)}
      />
    </div>
  );
}
