"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { setScenePartnerAudioCheckDone } from "@/lib/scenepartnerStorage";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { Mic, Volume2, Play, Square, Loader2 } from "lucide-react";

const SAMPLE_LINE = "I need to tell you something. Will you listen?";

interface ScenePartnerAudioCheckProps {
  onComplete: () => void;
}

export function ScenePartnerAudioCheck({ onComplete }: ScenePartnerAudioCheckProps) {
  const [micPermission, setMicPermission] = useState<"prompt" | "granted" | "denied" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { speak, cancel, isSpeaking, isSupported: ttsSupported, voices, selectedVoice, setVoice } =
    useSpeechSynthesis({ rate: 1.0, volume: 1.0 });

  const requestMic = useCallback(async () => {
    setRecordError(null);
    setMicPermission("prompt");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch (e) {
      setMicPermission("denied");
      setRecordError("Mic blocked. Allow access in your browser and try again.");
    }
  }, []);

  useEffect(() => {
    if (micPermission === null) {
      requestMic();
    }
  }, [micPermission, requestMic]);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    setRecordedUrl(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
      };
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      setRecordError("Could not start recording.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const handleContinue = useCallback(() => {
    cancel();
    setScenePartnerAudioCheckDone();
    onComplete();
  }, [cancel, onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-1">Check your audio</h2>
          <p className="text-sm text-muted-foreground">Test mic and AI voice so rehearsal runs smoothly.</p>
        </div>

        {/* Mic */}
        <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Mic className="h-4 w-4" />
            Test your mic
          </div>
          {micPermission === "denied" && (
            <p className="text-xs text-destructive">{recordError}</p>
          )}
          {micPermission === "granted" && (
            <>
              {!recordedUrl ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={isRecording ? stopRecording : startRecording}
                    className="gap-2"
                  >
                    {isRecording ? (
                      <>
                        <Square className="h-3.5 w-3.5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        Record 3 sec
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <audio src={recordedUrl} controls className="w-full h-9" />
                </div>
              )}
              {recordError && !recordedUrl && (
                <p className="text-xs text-destructive">{recordError}</p>
              )}
            </>
          )}
          {micPermission === "denied" && (
            <Button variant="outline" size="sm" onClick={requestMic}>
              Check mic
            </Button>
          )}
        </div>

        {/* TTS */}
        <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Volume2 className="h-4 w-4" />
            Listen to AI voice
          </div>
          {ttsSupported && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => speak(SAMPLE_LINE)}
                disabled={isSpeaking}
                className="gap-2"
              >
                {isSpeaking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Play sample
              </Button>
              {voices.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Voice</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedVoice?.voiceURI ?? ""}
                    onChange={(e) => {
                      const v = voices.find((x) => x.voiceURI === e.target.value) ?? null;
                      setVoice(v);
                    }}
                  >
                    {voices.filter((v) => v.lang.startsWith("en")).map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        <Button onClick={handleContinue} className="w-full rounded-full h-11">
          Continue
        </Button>
      </div>
    </div>
  );
}
