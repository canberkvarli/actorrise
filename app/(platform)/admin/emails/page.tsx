"use client";

import { useEffect, useRef, useState } from "react";
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

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdminEmailsPage() {
  const { user } = useAuth();

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
  const [mode, setMode] = useState<"single" | "bulk" | "campaign">("single");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [bulkRecipients, setBulkRecipients] = useState<{ email: string; name: string }[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [target, setTarget] = useState("all");
  const [dryRun, setDryRun] = useState(true);

  // Bulk extras
  const [campaignKey, setCampaignKey] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  // Batch progress
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sent history
  const [batchHistory, setBatchHistory] = useState<BatchHistoryItem[]>([]);

  // Dialogs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [campaignResult, setCampaignResult] = useState<CampaignResult | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  // Fetch templates + batch history
  useEffect(() => {
    api
      .get<TemplateMeta[]>("/api/admin/emails/templates")
      .then(({ data }) => {
        setTemplates(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
          _initVars(data[0]);
        }
      })
      .catch(() => toast.error("Failed to load email templates"));

    fetchBatchHistory();
  }, []);

  function fetchBatchHistory() {
    api
      .get<BatchHistoryItem[]>("/api/admin/emails/batches")
      .then(({ data }) => setBatchHistory(data))
      .catch(() => {});
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

  // Write HTML into iframe and auto-resize to fit content
  useEffect(() => {
    if (previewHtml && iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewHtml);
        doc.close();
        // Wait for content to render, then resize iframe to fit
        setTimeout(() => {
          const body = doc.body;
          if (body) {
            const height = body.scrollHeight + 40;
            iframe.style.height = `${Math.max(600, height)}px`;
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
      // Format: Name <email>
      const angleMatch = line.match(/^(.+?)\s*<([^>]+)>\s*$/);
      if (angleMatch) {
        const email = angleMatch[2].trim().toLowerCase();
        if (emailRegex.test(email)) {
          results.push({ email, name: angleMatch[1].trim() });
        }
        continue;
      }

      // Format: tab-separated (from spreadsheets) or comma-separated: Name, email OR email, Name
      const parts = line.includes("\t")
        ? line.split("\t").map((p) => p.trim())
        : line.split(",").map((p) => p.trim());

      if (parts.length >= 2) {
        // Figure out which part is the email
        if (emailRegex.test(parts[1].toLowerCase())) {
          results.push({ email: parts[1].toLowerCase(), name: parts[0] });
        } else if (emailRegex.test(parts[0].toLowerCase())) {
          results.push({ email: parts[0].toLowerCase(), name: parts[1] });
        }
        continue;
      }

      // Just an email
      const solo = parts[0].toLowerCase();
      if (emailRegex.test(solo)) {
        results.push({ email: solo, name: "" });
      }
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
    if (mode === "single" && !recipientEmail.trim()) {
      toast.error("Enter a recipient email");
      return;
    }
    if (mode === "bulk" && bulkRecipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    setConfirmOpen(true);
  }

  async function handleSend() {
    if (!selectedId) return;
    setSending(true);
    setCampaignResult(null);
    try {
      if (mode === "single") {
        await api.post("/api/admin/emails/send", {
          template_id: selectedId,
          to: recipientEmail.trim(),
          subject: subjectOverride || undefined,
          variables,
        });
        toast.success(`Email sent to ${recipientEmail.trim()}`);
      } else if (mode === "bulk") {
        const { data } = await api.post<{ batch_id: number; status: string; total: number }>(
          "/api/admin/emails/bulk-send",
          {
            template_id: selectedId,
            recipients: bulkRecipients,
            subject: subjectOverride || undefined,
            variables,
            campaign_key: campaignKey.trim() || undefined,
            scheduled_at: scheduledAt || undefined,
          }
        );
        toast.success(scheduledAt ? `Scheduled ${data.total} emails` : `Sending ${data.total} emails...`);
        // Start polling for batch progress
        setBatchStatus({
          batch_id: data.batch_id,
          status: data.status as BatchStatus["status"],
          total: data.total,
          sent: 0,
          skipped: 0,
          errors: [],
          sends: [],
        });
        startBatchPolling(data.batch_id);
      } else {
        const { data } = await api.post<CampaignResult>(
          "/api/admin/emails/campaign",
          {
            template_id: selectedId,
            target,
            dry_run: dryRun,
            variables,
          }
        );
        setCampaignResult(data);
        if (dryRun) {
          toast.success(`Dry run: ${data.recipients.length} recipients`);
        } else {
          toast.success(`Campaign sent: ${data.sent} emails`);
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
        const { data } = await api.get<BatchStatus>(
          `/api/admin/emails/batch/${batchId}`
        );
        setBatchStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          fetchBatchHistory();
        }
      } catch {
        // silently retry
      }
    }, 2000);
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const canSend = user?.can_approve_submissions === true;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconMail className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Email Templates</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Sidebar: template list ── */}
        <div className="lg:col-span-3 space-y-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTemplate(t.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                selectedId === t.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.description}
              </p>
            </button>
          ))}
        </div>

        {/* ── Main area ── */}
        <div className="lg:col-span-9 space-y-6">
          {selected ? (
            <>
              {/* Variable form + Preview side by side */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Variable form */}
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <p className="font-medium text-sm">
                    Variables — {selected.name}
                  </p>

                  {/* Subject override */}
                  <div>
                    <Label htmlFor="subject" className="text-xs">
                      Subject line
                    </Label>
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
                        {v.required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </Label>
                      {v.type === "text" &&
                      String(v.default).length > 60 ? (
                        <Textarea
                          id={v.name}
                          rows={3}
                          value={variables[v.name] ?? ""}
                          onChange={(e) =>
                            setVariables((prev) => ({
                              ...prev,
                              [v.name]: e.target.value,
                            }))
                          }
                          className="mt-1"
                        />
                      ) : (
                        <Input
                          id={v.name}
                          type={v.type === "number" ? "number" : "text"}
                          value={variables[v.name] ?? ""}
                          onChange={(e) =>
                            setVariables((prev) => ({
                              ...prev,
                              [v.name]: e.target.value,
                            }))
                          }
                          className="mt-1"
                        />
                      )}
                    </div>
                  ))}

                  <Button
                    onClick={handlePreview}
                    disabled={previewing}
                    className="w-full gap-2"
                    variant="secondary"
                  >
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
                        style={{ minHeight: 700 }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                      Click &ldquo;Preview&rdquo; to render the template
                    </div>
                  )}
                </div>
              </div>

              {/* ── Send controls ── */}
              {canSend && (
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <p className="font-medium text-sm">Send</p>

                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <Button
                      variant={mode === "single" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setMode("single")}
                    >
                      <IconUser className="h-4 w-4" />
                      Single
                    </Button>
                    <Button
                      variant={mode === "bulk" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setMode("bulk")}
                    >
                      <IconUsersGroup className="h-4 w-4" />
                      Bulk
                    </Button>
                    <Button
                      variant={mode === "campaign" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setMode("campaign")}
                    >
                      <IconUsers className="h-4 w-4" />
                      Campaign
                    </Button>
                  </div>

                  {mode === "single" ? (
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <Label htmlFor="recipient" className="text-xs">
                          Recipient email
                        </Label>
                        <Input
                          id="recipient"
                          type="email"
                          placeholder="user@example.com"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <Button
                        onClick={openConfirm}
                        disabled={sending}
                        className="gap-2"
                      >
                        <IconSend className="h-4 w-4" />
                        Send
                      </Button>
                    </div>
                  ) : mode === "bulk" ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">
                          Paste recipients (one per line)
                        </Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                          Supports: <code className="bg-muted px-1 rounded">Name, email</code>{" "}
                          <code className="bg-muted px-1 rounded">email</code>{" "}
                          <code className="bg-muted px-1 rounded">{"Name <email>"}</code>{" "}
                          or tab-separated from a spreadsheet
                        </p>
                        <div className="flex gap-2 items-end">
                          <Textarea
                            placeholder={"Jane Doe, jane@example.com\njohn@example.com\nAlex Smith <alex@example.com>"}
                            value={bulkInput}
                            onChange={(e) => setBulkInput(e.target.value)}
                            rows={3}
                            className="text-sm font-mono"
                          />
                          <Button
                            variant="secondary"
                            onClick={() => addBulkRecipients(bulkInput)}
                            disabled={!bulkInput.trim()}
                          >
                            Add
                          </Button>
                        </div>
                      </div>

                      {bulkRecipients.length > 0 && (
                        <div className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              {bulkRecipients.length} recipient{bulkRecipients.length !== 1 && "s"}
                            </p>
                            <button
                              onClick={() => setBulkRecipients([])}
                              className="text-xs text-destructive hover:underline"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                            {bulkRecipients.map((r) => (
                              <span
                                key={r.email}
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                              >
                                {r.name ? (
                                  <>
                                    <span className="font-medium">{r.name}</span>
                                    <span className="text-muted-foreground">{r.email}</span>
                                  </>
                                ) : (
                                  r.email
                                )}
                                <button
                                  onClick={() => removeBulkRecipient(r.email)}
                                  className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                                >
                                  <IconX className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Campaign key & scheduling */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="campaign-key" className="text-xs">
                            Campaign key (optional)
                          </Label>
                          <Input
                            id="campaign-key"
                            placeholder="e.g. backstage-march-2026"
                            value={campaignKey}
                            onChange={(e) => setCampaignKey(e.target.value)}
                            className="mt-1"
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Prevents sending the same campaign to the same person twice
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="scheduled-at" className="text-xs flex items-center gap-1">
                            <IconClock className="h-3 w-3" />
                            Schedule for later (optional)
                          </Label>
                          <Input
                            id="scheduled-at"
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <Button
                        onClick={openConfirm}
                        disabled={sending || bulkRecipients.length === 0}
                        className="gap-2"
                      >
                        <IconSend className="h-4 w-4" />
                        {scheduledAt
                          ? `Schedule ${bulkRecipients.length} email${bulkRecipients.length !== 1 ? "s" : ""}`
                          : `Send to ${bulkRecipients.length} recipient${bulkRecipients.length !== 1 ? "s" : ""}`}
                      </Button>

                      {/* Batch progress */}
                      {batchStatus && (
                        <div className="rounded-lg border border-border p-3 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {batchStatus.status === "completed"
                                ? "Batch complete"
                                : batchStatus.status === "failed"
                                  ? "Batch failed"
                                  : batchStatus.status === "processing"
                                    ? "Sending..."
                                    : "Pending..."}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {batchStatus.sent} / {batchStatus.total} sent
                              {batchStatus.skipped > 0 && ` | ${batchStatus.skipped} skipped`}
                            </span>
                          </div>

                          {/* Progress bar */}
                          {batchStatus.total > 0 && (
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  batchStatus.status === "failed"
                                    ? "bg-destructive"
                                    : batchStatus.status === "completed"
                                      ? "bg-green-500"
                                      : "bg-primary"
                                }`}
                                style={{
                                  width: `${Math.round(
                                    ((batchStatus.sent + batchStatus.skipped) /
                                      batchStatus.total) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>
                          )}

                          {/* Tracking stats (after completion) */}
                          {batchStatus.status === "completed" &&
                            batchStatus.sends.length > 0 && (
                              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                <div className="rounded-lg bg-muted/50 p-2">
                                  <p className="text-lg font-semibold text-foreground">
                                    {batchStatus.sends.filter((s) => s.status === "sent" || s.status === "delivered" || s.status === "opened" || s.status === "clicked").length}
                                  </p>
                                  <p className="text-muted-foreground">Delivered</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 p-2">
                                  <p className="text-lg font-semibold text-foreground">
                                    {batchStatus.sends.filter((s) => s.status === "opened" || s.status === "clicked").length}
                                  </p>
                                  <p className="text-muted-foreground">Opened</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 p-2">
                                  <p className="text-lg font-semibold text-foreground">
                                    {batchStatus.sends.filter((s) => s.status === "clicked").length}
                                  </p>
                                  <p className="text-muted-foreground">Clicked</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 p-2">
                                  <p className="text-lg font-semibold text-foreground">
                                    {batchStatus.sends.filter((s) => s.status === "bounced").length}
                                  </p>
                                  <p className="text-muted-foreground">Bounced</p>
                                </div>
                              </div>
                            )}

                          {/* Errors */}
                          {batchStatus.errors.length > 0 && (
                            <div className="text-destructive text-xs space-y-0.5">
                              {batchStatus.errors.map((e, i) => (
                                <p key={i}>{e}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-3 items-end">
                        <div>
                          <Label htmlFor="target" className="text-xs">
                            Target audience
                          </Label>
                          <select
                            id="target"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          >
                            <option value="all">All opted-in users</option>
                            <option value="all_users">All users (ignore opt-in)</option>
                            <option value="all_free">All free tier (ignore opt-in)</option>
                            <option value="free">Free tier (opted-in only)</option>
                            <option value="paid">Paid tier only</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                          <input
                            type="checkbox"
                            checked={dryRun}
                            onChange={(e) => setDryRun(e.target.checked)}
                            className="rounded border-border"
                          />
                          Dry run
                        </label>
                        <Button
                          onClick={openConfirm}
                          disabled={sending}
                          className="gap-2"
                          variant={dryRun ? "secondary" : "default"}
                        >
                          <IconSend className="h-4 w-4" />
                          {dryRun ? "Preview recipients" : "Send campaign"}
                        </Button>
                      </div>

                      {/* Campaign result */}
                      {campaignResult && (
                        <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                          {dryRun ? (
                            <>
                              <p className="font-medium">
                                Would send to {campaignResult.recipients.length}{" "}
                                recipients:
                              </p>
                              <ul className="text-xs text-muted-foreground max-h-40 overflow-y-auto space-y-0.5">
                                {campaignResult.recipients.map((r) => (
                                  <li key={r}>{r}</li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <>
                              <p>
                                Sent: {campaignResult.sent} | Skipped:{" "}
                                {campaignResult.skipped}
                              </p>
                              {campaignResult.errors.length > 0 && (
                                <div className="text-destructive text-xs">
                                  {campaignResult.errors.map((e, i) => (
                                    <p key={i}>{e}</p>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Select a template from the sidebar
            </div>
          )}
        </div>
      </div>

      {/* ── Recent sends ── */}
      {batchHistory.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <IconSend className="h-4 w-4 text-muted-foreground" />
            Recent sends
          </h3>
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
                  return (
                    <tr key={b.batch_id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{tmplName}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{b.subject}</td>
                      <td className="px-3 py-2">
                        {b.campaign_key ? (
                          <span className="inline-block bg-muted rounded-full px-2 py-0.5 text-xs">{b.campaign_key}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{b.sent}</td>
                      <td className="px-3 py-2 text-center">{opened > 0 ? opened : "—"}</td>
                      <td className="px-3 py-2 text-center">{clicked > 0 ? clicked : "—"}</td>
                      <td className="px-3 py-2 text-center">{bounced > 0 ? <span className="text-destructive">{bounced}</span> : "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
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
                        }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "single"
                ? "Confirm send"
                : mode === "bulk"
                  ? `Send to ${bulkRecipients.length} recipients?`
                  : dryRun
                    ? "Run dry-run?"
                    : "Confirm campaign send"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2 py-2">
            <p>
              <span className="text-muted-foreground">Template:</span>{" "}
              {selected?.name}
            </p>
            {mode === "single" ? (
              <p>
                <span className="text-muted-foreground">To:</span>{" "}
                {recipientEmail}
              </p>
            ) : mode === "bulk" ? (
              <div>
                <p className="text-muted-foreground mb-1">To:</p>
                <div className="max-h-28 overflow-y-auto text-xs space-y-0.5">
                  {bulkRecipients.map((r) => (
                    <p key={r.email}>
                      {r.name ? `${r.name} (${r.email})` : r.email}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <p>
                <span className="text-muted-foreground">Target:</span> {target}{" "}
                {dryRun && "(dry run)"}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              variant={(mode === "campaign" && !dryRun) || mode === "bulk" ? "destructive" : "default"}
            >
              {sending ? "Sending..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
