"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "partnership", label: "Partnership" },
  { value: "feedback", label: "Feedback" },
  { value: "bug", label: "Bug report" },
  { value: "collaboration", label: "Collaboration" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
] as const;

export interface ContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form opens with this category pre-selected (e.g. "feedback"). */
  initialCategory?: string;
}

export function ContactModal({ open, onOpenChange, initialCategory }: ContactModalProps) {
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
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in name, email, and message.");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>(
        "/api/contact",
        { name: name.trim(), email: email.trim(), category, message: message.trim() }
      );
      toast.success(data?.message ?? "Message sent! I'll get back to you soon.");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail ?? "Failed to send. You can email canberkvarli@gmail.com directly.";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get in touch</DialogTitle>
          <DialogDescription>
            Partnership, feedback, bugs, collaboration. I built ActorRise on my own and
            really appreciate your support. I&apos;ll reply as soon as I can.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-email">Email</Label>
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
            <Label htmlFor="contact-category">What&apos;s this about?</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={sending}
            >
              <SelectTrigger id="contact-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea
              id="contact-message"
              placeholder="Tell me what's on your mind..."
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
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
