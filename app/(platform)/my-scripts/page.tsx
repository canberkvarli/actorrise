"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  Trash2,
  Loader2,
  ChevronRight,
  Sparkles,
  ClipboardPaste,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api, { API_URL } from "@/lib/api";
import { toast } from "sonner";

// Fun loading messages while script is processing (like monologue search)
const SCRIPT_LOADING_MESSAGES = [
  "Reading your script...",
  "Finding the characters...",
  "Extracting scenes...",
  "Consulting the drama gods...",
  "Squeezing the script...",
  "Almost there...",
  "Getting ready to rehearse...",
];

interface UserScript {
  id: number;
  title: string;
  author: string;
  description?: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processing_error?: string;
  ai_extraction_completed: boolean;
  genre?: string;
  estimated_length_minutes?: number;
  num_characters: number;
  num_scenes_extracted: number;
  characters: Array<{
    name: string;
    gender?: string;
    age_range?: string;
    description?: string;
  }>;
  created_at: string;
  updated_at?: string;
}

export default function MyScriptsPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<UserScript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteAuthor, setPasteAuthor] = useState("");
  const [pasteDescription, setPasteDescription] = useState("");
  const [pasting, setPasting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    fetchScripts();
  }, []);

  // Rotate loading message every 2s while uploading or pasting
  useEffect(() => {
    if (!uploadingFile && !pasting) {
      setLoadingMessageIndex(0);
      return;
    }
    const id = setInterval(
      () => setLoadingMessageIndex((prev) => (prev + 1) % SCRIPT_LOADING_MESSAGES.length),
      2000
    );
    return () => clearInterval(id);
  }, [uploadingFile, pasting]);

  const fetchScripts = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<UserScript[]>("/api/scripts/");
      setScripts(response.data);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      toast.error("Failed to load scripts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "txt", "text"].includes(ext)) {
      toast.error("Only PDF and TXT files are supported");
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }

    setUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Please sign in again to upload.");
        return;
      }

      const response = await fetch(`${API_URL}/api/scripts/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Upload failed");
      }

      const result = await response.json();
      toast.success(`Script uploaded! Extracted ${result.num_scenes_extracted} scenes.`);

      // Refresh scripts list
      fetchScripts();

      // Navigate to the script detail view
      router.push(`/my-scripts/${result.id}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload script");
    } finally {
      setUploadingFile(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handlePasteSubmit = async () => {
    const body = pasteText.trim();
    if (body.length < 100) {
      toast.error("Paste at least a few lines of dialogue (100+ characters) so we can extract a scene.");
      return;
    }
    setPasting(true);
    try {
      const { data } = await api.post<{ id: number; num_scenes_extracted: number }>(
        "/api/scripts/from-text",
        {
          body,
          title: pasteTitle.trim() || undefined,
          author: pasteAuthor.trim() || undefined,
          description: pasteDescription.trim() || undefined,
        }
      );
      toast.success(`Script created! Extracted ${data.num_scenes_extracted} scenes.`);
      setShowPasteModal(false);
      setPasteText("");
      setPasteTitle("");
      setPasteAuthor("");
      setPasteDescription("");
      fetchScripts();
      router.push(`/my-scripts/${data.id}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Failed to create script";
      toast.error(typeof msg === "string" ? msg : "Failed to create script");
    } finally {
      setPasting(false);
    }
  };

  const handleDeleteScript = async (scriptId: number) => {
    if (!confirm("Delete this script and all its scenes? This cannot be undone.")) {
      return;
    }

    try {
      await api.delete(`/api/scripts/${scriptId}`);
      toast.success("Script deleted");
      fetchScripts();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete script");
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: UserScript["processing_status"]) => {
    const config = {
      pending: { variant: "secondary" as const, text: "Pending" },
      processing: { variant: "default" as const, text: "Processing…" },
      completed: { variant: "default" as const, text: "Ready" },
      failed: { variant: "destructive" as const, text: "Failed" },
    }[status];
    return (
      <Badge variant={config.variant} className="font-normal">
        {status === "processing" && <Loader2 className="w-3 h-3 animate-spin mr-1 inline" />}
        {config.text}
      </Badge>
    );
  };

  const isProcessing = uploadingFile || pasting;
  const currentLoadingMessage = SCRIPT_LOADING_MESSAGES[loadingMessageIndex];

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 max-w-5xl">
      <input
        type="file"
        id="script-upload"
        accept=".pdf,.txt"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploadingFile}
      />

      {/* Full-page fun loading state while processing script */}
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm"
        >
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <Sparkles className="h-7 w-7 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <motion.p
            key={loadingMessageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-medium text-foreground"
          >
            {currentLoadingMessage}
          </motion.p>
        </motion.div>
      )}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-10"
      >
        <h1 className="text-4xl font-bold tracking-tight mb-2">My Scripts</h1>
        <p className="text-muted-foreground text-base mb-6 max-w-xl">
          Add a script and we’ll pull out characters and scenes so you can edit and rehearse.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => document.getElementById("script-upload")?.click()}
            disabled={uploadingFile}
            size="lg"
            className="gap-2 text-base"
          >
            {uploadingFile ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Upload
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2 text-base"
            onClick={() => setShowPasteModal(true)}
            disabled={pasting}
          >
            {pasting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ClipboardPaste className="w-5 h-5" />
            )}
            Paste
          </Button>
        </div>
      </motion.header>

      {/* Content */}
      {isLoading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-5">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      ) : scripts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-dashed border-border bg-muted/30 py-16 px-6 text-center"
        >
          <p className="text-muted-foreground text-base">No scripts yet. Use the buttons above to add one.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {scripts.map((script, index) => (
              <motion.div
                key={script.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
              >
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className="cursor-pointer group border-border/80 hover:border-border hover:shadow-md transition-all duration-200"
                    onClick={() => router.push(`/my-scripts/${script.id}`)}
                  >
                    <CardContent className="py-5 px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xl font-semibold truncate group-hover:text-primary transition-colors">
                              {script.title}
                            </h3>
                            {getStatusBadge(script.processing_status)}
                          </div>
                          <p className="text-base text-muted-foreground mt-1">
                            {script.author}
                            {script.genre && ` · ${script.genre}`}
                          </p>
                          {script.processing_status === "completed" && (
                            <p className="text-sm text-muted-foreground mt-2">
                              {script.num_characters} characters · {script.num_scenes_extracted} scenes
                              {script.estimated_length_minutes != null && ` · ~${script.estimated_length_minutes} min`}
                            </p>
                          )}
                          {script.processing_error && (
                            <p className="text-sm text-destructive mt-1">{script.processing_error}</p>
                          )}
                          <p className="text-sm text-muted-foreground/80 mt-2">
                            {formatDate(script.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/my-scripts/${script.id}`);
                            }}
                          >
                            Open
                            <ChevronRight className="w-4 h-4 ml-0.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteScript(script.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Paste script</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Paste your scene or script text below. AI will extract title, characters, and two-person scenes so you can edit and rehearse.
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="paste-body">Script text (required)</Label>
              <Textarea
                id="paste-body"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"JOHN: I need to tell you something.\nJANE: What is it?\nJOHN: I've been thinking about us..."}
                rows={12}
                className="mt-2 resize-y font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">At least 100 characters. Include character names and dialogue.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paste-title">Title (optional)</Label>
                <Input
                  id="paste-title"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="e.g. Kitchen Scene"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="paste-author">Author (optional)</Label>
                <Input
                  id="paste-author"
                  value={pasteAuthor}
                  onChange={(e) => setPasteAuthor(e.target.value)}
                  placeholder="e.g. Unknown"
                  className="mt-2"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="paste-description">Description (optional)</Label>
              <Textarea
                id="paste-description"
                value={pasteDescription}
                onChange={(e) => setPasteDescription(e.target.value)}
                placeholder="Brief note about this script..."
                rows={2}
                className="mt-2 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowPasteModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePasteSubmit}
                disabled={pasting || pasteText.trim().length < 100}
                className="gap-2"
              >
                {pasting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create script
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
