"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  IconCheck,
  IconClock,
  IconX,
  IconSparkles,
  IconExternalLink,
  IconEdit,
  IconFileText,
} from "@tabler/icons-react";
import api from "@/lib/api";
import { motion } from "framer-motion";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";

interface Submission {
  id: number;
  title: string;
  status: "pending" | "ai_review" | "manual_review" | "approved" | "rejected";
  submitted_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
  monologue_id: number | null;
  character_name?: string | null;
  play_title?: string | null;
  author?: string | null;
  text?: string | null;
  notes?: string | null;
}

interface UserScriptSummary {
  id: number;
  title: string;
  author: string;
  original_filename: string;
  processing_status: string;
  num_characters: number;
  num_scenes_extracted: number;
  created_at: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: IconClock,
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    message: "Processing · You'll get an email when analysis is done.",
  },
  ai_review: {
    label: "AI Review",
    icon: IconSparkles,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    message: "Being analyzed · You'll get an email shortly.",
  },
  manual_review: {
    label: "Under Review",
    icon: IconClock,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    message: "A moderator is reviewing it. You'll get an email in 24-48 hours.",
  },
  approved: {
    label: "Approved",
    icon: IconCheck,
    color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    message: "Live and searchable.",
  },
  rejected: {
    label: "Rejected",
    icon: IconX,
    color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    message: null,
  },
};

const EDITABLE_STATUSES = ["pending", "ai_review", "manual_review"];

function formatSubmissionDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SubmissionCard({
  submission,
  onEdit,
}: {
  submission: Submission;
  onEdit: (s: Submission) => void;
}) {
  const config = STATUS_CONFIG[submission.status];
  const canEdit = EDITABLE_STATUSES.includes(submission.status);
  const statusMessage =
    submission.status === "rejected"
      ? `${submission.rejection_reason || "Not specified"}${submission.rejection_details ? ` - ${submission.rejection_details}` : ""}`
      : (config.message ?? "");
  const StatusIcon = config.icon;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-base truncate">{submission.title}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {submission.character_name && submission.play_title
                  ? `${submission.character_name} \u00B7 ${submission.play_title}`
                  : submission.play_title || "-"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={`${config.color} flex items-center gap-1 w-fit`}>
                <StatusIcon className="h-3 w-3 shrink-0" />
                {config.label}
              </Badge>
              {submission.status === "approved" && submission.monologue_id && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/monologue/${submission.monologue_id}`}>
                    <IconExternalLink className="h-3.5 w-3.5 mr-1" />
                    View
                  </Link>
                </Button>
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onEdit(submission)}
                >
                  <IconEdit className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <span className="shrink-0">
              Submitted {formatSubmissionDate(submission.submitted_at)}
            </span>
            <span className="text-border">{"\u00B7"}</span>
            <span
              className={
                submission.status === "rejected"
                  ? "text-red-600 dark:text-red-400"
                  : undefined
              }
            >
              {statusMessage}
            </span>
            {submission.status === "approved" && submission.processed_at && (
              <>
                <span className="text-border">{"\u00B7"}</span>
                <span>Processed {formatSubmissionDate(submission.processed_at)}</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatScriptDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MySubmissionsPage() {
  const queryClient = useQueryClient();
  const [submissionsTab, setSubmissionsTab] = useState<"monologues" | "scripts">("monologues");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: async () => {
      const response = await api.get<Submission[]>("/api/monologues/my-submissions");
      return response.data;
    },
    staleTime: 0,
  });

  const { data: scripts = [], isLoading: isLoadingScripts } = useQuery({
    queryKey: ["user-scripts"],
    queryFn: async () => {
      const response = await api.get<UserScriptSummary[]>("/api/scripts/");
      return response.data;
    },
    enabled: SCRIPTS_FEATURE_ENABLED,
    staleTime: 60 * 1000,
  });

  const [editModal, setEditModal] = useState<Submission | null>(null);

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-2">My Submissions</h1>
            <p className="text-muted-foreground text-sm">
              Monologues and scripts you&apos;ve submitted or uploaded
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href="/submit-monologue">
                <IconSparkles className="h-4 w-4 mr-2" />
                Submit monologue
              </Link>
            </Button>
            {SCRIPTS_FEATURE_ENABLED && (
              <Button asChild className="w-fit" size="sm">
                <Link href="/my-scripts">
                  <IconFileText className="h-4 w-4 mr-2" />
                  Your scripts
                </Link>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <Tabs value={submissionsTab} onValueChange={(v) => setSubmissionsTab(v as "monologues" | "scripts")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-11 rounded-lg">
          <TabsTrigger value="monologues" className="gap-2">
            <IconSparkles className="h-4 w-4" />
            Monologues
            {!isLoading && submissions.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                {submissions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scripts" className="gap-2">
            <IconFileText className="h-4 w-4" />
            Scripts
            {SCRIPTS_FEATURE_ENABLED && !isLoadingScripts && scripts.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                {scripts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monologues" className="mt-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          )}
          {!isLoading && submissions.length > 0 && (
            <ul className="space-y-3">
              {submissions.map((submission, idx) => (
                <motion.li
                  key={submission.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <SubmissionCard
                    submission={submission}
                    onEdit={setEditModal}
                  />
                </motion.li>
              ))}
            </ul>
          )}
          {!isLoading && submissions.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <IconSparkles className="h-14 w-14 mx-auto text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No monologue submissions yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Share your favorite monologues with the ActorRise community.
                </p>
                <Button asChild>
                  <Link href="/submit-monologue">
                    <IconSparkles className="h-4 w-4 mr-2" />
                    Submit a monologue
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scripts" className="mt-4">
          {!SCRIPTS_FEATURE_ENABLED ? (
            <Card>
              <CardContent className="py-12 text-center">
                <IconFileText className="h-14 w-14 mx-auto text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Scripts</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Upload and manage scripts for scene practice in Your scripts.
                </p>
                <Button asChild variant="outline">
                  <Link href="/my-scripts">Go to Your scripts</Link>
                </Button>
              </CardContent>
            </Card>
          ) : isLoadingScripts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : scripts.length > 0 ? (
            <ul className="space-y-3">
              {scripts.map((script) => (
                <li key={script.id}>
                  <Link href={`/my-scripts/${script.id}`}>
                    <Card className="hover:bg-muted/50 transition-colors">
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{script.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {script.author}
                            {script.num_scenes_extracted > 0 && (
                              <> · {script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={
                              script.processing_status === "completed"
                                ? "default"
                                : script.processing_status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="capitalize"
                          >
                            {script.processing_status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatScriptDate(script.created_at)}
                          </span>
                          <IconExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <IconFileText className="h-14 w-14 mx-auto text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No scripts yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Upload PDF or TXT scripts for scene partner practice.
                </p>
                <Button asChild>
                  <Link href="/my-scripts">
                    <IconFileText className="h-4 w-4 mr-2" />
                    Go to Your scripts
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <EditSubmissionModal
        submission={editModal}
        onClose={() => setEditModal(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
          setEditModal(null);
        }}
      />
    </div>
  );
}

function EditSubmissionModal({
  submission,
  onClose,
  onSaved,
}: {
  submission: Submission | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    character_name: "",
    text: "",
    play_title: "",
    author: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (submission) {
      setForm({
        title: submission.title,
        character_name: submission.character_name ?? "",
        text: submission.text ?? "",
        play_title: submission.play_title ?? "",
        author: submission.author ?? "",
        notes: submission.notes ?? "",
      });
      setErrors({});
    }
  }, [submission?.id]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.character_name.trim()) next.character_name = "Character name is required";
    if (!form.text.trim()) next.text = "Monologue text is required";
    else {
      const words = form.text.trim().split(/\s+/).filter(Boolean).length;
      if (words < 30) next.text = "At least 30 words required";
      else if (words > 1000) next.text = "Maximum 1000 words";
    }
    if (!form.play_title.trim()) next.play_title = "Play title is required";
    if (!form.author.trim()) next.author = "Author is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (!submission) return;
      await api.patch(`/api/monologues/my-submissions/${submission.id}`, data);
    },
    onSuccess: () => {
      toast.success("Submission updated");
      onSaved();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update");
    },
  });

  const handleSave = () => {
    if (!submission || !validate()) return;
    updateMutation.mutate(form);
  };

  if (!submission) return null;

  return (
    <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit submission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Monologue title</Label>
            <Input
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="e.g., Hamlet's Soliloquy"
              className="mt-1"
            />
            {errors.title && <p className="text-sm text-red-500 mt-0.5">{errors.title}</p>}
          </div>
          <div>
            <Label>Character name</Label>
            <Input
              value={form.character_name}
              onChange={(e) => handleChange("character_name", e.target.value)}
              placeholder="e.g., Hamlet"
              className="mt-1"
            />
            {errors.character_name && (
              <p className="text-sm text-red-500 mt-0.5">{errors.character_name}</p>
            )}
          </div>
          <div>
            <Label>Play title</Label>
            <Input
              value={form.play_title}
              onChange={(e) => handleChange("play_title", e.target.value)}
              placeholder="e.g., Hamlet"
              className="mt-1"
            />
            {errors.play_title && (
              <p className="text-sm text-red-500 mt-0.5">{errors.play_title}</p>
            )}
          </div>
          <div>
            <Label>Author</Label>
            <Input
              value={form.author}
              onChange={(e) => handleChange("author", e.target.value)}
              placeholder="e.g., William Shakespeare"
              className="mt-1"
            />
            {errors.author && <p className="text-sm text-red-500 mt-0.5">{errors.author}</p>}
          </div>
          <div>
            <Label>Monologue text</Label>
            <Textarea
              value={form.text}
              onChange={(e) => handleChange("text", e.target.value)}
              placeholder="Paste the full monologue text..."
              className="mt-1 min-h-[140px] font-mono text-sm"
            />
            {errors.text && <p className="text-sm text-red-500 mt-0.5">{errors.text}</p>}
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Context about source or rights..."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
