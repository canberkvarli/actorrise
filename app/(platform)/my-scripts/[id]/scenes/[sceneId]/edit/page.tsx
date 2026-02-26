"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Play, Edit2, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { getCharacterColors } from "@/lib/characterColors";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";

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
  setting: string | null;
  context_before: string | null;
  context_after: string | null;
  line_count: number;
  lines: SceneLine[];
}

type SceneStringKey = "title" | "description" | "character_1_name" | "character_2_name" | "setting" | "context_before" | "context_after";

const SCENE_FIELDS: { key: SceneStringKey; label: string; multiline?: boolean }[] = [
  { key: "title", label: "Scene title" },
  { key: "description", label: "Description", multiline: true },
  { key: "character_1_name", label: "Character 1" },
  { key: "character_2_name", label: "Character 2" },
  { key: "setting", label: "Setting" },
  { key: "context_before", label: "Context before", multiline: true },
  { key: "context_after", label: "Context after", multiline: true },
];

export default function SceneEditPage() {
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const params = useParams();
  const scriptId = Number(params.id);
  const sceneId = Number(params.sceneId);

  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingSceneField, setEditingSceneField] = useState<string | null>(null);
  const [sceneEditValue, setSceneEditValue] = useState("");
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [lineEditValues, setLineEditValues] = useState<Record<number, { character_name: string; text: string; stage_direction: string }>>({});

  useEffect(() => {
    if (!sceneId) return;
    (async () => {
      try {
        const { data } = await api.get<SceneDetail>(`/api/scenes/${sceneId}`);
        setScene(data);
      } catch {
        toast.error("Failed to load scene");
        router.push(`/my-scripts/${scriptId}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [sceneId, scriptId, router]);

  const saveSceneField = async (field: SceneStringKey, value: string | null) => {
    if (!scene) return;
    setSaving(`scene-${field}`);
    try {
      await api.patch(`/api/scripts/${scriptId}/scenes/${sceneId}`, { [field]: value ?? undefined });
      setScene({ ...scene, [field]: value ?? undefined });
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
      setScene({
        ...scene,
        lines: scene.lines.map((l) =>
          l.id === line.id
            ? {
                ...l,
                character_name: values.character_name,
                text: values.text,
                stage_direction: values.stage_direction || null,
                word_count: values.text.trim().split(/\s+/).filter(Boolean).length,
              }
            : l
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

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = getCharacterColors(isDark);

  if (loading || !scene) {
    return (
      <div className="min-h-screen bg-neutral-950 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <Skeleton className="h-10 w-48 mb-6 bg-neutral-800" />
          <Skeleton className="h-[600px] w-full bg-[#f4ecd8]/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Navigation buttons - outside parchment */}
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/my-scripts/${scriptId}`)}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border-neutral-700"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to script
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => router.push(`/scenes/${sceneId}`)}
            className="gap-1"
          >
            <Play className="w-4 h-4" />
            Rehearse
          </Button>
        </div>

        {/* Parchment container */}
        <div
          className="bg-[#f4ecd8] text-neutral-900 rounded-lg shadow-2xl border border-amber-200/50 px-8 sm:px-12 py-8 sm:py-10"
          style={{ fontFamily: 'Courier, "Courier New", monospace' }}
        >
          {/* Scene metadata - Cover page style */}
          <div className="text-center border-b border-amber-900/20 pb-8 mb-8">
            {/* Scene title */}
            <div className="mb-4">
              <AnimatePresence mode="wait">
                {editingSceneField === "title" ? (
                  <motion.div
                    key="edit-title"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-2 items-center"
                  >
                    <Input
                      value={sceneEditValue}
                      onChange={(e) => setSceneEditValue(e.target.value)}
                      className="max-w-md text-center text-xl font-bold uppercase bg-white/40 border-amber-900/30"
                      autoFocus
                      disabled={saving !== null}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => saveSceneField("title", sceneEditValue)}
                        className="bg-amber-700 hover:bg-amber-800"
                      >
                        <Check className="w-3 h-3 mr-1.5" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingSceneField(null)}
                        className="hover:bg-amber-900/10"
                      >
                        <X className="w-3 h-3 mr-1.5" />
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="display-title"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => startEditScene("title", scene.title)}
                    className="group flex items-center justify-center gap-2 w-full"
                  >
                    <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide">
                      {scene.title}
                    </h1>
                    <Edit2 className="w-4 h-4 text-amber-900/30 group-hover:text-amber-900/60 transition-colors" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Play info */}
            <p className="text-sm sm:text-base italic mb-6">
              From {scene.play_title} by {scene.play_author}
            </p>

            {/* Character badges */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <Badge className={cn("text-xs", colors.char1.bg, colors.char1.text)}>
                {scene.character_1_name}
              </Badge>
              <span className="text-xs text-amber-900/50">and</span>
              <Badge className={cn("text-xs", colors.char2.bg, colors.char2.text)}>
                {scene.character_2_name}
              </Badge>
            </div>

            {/* Setting, context, description */}
            {["setting", "context_before", "description", "context_after"].map((fieldKey) => {
              const key = fieldKey as SceneStringKey;
              const value = scene[key];
              const str = typeof value === "string" ? value : value ?? "";
              const isEditing = editingSceneField === key;
              const label = key === "context_before" ? "Context before" : key === "context_after" ? "Context after" : key.charAt(0).toUpperCase() + key.slice(1);

              if (!str && !isEditing) return null;

              return (
                <div key={key} className="mt-4 text-left max-w-2xl mx-auto">
                  <div className="text-xs uppercase tracking-wider text-amber-900/70 font-bold mb-1">
                    {label}
                  </div>
                  <AnimatePresence mode="wait">
                    {isEditing ? (
                      <motion.div
                        key={`edit-${key}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex flex-col gap-2"
                      >
                        {key === "description" || key === "context_before" || key === "context_after" ? (
                          <Textarea
                            value={sceneEditValue}
                            onChange={(e) => setSceneEditValue(e.target.value)}
                            rows={3}
                            className="resize-none bg-white/40 border-amber-900/30 text-sm"
                            autoFocus
                            disabled={saving !== null}
                          />
                        ) : (
                          <Input
                            value={sceneEditValue}
                            onChange={(e) => setSceneEditValue(e.target.value)}
                            className="bg-white/40 border-amber-900/30 text-sm"
                            autoFocus
                            disabled={saving !== null}
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={saving !== null}
                            onClick={() => saveSceneField(key, sceneEditValue)}
                            className="bg-amber-700 hover:bg-amber-800"
                          >
                            <Check className="w-3 h-3 mr-1.5" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingSceneField(null)}
                            className="hover:bg-amber-900/10"
                          >
                            <X className="w-3 h-3 mr-1.5" />
                            Cancel
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.button
                        key={`display-${key}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => startEditScene(key, str)}
                        className="group flex items-start gap-2 text-left w-full"
                      >
                        <p className="text-sm italic flex-1">{str}</p>
                        <Edit2 className="w-3 h-3 text-amber-900/30 group-hover:text-amber-900/60 transition-colors flex-shrink-0 mt-0.5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Script lines - Screenplay format */}
          <div className="space-y-6">
            {scene.lines
              .slice()
              .sort((a, b) => a.line_order - b.line_order)
              .map((line) => {
                const isEditing = editingLineId === line.id;
                const values = lineEditValues[line.id];
                const charIndex = line.character_name === scene.character_1_name ? 0 : 1;
                const charColor = charIndex === 0 ? colors.char1 : colors.char2;

                return (
                  <AnimatePresence mode="wait" key={line.id}>
                    {isEditing && values ? (
                      <motion.div
                        key={`edit-${line.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="bg-white/40 rounded-lg p-4 space-y-3 border border-amber-900/20"
                      >
                        <Input
                          placeholder="Character"
                          value={values.character_name}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, character_name: e.target.value },
                            }))
                          }
                          className="bg-white/60 border-amber-900/30"
                          disabled={saving !== null}
                        />
                        <Input
                          placeholder="Stage direction (optional)"
                          value={values.stage_direction}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, stage_direction: e.target.value },
                            }))
                          }
                          className="bg-white/60 border-amber-900/30 italic text-sm"
                          disabled={saving !== null}
                        />
                        <Textarea
                          placeholder="Line"
                          value={values.text}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, text: e.target.value },
                            }))
                          }
                          rows={3}
                          className="resize-none bg-white/60 border-amber-900/30"
                          disabled={saving !== null}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={saving !== null}
                            onClick={() => saveLine(line)}
                            className="bg-amber-700 hover:bg-amber-800"
                          >
                            <Check className="w-3 h-3 mr-1.5" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingLineId(null);
                              setLineEditValues((prev) => {
                                const next = { ...prev };
                                delete next[line.id];
                                return next;
                              });
                            }}
                            className="hover:bg-amber-900/10"
                          >
                            Cancel
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.button
                        key={`display-${line.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => startEditLine(line)}
                        className="group text-left w-full block relative pr-8"
                      >
                        {/* Character name - screenplay style */}
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={cn(
                              "text-xs font-bold uppercase tracking-widest",
                              charColor.text
                            )}
                          >
                            {line.character_name}
                          </span>
                          {line.stage_direction && (
                            <span className="text-xs italic text-amber-900/70 normal-case">
                              ({line.stage_direction})
                            </span>
                          )}
                          {line.primary_emotion && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 h-4 border-amber-900/30 bg-amber-100/50"
                            >
                              {line.primary_emotion}
                            </Badge>
                          )}
                        </div>
                        {/* Line text */}
                        <p className="text-[15px] leading-relaxed pl-4">
                          {line.text}
                        </p>
                        {/* Always-visible edit icon */}
                        <Edit2 className="absolute right-0 top-0 w-3.5 h-3.5 text-amber-900/30 group-hover:text-amber-900/60 transition-colors" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                );
              })}
          </div>

          {/* Footer note */}
          <div className="mt-10 pt-6 border-t border-amber-900/20 text-center">
            <p className="text-xs text-amber-900/60 italic">
              {scene.line_count} lines • Click any element to edit
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
