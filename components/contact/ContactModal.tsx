"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useT, type MessageKey } from "@/lib/i18n";

const CATEGORIES: readonly { value: string; label: MessageKey }[] = [
  { value: "partnership", label: "marketingContactModal.catPartnership" },
  { value: "feedback", label: "marketingContactModal.catFeedback" },
  { value: "bug", label: "marketingContactModal.catBug" },
  { value: "collaboration", label: "marketingContactModal.catCollaboration" },
  { value: "support", label: "marketingContactModal.catSupport" },
  { value: "business_discount", label: "marketingContactModal.catBusiness" },
  { value: "teacher_school_coach_discount", label: "marketingContactModal.catTeacher" },
  { value: "student_discount", label: "marketingContactModal.catStudent" },
  { value: "other", label: "marketingContactModal.catOther" },
];

export interface ContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form opens with this category pre-selected (e.g. "feedback"). */
  initialCategory?: string;
}

export function ContactModal({ open, onOpenChange, initialCategory }: ContactModalProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && initialCategory && CATEGORIES.some((c) => c.value === initialCategory)) {
      setCategory(initialCategory);
    }
  }, [open, initialCategory]);

  const reset = () => {
    setName("");
    setEmail("");
    setCategory("other");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast.error(t("marketingContactModal.missing"));
      return;
    }
    setSending(true);
    try {
      await api.post<{ ok: boolean; message: string }>(
        "/api/contact",
        { name: name.trim(), email: email.trim() || undefined, category, message: message.trim() }
      );
      // The server's confirmation is English; ours follows the visitor's language.
      toast.success(t("marketingContactModal.sent"));
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail ?? t("marketingContactModal.failed");
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`t-modal theatre-tokens ${theatreFontVars} max-w-[30rem] border-0 p-7`}
      >
        <DialogHeader>
          <p className="t-modal__dir">{t("marketingContactModal.direction")}</p>
          <DialogTitle className="t-modal__title">{t("marketingContactModal.title")}</DialogTitle>
          <DialogDescription className="t-modal__body">
            {t("marketingContactModal.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="contact-name">{t("marketingContactModal.name")}</Label>
            <Input
              id="contact-name"
              placeholder={t("marketingContactModal.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-email">{t("marketingContactModal.email")} <span className="text-muted-foreground font-normal">{t("marketingContactModal.optional")}</span></Label>
            <Input
              id="contact-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-category">{t("marketingContactModal.category")}</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={sending}
            >
              <SelectTrigger id="contact-category">
                <SelectValue placeholder={t("marketingContactModal.categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="min-w-[var(--radix-select-trigger-width)] max-w-[min(calc(100vw-2rem),20rem)]">
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="py-2.5">
                    {t(c.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-message">{t("marketingContactModal.message")}</Label>
            <Textarea
              id="contact-message"
              placeholder={t("marketingContactModal.messagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={5000}
              disabled={sending}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              {t("marketingContactModal.cancel")}
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? t("marketingContactModal.sending") : t("marketingContactModal.send")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
