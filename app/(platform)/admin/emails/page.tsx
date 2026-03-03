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
  const [mode, setMode] = useState<"single" | "campaign">("single");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [target, setTarget] = useState("all");
  const [dryRun, setDryRun] = useState(true);

  // Dialogs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [campaignResult, setCampaignResult] = useState<CampaignResult | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  // Fetch templates
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
  }, []);

  function _initVars(tmpl: TemplateMeta) {
    const init: Record<string, string> = {};
    for (const v of tmpl.variables) {
      init[v.name] = String(v.default ?? "");
    }
    setVariables(init);
    setSubjectOverride("");
    setPreviewHtml(null);
    setCampaignResult(null);
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

  // Write HTML into iframe
  useEffect(() => {
    if (previewHtml && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(previewHtml);
        doc.close();
      }
    }
  }, [previewHtml]);

  // Send
  function openConfirm() {
    if (mode === "single" && !recipientEmail.trim()) {
      toast.error("Enter a recipient email");
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
                        style={{ minHeight: 500 }}
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
                      Single user
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
                            <option value="free">Free tier only</option>
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

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "single"
                ? "Confirm send"
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
              variant={mode === "campaign" && !dryRun ? "destructive" : "default"}
            >
              {sending ? "Sending..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
