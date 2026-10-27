"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBulb } from "@tabler/icons-react";
import api from "@/lib/api";

type Conversation = {
  id: number;
  user_id: number;
  email: string | null;
  started_at: string;
  last_at: string;
  handoff_at: string | null;
  handoff_reason: string | null;
  read: boolean;
  first_question: string;
  messages: number;
};

type Detail = Conversation & {
  thread: { role: "user" | "assistant"; content: string; tools: string[]; at: string }[];
};

type Summary = {
  unread_handoffs: number;
  messages_today: number;
  spend_today_usd: number;
  spend_30d_usd: number;
  daily_ceiling_usd: number;
};

function when(s: string) {
  const d = new Date(s);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString();
}

const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

export default function AdminCuePageRoute() {
  // useSearchParams (the ?c= deep link from the handoff email) needs a boundary.
  return (
    <Suspense fallback={null}>
      <AdminCuePage />
    </Suspense>
  );
}

function AdminCuePage() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const c = Number(params.get("c"));
    if (c) setOpenId(c);
  }, [params]);

  const summary = useQuery({
    queryKey: ["admin-cue-summary"],
    queryFn: async () => (await api.get<Summary>("/api/admin/cue/summary")).data,
    staleTime: 30_000,
  });
  const list = useQuery({
    queryKey: ["admin-cue"],
    queryFn: async () => (await api.get<{ conversations: Conversation[] }>("/api/admin/cue")).data,
  });
  const detail = useQuery({
    queryKey: ["admin-cue", openId],
    queryFn: async () => (await api.get<Detail>(`/api/admin/cue/${openId}`)).data,
    enabled: openId != null,
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => api.post(`/api/admin/cue/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cue"] });
      qc.invalidateQueries({ queryKey: ["admin-cue-summary"] });
      qc.invalidateQueries({ queryKey: ["admin-pulse"] });
    },
  });

  useEffect(() => {
    if (detail.data?.handoff_at && !detail.data.read) markRead.mutate(detail.data.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.id]);

  const s = summary.data;
  const rows = list.data?.conversations ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brand flex items-center gap-2 text-2xl font-semibold">
          <IconBulb className="h-6 w-6 text-primary" />
          Cue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Every conversation, handoffs on top.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Handoffs unread", s ? String(s.unread_handoffs) : "·"],
          ["Messages today", s ? String(s.messages_today) : "·"],
          ["Spend today", s ? `${usd(s.spend_today_usd)} of ${usd(s.daily_ceiling_usd)}` : "·"],
          ["Spend, 30 days", s ? usd(s.spend_30d_usd) : "·"],
        ].map(([label, value]) => (
          <div key={label} className="border border-border/60 bg-card/40 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul className="divide-y divide-border border border-border/60">
          {rows.length === 0 && !list.isLoading && (
            <li className="p-4 text-sm text-muted-foreground">No conversations yet.</li>
          )}
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className={`w-full px-4 py-3 text-left hover:bg-muted/50 ${openId === c.id ? "bg-muted/60" : ""}`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {c.handoff_reason && (
                    <span
                      className={`border px-1.5 py-0.5 uppercase tracking-wide ${
                        c.read ? "border-border" : "border-primary text-primary"
                      }`}
                    >
                      {c.handoff_reason}
                    </span>
                  )}
                  <span className="truncate">{c.email}</span>
                  <span className="ml-auto shrink-0">
                    {when(c.last_at)} · {c.messages}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{c.first_question}</p>
              </button>
            </li>
          ))}
        </ul>

        <div className="border border-border/60 p-4">
          {!openId && <p className="text-sm text-muted-foreground">Pick a conversation.</p>}
          {detail.data && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {detail.data.email} · started {when(detail.data.started_at)}
                {detail.data.handoff_reason && ` · handed off: ${detail.data.handoff_reason}`}
              </p>
              {detail.data.thread.map((m, i) => (
                <div key={i} className={m.role === "user" ? "border-l-2 border-primary pl-3" : "pl-3"}>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {m.role === "user" ? "them" : "Cue"}
                    {m.tools.length > 0 && ` · ${m.tools.join(", ")}`}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
