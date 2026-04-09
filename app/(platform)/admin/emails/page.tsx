"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IconMail,
  IconSend,
  IconEye,
  IconUsers,
  IconUser,
  IconUsersGroup,
  IconX,
  IconClock,
  IconChevronDown,
  IconChevronUp,
  IconMailOpened,
  IconClick,
  IconBounceRight,
  IconUserOff,
  IconArrowForward,
  IconTrash,
  IconPlus,
  IconTarget,
  IconFilter,
  IconSearch,
  IconBrandApple,
  IconCrown,
  IconCheck,
  IconRefresh,
  IconBolt,
} from "@tabler/icons-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface TemplateVariable {
  name: string;
  label: string;
  type: "text" | "number" | "url";
  default: string | number;
  required: boolean;
}

interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  subject: string;
  variables: TemplateVariable[];
}

interface CampaignResult {
  sent: number;
  skipped: number;
  errors: string[];
  recipients: string[];
}

interface BatchSend {
  email: string;
  name: string;
  status: string;
  resend_id: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

interface BatchHistoryItem {
  batch_id: number;
  template_id: string;
  campaign_key: string | null;
  subject: string;
  status: string;
  total: number;
  sent: number;
  skipped: number;
  scheduled_at: string | null;
  created_at: string | null;
  status_counts: Record<string, number>;
}

interface BatchStatus {
  batch_id: number;
  status: "pending" | "processing" | "completed" | "failed";
  total: number;
  sent: number;
  skipped: number;
  errors: string[];
  sends: BatchSend[];
}

interface DncEntry {
  id: number;
  email: string;
  name: string | null;
  reason: string | null;
  added_at: string | null;
}

interface Lead {
  id: number;
  email: string;
  name: string | null;
  created_at: string | null;
  tier_name: string | null;
  subscription_status: string | null;
  is_active_paid: boolean;
  is_apple_relay: boolean;
  on_dnc: boolean;
  marketing_opt_in: boolean;
  total_scripts_uploaded: number;
}

type LeadSegment = "all" | "untouched" | "recent" | "opt_in";

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminEmailsPage() {
  const { user } = useAuth();

  // Loading
  const [loading, setLoading] = useState(true);

  // Template data
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [subjectOverride, setSubjectOverride] = useState("");

  // Preview
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Send mode
  const [mode, setMode] = useState<"single" | "bulk" | "campaign">("campaign");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [bulkRecipients, setBulkRecipients] = useState<{ email: string; name: string }[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [target, setTarget] = useState("all");
  const [dryRun, setDryRun] = useState(true);
  const [sendVia, setSendVia] = useState<"smtp" | "resend">("smtp");

  // Bulk extras
  const [campaignKey, setCampaignKey] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  // Batch progress
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sent history
  const [batchHistory, setBatchHistory] = useState<BatchHistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);
  const [expandedSends, setExpandedSends] = useState<BatchSend[]>([]);

  // Compose section toggle
  const [composeOpen, setComposeOpen] = useState(false);
  const composeRef = useRef<HTMLDivElement>(null);

  // Do-not-contact list
  const [dncOpen, setDncOpen] = useState(false);
  const [dncEntries, setDncEntries] = useState<DncEntry[]>([]);
  const [dncLoading, setDncLoading] = useState(false);
  const [dncInput, setDncInput] = useState("");
  const [autoDncLoading, setAutoDncLoading] = useState(false);

  // Leads browser
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSegment, setLeadSegment] = useState<LeadSegment>("untouched");
  const [hideAppleRelay, setHideAppleRelay] = useState(true);
  const [hidePaid, setHidePaid] = useState(true);
  const [hideDnc, setHideDnc] = useState(true);
  const [requireOptIn, setRequireOptIn] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Dialogs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [campaignResult, setCampaignResult] = useState<CampaignResult | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  // Fetch templates + batch history + DNC + leads
  useEffect(() => {
    Promise.all([
      api.get<TemplateMeta[]>("/api/admin/emails/templates").then(({ data }) => {
        setTemplates(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
          _initVars(data[0]);
        }
      }).catch(() => toast.error("Failed to load email templates")),
      api.get<BatchHistoryItem[]>("/api/admin/emails/batches").then(({ data }) => setBatchHistory(data)).catch(() => {}),
      api.get<DncEntry[]>("/api/admin/emails/do-not-contact").then(({ data }) => setDncEntries(data)).catch(() => {}),
      api.get<Lead[]>("/api/admin/emails/leads").then(({ data }) => setLeads(data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function refreshLeads() {
    setLeadsLoading(true);
    return api
      .get<Lead[]>("/api/admin/emails/leads")
      .then(({ data }) => setLeads(data))
      .catch(() => toast.error("Failed to load leads"))
      .finally(() => setLeadsLoading(false));
  }

  async function autoDncAppleRelay() {
    setAutoDncLoading(true);
    try {
      const { data } = await api.post<{ added: number; scanned: number }>(
        "/api/admin/emails/do-not-contact/auto-apple-relay",
      );
      if (data.added > 0) {
        toast.success(`Added ${data.added} Apple Hide-My-Email user${data.added !== 1 ? "s" : ""} to do-not-contact`);
      } else {
        toast.success(`No new Apple SSO users to add (scanned ${data.scanned})`);
      }
      await Promise.all([refreshDnc(), refreshLeads()]);
    } catch {
      toast.error("Failed to auto-add Apple SSO users");
    } finally {
      setAutoDncLoading(false);
    }
  }

  function refreshDnc() {
    return api
      .get<DncEntry[]>("/api/admin/emails/do-not-contact")
      .then(({ data }) => setDncEntries(data))
      .catch(() => {});
  }

  async function addDncEntries(raw: string) {
    const parsed = parseBulkLines(raw);
    if (parsed.length === 0) {
      toast.error("No valid emails found");
      return;
    }
    setDncLoading(true);
    try {
      const { data } = await api.post<{ added: number; skipped: number }>(
        "/api/admin/emails/do-not-contact",
        { entries: parsed },
      );
      toast.success(
        `Added ${data.added} to do-not-contact${data.skipped > 0 ? ` (${data.skipped} already on list)` : ""}`,
      );
      setDncInput("");
      await refreshDnc();
    } catch {
      toast.error("Failed to add to do-not-contact list");
    } finally {
      setDncLoading(false);
    }
  }

  async function removeDncEntry(entryId: number) {
    try {
      await api.delete(`/api/admin/emails/do-not-contact/${entryId}`);
      setDncEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch {
      toast.error("Failed to remove entry");
    }
  }

  // ── Leads filtering (in-memory, instant) ──────────────────────────────
  const filteredLeads = React.useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const cutoff30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return leads.filter((l) => {
      if (hideAppleRelay && l.is_apple_relay) return false;
      if (hidePaid && l.is_active_paid) return false;
      if (hideDnc && l.on_dnc) return false;
      if (requireOptIn && !l.marketing_opt_in) return false;
      if (leadSegment === "untouched" && l.total_scripts_uploaded > 0) return false;
      if (leadSegment === "opt_in" && !l.marketing_opt_in) return false;
      if (leadSegment === "recent") {
        const t = l.created_at ? new Date(l.created_at).getTime() : 0;
        if (!t || t < cutoff30d) return false;
      }
      if (q) {
        const hay = `${l.email} ${l.name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, leadSearch, leadSegment, hideAppleRelay, hidePaid, hideDnc, requireOptIn]);

  const filteredLeadIds = React.useMemo(
    () => new Set(filteredLeads.map((l) => l.id)),
    [filteredLeads],
  );
  const visibleSelectedCount = React.useMemo(
    () => filteredLeads.filter((l) => selectedLeadIds.has(l.id)).length,
    [filteredLeads, selectedLeadIds],
  );
  const allVisibleSelected =
    filteredLeads.length > 0 && visibleSelectedCount === filteredLeads.length;

  function toggleLead(id: number) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of filteredLeadIds) next.delete(id);
      } else {
        for (const id of filteredLeadIds) next.add(id);
      }
      return next;
    });
  }

  function loadLeadsIntoComposer() {
    const picked = leads.filter((l) => selectedLeadIds.has(l.id));
    if (picked.length === 0) {
      toast.error("Select at least one lead first");
      return;
    }
    const recipients = picked.map((l) => ({ email: l.email, name: l.name || "" }));
    setBulkRecipients(recipients);
    setMode("bulk");
    // Founder offer is the natural template for converting signed-up users
    const founderTmpl = templates.find((t) => t.id === "founder_offer");
    if (founderTmpl) {
      setSelectedId("founder_offer");
      _initVars(founderTmpl);
    }
    setCampaignKey(`founder-leads-${new Date().toISOString().slice(0, 10)}`);
    setComposeOpen(true);
    setLeadsOpen(false);
    toast.success(`Loaded ${recipients.length} lead${recipients.length !== 1 ? "s" : ""} into composer`);
    setTimeout(() => composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function startFollowUp(sends: BatchSend[], audience: "openers" | "non_openers") {
    const filtered = sends.filter((s) => {
      const opened = !!s.opened_at || !!s.clicked_at;
      return audience === "openers" ? opened : !opened;
    });
    if (filtered.length === 0) {
      toast.error(`No ${audience === "openers" ? "openers" : "non-openers"} in this batch`);
      return;
    }
    const dncSet = new Set(dncEntries.map((e) => e.email));
    const recipients = filtered
      .filter((s) => !dncSet.has(s.email.toLowerCase()))
      .map((s) => ({ email: s.email, name: s.name || "" }));
    const skippedCount = filtered.length - recipients.length;
    setBulkRecipients(recipients);
    setMode("bulk");
    setComposeOpen(true);
    setCampaignKey(
      audience === "openers" ? `followup-openers-${new Date().toISOString().slice(0, 10)}` : `followup-nonopeners-${new Date().toISOString().slice(0, 10)}`,
    );
    toast.success(
      `Loaded ${recipients.length} ${audience === "openers" ? "opener" : "non-opener"}${recipients.length !== 1 ? "s" : ""}` +
        (skippedCount > 0 ? ` (${skippedCount} skipped via do-not-contact)` : ""),
    );
    setTimeout(() => composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function fetchBatchHistory(search?: string) {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    api
      .get<BatchHistoryItem[]>(`/api/admin/emails/batches${params}`)
      .then(({ data }) => setBatchHistory(data))
      .catch(() => {});
  }

  async function toggleBatchDrilldown(batchId: number) {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setExpandedSends([]);
      return;
    }
    try {
      const { data } = await api.get<BatchStatus>(`/api/admin/emails/batch/${batchId}`);
      setExpandedBatch(batchId);
      setExpandedSends(data.sends);
    } catch {
      toast.error("Failed to load batch details");
    }
  }

  function _initVars(tmpl: TemplateMeta) {
    const init: Record<string, string> = {};
    for (const v of tmpl.variables) {
      init[v.name] = String(v.default ?? "");
    }
    setVariables(init);
    setSubjectOverride("");
    setPreviewHtml(null);
    setCampaignResult(null);
    setBatchStatus(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function selectTemplate(id: string) {
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl) return;
    setSelectedId(id);
    _initVars(tmpl);
  }

  // Preview
  async function handlePreview() {
    if (!selectedId) return;
    setPreviewing(true);
    try {
      const { data } = await api.post<{ html: string; subject: string }>(
        "/api/admin/emails/preview",
        { template_id: selectedId, variables }
      );
      setPreviewHtml(data.html);
      setPreviewSubject(subjectOverride || data.subject);
    } catch {
      toast.error("Failed to render preview");
    } finally {
      setPreviewing(false);
    }
  }

  useEffect(() => {
    if (previewHtml && iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewHtml);
        doc.close();
        setTimeout(() => {
          const body = doc.body;
          if (body) {
            const height = body.scrollHeight + 40;
            iframe.style.height = `${Math.max(400, height)}px`;
          }
        }, 100);
      }
    }
  }, [previewHtml]);

  // Bulk recipient helpers
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function parseBulkLines(raw: string): { email: string; name: string }[] {
    const results: { email: string; name: string }[] = [];
    const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const angleMatch = line.match(/^(.+?)\s*<([^>]+)>\s*$/);
      if (angleMatch) {
        const email = angleMatch[2].trim().toLowerCase();
        if (emailRegex.test(email)) results.push({ email, name: angleMatch[1].trim() });
        continue;
      }
      const parts = line.includes("\t")
        ? line.split("\t").map((p) => p.trim())
        : line.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        if (emailRegex.test(parts[1].toLowerCase())) results.push({ email: parts[1].toLowerCase(), name: parts[0] });
        else if (emailRegex.test(parts[0].toLowerCase())) results.push({ email: parts[0].toLowerCase(), name: parts[1] });
        continue;
      }
      const solo = parts[0].toLowerCase();
      if (emailRegex.test(solo)) results.push({ email: solo, name: "" });
    }
    return results;
  }

  function addBulkRecipients(raw: string) {
    const parsed = parseBulkLines(raw);
    if (parsed.length === 0) return;
    setBulkRecipients((prev) => {
      const existing = new Set(prev.map((r) => r.email));
      const newOnes = parsed.filter((r) => !existing.has(r.email));
      return [...prev, ...newOnes];
    });
    setBulkInput("");
  }

  function removeBulkRecipient(email: string) {
    setBulkRecipients((prev) => prev.filter((r) => r.email !== email));
  }

  // Send
  function openConfirm() {
    if (mode === "single" && !recipientEmail.trim()) { toast.error("Enter a recipient email"); return; }
    if (mode === "bulk" && bulkRecipients.length === 0) { toast.error("Add at least one recipient"); return; }
    setConfirmOpen(true);
  }

  async function handleSend() {
    if (!selectedId) return;
    setSending(true);
    setCampaignResult(null);
    try {
      if (mode === "single") {
        await api.post("/api/admin/emails/send", {
          template_id: selectedId, to: recipientEmail.trim(),
          subject: subjectOverride || undefined, variables, send_via: sendVia,
        });
        toast.success(`Email sent to ${recipientEmail.trim()} via ${sendVia.toUpperCase()}`);
      } else if (mode === "bulk") {
        const { data } = await api.post<{ batch_id: number; status: string; total: number }>(
          "/api/admin/emails/bulk-send", {
            template_id: selectedId, recipients: bulkRecipients,
            subject: subjectOverride || undefined, variables,
            campaign_key: campaignKey.trim() || undefined,
            scheduled_at: scheduledAt || undefined,
            send_via: sendVia,
          }
        );
        toast.success(scheduledAt ? `Scheduled ${data.total} emails` : `Sending ${data.total} emails via ${sendVia.toUpperCase()}...`);
        setBatchStatus({ batch_id: data.batch_id, status: data.status as BatchStatus["status"], total: data.total, sent: 0, skipped: 0, errors: [], sends: [] });
        startBatchPolling(data.batch_id);
      } else {
        if (dryRun) {
          const { data } = await api.post<CampaignResult>("/api/admin/emails/campaign", {
            template_id: selectedId, target, dry_run: true, variables, send_via: sendVia,
          });
          setCampaignResult(data);
          toast.success(`Dry run: ${data.recipients.length} recipients`);
        } else {
          const { data } = await api.post<{ batch_id: number; status: string; total: number }>(
            "/api/admin/emails/campaign", {
              template_id: selectedId, target, dry_run: false, variables, send_via: sendVia,
            }
          );
          toast.success(`Campaign started: sending to ${data.total} users via ${sendVia.toUpperCase()}...`);
          setBatchStatus({ batch_id: data.batch_id, status: data.status as BatchStatus["status"], total: data.total, sent: 0, skipped: 0, errors: [], sends: [] });
          startBatchPolling(data.batch_id);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Send failed";
      toast.error(msg);
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  function startBatchPolling(batchId: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<BatchStatus>(`/api/admin/emails/batch/${batchId}`);
        setBatchStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          fetchBatchHistory();
        }
      } catch { /* retry */ }
    }, 2000);
  }

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const canSend = user?.can_approve_submissions === true;

  // Aggregate stats from batch history
  const totalSent = batchHistory.reduce((sum, b) => sum + b.sent, 0);
  const totalOpened = batchHistory.reduce((sum, b) => sum + (b.status_counts["opened"] || 0) + (b.status_counts["clicked"] || 0), 0);
  const totalClicked = batchHistory.reduce((sum, b) => sum + (b.status_counts["clicked"] || 0), 0);
  const totalBounced = batchHistory.reduce((sum, b) => sum + (b.status_counts["bounced"] || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <IconMail className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Campaigns</h2>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
              <div className="h-3 w-16 bg-muted rounded mb-2" />
              <div className="h-7 w-10 bg-muted rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconMail className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Campaigns</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={leadsOpen ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => {
              setLeadsOpen(!leadsOpen);
              if (!leadsOpen && leads.length === 0) refreshLeads();
            }}
          >
            <IconTarget className="h-4 w-4" />
            Leads
            {filteredLeads.length > 0 && (
              <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] font-medium">
                {filteredLeads.length}
              </span>
            )}
          </Button>
          <Button
            variant={dncOpen ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setDncOpen(!dncOpen)}
          >
            <IconUserOff className="h-4 w-4" />
            Do not contact
            {dncEntries.length > 0 && (
              <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] font-medium">
                {dncEntries.length}
              </span>
            )}
          </Button>
          <Button
            variant={composeOpen ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setComposeOpen(!composeOpen)}
          >
            <IconSend className="h-4 w-4" />
            {composeOpen ? "Close composer" : "New email"}
          </Button>
        </div>
      </div>

      {/* ── Overview stats ── */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <IconSend className="h-3.5 w-3.5" />
            Total sent
          </div>
          <p className="text-2xl font-semibold">{totalSent}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <IconMailOpened className="h-3.5 w-3.5" />
            Opened
          </div>
          <p className="text-2xl font-semibold">
            {totalOpened}
            {totalSent > 0 && <span className="text-sm text-muted-foreground ml-1.5">{Math.round((totalOpened / totalSent) * 100)}%</span>}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <IconClick className="h-3.5 w-3.5" />
            Clicked
          </div>
          <p className="text-2xl font-semibold">
            {totalClicked}
            {totalSent > 0 && <span className="text-sm text-muted-foreground ml-1.5">{Math.round((totalClicked / totalSent) * 100)}%</span>}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <IconBounceRight className="h-3.5 w-3.5" />
            Bounced
          </div>
          <p className="text-2xl font-semibold">
            {totalBounced}
            {totalSent > 0 && <span className="text-sm text-muted-foreground ml-1.5">{Math.round((totalBounced / totalSent) * 100)}%</span>}
          </p>
        </div>
      </div>

      {/* ── Campaign history ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Send history</h3>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search campaigns..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchBatchHistory(historySearch)}
              className="h-8 w-56 text-xs"
            />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fetchBatchHistory(historySearch)}>
              Search
            </Button>
            {historySearch && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setHistorySearch(""); fetchBatchHistory(); }}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {batchHistory.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                  <th className="text-left px-3 py-2 font-medium">Template</th>
                  <th className="text-left px-3 py-2 font-medium">Subject</th>
                  <th className="text-left px-3 py-2 font-medium">Campaign</th>
                  <th className="text-center px-3 py-2 font-medium">Sent</th>
                  <th className="text-center px-3 py-2 font-medium">Opened</th>
                  <th className="text-center px-3 py-2 font-medium">Clicked</th>
                  <th className="text-center px-3 py-2 font-medium">Bounced</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {batchHistory.map((b) => {
                  const tmplName = templates.find((t) => t.id === b.template_id)?.name || b.template_id;
                  const opened = (b.status_counts["opened"] || 0) + (b.status_counts["clicked"] || 0);
                  const clicked = b.status_counts["clicked"] || 0;
                  const bounced = b.status_counts["bounced"] || 0;
                  const isExpanded = expandedBatch === b.batch_id;
                  return (
                    <React.Fragment key={b.batch_id}>
                      <tr
                        onClick={() => toggleBatchDrilldown(b.batch_id)}
                        className={`border-b border-border hover:bg-muted/20 cursor-pointer ${isExpanded ? "bg-muted/10" : ""}`}
                      >
                        <td className="px-3 py-2 font-medium">{tmplName}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{b.subject}</td>
                        <td className="px-3 py-2">
                          {b.campaign_key ? (
                            <span className="inline-block bg-muted px-2 py-0.5 text-xs">{b.campaign_key}</span>
                          ) : (
                            <span className="text-muted-foreground/40">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">{b.sent}</td>
                        <td className="px-3 py-2 text-center">{opened > 0 ? opened : <span className="text-muted-foreground/40">&mdash;</span>}</td>
                        <td className="px-3 py-2 text-center">{clicked > 0 ? clicked : <span className="text-muted-foreground/40">&mdash;</span>}</td>
                        <td className="px-3 py-2 text-center">{bounced > 0 ? <span className="text-destructive">{bounced}</span> : <span className="text-muted-foreground/40">&mdash;</span>}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium ${
                            b.status === "completed" ? "bg-green-500/10 text-green-600" :
                            b.status === "failed" ? "bg-destructive/10 text-destructive" :
                            b.status === "processing" ? "bg-primary/10 text-primary" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {b.created_at ? new Date(b.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                          }) : <span className="text-muted-foreground/40">&mdash;</span>}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="px-0 py-0">
                            <div className="bg-muted/20 px-4 py-3 border-b border-border">
                              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {expandedSends.length} recipient{expandedSends.length !== 1 ? "s" : ""}
                                </p>
                                {canSend && expandedSends.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1.5"
                                      onClick={(e) => { e.stopPropagation(); startFollowUp(expandedSends, "openers"); }}
                                    >
                                      <IconArrowForward className="h-3.5 w-3.5" />
                                      Follow up openers
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1.5"
                                      onClick={(e) => { e.stopPropagation(); startFollowUp(expandedSends, "non_openers"); }}
                                    >
                                      <IconArrowForward className="h-3.5 w-3.5" />
                                      Follow up non-openers
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1 pr-3 font-medium">Email</th>
                                      <th className="text-left py-1 pr-3 font-medium">Name</th>
                                      <th className="text-left py-1 pr-3 font-medium">Status</th>
                                      <th className="text-left py-1 pr-3 font-medium">Opened</th>
                                      <th className="text-left py-1 font-medium">Clicked</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedSends.map((s) => (
                                      <tr key={s.email} className="border-t border-border/30">
                                        <td className="py-1.5 pr-3 font-mono">{s.email}</td>
                                        <td className="py-1.5 pr-3">{s.name || <span className="text-muted-foreground/40">&mdash;</span>}</td>
                                        <td className="py-1.5 pr-3">
                                          <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium ${
                                            s.status === "opened" || s.status === "clicked" ? "bg-green-500/10 text-green-600" :
                                            s.status === "sent" || s.status === "delivered" ? "bg-blue-500/10 text-blue-600" :
                                            s.status === "bounced" || s.status === "failed" ? "bg-destructive/10 text-destructive" :
                                            "bg-muted text-muted-foreground"
                                          }`}>
                                            {s.status}
                                          </span>
                                        </td>
                                        <td className="py-1.5 pr-3">{s.opened_at ? new Date(s.opened_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : <span className="text-muted-foreground/40">&mdash;</span>}</td>
                                        <td className="py-1.5">{s.clicked_at ? new Date(s.clicked_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : <span className="text-muted-foreground/40">&mdash;</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No campaigns sent yet. Click &ldquo;New email&rdquo; to get started.</p>
        )}
      </div>

      {/* ── Leads browser (collapsible) ── */}
      {leadsOpen && (
        <div className="rounded-lg border border-border p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <IconTarget className="h-4 w-4 text-muted-foreground" />
                Leads
                <span className="text-[11px] font-normal text-muted-foreground">
                  signed up but never used the founder code
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Filter, select, and load straight into the composer with the founder offer template.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={refreshLeads}
                disabled={leadsLoading}
                title="Reload from server"
              >
                <IconRefresh className={`h-3.5 w-3.5 ${leadsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <button onClick={() => setLeadsOpen(false)} className="text-muted-foreground hover:text-foreground">
                <IconX className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Segment chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: "untouched", label: "Never used app", icon: IconBolt },
              { id: "recent", label: "Last 30 days", icon: IconClock },
              { id: "opt_in", label: "Marketing opt-in", icon: IconCheck },
              { id: "all", label: "All users", icon: IconUsers },
            ] as { id: LeadSegment; label: string; icon: typeof IconBolt }[]).map((s) => {
              const active = leadSegment === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setLeadSegment(s.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Toggles + search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by email or name..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconFilter className="h-3.5 w-3.5" />
              <span>Hide:</span>
            </div>
            {([
              { key: "apple", label: "Apple SSO", value: hideAppleRelay, set: setHideAppleRelay, icon: IconBrandApple },
              { key: "paid", label: "Paid", value: hidePaid, set: setHidePaid, icon: IconCrown },
              { key: "dnc", label: "DNC", value: hideDnc, set: setHideDnc, icon: IconUserOff },
            ] as { key: string; label: string; value: boolean; set: (v: boolean) => void; icon: typeof IconBolt }[]).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => t.set(!t.value)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                    t.value
                      ? "bg-muted border-border text-foreground"
                      : "border-dashed border-border/60 text-muted-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
            <button
              onClick={() => setRequireOptIn(!requireOptIn)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                requireOptIn
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "border-dashed border-border/60 text-muted-foreground/60 hover:text-foreground"
              }`}
              title="Only show users who opted into marketing"
            >
              <IconCheck className="h-3 w-3" />
              Opt-in only
            </button>
          </div>

          {/* Stats bar + bulk actions */}
          <div className="flex items-center justify-between text-xs">
            <p className="text-muted-foreground">
              <span className="text-foreground font-medium">{filteredLeads.length}</span> eligible
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {leads.length} total
              {selectedLeadIds.size > 0 && (
                <>
                  <span className="mx-1.5 text-muted-foreground/50">·</span>
                  <span className="text-primary font-medium">{selectedLeadIds.size} selected</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              {selectedLeadIds.size > 0 && (
                <button
                  onClick={() => setSelectedLeadIds(new Set())}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
              )}
              {canSend && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={loadLeadsIntoComposer}
                  disabled={selectedLeadIds.size === 0}
                >
                  <IconArrowForward className="h-3.5 w-3.5" />
                  Load {selectedLeadIds.size > 0 ? selectedLeadIds.size : ""} into composer
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          {leadsLoading ? (
            <div className="space-y-1.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-9 bg-muted/40 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredLeads.length > 0 ? (
            <div className="rounded-lg border border-border max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium w-8">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="rounded border-border"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Joined</th>
                    <th className="text-left px-3 py-2 font-medium">Tier</th>
                    <th className="text-left px-3 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((l) => {
                    const checked = selectedLeadIds.has(l.id);
                    return (
                      <tr
                        key={l.id}
                        onClick={() => toggleLead(l.id)}
                        className={`border-t border-border/40 cursor-pointer hover:bg-muted/20 ${
                          checked ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLead(l.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-3 py-1.5 font-mono">{l.email}</td>
                        <td className="px-3 py-1.5">
                          {l.name || <span className="text-muted-foreground/40">&mdash;</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {l.created_at
                            ? new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
                            : <span className="text-muted-foreground/40">&mdash;</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {l.tier_name ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              l.is_active_paid
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {l.tier_name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">&mdash;</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            {l.is_apple_relay && (
                              <span className="inline-flex items-center gap-0.5 bg-muted px-1 py-0.5 rounded text-[9px] text-muted-foreground" title="Apple Hide-My-Email">
                                <IconBrandApple className="h-2.5 w-2.5" />
                                relay
                              </span>
                            )}
                            {l.on_dnc && (
                              <span className="inline-flex items-center gap-0.5 bg-destructive/10 text-destructive px-1 py-0.5 rounded text-[9px]" title="On do-not-contact">
                                <IconUserOff className="h-2.5 w-2.5" />
                                dnc
                              </span>
                            )}
                            {l.marketing_opt_in && (
                              <span className="inline-flex items-center gap-0.5 bg-green-500/10 text-green-600 px-1 py-0.5 rounded text-[9px]" title="Marketing opt-in">
                                <IconCheck className="h-2.5 w-2.5" />
                                opt-in
                              </span>
                            )}
                            {l.total_scripts_uploaded > 0 && (
                              <span className="inline-flex items-center gap-0.5 bg-blue-500/10 text-blue-600 px-1 py-0.5 rounded text-[9px]" title={`${l.total_scripts_uploaded} script(s) uploaded`}>
                                {l.total_scripts_uploaded}↑
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No leads match these filters. Try toggling the &ldquo;Hide&rdquo; switches off.
            </p>
          )}
        </div>
      )}

      {/* ── Do-not-contact section (collapsible) ── */}
      {dncOpen && (
        <div className="rounded-lg border border-border p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <IconUserOff className="h-4 w-4 text-muted-foreground" />
                Do not contact list
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                These emails are auto-skipped by every bulk send and campaign. Add friends, test accounts, etc.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canSend && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={autoDncAppleRelay}
                  disabled={autoDncLoading}
                  title="Bulk-add every Apple Hide-My-Email user"
                >
                  <IconBrandApple className="h-3.5 w-3.5" />
                  {autoDncLoading ? "Adding..." : "Auto-add Apple SSO"}
                </Button>
              )}
              <button onClick={() => setDncOpen(false)} className="text-muted-foreground hover:text-foreground">
                <IconX className="h-4 w-4" />
              </button>
            </div>
          </div>

          {canSend && (
            <div>
              <Label className="text-xs">Add emails (one per line)</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                Same formats as bulk paste: <code className="bg-muted px-1 rounded">Name, email</code>{" "}
                <code className="bg-muted px-1 rounded">email</code>{" "}
                <code className="bg-muted px-1 rounded">{"Name <email>"}</code> or tab-separated
              </p>
              <div className="flex gap-2 items-end">
                <Textarea
                  placeholder={"friend@example.com\nJane Doe, jane@example.com"}
                  value={dncInput}
                  onChange={(e) => setDncInput(e.target.value)}
                  rows={3}
                  className="text-sm font-mono"
                />
                <Button
                  variant="secondary"
                  onClick={() => addDncEntries(dncInput)}
                  disabled={!dncInput.trim() || dncLoading}
                  className="gap-1.5"
                >
                  <IconPlus className="h-4 w-4" />
                  {dncLoading ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          )}

          {dncEntries.length > 0 ? (
            <div className="rounded-lg border border-border max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Added</th>
                    <th className="text-right px-3 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {dncEntries.map((e) => (
                    <tr key={e.id} className="border-t border-border/40">
                      <td className="px-3 py-1.5 font-mono">{e.email}</td>
                      <td className="px-3 py-1.5">{e.name || <span className="text-muted-foreground/40">&mdash;</span>}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {e.added_at
                          ? new Date(e.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : <span className="text-muted-foreground/40">&mdash;</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {canSend && (
                          <button
                            onClick={() => removeDncEntry(e.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No emails on the do-not-contact list yet.</p>
          )}
        </div>
      )}

      {/* ── Compose section (collapsible) ── */}
      {composeOpen && canSend && (
        <div ref={composeRef} className="rounded-lg border border-border p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Compose</h3>
            <button onClick={() => setComposeOpen(false)} className="text-muted-foreground hover:text-foreground">
              <IconX className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Template picker */}
            <div className="lg:col-span-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Template</Label>
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                    selectedId === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="font-medium text-xs">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                </button>
              ))}
            </div>

            {/* Variables + Preview */}
            <div className="lg:col-span-9 space-y-5">
              {selected && (
                <>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    {/* Variable form */}
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="subject" className="text-xs">Subject line</Label>
                        <Input
                          id="subject"
                          placeholder={selected.subject}
                          value={subjectOverride}
                          onChange={(e) => setSubjectOverride(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      {selected.variables.map((v) => (
                        <div key={v.name}>
                          <Label htmlFor={v.name} className="text-xs">
                            {v.label}
                            {v.required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                          {v.type === "text" && String(v.default).length > 60 ? (
                            <Textarea
                              id={v.name} rows={2}
                              value={variables[v.name] ?? ""}
                              onChange={(e) => setVariables((prev) => ({ ...prev, [v.name]: e.target.value }))}
                              className="mt-1"
                            />
                          ) : (
                            <Input
                              id={v.name} type={v.type === "number" ? "number" : "text"}
                              value={variables[v.name] ?? ""}
                              onChange={(e) => setVariables((prev) => ({ ...prev, [v.name]: e.target.value }))}
                              className="mt-1"
                            />
                          )}
                        </div>
                      ))}
                      <Button onClick={handlePreview} disabled={previewing} className="w-full gap-2" variant="secondary">
                        <IconEye className="h-4 w-4" />
                        {previewing ? "Rendering..." : "Preview"}
                      </Button>
                    </div>

                    {/* Preview pane */}
                    <div className="rounded-lg border border-border overflow-hidden">
                      {previewHtml ? (
                        <div className="flex flex-col h-full">
                          <div className="bg-muted/40 px-3 py-2 border-b border-border text-xs text-muted-foreground">
                            Subject: <span className="text-foreground font-medium">{previewSubject}</span>
                          </div>
                          <iframe
                            ref={iframeRef}
                            title="Email preview"
                            className="w-full flex-1 bg-white"
                            style={{ minHeight: 400 }}
                            sandbox="allow-same-origin"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                          Click &ldquo;Preview&rdquo; to render
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Send controls */}
                  <div className="rounded-lg border border-border p-4 space-y-4">
                    <div className="flex gap-2">
                      <Button variant={mode === "single" ? "default" : "outline"} size="sm" className="gap-2" onClick={() => setMode("single")}>
                        <IconUser className="h-4 w-4" /> Single
                      </Button>
                      <Button variant={mode === "bulk" ? "default" : "outline"} size="sm" className="gap-2" onClick={() => setMode("bulk")}>
                        <IconUsersGroup className="h-4 w-4" /> Bulk
                      </Button>
                      <Button variant={mode === "campaign" ? "default" : "outline"} size="sm" className="gap-2" onClick={() => setMode("campaign")}>
                        <IconUsers className="h-4 w-4" /> Campaign
                      </Button>
                      <div className="ml-auto flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Send via:</span>
                        <Button variant={sendVia === "smtp" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5" onClick={() => setSendVia("smtp")}>
                          Gmail
                        </Button>
                        <Button variant={sendVia === "resend" ? "default" : "outline"} size="sm" className="h-7 text-xs px-2.5" onClick={() => setSendVia("resend")}>
                          Resend
                        </Button>
                      </div>
                    </div>

                    {mode === "single" ? (
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <Label htmlFor="recipient" className="text-xs">Recipient email</Label>
                          <Input id="recipient" type="email" placeholder="user@example.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="mt-1" />
                        </div>
                        <Button onClick={openConfirm} disabled={sending} className="gap-2">
                          <IconSend className="h-4 w-4" /> Send
                        </Button>
                      </div>
                    ) : mode === "bulk" ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Paste recipients (one per line)</Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                            Supports: <code className="bg-muted px-1 rounded">Name, email</code>{" "}
                            <code className="bg-muted px-1 rounded">email</code>{" "}
                            <code className="bg-muted px-1 rounded">{"Name <email>"}</code>{" "}
                            or tab-separated
                          </p>
                          <div className="flex gap-2 items-end">
                            <Textarea placeholder={"Jane Doe, jane@example.com\njohn@example.com"} value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} rows={3} className="text-sm font-mono" />
                            <Button variant="secondary" onClick={() => addBulkRecipients(bulkInput)} disabled={!bulkInput.trim()}>Add</Button>
                          </div>
                        </div>
                        {bulkRecipients.length > 0 && (
                          <div className="rounded-lg border border-border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-muted-foreground">{bulkRecipients.length} recipient{bulkRecipients.length !== 1 && "s"}</p>
                              <button onClick={() => setBulkRecipients([])} className="text-xs text-destructive hover:underline">Clear all</button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                              {bulkRecipients.map((r) => (
                                <span key={r.email} className="inline-flex items-center gap-1 bg-muted px-2.5 py-1 text-xs">
                                  {r.name ? <><span className="font-medium">{r.name}</span> <span className="text-muted-foreground">{r.email}</span></> : r.email}
                                  <button onClick={() => removeBulkRecipient(r.email)} className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"><IconX className="h-3 w-3" /></button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="campaign-key" className="text-xs">Campaign key (optional)</Label>
                            <Input id="campaign-key" placeholder="e.g. scenepartner-launch" value={campaignKey} onChange={(e) => setCampaignKey(e.target.value)} className="mt-1" />
                          </div>
                          <div>
                            <Label htmlFor="scheduled-at" className="text-xs flex items-center gap-1"><IconClock className="h-3 w-3" /> Schedule (optional)</Label>
                            <Input id="scheduled-at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1" />
                          </div>
                        </div>
                        <Button onClick={openConfirm} disabled={sending || bulkRecipients.length === 0} className="gap-2">
                          <IconSend className="h-4 w-4" />
                          {scheduledAt ? `Schedule ${bulkRecipients.length}` : `Send to ${bulkRecipients.length}`} email{bulkRecipients.length !== 1 ? "s" : ""}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-3 items-end">
                          <div>
                            <Label htmlFor="target" className="text-xs">Target audience</Label>
                            <select id="target" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                              <option value="all">All users (opt-in)</option>
                              <option value="free">Free tier (opt-in)</option>
                              <option value="paid">Paid tier (opt-in)</option>
                              <option value="leads">Leads — never used founder code</option>
                            </select>
                          </div>
                          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded border-border" />
                            Dry run
                          </label>
                          <Button onClick={openConfirm} disabled={sending} className="gap-2" variant={dryRun ? "secondary" : "default"}>
                            <IconSend className="h-4 w-4" />
                            {dryRun ? "Preview recipients" : "Send campaign"}
                          </Button>
                        </div>

                        {campaignResult && dryRun && (
                          <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                            <p className="font-medium">Would send to {campaignResult.recipients.length} recipients:</p>
                            <ul className="text-xs text-muted-foreground max-h-40 overflow-y-auto space-y-0.5">
                              {campaignResult.recipients.map((r) => <li key={r}>{r}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Batch progress (shared across modes) */}
                    {batchStatus && (
                      <div className="rounded-lg border border-border p-3 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {batchStatus.status === "completed" ? "Complete" : batchStatus.status === "failed" ? "Failed" : batchStatus.status === "processing" ? "Sending..." : "Pending..."}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {batchStatus.sent} / {batchStatus.total} sent
                            {batchStatus.skipped > 0 && ` | ${batchStatus.skipped} skipped`}
                          </span>
                        </div>
                        {batchStatus.total > 0 && (
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                batchStatus.status === "failed" ? "bg-destructive" : batchStatus.status === "completed" ? "bg-green-500" : "bg-primary"
                              }`}
                              style={{ width: `${Math.round(((batchStatus.sent + batchStatus.skipped) / batchStatus.total) * 100)}%` }}
                            />
                          </div>
                        )}
                        {batchStatus.errors.length > 0 && (
                          <div className="text-destructive text-xs space-y-0.5">
                            {batchStatus.errors.map((e, i) => <p key={i}>{e}</p>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "single" ? "Confirm send" : mode === "bulk" ? `Send to ${bulkRecipients.length} recipients?` : dryRun ? "Run dry-run?" : "Confirm campaign send"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2 py-2">
            <p><span className="text-muted-foreground">Template:</span> {selected?.name}</p>
            {mode === "single" ? (
              <p><span className="text-muted-foreground">To:</span> {recipientEmail}</p>
            ) : mode === "bulk" ? (
              <div>
                <p className="text-muted-foreground mb-1">To:</p>
                <div className="max-h-28 overflow-y-auto text-xs space-y-0.5">
                  {bulkRecipients.map((r) => <p key={r.email}>{r.name ? `${r.name} (${r.email})` : r.email}</p>)}
                </div>
              </div>
            ) : (
              <p><span className="text-muted-foreground">Target:</span> {target} {dryRun && "(dry run)"}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending} variant={(mode === "campaign" && !dryRun) || mode === "bulk" ? "destructive" : "default"}>
              {sending ? "Sending..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
