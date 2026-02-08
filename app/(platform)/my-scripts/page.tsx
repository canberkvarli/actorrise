"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileText, Trash2, Eye, Clock, Users,
  FileCheck, FileX, Loader2, ChevronRight, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api, { API_URL } from "@/lib/api";
import { toast } from "sonner";

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

  useEffect(() => {
    fetchScripts();
  }, []);

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

      const response = await fetch(`${API_URL}/api/scripts/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${(await import("@/lib/supabase")).supabase.auth.getSession().then(s => s.data.session?.access_token)}`,
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
    const variants = {
      pending: { variant: "secondary" as const, icon: Clock, text: "Pending" },
      processing: { variant: "default" as const, icon: Loader2, text: "Processing..." },
      completed: { variant: "default" as const, icon: FileCheck, text: "Ready" },
      failed: { variant: "destructive" as const, icon: FileX, text: "Failed" },
    };

    const config = variants[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className={`w-3 h-3 ${status === "processing" ? "animate-spin" : ""}`} />
        {config.text}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-8 h-8 text-primary" />
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-2">My Scripts</h1>
            <p className="text-muted-foreground text-lg">
              Upload your scripts (PDF/TXT) and AI will extract characters, scenes, and monologues. Practice with ScenePartner or edit everything inline.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              id="script-upload"
              accept=".pdf,.txt"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploadingFile}
            />
            <Button
              onClick={() => document.getElementById("script-upload")?.click()}
              disabled={uploadingFile}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-primary/80"
            >
              {uploadingFile ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload Script
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Scripts List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : scripts.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No scripts yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Upload a script (PDF/TXT) - audition sides, play, or scene - and AI will extract everything: characters, dialogue, scenes. Then edit inline or practice with ScenePartner.
            </p>
            <Button
              onClick={() => document.getElementById("script-upload")?.click()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload Your First Script
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {scripts.map((script) => (
              <motion.div
                key={script.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      {/* Main Info */}
                      <div
                        className="flex-1 space-y-3"
                        onClick={() => router.push(`/my-scripts/${script.id}`)}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
                            {script.title}
                          </h3>
                          {getStatusBadge(script.processing_status)}
                        </div>

                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            <span className="font-medium">Author:</span> {script.author}
                          </p>
                          {script.genre && (
                            <p>
                              <span className="font-medium">Genre:</span> {script.genre}
                            </p>
                          )}
                          <p>
                            <span className="font-medium">File:</span> {script.original_filename} ({formatFileSize(script.file_size_bytes)})
                          </p>
                        </div>

                        {/* Stats */}
                        {script.processing_status === "completed" && (
                          <div className="flex items-center gap-6 flex-wrap text-sm">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span>
                                <span className="font-semibold">{script.num_characters}</span> characters
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <span>
                                <span className="font-semibold">{script.num_scenes_extracted}</span> scenes
                              </span>
                            </div>
                            {script.estimated_length_minutes && (
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span>~{script.estimated_length_minutes} min</span>
                              </div>
                            )}
                          </div>
                        )}

                        {script.processing_error && (
                          <p className="text-sm text-destructive">{script.processing_error}</p>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Uploaded {formatDate(script.created_at)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/my-scripts/${script.id}`);
                          }}
                          className="gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          View
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteScript(script.id);
                          }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
