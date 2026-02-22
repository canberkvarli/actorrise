"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Play, Edit2, Check, X } from "lucide-react";
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

  if (loading || !scene) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/my-scripts/${scriptId}`)}>
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

      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <h1 className="text-xl font-bold font-serif">Edit scene</h1>
          <p className="text-sm text-muted-foreground">
            From {scene.play_title} by {scene.play_author}
          </p>
          {SCENE_FIELDS.map(({ key, label, multiline }) => {
            const value = scene[key];
            const str = typeof value === "string" ? value : value ?? "";
            const isEditing = editingSceneField === key;
            return (
              <div key={key}>
                <label className="text-sm font-medium text-muted-foreground block mb-1">{label}</label>
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    {multiline ? (
                      <Textarea
                        value={sceneEditValue}
                        onChange={(e) => setSceneEditValue(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    ) : (
                      <Input
                        value={sceneEditValue}
                        onChange={(e) => setSceneEditValue(e.target.value)}
                      />
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => saveSceneField(key, sceneEditValue)}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingSceneField(null)}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 group cursor-pointer py-1"
                    onClick={() => startEditScene(key, str)}
                  >
                    <span className={!str ? "text-muted-foreground italic" : ""}>
                      {str || `Click to add ${label.toLowerCase()}`}
                    </span>
                    <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4 font-serif">Lines</h2>
          <div className="space-y-3">
            {scene.lines
              .slice()
              .sort((a, b) => a.line_order - b.line_order)
              .map((line) => {
                const isEditing = editingLineId === line.id;
                const values = lineEditValues[line.id];
                return (
                  <div
                    key={line.id}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    {isEditing && values ? (
                      <>
                        <Input
                          placeholder="Character"
                          value={values.character_name}
                          onChange={(e) =>
                            setLineEditValues((prev) => ({
                              ...prev,
                              [line.id]: { ...values, character_name: e.target.value },
                            }))
                          }
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
                          rows={2}
                          className="resize-none"
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
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={saving !== null}
                            onClick={() => saveLine(line)}
                          >
                            <Check className="w-4 h-4 mr-1" />
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
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div
                        className="group cursor-pointer"
                        onClick={() => startEditLine(line)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-muted-foreground">
                            {line.character_name}
                          </span>
                          {line.stage_direction && (
                            <span className="text-xs text-muted-foreground italic">
                              [{line.stage_direction}]
                            </span>
                          )}
                          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                        </div>
                        <p className="mt-1 text-sm">{line.text}</p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
