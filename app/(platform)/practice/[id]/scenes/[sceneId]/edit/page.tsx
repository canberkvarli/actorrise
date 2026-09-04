"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useSWR from "swr";
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
  Mic,
  Settings,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { suggestRoleMerges } from "@/lib/character-roles";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { cn } from "@/lib/utils";
import api, { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useOpenAITTS } from "@/hooks/useOpenAITTS";
import { useScript } from "@/hooks/useScripts";

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
import { renderTextWithStageDirections } from "@/lib/stageDirections";
import { ContactModal } from "@/components/contact/ContactModal";
import { SceneSettingsModal } from "@/components/scenepartner/SceneSettingsModal";
import { TTSWaveform } from "@/components/scenepartner/TTSWaveform";
import { useMicPermission } from "@/hooks/useMicPermission";

// ---------------------------------------------------------------------------
// Rehearsal loading overlay (whimsical texts)
// ---------------------------------------------------------------------------

const REHEARSAL_LOADING_TEXTS = [
  "Warming up the stage lights...",
  "Getting into character...",
  "Brushing up on the lines...",
  "Setting the scene...",
  "Cueing the spotlight...",
];

function RehearsalLoadingOverlay() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % REHEARSAL_LOADING_TEXTS.length), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-background flex items-center justify-center"
    >
      <div className="text-center space-y-4">
        <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin mx-auto" />
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-muted-foreground text-sm"
        >
          {REHEARSAL_LOADING_TEXTS[idx]}
        </motion.p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Scene edit loading screen (whimsical texts, dark theme)
// ---------------------------------------------------------------------------

const SCENE_EDIT_LOADING_TEXTS = [
  "Setting the scene...",
  "Arranging the script pages...",
  "Warming up the stage lights...",
  "Finding your mark...",
  "Cueing the spotlight...",
];

function SceneEditLoadingScreen() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SCENE_EDIT_LOADING_TEXTS.length), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <motion.div
          className="relative mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin mx-auto" />
        </motion.div>
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-muted-foreground text-sm"
        >
          {SCENE_EDIT_LOADING_TEXTS[idx]}
        </motion.p>
      </div>
    </div>
  );
}

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
  act: string | null;
  scene_number: string | null;
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
      // keyed by character name
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
  { id: "ballad", label: "Ballad", desc: "Melodic, theatrical", gender: "neutral", color: "bg-violet-600" },
] as const;

// ---------------------------------------------------------------------------
// Voice storage helpers (localStorage, keyed by scene ID)
// ---------------------------------------------------------------------------

const VOICE_STORAGE_KEY = "scene_partner_voices_v3";

// Map from character name → voice ID
type CharacterVoices = Record<string, string | null>;

const DEFAULT_VOICE_CYCLE = ["coral", "ash", "ballad", "sage", "onyx", "nova", "fable", "shimmer", "alloy", "echo"];

