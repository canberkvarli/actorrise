"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  getRehearsalSettings,
  setRehearsalSettings,
  type RehearsalSettings,
} from "@/lib/scenepartnerStorage";

interface SceneSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SceneSettingsModal({ open, onOpenChange }: SceneSettingsModalProps) {
  const [settings, setSettings] = useState<RehearsalSettings>(() =>
    typeof window !== "undefined" ? getRehearsalSettings() : {
      pauseBetweenLinesSeconds: 3,
      skipMyLineIfSilent: false,
      skipAfterSeconds: 10,
      countdownSeconds: 3,
      useAIVoice: true,
      autoAdvanceOnFinish: true,
    }
  );

  useEffect(() => {
    if (open) setSettings(getRehearsalSettings());
  }, [open]);

  const update = useCallback((partial: Partial<RehearsalSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      setRehearsalSettings(partial);
      return next;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Rehearsal Preferences</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Adjust how your rehearsals run. Changes apply to all future sessions.
          </p>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Pre-scene countdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pre-Scene Countdown</h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-normal">Begin with a countdown</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gives you a moment to get into character before the first cue.
                </p>
              </div>
              <Switch
                checked={settings.countdownSeconds > 0}
                onCheckedChange={(on) => update({ countdownSeconds: on ? 3 : 0 })}
              />
            </div>
            {settings.countdownSeconds > 0 && (
              <div className="space-y-2 pl-1">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={settings.countdownSeconds}
                    onValueChange={(v) => update({ countdownSeconds: v })}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm tabular-nums w-8">{settings.countdownSeconds}s</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/60" />

          {/* Line delivery */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Line Delivery</h3>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-normal">Continue after I deliver my line</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically move to the next cue once you finish speaking.
                </p>
              </div>
              <Switch
                checked={settings.autoAdvanceOnFinish}
                onCheckedChange={(v) => update({ autoAdvanceOnFinish: v })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-normal">Breathing room between lines</Label>
              <p className="text-xs text-muted-foreground">
                A brief pause after each line before the next one plays.
              </p>
              <div className="flex items-center gap-2">
                <Slider
                  value={settings.pauseBetweenLinesSeconds}
                  onValueChange={(v) => update({ pauseBetweenLinesSeconds: v })}
                  min={0}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm tabular-nums w-8">{settings.pauseBetweenLinesSeconds}s</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-normal">Auto-skip when silent</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If you don&apos;t speak for a while, move on automatically.
                </p>
              </div>
              <Switch
                checked={settings.skipMyLineIfSilent}
                onCheckedChange={(v) => update({ skipMyLineIfSilent: v })}
              />
            </div>
            {settings.skipMyLineIfSilent && (
              <div className="space-y-2 pl-1">
                <Label className="text-xs text-muted-foreground">Wait before skipping</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={settings.skipAfterSeconds}
                    onValueChange={(v) => update({ skipAfterSeconds: v })}
                    min={3}
                    max={30}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm tabular-nums w-8">{settings.skipAfterSeconds}s</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
