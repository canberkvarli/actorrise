"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Clock,
  FileText,
  Users,
  MapPin,
  Sparkles,
  Theater,
  RotateCcw,
  GripVertical,
  Wand2,
  Plus,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
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
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  getRehearsalSettings,
  setRehearsalSettings as persistRehearsalSettings,
  type RehearsalSettings,
} from "@/lib/scenepartnerStorage";
import { ContactModal } from "@/components/contact/ContactModal";

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
  | "play_title"
  | "play_author"
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
    }
  | {
      type: "reorder";
      oldOrder: number[];
      curOrder: number[];
    }
  | {
      type: "reset";
      oldScene: SceneDetail;
      curScene: SceneDetail;
    }
  | {
      type: "add_line";
      lineId: number;
      lineData: { character_name: string; text: string; stage_direction: string | null };
      insertAfterLineId: number | null;
    }
  | {
      type: "delete_line";
      lineData: SceneLine;
      insertAfterLineId: number | null;
    };

// ---------------------------------------------------------------------------
// OpenAI TTS voice options
// ---------------------------------------------------------------------------

const AI_VOICES = [
  { id: "ash", label: "Ash", desc: "Warm, deep", gender: "male", color: "bg-blue-600" },
  { id: "echo", label: "Echo", desc: "Smooth, neutral", gender: "male", color: "bg-blue-500" },
  { id: "fable", label: "Fable", desc: "Expressive, British", gender: "male", color: "bg-indigo-500" },
  { id: "onyx", label: "Onyx", desc: "Deep, authoritative", gender: "male", color: "bg-blue-800" },
  { id: "coral", label: "Coral", desc: "Warm, expressive", gender: "female", color: "bg-rose-500" },
  { id: "nova", label: "Nova", desc: "Bright, energetic", gender: "female", color: "bg-pink-500" },
  { id: "sage", label: "Sage", desc: "Calm, measured", gender: "female", color: "bg-rose-600" },
  { id: "shimmer", label: "Shimmer", desc: "Light, youthful", gender: "female", color: "bg-pink-400" },
  { id: "alloy", label: "Alloy", desc: "Balanced, clear", gender: "neutral", color: "bg-slate-500" },
  { id: "ballad", label: "Ballad", desc: "Melodic, gentle", gender: "neutral", color: "bg-slate-600" },
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
// Reorder line item wrapper (needs useDragControls hook)
// ---------------------------------------------------------------------------

function ReorderLineItem({
  lineId,
  children,
  onDragEnd,
}: {
  lineId: number;
  children: (startDrag: (e: React.PointerEvent) => void) => React.ReactNode;
  onDragEnd?: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={lineId}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative"
    >
      {children((e) => controls.start(e))}
    </Reorder.Item>
  );
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
  const [editingLocation, setEditingLocation] = useState<"left" | "parchment">("left");
  const [sceneEditValue, setSceneEditValue] = useState("");
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [lineEditValues, setLineEditValues] = useState<
    Record<number, { character_name: string; text: string; stage_direction: string }>
  >({});

  // Character & rehearsal
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [startingRehearsal, setStartingRehearsal] = useState(false);
  const [showRehearsalModal, setShowRehearsalModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [generatingSynopsis, setGeneratingSynopsis] = useState(false);

  // Original scene snapshot for reset
  const originalSceneRef = useRef<SceneDetail | null>(null);

  // Drag-and-drop line order
  const [dragLineOrder, setDragLineOrder] = useState<number[]>([]);
  const dragLineOrderRef = useRef<number[]>([]);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

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

  const autoFocusTextRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the text textarea when editingLineId changes
  useEffect(() => {
    if (editingLineId !== null && autoFocusTextRef.current) {
      autoFocusTextRef.current.focus();
    }
  }, [editingLineId]);

  // Highlight my lines
  const [highlightMyLines, setHighlightMyLines] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("scene_highlight_my_lines") === "true";
  });
  const toggleHighlight = (on: boolean) => {
    setHighlightMyLines(on);
    localStorage.setItem("scene_highlight_my_lines", String(on));
  };

  // Add / delete line
  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [addLineAfterLineId, setAddLineAfterLineId] = useState<number | null>(null);
  const [newLineCharacter, setNewLineCharacter] = useState("");
  const [newLineText, setNewLineText] = useState("");
  const [newLineStageDir, setNewLineStageDir] = useState("");
  const [addingLine, setAddingLine] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<number | null>(null);
  const [customCharEditLineId, setCustomCharEditLineId] = useState<number | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [rehearsalStartLineIndex, setRehearsalStartLineIndex] = useState<number | null>(null);
  const [editingCharName, setEditingCharName] = useState<1 | 2 | null>(null);
  const [charNameEditValue, setCharNameEditValue] = useState("");
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState<1 | 2 | "addline" | null>(null);

  // Close voice dropdown when clicking outside
  useEffect(() => {
    if (!voiceDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-voice-dropdown]")) {
        setVoiceDropdownOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [voiceDropdownOpen]);

  // Rehearsal settings (inline in left panel)
  const [rehearsalSettings, setRehearsalSettingsLocal] = useState<RehearsalSettings>(() =>
    typeof window !== "undefined" ? getRehearsalSettings() : {
      pauseBetweenLinesSeconds: 3, skipMyLineIfSilent: false, skipAfterSeconds: 10,
      countdownSeconds: 3, useAIVoice: true, autoAdvanceOnFinish: true,
    }
  );
  const updateRehearsalSetting = useCallback((partial: Partial<RehearsalSettings>) => {
    setRehearsalSettingsLocal((prev) => {
      const next = { ...prev, ...partial };
      persistRehearsalSettings(partial);
      return next;
    });
  }, []);

  // Undo / Redo
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [applyingHistory, setApplyingHistory] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  // Line order memo
  const sortedLineIds = useMemo(
    () => scene ? scene.lines.slice().sort((a, b) => a.line_order - b.line_order).map(l => l.id) : [],
    [scene?.lines]
  );
  const lineMap = useMemo(
    () => scene ? new Map(scene.lines.map(l => [l.id, l])) : new Map<number, SceneLine>(),
    [scene?.lines]
  );

  // Sync drag order with scene data when not dragging
  useEffect(() => {
    if (!isDraggingRef.current && sortedLineIds.length > 0) {
      setDragLineOrder(sortedLineIds);
      dragLineOrderRef.current = sortedLineIds;
    }
  }, [sortedLineIds]);

  // Fetch scene
  useEffect(() => {
    if (!sceneId) return;
    (async () => {
      try {
        const { data } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
        setScene(data);
        // Store original snapshot for reset (deep clone)
        originalSceneRef.current = JSON.parse(JSON.stringify(data));
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

  const startEditScene = (field: SceneStringKey, current: string | null, location: "left" | "parchment" = "left") => {
    setEditingSceneField(field);
    setEditingLocation(location);
    setSceneEditValue(current ?? "");
  };

  const startEditLine = (line: SceneLine) => {
    // If already editing this line, do nothing
    if (editingLineId === line.id) return;

    // If editing another line, close it first (save if changed)
    if (editingLineId !== null && scene) {
      const prevLine = scene.lines.find(l => l.id === editingLineId);
      const prevValues = lineEditValues[editingLineId];
      if (prevLine && prevValues) {
        const hasChanges =
          prevValues.character_name !== prevLine.character_name ||
          prevValues.text !== prevLine.text ||
          (prevValues.stage_direction || "") !== (prevLine.stage_direction || "");
        if (hasChanges) {
          saveLine(prevLine);
        }
      }
      // Clear old editing state synchronously
      setLineEditValues((prev) => {
        const next = { ...prev };
        delete next[editingLineId];
        return next;
      });
    }

    // Set new editing state
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
        ...(rehearsalStartLineIndex !== null && { start_from_line_index: rehearsalStartLineIndex }),
      });
      setRehearsalStartLineIndex(null);
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
  }, [scene, selectedCharacter, router, rehearsalStartLineIndex]);

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

  const previewVoice = (charNum: 1 | 2, voiceIdOverride?: string) => {
    if ((isSpeakingAI || isLoadingAI) && previewingVoice === charNum) {
      cancelAI();
      setPreviewingVoice(null);
      return;
    }
    cancelAI();
    if (!scene) return;

    const voiceId = voiceIdOverride ??
      (charNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice);
    const voiceLabel = AI_VOICES.find((v) => v.id === voiceId)?.label ?? "your scene partner";
    const intro = `Hi, I'm ${voiceLabel}. I'll be your scene partner today.`;

    setPreviewingVoice(charNum);
    speakAI(intro, voiceId || "coral");
  };

  // ---------------------------------------------------------------------------
  // Drag-and-drop reorder
  // ---------------------------------------------------------------------------

  const handleReorder = useCallback((newOrder: number[]) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    setDragLineOrder(newOrder);
    dragLineOrderRef.current = newOrder;
  }, []);

  const persistLineOrder = useCallback(async () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    if (!scene) return;
    const currentOrder = dragLineOrderRef.current;
    // Check if order actually changed
    if (JSON.stringify(currentOrder) === JSON.stringify(sortedLineIds)) return;
    try {
      await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/reorder`, {
        line_ids: currentOrder,
      });
      pushUndo({ type: "reorder", oldOrder: sortedLineIds, curOrder: [...currentOrder] });
      setScene(prev => {
        if (!prev) return prev;
        return { ...prev, lines: prev.lines.map(l => ({ ...l, line_order: currentOrder.indexOf(l.id) })) };
      });
      toast.success("Lines reordered");
    } catch {
      toast.error("Failed to reorder lines");
      setDragLineOrder(sortedLineIds);
      dragLineOrderRef.current = sortedLineIds;
    }
  }, [scene, scriptId, sceneId, sortedLineIds]);

  // ---------------------------------------------------------------------------
  // Reset to original
  // ---------------------------------------------------------------------------

  const resetToOriginal = useCallback(async () => {
    if (!scene || !originalSceneRef.current || resetting) return;
    const original = originalSceneRef.current;
    const currentSnapshot: SceneDetail = JSON.parse(JSON.stringify(scene));

    setResetting(true);
    try {
      // 1. Reset scene-level fields
      await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, {
        title: original.title, description: original.description,
        play_title: original.play_title, play_author: original.play_author,
        character_1_name: original.character_1_name, character_2_name: original.character_2_name,
        setting: original.setting, context_before: original.context_before, context_after: original.context_after,
      });

      // 2. Fetch current state to know what exists
      const { data: current } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
      const originalIds = new Set(original.lines.map(l => l.id));
      const currentIds = new Set(current.lines.map((l: SceneLine) => l.id));

      // 3. Delete lines that were added after the original
      for (const currentLine of current.lines) {
        if (!originalIds.has(currentLine.id)) {
          try {
            await api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${currentLine.id}`);
          } catch { /* best effort */ }
        }
      }

      // 4. Update/recreate original lines
      for (const origLine of original.lines) {
        if (currentIds.has(origLine.id)) {
          // Line still exists — update it
          try {
            await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${origLine.id}`, {
              character_name: origLine.character_name, text: origLine.text, stage_direction: origLine.stage_direction,
            });
          } catch { /* skip */ }
        } else {
          // Line was deleted — recreate it
          try {
            await api.post(`/api/scripts/${scriptId}/scenes/${sceneId}/lines`, {
              character_name: origLine.character_name, text: origLine.text,
              stage_direction: origLine.stage_direction,
            });
          } catch { /* skip */ }
        }
      }

      // 5. Reorder to match original
      try {
        const { data: mid } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
        // Build a mapping: for recreated lines, match by text+character to find new IDs
        const origSorted = original.lines.slice().sort((a, b) => a.line_order - b.line_order);
        const reorderIds: number[] = [];
        const midLines = [...mid.lines];
        for (const origLine of origSorted) {
          // Try exact ID match first
          const byId = midLines.find((l: SceneLine) => l.id === origLine.id);
          if (byId) {
            reorderIds.push(byId.id);
            continue;
          }
          // Fallback: match by text + character_name (for recreated lines)
          const byContent = midLines.find((l: SceneLine) =>
            l.character_name === origLine.character_name && l.text === origLine.text && !reorderIds.includes(l.id)
          );
          if (byContent) reorderIds.push(byContent.id);
        }
        // Add any remaining lines not yet in the order
        for (const l of midLines) {
          if (!reorderIds.includes(l.id)) reorderIds.push(l.id);
        }
        if (reorderIds.length > 0) {
          await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/reorder`, { line_ids: reorderIds });
        }
      } catch { /* best effort */ }

      // 6. Re-fetch final state
      const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
      pushUndo({ type: "reset", oldScene: currentSnapshot, curScene: JSON.parse(JSON.stringify(fresh)) });
      setScene(fresh);
      setShowResetConfirm(false);
      toast.success("Script reset to original");
    } catch {
      toast.error("Failed to reset script");
    } finally {
      setResetting(false);
    }
  }, [scene, scriptId, sceneId, resetting]);

  // ---------------------------------------------------------------------------
  // AI Synopsis suggestion
  // ---------------------------------------------------------------------------

  const suggestSynopsis = useCallback(async () => {
    if (!scene) return;
    setGeneratingSynopsis(true);
    try {
      const { data } = await api.post<{ synopsis: string }>(
        `/api/scripts/${scriptId}/scenes/${sceneId}/suggest-synopsis`
      );
      if (data.synopsis) {
        await saveSceneField("description", data.synopsis);
      }
    } catch {
      toast.error("Could not generate a description right now. Please try again or write one manually.");
    } finally {
      setGeneratingSynopsis(false);
    }
  }, [scene, scriptId, sceneId]);

  // ---------------------------------------------------------------------------
  // Add / Delete line
  // ---------------------------------------------------------------------------

  const openAddLineModal = useCallback((afterLineId: number | null) => {
    if (!scene) return;
    setAddLineAfterLineId(afterLineId);
    setNewLineCharacter(scene.character_1_name);
    setNewLineText("");
    setNewLineStageDir("");
    setShowAddLineModal(true);
  }, [scene]);

  const handleAddLine = useCallback(async () => {
    if (!scene || !newLineText.trim() || !newLineCharacter.trim()) return;
    setAddingLine(true);
    try {
      const { data } = await api.post<{
        id: number; line_order: number; character_name: string;
        text: string; stage_direction: string | null; word_count: number; primary_emotion: string | null;
      }>(`/api/scripts/${scriptId}/scenes/${sceneId}/lines`, {
        character_name: newLineCharacter.trim(),
        text: newLineText.trim(),
        stage_direction: newLineStageDir.trim() || null,
        insert_after_line_id: addLineAfterLineId,
      });
      const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
      pushUndo({
        type: "add_line",
        lineId: data.id,
        lineData: {
          character_name: newLineCharacter.trim(),
          text: newLineText.trim(),
          stage_direction: newLineStageDir.trim() || null,
        },
        insertAfterLineId: addLineAfterLineId,
      });
      setScene(fresh);
      setShowAddLineModal(false);
      toast.success("Line added");
    } catch {
      toast.error("Failed to add line");
    } finally {
      setAddingLine(false);
    }
  }, [scene, scriptId, sceneId, newLineCharacter, newLineText, newLineStageDir, addLineAfterLineId]);

  const handleDeleteLine = useCallback(async (lineId: number) => {
    if (!scene) return;
    const lineToDelete = scene.lines.find(l => l.id === lineId);
    if (!lineToDelete) return;
    // Find the line before this one for re-insertion on undo
    const sorted = scene.lines.slice().sort((a, b) => a.line_order - b.line_order);
    const idx = sorted.findIndex(l => l.id === lineId);
    const insertAfter = idx > 0 ? sorted[idx - 1].id : null;

    // Optimistic: remove from UI instantly
    setScene(prev => prev ? { ...prev, lines: prev.lines.filter(l => l.id !== lineId) } : prev);
    pushUndo({ type: "delete_line", lineData: { ...lineToDelete }, insertAfterLineId: insertAfter });
    toast.success("Line deleted");

    try {
      await api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${lineId}`);
    } catch {
      // Revert optimistic update on failure
      setScene(prev => prev ? { ...prev, lines: [...prev.lines, lineToDelete].sort((a, b) => a.line_order - b.line_order) } : prev);
      // Remove the undo entry we just pushed since the delete failed
      undoStackRef.current.pop();
      syncHistory();
      toast.error("Failed to delete line");
    }
  }, [scene, scriptId, sceneId]);

  // ---------------------------------------------------------------------------
  // Undo / Redo actions
  // ---------------------------------------------------------------------------

  const applyEntry = useCallback(async (entry: UndoEntry, vals: "old" | "cur") => {
    if (!scene) return;
    const v = vals === "old" ? "old" : "cur";
    try {
      if (entry.type === "scene_field") {
        const value = entry[v];
        // Optimistic: update UI first
        setScene((prev) => prev ? { ...prev, [entry.field]: value } : prev);
        api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, { [entry.field]: value }).catch(() => {});
      } else if (entry.type === "line") {
        const lineVals = entry[v];
        // Optimistic: update UI first
        setScene((prev) =>
          prev
            ? { ...prev, lines: prev.lines.map((l) => (l.id === entry.lineId ? { ...l, ...lineVals } : l)) }
            : prev
        );
        api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${entry.lineId}`, {
          character_name: lineVals.character_name,
          text: lineVals.text,
          stage_direction: lineVals.stage_direction,
        }).catch(() => {});
      } else if (entry.type === "reorder") {
        const lineIds = entry[v === "old" ? "oldOrder" : "curOrder"];
        // Optimistic
        setScene((prev) => {
          if (!prev) return prev;
          return { ...prev, lines: prev.lines.map(l => ({ ...l, line_order: lineIds.indexOf(l.id) })) };
        });
        api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/reorder`, { line_ids: lineIds }).catch(() => {});
      } else if (entry.type === "reset") {
        const target = v === "old" ? entry.oldScene : entry.curScene;
        // Optimistic: show target state immediately
        setScene(JSON.parse(JSON.stringify(target)));
        // Persist in background
        (async () => {
          try {
            await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, {
              title: target.title, description: target.description,
              play_title: target.play_title, play_author: target.play_author,
              character_1_name: target.character_1_name, character_2_name: target.character_2_name,
              setting: target.setting, context_before: target.context_before, context_after: target.context_after,
            });
            for (const line of target.lines) {
              try {
                await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${line.id}`, {
                  character_name: line.character_name, text: line.text, stage_direction: line.stage_direction,
                });
              } catch { /* skip */ }
            }
          } catch { /* best effort */ }
        })();
      } else if (entry.type === "add_line") {
        if (v === "old") {
          // Undo add = delete the line — optimistic
          setScene((prev) => prev ? { ...prev, lines: prev.lines.filter(l => l.id !== entry.lineId) } : prev);
          api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${entry.lineId}`).catch(() => {});
        } else {
          // Redo add = re-create the line
          const { data: newLine } = await api.post<{ id: number }>(`/api/scripts/${scriptId}/scenes/${sceneId}/lines`, {
            character_name: entry.lineData.character_name,
            text: entry.lineData.text,
            stage_direction: entry.lineData.stage_direction,
            insert_after_line_id: entry.insertAfterLineId,
          });
          entry.lineId = newLine.id;
          const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
          setScene(fresh);
        }
      } else if (entry.type === "delete_line") {
        if (v === "old") {
          // Undo delete = re-create the line
          const { data: newLine } = await api.post<{ id: number }>(`/api/scripts/${scriptId}/scenes/${sceneId}/lines`, {
            character_name: entry.lineData.character_name,
            text: entry.lineData.text,
            stage_direction: entry.lineData.stage_direction,
            insert_after_line_id: entry.insertAfterLineId,
          });
          entry.lineData = { ...entry.lineData, id: newLine.id };
          const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
          setScene(fresh);
        } else {
          // Redo delete = optimistic removal
          setScene((prev) => prev ? { ...prev, lines: prev.lines.filter(l => l.id !== entry.lineData.id) } : prev);
          api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${entry.lineData.id}`).catch(() => {});
        }
      }
    } catch {
      // Re-fetch to get consistent state after failure
      try {
        const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
        setScene(fresh);
      } catch { /* ignore */ }
      toast.error("Failed to apply change");
    }
  }, [scene, scriptId, sceneId]);

  const undo = useCallback(async () => {
    if (applyingHistory) return;
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    setApplyingHistory(true);
    redoStackRef.current.push(entry);
    syncHistory();
    try {
      await applyEntry(entry, "old");
      toast.success("Undone");
    } finally {
      setApplyingHistory(false);
    }
  }, [applyEntry, applyingHistory]);

  const redo = useCallback(async () => {
    if (applyingHistory) return;
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    setApplyingHistory(true);
    undoStackRef.current.push(entry);
    syncHistory();
    try {
      await applyEntry(entry, "cur");
      toast.success("Redone");
    } finally {
      setApplyingHistory(false);
    }
  }, [applyEntry, applyingHistory]);

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

  const downloadAsPdf = useCallback(() => {
    if (!scene) return;
    const sortedLines = scene.lines
      .slice()
      .sort((a, b) => a.line_order - b.line_order);

    const linesHtml = sortedLines.map((l) => {
      const dir = l.stage_direction
        ? `<span class="stage-dir">(${l.stage_direction.replace(/&/g, "&amp;").replace(/</g, "&lt;")})</span>`
        : "";
      return `<div class="line"><div class="char-name">${l.character_name.toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;")} ${dir}</div><div class="line-text">${l.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div></div>`;
    }).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download as PDF");
      return;
    }
    const synopsisHtml = scene.description
      ? `<div class="synopsis">${scene.description.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`
      : "";

    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${scene.title.replace(/</g, "&lt;")}</title>
<style>
  @page { margin: 1.2in 1in; }
  @media print { body { -webkit-print-color-adjust: exact; } }
  body { font-family: 'Courier New', Courier, monospace; padding: 2em 0; margin: 0; line-height: 1.5; max-width: 650px; margin: 0 auto; color: #1a1a1a; }
  .header { text-align: center; margin-bottom: 2em; padding-bottom: 1.5em; border-bottom: 2px solid #333; }
  .title { font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 6px; }
  .attribution { font-size: 13px; color: #555; }
  .synopsis { font-size: 12px; font-style: italic; color: #555; text-align: center; margin-top: 0.8em; line-height: 1.5; max-width: 500px; margin-left: auto; margin-right: auto; }
  .line { margin-bottom: 1.5em; }
  .char-name { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 2px; }
  .stage-dir { font-weight: normal; font-style: italic; font-size: 11px; color: #666; text-transform: none; letter-spacing: normal; }
  .line-text { font-size: 14px; text-align: center; line-height: 1.6; }
</style></head>
<body>
  <div class="header">
    <div class="title">${scene.title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>
    <div class="attribution">from &ldquo;${scene.play_title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}&rdquo; by ${scene.play_author.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>
    ${synopsisHtml}
  </div>
  ${linesHtml}
</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  }, [scene]);

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
    multiline = false,
    maxLength?: number
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
      if (sceneEditValue !== str) {
        saveSceneField(field, sceneEditValue);
      } else {
        setEditingSceneField(null);
      }
    };

    const iconNextToLabel = field === "description";

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
            {label}
          </div>
          {iconNextToLabel && !isEditing && (
            <button
              type="button"
              onClick={() => startEditScene(field, str)}
              className="text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
        {isEditing ? (
          multiline ? (
            <>
              <Textarea
                value={sceneEditValue}
                onChange={(e) => setSceneEditValue(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
                rows={Math.min(8, Math.max(3, Math.ceil(sceneEditValue.length / 40)))}
                maxLength={maxLength}
                className="resize-none bg-transparent border-neutral-700 text-sm text-neutral-200 px-2 py-1.5 -mx-2 focus-visible:ring-1 focus-visible:ring-primary/50"
                autoFocus
                disabled={saving !== null}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
              />
              {maxLength && (
                <p className="text-[10px] text-neutral-500 text-right tabular-nums">
                  {sceneEditValue.length}/{maxLength}
                </p>
              )}
            </>
          ) : (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
              maxLength={maxLength}
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
            <p className={cn("text-sm flex-1 break-words line-clamp-4", str ? "text-neutral-200" : "text-neutral-500 italic")}>
              {str || `Add ${label.toLowerCase()}...`}
            </p>
            {!iconNextToLabel && (
              <Edit2 className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors flex-shrink-0 mt-0.5" />
            )}
          </button>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Character card renderer
  // ---------------------------------------------------------------------------

  const renderCharacterCard = (charNum: 1 | 2) => {
    const nameField = charNum === 1 ? "character_1_name" : "character_2_name";
    const name = charNum === 1 ? scene.character_1_name : scene.character_2_name;
    const gender = charNum === 1 ? scene.character_1_gender : scene.character_2_gender;
    const ageRange = charNum === 1 ? scene.character_1_age_range : scene.character_2_age_range;
    const isSelected = selectedCharacter === name;
    const voiceId =
      charNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;
    const isPreviewing = (isSpeakingAI || isLoadingAI) && previewingVoice === charNum;
    const isEditingName = editingCharName === charNum;

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
          {isEditingName ? (
            <Input
              value={charNameEditValue}
              onChange={(e) => setCharNameEditValue(e.target.value)}
              className="h-6 text-sm font-medium bg-transparent border-neutral-700 text-neutral-100 px-1.5 py-0 w-auto max-w-[160px] focus-visible:ring-1 focus-visible:ring-primary/50"
              autoFocus
              maxLength={60}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  const newName = charNameEditValue.trim();
                  if (newName && newName !== name) {
                    saveSceneField(nameField as SceneStringKey, newName);
                    if (selectedCharacter === name) setSelectedCharacter(newName);
                  }
                  setEditingCharName(null);
                }
                if (e.key === "Escape") setEditingCharName(null);
              }}
              onBlur={() => {
                const newName = charNameEditValue.trim();
                if (newName && newName !== name) {
                  saveSceneField(nameField as SceneStringKey, newName);
                  if (selectedCharacter === name) setSelectedCharacter(newName);
                }
                setEditingCharName(null);
              }}
            />
          ) : (
            <span className="font-medium text-sm text-neutral-100 group/charname inline-flex items-center gap-1">
              {name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCharName(charNum);
                  setCharNameEditValue(name);
                }}
                className="text-neutral-600 hover:text-neutral-400 transition-colors opacity-0 group-hover/charname:opacity-100"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </span>
          )}
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
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <label className="text-[11px] text-neutral-500 uppercase tracking-wider ml-5">
              Your scene partner
            </label>
            <div className="flex items-center gap-2 ml-5">
              {/* Custom voice dropdown */}
              <div className="flex-1 relative" data-voice-dropdown>
                <button
                  type="button"
                  onClick={() => setVoiceDropdownOpen(voiceDropdownOpen === charNum ? null : charNum)}
                  className="w-full flex items-center gap-2 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 px-2.5 py-1.5 hover:border-neutral-500 transition-colors text-left"
                >
                  {voiceId ? (
                    <>
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", AI_VOICES.find(v => v.id === voiceId)?.color ?? "bg-neutral-600")}>
                        {AI_VOICES.find(v => v.id === voiceId)?.label[0] ?? "?"}
                      </div>
                      <span className="flex-1 truncate">{AI_VOICES.find(v => v.id === voiceId)?.label} — {AI_VOICES.find(v => v.id === voiceId)?.desc}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] text-neutral-500 shrink-0">?</div>
                      <span className="flex-1 text-neutral-500">Select a voice...</span>
                    </>
                  )}
                  <ChevronDown className={cn("w-3.5 h-3.5 text-neutral-500 shrink-0 transition-transform", voiceDropdownOpen === charNum && "rotate-180")} />
                </button>
                {voiceDropdownOpen === charNum && (
                  <div className="absolute z-20 mt-1 w-full rounded-md bg-neutral-800 border border-neutral-700 shadow-lg py-1 max-h-48 overflow-y-auto">
                    {AI_VOICES.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { handleVoiceChange(charNum, v.id); setVoiceDropdownOpen(null); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-neutral-700/60 transition-colors text-left",
                          voiceId === v.id && "bg-neutral-700/40"
                        )}
                      >
                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", v.color)}>
                          {v.label[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-neutral-200">{v.label}</span>
                          <span className="text-neutral-500 ml-1">— {v.desc}</span>
                        </div>
                        {voiceId === v.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {voiceId && (
                <button
                  type="button"
                  onClick={() => previewVoice(charNum)}
                  className="p-1.5 rounded-md bg-neutral-800 border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-700 transition-colors text-neutral-300 hover:text-neutral-100"
                  title="Preview voice"
                >
                  {isPreviewing && isLoadingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isPreviewing ? (
                    <Square className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              )}
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
    <div className="space-y-5">
      {/* Header — title + attribution */}
      <div className="rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-900/60 border border-neutral-800 p-4 space-y-3 overflow-hidden">
        <div className="text-sm text-neutral-500 tracking-wide break-words">
          {editingSceneField === "play_title" && editingLocation === "left" ? (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              maxLength={120}
              className="inline-block h-7 w-auto bg-transparent border-neutral-700 text-sm text-neutral-200 px-1.5 py-0.5 focus-visible:ring-1 focus-visible:ring-primary/50"
              autoFocus
              disabled={saving !== null}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingSceneField(null);
                if (e.key === "Enter") saveSceneField("play_title", sceneEditValue);
              }}
              onBlur={() => {
                if (sceneEditValue !== scene.play_title) saveSceneField("play_title", sceneEditValue);
                else setEditingSceneField(null);
              }}
            />
          ) : (
            <>
              {"From "}
              <button
                type="button"
                onClick={() => startEditScene("play_title", scene.play_title, "left")}
                className="group/pt inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <span className="text-neutral-300 font-medium break-words">{scene.play_title}</span>
                <Edit2 className="w-2.5 h-2.5 text-neutral-600 opacity-0 group-hover/pt:opacity-100 transition-opacity shrink-0" />
              </button>
            </>
          )}
          {editingSceneField === "play_author" && editingLocation === "left" ? (
            <>
              {" by "}
              <Input
                value={sceneEditValue}
                onChange={(e) => setSceneEditValue(e.target.value)}
                maxLength={80}
                className="inline-block h-7 w-auto bg-transparent border-neutral-700 text-sm text-neutral-200 px-1.5 py-0.5 focus-visible:ring-1 focus-visible:ring-primary/50"
                autoFocus
                disabled={saving !== null}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingSceneField(null);
                  if (e.key === "Enter") saveSceneField("play_author", sceneEditValue);
                }}
                onBlur={() => {
                  if (sceneEditValue !== scene.play_author) saveSceneField("play_author", sceneEditValue);
                  else setEditingSceneField(null);
                }}
              />
            </>
          ) : (editingSceneField !== "play_title" || editingLocation !== "left") ? (
            <>
              {" by "}
              <button
                type="button"
                onClick={() => startEditScene("play_author", scene.play_author, "left")}
                className="group/pa inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <span className="text-neutral-300 font-medium break-words">{scene.play_author}</span>
                <Edit2 className="w-2.5 h-2.5 text-neutral-600 opacity-0 group-hover/pa:opacity-100 transition-opacity shrink-0" />
              </button>
            </>
          ) : (
            <>
              {" by "}
              <span className="text-neutral-300 font-medium break-words">{scene.play_author}</span>
            </>
          )}
        </div>
        {/* Description — icon-based controls */}
        {editingSceneField === "description" ? (
          renderEditableField("description", "Description", true, 300)
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                Description <span className="normal-case text-neutral-600">(optional)</span>
              </span>
              <button
                type="button"
                onClick={suggestSynopsis}
                disabled={generatingSynopsis}
                className="text-neutral-500 hover:text-primary transition-colors"
                title="Let AI create a description"
              >
                {generatingSynopsis ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => startEditScene("description", scene.description ?? "")}
                className="text-neutral-500 hover:text-neutral-300 transition-colors"
                title="Write manually"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            {scene.description && (
              <p className="text-sm text-neutral-200 break-words px-2 py-1.5 -mx-2">
                {scene.description}
              </p>
            )}
            {!scene.description && (
              <p className="text-sm text-neutral-500 italic px-2 py-1.5 -mx-2">
                No description yet
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stats row — horizontal pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-900/70 border border-neutral-800 px-3.5 py-2">
          <FileText className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-sm font-medium text-neutral-100 tabular-nums">{scene.line_count}</span>
          <span className="text-xs text-neutral-400">line{scene.line_count !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-900/70 border border-neutral-800 px-3.5 py-2">
          <Clock className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-sm font-medium text-neutral-100 tabular-nums">{formatDuration(scene.estimated_duration_seconds)}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-900/70 border border-neutral-800 px-3.5 py-2">
          <Users className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-sm font-medium text-neutral-100 tabular-nums">{scene.rehearsal_count}</span>
          <span className="text-xs text-neutral-400">rehearsal{scene.rehearsal_count !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Characters */}
      <div className="rounded-xl bg-neutral-900/40 border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Theater className="w-4 h-4 text-primary" />
          <h3 className="text-lg font-semibold text-neutral-100">Characters</h3>
        </div>
        <p className="text-[11px] text-neutral-500 -mt-1">
          Select who you&apos;ll play
        </p>
        <div className="space-y-2">
          {renderCharacterCard(1)}
          {renderCharacterCard(2)}
        </div>
      </div>

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

      {/* Rehearsal Settings — inline */}
      <div className="rounded-xl bg-neutral-900/40 border border-neutral-800 p-4 space-y-4">
        <h3 className="text-xl font-semibold text-neutral-100">Rehearsal Settings</h3>

        {/* Countdown */}
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-normal text-neutral-300">Pre-scene countdown</Label>
          <Switch
            checked={rehearsalSettings.countdownSeconds > 0}
            onCheckedChange={(on) => updateRehearsalSetting({ countdownSeconds: on ? 3 : 0 })}
          />
        </div>
        {rehearsalSettings.countdownSeconds > 0 && (
          <div className="flex items-center gap-2 pl-1">
            <Slider
              value={rehearsalSettings.countdownSeconds}
              onValueChange={(v) => updateRehearsalSetting({ countdownSeconds: v })}
              min={1} max={10} step={1}
              className="flex-1"
            />
            <span className="text-xs tabular-nums text-neutral-400 w-6">{rehearsalSettings.countdownSeconds}s</span>
          </div>
        )}

        {/* Auto-advance */}
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-normal text-neutral-300">Continue after my line</Label>
          <Switch
            checked={rehearsalSettings.autoAdvanceOnFinish}
            onCheckedChange={(v) => updateRehearsalSetting({ autoAdvanceOnFinish: v })}
          />
        </div>

        {/* Breathing room */}
        <div className="space-y-1.5">
          <Label className="text-sm font-normal text-neutral-300">Pause between lines</Label>
          <div className="flex items-center gap-2">
            <Slider
              value={rehearsalSettings.pauseBetweenLinesSeconds}
              onValueChange={(v) => updateRehearsalSetting({ pauseBetweenLinesSeconds: v })}
              min={0} max={10} step={1}
              className="flex-1"
            />
            <span className="text-xs tabular-nums text-neutral-400 w-6">{rehearsalSettings.pauseBetweenLinesSeconds}s</span>
          </div>
        </div>

        {/* Auto-skip silence */}
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-normal text-neutral-300">Auto-skip when silent</Label>
          <Switch
            checked={rehearsalSettings.skipMyLineIfSilent}
            onCheckedChange={(v) => updateRehearsalSetting({ skipMyLineIfSilent: v })}
          />
        </div>
        {rehearsalSettings.skipMyLineIfSilent && (
          <div className="flex items-center gap-2 pl-1">
            <Slider
              value={rehearsalSettings.skipAfterSeconds}
              onValueChange={(v) => updateRehearsalSetting({ skipAfterSeconds: v })}
              min={3} max={30} step={1}
              className="flex-1"
            />
            <span className="text-xs tabular-nums text-neutral-400 w-6">{rehearsalSettings.skipAfterSeconds}s</span>
          </div>
        )}
      </div>

      {/* Scene Info — tone, emotions, relationship, setting grouped */}
      {(scene.tone || (scene.primary_emotions && scene.primary_emotions.length > 0) || scene.relationship_dynamic || scene.setting) && (
        <div className="rounded-xl bg-neutral-900/40 border border-neutral-800 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-neutral-100">Scene Info</h3>
          </div>

          {/* Tone */}
          {scene.tone && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Tone</p>
              <Badge className="text-[11px] bg-primary/15 text-primary border-primary/30 capitalize hover:bg-primary/20">
                {scene.tone}
              </Badge>
            </div>
          )}

          {/* Emotions */}
          {scene.primary_emotions && scene.primary_emotions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Emotions</p>
              <div className="flex flex-wrap gap-1.5">
                {scene.primary_emotions.map((emotion) => (
                  <Badge
                    key={emotion}
                    variant="secondary"
                    className="text-[11px] bg-neutral-800 text-neutral-200 capitalize border border-neutral-700"
                  >
                    {emotion}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Relationship */}
          {scene.relationship_dynamic && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Relationship</p>
              <p className="text-sm text-neutral-200 capitalize">
                {scene.relationship_dynamic}
              </p>
            </div>
          )}

          {/* Setting */}
          {scene.setting && renderEditableField("setting", "Setting")}
        </div>
      )}

      {/* Context (collapsible) */}
      {(scene.context_before || scene.context_after) && (
        <div className="rounded-xl bg-neutral-900/40 border border-neutral-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setContextExpanded(!contextExpanded)}
            className="flex items-center justify-between w-full px-4 py-3 hover:bg-neutral-800/40 transition-colors"
          >
            <span className="text-sm font-medium text-neutral-300">Context</span>
            {contextExpanded ? (
              <ChevronUp className="w-4 h-4 text-neutral-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-500" />
            )}
          </button>
          <AnimatePresence>
            {contextExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-3 border-t border-neutral-800">
                  {renderEditableField("context_before", "Before this scene", true)}
                  {renderEditableField("context_after", "After this scene", true)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Feedback / Report */}
      <button
        type="button"
        onClick={() => setShowFeedbackModal(true)}
        className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors mt-2 mx-auto"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Feedback or report a bug
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Right panel content (parchment script)
  // ---------------------------------------------------------------------------

  const isMyLine = (charName: string) => charName === selectedCharacter;

  const rightPanelContent = (
    <div
      className="bg-white text-neutral-900 rounded-lg shadow-2xl border border-neutral-200 px-6 sm:px-10 py-6 sm:py-8 overflow-hidden"
      style={{ fontFamily: 'Courier, "Courier New", monospace' }}
    >
      {/* Title inside parchment — editable */}
      <div className="text-center mb-6 pb-5 border-b border-neutral-200">
        {editingSceneField === "title" ? (
          <Input
            value={sceneEditValue}
            onChange={(e) => setSceneEditValue(e.target.value)}
            className="text-xl font-bold uppercase tracking-wider text-center bg-transparent border-b-2 border-dashed border-neutral-400 border-x-0 border-t-0 rounded-none shadow-none focus-visible:ring-0 h-auto py-1"
            maxLength={120}
            autoFocus
            disabled={saving !== null}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingSceneField(null);
              if (e.key === "Enter") saveSceneField("title", sceneEditValue);
            }}
            onBlur={() => {
              if (sceneEditValue !== scene.title) saveSceneField("title", sceneEditValue);
              else setEditingSceneField(null);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => startEditScene("title", scene.title)}
            className="group inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <h2 className="text-xl font-bold uppercase tracking-wider break-words">{scene.title}</h2>
            <Edit2 className="w-3.5 h-3.5 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        <div className="text-lg text-neutral-500 mt-2 break-words">
          {editingSceneField === "play_title" && editingLocation === "parchment" ? (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              maxLength={120}
              className="inline-block h-7 w-auto bg-transparent border-b-2 border-dashed border-neutral-400 border-x-0 border-t-0 rounded-none shadow-none text-lg text-neutral-700 px-1.5 py-0.5 focus-visible:ring-0 text-center"
              autoFocus
              disabled={saving !== null}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingSceneField(null);
                if (e.key === "Enter") saveSceneField("play_title", sceneEditValue);
              }}
              onBlur={() => {
                if (sceneEditValue !== scene.play_title) saveSceneField("play_title", sceneEditValue);
                else setEditingSceneField(null);
              }}
            />
          ) : (
            <span className="group/ppt">
              {"from \u201C"}
              <button
                type="button"
                onClick={() => startEditScene("play_title", scene.play_title, "parchment")}
                className="hover:opacity-70 transition-opacity"
              >
                <span className="text-neutral-700 font-medium break-words">{scene.play_title}</span>
              </button>
              {"\u201D"}
              <button
                type="button"
                onClick={() => startEditScene("play_title", scene.play_title, "parchment")}
                className="inline-flex ml-0.5 opacity-0 group-hover/ppt:opacity-100 transition-opacity align-middle"
              >
                <Edit2 className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>
            </span>
          )}
          {editingSceneField === "play_author" && editingLocation === "parchment" ? (
            <>
              {" by "}
              <Input
                value={sceneEditValue}
                onChange={(e) => setSceneEditValue(e.target.value)}
                maxLength={80}
                className="inline-block h-7 w-auto bg-transparent border-b-2 border-dashed border-neutral-400 border-x-0 border-t-0 rounded-none shadow-none text-lg text-neutral-700 px-1.5 py-0.5 focus-visible:ring-0 text-center"
                autoFocus
                disabled={saving !== null}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingSceneField(null);
                  if (e.key === "Enter") saveSceneField("play_author", sceneEditValue);
                }}
                onBlur={() => {
                  if (sceneEditValue !== scene.play_author) saveSceneField("play_author", sceneEditValue);
                  else setEditingSceneField(null);
                }}
              />
            </>
          ) : (editingSceneField !== "play_title" || editingLocation !== "parchment") ? (
            <span className="group/ppa">
              {" by "}
              <button
                type="button"
                onClick={() => startEditScene("play_author", scene.play_author, "parchment")}
                className="hover:opacity-70 transition-opacity"
              >
                <span className="text-neutral-700 font-medium break-words">{scene.play_author}</span>
              </button>
              <button
                type="button"
                onClick={() => startEditScene("play_author", scene.play_author, "parchment")}
                className="inline-flex ml-0.5 opacity-0 group-hover/ppa:opacity-100 transition-opacity align-middle"
              >
                <Edit2 className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>
            </span>
          ) : (
            <>
              {" by "}
              <span className="text-neutral-700 font-medium break-words">{scene.play_author}</span>
            </>
          )}
        </div>
      </div>

      {/* Script lines — drag-and-drop reorderable */}
      <Reorder.Group as="div" axis="y" values={dragLineOrder} onReorder={handleReorder} className="space-y-1">
        {dragLineOrder.map((lineId, lineIdx) => {
            const line = lineMap.get(lineId);
            if (!line) return null;
            const isEditing = editingLineId === line.id;
            const values = lineEditValues[line.id];
            const isMine = isMyLine(line.character_name);

            const showCustomChar = customCharEditLineId === line.id;

            const cancelLineEdit = () => {
              setEditingLineId(null);
              setCustomCharEditLineId(null);
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
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveLine(line);
            };

            return (
              <ReorderLineItem key={lineId} lineId={lineId} onDragEnd={persistLineOrder}>
                {(startDrag) => (
                <div className="relative group/linerow transition-all px-2 py-1">
                  {/* Inner content — narrower, centered */}
                  <div className="max-w-[600px] mx-auto flex flex-col items-center rounded-lg px-4 py-3 border border-transparent group-hover/linerow:bg-neutral-50 group-hover/linerow:border-neutral-200 transition-all relative">
                  {/* Drag handle — inside container, left edge */}
                  {!isEditing && (
                    <div
                      className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/linerow:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none select-none p-1 rounded hover:bg-neutral-200/60 text-neutral-400 hover:text-neutral-600"
                      onPointerDown={startDrag}
                      title="Reorder lines"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {/* Delete button — top right on hover */}
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLine(line.id);
                      }}
                      disabled={deletingLineId === line.id}
                      className="absolute top-2 right-2 opacity-0 group-hover/linerow:opacity-100 transition-opacity p-1 rounded-full bg-white border border-neutral-200 shadow-sm hover:bg-red-50 hover:border-red-300 z-10"
                      title="Delete line"
                    >
                      {deletingLineId === line.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
                      ) : (
                        <Trash2 className="w-3 h-3 text-neutral-400 hover:text-red-500" />
                      )}
                    </button>
                  )}
                  {isEditing && values ? (
                    <div
                      data-line-edit={line.id}
                      className="space-y-2 w-full max-w-full mx-auto overflow-hidden"
                    >
                      {/* Character name (dropdown) + stage direction — centered inline */}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {showCustomChar ? (
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
                            placeholder="Character name"
                          />
                        ) : (
                          <select
                            value={
                              values.character_name === scene.character_1_name || values.character_name === scene.character_2_name
                                ? values.character_name
                                : "__custom__"
                            }
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setCustomCharEditLineId(line.id);
                              } else {
                                setLineEditValues((prev) => ({
                                  ...prev,
                                  [line.id]: { ...values, character_name: e.target.value },
                                }));
                              }
                            }}
                            className="text-sm font-bold uppercase tracking-widest text-neutral-700 bg-transparent border-b-2 border-dashed border-neutral-400 outline-none text-center py-0.5 px-1 cursor-pointer"
                            disabled={saving !== null}
                            onBlur={handleLineBlur}
                            onKeyDown={handleLineKeyDown}
                          >
                            <option value={scene.character_1_name}>{scene.character_1_name.toUpperCase()}</option>
                            <option value={scene.character_2_name}>{scene.character_2_name.toUpperCase()}</option>
                            <option value="__custom__">Rename...</option>
                          </select>
                        )}
                        <input
                          placeholder="Stage direction"
                          value={values.stage_direction}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, stage_direction: e.target.value },
                            }))
                          }
                          className="text-xs italic text-neutral-500 bg-transparent border-b border-dashed border-neutral-300 outline-none text-center py-0.5 px-1"
                          style={{ width: `${Math.max(18, (values.stage_direction?.length || 0) + 3)}ch` }}
                          disabled={saving !== null}
                          onBlur={handleLineBlur}
                          onKeyDown={handleLineKeyDown}
                        />
                      </div>

                      {/* Line text */}
                      <textarea
                        ref={autoFocusTextRef}
                        value={values.text}
                        onChange={(e) =>
                          setLineEditValues((prev) => ({
                            ...prev,
                            [line.id]: { ...values, text: e.target.value },
                          }))
                        }
                        rows={Math.max(2, Math.ceil(values.text.length / 60))}
                        className="text-base font-medium leading-relaxed w-full bg-transparent border-b-2 border-dashed border-neutral-300 outline-none py-1 resize-none text-neutral-800 break-words text-center"
                        disabled={saving !== null}
                        onBlur={handleLineBlur}
                        onKeyDown={handleLineKeyDown}
                      />

                      {/* Save hint — desktop vs mobile */}
                      <p className="text-[10px] text-neutral-400 text-center">
                        <span className="hidden sm:inline">
                          <kbd className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-sans">&#8984;Enter</kbd> save &middot; <kbd className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-sans">Esc</kbd> cancel
                        </span>
                        <span className="sm:hidden">
                          Tap outside to save
                        </span>
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditLine(line)}
                      className="group/line-btn inline-flex flex-col items-center w-full max-w-full overflow-hidden rounded-md px-4 py-2 transition-colors cursor-pointer"
                    >
                      {/* Character name + stage direction */}
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
                        <Edit2 className="w-3 h-3 text-neutral-400 opacity-0 group-hover/line-btn:opacity-100 transition-opacity shrink-0" />
                      </div>
                      {/* Line text */}
                      <p
                        className={cn(
                          "text-base font-medium leading-relaxed text-neutral-800 break-words whitespace-pre-wrap text-center w-full",
                          highlightMyLines && isMine && "bg-yellow-200/70 rounded px-1 -mx-1",
                          isDragging && "line-clamp-1"
                        )}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {line.text}
                      </p>
                    </button>
                  )}
                  {/* Bottom toolbar on hover */}
                  {!isEditing && (
                    <div className="flex items-center gap-3 mt-1 pt-1 opacity-0 group-hover/linerow:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => openAddLineModal(line.id)}
                            className="p-1 rounded hover:bg-neutral-200/60 transition-colors text-neutral-500 hover:text-neutral-700"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>Add a new line</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setRehearsalStartLineIndex(lineIdx);
                              setShowRehearsalModal(true);
                            }}
                            className="p-1 rounded hover:bg-neutral-200/60 transition-colors text-neutral-500 hover:text-neutral-700"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>Play from here</p></TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  </div>
                </div>
                )}
              </ReorderLineItem>
            );
          })}
      </Reorder.Group>

      {/* Add line at the bottom */}
      <div className="flex justify-center py-3">
        <button
          type="button"
          onClick={() => openAddLineModal(dragLineOrder.length > 0 ? dragLineOrder[dragLineOrder.length - 1] : null)}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors rounded-full border border-dashed border-neutral-400 px-3 py-1 hover:border-neutral-500"
        >
          <Plus className="w-3 h-3" />
          Add line
        </button>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-neutral-200 text-center">
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
        {/* Left: Back */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/my-scripts/${scriptId}`)}
          className="text-neutral-400 hover:text-neutral-100 gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {/* Center: Editing tools */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!canUndo || applyingHistory}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
            title="Undo (⌘Z)"
          >
            {applyingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!canRedo || applyingHistory}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
            title="Redo (⌘⇧Z)"
          >
            {applyingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Redo2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResetConfirm(true)}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
            title="Reset to original"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-neutral-700 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadAsPdf}
            className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0"
            title="Download as PDF"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>

        {/* Right: spacer for balance */}
        <div className="w-[72px]" />
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
            "w-full lg:w-[540px] lg:shrink-0 lg:border-r lg:border-neutral-800 overflow-y-auto p-5 sm:p-6",
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

      {/* Floating Rehearse button */}
      <Button
        size="lg"
        onClick={() => {
          if (editingLineId !== null) {
            toast("Please finish editing the current line first", { duration: 2000 });
            return;
          }
          setShowRehearsalModal(true);
        }}
        className="fixed bottom-6 right-6 z-50 gap-2 shadow-xl shadow-primary/20 rounded-full px-6 h-12"
      >
        <Play className="w-5 h-5" />
        <span>Rehearse</span>
      </Button>

      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(open) => setUpgradeModal((prev) => ({ ...prev, open }))}
        feature={upgradeModal.feature}
        message={upgradeModal.message}
      />

      <ContactModal
        open={showFeedbackModal}
        onOpenChange={setShowFeedbackModal}
        initialCategory="feedback"
      />

      {/* Rehearsal confirmation modal */}
      <Dialog open={showRehearsalModal} onOpenChange={(open) => { setShowRehearsalModal(open); if (!open) setRehearsalStartLineIndex(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl">Start Rehearsal</DialogTitle>
            <DialogDescription>
              You&apos;ll play as <span className="font-semibold text-foreground">{selectedCharacter}</span>.
              Your scene partner will read {selectedCharacter === scene.character_1_name ? scene.character_2_name : scene.character_1_name}.
              {rehearsalStartLineIndex !== null && (
                <span className="block mt-1 text-sm">Starting from line {rehearsalStartLineIndex + 1}.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowRehearsalModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowRehearsalModal(false);
                handleStartRehearsal();
              }}
              disabled={startingRehearsal || !selectedCharacter}
              className="flex-1 gap-1.5"
            >
              {startingRehearsal ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation modal */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset to Original</DialogTitle>
            <DialogDescription>
              This will revert all edits back to the original script. You can undo this action.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={resetToOriginal}
              disabled={resetting}
              className="flex-1 gap-1.5"
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {resetting ? "Resetting…" : "Reset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Line modal */}
      <Dialog open={showAddLineModal} onOpenChange={setShowAddLineModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Line</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Character</Label>
              <select
                value={newLineCharacter}
                onChange={(e) => setNewLineCharacter(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {scene && (
                  <>
                    <option value={scene.character_1_name}>{scene.character_1_name}</option>
                    <option value={scene.character_2_name}>{scene.character_2_name}</option>
                  </>
                )}
              </select>
            </div>
            {/* Voice for the non-user character (scene partner) */}
            {scene && newLineCharacter && newLineCharacter !== selectedCharacter && (() => {
              const charNum = newLineCharacter === scene.character_1_name ? 1 : 2;
              const voiceKey = charNum === 1 ? "character_1_voice" : "character_2_voice";
              const currentVoice = charVoices[voiceKey];
              const selectedVoice = AI_VOICES.find(v => v.id === currentVoice);
              return (
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Scene partner voice</Label>
                  <div className="relative" data-voice-dropdown>
                    <button
                      type="button"
                      onClick={() => setVoiceDropdownOpen(voiceDropdownOpen === "addline" ? null : "addline")}
                      className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left"
                    >
                      {selectedVoice ? (
                        <>
                          <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", selectedVoice.color)}>
                            {selectedVoice.label[0]}
                          </div>
                          <span className="flex-1 truncate">{selectedVoice.label} — {selectedVoice.desc}</span>
                        </>
                      ) : (
                        <>
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0">?</div>
                          <span className="flex-1 text-muted-foreground">Select a voice...</span>
                        </>
                      )}
                      <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", voiceDropdownOpen === "addline" && "rotate-180")} />
                    </button>
                    {voiceDropdownOpen === "addline" && (
                      <div className="absolute z-20 mt-1 w-full rounded-md bg-popover border border-border shadow-lg py-1 max-h-48 overflow-y-auto">
                        {AI_VOICES.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => { handleVoiceChange(charNum as 1 | 2, v.id); setVoiceDropdownOpen(null); }}
                            className={cn(
                              "w-full flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-accent transition-colors text-left",
                              currentVoice === v.id && "bg-accent/50"
                            )}
                          >
                            <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", v.color)}>
                              {v.label[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span>{v.label}</span>
                              <span className="text-muted-foreground ml-1">— {v.desc}</span>
                            </div>
                            {currentVoice === v.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label className="text-sm">Line text</Label>
              <Textarea
                value={newLineText}
                onChange={(e) => setNewLineText(e.target.value)}
                placeholder="Type line here..."
                rows={3}
                className="resize-none"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Stage direction (optional)</Label>
              <Input
                value={newLineStageDir}
                onChange={(e) => setNewLineStageDir(e.target.value)}
                placeholder="e.g. softly, aside, laughing"
                maxLength={100}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowAddLineModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddLine}
                disabled={addingLine || !newLineText.trim()}
                className="flex-1 gap-1.5"
              >
                {addingLine ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