function getCharacterVoices(sceneId: number): CharacterVoices {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VOICE_STORAGE_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, CharacterVoices>;
    return all[String(sceneId)] ?? {};
  } catch {
    return {};
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

  // Character & rehearsal.
  // An actor can cover several parts in one run. The first entry is the primary
  // role — it drives the single-character UI (highlighting, the rehearse card) and
  // is what older clients/sessions call `user_character`.
  const [myRoles, setMyRoles] = useState<string[]>([]);
  /** "keep|drop" pairs the actor said were genuinely different characters. */
  const [dismissedMerges, setDismissedMerges] = useState<string[]>([]);
  const selectedCharacter = myRoles[0] ?? "";
  /** Replace the whole selection with one role (used where picking is single-choice). */
  const setSelectedCharacter = useCallback(
    (name: string) => setMyRoles(name ? [name] : []),
    [],
  );
  /** Add or remove a role without disturbing the others. */
  const toggleRole = useCallback((name: string) => {
    setMyRoles((prev) =>
      prev.includes(name)
        ? prev.filter((r) => r !== name)   // never leaves an empty selection un-handled: see the picker
        : [...prev, name],
    );
  }, []);
  const isMyRole = useCallback(
    (name: string) => myRoles.some((r) => r.trim().toLowerCase() === name.trim().toLowerCase()),
    [myRoles],
  );
  const [startingRehearsal, setStartingRehearsal] = useState(false);
  // Cold-read: a timed read-through before a single-take performance.
  // Read mode by default — the script reads clean; editing power is one tap away.
  const [editMode, setEditMode] = useState(false);
  /** The casting panel starts closed — the scene casts you on arrival. */
  const [castOpen, setCastOpen] = useState(false);
  const [showRehearsalModal, setShowRehearsalModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [generatingSynopsis, setGeneratingSynopsis] = useState(false);
  const [showMicModal, setShowMicModal] = useState(false);

  // Microphone permission
  const { status: micStatus, isGranted: micGranted, requestMic } = useMicPermission({ recheckOnVisible: true });

  // Ask for the mic here in the editor (once) so the browser permission prompt
  // is dealt with before the user begins performing — not mid-rehearsal.
  const micAutoRequestedRef = useRef(false);
  useEffect(() => {
    if (!micAutoRequestedRef.current && micStatus === "prompt") {
      micAutoRequestedRef.current = true;
      requestMic();
    }
  }, [micStatus, requestMic]);

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
  // Rehearsal settings are global, set-once prefs — collapsed by default to keep the panel calm.
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Voice — keyed by character name
  const [charVoices, setCharVoices] = useState<CharacterVoices>({});
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const autoFocusTextRef = useRef<HTMLTextAreaElement>(null);

  // Refs to track latest editing state for flush-on-navigate / unmount
  const editingLineIdRef = useRef<number | null>(null);
  editingLineIdRef.current = editingLineId;
  const lineEditValuesRef = useRef(lineEditValues);
  lineEditValuesRef.current = lineEditValues;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // ── Page-scoped toast helper (replaces instead of stacking) ──────────────
  // ── Page-scoped toast helper (replaces instead of stacking) ──────────────
  const TOAST_ID = "scene-edit";
  const pageToast = useMemo(() => ({
    success: (msg: string) => toast.success(msg, { id: TOAST_ID }),
    error: (msg: string) => toast.error(msg, { id: TOAST_ID }),
  }), []);

  // Reposition global toaster to top-right on this page
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-scene-edit-toast", "");
    style.textContent = `
      [data-sonner-toaster] {
        --offset: 16px !important;
        top: 64px !important;
        right: var(--offset) !important;
        bottom: auto !important;
        left: auto !important;
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

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
        // Invalidate rehearsal cache so changes appear immediately on next rehearse
        try { sessionStorage.removeItem(`actorrise_scene_${sceneId}`); } catch {}
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

  // Highlight my lines (synced with rehearsal settings)
  const [highlightMyLines, setHighlightMyLines] = useState(() => {
    if (typeof window === "undefined") return false;
    return getRehearsalSettings().highlightMyLines;
  });
  const toggleHighlight = (on: boolean) => {
    setHighlightMyLines(on);
    persistRehearsalSettings({ highlightMyLines: on });
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [rehearsalStartLineIndex, setRehearsalStartLineIndex] = useState<number | null>(null);
  // A recent unfinished session for this scene, so we can offer to resume from
  // where the actor left off instead of always restarting (Task 15).
  const [resumable, setResumable] = useState<{ id: number; current_line_index: number } | null>(null);
  const [editingCharName, setEditingCharName] = useState<1 | 2 | null>(null);
  const [charNameEditValue, setCharNameEditValue] = useState("");
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState<string | number | null>(null);

  // When the Rehearse modal opens, look for a resumable session for this scene.
  useEffect(() => {
    if (!showRehearsalModal || !Number.isFinite(sceneId)) return;
    let cancelled = false;
    api
      .get<{ session: { id: number; current_line_index: number } | null }>(
        `/api/scenes/${sceneId}/resumable-session`,
      )
      .then((res) => {
        const s = res.data.session;
        if (!cancelled) setResumable(s && s.current_line_index > 0 ? s : null);
      })
      .catch(() => {
        if (!cancelled) setResumable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showRehearsalModal, sceneId]);

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
      pauseBetweenLinesSeconds: 0.3, skipMyLineIfSilent: false, skipAfterSeconds: 10,
      countdownSeconds: 3, useAIVoice: true, autoAdvanceOnFinish: true, highlightMyLines: true,
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

  const { speak: speakAI, preload: preloadAI, cancel: cancelAI, isSpeaking: isSpeakingAI, isLoading: isLoadingAI, audioElementRef: aiAudioRef } = useOpenAITTS({
    onEnd: () => { setPreviewingVoice(null); ttsLineIdRef.current = null; setTtsProgress(0); },
    onError: (err) => {
      setPreviewingVoice(null); ttsLineIdRef.current = null; setTtsProgress(0);
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "AI Voice", message: upgrade.message });
      } else {
        pageToast.error(err instanceof Error ? err.message : "Voice preview failed");
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

  // Parent script data — used to populate the character assignment dropdown
  const { data: scriptData } = useScript(scriptId);
  const allScriptCharacters = scriptData?.characters?.map(c => c.name) ?? [];

  // Fetch scene via SWR for instant revisits (cached data shows immediately)
  const { data: swrScene } = useSWR<SceneDetail>(
    sceneId ? `/api/scenes/${sceneId}` : null,
    () => api.get<SceneDetail>(`/api/scenes/${sceneId}`).then((r) => r.data),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
      onError: () => {
        pageToast.error("Failed to load scene");
        router.push(`/practice?script=${scriptId}`);
      },
    }
  );

  // Seed local state from SWR data (runs once when data first arrives)
  const initializedSceneIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!swrScene || initializedSceneIdRef.current === swrScene.id) return;
    initializedSceneIdRef.current = swrScene.id;
    setScene(swrScene);
    setLoading(false);
    // Store original snapshot for reset (deep clone)
    originalSceneRef.current = JSON.parse(JSON.stringify(swrScene));
    // Load saved voices; assign cycling defaults for any character without one
    const saved = getCharacterVoices(sceneId);
    const uniqueChars = [...new Set(swrScene.lines.map(l => l.character_name))];
    // Default to character_1 — but only if a cue actually uses that name. A scene's
    // declared name can be a fuller display name than the cues ("Steve Komphela"
    // vs "STEVE"), and selecting it would highlight no lines and start a rehearsal
    // with nothing to say.
    const declared = swrScene.character_1_name;
    /* Falling back to uniqueChars[0] cast you as whoever happens to speak
       first, which in a scene that opens on a clerk or a waiter is a one-line
       part. Fall back to the biggest part instead — if the scene does not say
       who you are, the person with the most to say is the better guess. */
    const biggest = [...uniqueChars].sort(
      (a, b) =>
        swrScene.lines.filter(l => l.character_name === b).length -
        swrScene.lines.filter(l => l.character_name === a).length,
    )[0];
    const defaultRole =
      uniqueChars.find(c => c.trim().toLowerCase() === (declared ?? "").trim().toLowerCase())
      ?? biggest
      ?? declared;
    setSelectedCharacter(defaultRole);
    const updated = { ...saved };
    let voiceIdx = 0;
    for (const charName of uniqueChars) {
      if (!updated[charName]) {
        updated[charName] = DEFAULT_VOICE_CYCLE[voiceIdx % DEFAULT_VOICE_CYCLE.length];
        voiceIdx++;
      }
    }
    setCharacterVoices(sceneId, updated);
    setCharVoices(updated);
  }, [swrScene, sceneId]);

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
    pageToast.success("Saved");

    pushUndo({ type: "scene_field", field, old: oldVal, cur: newVal });

    // Fire API in background
    api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, {
      [field]: newVal,
    }).catch(() => {
      // Revert optimistic update on failure
      setScene(prev => {
        if (!prev) return prev;
        const reverted = { ...prev, [field]: oldVal };
        if ((field === "character_1_name" || field === "character_2_name") && oldVal && newVal && oldVal !== newVal) {
          reverted.lines = prev.lines.map(l => l.character_name === (newVal as string) ? { ...l, character_name: oldVal as string } : l);
        }
        return reverted;
      });
      pageToast.error("Failed to update scene");
    });
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

    // Follow the rename through every selected role
    setMyRoles((prev) => prev.map((r) => (r === oldName ? newName : r)));

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
      pageToast.success("Character renamed");
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
      setMyRoles((prev) => prev.map((r) => (r === newName ? oldName : r)));
      pageToast.error("Failed to rename character");
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
    // Optimistic: update UI immediately
    pushUndo({ type: "line", lineId: line.id, old: oldVals, cur: newVals });
    try { sessionStorage.removeItem(`actorrise_scene_${sceneId}`); } catch {}
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
    pageToast.success("Saved");

    // Fire API in background
    api.patch(
      `/api/scripts/${scriptId}/scenes/${sceneId}/lines/${line.id}`,
      {
        character_name: trimmedCharName,
        text: trimmedText,
        stage_direction: trimmedStageDir,
      }
    ).catch(() => {
      // Revert on failure
      setScene(prev => prev ? {
        ...prev,
        lines: prev.lines.map((l) =>
          l.id === line.id ? { ...l, ...oldVals } : l
        ),
      } : prev);
      pageToast.error("Failed to update line");
    });
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

  // When mic becomes granted while the mic modal is open, close it and re-open rehearsal
  useEffect(() => {
    if (micGranted && showMicModal) {
      setShowMicModal(false);
      setShowRehearsalModal(true);
    }
  }, [micGranted, showMicModal]);

  // ---------------------------------------------------------------------------
  // Rehearsal
  // ---------------------------------------------------------------------------

  const handleStartRehearsal = useCallback(async () => {
    if (!scene || !selectedCharacter) {
      pageToast.error("Please select a character first");
      return;
    }
    setStartingRehearsal(true);
    try {
      const { data } = await api.post<{ id: number } & Record<string, unknown>>("/api/scenes/rehearse/start", {
        scene_id: scene.id,
        user_character: selectedCharacter,   // primary role — older servers read this
        user_characters: myRoles,
        ...(rehearsalStartLineIndex !== null && { start_from_line_index: rehearsalStartLineIndex }),
      });
      setRehearsalStartLineIndex(null);
      // Cache session data so rehearsal page skips the GET round-trip
      try { sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data)); } catch { /* quota */ }
      // Store full character→voice map so rehearsal page uses user-assigned voices
      // Include voice metadata (label, color) so rehearsal can show avatars
      const voiceMapWithMeta: Record<string, { id: string; label: string; color: string }> = {};
      for (const [char, vid] of Object.entries(charVoices)) {
        const v = AI_VOICES.find(x => x.id === vid);
        voiceMapWithMeta[char] = { id: vid ?? 'coral', label: v?.label ?? 'Coral', color: v?.color ?? 'bg-rose-500' };
      }
      try { sessionStorage.setItem(`actorrise_voice_map_${data.id}`, JSON.stringify(voiceMapWithMeta)); } catch { /* quota */ }
      // Determine AI character's voice to pass to rehearsal
      const primaryAiChar = allSceneCharacters.find(c => !isMyRole(c));
      const aiCharVoice = primaryAiChar ? (charVoices[primaryAiChar] ?? "coral") : "coral";
      const voiceParam = aiCharVoice ? `&voice=${aiCharVoice}` : '';
      // Navigate immediately — no animation delay
      router.push(`/scenes/${scene.id}/rehearse?session=${data.id}&script=${scriptId}${voiceParam}`);
    } catch (err: unknown) {
      setStartingRehearsal(false); // only reset on error — on success the page navigates away
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "ScenePartner", message: upgrade.message });
      } else {
        const message =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : "Failed to start rehearsal";
        pageToast.error(typeof message === "string" ? message : "Failed to start rehearsal");
      }
    }
  }, [scene, selectedCharacter, router, rehearsalStartLineIndex, charVoices, scriptId]);

  // ---------------------------------------------------------------------------
  // Voice helpers
  // ---------------------------------------------------------------------------

  const handleVoiceChange = (charName: string, voiceId: string) => {
    const oldVoices = { ...charVoices };
    const updated: CharacterVoices = { ...charVoices, [charName]: voiceId || null };
    pushUndo({ type: "voice", old: oldVoices, cur: updated });
    setCharVoices(updated);
    setCharacterVoices(sceneId, updated);

    // If TTS is playing a line by this character, restart with the new voice
    if ((isSpeakingAI || isLoadingAI) && ttsLineIdRef.current !== null && scene) {
      const playingLine = scene.lines.find(l => l.id === ttsLineIdRef.current);
      if (playingLine && playingLine.character_name === charName) {
        cancelAI();
        const editVals = lineEditValues[playingLine.id];
        const text = editVals?.text || playingLine.text;
        const stageDir = editVals?.stage_direction || playingLine.stage_direction || "";
        const instructions = buildActorInstructions(playingLine.character_name, stageDir || undefined);
        setTtsProgress(0);
        speakAI(text, voiceId || "coral", instructions);
      }
    }
  };

  /** Build rich TTS instructions that give the voice an actual character to embody. */
  const buildActorInstructions = (charName: string, stageDir?: string): string => {
    const title = scene?.play_title || scene?.title || "this scene";
    const tone = scene?.tone;
    const emotions = scene?.primary_emotions?.length ? scene.primary_emotions.join(", ") : null;
    const dynamic = scene?.relationship_dynamic;
    const description = scene?.description;

    const context = [
      `You are ${charName} in "${title}".`,
      description ? description : null,
      tone ? `The scene is ${tone}.` : null,
      emotions ? `The emotional core is: ${emotions}.` : null,
      dynamic ? `The relationship between the characters is ${dynamic}.` : null,
    ].filter(Boolean).join(" ");

    const stagePart = stageDir
      ? `The stage direction says: "${stageDir}" — commit to it completely, let it transform your delivery.`
      : `Fully inhabit this character. React to the moment, the scene, the other characters. Let the context shape every word.`;

    const author = scene?.play_author?.toLowerCase() ?? "";
    const isVerse = author.includes("shakespeare") || author.includes("marlowe") || author.includes("jonson");
    const versePart = isVerse
      ? `\nThis is verse drama — speak with classical theatrical gravitas. Honor the natural rhythm of the lines, let the metre breathe. Treat archaic words (thee, thou, hath, dost) as completely natural speech, not affectations. Pause meaningfully at line breaks. Think RSC, not audiobook.`
      : "";

    return `${context}\n\nYou are a skilled, committed actor. Do not sound like a text-to-speech system. ${stagePart}${versePart}\n\nIf the dialogue contains [bracketed text], those are stage directions — do NOT read them aloud. Use them silently to inform your delivery and emotional state.`;
  };

  const previewVoice = (charName: string, voiceIdOverride?: string) => {
    if ((isSpeakingAI || isLoadingAI) && previewingVoice === charName) {
      cancelAI();
      setPreviewingVoice(null);
      return;
    }
    cancelAI();
    if (!scene) return;

    const voiceId = voiceIdOverride ?? charVoices[charName];
    const title = scene?.play_title || scene?.title;
    const intro = title
      ? `I'll be playing ${charName} from "${title}". Ready when you are.`
      : `I'll be playing ${charName}. Ready when you are.`;
    const instructions = buildActorInstructions(charName);

    setPreviewingVoice(charName);
    speakAI(intro, voiceId || "coral", instructions);
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
    const prevOrder = sortedLineIds;
    // Check if order actually changed
    if (JSON.stringify(currentOrder) === JSON.stringify(prevOrder)) return;

    // Optimistic: update UI + toast immediately
    pushUndo({ type: "reorder", oldOrder: prevOrder, curOrder: [...currentOrder] });
    setScene(prev => {
      if (!prev) return prev;
      return { ...prev, lines: prev.lines.map(l => ({ ...l, line_order: currentOrder.indexOf(l.id) })) };
    });
    pageToast.success("Lines reordered");

    // Fire API in background
    api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/reorder`, {
      line_ids: currentOrder,
    }).catch(() => {
      setScene(prev => {
        if (!prev) return prev;
        return { ...prev, lines: prev.lines.map(l => ({ ...l, line_order: prevOrder.indexOf(l.id) })) };
      });
      setDragLineOrder(prevOrder);
      dragLineOrderRef.current = prevOrder;
      pageToast.error("Failed to reorder lines");
    });
  }, [scene, scriptId, sceneId, sortedLineIds, pageToast]);

  // ---------------------------------------------------------------------------
  // Reset to original
  // ---------------------------------------------------------------------------

  const resetToOriginal = useCallback(async () => {
    if (!scene || resetting) return;

    // Prefer the true original snapshot stored on the backend (from first extraction)
    if (scene.has_original_snapshot) {
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
        setShowResetConfirm(false);
        pageToast.success("Scene reset to original");
      } catch {
        pageToast.error("Failed to reset scene. Try again.");
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
      pageToast.success("Script reset to original");
    } catch {
      pageToast.error("Failed to reset script");
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
      pageToast.error("Could not generate a description right now. Please try again or write one manually.");
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
      pageToast.success("Line added");
    } catch {
      pageToast.error("Failed to add line");
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
    pageToast.success("Line deleted");

    try {
      await api.delete(`/api/scripts/${scriptId}/scenes/${sceneId}/lines/${lineId}`);
    } catch {
      // Revert optimistic update on failure
      setScene(prev => prev ? { ...prev, lines: [...prev.lines, lineToDelete].sort((a, b) => a.line_order - b.line_order) } : prev);
      // Remove the undo entry we just pushed since the delete failed
      undoStackRef.current.pop();
      syncHistory();
      pageToast.error("Failed to delete line");
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
      pageToast.error("Failed to apply change");
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
      pageToast.success("Undone");
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
      pageToast.success("Redone");
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

  // All unique characters who speak in this scene (sorted by line count descending)
  const allSceneCharacters = useMemo(() => {
    if (!scene) return [];
    const counts: Record<string, number> = {};
    for (const l of scene.lines) {
      counts[l.character_name] = (counts[l.character_name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [scene]);

  const sceneLineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of scene?.lines ?? []) {
      counts[l.character_name] = (counts[l.character_name] ?? 0) + 1;
    }
    return counts;
  }, [scene]);

  // Scripts shorten names as they go ("DANIEL" early, "DAN" later) and the parser
  // records both, so one part looks like two characters. Offer the merge rather
  // than applying it — some scenes really do have a Dan and a Daniel.
  const roleMergeSuggestions = useMemo(
    () => suggestRoleMerges(allSceneCharacters, sceneLineCounts)
      .filter(([keep, drop]) => !dismissedMerges.includes(`${keep}|${drop}`)),
    [allSceneCharacters, sceneLineCounts, dismissedMerges],
  );

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
      pageToast.error("Please allow popups to download as PDF");
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
    <div class="attribution">from &ldquo;${scene.play_title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}&rdquo; by ${scene.play_author.replace(/&/g, "&amp;").replace(/</g, "&lt;")}${scene.act || scene.scene_number ? ` &middot; ${[scene.act, scene.scene_number].filter(Boolean).join(", ")}` : ""}</div>
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
    return <SceneEditLoadingScreen />;
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
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </div>
          {iconNextToLabel && !isEditing && (
            <button
              type="button"
              onClick={() => startEditScene(field, str)}
              className="text-muted-foreground hover:text-foreground transition-colors"
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
                className="resize-none bg-transparent border-border text-sm text-foreground px-2 py-1.5 -mx-2 focus-visible:ring-1 focus-visible:ring-primary/50"
                autoFocus
                disabled={saving !== null}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
              />
              {maxLength && (
                <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                  {sceneEditValue.length}/{maxLength}
                </p>
              )}
            </>
          ) : (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
              maxLength={maxLength}
              className="bg-transparent border-border text-sm text-foreground h-auto px-2 py-1.5 -mx-2 focus-visible:ring-1 focus-visible:ring-primary/50"
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
            className="group flex items-start gap-2 text-left w-full rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/60 transition-colors border border-transparent"
          >
            <p className={cn("text-sm flex-1 break-words line-clamp-4", str ? "text-foreground" : "text-muted-foreground italic")}>
              {str || `Add ${label.toLowerCase()}...`}
            </p>
            {!iconNextToLabel && (
              <Edit2 className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-0.5" />
            )}
          </button>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Character card renderer
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Left panel content
  // ---------------------------------------------------------------------------

  const leftPanelContent = (
    <div className="space-y-5">
      {/* Header — title + attribution */}
      <div className="rounded-xl bg-gradient-to-br from-card to-card/60 border border-border p-4 space-y-3 overflow-hidden">
        <div className="text-sm text-muted-foreground tracking-wide break-words">
          {editingSceneField === "play_title" && editingLocation === "left" ? (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              maxLength={120}
              className="inline-block h-7 w-auto bg-transparent border-border text-sm text-foreground px-1.5 py-0.5 focus-visible:ring-1 focus-visible:ring-primary/50"
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
                <span className="text-muted-foreground font-medium break-words">{scene.play_title}</span>
                <Edit2 className="w-2.5 h-2.5 text-muted-foreground opacity-60 sm:opacity-0 sm:group-hover/pt:opacity-100 transition-opacity shrink-0" />
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
                className="inline-block h-7 w-auto bg-transparent border-border text-sm text-foreground px-1.5 py-0.5 focus-visible:ring-1 focus-visible:ring-primary/50"
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
                <span className="text-muted-foreground font-medium break-words">{scene.play_author}</span>
                <Edit2 className="w-2.5 h-2.5 text-muted-foreground opacity-60 sm:opacity-0 sm:group-hover/pa:opacity-100 transition-opacity shrink-0" />
              </button>
            </>
          ) : (
            <>
              {" by "}
              <span className="text-muted-foreground font-medium break-words">{scene.play_author}</span>
            </>
          )}
          {(scene.act || scene.scene_number) && (
            <span className="text-muted-foreground ml-1">
              {" \u00B7 "}
              {[scene.act, scene.scene_number].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
        {/* Description — icon-based controls */}
        {editingSceneField === "description" ? (
          renderEditableField("description", "Description", true, 300)
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Description <span className="normal-case text-muted-foreground">(optional)</span>
              </span>
              <button
                type="button"
                onClick={suggestSynopsis}
                disabled={generatingSynopsis}
                className="text-muted-foreground hover:text-primary transition-colors"
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
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Write manually"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            {scene.description && (
              <p
                className="text-sm font-semibold text-foreground break-words px-2 py-1.5 -mx-2 cursor-pointer hover:opacity-70 transition-opacity"
                onClick={() => startEditScene("description", scene.description ?? "")}
              >
                {scene.description}
              </p>
            )}
            {!scene.description && (
              <p
                className="text-sm text-muted-foreground italic px-2 py-1.5 -mx-2 cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => startEditScene("description", "")}
              >
                No description yet
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stats row — horizontal pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 bg-card/60 border border-border px-3.5 py-2">
          <FileText className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-sm font-medium text-foreground tabular-nums">{scene.line_count}</span>
          <span className="text-xs text-muted-foreground">line{scene.line_count !== 1 ? "s" : ""}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 bg-card/60 border border-border px-3.5 py-2 cursor-default">
              <Clock className="w-3.5 h-3.5 text-primary/70" />
              <span className="text-sm font-medium text-foreground tabular-nums">{formatDuration(computedDuration)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent><p>Estimated at ~150 words per minute</p></TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-1.5 bg-card/60 border border-border px-3.5 py-2">
          <Users className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-sm font-medium text-foreground tabular-nums">{scene.rehearsal_count}</span>
          <span className="text-xs text-muted-foreground">rehearsal{scene.rehearsal_count !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Characters */}
      <div className="rounded-xl bg-card/40 border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Theater className="w-4 h-4 text-primary" />
          <h3 className="text-xl font-semibold text-foreground">Characters</h3>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">Select who you&apos;ll play. Tap more than one to cover several parts.</p>
        <div className="space-y-2">
          {allSceneCharacters.map((charName) => {
            const isMe = isMyRole(charName);
            const voiceId = charVoices[charName] ?? null;
            const voiceData = AI_VOICES.find(v => v.id === voiceId);
            const dropKey = `voice-${charName}`;
            const isPreviewing = (isSpeakingAI || isLoadingAI) && previewingVoice === charName;
            return (
              <div
                key={charName}
                onClick={() => { if (!(isMe && myRoles.length === 1)) toggleRole(charName); }}
                role="button"
                tabIndex={0}
                aria-pressed={isMe}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  if (!(isMe && myRoles.length === 1)) toggleRole(charName);
                }}
                className={cn(
                  "rounded-lg border p-3 transition-all cursor-pointer",
                  isMe
                    ? "border-border bg-muted/60"
                    : "border-border/50 bg-transparent hover:border-border"
                )}
              >
                {/* Character name row */}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors",
                      isMe ? "border-primary bg-primary" : "border-border"
                    )}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {charName}
                  </span>
                  {isMe && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/20">You</span>
                  )}
                </div>
                {/* Voice selector — only for AI characters */}
                {!isMe && (
                  <div className="ml-5 space-y-1.5" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1" data-voice-dropdown>
                        <button
                          type="button"
                          onClick={() => setVoiceDropdownOpen(voiceDropdownOpen === dropKey ? null : dropKey)}
                          className="w-full flex items-center gap-2 rounded-md bg-muted border border-border text-sm text-foreground px-2.5 py-1.5 hover:border-border transition-colors text-left"
                        >
                          {voiceData ? (
                            <>
                              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", voiceData.color)}>
                                {voiceData.label[0]}
                              </div>
                              <span className="flex-1 truncate">{voiceData.label} — {voiceData.desc}</span>
                            </>
                          ) : (
                            <>
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0">?</div>
                              <span className="flex-1 text-muted-foreground">Select a voice...</span>
                            </>
                          )}
                          <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", voiceDropdownOpen === dropKey && "rotate-180")} />
                        </button>
                        {voiceDropdownOpen === dropKey && (
                          <div className="absolute z-20 mt-1 w-full rounded-md bg-muted border border-border shadow-lg py-1 max-h-[40vh] sm:max-h-48 overflow-y-auto">
                            {AI_VOICES.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => { handleVoiceChange(charName, v.id); setVoiceDropdownOpen(null); }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left",
                                  voiceId === v.id && "bg-muted/40"
                                )}
                              >
                                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", v.color)}>
                                  {v.label[0]}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium truncate">{v.label}</span>
                                  <span className="text-[11px] text-muted-foreground truncate">{v.desc}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Preview voice button */}
                      <button
                        type="button"
                        onClick={() => previewVoice(charName)}
                        className={cn(
                          "p-1.5 rounded-md border transition-colors",
                          isPreviewing
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "bg-muted border-border hover:border-border text-muted-foreground hover:text-foreground"
                        )}
                        title="Preview voice"
                      >
                        {isPreviewing ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Highlight toggle */}
      <div className="rounded-lg bg-card/50 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Highlighter className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-foreground">Highlight my lines</span>
          </div>
          <Switch
            checked={highlightMyLines}
            onCheckedChange={toggleHighlight}
          />
        </div>
        <AnimatePresence>
          {highlightMyLines && selectedCharacter && scene && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <p className="text-xs text-primary/80 text-center pb-2.5">
                {scene.lines.filter(l => isMyRole(l.character_name)).length} lines as {myRoles.join(" + ")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rehearsal Settings — collapsible (global prefs, collapsed by default) */}
      <div className="rounded-xl bg-card/40 border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setSettingsExpanded((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <h3 className="text-xl font-semibold text-foreground">Rehearsal settings</h3>
          {settingsExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        <AnimatePresence>
          {settingsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-4 space-y-4 border-t border-border">
                {/* Countdown */}
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-normal text-muted-foreground">Pre-scene countdown</Label>
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
                    <span className="text-xs tabular-nums text-muted-foreground w-6">{rehearsalSettings.countdownSeconds}s</span>
                  </div>
                )}

                {/* Auto-advance */}
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-normal text-muted-foreground">Continue after my line</Label>
                  <Switch
                    checked={rehearsalSettings.autoAdvanceOnFinish}
                    onCheckedChange={(v) => updateRehearsalSetting({ autoAdvanceOnFinish: v })}
                  />
                </div>

                {/* Breathing room */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal text-muted-foreground">Pause between lines</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={rehearsalSettings.pauseBetweenLinesSeconds}
                      onValueChange={(v) => updateRehearsalSetting({ pauseBetweenLinesSeconds: v })}
                      min={0} max={5} step={0.5}
                      className="flex-1"
                    />
                    <span className="text-xs tabular-nums text-muted-foreground w-8">{rehearsalSettings.pauseBetweenLinesSeconds}s</span>
                  </div>
                </div>

                {/* Auto-skip silence */}
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-normal text-muted-foreground">Auto-skip when silent</Label>
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
                    <span className="text-xs tabular-nums text-muted-foreground w-6">{rehearsalSettings.skipAfterSeconds}s</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scene Info — tone, emotions, relationship, setting grouped */}
      {(scene.tone || (scene.primary_emotions && scene.primary_emotions.length > 0) || scene.setting) && (
        <div className="rounded-xl bg-card/40 border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Scene Info</h3>
          </div>

          {/* Tone */}
          {scene.tone && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Tone</p>
              <Badge className="text-xs bg-primary/15 text-primary border-primary/30 capitalize hover:bg-primary/20">
                {scene.tone}
              </Badge>
            </div>
          )}

          {/* Emotions */}
          {scene.primary_emotions && scene.primary_emotions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Emotions</p>
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
        <div className="rounded-xl bg-card/40 border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setContextExpanded(!contextExpanded)}
            className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            <span className="text-sm font-medium text-muted-foreground">Context</span>
            {contextExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
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
                <div className="px-4 pb-4 space-y-3 border-t border-border">
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
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors mt-4 mx-auto disabled:opacity-50"
        >
          {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Reset to original
        </button>
      )}

      {/* Feedback / Report */}
      <button
        type="button"
        onClick={() => setShowFeedbackModal(true)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-muted-foreground transition-colors mt-2 mx-auto"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Feedback or report a bug
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Right panel content (parchment script)
  // ---------------------------------------------------------------------------

  const isMyLine = (charName: string) => isMyRole(charName);

  /* Screenplay geometry, in percentages rather than the literal inches a page
     of sides uses, so it holds at any width. The cue sits well right of the
     dialogue block, and the block is inset from both margins — that shape is
     what makes a page read as a script at a glance, before you have read a
     word of it.
     Below sm there is not enough measure for indents of this size: at 390px a
     34% cue indent leaves ~14 characters for the name. On a phone the cue drops
     to a small indent and the dialogue runs full width, which is what printed
     sides do on a narrow page too. */
  const CUE_INDENT = "pl-2 sm:pl-[28%]";
  /* 16%/10% put dialogue in a 74% column, and in Courier that is only about 55
     characters — narrow enough that a long speech turned into a tall grey
     ribbon you had to scroll past. Widened to 84%, roughly 63 characters, which
     is inside the comfortable measure and takes a visible bite out of the
     height of every long speech. */
  const DIALOGUE_INDENT = "pl-2 pr-1 sm:pl-[9%] sm:pr-[7%]";
  /** Action runs wider still, the way it does on a script page. */
  const ACTION_INDENT = "pl-2 pr-1 sm:pl-[5%] sm:pr-[5%]";

  /** Everyone you are not reading. These are the parts the app reads back. */
  const readerNames = allSceneCharacters.filter((c) => !isMyRole(c));
  const readerVoiceLabel =
    AI_VOICES.find((v) => v.id === (charVoices[readerNames[0]] ?? null))?.label ?? "a reader";

  /* "by Unknown" is not information, and it was printed on the title page of
     every uploaded scene — most of which are the actor's own sides and have no
     author to name. Hidden while reading, still there to fill in while editing. */
  const showAuthor =
    editMode ||
    (!!scene.play_author && scene.play_author.trim().toLowerCase() !== "unknown");

  const rightPanelContent = (
    /* The paper.
       Was bg-[#faf7f1] with text-paper-ink, which is why the page had to pin
       itself to dark: a hardcoded light card only reads as paper against an
       unlit room. Tokens now, so it holds either way round.
       The font was inline "Courier New" — the system fallback — while every
       other script surface in the app is Courier Prime via --font-typewriter.
       The two do not match, and this is the one screen where the type IS the
       design. */
    <div className="font-typewriter mx-auto max-w-[46rem] bg-paper text-paper-ink rounded-xl border border-black/5 px-5 sm:px-14 py-6 sm:py-10 overflow-hidden shadow-[0_24px_70px_-24px_rgba(203,75,0,0.20),0_10px_34px_-14px_rgba(0,0,0,0.28)] dark:shadow-[0_24px_70px_-24px_rgba(203,75,0,0.28),0_10px_34px_-14px_rgba(0,0,0,0.55)]">
      {/* Title inside parchment — editable */}
      <div className="text-center mb-6 pb-5 border-b border-paper-rule">
        {editingSceneField === "title" ? (
          <Input
            value={sceneEditValue}
            onChange={(e) => setSceneEditValue(e.target.value)}
            className="text-2xl font-bold uppercase tracking-wider text-center bg-transparent border-b-2 border-dashed border-paper-ink/40 border-x-0 border-t-0 rounded-none shadow-none focus-visible:ring-0 h-auto py-1"
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
            <h2 className="text-2xl font-bold uppercase tracking-wider break-words">{scene.title}</h2>
            <Edit2 className="w-3.5 h-3.5 text-paper-muted/50 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
          </button>
        )}
        {/* font-sans explicitly: the card sets font-typewriter for the script
            itself, and the h2 above escapes it via the global heading rule, so
            without this the source line is the only Courier text in the header
            and reads as a mistake. */}
        <div className="font-sans text-lg font-semibold text-paper-ink/85 mt-2 break-words">
          {editingSceneField === "play_title" && editingLocation === "parchment" ? (
            <Input
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              maxLength={120}
              className="inline-block h-7 w-auto bg-transparent border-b-2 border-dashed border-paper-ink/40 border-x-0 border-t-0 rounded-none shadow-none text-lg text-paper-ink/85 px-1.5 py-0.5 focus-visible:ring-0 text-center"
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
                <span className="text-paper-ink font-semibold break-words">{scene.play_title}</span>
              </button>
              {"\u201D"}
              <button
                type="button"
                onClick={() => startEditScene("play_title", scene.play_title, "parchment")}
                className="inline-flex ml-0.5 opacity-60 sm:opacity-0 sm:group-hover/ppt:opacity-100 transition-opacity align-middle"
              >
                <Edit2 className="w-3 h-3 text-paper-muted/70 shrink-0" />
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
                className="inline-block h-7 w-auto bg-transparent border-b-2 border-dashed border-paper-ink/40 border-x-0 border-t-0 rounded-none shadow-none text-lg text-paper-ink/85 px-1.5 py-0.5 focus-visible:ring-0 text-center"
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
          ) : (editingSceneField !== "play_title" || editingLocation !== "parchment") && showAuthor ? (
            <span className="group/ppa">
              {" by "}
              <button
                type="button"
                onClick={() => startEditScene("play_author", scene.play_author, "parchment")}
                className="hover:opacity-70 transition-opacity"
              >
                <span className="text-paper-ink font-semibold break-words">{scene.play_author}</span>
              </button>
              <button
                type="button"
                onClick={() => startEditScene("play_author", scene.play_author, "parchment")}
                className="inline-flex ml-0.5 opacity-60 sm:opacity-0 sm:group-hover/ppa:opacity-100 transition-opacity align-middle"
              >
                <Edit2 className="w-3 h-3 text-paper-muted/70 shrink-0" />
              </button>
            </span>
          ) : showAuthor ? (
            <>
              {" by "}
              <span className="text-paper-ink font-semibold break-words">{scene.play_author}</span>
            </>
          ) : null}
        </div>
        {(scene.act || scene.scene_number) && (
          <div className="text-sm text-paper-muted mt-1">
            {[scene.act, scene.scene_number].filter(Boolean).join(", ")}
          </div>
        )}
      </div>

      {/* Description on parchment — editable */}
      <AnimatePresence>
        {editingSceneField === "description" && editingLocation === "parchment" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center mb-4 mt-1 px-2"
          >
            <textarea
              value={sceneEditValue}
              onChange={(e) => setSceneEditValue(e.target.value)}
              className="w-full font-sans text-sm italic text-paper-muted bg-transparent border-b-2 border-dashed border-paper-rule outline-none text-center py-1 px-2 resize-none leading-relaxed focus:border-paper-ink/40"
              rows={2}
              maxLength={500}
              autoFocus
              placeholder="Add a scene description..."
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingSceneField(null);
              }}
              onBlur={() => {
                if (sceneEditValue !== (scene.description ?? "")) saveSceneField("description", sceneEditValue);
                else setEditingSceneField(null);
              }}
            />
          </motion.div>
        ) : scene.description ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="font-sans text-sm italic text-paper-muted text-center mb-4 mt-1 leading-relaxed px-2 max-w-prose mx-auto cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => startEditScene("description", scene.description ?? "", "parchment")}
          >
            {scene.description}
          </motion.p>
        ) : (
          <button
            type="button"
            onClick={() => startEditScene("description", "", "parchment")}
            className="text-xs italic text-paper-muted/70 hover:text-paper-muted transition-colors mb-4 mt-1 block mx-auto"
          >
            + Add description
          </button>
        )}
      </AnimatePresence>

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
                <div className={cn("relative group/linerow transition-all pl-4 pr-1 py-0.5", isDragging && draggingLineId !== lineId && "opacity-50")}>
                  {/* Your lines are marked in the margin instead of highlighted.
                      A yellow band behind the words is a marker pen on the words
                      themselves — it says "study this text", which is the
                      opposite of what a cue mark means. A rule down the margin is
                      how an actor marks their own lines on real sides, and it
                      leaves the type alone. */}
                  {isMine && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary/70"
                    />
                  )}
                  {/* Left-aligned, one measure.
                      This was `max-w-[600px] mx-auto items-center` inside a
                      760px paper inside a full-width shell: three nested
                      measures, and every cue and line centred. Centring is what
                      produced the ragged voids between speeches — a short line
                      and a long one share no edge, so the eye has nothing to
                      run down. Sides are left-aligned at fixed indents. */}
                  <div className={cn(
                    "w-full flex flex-col items-stretch rounded-lg px-2 py-1.5 border relative transition-colors",
                    draggingLineId === lineId
                      ? "border-primary/50 bg-primary/5 shadow-md ring-2 ring-primary/25"
                      : "border-transparent group-hover/linerow:bg-paper-ink/[0.035] group-hover/linerow:border-paper-rule"
                  )}>
                  {/* Drag handle — inside container, left edge */}
                  {editMode && !isEditing && (
                    <div
                      className="absolute left-0.5 sm:left-1 top-1/2 -translate-y-1/2 opacity-60 sm:opacity-0 sm:group-hover/linerow:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none select-none p-1 rounded hover:bg-paper-ink/12/60 text-paper-muted/70 hover:text-paper-muted"
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
                  {editMode && !isEditing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLine(line.id);
                      }}
                      disabled={deletingLineId === line.id}
                      className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 opacity-60 sm:opacity-0 sm:group-hover/linerow:opacity-100 transition-opacity p-1 rounded-full bg-paper border border-paper-rule shadow-sm hover:bg-red-50 hover:border-red-300 z-10"
                      title="Delete line"
                    >
                      {deletingLineId === line.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-paper-muted/70" />
                      ) : (
                        <Trash2 className="w-3 h-3 text-paper-muted/70 hover:text-red-500" />
                      )}
                    </button>
                  )}
                  {isEditing && values ? (
                    (() => {
                      const editVid = charVoices[line.character_name] ?? null;
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
                      className="space-y-2 w-full max-w-full mx-auto overflow-visible mt-1"
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
                            const instructions = buildActorInstructions(line.character_name, stageDir || undefined);
                            ttsLineIdRef.current = line.id;
                            setTtsProgress(0);
                            speakAI(values.text || line.text, editVid || "coral", instructions);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            isPlayingThisLine
                              ? "bg-primary/15 text-primary hover:bg-primary/25"
                              : "text-paper-muted hover:text-paper-ink/85 hover:bg-paper-ink/[0.07]"
                          )}
                          title={isPlayingThisLine ? "Stop playback" : "Listen to this line"}
                          onMouseEnter={() => {
                            if (isPlayingThisLine) return;
                            const stageDir = values.stage_direction || line.stage_direction || "";
                            const preloadInstructions = buildActorInstructions(line.character_name, stageDir || undefined);
                            preloadAI(values.text || line.text, editVid || "coral", preloadInstructions);
                          }}
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
                            {!isMine && (editVoice ? (
                              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", editVoice.color)}>
                                {editVoice.label[0]}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-paper-muted flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                {line.character_name[0]?.toUpperCase()}
                              </div>
                            ))}
                            <span className="text-base font-bold uppercase tracking-widest text-paper-ink/85">{line.character_name}</span>
                            <ChevronDown className="w-3 h-3 text-paper-muted/70" />
                          </button>
                          {/* Dropdown reuses same pattern as parchment dropdown */}
                          {voiceDropdownOpen === editDropdownKey && (() => {
                            const btn = document.querySelector(`[data-voice-btn-id="${editDropdownKey}"]`) as HTMLElement | null;
                            const rect = btn?.getBoundingClientRect();
                            return (
                              <div
                                className="fixed z-50 w-[calc(100vw-16px)] sm:w-64 rounded-xl bg-paper border border-paper-rule shadow-xl py-2 max-h-[50vh] sm:max-h-[400px] overflow-y-auto"
                                style={rect ? { top: Math.min(rect.bottom + 8, window.innerHeight - 300), left: Math.max(8, Math.min(rect.left + rect.width / 2 - 128, window.innerWidth - 264)) } : {}}
                              >
                                {/* Character name */}
                                <div className="px-3 pb-2 border-b border-paper-rule/60">
                                  <label className="text-[10px] uppercase tracking-wider text-paper-muted/70 mb-1.5 block">Character name</label>
                                  <input
                                    key={line.character_name}
                                    type="text"
                                    defaultValue={line.character_name}
                                    maxLength={30}
                                    className="w-full bg-paper-ink/[0.04] border border-paper-rule rounded-md px-2.5 py-1.5 text-sm text-paper-ink focus:outline-none focus:border-paper-ink/40"
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
                                <div className="px-3 py-2 border-b border-paper-rule/60">
                                  <label className="text-[10px] uppercase tracking-wider text-paper-muted/70 mb-1.5 block">Role</label>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); if (!isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: line.character_name }); } setSelectedCharacter(line.character_name); }}
                                      className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", isMine ? "bg-primary text-white" : "bg-paper-ink/[0.07] text-paper-muted hover:bg-paper-ink/12")}
                                    >You</button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const otherChar = line.character_name === scene.character_1_name ? scene.character_2_name : scene.character_1_name;
                                        if (isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: otherChar }); }
                                        setSelectedCharacter(otherChar);
                                      }}
                                      className={cn("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors", !isMine ? "bg-blue-600 text-white" : "bg-paper-ink/[0.07] text-paper-muted hover:bg-paper-ink/12")}
                                    >Scene partner</button>
                                  </div>
                                </div>
                                {/* Voice selection (only for AI partner) */}
                                {!isMine && (
                                  <>
                                    <div className="px-3 pt-2 pb-1">
                                      <label className="text-[10px] uppercase tracking-wider text-paper-muted/70 block">Voice</label>
                                    </div>
                                    {AI_VOICES.map((v) => (
                                      <button
                                        key={v.id}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleVoiceChange(line.character_name, v.id); setVoiceDropdownOpen(null); }}
                                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-paper-ink/[0.04] transition-colors text-left", editVid === v.id && "bg-paper-ink/[0.07]")}
                                      >
                                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", v.color)}>{v.label[0]}</div>
                                        <span className="text-paper-ink/85 text-sm">{v.label}</span>
                                        <span className="text-paper-muted/70 text-xs">— {v.desc}</span>
                                        {editVid === v.id && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {/* Screenplay action lands here now, and action runs long
                            ("We make our way through the unexpectedly LARGE CROWD
                            here for the FAIRNESS HEARING…"). A one-line input
                            clipped it at 120 characters on the first edit, and set
                            in the same weight as dialogue it read as something the
                            character says out loud. It is the room, not the line:
                            lighter, smaller, italic, and set off by a rule. */}
                        <textarea
                          ref={(el) => {
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = `${el.scrollHeight}px`;
                            }
                          }}
                          rows={1}
                          value={values.stage_direction}
                          maxLength={600}
                          placeholder="Stage directions"
                          onChange={(e) => {
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, stage_direction: e.target.value },
                            }));
                          }}
                          className="w-full sm:max-w-[34rem] resize-none overflow-hidden border-l-2 border-paper-rule/60 bg-transparent px-3 py-0.5 text-center text-[13px] font-normal italic leading-relaxed text-paper-muted/80 outline-none placeholder:not-italic placeholder:text-paper-muted/50 focus:border-paper-ink/30"
                          disabled={saving !== null}
                          onBlur={handleLineBlur}
                          onKeyDown={handleLineKeyDown}
                        />
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
                              className="text-[17px] font-semibold leading-relaxed w-full py-1 text-center break-words cursor-pointer"
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
                                          ? "text-primary font-semibold"
                                          : isCurrent
                                          ? "text-primary font-semibold"
                                          : "text-paper-muted/50"
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
                                className="text-[17px] font-semibold leading-relaxed w-full bg-transparent border-b-2 border-dashed border-paper-rule outline-none py-1 resize-none text-paper-ink break-words text-center"
                                disabled={saving !== null}
                                onBlur={handleLineBlur}
                                onKeyDown={handleLineKeyDown}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <p className="text-[10px] text-paper-muted/70 text-center">
                        <span className="hidden sm:inline">
                          <kbd className="px-1 py-0.5 rounded bg-paper-ink/[0.07] text-paper-muted font-sans">&#8984;Enter</kbd> save &middot; <kbd className="px-1 py-0.5 rounded bg-paper-ink/[0.07] text-paper-muted font-sans">Esc</kbd> cancel
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
                      role={editMode ? "button" : undefined}
                      tabIndex={editMode ? 0 : undefined}
                      onClick={() => editMode && !isDragging && startEditLine(line)}
                      onKeyDown={(e) => { if (editMode && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); !isDragging && startEditLine(line); } }}
                      className={cn(
                        /* items-stretch, not items-center: the children carry
                           their own screenplay indents now, and centring them
                           inside this box fought those indents. */
                        "group/line-btn flex flex-col items-stretch w-full max-w-full overflow-hidden rounded-md py-1.5 transition-colors",
                        editMode ? "cursor-pointer" : "cursor-default"
                      )}
                    >
                      {/* Listen / waveform — above character name (partner lines only) */}
                      {!isMine && (() => {
                        const lineVid = charVoices[line.character_name] ?? null;
                        const isPlayingThisLine = (isSpeakingAI || isLoadingAI) && ttsLineIdRef.current === line.id;
                        return (
                          /* Height only while it is actually playing. This row
                             was a fixed h-7 whether or not anything was in it,
                             so every partner speech carried 28px of reserved
                             air above its cue — the second half of the void
                             between speeches. The idle "Listen" button sits on
                             the cue line itself now, next to the name it
                             belongs to. */
                          <div className={cn(
                            "flex items-center justify-start w-full overflow-hidden transition-[height] duration-200",
                            isPlayingThisLine ? "h-7 mb-0.5" : "h-0",
                            CUE_INDENT,
                          )}>
                            {isPlayingThisLine ? (
                              <motion.div
                                key="wave"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.18 }}
                                className="w-full max-w-[200px]"
                              >
                                <TTSWaveform
                                  audioElement={aiAudioRef.current}
                                  isLoading={isLoadingAI}
                                  isSpeaking={isSpeakingAI}
                                  onProgress={setTtsProgress}
                                  className="mx-auto"
                                />
                              </motion.div>
                            ) : null}
                          </div>
                        );
                      })()}
                      {/* Action. It used to sit on the cue line beside the
                          character name, where it had nowhere to go: these come
                          out of real sides and run 200–460 characters, so it was
                          either clipped to a stub you cannot read or it shoved
                          the name around. Action is not a label on the name, it
                          is the paragraph before the speech, so it is set the way
                          a script sets it: full measure, its own block, above the
                          cue. */}
                      {line.stage_direction?.trim() && !isDragging && (
                        <p className={cn(
                          "text-[13px] sm:text-sm italic leading-relaxed text-paper-muted normal-case break-words whitespace-pre-wrap mb-1.5",
                          ACTION_INDENT,
                        )}>
                          {line.stage_direction.trim()}
                        </p>
                      )}
                      {/* Character name + avatar */}
                      {(() => {
                        const vid = charVoices[line.character_name] ?? null;
                        const voice = AI_VOICES.find(v => v.id === vid);
                        const dropdownKey = `parchment-${lineId}`;
                        return (
                      <div className={cn("flex flex-wrap items-center justify-start gap-x-2 gap-y-0.5 mb-0.5", CUE_INDENT)}>
                        <div className="relative" data-voice-dropdown onClick={(e) => e.stopPropagation()}>
                          <button
                            ref={(el) => { if (el) el.dataset.voiceBtnId = dropdownKey; }}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setVoiceDropdownOpen(voiceDropdownOpen === dropdownKey ? null : dropdownKey); }}
                            className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                          >
                            {/* Avatar — only for AI character */}
                            {!isMine && (voice ? (
                              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", voice.color)}>
                                {voice.label[0]}
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-paper-muted flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                {line.character_name[0]?.toUpperCase()}
                              </div>
                            ))}
                            <span className="text-sm sm:text-base font-bold uppercase tracking-[0.18em] text-paper-ink">
                              {line.character_name}
                            </span>
                            {isMine && <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-primary">(you)</span>}
                          </button>
                          {/* Combined character settings dropdown */}
                          {voiceDropdownOpen === dropdownKey && (() => {
                            const btn = document.querySelector(`[data-voice-btn-id="${dropdownKey}"]`) as HTMLElement | null;
                            const rect = btn?.getBoundingClientRect();
                            return (
                              <div
                                className="fixed z-50 w-[calc(100vw-16px)] sm:w-64 rounded-xl bg-paper border border-paper-rule shadow-xl py-2 max-h-[50vh] sm:max-h-[400px] overflow-y-auto"
                                style={rect ? { top: Math.min(rect.bottom + 8, window.innerHeight - 300), left: Math.max(8, Math.min(rect.left + rect.width / 2 - 128, window.innerWidth - 264)) } : {}}
                              >
                                {/* Character name */}
                                <div className="px-3 pb-2 border-b border-paper-rule/60">
                                  <label className="text-[10px] uppercase tracking-wider text-paper-muted/70 mb-1.5 block">Character name</label>
                                  <input
                                    key={line.character_name}
                                    type="text"
                                    defaultValue={line.character_name}
                                    maxLength={30}
                                    className="w-full bg-paper-ink/[0.04] border border-paper-rule rounded-md px-2.5 py-1.5 text-sm text-paper-ink focus:outline-none focus:border-paper-ink/40"
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
                                <div className="px-3 py-2 border-b border-paper-rule/60">
                                  <label className="text-[10px] uppercase tracking-wider text-paper-muted/70 mb-1.5 block">Role</label>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); if (!isMine) { pushUndo({ type: "selected_character", old: selectedCharacter, cur: line.character_name }); } setSelectedCharacter(line.character_name); }}
                                      className={cn(
                                        "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                                        isMine ? "bg-primary text-white" : "bg-paper-ink/[0.07] text-paper-muted hover:bg-paper-ink/12"
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
                                        !isMine ? "bg-blue-600 text-white" : "bg-paper-ink/[0.07] text-paper-muted hover:bg-paper-ink/12"
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
                                      <label className="text-[10px] uppercase tracking-wider text-paper-muted/70 block">Voice</label>
                                    </div>
                                    {AI_VOICES.map((v) => (
                                      <button
                                        key={v.id}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleVoiceChange(line.character_name, v.id); setVoiceDropdownOpen(null); }}
                                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-paper-ink/[0.04] transition-colors text-left", vid === v.id && "bg-paper-ink/[0.07]")}
                                      >
                                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", v.color)}>{v.label[0]}</div>
                                        <span className="text-paper-ink/85 text-sm">{v.label}</span>
                                        <span className="text-paper-muted/70 text-xs">— {v.desc}</span>
                                        {vid === v.id && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {/* Hear it. On the cue line, beside the name of the
                            character it belongs to, rather than in a reserved
                            strip above it. Shown on hover on desktop; always on
                            touch, where there is no hover to reveal it. */}
                        {!isMine && !isDragging && !((isSpeakingAI || isLoadingAI) && ttsLineIdRef.current === line.id) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelAI();
                              const v = charVoices[line.character_name] ?? null;
                              ttsLineIdRef.current = line.id;
                              setTtsProgress(0);
                              speakAI(line.text, v || "coral", buildActorInstructions(line.character_name, line.stage_direction || undefined));
                            }}
                            onMouseEnter={() => {
                              const v = charVoices[line.character_name] ?? null;
                              preloadAI(line.text, v || "coral", buildActorInstructions(line.character_name, line.stage_direction || undefined));
                            }}
                            aria-label={`Hear ${line.character_name}`}
                            className="shrink-0 inline-flex items-center justify-center rounded-full p-1 text-paper-muted/70 transition-opacity hover:text-paper-ink sm:opacity-0 sm:group-hover/linerow:opacity-100"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {editMode && !isDragging && (
                          <Edit2 className="w-3 h-3 text-paper-muted/70 opacity-60 sm:opacity-0 sm:group-hover/line-btn:opacity-100 transition-opacity shrink-0" />
                        )}
                      </div>
                        );
                      })()}
                      {/* Line text */}
                      <motion.p
                        layout="position"
                        className={cn(
                          /* Left-aligned in an inset block, which is the shape
                             of dialogue on a page of sides. It was centred, and
                             centring is what left those ragged voids between
                             speeches: a short line and a long one share no edge,
                             so the eye has nothing to run down. */
                          "text-[16px] sm:text-[17px] font-medium leading-[1.75] text-paper-ink break-words whitespace-pre-wrap w-full transition-colors duration-300",
                          DIALOGUE_INDENT,
                        )}
                        style={{ overflowWrap: "anywhere" }}
                        animate={highlightMyLines && isMine ? { scale: [1, 1.01, 1] } : { scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {/* The band behind your own lines is gone. A highlighter
                            stripe running under every line of your longest
                            speech broke the block into ragged strips and said
                            "study this text", when the thing being marked is
                            "this one is yours" — which the margin rule now says
                            without touching the type. */}
                        <span>{renderTextWithStageDirections(line.text)}</span>
                      </motion.p>
                    </div>
                    </div>
                  )}
                  {/* Bottom toolbar — always visible on mobile, hover on desktop */}
                  {!isEditing && !isDragging && (
                    /* Absolute from sm up. opacity-0 hides it but still reserves
                       its height, so every speech carried an invisible toolbar's
                       worth of air beneath it — measured ~40px, which is most of
                       the void that used to sit between one line and the next.
                       On phones there is no hover, so it stays in the flow. */
                    <div className="flex items-center gap-3 mt-1 pt-1 opacity-100 sm:absolute sm:right-1 sm:top-1 sm:mt-0 sm:pt-0 sm:opacity-0 sm:group-hover/linerow:opacity-100 transition-opacity">
                      {editMode && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => openAddLineModal(line.id)}
                              className="p-1.5 sm:p-1 rounded hover:bg-paper-ink/12/60 transition-colors text-paper-muted/70 sm:text-paper-muted hover:text-paper-ink/85"
                            >
                              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent><p>Add a new line</p></TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setRehearsalStartLineIndex(lineIdx);
                              setShowRehearsalModal(true);
                            }}
                            className="p-1.5 sm:p-1 rounded hover:bg-paper-ink/12/60 transition-colors text-paper-muted/70 sm:text-paper-muted hover:text-paper-ink/85"
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
      <div className="mt-4 pt-4 border-t border-paper-rule text-center">
        <p className="text-sm text-paper-muted">
          {scene.line_count} lines
        </p>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Read-mode setup bar — pick your character + reader voice, then rehearse
  // ---------------------------------------------------------------------------

  /**
   * The casting summary, and the panel behind it.
   *
   * This was always open: a bar above the script carrying three jobs at once —
   * pick your parts, count them, choose the reader's voice — in a row narrow
   * enough that "Courthouse Clerk" truncated to "Courthouse Cl…". You had to
   * deal with a form before you could read a page.
   *
   * The scene casts you on arrival now (see the auto-cast effect), so the bar
   * collapses to one sentence stating what it did, and opens on a tap if that
   * is wrong. Nothing to do to start reading.
   */
  const castSummary = (
    <button
      type="button"
      onClick={() => setCastOpen((v) => !v)}
      aria-expanded={castOpen}
      className="mx-auto mb-3 flex w-full max-w-[46rem] items-center justify-center gap-x-2 gap-y-1 flex-wrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <span>
        You&apos;re reading{" "}
        <span className="font-medium text-primary">{myRoles.join(" and ") || "nobody yet"}</span>
      </span>
      {readerNames.length > 0 && (
        <>
          <span aria-hidden className="opacity-40">·</span>
          <span className="min-w-0">
            {readerNames.length === 1 ? readerNames[0] : `${readerNames.length} parts`} read by{" "}
            <span className="font-medium text-foreground">{readerVoiceLabel}</span>
          </span>
        </>
      )}
      <ChevronDown
        className={cn("w-3.5 h-3.5 shrink-0 transition-transform", castOpen && "rotate-180")}
      />
    </button>
  );

  const castPanel = (
    <div className="mx-auto w-full max-w-[46rem] mb-5 border border-border bg-card/50 backdrop-blur-sm px-3 sm:px-4 py-3">
      {/* One row per character, every row on the same grid, so names, toggles and
          voices sit on shared rails. The two-column version put "you're playing"
          on the left and "reader" on the right, which spread six characters over
          half a screen, truncated their names and left both edges ragged. */}
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Cast</span>
        <span className="text-[11px] text-muted-foreground">
          {myRoles.length} yours · {Math.max(0, allSceneCharacters.length - myRoles.length)} read aloud
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {allSceneCharacters.map((charName) => {
          const isMe = isMyRole(charName);
          const voiceId = charVoices[charName] ?? null;
          const voiceData = AI_VOICES.find((v) => v.id === voiceId);
          const dropKey = `setup-voice-${charName}`;
          const isPreviewing = (isSpeakingAI || isLoadingAI) && previewingVoice === charName;
          return (
            <div
              key={charName}
              data-voice-dropdown
              className="grid grid-cols-[minmax(0,1fr)_4rem] sm:grid-cols-[minmax(0,1fr)_4rem_8.5rem_1.75rem] items-center gap-x-2 gap-y-1 py-1.5"
            >
              <span
                title={charName}
                className={cn(
                  "truncate text-sm",
                  isMe ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {charName}
              </span>

              {/* Tap to take a part, tap again to give it back — an actor can read
                  several. Dropping the last one would leave nothing to rehearse,
                  so that tap is ignored. */}
              <button
                type="button"
                onClick={() => {
                  if (isMe && myRoles.length === 1) return;
                  toggleRole(charName);
                }}
                aria-pressed={isMe}
                title={
                  isMe
                    ? myRoles.length === 1
                      ? `You're reading ${charName}`
                      : `Stop reading ${charName}`
                    : `Also read ${charName}`
                }
                className={cn(
                  "h-7 rounded-md px-2 text-xs font-medium transition-colors",
                  isMe
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {isMe ? "You" : "Read"}
              </button>

              {/* Left empty for your own parts rather than collapsed, so every row
                  keeps the same rails. */}
              <div className="relative col-span-2 sm:col-span-1">
                {!isMe && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setVoiceDropdownOpen(voiceDropdownOpen === dropKey ? null : dropKey)
                      }
                      className="flex h-7 w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-foreground transition-colors hover:border-muted-foreground/50"
                    >
                      {voiceData ? (
                        <>
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white",
                              voiceData.color,
                            )}
                          >
                            {voiceData.label[0]}
                          </div>
                          <span className="truncate">{voiceData.label}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Pick voice</span>
                      )}
                      <ChevronDown
                        className={cn(
                          "ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                          voiceDropdownOpen === dropKey && "rotate-180",
                        )}
                      />
                    </button>
                    {voiceDropdownOpen === dropKey && (
                      <div className="absolute right-0 top-full z-30 mt-1 max-h-[45vh] w-56 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg">
                        {AI_VOICES.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              handleVoiceChange(charName, v.id);
                              setVoiceDropdownOpen(null);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                              voiceId === v.id && "bg-accent/60",
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                                v.color,
                              )}
                            >
                              {v.label[0]}
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{v.label}</span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {v.desc}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="hidden justify-self-end sm:block">
                {/* Plays a sample. It is not a mute/enable switch — the speaker
                    icon read as one, so this says what it does. */}
                {!isMe && (
                  <button
                    type="button"
                    onClick={() => previewVoice(charName)}
                    className={cn(
                      "rounded-md border p-1.5 transition-colors",
                      isPreviewing
                        ? "border-primary/40 bg-primary/20 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    title={isPreviewing ? `Stop ${charName}'s sample` : `Hear ${charName}'s voice`}
                    aria-label={
                      isPreviewing ? `Stop ${charName}'s sample` : `Hear ${charName}'s voice`
                    }
                  >
                    {isPreviewing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {roleMergeSuggestions.map(([keep, drop]) => (
        <div
          key={`${keep}|${drop}`}
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground"
        >
          <span>
            <span className="font-medium text-foreground">{drop}</span>
            {" ("}{sceneLineCounts[drop] ?? 0} line{(sceneLineCounts[drop] ?? 0) === 1 ? "" : "s"}{") and "}
            <span className="font-medium text-foreground">{keep}</span>
            {" ("}{sceneLineCounts[keep] ?? 0} line{(sceneLineCounts[keep] ?? 0) === 1 ? "" : "s"}{") look like the same character."}
          </span>
          <button
            type="button"
            onClick={() => renameCharacter(drop, keep)}
            className="text-primary hover:underline font-medium"
          >
            Merge into {keep}
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setDismissedMerges((prev) => [...prev, `${keep}|${drop}`])}
            className="hover:text-foreground"
          >
            They&apos;re different
          </button>
        </div>
      ))}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    /* The `dark` class used to be pinned here, which is the whole of the "light
       theme is broken" report: the page forced its own theme and the toggle was
       never in play. It was pinned because the script is paper — light card,
       dark ink — and paper only looks like paper against an unlit room, so the
       room was nailed shut. The paper is a token pair now (--paper / --paper-ink,
       see globals.css) that holds in both themes, and the room is free to be
       whichever one you picked. */
    <div className="min-h-screen bg-muted/70 dark:bg-background text-foreground flex flex-col">
      {/* Top bar — warm ghost-light chrome */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative border-b border-border shrink-0 bg-background/80 backdrop-blur-sm">
        {/* faint orange stage-glow along the top edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-px h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--glow, #CB4B00) 50%, transparent)", opacity: 0.5 }}
        />

        {/* The bar spans the window, its contents don't. Pinned to the viewport
            edges, Back and Edit ended up a screen apart from the scene they act
            on. They sit on the same rails as the cast and the page below. */}
        <div className="mx-auto flex w-full max-w-[46rem] items-center justify-between gap-2 px-4 py-3 sm:px-6">
        {/* Left: Back */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { flushPendingEdits(); cancelAIRef.current?.(); router.push(`/practice?script=${scriptId}`); }}
          className="text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {/* Center: scene identity */}
        <div className="min-w-0 flex-1 text-center px-1">
          <h1 className="font-semibold tracking-tight leading-tight text-sm sm:text-base text-foreground truncate">
            {scene.title}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
            {scene.play_title}
          </p>
        </div>

        {/* Right: edit tools (edit mode only) + Edit/Done toggle */}
        <div className="flex items-center gap-1 shrink-0">
          {editMode && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!canUndo || applyingHistory}
                    className="text-muted-foreground hover:text-foreground h-8 w-8 p-0 disabled:opacity-30"
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
                    className="text-muted-foreground hover:text-foreground h-8 w-8 p-0 disabled:opacity-30"
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
                    className="text-muted-foreground hover:text-foreground h-8 w-8 p-0 disabled:opacity-30"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>Reset to original</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={downloadAsPdf}
                    className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>Download PDF</p></TooltipContent>
              </Tooltip>
              <div className="w-px h-5 bg-border mx-1" />
            </>
          )}
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => { if (editMode) flushPendingEdits(); setEditMode((v) => !v); }}
            className="gap-1.5 h-8"
          >
            {editMode ? <><Check className="w-4 h-4" /> Done</> : <><Edit2 className="w-3.5 h-3.5" /> Edit</>}
          </Button>
        </div>
        </div>
      </motion.header>

      {/* Mobile tabs — only when editing (read mode is script-only) */}
      {editMode && (
        <div className="lg:hidden flex border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("details")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium text-center transition-colors",
              mobileTab === "details"
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
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
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Script
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — metadata (edit mode only) */}
        {editMode && (
          <motion.aside
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className={cn(
              "w-full lg:w-[480px] xl:w-[540px] lg:shrink-0 lg:border-r lg:border-border overflow-y-auto p-4 sm:p-6",
              mobileTab === "details" ? "block lg:block" : "hidden lg:block"
            )}
          >
            {leftPanelContent}
          </motion.aside>
        )}

        {/* Right panel — script (the reading canvas) */}
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            "flex-1 overflow-y-auto p-4 sm:p-6 pb-28",
            editMode && mobileTab !== "script" ? "hidden lg:block" : "block"
          )}
        >
          {!editMode && (
            <>
              {castSummary}
              <AnimatePresence initial={false}>
                {castOpen && (
                  <motion.div
                    key="cast-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    {castPanel}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          {rightPanelContent}
        </motion.main>
      </div>

      {/* Full-screen overlay when starting rehearsal — whimsical loading */}
      <AnimatePresence>
        {startingRehearsal && (
          <RehearsalLoadingOverlay />
        )}
      </AnimatePresence>

      {/* Floating launch button — the one clear action */}
      <div className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-50">
        <Button
          size="lg"
          disabled={startingRehearsal}
          onClick={() => {
            if (editingLineId !== null) {
              toast("Please finish editing the current line first", { duration: 2000 });
              return;
            }
            if (!selectedCharacter) {
              setShowRehearsalModal(true);
              return;
            }
            if (!micGranted) {
              setShowMicModal(true);
              return;
            }
            // Character selected + mic granted → start immediately, no modal
            handleStartRehearsal();
          }}
          className="gap-2 shadow-xl shadow-primary/25 rounded-full px-6 sm:px-7 h-12 sm:h-14 text-base"
        >
          {startingRehearsal ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Play className="w-5 h-5" />
          )}
          <span>{startingRehearsal ? 'Starting…' : 'Rehearse'}</span>
        </Button>
      </div>

      <SceneSettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />

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
            const vid = charVoices[partner] ?? null;
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
                      <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {selectedCharacter?.[0]?.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate flex-1">{myRoles.join(" + ")}</span>
                      <span className="text-[10px] text-primary font-medium shrink-0">(You)</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", voice?.color ?? "bg-neutral-400")}>
                        {voice ? voice.label[0] : partner?.[0]?.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate flex-1">{partner}</span>
                      {voice && <span className="text-[10px] text-muted-foreground shrink-0">{voice.label} voice</span>}
                    </div>
                  </div>
                  {resumable && rehearsalStartLineIndex === null && (
                    <button
                      type="button"
                      onClick={() => setRehearsalStartLineIndex(resumable.current_line_index)}
                      className="w-full border border-border bg-muted/30 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted/50"
                    >
                      <span className="font-medium">Resume where you left off</span>
                      <span className="text-muted-foreground"> · line {resumable.current_line_index + 1} of {scene.lines.length}</span>
                    </button>
                  )}
                  {rehearsalStartLineIndex !== null && (
                    <p className="text-xs text-muted-foreground text-center">
                      Starting from line {rehearsalStartLineIndex + 1} of {scene.lines.length}
                      {resumable && rehearsalStartLineIndex === resumable.current_line_index && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => setRehearsalStartLineIndex(null)}
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            start over
                          </button>
                        </>
                      )}
                    </p>
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
                      if (!micGranted) {
                        setShowRehearsalModal(false);
                        setShowMicModal(true);
                        return;
                      }
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
                    {startingRehearsal ? 'Starting...' : 'Start'}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Microphone permission modal */}
      <Dialog open={showMicModal} onOpenChange={setShowMicModal}>
        <DialogContent className="max-w-xs sm:max-w-sm p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Microphone Required</DialogTitle>
              <DialogDescription className="sr-only">Grant microphone access to start rehearsal</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                {micStatus === "unavailable"
                  ? "Your device doesn't have a microphone available. Rehearsal requires a mic to detect when you've finished speaking."
                  : micStatus === "denied"
                  ? "Microphone access was denied. Please allow it in your browser settings, then try again."
                  : "Rehearsal needs your microphone to listen for your lines. Allow access to get started."}
              </p>
            </div>
          </div>
          <div className="flex gap-2 px-5 pb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMicModal(false)}
              className="flex-1"
            >
              Not Now
            </Button>
            {micStatus !== "unavailable" && (
              <Button
                size="sm"
                onClick={async () => {
                  await requestMic();
                  // After requesting, if granted, close this modal and re-open rehearsal
                  // The hook updates micGranted reactively
                }}
                className="flex-1 gap-1.5"
              >
                <Mic className="w-4 h-4" />
                Allow Microphone
              </Button>
            )}
          </div>
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
                    const isUser = isMyRole(charName);
                    const isSelected = newLineCharacter === charName;
                    const vid = charVoices[charName] ?? null;
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
                          <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                            {charName[0]?.toUpperCase()}
                          </span>
                        ) : voice ? (
                          <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0", voice.color)}>
                            {voice.label[0]}
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-muted-foreground flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                            {charName[0]?.toUpperCase()}
                          </span>
                        )}
                        <span className="flex flex-col min-w-0">
                          <span className="truncate text-xs font-medium">{charName}</span>
                          {isUser && <span className="text-[10px] leading-tight text-primary">(You)</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Voice selector for scene partner lines — custom dropdown */}
            {scene && newLineCharacter && !isMyRole(newLineCharacter) && (() => {
              const currentVoice = charVoices[newLineCharacter] ?? null;
              const selectedVoice = AI_VOICES.find(v => v.id === currentVoice);
              return (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Voice</Label>
                  <div className="relative" data-voice-dropdown>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setVoiceDropdownOpen(voiceDropdownOpen === "addline" ? null : "addline"); }}
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
                      <div className="absolute z-[10030] mt-1 w-full rounded-md bg-popover border border-border shadow-lg py-1 max-h-40 overflow-y-auto">
                        {AI_VOICES.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => { handleVoiceChange(newLineCharacter, v.id); setVoiceDropdownOpen(null); }}
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
