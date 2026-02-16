"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconSend, IconCheck, IconAlertCircle, IconClock, IconSparkles } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion } from "framer-motion";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubmissionResult {
  success: boolean;
  status: "approved" | "manual_review" | "rejected";
  message: string;
  submission_id?: number;
  reason?: string;
  details?: string;
  estimated_review_time?: string;
  moderation_notes?: string;
}

export default function SubmitMonologuePage() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: "",
    character_name: "",
    text: "",
    play_title: "",
    author: "",
    notes: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Open success modal when submission succeeds (banner stays visible below)
  useEffect(() => {
    if (result?.success) {
      setShowSuccessModal(true);
    }
  }, [result?.success]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    }
    if (!formData.character_name.trim()) {
      newErrors.character_name = "Character name is required";
    }
    if (!formData.text.trim()) {
      newErrors.text = "Monologue text is required";
    } else if (formData.text.trim().split(/\s+/).length < 30) {
      newErrors.text = "Monologue must be at least 30 words";
    } else if (formData.text.trim().split(/\s+/).length > 1000) {
      newErrors.text = "Monologue must be less than 1000 words";
    }
    if (!formData.play_title.trim()) {
      newErrors.play_title = "Play title is required";
    }
    if (!formData.author.trim()) {
      newErrors.author = "Author is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await api.post<SubmissionResult>("/api/monologues/submit", formData);
      setResult(response.data);

      // Clear form on success
      if (response.data.success) {
        setFormData({
          title: "",
          character_name: "",
          text: "",
          play_title: "",
          author: "",
          notes: "",
        });
        // Invalidate so My Submissions list refetches and shows the new submission
        queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      }
    } catch (error: any) {
      console.error("Submission error:", error);
      setResult({
        success: false,
        status: "rejected",
        message: error.response?.data?.detail || "Failed to submit monologue. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const wordCount = formData.text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil((wordCount / 150) * 60); // ~150 words per minute

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-2">
          <IconSparkles className="h-8 w-8 text-primary" />
          Submit a Monologue
        </h1>
        <p className="text-muted-foreground">
          Share a monologue with the ActorRise community. All submissions are reviewed to ensure quality and copyright compliance.
        </p>
      </motion.div>

      {/* Success modal – shown once on successful submit; banner stays below */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <IconCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </span>
              Submission received!
            </DialogTitle>
            <DialogDescription>
              {result?.status === "approved"
                ? "Your monologue was approved and is now available in the library."
                : result?.status === "manual_review"
                  ? "Your submission is under review. A moderator will check it and you'll receive an email with the decision (typically within 24–48 hours)."
                  : "Thanks for submitting. Check the status below and in My submissions."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/my-submissions" onClick={() => setShowSuccessModal(false)}>
                View my submissions
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setShowSuccessModal(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submission Result Alert (under review / approved / rejected banner – kept visible) */}
      {result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6"
        >
          {result.status === "approved" && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <IconCheck className="h-5 w-5 text-green-600" />
              <AlertDescription className="text-green-900 dark:text-green-100">
                <strong className="font-semibold">Approved!</strong> {result.message}
                <div className="mt-2">
                  <Link href="/my-submissions" className="text-green-700 dark:text-green-300 underline hover:no-underline">
                    View your submissions →
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {result.status === "manual_review" && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <IconClock className="h-5 w-5 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-100">
                <strong className="font-semibold">Under Review</strong> {result.message}
                {result.estimated_review_time && (
                  <p className="mt-1 text-sm">Estimated review time: {result.estimated_review_time}</p>
                )}
                <div className="mt-2">
                  <Link href="/my-submissions" className="text-amber-700 dark:text-amber-300 underline hover:no-underline">
                    Track your submissions →
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {result.status === "rejected" && (
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950/20">
              <IconAlertCircle className="h-5 w-5 text-red-600" />
              <AlertDescription className="text-red-900 dark:text-red-100">
                <strong className="font-semibold">Not Accepted</strong> {result.message}
                {result.reason && (
                  <p className="mt-1 text-sm"><strong>Reason:</strong> {result.reason}</p>
                )}
                {result.details && (
                  <p className="mt-1 text-sm">{result.details}</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </motion.div>
      )}

      {/* Submission Form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Monologue Details</CardTitle>
            <CardDescription>
              Please ensure the work is in the public domain (published before 1928) or that you have proper rights to share it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  Monologue Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g., Hamlet's Soliloquy"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  className={errors.title ? "border-red-500" : ""}
                />
                {errors.title && <p className="text-sm text-red-500">{errors.title}</p>}
              </div>

              {/* Character Name */}
              <div className="space-y-2">
                <Label htmlFor="character_name">
                  Character Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="character_name"
                  placeholder="e.g., Hamlet"
                  value={formData.character_name}
                  onChange={(e) => handleChange("character_name", e.target.value)}
                  className={errors.character_name ? "border-red-500" : ""}
                />
                {errors.character_name && <p className="text-sm text-red-500">{errors.character_name}</p>}
              </div>

              {/* Play Title */}
              <div className="space-y-2">
                <Label htmlFor="play_title">
                  Play Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="play_title"
                  placeholder="e.g., Hamlet"
                  value={formData.play_title}
                  onChange={(e) => handleChange("play_title", e.target.value)}
                  className={errors.play_title ? "border-red-500" : ""}
                />
                {errors.play_title && <p className="text-sm text-red-500">{errors.play_title}</p>}
              </div>

              {/* Author */}
              <div className="space-y-2">
                <Label htmlFor="author">
                  Author <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="author"
                  placeholder="e.g., William Shakespeare"
                  value={formData.author}
                  onChange={(e) => handleChange("author", e.target.value)}
                  className={errors.author ? "border-red-500" : ""}
                />
                {errors.author && <p className="text-sm text-red-500">{errors.author}</p>}
              </div>

              {/* Monologue Text */}
              <div className="space-y-2">
                <Label htmlFor="text">
                  Monologue Text <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="text"
                  placeholder="Enter the monologue text here..."
                  value={formData.text}
                  onChange={(e) => handleChange("text", e.target.value)}
                  className={`min-h-[300px] font-mono ${errors.text ? "border-red-500" : ""}`}
                />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div>
                    {errors.text ? (
                      <span className="text-red-500">{errors.text}</span>
                    ) : (
                      <span>
                        {wordCount} words • ~{estimatedDuration} seconds
                      </span>
                    )}
                  </div>
                  <span className="text-xs">30-1000 words required</span>
                </div>
              </div>

              {/* Optional Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional context about the source, rights, or context (e.g., 'Act 3, Scene 1', 'Public domain', etc.)"
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className="min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  Help us verify copyright status and context
                </p>
              </div>

              {/* Copyright Notice */}
              <Alert>
                <IconAlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Copyright Notice:</strong> By submitting, you confirm that this work is either in the public domain (published before 1928) or that you have the right to share it. Works protected by copyright will be rejected.
                </AlertDescription>
              </Alert>

              {/* Submit Button */}
              <div className="flex items-center gap-4">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <IconSend className="h-4 w-4 mr-2" />
                      Submit Monologue
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  asChild
                >
                  <Link href="/my-submissions">
                    View My Submissions
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Guidelines Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submission Guidelines</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3 text-muted-foreground">
            <div>
              <strong className="text-foreground">✅ What to Submit:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                <li>Classical plays (Shakespeare, Chekhov, Ibsen, etc.)</li>
                <li>Pre-1928 works (public domain in the US)</li>
                <li>Works with explicit Creative Commons licenses</li>
                <li>Complete, well-formatted monologues (30-1000 words)</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground">❌ What NOT to Submit:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                <li>Contemporary copyrighted works (Hamilton, Angels in America, etc.)</li>
                <li>Incomplete or poorly formatted text</li>
                <li>Spam or duplicate submissions</li>
                <li>Works without proper attribution</li>
              </ul>
            </div>

            <div>
              <strong className="text-foreground">🤖 Review Process:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                <li>AI checks quality and copyright status</li>
                <li>High-quality public domain works are auto-approved</li>
                <li>Uncertain cases go to human moderators (24-48 hours)</li>
                <li>You'll receive an email notification with the decision</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
