"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Where an organization stands as a partner (admin only). The written-yes rule
 * lives on the server (PUT /api/admin/organizations/<id>/partner); this only
 * says so before the save fails.
 */

export interface Partner {
  status: "none" | "asked" | "yes" | "no";
  show: "name" | "logo" | null;
  display_name: string | null;
  url: string | null;
  logo_url: string | null;
  links_us_at: string | null;
  approval: string | null;
  updated_at: string | null;
  ready_to_ask: boolean;
  on_landing: boolean;
}

/** One word for where this org stands as a partner. */
export function PartnerBadge({ p }: { p?: Partner }) {
  if (!p) return <span className="text-xs text-muted-foreground">not yet</span>;
  if (p.on_landing) return <span className="text-xs font-medium text-primary">on the landing</span>;
  if (p.ready_to_ask) return <span className="text-xs font-medium text-foreground">ready to ask</span>;
  const label = { none: "not yet", asked: "asked", yes: "said yes", no: "said no" }[p.status];
  return (
    <span className="text-xs text-muted-foreground">
      {label}
      {p.links_us_at && " · links to us"}
    </span>
  );
}

const FIELD = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

/**
 * The partner card on /admin/organizations/<id>. A school is normally shown by
 * name only: the teacher who says yes can agree to their program's name, not
 * their district's logo.
 */
export function PartnerCard({
  orgName,
  kind,
  partner,
  onSave,
  saving,
}: {
  orgName: string;
  kind: string;
  partner: Partner;
  onSave: (next: Omit<Partner, "updated_at" | "ready_to_ask" | "on_landing">) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState(partner.status);
  const [show, setShow] = useState<Partner["show"]>(partner.show);
  const [displayName, setDisplayName] = useState(partner.display_name ?? "");
  const [url, setUrl] = useState(partner.url ?? "");
  const [logoUrl, setLogoUrl] = useState(partner.logo_url ?? "");
  const [linksUsAt, setLinksUsAt] = useState(partner.links_us_at ?? "");
  const [approval, setApproval] = useState(partner.approval ?? "");

  const blocked =
    show !== null && (status !== "yes" || !approval.trim() || (show === "logo" && !logoUrl.trim()));

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-foreground">Partner</h3>
            <p className="text-xs text-muted-foreground">
              {partner.ready_to_ask
                ? "Their class has used it. Worth asking them to link to ActorRise."
                : "Ask once a class has really used it. Nothing shows on the landing without a written yes."}
            </p>
          </div>
          <PartnerBadge p={partner} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Where they stand</span>
            <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value as Partner["status"])}>
              <option value="none">not asked</option>
              <option value="asked">asked</option>
              <option value="yes">said yes</option>
              <option value="no">said no</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">On our landing page</span>
            <select
              className={FIELD}
              value={show ?? ""}
              onChange={(e) => setShow((e.target.value || null) as Partner["show"])}
            >
              <option value="">nothing</option>
              <option value="name">their name</option>
              <option value="logo">their logo</option>
            </select>
            {kind === "school" && show === "logo" && (
              <span className="block text-xs text-muted-foreground">
                A district logo needs the district&apos;s yes, not the teacher&apos;s.
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Name as it reads on the landing</span>
            <input className={FIELD} value={displayName} placeholder={orgName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Their website</span>
            <input className={FIELD} value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Logo file</span>
            <input className={FIELD} value={logoUrl} placeholder="/partners/name.png" onChange={(e) => setLogoUrl(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Their page that links to us</span>
            <input className={FIELD} value={linksUsAt} placeholder="https://" onChange={(e) => setLinksUsAt(e.target.value)} />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Who said yes, when, and their words</span>
          <textarea
            className={`${FIELD} min-h-[72px]`}
            value={approval}
            placeholder="Their drama teacher, by email 2026-10-27: &quot;yes, put us on there&quot;"
            onChange={(e) => setApproval(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {blocked
              ? show === "logo" && !logoUrl.trim()
                ? "A logo needs its file."
                : "Showing them needs a yes and a note of who said it."
              : partner.updated_at
                ? `Last changed ${partner.updated_at.slice(0, 10)}`
                : ""}
          </p>
          <Button
            size="sm"
            disabled={saving || blocked}
            onClick={() =>
              onSave({
                status,
                show,
                display_name: displayName.trim() || null,
                url: url.trim() || null,
                logo_url: logoUrl.trim() || null,
                links_us_at: linksUsAt.trim() || null,
                approval: approval.trim() || null,
              })
            }
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
