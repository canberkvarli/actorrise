"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconSend, IconCheck, IconAlertCircle, IconClock, IconSparkles, IconCircleCheck, IconCircleX, IconRobot } from "@tabler/icons-react";
import api from "@/lib/api";
import { useT } from "@/lib/i18n";
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
  const t = useT();
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
      newErrors.title = t("appAuditionsSubmit.errTitle");
    }
    if (!formData.character_name.trim()) {
      newErrors.character_name = t("appAuditionsSubmit.errCharacter");
    }
    if (!formData.text.trim()) {
      newErrors.text = t("appAuditionsSubmit.errText");
    } else if (formData.text.trim().split(/\s+/).length < 30) {
      newErrors.text = t("appAuditionsSubmit.errShort");
    } else if (formData.text.trim().split(/\s+/).length > 1000) {
      newErrors.text = t("appAuditionsSubmit.errLong");
    }
    if (!formData.play_title.trim()) {
      newErrors.play_title = t("appAuditionsSubmit.errPlay");
    }
    if (!formData.author.trim()) {
      newErrors.author = t("appAuditionsSubmit.errAuthor");
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
        message: error.response?.data?.detail || t("appAuditionsSubmit.failed"),
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
        {/* The sparkles icon beside the title was decorative, and the subtitle
            said "the ActorRise community" and "copyright compliance" — the app
            talking about itself in the third person, in a compliance register.
            The rights requirement is stated twice more below, where it binds. */}
        <p className="stage-direction mb-2 text-xs text-muted-foreground/70">
          {t("appAuditionsSubmit.direction")}
        </p>
        <h1 className="font-brand mb-2 text-3xl font-semibold lg:text-4xl">
          {t("appAuditionsSubmit.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("appAuditionsSubmit.sub")}
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
              {t("appAuditionsSubmit.received")}
            </DialogTitle>
            <DialogDescription>
              {result?.status === "approved"
                ? t("appAuditionsSubmit.approvedBody")
                : result?.status === "manual_review"
                  ? t("appAuditionsSubmit.reviewBody")
                  : t("appAuditionsSubmit.thanksBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/monologues" onClick={() => setShowSuccessModal(false)}>
                {t("appAuditionsSubmit.browse")}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setShowSuccessModal(false)} className="w-full sm:w-auto">
              {t("appAuditionsSubmit.close")}
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
                <strong className="font-semibold">{t("appAuditionsSubmit.approved")}</strong> {result.message}
                <div className="mt-2">
                  <Link href="/monologues" className="text-green-700 dark:text-green-300 underline hover:no-underline">
                    {t("appAuditionsSubmit.browseArrow")}
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {result.status === "manual_review" && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <IconClock className="h-5 w-5 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-100">
                <strong className="font-semibold">{t("appAuditionsSubmit.underReview")}</strong> {result.message}
                {result.estimated_review_time && (
                  <p className="mt-1 text-sm">{t("appAuditionsSubmit.estimated", { time: result.estimated_review_time })}</p>
                )}
                <div className="mt-2">
                  <Link href="/monologues" className="text-amber-700 dark:text-amber-300 underline hover:no-underline">
                    {t("appAuditionsSubmit.browseArrow")}
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {result.status === "rejected" && (
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950/20">
              <IconAlertCircle className="h-5 w-5 text-red-600" />
              <AlertDescription className="text-red-900 dark:text-red-100">
                <strong className="font-semibold">{t("appAuditionsSubmit.notAccepted")}</strong> {result.message}
                {result.reason && (
                  <p className="mt-1 text-sm"><strong>{t("appAuditionsSubmit.reason")}</strong> {result.reason}</p>
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
            <CardTitle>{t("appAuditionsSubmit.details")}</CardTitle>
            <CardDescription>
              {t("appAuditionsSubmit.detailsBody")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  {t("appAuditionsSubmit.fieldTitle")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder={t("appAuditionsSubmit.titlePlaceholder")}
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  className={errors.title ? "border-red-500" : ""}
                />
                {errors.title && <p className="text-sm text-red-500">{errors.title}</p>}
              </div>

              {/* Character Name */}
              <div className="space-y-2">
                <Label htmlFor="character_name">
                  {t("appAuditionsSubmit.fieldCharacter")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="character_name"
                  placeholder="Hamlet"
                  value={formData.character_name}
                  onChange={(e) => handleChange("character_name", e.target.value)}
                  className={errors.character_name ? "border-red-500" : ""}
                />
                {errors.character_name && <p className="text-sm text-red-500">{errors.character_name}</p>}
              </div>

              {/* Play Title */}
              <div className="space-y-2">
                <Label htmlFor="play_title">
                  {t("appAuditionsSubmit.fieldPlay")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="play_title"
                  placeholder="Hamlet"
                  value={formData.play_title}
                  onChange={(e) => handleChange("play_title", e.target.value)}
                  className={errors.play_title ? "border-red-500" : ""}
                />
                {errors.play_title && <p className="text-sm text-red-500">{errors.play_title}</p>}
              </div>

              {/* Author */}
              <div className="space-y-2">
                <Label htmlFor="author">
                  {t("appAuditionsSubmit.fieldAuthor")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="author"
                  placeholder="William Shakespeare"
                  value={formData.author}
                  onChange={(e) => handleChange("author", e.target.value)}
                  className={errors.author ? "border-red-500" : ""}
                />
                {errors.author && <p className="text-sm text-red-500">{errors.author}</p>}
              </div>

              {/* Monologue Text */}
              <div className="space-y-2">
                <Label htmlFor="text">
                  {t("appAuditionsSubmit.fieldText")} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="text"
                  placeholder={t("appAuditionsSubmit.textPlaceholder")}
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
                        {t("appAuditionsSubmit.wordCount", { n: wordCount, s: estimatedDuration })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs">{t("appAuditionsSubmit.wordsRequired")}</span>
                </div>
              </div>

              {/* Optional Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">
                  {t("appAuditionsSubmit.fieldNotes")}
                </Label>
                <Textarea
                  id="notes"
                  placeholder={t("appAuditionsSubmit.notesPlaceholder")}
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  className="min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  {t("appAuditionsSubmit.notesHelp")}
                </p>
              </div>

              {/* Copyright Notice */}
              <Alert>
                <IconAlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>{t("appAuditionsSubmit.copyrightLabel")}</strong>{t("appAuditionsSubmit.copyrightBody")}
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
                      {t("appAuditionsSubmit.submitting")}
                    </>
                  ) : (
                    <>
                      <IconSend className="h-4 w-4 mr-2" />
                      {t("appAuditionsSubmit.submit")}
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  asChild
                >
                  <Link href="/monologues">
                    {t("appAuditionsSubmit.browseCaps")}
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Guidelines Card – concise, no duplication with form/alert */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("appAuditionsSubmit.guidelines")}</CardTitle>
            <CardDescription>
              {t("appAuditionsSubmit.guidelinesBody")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <IconCircleCheck className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <p className="font-medium text-foreground mb-1">{t("appAuditionsSubmit.acceptable")}</p>
                <p>{t("appAuditionsSubmit.acceptableBody")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <IconCircleX className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-foreground mb-1">{t("appAuditionsSubmit.notAcceptable")}</p>
                <p>{t("appAuditionsSubmit.notAcceptableBody")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <IconRobot className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-foreground mb-1">{t("appAuditionsSubmit.review")}</p>
                <p>{t("appAuditionsSubmit.reviewGuide")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
