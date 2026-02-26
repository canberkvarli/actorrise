"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Volume2,
  Square,
  Loader2,
  Download,
  Highlighter,
  Undo2,
  Redo2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import { useOpenAITTS } from "@/hooks/useOpenAITTS";
import { parseUpgradeError } from "@/lib/upgradeError";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SceneLine {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
  word_count: number;
  primary_emotion: string | null;
}

interface SceneDetail {
  id: number;
  play_title: string;
  play_author: string;
  title: string;
  description: string | null;
  character_1_name: string;
  character_2_name: string;
  character_1_gender: string | null;
  character_2_gender: string | null;
  character_1_age_range: string | null;
  character_2_age_range: string | null;
  setting: string | null;
  context_before: string | null;
  context_after: string | null;
  tone: string | null;
  primary_emotions: string[];
  relationship_dynamic: string | null;
  line_count: number;
  estimated_duration_seconds: number;
  rehearsal_count: number;
  lines: SceneLine[];
}

type SceneStringKey =
  | "title"
  | "description"
  | "character_1_name"
  | "character_2_name"
  | "setting"
  | "context_before"
  | "context_after";

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

type UndoEntry =
  | {
      type: "line";
      lineId: number;
      old: { character_name: string; text: string; stage_direction: string | null; word_count: number };
      cur: { character_name: string; text: string; stage_direction: string | null; word_count: number };
    }
  | {
      type: "scene_field";
      field: SceneStringKey;
      old: string | undefined;
      cur: string | undefined;
    };

// ---------------------------------------------------------------------------
// OpenAI TTS voice options
// ---------------------------------------------------------------------------

const AI_VOICES = [
  { id: "ash", label: "Ash", desc: "Warm, deep", gender: "male" },
  { id: "echo", label: "Echo", desc: "Smooth, neutral", gender: "male" },
  { id: "fable", label: "Fable", desc: "Expressive, British", gender: "male" },
  { id: "onyx", label: "Onyx", desc: "Deep, authoritative", gender: "male" },
  { id: "coral", label: "Coral", desc: "Warm, expressive", gender: "female" },
  { id: "nova", label: "Nova", desc: "Bright, energetic", gender: "female" },
  { id: "sage", label: "Sage", desc: "Calm, measured", gender: "female" },
  { id: "shimmer", label: "Shimmer", desc: "Light, youthful", gender: "female" },
  { id: "alloy", label: "Alloy", desc: "Balanced, clear", gender: "neutral" },
  { id: "ballad", label: "Ballad", desc: "Melodic, gentle", gender: "neutral" },
] as const;

// ---------------------------------------------------------------------------
// Voice storage helpers (localStorage, keyed by scene ID)
// ---------------------------------------------------------------------------

const VOICE_STORAGE_KEY = "scene_partner_character_voices_v2";

interface CharacterVoices {
  character_1_voice: string | null;
  character_2_voice: string | null;
}

function getCharacterVoices(sceneId: number): CharacterVoices {
  if (typeof window === "undefined") return { character_1_voice: null, character_2_voice: null };
  try {
    const raw = localStorage.getItem(VOICE_STORAGE_KEY);
    if (!raw) return { character_1_voice: null, character_2_voice: null };
    const all = JSON.parse(raw) as Record<string, CharacterVoices>;
    return all[String(sceneId)] ?? { character_1_voice: null, character_2_voice: null };
  } catch {
    return { character_1_voice: null, character_2_voice: null };
  }
}

