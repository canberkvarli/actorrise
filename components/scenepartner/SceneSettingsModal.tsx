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
import { Check } from "lucide-react";
import {
  getRehearsalSettings,
  setRehearsalSettings,
  getSelectedMicId,
  setSelectedMicId,
  type RehearsalSettings,
} from "@/lib/scenepartnerStorage";
import { useLocale, useT } from "@/lib/i18n";

interface SceneSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMicChange?: (deviceId: string) => void;
}

export function SceneSettingsModal({ open, onOpenChange, onMicChange }: SceneSettingsModalProps) {
  const t = useT();
  const tag = useLocale() === "tr" ? "tr-TR" : "en-US";
  const [settings, setSettings] = useState<RehearsalSettings>(() =>
    typeof window !== "undefined" ? getRehearsalSettings() : {
      pauseBetweenLinesSeconds: 0.3,
      countdownSeconds: 3,
      useAIVoice: true,
      highlightMyLines: true,
      autoAdvanceOnFinish: true,
    }
  );
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSettings(getRehearsalSettings());
      setSelectedMic(getSelectedMicId());
      navigator.mediaDevices?.enumerateDevices().then((devices) => {
        // Filter out the virtual "default" entry — it duplicates whichever device is system default
        setMicDevices(devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default"));
      }).catch(() => {});
    }
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
          <DialogTitle className="text-xl">{t("appScenesSettings.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("appScenesSettings.sub")}
          </p>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Pre-scene countdown */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold">{t("appScenesSettings.countdown")}</h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-normal">{t("appScenesSettings.countdownLabel")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("appScenesSettings.countdownHint")}
                </p>
              </div>
              <Switch
                checked={settings.countdownSeconds > 0}
                onCheckedChange={(on) => update({ countdownSeconds: on ? 3 : 0 })}
              />
            </div>
            {settings.countdownSeconds > 0 && (
              <div className="space-y-2 pl-1">
                <Label className="text-xs text-muted-foreground">{t("appScenesSettings.duration")}</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={settings.countdownSeconds}
                    onValueChange={(v) => update({ countdownSeconds: v })}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm tabular-nums w-8">{t("appScenesSettings.seconds", { n: settings.countdownSeconds.toLocaleString(tag) })}</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/60" />

          {/* Line delivery */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold">{t("appScenesSettings.delivery")}</h3>

            <div className="space-y-2">
              <Label className="text-sm font-normal">{t("appScenesSettings.breathing")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("appScenesSettings.breathingHint")}
              </p>
              <div className="flex items-center gap-2">
                <Slider
                  value={settings.pauseBetweenLinesSeconds}
                  onValueChange={(v) => update({ pauseBetweenLinesSeconds: v })}
                  min={0}
                  max={5}
                  step={0.5}
                  className="flex-1"
                />
                <span className="text-sm tabular-nums w-8">{t("appScenesSettings.seconds", { n: settings.pauseBetweenLinesSeconds.toLocaleString(tag) })}</span>
              </div>
            </div>

          </div>

          <div className="border-t border-border/60" />

          {/* Display */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold">{t("appScenesSettings.display")}</h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-normal">{t("appScenesSettings.highlight")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("appScenesSettings.highlightHint")}
                </p>
              </div>
              <Switch
                checked={settings.highlightMyLines}
                onCheckedChange={(v) => update({ highlightMyLines: v })}
              />
            </div>
          </div>

          <div className="border-t border-border/60" />

          {/* Microphone */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold">{t("appScenesSettings.mic")}</h3>
            {micDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("appScenesSettings.noMics")}</p>
            ) : (
              <div className="space-y-1">
                {micDevices.map((device, i) => {
                  const savedMicAvailable = micDevices.some(d => d.deviceId === selectedMic);
                  const isSelected = (selectedMic && savedMicAvailable)
                    ? device.deviceId === selectedMic
                    : i === 0;
                  return (
                    <button
                      key={device.deviceId}
                      type="button"
                      onClick={() => {
                        setSelectedMic(device.deviceId);
                        setSelectedMicId(device.deviceId);
                        onMicChange?.(device.deviceId);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                    >
                      <span className="truncate">{device.label || t("appScenesSettings.micN", { n: i + 1 })}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
