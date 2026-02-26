"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface SceneSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SceneSettingsModal({ open, onOpenChange }: SceneSettingsModalProps) {
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [moveOnFinish, setMoveOnFinish] = useState(true);
  const [skipIfQuiet, setSkipIfQuiet] = useState(false);
  const [quietWaitSeconds, setQuietWaitSeconds] = useState(2);
  const [speechSamplingSkip, setSpeechSamplingSkip] = useState(35);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Scene Settings</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Defaults for new scenes and rehearsal behavior.
          </p>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Countdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Countdown</h3>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-normal">Show countdown before starting</Label>
              <Switch checked={countdownEnabled} onCheckedChange={setCountdownEnabled} />
            </div>
            {countdownEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Seconds</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={countdownSeconds}
                    onValueChange={setCountdownSeconds}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm tabular-nums w-8">{countdownSeconds}s</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/60" />

          {/* Playback */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Playback</h3>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-normal">Move to next line when I finish</Label>
              <Switch checked={moveOnFinish} onCheckedChange={setMoveOnFinish} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-normal">Skip ahead if I&apos;m quiet</Label>
              <Switch checked={skipIfQuiet} onCheckedChange={setSkipIfQuiet} />
            </div>
            {skipIfQuiet && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Wait time (seconds)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={quietWaitSeconds}
                    onValueChange={setQuietWaitSeconds}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm tabular-nums w-8">{quietWaitSeconds}s</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/60" />

          {/* Advanced */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Advanced</h3>
            <div className="space-y-2">
              <Label className="text-sm font-normal">Speech sampling (skip %)</Label>
              <p className="text-xs text-muted-foreground">
                Skip a percentage of speech results to reduce processing. Higher values may improve performance but reduce accuracy.
              </p>
              <div className="flex items-center gap-2">
                <Slider
                  value={speechSamplingSkip}
                  onValueChange={setSpeechSamplingSkip}
                  min={0}
                  max={80}
                  step={5}
                  className="flex-1"
                />
                <span className="text-sm tabular-nums w-12">{speechSamplingSkip}%</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
