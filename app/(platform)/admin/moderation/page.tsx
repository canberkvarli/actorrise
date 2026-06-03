"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  IconRefresh,
  IconCircleCheck,
  IconCircleX,
  IconHistory,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
} from "@tabler/icons-react";

export interface SubmissionItem {
  id: number;
  user_id: number;
  submitter_email: string;
  submitter_name: string | null;
  submitted_title: string;
  submitted_text: string;
  submitted_character: string;
  submitted_play_title: string;
  submitted_author: string;
  user_notes: string | null;
  status: string;
  submitted_at: string;
  processed_at: string | null;
  ai_quality_score: number | null;
  ai_copyright_risk: string | null;
  ai_flags: Record<string, unknown> | null;
  ai_moderation_notes: string | null;
  reviewer_id: number | null;
  reviewer_email: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
}

const STATUS_OPTIONS = [
  { value: "manual_review", label: "Manual review" },
  { value: "pending", label: "Pending" },
  { value: "ai_review", label: "AI review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const REJECT_REASONS = [
  { value: "copyright", label: "Copyright" },
  { value: "quality", label: "Quality" },
  { value: "duplicate", label: "Duplicate" },
  { value: "inappropriate", label: "Inappropriate" },
];

function useModerationQueue(status: string) {
  return useQuery({
    queryKey: ["admin-moderation-queue", status],
    queryFn: async () => {
      const res = await api.get<SubmissionItem[]>(
        `/api/admin/moderation/queue?status=${encodeURIComponent(status)}&limit=100`
      );
      return res.data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export default function AdminModerationPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("manual_review");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [approveModal, setApproveModal] = useState<SubmissionItem | null>(null);
  const [rejectModal, setRejectModal] = useState<SubmissionItem | null>(null);
  const [logsModal, setLogsModal] = useState<SubmissionItem | null>(null);
  const [detailEditModal, setDetailEditModal] = useState<SubmissionItem | null>(null);

  const { data: queue = [], isLoading, isError, error, refetch } = useModerationQueue(statusFilter);

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      notes,
    }: {
      id: number;
      notes?: string;
    }) => {
      await api.post(`/api/admin/moderation/${id}/approve`, { notes: notes || null });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
      setApproveModal(null);
      toast.success("Submission approved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({
      id,
      reason,
      details,
    }: {
      id: number;
      reason: string;
      details: string;
    }) => {
      await api.post(`/api/admin/moderation/${id}/reject`, { reason, details });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
      setRejectModal(null);
      toast.success("Submission rejected");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reject");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: {
        submitted_title?: string;
        submitted_text?: string;
        submitted_character?: string;
        submitted_play_title?: string;
        submitted_author?: string;
        user_notes?: string;
      };
    }) => {
      await api.patch(`/api/admin/moderation/${id}`, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
      setDetailEditModal(null);
      toast.success("Submission updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update");
    },
  });

  const canApprove = user?.can_approve_submissions === true;
  const editableStatuses = ["pending", "ai_review", "manual_review"];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Loading queue...
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const message =
      (error as { response?: { status?: number } })?.response?.status === 403
        ? "You don't have permission to view the moderation queue."
        : "Failed to load queue.";
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          {message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <CardTitle className="text-base">Moderation queue</CardTitle>
          <div className="flex items-center gap-2 -mx-1 px-1 overflow-x-auto whitespace-nowrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm flex-shrink-0"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 flex-shrink-0">
              <IconRefresh className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          {queue.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No submissions in this status.
            </p>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {queue.map((sub) => (
                  <div
                    key={sub.id}
                    className="border border-border rounded-lg bg-background p-3 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailEditModal(sub)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="font-medium truncate">{sub.submitted_title}</div>
                        <div className="text-muted-foreground text-xs truncate">
                          {sub.submitted_character}
                        </div>
                        <div className="text-muted-foreground text-xs truncate mt-0.5">
                          {sub.submitted_play_title} · {sub.submitted_author}
                        </div>
                      </button>
                      <Badge variant="secondary" className="rounded-none flex-shrink-0">
                        {sub.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate max-w-full">
                        {sub.submitter_name || sub.submitter_email}
                      </span>
                      <span>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                      {sub.ai_quality_score != null && (
                        <span>
                          AI {(sub.ai_quality_score * 100).toFixed(0)}%
                          {sub.ai_copyright_risk && `/${sub.ai_copyright_risk}`}
                        </span>
                      )}
                    </div>
                    {canApprove &&
                      (sub.status === "manual_review" ||
                        sub.status === "pending" ||
                        sub.status === "ai_review") && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="min-h-[44px] gap-1 flex-1"
                            onClick={() => setApproveModal(sub)}
                          >
                            <IconCircleCheck className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="min-h-[44px] gap-1 flex-1"
                            onClick={() => setRejectModal(sub)}
                          >
                            <IconCircleX className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-[44px] gap-1 flex-1"
                        onClick={() => setDetailEditModal(sub)}
                      >
                        <IconEdit className="h-4 w-4" />
                        View / Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-[44px] gap-1 flex-1"
                        onClick={() => setLogsModal(sub)}
                      >
                        <IconHistory className="h-4 w-4" />
                        Logs
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium w-8"></th>
                    <th className="text-left py-2 font-medium">Submitter</th>
                    <th className="text-left py-2 font-medium">Title / Character</th>
                    <th className="text-left py-2 font-medium">Play</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">AI</th>
                    <th className="text-left py-2 font-medium">Submitted</th>
                    <th className="text-left py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((sub) => (
                    <React.Fragment key={sub.id}>
                      <tr
                        className="hidden md:table-row border-b border-border/60 hover:bg-muted/30"
                      >
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(expandedId === sub.id ? null : sub.id)
                            }
                            className="p-0.5"
                          >
                            {expandedId === sub.id ? (
                              <IconChevronDown className="h-4 w-4" />
                            ) : (
                              <IconChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2">
                          <div className="font-medium">
                            {sub.submitter_name || sub.submitter_email}
                          </div>
                          {sub.submitter_name && (
                            <div className="text-muted-foreground text-xs">
                              {sub.submitter_email}
                            </div>
                          )}
                        </td>
                        <td
                          className="py-2 cursor-pointer hover:bg-muted/50 rounded"
                          onClick={() => setDetailEditModal(sub)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDetailEditModal(sub);
                            }
                          }}
                        >
                          <div className="font-medium">{sub.submitted_title}</div>
                          <div className="text-muted-foreground text-xs">
                            {sub.submitted_character}
                          </div>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {sub.submitted_play_title} · {sub.submitted_author}
                        </td>
                        <td className="py-2">
                          <Badge variant="secondary" className="rounded-none">{sub.status}</Badge>
                        </td>
                        <td className="py-2">
                          {sub.ai_quality_score != null && (
                            <span className="text-muted-foreground">
                              {(sub.ai_quality_score * 100).toFixed(0)}%
                            </span>
                          )}
                          {sub.ai_copyright_risk && (
                            <span className="ml-1 text-xs">/{sub.ai_copyright_risk}</span>
                          )}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {new Date(sub.submitted_at).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          {canApprove &&
                            (sub.status === "manual_review" ||
                              sub.status === "pending" ||
                              sub.status === "ai_review") && (
                              <div className="flex gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-xs gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setApproveModal(sub);
                                  }}
                                >
                                  <IconCircleCheck className="h-3 w-3" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectModal(sub);
                                  }}
                                >
                                  <IconCircleX className="h-3 w-3" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          <div className="flex gap-1 flex-wrap mt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailEditModal(sub);
                              }}
                            >
                              <IconEdit className="h-3 w-3" />
                              View / Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogsModal(sub);
                              }}
                            >
                              <IconHistory className="h-3 w-3" />
                              Logs
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === sub.id && (
                        <tr className="hidden md:table-row bg-muted/20">
                          <td colSpan={8} className="py-3 px-4">
                            <div className="space-y-2 text-sm max-h-48 overflow-y-auto break-words">
                              <div>
                                <span className="font-medium text-muted-foreground">
                                  Text:
                                </span>
                                <p className="mt-1 whitespace-pre-wrap break-words border rounded p-2 bg-background">
                                  {sub.submitted_text}
                                </p>
                              </div>
                              {sub.user_notes && (
                                <div>
                                  <span className="font-medium text-muted-foreground">
                                    User notes:
                                  </span>
                                  <p className="mt-1 break-words">{sub.user_notes}</p>
                                </div>
                              )}
                              {sub.ai_moderation_notes && (
                                <div>
                                  <span className="font-medium text-muted-foreground">
                                    AI notes:
                                  </span>
                                  <p className="mt-1 break-words">{sub.ai_moderation_notes}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Approve modal */}
      <ApproveModal
        submission={approveModal}
        onClose={() => setApproveModal(null)}
        onApprove={(notes) => {
          if (approveModal) {
            approveMutation.mutate({ id: approveModal.id, notes });
          }
        }}
        isPending={approveMutation.isPending}
      />

      {/* Reject modal */}
      <RejectModal
        submission={rejectModal}
        onClose={() => setRejectModal(null)}
        onReject={(reason, details) => {
          if (rejectModal) {
            rejectMutation.mutate({
              id: rejectModal.id,
              reason,
              details,
            });
          }
        }}
        isPending={rejectMutation.isPending}
      />

      {/* Detail / Edit modal */}
      <DetailEditModal
        submission={detailEditModal}
        onClose={() => setDetailEditModal(null)}
        onSave={(data) => {
          if (detailEditModal) {
            updateMutation.mutate({ id: detailEditModal.id, data });
          }
        }}
        isPending={updateMutation.isPending}
        canEdit={detailEditModal ? editableStatuses.includes(detailEditModal.status) : false}
      />

      {/* Logs modal */}
      <LogsModal
        submission={logsModal}
        onClose={() => setLogsModal(null)}
      />
    </div>
  );
}

function DetailEditModal({
  submission,
  onClose,
  onSave,
  isPending,
  canEdit,
}: {
  submission: SubmissionItem | null;
  onClose: () => void;
  onSave: (data: {
    submitted_title: string;
    submitted_text: string;
    submitted_character: string;
    submitted_play_title: string;
    submitted_author: string;
    user_notes: string;
  }) => void;
  isPending: boolean;
  canEdit: boolean;
}) {
  const [form, setForm] = useState({
    submitted_title: "",
    submitted_text: "",
    submitted_character: "",
    submitted_play_title: "",
    submitted_author: "",
    user_notes: "",
  });

  // Sync form when submission opens
  React.useEffect(() => {
    if (submission) {
      setForm({
        submitted_title: submission.submitted_title,
        submitted_text: submission.submitted_text,
        submitted_character: submission.submitted_character,
        submitted_play_title: submission.submitted_play_title,
        submitted_author: submission.submitted_author,
        user_notes: submission.user_notes || "",
      });
    }
  }, [submission?.id]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!canEdit) return;
    onSave(form);
  };

  if (!submission) return null;

  return (
    <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md md:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle>Submission #{submission.id}: View / Edit</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Metadata */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4 space-y-2 text-sm">
          <h4 className="font-semibold text-foreground">Metadata</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground break-words">
            <span>Submitter</span>
            <span className="text-foreground">
              {submission.submitter_name || submission.submitter_email} ({submission.submitter_email})
            </span>
            <span>Status</span>
            <span className="text-foreground">{submission.status}</span>
            <span>Submitted</span>
            <span className="text-foreground">
              {new Date(submission.submitted_at).toLocaleString()}
            </span>
            {submission.processed_at && (
              <>
                <span>Processed</span>
                <span className="text-foreground">
                  {new Date(submission.processed_at).toLocaleString()}
                </span>
              </>
            )}
            {submission.ai_quality_score != null && (
              <>
                <span>AI quality score</span>
                <span className="text-foreground">
                  {(submission.ai_quality_score * 100).toFixed(0)}%
                </span>
              </>
            )}
            {submission.ai_copyright_risk && (
              <>
                <span>AI copyright risk</span>
                <span className="text-foreground">{submission.ai_copyright_risk}</span>
              </>
            )}
            {submission.ai_flags && Object.keys(submission.ai_flags).length > 0 && (
              <>
                <span>AI flags</span>
                <span className="text-foreground">
                  {JSON.stringify(submission.ai_flags)}
                </span>
              </>
            )}
            {submission.reviewer_email && (
              <>
                <span>Reviewer</span>
                <span className="text-foreground">{submission.reviewer_email}</span>
              </>
            )}
            {submission.rejection_reason && (
              <>
                <span>Rejection reason</span>
                <span className="text-foreground">
                  {submission.rejection_reason}
                  {submission.rejection_details && ` (${submission.rejection_details})`}
                </span>
              </>
            )}
          </div>
          {submission.ai_moderation_notes && (
            <div className="pt-2 border-t border-border mt-2">
              <span className="text-muted-foreground block mb-1">AI moderation notes</span>
              <p className="text-foreground text-sm">{submission.ai_moderation_notes}</p>
            </div>
          )}
        </div>

        {/* Editable form (same layout as submit-monologue) */}
        <div className="space-y-4">
          <h4 className="font-semibold text-foreground">Monologue details</h4>
          <div className="space-y-3">
            <div>
              <Label>Monologue title</Label>
              <Input
                value={form.submitted_title}
                onChange={(e) => handleChange("submitted_title", e.target.value)}
                placeholder="e.g., Hamlet's Soliloquy"
                className="mt-1"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Character name</Label>
              <Input
                value={form.submitted_character}
                onChange={(e) => handleChange("submitted_character", e.target.value)}
                placeholder="e.g., Hamlet"
                className="mt-1"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Play title</Label>
              <Input
                value={form.submitted_play_title}
                onChange={(e) => handleChange("submitted_play_title", e.target.value)}
                placeholder="e.g., Hamlet"
                className="mt-1"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Author</Label>
              <Input
                value={form.submitted_author}
                onChange={(e) => handleChange("submitted_author", e.target.value)}
                placeholder="e.g., William Shakespeare"
                className="mt-1"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Monologue text</Label>
              <Textarea
                value={form.submitted_text}
                onChange={(e) => handleChange("submitted_text", e.target.value)}
                placeholder="Paste the full monologue text..."
                className="mt-1 min-h-[120px] font-mono text-sm"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>User notes (optional)</Label>
              <Textarea
                value={form.user_notes}
                onChange={(e) => handleChange("user_notes", e.target.value)}
                placeholder="Context from the submitter..."
                className="mt-1"
                rows={2}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 p-4 sm:p-6 pt-0 border-t border-border">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto min-h-[44px]">
            Close
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto min-h-[44px]">
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveModal({
  submission,
  onClose,
  onApprove,
  isPending,
}: {
  submission: SubmissionItem | null;
  onClose: () => void;
  onApprove: (notes?: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve submission</DialogTitle>
        </DialogHeader>
        {submission && (
          <>
            <p className="text-sm text-muted-foreground break-words">
              {submission.submitted_title} · {submission.submitted_character}
            </p>
            <div>
              <Label htmlFor="approve-notes">Notes (optional)</Label>
              <Textarea
                id="approve-notes"
                className="mt-1"
                rows={3}
                placeholder="Optional notes for records..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto min-h-[44px]">
                Cancel
              </Button>
              <Button
                onClick={() => onApprove(notes.trim() || undefined)}
                disabled={isPending}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Approve
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectModal({
  submission,
  onClose,
  onReject,
  isPending,
}: {
  submission: SubmissionItem | null;
  onClose: () => void;
  onReject: (reason: string, details: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("quality");
  const [details, setDetails] = useState("");

  const handleSubmit = () => {
    if (!details.trim()) {
      toast.error("Please provide rejection details.");
      return;
    }
    onReject(reason, details.trim());
  };

  return (
    <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reject submission</DialogTitle>
        </DialogHeader>
        {submission && (
          <>
            <p className="text-sm text-muted-foreground break-words">
              {submission.submitted_title} · {submission.submitted_character}
            </p>
            <div>
              <Label htmlFor="reject-reason">Reason</Label>
              <select
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {REJECT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="reject-details">Details (required)</Label>
              <Textarea
                id="reject-details"
                className="mt-1"
                rows={3}
                placeholder="Explain why this submission is being rejected..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto min-h-[44px]">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={isPending || !details.trim()}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Reject
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LogsModal({
  submission,
  onClose,
}: {
  submission: SubmissionItem | null;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-moderation-logs", submission?.id],
    queryFn: async () => {
      if (!submission) return [];
      const res = await api.get<Array<{
        id: number;
        action: string;
        actor_type: string;
        previous_status: string | null;
        new_status: string;
        reason: string | null;
        created_at: string;
      }>>(`/api/admin/moderation/${submission.id}/logs`);
      return res.data;
    },
    enabled: !!submission?.id,
  });

  return (
    <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Moderation logs</DialogTitle>
        </DialogHeader>
        {submission && (
          <p className="text-sm text-muted-foreground break-words">
            Submission #{submission.id}: {submission.submitted_title}
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {logs.map((log) => (
              <li
                key={log.id}
                className="text-sm border-b border-border/60 pb-2 last:border-0 break-words"
              >
                <span className="font-medium">{log.action}</span>
                <span className="text-muted-foreground">
                  {" "}
                  {log.previous_status} → {log.new_status}
                </span>
                {log.reason && (
                  <p className="mt-1 text-muted-foreground break-words">{log.reason}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto min-h-[44px]">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
