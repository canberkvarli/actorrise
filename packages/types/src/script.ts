/**
 * Mirror of apps/web/hooks/useScripts UserScript + scene types. Backend
 * is the source of truth — keep in lockstep.
 */
export interface ScriptCharacter {
  name: string;
  gender?: string;
  age_range?: string;
  description?: string;
}

export interface UserScript {
  id: number;
  title: string;
  author: string;
  description?: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error?: string;
  ai_extraction_completed: boolean;
  genre?: string;
  estimated_length_minutes?: number;
  num_characters: number;
  num_scenes_extracted: number;
  characters: ScriptCharacter[];
  created_at: string;
  updated_at?: string;
  is_sample?: boolean;
  first_scene_title?: string | null;
  first_scene_description?: string | null;
  scene_titles?: string[];
}

export interface SceneLine {
  /** 0-indexed position in the scene */
  index?: number;
  character: string;
  text: string;
  stage_direction?: string;
}

export interface Scene {
  id: number;
  script_id: number;
  title: string;
  description?: string;
  characters: string[];
  lines: SceneLine[];
  estimated_duration_seconds?: number;
}

export interface RehearsalSession {
  id: number;
  scene_id: number;
  user_character: string;
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
}