function setCharacterVoices(sceneId: number, voices: CharacterVoices): void {
  try {
    const raw = localStorage.getItem(VOICE_STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, CharacterVoices>) : {};
    all[String(sceneId)] = voices;
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SceneEditPage() {
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const params = useParams();
  const scriptId = Number(params.id);
  const sceneId = Number(params.sceneId);

  // Scene data
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [saving, setSaving] = useState<string | null>(null);
  const [editingSceneField, setEditingSceneField] = useState<string | null>(null);
  const [sceneEditValue, setSceneEditValue] = useState("");
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [lineEditValues, setLineEditValues] = useState<
    Record<number, { character_name: string; text: string; stage_direction: string }>
  >({});

  // Character & rehearsal
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [startingRehearsal, setStartingRehearsal] = useState(false);

  // Context sections collapsed by default
  const [contextExpanded, setContextExpanded] = useState(false);

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<"details" | "script">("script");

  // Voice
  const [charVoices, setCharVoices] = useState<CharacterVoices>({
    character_1_voice: null,
    character_2_voice: null,
  });
  const [previewingVoice, setPreviewingVoice] = useState<1 | 2 | null>(null);

  // Highlight my lines
  const [highlightMyLines, setHighlightMyLines] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("scene_highlight_my_lines") === "true";
  });
  const toggleHighlight = (on: boolean) => {
    setHighlightMyLines(on);
    localStorage.setItem("scene_highlight_my_lines", String(on));
  };

  // Undo / Redo
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistory = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };
  const pushUndo = (entry: UndoEntry) => {
    undoStackRef.current.push(entry);
    redoStackRef.current = [];
    syncHistory();
  };

  // Upgrade modal
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature: string; message: string }>({
    open: false, feature: "", message: "",
  });

  const { speak: speakAI, cancel: cancelAI, isSpeaking: isSpeakingAI, isLoading: isLoadingAI } = useOpenAITTS({
    onEnd: () => setPreviewingVoice(null),
    onError: (err) => {
      setPreviewingVoice(null);
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "AI Voice", message: upgrade.message });
      } else {
        toast.error(err instanceof Error ? err.message : "Voice preview failed");
      }
    },
  });

  // Fetch scene
  useEffect(() => {
    if (!sceneId) return;
    (async () => {
      try {
        const { data } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
        setScene(data);
        // Default character selection to character_1
        setSelectedCharacter(data.character_1_name);
        // Load saved voices
        setCharVoices(getCharacterVoices(sceneId));
      } catch {
        toast.error("Failed to load scene");
        router.push(`/my-scripts/${scriptId}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [sceneId, scriptId, router]);

  // ---------------------------------------------------------------------------
  // Save helpers
  // ---------------------------------------------------------------------------

  const saveSceneField = async (field: SceneStringKey, value: string | null) => {
    if (!scene) return;
    const oldVal = scene[field] as string | undefined;
    const newVal = value ?? undefined;
    setSaving(`scene-${field}`);
    try {
      await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, {
        [field]: newVal,
      });
      pushUndo({ type: "scene_field", field, old: oldVal, cur: newVal });
      setScene({ ...scene, [field]: newVal });
      setEditingSceneField(null);
      toast.success("Scene updated");
    } catch {
      toast.error("Failed to update scene");
    } finally {
      setSaving(null);
    }
  };

  const saveLine = async (line: SceneLine) => {
    const values = lineEditValues[line.id];
    if (!values || !scene) return;
    const oldVals = {
      character_name: line.character_name,
      text: line.text,
      stage_direction: line.stage_direction,
      word_count: line.word_count,
    };
    const newWc = values.text.trim().split(/\s+/).filter(Boolean).length;
    const newVals = {
      character_name: values.character_name,
      text: values.text,
      stage_direction: values.stage_direction || null,
      word_count: newWc,
    };
    setSaving(`line-${line.id}`);
    try {
      await api.patch(
        `/api/scripts/${scriptId}/scenes/${sceneId}/lines/${line.id}`,
        {
          character_name: values.character_name,
          text: values.text,
          stage_direction: values.stage_direction || null,
        }
      );
      pushUndo({ type: "line", lineId: line.id, old: oldVals, cur: newVals });
      setScene({
        ...scene,
        lines: scene.lines.map((l) =>
          l.id === line.id ? { ...l, ...newVals } : l
        ),
      });
      setEditingLineId(null);
      setLineEditValues((prev) => {
        const next = { ...prev };
        delete next[line.id];
        return next;
      });
      toast.success("Line updated");
    } catch {
      toast.error("Failed to update line");
    } finally {
      setSaving(null);
    }
  };

  const startEditScene = (field: SceneStringKey, current: string | null) => {
    setEditingSceneField(field);
    setSceneEditValue(current ?? "");
  };

  const startEditLine = (line: SceneLine) => {
    setEditingLineId(line.id);
    setLineEditValues((prev) => ({
      ...prev,
      [line.id]: {
        character_name: line.character_name,
        text: line.text,
        stage_direction: line.stage_direction ?? "",
      },
    }));
  };

  // ---------------------------------------------------------------------------
  // Rehearsal
  // ---------------------------------------------------------------------------

  const handleStartRehearsal = useCallback(async () => {
    if (!scene || !selectedCharacter) {
      toast.error("Please select a character first");
      return;
    }
    setStartingRehearsal(true);
    try {
      const { data } = await api.post<{ id: number }>("/api/scenes/rehearse/start", {
        scene_id: scene.id,
        user_character: selectedCharacter,
      });
      router.push(`/scenes/${scene.id}/rehearse?session=${data.id}`);
    } catch (err: unknown) {
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "ScenePartner", message: upgrade.message });
      } else {
        const message =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : "Failed to start rehearsal";
        toast.error(typeof message === "string" ? message : "Failed to start rehearsal");
      }
    } finally {
      setStartingRehearsal(false);
    }
  }, [scene, selectedCharacter, router]);

  // ---------------------------------------------------------------------------
  // Voice helpers
  // ---------------------------------------------------------------------------

  const handleVoiceChange = (charNum: 1 | 2, voiceId: string) => {
    const updated = {
      ...charVoices,
      [`character_${charNum}_voice`]: voiceId || null,
    } as CharacterVoices;
    setCharVoices(updated);
    setCharacterVoices(sceneId, updated);
  };

  const previewVoice = (charNum: 1 | 2) => {
    if ((isSpeakingAI || isLoadingAI) && previewingVoice === charNum) {
      cancelAI();
      setPreviewingVoice(null);
      return;
    }
    cancelAI();
    if (!scene) return;

    const voiceId =
      charNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;

    const charName =
      charNum === 1 ? scene.character_1_name : scene.character_2_name;
    const voiceLabel = AI_VOICES.find((v) => v.id === voiceId)?.label ?? "your scene partner";
    const intro = `Hi, I'm ${voiceLabel}. I'll be reading ${charName} for you today.`;

    setPreviewingVoice(charNum);
    speakAI(intro, voiceId || "coral", "Speak naturally with a friendly, warm, conversational tone. Introduce yourself briefly.");
  };

  // ---------------------------------------------------------------------------
  // Undo / Redo actions
  // ---------------------------------------------------------------------------

  const applyEntry = useCallback(async (entry: UndoEntry, vals: "old" | "cur") => {
    if (!scene) return;
    const v = vals === "old" ? "old" : "cur";
    if (entry.type === "scene_field") {
      const value = entry[v];
      try {
        await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, { [entry.field]: value });
        setScene((prev) => prev ? { ...prev, [entry.field]: value } : prev);
      } catch {
        toast.error("Failed to apply change");
      }
    } else {
      const lineVals = entry[v];
      try {
        await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${entry.lineId}`, {
          character_name: lineVals.character_name,
          text: lineVals.text,
          stage_direction: lineVals.stage_direction,
        });
        setScene((prev) =>
          prev
            ? { ...prev, lines: prev.lines.map((l) => (l.id === entry.lineId ? { ...l, ...lineVals } : l)) }
            : prev
        );
      } catch {
        toast.error("Failed to apply change");
      }
    }
  }, [scene, scriptId, sceneId]);

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    redoStackRef.current.push(entry);
    syncHistory();
    await applyEntry(entry, "old");
    toast.success("Undone");
  }, [applyEntry]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    undoStackRef.current.push(entry);
    syncHistory();
    await applyEntry(entry, "cur");
    toast.success("Redone");
  }, [applyEntry]);

  // Keyboard shortcuts: ⌘Z / ⌘⇧Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        // Don't hijack when user is editing a text field
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // ---------------------------------------------------------------------------
  // Duration helper
  // ---------------------------------------------------------------------------

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes} min` : `${seconds}s`;
  };

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const buildScriptText = useCallback(() => {
    if (!scene) return "";
    const lines = scene.lines
      .slice()
      .sort((a, b) => a.line_order - b.line_order)
      .map((l) => {
        const dir = l.stage_direction ? ` (${l.stage_direction})` : "";
        return `${l.character_name.toUpperCase()}${dir}\n${l.text}`;
      })
      .join("\n\n");
    return `${scene.title}\nFrom "${scene.play_title}" by ${scene.play_author}\n\n${"—".repeat(40)}\n\n${lines}\n`;
  }, [scene]);

  const downloadAsTxt = useCallback(() => {
    if (!scene) return;
    const blob = new Blob([buildScriptText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scene.title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadModal(false);
  }, [scene, buildScriptText]);

  const downloadAsPdf = useCallback(() => {
    if (!scene) return;
    // Use the browser print dialog as a simple PDF export
    const content = buildScriptText();
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download as PDF");
      return;
    }
    printWindow.document.write(`
      <html><head><title>${scene.title}</title>
      <style>
        body { font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; padding: 40px; line-height: 1.6; max-width: 700px; margin: 0 auto; }
      </style></head>
      <body>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    setShowDownloadModal(false);
  }, [scene, buildScriptText]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading || !scene) {
    return <div className="min-h-screen bg-neutral-950" />;
  }

  // ---------------------------------------------------------------------------
  // Editable field renderer (for left panel)
  // ---------------------------------------------------------------------------

  const renderEditableField = (
    field: SceneStringKey,
    label: string,
    multiline = false
  ) => {
    const value = scene[field];
    const str = typeof value === "string" ? value : "";
    const isEditing = editingSceneField === field;

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingSceneField(null);
      } else if (e.key === "Enter" && !multiline) {
        saveSceneField(field, sceneEditValue);
      } else if (e.key === "Enter" && e.metaKey && multiline) {
        saveSceneField(field, sceneEditValue);
      }
    };

    const handleBlur = () => {
      // Save on blur if value changed, otherwise just close
      if (sceneEditValue !== str) {
        saveSceneField(field, sceneEditValue);
      } else {
        setEditingSceneField(null);
      }
    };

    return (
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
          {label}
        </div>
        {isEditing ? (
          multiline ? (
            <Textarea
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              rows={3}
              className="resize-none bg-transparent border-neutral-700 text-sm text-neutral-200 px-2 py-1.5 -mx-2 focus-visible:ring-1 focus-visible:ring-primary/50"
              autoFocus
              disabled={saving !== null}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />
          ) : (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              className="bg-transparent border-neutral-700 text-sm text-neutral-200 h-auto px-2 py-1.5 -mx-2 focus-visible:ring-1 focus-visible:ring-primary/50"
              autoFocus
              disabled={saving !== null}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => startEditScene(field, str)}
            className="group flex items-start gap-2 text-left w-full rounded-md px-2 py-1.5 -mx-2 hover:bg-neutral-800/60 transition-colors border border-transparent"
          >
            <p className={cn("text-sm flex-1", str ? "text-neutral-200" : "text-neutral-500 italic")}>
              {str || `Add ${label.toLowerCase()}...`}
            </p>
            <Edit2 className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors flex-shrink-0 mt-0.5" />
          </button>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Character card renderer
  // ---------------------------------------------------------------------------

  const renderCharacterCard = (charNum: 1 | 2) => {
    const name = charNum === 1 ? scene.character_1_name : scene.character_2_name;
    const gender = charNum === 1 ? scene.character_1_gender : scene.character_2_gender;
    const ageRange = charNum === 1 ? scene.character_1_age_range : scene.character_2_age_range;
    const isSelected = selectedCharacter === name;
    const voiceId =
      charNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;
    const isPreviewing = (isSpeakingAI || isLoadingAI) && previewingVoice === charNum;

    return (
      <div
        key={charNum}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedCharacter(name)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedCharacter(name); }}
        className={cn(
          "w-full text-left rounded-lg border p-3 transition-all cursor-pointer",
          isSelected
            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
            : "border-neutral-800 hover:border-neutral-600 bg-neutral-900/50"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              "w-3 h-3 rounded-full border-2 flex-shrink-0",
              isSelected ? "border-primary bg-primary" : "border-neutral-600"
            )}
          />
          <span className="font-medium text-sm text-neutral-100">{name}</span>
          {isSelected && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/20 text-primary border-0">
              You
            </Badge>
          )}
        </div>
        {(gender || ageRange) && (
          <div className="text-xs text-neutral-500 ml-5 mb-2">
            {[gender, ageRange].filter(Boolean).join(" · ")}
          </div>
        )}
        {/* Voice selector — only for the AI scene partner, not for "You" */}
        {!isSelected && (
          <div className="ml-5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <label className="text-[11px] text-neutral-500 uppercase tracking-wider">
              AI Voice
            </label>
            <div className="flex items-center gap-1.5">
              <select
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary/50"
                value={voiceId ?? ""}
                onChange={(e) => handleVoiceChange(charNum, e.target.value)}
              >
                <option value="">Auto (based on character)</option>
                {AI_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {v.desc}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-neutral-400 hover:text-neutral-100"
                onClick={() => previewVoice(charNum)}
                disabled={isLoadingAI && previewingVoice === charNum}
                title="Preview voice"
              >
                {isPreviewing && isLoadingAI ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isPreviewing ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Left panel content
  // ---------------------------------------------------------------------------

  const leftPanelContent = (
    <div className="space-y-6">
      {/* Play attribution */}
      <div>
        <p className="text-sm text-neutral-400 italic">
          From <span className="text-neutral-200">{scene.play_title}</span> by{" "}
          <span className="text-neutral-200">{scene.play_author}</span>
        </p>
      </div>

      {/* Description */}
      {renderEditableField("description", "Description", true)}

      {/* Characters */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
          Characters
        </div>
        <p className="text-[11px] text-neutral-500">
          Select who you&apos;ll play
        </p>
        <div className="space-y-2">
          {renderCharacterCard(1)}
          {renderCharacterCard(2)}
        </div>
      </div>

      {/* Tone & Emotions */}
      {(scene.tone || (scene.primary_emotions && scene.primary_emotions.length > 0)) && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
            Tone & Emotions
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scene.tone && (
              <Badge
                variant="outline"
                className="text-[11px] border-neutral-700 text-neutral-300 capitalize"
              >
                {scene.tone}
              </Badge>
            )}
            {scene.primary_emotions?.map((emotion) => (
              <Badge
                key={emotion}
                variant="secondary"
                className="text-[11px] bg-neutral-800 text-neutral-300 capitalize"
              >
                {emotion}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Relationship Dynamic */}
      {scene.relationship_dynamic && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
            Relationship
          </div>
          <p className="text-sm text-neutral-300 capitalize">
            {scene.relationship_dynamic}
          </p>
        </div>
      )}

      {/* Setting */}
      {scene.setting && renderEditableField("setting", "Setting")}

      {/* Context (collapsible) */}
      {(scene.context_before || scene.context_after) && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setContextExpanded(!contextExpanded)}
            className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-400 font-medium hover:text-neutral-200 transition-colors"
          >
            Context
            {contextExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          <AnimatePresence>
            {contextExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden space-y-3"
              >
                {renderEditableField("context_before", "Context Before", true)}
                {renderEditableField("context_after", "Context After", true)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Highlight toggle */}
      <div className="flex items-center justify-between rounded-lg bg-neutral-900/50 border border-neutral-800 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Highlighter className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-sm text-neutral-200">Highlight my lines</span>
        </div>
        <Switch
          checked={highlightMyLines}
          onCheckedChange={toggleHighlight}
        />
      </div>

      {/* Stats */}
      <div className="pt-4 border-t border-neutral-800">
        <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
          <span>{scene.line_count} lines</span>
          <span>{formatDuration(scene.estimated_duration_seconds)}</span>
          {scene.rehearsal_count > 0 && (
            <span>{scene.rehearsal_count} rehearsals</span>
          )}
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Right panel content (parchment script)
  // ---------------------------------------------------------------------------

  const isMyLine = (charName: string) => charName === selectedCharacter;

  const rightPanelContent = (
    <div
      className="bg-white text-neutral-900 rounded-lg shadow-2xl border border-neutral-200 px-6 sm:px-10 py-6 sm:py-8"
      style={{ fontFamily: 'Courier, "Courier New", monospace' }}
    >
      {/* Title inside parchment */}
      <div className="text-center mb-6 pb-5 border-b border-neutral-200">
        <h2 className="text-xl font-bold uppercase tracking-wider">{scene.title}</h2>
        <p className="text-sm text-neutral-500 mt-1">
          from &ldquo;{scene.play_title}&rdquo; by {scene.play_author}
        </p>
      </div>

      {/* Script lines */}
      <div className="space-y-6">
        {scene.lines
          .slice()
          .sort((a, b) => a.line_order - b.line_order)
          .map((line) => {
            const isEditing = editingLineId === line.id;
            const values = lineEditValues[line.id];
            const isMine = isMyLine(line.character_name);

            const cancelLineEdit = () => {
              setEditingLineId(null);
              setLineEditValues((prev) => {
                const next = { ...prev };
                delete next[line.id];
                return next;
              });
            };

            const handleLineBlur = (e: React.FocusEvent) => {
              const relatedTarget = e.relatedTarget as HTMLElement | null;
              if (relatedTarget?.closest(`[data-line-edit="${line.id}"]`)) return;
              if (!values) return;
              const hasChanges =
                values.character_name !== line.character_name ||
                values.text !== line.text ||
                (values.stage_direction || "") !== (line.stage_direction || "");
              if (hasChanges) {
                saveLine(line);
              } else {
                cancelLineEdit();
              }
            };

            const handleLineKeyDown = (e: React.KeyboardEvent) => {
              if (e.key === "Escape") cancelLineEdit();
              if (e.key === "Enter" && e.metaKey) saveLine(line);
            };

            return (
              <div
                key={line.id}
                className="text-center rounded-md px-3 py-2"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isEditing && values ? (
                    <motion.div
                      key="editing"
                      data-line-edit={line.id}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-2"
                    >
                      {/* Character name + stage direction — centered inline */}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <input
                          value={values.character_name}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, character_name: e.target.value },
                            }))
                          }
                          className="text-sm font-bold uppercase tracking-widest text-neutral-700 bg-transparent border-b-2 border-dashed border-neutral-400 outline-none text-center py-0.5 px-1"
                          style={{ width: `${Math.max(4, values.character_name.length + 2)}ch` }}
                          disabled={saving !== null}
                          onBlur={handleLineBlur}
                          onKeyDown={handleLineKeyDown}
                          autoFocus
                        />
                        <input
                          placeholder="stage direction"
                          value={values.stage_direction}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, stage_direction: e.target.value },
                            }))
                          }
                          className="text-xs italic text-neutral-500 bg-transparent border-b border-dashed border-neutral-300 outline-none text-center py-0.5 px-1"
                          style={{ width: `${Math.max(10, (values.stage_direction?.length || 0) + 3)}ch` }}
                          disabled={saving !== null}
                          onBlur={handleLineBlur}
                          onKeyDown={handleLineKeyDown}
                        />
                      </div>

                      {/* Line text */}
                      <textarea
                        value={values.text}
                        onChange={(e) =>
                          setLineEditValues((prev) => ({
                            ...prev,
                            [line.id]: { ...values, text: e.target.value },
                          }))
                        }
                        rows={Math.max(1, Math.ceil(values.text.length / 50))}
                        className="text-base font-medium leading-relaxed w-full bg-transparent border-b border-dashed border-neutral-300 outline-none p-0 resize-none text-center text-neutral-800"
                        disabled={saving !== null}
                        onBlur={handleLineBlur}
                        onKeyDown={handleLineKeyDown}
                      />

                      {/* Save hint */}
                      <p className="text-[10px] text-neutral-400">
                        <kbd className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-sans">&#8984;Enter</kbd> save &middot; <kbd className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-sans">Esc</kbd> cancel
                      </p>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="display"
                      type="button"
                      onClick={() => startEditLine(line)}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="group w-full block rounded-md py-1 hover:bg-neutral-50 transition-colors"
                    >
                      {/* Character name row */}
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <span className="text-sm font-bold uppercase tracking-widest text-neutral-600">
                          {line.character_name}
                        </span>
                        {isMine && (
                          <span className="text-[11px] font-sans font-bold text-orange-500">(You)</span>
                        )}
                        {line.stage_direction && (
                          <span className="text-xs italic text-neutral-400 normal-case">
                            ({line.stage_direction})
                          </span>
                        )}
                        <Edit2 className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                      </div>
                      {/* Line text */}
                      <p className={cn(
                        "text-base font-medium leading-relaxed text-neutral-800",
                        highlightMyLines && isMine && "bg-yellow-200/70 rounded px-1 -mx-1 inline"
                      )}>
                        {line.text}
                      </p>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-neutral-200 text-center">
        <p className="text-sm text-neutral-500">
          {scene.line_count} lines
        </p>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      {/* Top bar */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-800 shrink-0 bg-neutral-950/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/my-scripts/${scriptId}`)}
          className="text-neutral-400 hover:text-neutral-100 gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to script</span>
        </Button>

        {/* Spacer to keep header balanced */}
        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
            title="Undo (⌘Z)"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!canRedo}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
            title="Redo (⌘⇧Z)"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-neutral-700 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDownloadModal(true)}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0"
            title="Download script"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleStartRehearsal}
            disabled={startingRehearsal || !selectedCharacter}
            className="gap-1.5"
          >
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Rehearse</span>
          </Button>
        </div>
      </motion.header>

      {/* Mobile tabs */}
      <div className="lg:hidden flex border-b border-neutral-800 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("details")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center transition-colors",
            mobileTab === "details"
              ? "text-neutral-100 border-b-2 border-primary"
              : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("script")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium text-center transition-colors",
            mobileTab === "script"
              ? "text-neutral-100 border-b-2 border-primary"
              : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          Script
        </button>
      </div>

      {/* Two-column body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — metadata */}
        <motion.aside
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            "w-full lg:w-[380px] lg:shrink-0 lg:border-r lg:border-neutral-800 overflow-y-auto p-5 sm:p-6",
            // On mobile, show/hide based on tab
            mobileTab === "details" ? "block lg:block" : "hidden lg:block"
          )}
        >
          {leftPanelContent}
        </motion.aside>

        {/* Right panel — script */}
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            "flex-1 overflow-y-auto p-4 sm:p-6",
            mobileTab === "script" ? "block lg:block" : "hidden lg:block"
          )}
        >
          {rightPanelContent}
        </motion.main>
      </div>

      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(open) => setUpgradeModal((prev) => ({ ...prev, open }))}
        feature={upgradeModal.feature}
        message={upgradeModal.message}
      />

      {/* Download format modal */}
      <Dialog open={showDownloadModal} onOpenChange={setShowDownloadModal}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Download Script</DialogTitle>
            <DialogDescription>Choose a format</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="outline" onClick={downloadAsTxt} className="justify-start gap-2">
              <Download className="w-4 h-4" />
              Download as .txt
            </Button>
            <Button variant="outline" onClick={downloadAsPdf} className="justify-start gap-2">
              <Download className="w-4 h-4" />
              Download as PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
