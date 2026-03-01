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
import api, { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
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
import { TTSWaveform } from "@/components/scenepartner/TTSWaveform";

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
  has_original_snapshot: boolean;
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
    }
  | {
      type: "voice";
      old: CharacterVoices;
      cur: CharacterVoices;
    }
  | {
      type: "selected_character";
      old: string;
      cur: string;
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
  onDragStart,
}: {
  lineId: number;
  children: (startDrag: (e: React.PointerEvent) => void) => React.ReactNode;
  onDragEnd?: () => void;
  onDragStart?: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={lineId}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
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
  const [draggingLineId, setDraggingLineId] = useState<number | null>(null);
  const pendingDragLineRef = useRef<number | null>(null);

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

  // Refs to track latest editing state for flush-on-navigate / unmount
  const editingLineIdRef = useRef<number | null>(null);
  editingLineIdRef.current = editingLineId;
  const lineEditValuesRef = useRef(lineEditValues);
  lineEditValuesRef.current = lineEditValues;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // ── Auto-save infrastructure ─────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedRef = useRef<Record<number, { character_name: string; text: string; stage_direction: string }>>({});
  const authTokenRef = useRef<string | null>(null);
  // Keep auth token fresh for keepalive fetches
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { authTokenRef.current = session?.access_token ?? null; });
  }, []);

  /** Fire-and-forget save of any in-progress line edit. Uses keepalive for beforeunload safety. */
  const flushPendingEdits = useCallback(() => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    const lid = editingLineIdRef.current;
    const s = sceneRef.current;
    if (lid === null || !s) return;
    const vals = lineEditValuesRef.current[lid];
    const line = s.lines.find(l => l.id === lid);
    if (!vals || !line) return;
    const last = lastAutoSavedRef.current[lid];
    const hasChanges = !last ||
      vals.character_name !== last.character_name ||
      vals.text !== last.text ||
      vals.stage_direction !== last.stage_direction;
    if (!hasChanges) return;
    const token = authTokenRef.current;
    fetch(`${API_URL}/api/scripts/${scriptId}/scenes/${sceneId}/lines/${lid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ character_name: vals.character_name, text: vals.text, stage_direction: vals.stage_direction || null }),
      keepalive: true,
    }).catch(() => {});
  }, [scriptId, sceneId]);

  useEffect(() => {
    if (editingLineId === null) return;
    const values = lineEditValuesRef.current[editingLineId];
    if (!values) return;
    const last = lastAutoSavedRef.current[editingLineId];
    // Compare against what was last saved (or the original line values on first edit)
    if (last && values.text === last.text && values.character_name === last.character_name && values.stage_direction === last.stage_direction) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const lid = editingLineId;
    autoSaveTimerRef.current = setTimeout(() => {
      const currentVals = lineEditValuesRef.current[lid];
      if (!currentVals) return;
      api.patch(
        `/api/scripts/${scriptId}/scenes/${sceneId}/lines/${lid}`,
        { character_name: currentVals.character_name, text: currentVals.text, stage_direction: currentVals.stage_direction || null }
      ).then(() => {
        lastAutoSavedRef.current[lid] = { ...currentVals };
        // Sync scene state so a refresh shows the saved data
        setScene(prev => prev ? {
          ...prev,
          lines: prev.lines.map(l =>
            l.id === lid ? { ...l, character_name: currentVals.character_name, text: currentVals.text, stage_direction: currentVals.stage_direction || null, word_count: currentVals.text.trim().split(/\s+/).filter(Boolean).length } : l
          ),
        } : prev);
      }).catch(() => {});
    }, 1200);

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [lineEditValues, editingLineId, scriptId, sceneId]);

  // ── Debounced auto-save for scene field edits ───────────────────────────
  const sceneFieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSceneFieldValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingSceneField) return;
    // Don't auto-save character names (handled by renameCharacter)
    if (editingSceneField === "character_1_name" || editingSceneField === "character_2_name") return;
    if (sceneEditValue === lastSceneFieldValueRef.current) return;

    if (sceneFieldSaveTimerRef.current) clearTimeout(sceneFieldSaveTimerRef.current);
    const field = editingSceneField as SceneStringKey;
    const val = sceneEditValue;
    sceneFieldSaveTimerRef.current = setTimeout(() => {
      api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, { [field]: val || null }).then(() => {
        lastSceneFieldValueRef.current = val;
        setScene(prev => prev ? { ...prev, [field]: val || null } : prev);
      }).catch(() => {});
    }, 1200);

    return () => { if (sceneFieldSaveTimerRef.current) clearTimeout(sceneFieldSaveTimerRef.current); };
  }, [sceneEditValue, editingSceneField, scriptId, sceneId]);

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
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [rehearsalStartLineIndex, setRehearsalStartLineIndex] = useState<number | null>(null);
  const [editingCharName, setEditingCharName] = useState<1 | 2 | null>(null);
  const [charNameEditValue, setCharNameEditValue] = useState("");
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState<string | number | null>(null);

  // Close voice dropdown when clicking outside
  // Use "click" (not "mousedown") so that input onBlur fires first and saves pending edits
  useEffect(() => {
    if (!voiceDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-voice-dropdown]") && !target.closest(".fixed.z-50")) {
        setVoiceDropdownOpen(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
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

  // Undo / Redo — persisted in sessionStorage across visits
  const undoStorageKey = `scene-undo-${sceneId}`;
  const redoStorageKey = `scene-redo-${sceneId}`;

  const loadedUndoRef = useRef(false);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  if (!loadedUndoRef.current && typeof window !== "undefined") {
    loadedUndoRef.current = true;
    try { const s = sessionStorage.getItem(undoStorageKey); if (s) undoStackRef.current = JSON.parse(s); } catch { /* ignore */ }
    try { const s = sessionStorage.getItem(redoStorageKey); if (s) redoStackRef.current = JSON.parse(s); } catch { /* ignore */ }
  }

  const [canUndo, setCanUndo] = useState(() => undoStackRef.current.length > 0);
  const [canRedo, setCanRedo] = useState(() => redoStackRef.current.length > 0);
  const [applyingHistory, setApplyingHistory] = useState(false);
  const [resetting, setResetting] = useState(false);

  const persistHistory = useCallback(() => {
    try {
      sessionStorage.setItem(undoStorageKey, JSON.stringify(undoStackRef.current));
      sessionStorage.setItem(redoStorageKey, JSON.stringify(redoStackRef.current));
    } catch { /* sessionStorage full — ignore */ }
  }, [undoStorageKey, redoStorageKey]);

  const syncHistory = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
    persistHistory();
  }, [persistHistory]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStackRef.current.push(entry);
    redoStackRef.current = [];
    syncHistory();
  }, [syncHistory]);

  // Auto-save on browser close/refresh
  useEffect(() => {
    const handler = () => { flushPendingEdits(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushPendingEdits]);

  const cancelAIRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount: flush pending edits + stop audio
  useEffect(() => {
    return () => { flushPendingEdits(); cancelAIRef.current?.(); };
  }, [flushPendingEdits]);

  // Upgrade modal
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature: string; message: string }>({
    open: false, feature: "", message: "",
  });

  const [ttsProgress, setTtsProgress] = useState(0);
  const ttsLineIdRef = useRef<number | null>(null);

  const { speak: speakAI, cancel: cancelAI, isSpeaking: isSpeakingAI, isLoading: isLoadingAI, audioElementRef: aiAudioRef } = useOpenAITTS({
    onEnd: () => { setPreviewingVoice(null); ttsLineIdRef.current = null; setTtsProgress(0); },
    onError: (err) => {
      setPreviewingVoice(null); ttsLineIdRef.current = null; setTtsProgress(0);
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "AI Voice", message: upgrade.message });
      } else {
        toast.error(err instanceof Error ? err.message : "Voice preview failed");
      }
    },
  });
  cancelAIRef.current = cancelAI;

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
        // Load saved voices — auto-assign defaults if none set
        const saved = getCharacterVoices(sceneId);
        if (!saved.character_1_voice || !saved.character_2_voice) {
          const updated = { ...saved };
          if (!updated.character_1_voice) updated.character_1_voice = "coral";
          if (!updated.character_2_voice) updated.character_2_voice = "ash";
          setCharacterVoices(sceneId, updated);
          setCharVoices(updated);
        } else {
          setCharVoices(saved);
        }
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
    // Trim whitespace and collapse multiple spaces
    const cleaned = value?.trim().replace(/\s{2,}/g, " ") || null;
    const newVal = cleaned ?? undefined;

    // Optimistic update — immediately reflect in UI before API round-trip
    setScene(prev => {
      if (!prev) return prev;
      const prevCharName = prev[field] as string | undefined;
      const updated = { ...prev, [field]: newVal };
      const isCharRename = (field === "character_1_name" || field === "character_2_name") && prevCharName && newVal && prevCharName !== newVal;
      if (isCharRename) {
        updated.lines = prev.lines.map(l => l.character_name === prevCharName ? { ...l, character_name: newVal as string } : l);
      }
      return updated;
    });
    setEditingSceneField(null);

    setSaving(`scene-${field}`);
    try {
      await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, {
        [field]: newVal,
      });
      pushUndo({ type: "scene_field", field, old: oldVal, cur: newVal });
      toast.success("Scene updated");
    } catch {
      // Revert optimistic update on failure
      setScene(prev => {
        if (!prev) return prev;
        const reverted = { ...prev, [field]: oldVal };
        if ((field === "character_1_name" || field === "character_2_name") && oldVal && newVal && oldVal !== newVal) {
          reverted.lines = prev.lines.map(l => l.character_name === (newVal as string) ? { ...l, character_name: oldVal as string } : l);
        }
        return reverted;
      });
      toast.error("Failed to update scene");
    } finally {
      setSaving(null);
    }
  };

  /** Rename a character everywhere — scene field, ALL lines, lineEditValues, selectedCharacter. */
  const renameCharacter = async (oldName: string, newName: string) => {
    if (!scene || !oldName || !newName || oldName === newName) return;

    // Determine which scene-level field to update
    const field: SceneStringKey | null =
      scene.character_1_name === oldName ? "character_1_name"
      : scene.character_2_name === oldName ? "character_2_name"
      : null;

    // Optimistic: update scene field + ALL lines with oldName
    setScene(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (field) (updated as Record<string, unknown>)[field] = newName;
      updated.lines = prev.lines.map(l =>
        l.character_name === oldName ? { ...l, character_name: newName } : l
      );
      return updated as SceneDetail;
    });

    // Update lineEditValues for any lines being tracked
    setLineEditValues(prev => {
      const next = { ...prev };
      for (const [id, vals] of Object.entries(next)) {
        if (vals.character_name === oldName) {
          next[Number(id)] = { ...vals, character_name: newName };
        }
      }
      return next;
    });

    // Update selectedCharacter
    if (selectedCharacter === oldName) setSelectedCharacter(newName);

    // Persist to backend: scene field + ALL affected line records
    setSaving(`scene-rename`);
    try {
      // Update scene-level character name
      if (field) {
        await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, { [field]: newName });
      }
      // Also update each individual line record that had the old name
      const affectedLines = scene.lines.filter(l => l.character_name === oldName);
      await Promise.all(
        affectedLines.map(l =>
          api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${l.id}`, { character_name: newName }).catch(() => {})
        )
      );
      if (field) pushUndo({ type: "scene_field", field, old: oldName, cur: newName });
      toast.success("Character renamed");
    } catch {
      // Revert on failure
      setScene(prev => {
        if (!prev) return prev;
        const reverted = { ...prev };
        if (field) (reverted as Record<string, unknown>)[field] = oldName;
        reverted.lines = prev.lines.map(l =>
          l.character_name === newName ? { ...l, character_name: oldName } : l
        );
        return reverted as SceneDetail;
      });
      setLineEditValues(prev => {
        const next = { ...prev };
        for (const [id, vals] of Object.entries(next)) {
          if (vals.character_name === newName) {
            next[Number(id)] = { ...vals, character_name: oldName };
          }
        }
        return next;
      });
      if (selectedCharacter === newName) setSelectedCharacter(oldName);
      toast.error("Failed to rename character");
    } finally {
      setSaving(null);
    }
  };

  const saveLine = async (line: SceneLine) => {
    // Cancel any pending auto-save since we're doing an explicit save
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
    const values = lineEditValues[line.id];
    if (!values || !scene) return;
    const oldVals = {
      character_name: line.character_name,
      text: line.text,
      stage_direction: line.stage_direction,
      word_count: line.word_count,
    };
    // Normalize whitespace: trim edges, collapse internal runs
    const trimmedText = values.text.trim().replace(/\s{2,}/g, " ");
    const trimmedCharName = values.character_name.trim().replace(/\s{2,}/g, " ");
    const trimmedStageDir = values.stage_direction?.trim().replace(/\s{2,}/g, " ") || null;
    const newWc = trimmedText.split(/\s+/).filter(Boolean).length;
    const newVals = {
      character_name: trimmedCharName,
      text: trimmedText,
      stage_direction: trimmedStageDir,
      word_count: newWc,
    };
    setSaving(`line-${line.id}`);
    try {
      await api.patch(
        `/api/scripts/${scriptId}/scenes/${sceneId}/lines/${line.id}`,
        {
          character_name: trimmedCharName,
          text: trimmedText,
          stage_direction: trimmedStageDir,
        }
      );
      pushUndo({ type: "line", lineId: line.id, old: oldVals, cur: newVals });
      setScene(prev => prev ? {
        ...prev,
        lines: prev.lines.map((l) =>
          l.id === line.id ? { ...l, ...newVals } : l
        ),
      } : prev);
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
    lastSceneFieldValueRef.current = current ?? "";
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
    const initVals = { character_name: line.character_name, text: line.text, stage_direction: line.stage_direction ?? "" };
    lastAutoSavedRef.current[line.id] = { ...initVals };
    setLineEditValues((prev) => ({ ...prev, [line.id]: initVals }));
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
    const oldVoices = { ...charVoices };
    const updated = {
      ...charVoices,
      [`character_${charNum}_voice`]: voiceId || null,
    } as CharacterVoices;
    pushUndo({ type: "voice", old: oldVoices, cur: updated });
    setCharVoices(updated);
    setCharacterVoices(sceneId, updated);

    // If TTS is playing a line by this character, restart with the new voice
    if ((isSpeakingAI || isLoadingAI) && ttsLineIdRef.current !== null && scene) {
      const playingLine = scene.lines.find(l => l.id === ttsLineIdRef.current);
      if (playingLine) {
        const playingCharNum = playingLine.character_name === scene.character_1_name ? 1 : 2;
        if (playingCharNum === charNum) {
          cancelAI();
          const editVals = lineEditValues[playingLine.id];
          const text = editVals?.text || playingLine.text;
          const stageDir = editVals?.stage_direction || playingLine.stage_direction || "";
          const instructions = stageDir ? `You are an actor performing a scene. The stage direction says: (${stageDir}). Deliver this line exactly as that direction demands. If it says "laughingly", laugh while speaking. If it says "whispering", whisper. If it says "angrily", sound genuinely angry. Fully commit to the direction in your vocal performance.` : "";
          setTtsProgress(0);
          speakAI(text, voiceId || "coral", instructions);
        }
      }
    }
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
    setDragLineOrder(newOrder);
    dragLineOrderRef.current = newOrder;
  }, []);

  const persistLineOrder = useCallback(async () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    setDraggingLineId(null);
    pendingDragLineRef.current = null;
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
    if (!scene || resetting) return;

    // Prefer the true original snapshot stored on the backend (from first extraction)
    if (scene.has_original_snapshot) {
      if (!window.confirm("Reset this scene to its original state? All edits will be lost.")) return;
      setResetting(true);
      try {
        await api.post(`/api/scripts/${scriptId}/scenes/${sceneId}/reset-to-original`);
        const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
        setScene(fresh);
        setEditingLineId(null);
        setLineEditValues({});
        undoStackRef.current = [];
        redoStackRef.current = [];
        syncHistory();
        toast.success("Scene reset to original");
      } catch {
        toast.error("Failed to reset scene");
      } finally {
        setResetting(false);
      }
      return;
    }

    // Fallback: reset to session-start snapshot
    if (!originalSceneRef.current) return;
    const original = originalSceneRef.current;
    const currentSnapshot: SceneDetail = JSON.parse(JSON.stringify(scene));

    setResetting(true);
    try {
      await api.post(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/bulk-reset`, {
        title: original.title,
        description: original.description,
        play_title: original.play_title,
        play_author: original.play_author,
        character_1_name: original.character_1_name,
        character_2_name: original.character_2_name,
        setting: original.setting,
        context_before: original.context_before,
        context_after: original.context_after,
        lines: original.lines.map(l => ({
          character_name: l.character_name,
          text: l.text,
          stage_direction: l.stage_direction,
          line_order: l.line_order,
        })),
      });

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
  }, [scene, scriptId, sceneId, resetting, pushUndo, syncHistory]);

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
    const cleanText = newLineText.trim().replace(/\s{2,}/g, " ");
    const cleanChar = newLineCharacter.trim().replace(/\s{2,}/g, " ");
    const cleanStageDir = newLineStageDir.trim().replace(/\s{2,}/g, " ") || null;
    if (!scene || !cleanText || !cleanChar) return;
    setAddingLine(true);
    try {
      const { data } = await api.post<{
        id: number; line_order: number; character_name: string;
        text: string; stage_direction: string | null; word_count: number; primary_emotion: string | null;
      }>(`/api/scripts/${scriptId}/scenes/${sceneId}/lines`, {
        character_name: cleanChar,
        text: cleanText,
        stage_direction: cleanStageDir,
        insert_after_line_id: addLineAfterLineId,
      });
      const { data: fresh } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
      pushUndo({
        type: "add_line",
        lineId: data.id,
        lineData: {
          character_name: cleanChar,
          text: cleanText,
          stage_direction: cleanStageDir,
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
        const otherVal = entry[v === "old" ? "cur" : "old"];
        const isCharRename = (entry.field === "character_1_name" || entry.field === "character_2_name") && otherVal && value && otherVal !== value;
        // Optimistic: update UI first
        setScene((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, [entry.field]: value };
          if (isCharRename) {
            updated.lines = prev.lines.map(l => l.character_name === otherVal ? { ...l, character_name: value as string } : l);
          }
          return updated;
        });
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
      } else if (entry.type === "voice") {
        const voices = entry[v];
        setCharVoices(voices);
        setCharacterVoices(sceneId, voices);
      } else if (entry.type === "selected_character") {
        setSelectedCharacter(entry[v]);
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
    if (seconds < 60) return `~${seconds}s`;
    const m = Math.round(seconds / 60);
    return `~${m} min`;
  };

  // Recalculate duration client-side from actual lines (~150 wpm)
  const computedDuration = useMemo(() => {
    if (!scene) return 0;
    const totalWords = scene.lines.reduce((acc, l) => acc + l.text.trim().split(/\s+/).filter(Boolean).length, 0);
    return Math.max(5, Math.round((totalWords / 150) * 60));
  }, [scene]);

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
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
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
              <Edit2 className="w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-colors flex-shrink-0 mt-0.5" />
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
              className="h-6 text-sm font-medium bg-transparent border-neutral-700 text-neutral-100 px-1.5 py-0 w-full max-w-[160px] focus-visible:ring-1 focus-visible:ring-primary/50"
              autoFocus
              maxLength={60}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  const newName = charNameEditValue.trim();
                  if (newName && newName !== name) renameCharacter(name, newName);
                  setEditingCharName(null);
                }
                if (e.key === "Escape") setEditingCharName(null);
              }}
              onBlur={() => {
                const newName = charNameEditValue.trim();
                if (newName && newName !== name) renameCharacter(name, newName);
                setEditingCharName(null);
              }}
            />
          ) : (
            <span className="font-medium text-sm text-neutral-100 group/charname inline-flex items-center gap-1 min-w-0">
              <span className="truncate">{name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCharName(charNum);
                  setCharNameEditValue(name);
                }}
                className="text-neutral-500 hover:text-neutral-300 transition-colors opacity-100 sm:opacity-0 sm:group-hover/charname:opacity-100"
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
        {(() => {
          const cleanGender = gender && gender.toLowerCase() !== "unknown" ? gender : null;
          const cleanAge = ageRange && ageRange.toLowerCase() !== "unknown" ? ageRange : null;
          const meta = [cleanGender, cleanAge].filter(Boolean);
          return meta.length > 0 ? (
            <div className="text-xs text-neutral-400 ml-5 mb-2">
              {meta.join(" · ")}
            </div>
          ) : null;
        })()}
        {/* Voice selector — only for the AI scene partner, not for "You" */}
        {!isSelected && (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <label className="text-[11px] text-neutral-400 uppercase tracking-wider ml-5">
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
                  <div className="absolute z-20 mt-1 w-full rounded-md bg-neutral-800 border border-neutral-700 shadow-lg py-1 max-h-[40vh] sm:max-h-48 overflow-y-auto">
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
        <div className="text-sm text-neutral-400 tracking-wide break-words">
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
                <Edit2 className="w-2.5 h-2.5 text-neutral-500 opacity-60 sm:opacity-0 sm:group-hover/pt:opacity-100 transition-opacity shrink-0" />
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
                <Edit2 className="w-2.5 h-2.5 text-neutral-500 opacity-60 sm:opacity-0 sm:group-hover/pa:opacity-100 transition-opacity shrink-0" />
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
                Description <span className="normal-case text-neutral-500">(optional)</span>
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
              <p className="text-sm text-neutral-400 italic px-2 py-1.5 -mx-2">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 rounded-full bg-neutral-900/70 border border-neutral-800 px-3.5 py-2 cursor-default">
              <Clock className="w-3.5 h-3.5 text-primary/70" />
              <span className="text-sm font-medium text-neutral-100 tabular-nums">{formatDuration(computedDuration)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent><p>Estimated at ~150 words per minute</p></TooltipContent>
        </Tooltip>
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
        <p className="text-[11px] text-neutral-400 -mt-1">
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
      {(scene.tone || (scene.primary_emotions && scene.primary_emotions.length > 0) || scene.setting) && (
        <div className="rounded-xl bg-neutral-900/40 border border-neutral-800 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-lg font-semibold text-neutral-100">Scene Info</h3>
          </div>

          {/* Tone */}
          {scene.tone && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Tone</p>
              <Badge className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30 capitalize hover:bg-amber-500/20">
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
                    className="text-xs bg-violet-500/15 text-violet-300 capitalize border border-violet-500/30"
                  >
                    {emotion}
                  </Badge>
                ))}
              </div>
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

      {/* Reset to original */}
      {scene.has_original_snapshot && (
        <button
          type="button"
          onClick={resetToOriginal}
          disabled={resetting}
          className="flex items-center gap-2 text-xs text-neutral-500 hover:text-orange-400 transition-colors mt-4 mx-auto disabled:opacity-50"
        >
          {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Reset to original
        </button>
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
      className="bg-white text-neutral-900 rounded-lg shadow-2xl border border-neutral-200 px-4 sm:px-10 py-5 sm:py-8 overflow-hidden"
      style={{ fontFamily: '"Courier New", Courier, monospace', fontStyle: 'italic' }}
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
            <Edit2 className="w-3.5 h-3.5 text-neutral-300 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
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
                className="inline-flex ml-0.5 opacity-60 sm:opacity-0 sm:group-hover/ppt:opacity-100 transition-opacity align-middle"
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
                className="inline-flex ml-0.5 opacity-60 sm:opacity-0 sm:group-hover/ppa:opacity-100 transition-opacity align-middle"
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


            const cancelLineEdit = () => {
              if (isSpeakingAI || isLoadingAI) cancelAI();
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
              if (relatedTarget?.closest(".fixed.z-50")) return;
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
              <ReorderLineItem key={lineId} lineId={lineId} onDragEnd={persistLineOrder} onDragStart={() => { setIsDragging(true); setDraggingLineId(pendingDragLineRef.current); }}>
                {(startDrag) => (
                <div className={cn("relative group/linerow transition-all px-2 py-1", isDragging && draggingLineId !== lineId && "opacity-50")}>
                  {/* Inner content — narrower, centered */}
                  <div className={cn(
                    "max-w-full sm:max-w-[600px] mx-auto flex flex-col items-center rounded-lg px-3 sm:px-4 py-3 border relative",
                    draggingLineId === lineId
                      ? "border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300/50"
                      : "border-transparent group-hover/linerow:bg-neutral-50 group-hover/linerow:border-neutral-200"
                  )}>
                  {/* Drag handle — inside container, left edge */}
                  {!isEditing && (
                    <div
                      className="absolute left-0.5 sm:left-1 top-1/2 -translate-y-1/2 opacity-60 sm:opacity-0 sm:group-hover/linerow:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none select-none p-1 rounded hover:bg-neutral-200/60 text-neutral-400 hover:text-neutral-600"
                      onPointerDown={(e) => {
                        isDraggingRef.current = true;
                        pendingDragLineRef.current = lineId;
                        startDrag(e);
                      }}
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
                      className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 opacity-60 sm:opacity-0 sm:group-hover/linerow:opacity-100 transition-opacity p-1 rounded-full bg-white border border-neutral-200 shadow-sm hover:bg-red-50 hover:border-red-300 z-10"
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
                    (() => {
                      const editCharNum = line.character_name === scene.character_1_name ? 1 : 2;
                      const editVid = editCharNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;
                      const editVoice = AI_VOICES.find(v => v.id === editVid);
                      const editDropdownKey = `edit-${lineId}`;
                      const isPlayingThisLine = (isSpeakingAI || isLoadingAI) && ttsLineIdRef.current === line.id;
                      return (
                    <motion.div
                      key="editing"
                      data-line-edit={line.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="space-y-2 w-full max-w-full mx-auto overflow-hidden"
                    >
                      {/* Playback controls + waveform — TOP (only for partner lines) */}
                      {!isMine && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPlayingThisLine) { cancelAI(); ttsLineIdRef.current = null; setTtsProgress(0); return; }
                            cancelAI();
                            const stageDir = values.stage_direction || line.stage_direction || "";
                            const instructions = stageDir ? `You are an actor performing a scene. The stage direction says: (${stageDir}). Deliver this line exactly as that direction demands. If it says "laughingly", laugh while speaking. If it says "whispering", whisper. If it says "angrily", sound genuinely angry. Fully commit to the direction in your vocal performance.` : "";
                            ttsLineIdRef.current = line.id;
                            setTtsProgress(0);
                            speakAI(values.text || line.text, editVid || "coral", instructions);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            isPlayingThisLine
                              ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                              : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                          )}
                          title={isPlayingThisLine ? "Stop playback" : "Listen to this line"}
                        >
                          {isPlayingThisLine && isLoadingAI ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Loading...</>
                          ) : isPlayingThisLine && isSpeakingAI ? (
                            <><Square className="w-3 h-3" /> Stop</>
                          ) : (
                            <><Volume2 className="w-3 h-3" /> Listen</>
                          )}
                        </button>
                      </div>
                      )}
                      <AnimatePresence>
                        {isPlayingThisLine && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <TTSWaveform
                              audioElement={aiAudioRef.current}
                              isLoading={isLoadingAI}
                              isSpeaking={isSpeakingAI}
                              onProgress={setTtsProgress}
                              className="max-w-[200px] sm:max-w-[240px] mx-auto"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Character name (dropdown trigger) + stage direction */}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <div className="relative" data-voice-dropdown>
                          <button
                            ref={(el) => { if (el) el.dataset.voiceBtnId = editDropdownKey; }}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setVoiceDropdownOpen(voiceDropdownOpen === editDropdownKey ? null : editDropdownKey); }}
                            className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                          >
                            {isMine ? (
                              <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                {line.character_name[0]?.toUpperCase()}
                              </div>
                            ) : editVoice ? (
                              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", editVoice.color)}>
                                {editVoice.label[0]}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-neutral-400 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                {line.character_name[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm font-bold uppercase tracking-widest text-neutral-700">{line.character_name}</span>
                            <ChevronDown className="w-3 h-3 text-neutral-400" />
                          </button>
                          {/* Dropdown reuses same pattern as parchment dropdown */}
                          {voiceDropdownOpen === editDropdownKey && (() => {
                            const btn = document.querySelector(`[data-voice-btn-id="${editDropdownKey}"]`) as HTMLElement | null;
                            const rect = btn?.getBoundingClientRect();
                            return (
                              <div
                                className="fixed z-50 w-[calc(100vw-16px)] sm:w-64 rounded-xl bg-white border border-neutral-200 shadow-xl py-2 max-h-[50vh] sm:max-h-[400px] overflow-y-auto"
                                style={rect ? { top: Math.min(rect.bottom + 8, window.innerHeight - 300), left: Math.max(8, Math.min(rect.left + rect.width / 2 - 128, window.innerWidth - 264)) } : {}}
                              >
                                {/* Character name */}
                                <div className="px-3 pb-2 border-b border-neutral-100">
                                  <label className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 block">Character name</label>
                                  <input
                                    key={line.character_name}
                                    type="text"
                                    defaultValue={line.character_name}
                                    className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2.5 py-1.5 text-sm text-neutral-800 focus:outline-none focus:border-neutral-400"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        if (val && val !== line.character_name) renameCharacter(line.character_name, val);
                                        setVoiceDropdownOpen(null);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val && val !== line.character_name) renameCharacter(line.character_name, val);
                                    }}
                                  />
                                </div>
                                {/* Role selector */}
                                <div className="px-3 py-2 border-b border-neutral-100">
                                  <label className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 block">Role</label>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); if (!isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: line.character_name }); } setSelectedCharacter(line.character_name); }}
                                      className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", isMine ? "bg-orange-500 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200")}
                                    >You</button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const otherChar = line.character_name === scene.character_1_name ? scene.character_2_name : scene.character_1_name;
                                        if (isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: otherChar }); }
                                        setSelectedCharacter(otherChar);
                                      }}
                                      className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", !isMine ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200")}
                                    >Scene partner</button>
                                  </div>
                                </div>
                                {/* Voice selection (only for AI partner) */}
                                {!isMine && (
                                  <>
                                    <div className="px-3 pt-2 pb-1">
                                      <label className="text-[10px] uppercase tracking-wider text-neutral-400 block">Voice</label>
                                    </div>
                                    {AI_VOICES.map((v) => (
                                      <button
                                        key={v.id}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleVoiceChange(editCharNum, v.id); setVoiceDropdownOpen(null); }}
                                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors text-left", editVid === v.id && "bg-neutral-100")}
                                      >
                                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", v.color)}>{v.label[0]}</div>
                                        <span className="text-neutral-700 text-sm">{v.label}</span>
                                        <span className="text-neutral-400 text-xs">— {v.desc}</span>
                                        {editVid === v.id && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <textarea
                          value={values.stage_direction}
                          maxLength={120}
                          placeholder="Stage directions"
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, stage_direction: e.target.value },
                            }))
                          }
                          rows={Math.max(1, Math.ceil((values.stage_direction?.length || 0) / 40))}
                          className="text-xs italic text-neutral-500 bg-transparent border-b border-dashed border-neutral-300 outline-none text-center py-0.5 px-2 resize-none w-full sm:max-w-[300px] placeholder:italic placeholder:text-neutral-300"
                          disabled={saving !== null}
                          onBlur={handleLineBlur}
                          onKeyDown={handleLineKeyDown}
                        />
                        {values.stage_direction && (
                          <span className="text-[10px] text-neutral-400">{values.stage_direction.length}/120</span>
                        )}
                      </div>

                      {/* Line text — animated swap between word highlight and textarea */}
                      <div className="relative w-full">
                        <AnimatePresence mode="wait">
                          {isPlayingThisLine && isSpeakingAI ? (
                            <motion.div
                              key="highlight"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              role="button"
                              tabIndex={0}
                              onClick={() => { cancelAI(); ttsLineIdRef.current = null; setTtsProgress(0); }}
                              className="text-base font-medium leading-relaxed w-full py-1 text-center break-words cursor-pointer"
                              style={{ overflowWrap: "anywhere" }}
                              title="Click to stop and edit"
                            >
                              {(() => {
                                const lineText = values.text || line.text;
                                const tokens = lineText.split(/(\s+)/);
                                const words = tokens.filter(t => t.trim());
                                const totalWords = words.length;
                                if (totalWords === 0) return <span>{lineText}</span>;

                                // Progress is already onset-corrected from TTSWaveform
                                const speechProgress = Math.max(0, Math.min(1, ttsProgress));

                                // Syllable estimation for word duration modeling
                                const estimateSyllables = (word: string): number => {
                                  const w = word.toLowerCase().replace(/[^a-z]/g, "");
                                  if (w.length <= 2) return 1;
                                  const vowelGroups = w.match(/[aeiouy]+/g) || [];
                                  let count = vowelGroups.length;
                                  if (w.endsWith("e") && count > 1) count--;
                                  if (w.endsWith("le") && w.length > 3 && !/[aeiouy]/.test(w[w.length - 3])) count++;
                                  return Math.max(1, count);
                                };

                                // Punctuation-based pause weights (TTS pauses after punctuation)
                                const trailingPause = (word: string): number => {
                                  if (/[.!?]$/.test(word)) return 0.6;
                                  if (/[;:]$/.test(word)) return 0.35;
                                  if (/[,]$/.test(word)) return 0.25;
                                  if (/[—–\-]$/.test(word)) return 0.3;
                                  if (/\.{2,}$/.test(word)) return 0.8;
                                  return 0;
                                };

                                // Word weight = syllables + inter-word gap + punctuation pause
                                const INTER_WORD_GAP = 0.15;
                                const wordWeights = words.map(w =>
                                  estimateSyllables(w) + INTER_WORD_GAP + trailingPause(w)
                                );
                                const totalWeight = wordWeights.reduce((a, b) => a + b, 0);

                                // Cumulative end-of-word positions (0..1)
                                const cumulative: number[] = [];
                                let sum = 0;
                                for (const wt of wordWeights) {
                                  sum += wt;
                                  cumulative.push(sum / totalWeight);
                                }

                                let wordIdx = 0;
                                return tokens.map((token, idx) => {
                                  if (!token.trim()) return <span key={idx}>{token}</span>;
                                  const wi = wordIdx;
                                  wordIdx++;
                                  const wordStart = wi > 0 ? cumulative[wi - 1] : 0;
                                  const wordEnd = cumulative[wi];
                                  const isHighlighted = wordEnd <= speechProgress;
                                  const isCurrent = !isHighlighted && speechProgress >= wordStart;
                                  return (
                                    <span
                                      key={idx}
                                      className={cn(
                                        "transition-colors duration-75 ease-out",
                                        isHighlighted
                                          ? "text-orange-600 font-semibold"
                                          : isCurrent
                                          ? "text-orange-500 font-semibold"
                                          : "text-neutral-300"
                                      )}
                                    >{token}</span>
                                  );
                                });
                              })()}
                            </motion.div>
                          ) : (
                            <motion.div
                              key="textarea"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.2 }}
                            >
                              <textarea
                                ref={autoFocusTextRef}
                                value={values.text}
                                onChange={(e) => {
                                  if (isSpeakingAI || isLoadingAI) { cancelAI(); ttsLineIdRef.current = null; setTtsProgress(0); }
                                  setLineEditValues((prev) => ({
                                    ...prev,
                                    [line.id]: { ...values, text: e.target.value },
                                  }));
                                }}
                                rows={Math.max(2, Math.ceil(values.text.length / 60))}
                                className="text-base font-medium leading-relaxed w-full bg-transparent border-b-2 border-dashed border-neutral-300 outline-none py-1 resize-none text-neutral-800 break-words text-center"
                                disabled={saving !== null}
                                onBlur={handleLineBlur}
                                onKeyDown={handleLineKeyDown}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <p className="text-[10px] text-neutral-400 text-center">
                        <span className="hidden sm:inline">
                          <kbd className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-sans">&#8984;Enter</kbd> save &middot; <kbd className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-500 font-sans">Esc</kbd> cancel
                        </span>
                        <span className="sm:hidden">
                          Tap outside to save
                        </span>
                      </p>
                    </motion.div>
                      );
                    })()
                  ) : (
                    <div className="w-full">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => !isDragging && startEditLine(line)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); !isDragging && startEditLine(line); } }}
                      className="group/line-btn inline-flex flex-col items-center w-full max-w-full overflow-hidden rounded-md px-3 sm:px-4 py-2.5 sm:py-2 transition-colors cursor-pointer"
                    >
                      {/* Character name + avatar + stage direction */}
                      {(() => {
                        const charNum = line.character_name === scene.character_1_name ? 1 : 2;
                        const vid = charNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;
                        const voice = AI_VOICES.find(v => v.id === vid);
                        const dropdownKey = `parchment-${lineId}`;
                        return (
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <div className="relative" data-voice-dropdown onClick={(e) => e.stopPropagation()}>
                          <button
                            ref={(el) => { if (el) el.dataset.voiceBtnId = dropdownKey; }}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setVoiceDropdownOpen(voiceDropdownOpen === dropdownKey ? null : dropdownKey); }}
                            className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                          >
                            {/* Avatar */}
                            {isMine ? (
                              <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                {line.character_name[0]?.toUpperCase()}
                              </div>
                            ) : voice ? (
                              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", voice.color)}>
                                {voice.label[0]}
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-neutral-400 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                {line.character_name[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm font-bold uppercase tracking-widest text-neutral-600">
                              {line.character_name}
                            </span>
                            <span className={cn("text-[11px] font-sans font-bold min-w-[30px]", isMine ? "text-orange-500" : "text-transparent select-none pointer-events-none")}>{isMine ? "(You)" : "\u00A0"}</span>
                          </button>
                          {/* Combined character settings dropdown */}
                          {voiceDropdownOpen === dropdownKey && (() => {
                            const btn = document.querySelector(`[data-voice-btn-id="${dropdownKey}"]`) as HTMLElement | null;
                            const rect = btn?.getBoundingClientRect();
                            return (
                              <div
                                className="fixed z-50 w-[calc(100vw-16px)] sm:w-64 rounded-xl bg-white border border-neutral-200 shadow-xl py-2 max-h-[50vh] sm:max-h-[400px] overflow-y-auto"
                                style={rect ? { top: Math.min(rect.bottom + 8, window.innerHeight - 300), left: Math.max(8, Math.min(rect.left + rect.width / 2 - 128, window.innerWidth - 264)) } : {}}
                              >
                                {/* Character name */}
                                <div className="px-3 pb-2 border-b border-neutral-100">
                                  <label className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 block">Character name</label>
                                  <input
                                    key={line.character_name}
                                    type="text"
                                    defaultValue={line.character_name}
                                    className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2.5 py-1.5 text-sm text-neutral-800 focus:outline-none focus:border-neutral-400"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const val = (e.target as HTMLInputElement).value.trim();
                                        if (val && val !== line.character_name) renameCharacter(line.character_name, val);
                                        setVoiceDropdownOpen(null);
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val && val !== line.character_name) renameCharacter(line.character_name, val);
                                    }}
                                  />
                                </div>
                                {/* Role selector */}
                                <div className="px-3 py-2 border-b border-neutral-100">
                                  <label className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 block">Role</label>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); if (!isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: line.character_name }); } setSelectedCharacter(line.character_name); }}
                                      className={cn(
                                        "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                                        isMine ? "bg-orange-500 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                                      )}
                                    >
                                      You
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const otherChar = line.character_name === scene.character_1_name ? scene.character_2_name : scene.character_1_name;
                                        if (isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: otherChar }); }
                                        setSelectedCharacter(otherChar);
                                      }}
                                      className={cn(
                                        "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                                        !isMine ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                                      )}
                                    >
                                      Scene partner
                                    </button>
                                  </div>
                                </div>
                                {/* Voice selection (only for AI partner) */}
                                {!isMine && (
                                  <>
                                    <div className="px-3 pt-2 pb-1">
                                      <label className="text-[10px] uppercase tracking-wider text-neutral-400 block">Voice</label>
                                    </div>
                                    {AI_VOICES.map((v) => (
                                      <button
                                        key={v.id}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleVoiceChange(charNum, v.id); setVoiceDropdownOpen(null); }}
                                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-neutral-50 transition-colors text-left", vid === v.id && "bg-neutral-100")}
                                      >
                                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", v.color)}>{v.label[0]}</div>
                                        <span className="text-neutral-700 text-sm">{v.label}</span>
                                        <span className="text-neutral-400 text-xs">— {v.desc}</span>
                                        {vid === v.id && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {line.stage_direction && !isDragging && (
                          <span className="text-xs italic text-neutral-400 normal-case break-words whitespace-pre-wrap max-w-[250px]" style={{ overflowWrap: "anywhere" }}>
                            ({line.stage_direction})
                          </span>
                        )}
                        {!isDragging && (
                          <Edit2 className="w-3 h-3 text-neutral-400 opacity-60 sm:opacity-0 sm:group-hover/line-btn:opacity-100 transition-opacity shrink-0" />
                        )}
                      </div>
                        );
                      })()}
                      {/* Line text */}
                      <motion.p
                        layout="position"
                        className={cn(
                          "text-base font-medium leading-relaxed text-neutral-800 break-words whitespace-pre-wrap text-center w-full transition-colors duration-300",
                          highlightMyLines && isMine && "bg-yellow-200/70 rounded px-1 -mx-1"
                        )}
                        style={{ overflowWrap: "anywhere" }}
                        animate={highlightMyLines && isMine ? { scale: [1, 1.01, 1] } : { scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {line.text}
                      </motion.p>
                    </div>
                    </div>
                  )}
                  {/* Bottom toolbar — always visible on mobile, hover on desktop */}
                  {!isEditing && !isDragging && (
                    <div className="flex items-center gap-3 mt-1 pt-1 opacity-100 sm:opacity-0 sm:group-hover/linerow:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => openAddLineModal(line.id)}
                            className="p-1.5 sm:p-1 rounded hover:bg-neutral-200/60 transition-colors text-neutral-400 sm:text-neutral-500 hover:text-neutral-700"
                          >
                            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
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
                            className="p-1.5 sm:p-1 rounded hover:bg-neutral-200/60 transition-colors text-neutral-400 sm:text-neutral-500 hover:text-neutral-700"
                          >
                            <Play className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
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

      {/* Spacer after lines */}
      <div className="h-3" />

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

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

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
          onClick={() => { flushPendingEdits(); cancelAIRef.current?.(); router.push(`/my-scripts/${scriptId}`); }}
          className="text-neutral-400 hover:text-neutral-100 gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {/* Center: Editing tools */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={!canUndo || applyingHistory}
                className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
              >
                {applyingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Undo <kbd className="ml-1 text-[10px] opacity-60">&#8984;Z</kbd></p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={!canRedo || applyingHistory}
                className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
              >
                {applyingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Redo2 className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Redo <kbd className="ml-1 text-[10px] opacity-60">&#8984;&#8679;Z</kbd></p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0 disabled:opacity-30"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Reset to original</p></TooltipContent>
          </Tooltip>
          <div className="w-px h-5 bg-neutral-700 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadAsPdf}
                className="text-neutral-400 hover:text-neutral-100 h-8 w-8 p-0"
              >
                <Download className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Download PDF</p></TooltipContent>
          </Tooltip>
        </div>

        {/* Right: spacer for balance */}
        <div className="w-10 sm:w-[72px]" />
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
            "w-full lg:w-[480px] xl:w-[540px] lg:shrink-0 lg:border-r lg:border-neutral-800 overflow-y-auto p-4 sm:p-6",
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
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 gap-2 shadow-xl shadow-primary/20 rounded-full px-4 sm:px-6 h-11 sm:h-12"
      >
        <Play className="w-5 h-5" />
        <span className="hidden sm:inline">Rehearse</span>
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
        <DialogContent className="max-w-xs sm:max-w-sm p-0 overflow-hidden">
          {scene && (() => {
            const partner = selectedCharacter === scene.character_1_name ? scene.character_2_name : scene.character_1_name;
            const partnerNum = partner === scene.character_1_name ? 1 : 2;
            const vid = partnerNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;
            const voice = AI_VOICES.find(v => v.id === vid);
            return (
              <>
                <div className="px-5 pt-5 pb-3 space-y-3">
                  <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Rehearse</DialogTitle>
                    <DialogDescription className="sr-only">Start a rehearsal session</DialogDescription>
                  </DialogHeader>
                  {/* Characters — compact row */}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {selectedCharacter?.[0]?.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate flex-1">{selectedCharacter}</span>
                      <span className="text-[10px] text-orange-500 font-medium shrink-0">(You)</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", voice?.color ?? "bg-neutral-400")}>
                        {voice ? voice.label[0] : partner?.[0]?.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate flex-1">{partner}</span>
                      {voice && <span className="text-[10px] text-muted-foreground shrink-0">{voice.label} voice</span>}
                    </div>
                  </div>
                  {rehearsalStartLineIndex !== null && (
                    <p className="text-xs text-muted-foreground text-center">Starting from line {rehearsalStartLineIndex + 1} of {scene.lines.length}</p>
                  )}
                </div>
                <div className="flex gap-2 px-5 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRehearsalModal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
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
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Reset confirmation modal */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent className="max-w-xs sm:max-w-sm">
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
      <Dialog open={showAddLineModal} onOpenChange={(open) => { setShowAddLineModal(open); if (!open) setVoiceDropdownOpen(null); }}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Add line</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {/* Character selector with inline edit */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Character</Label>
              {scene && (
                <div className="flex gap-1.5">
                  {[scene.character_1_name, scene.character_2_name].map((charName) => {
                    const isUser = charName === selectedCharacter;
                    const isSelected = newLineCharacter === charName;
                    const charNum = charName === scene.character_1_name ? 1 : 2;
                    const vid = charNum === 1 ? charVoices.character_1_voice : charVoices.character_2_voice;
                    const voice = AI_VOICES.find(v => v.id === vid);
                    return (
                      <button
                        key={charName}
                        type="button"
                        onClick={() => setNewLineCharacter(charName)}
                        className={cn(
                          "flex-1 flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-all text-left min-w-0",
                          isSelected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {isUser ? (
                          <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                            {charName[0]?.toUpperCase()}
                          </span>
                        ) : voice ? (
                          <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", voice.color)}>
                            {voice.label[0]}
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-neutral-300 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                            {charName[0]?.toUpperCase()}
                          </span>
                        )}
                        <span className="flex flex-col min-w-0">
                          <span className="truncate text-xs font-medium">{charName}</span>
                          {isUser && <span className="text-[10px] leading-tight text-orange-500">(You)</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Voice selector for scene partner lines — custom dropdown */}
            {scene && newLineCharacter && newLineCharacter !== selectedCharacter && (() => {
              const charNum = newLineCharacter === scene.character_1_name ? 1 : 2;
              const voiceKey = charNum === 1 ? "character_1_voice" : "character_2_voice";
              const currentVoice = charVoices[voiceKey];
              const selectedVoice = AI_VOICES.find(v => v.id === currentVoice);
              return (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Voice</Label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setVoiceDropdownOpen(voiceDropdownOpen === "addline" ? null : "addline")}
                      className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                    >
                      {selectedVoice ? (
                        <>
                          <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0", selectedVoice.color)}>
                            {selectedVoice.label[0]}
                          </span>
                          <span className="flex-1 truncate text-foreground">{selectedVoice.label} — {selectedVoice.desc}</span>
                        </>
                      ) : (
                        <span className="flex-1 text-muted-foreground">Select voice...</span>
                      )}
                      <ChevronDown className={cn("w-3 h-3 text-muted-foreground shrink-0 transition-transform", voiceDropdownOpen === "addline" && "rotate-180")} />
                    </button>
                    {voiceDropdownOpen === "addline" && (
                      <div className="absolute z-20 mt-1 w-full rounded-md bg-popover border border-border shadow-lg py-1 max-h-40 overflow-y-auto">
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
                            <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0", v.color)}>
                              {v.label[0]}
                            </span>
                            <span className="flex-1 min-w-0 truncate">{v.label} <span className="text-muted-foreground">— {v.desc}</span></span>
                            {currentVoice === v.id && <Check className="w-3 h-3 text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* Line text */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Line text</Label>
              <Textarea
                value={newLineText}
                onChange={(e) => setNewLineText(e.target.value)}
                placeholder="Type the line here..."
                rows={3}
                className="resize-none"
                autoFocus
              />
            </div>
            {/* Stage direction */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Stage direction (optional)</Label>
              <Input
                value={newLineStageDir}
                onChange={(e) => setNewLineStageDir(e.target.value)}
                placeholder="e.g. softly, aside, laughing"
                maxLength={100}
                className="italic text-sm"
              />
            </div>
            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddLineModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddLine}
                disabled={addingLine || !newLineText.trim()}
                className="flex-1 gap-1.5"
              >
                {addingLine ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
