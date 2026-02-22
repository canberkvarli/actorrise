"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Users } from "lucide-react";

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
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl">Settings</DialogTitle>
        </DialogHeader>
        <p className="text-base text-muted-foreground">
          Defaults for new scenes and rehearsal behavior.
        </p>

        <div className="space-y-6">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Basic</CardTitle>
              <CardDescription className="text-sm">Countdown before starting a scene.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-base">Show countdown before starting scene</Label>
                <Switch checked={countdownEnabled} onCheckedChange={setCountdownEnabled} />
              </div>
              {countdownEnabled && (
                <div className="space-y-2">
                  <Label className="text-base">Countdown (seconds)</Label>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Playback</CardTitle>
              <CardDescription className="text-sm">When to move to the next line during rehearsal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-base">Move to the next line when I finish my line</Label>
                <Switch checked={moveOnFinish} onCheckedChange={setMoveOnFinish} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-base">Skip ahead if I'm quiet</Label>
                <Switch checked={skipIfQuiet} onCheckedChange={setSkipIfQuiet} />
              </div>
              {skipIfQuiet && (
                <div className="space-y-2">
                  <Label className="text-base">How long to wait (seconds)</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={quietWaitSeconds}
                      onValueChange={setQuietWaitSeconds}
                      min={1}
                      max={10}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm tabular-nums">{quietWaitSeconds}s</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-4 h-4" />
                Characters
              </CardTitle>
              <CardDescription className="text-sm">
                Assign voices when you create or edit a scene.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-base text-muted-foreground">
                Character defaults are set when you create a new scene. Use the scene editor to assign voices to characters.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Advanced</CardTitle>
              <CardDescription className="text-sm">Speech and performance options.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">Speech sampling (skip %)</Label>
                <p className="text-sm text-muted-foreground">
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
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
