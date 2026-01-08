'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import {
  ArrowLeft,
  Play,
  Users,
  Clock,
  MapPin,
  Heart,
  BookOpen,
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface SceneLine {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
  word_count: number;
  primary_emotion: string | null;
}

interface Scene {
  id: number;
  play_title: string;
  play_author: string;
  title: string;
  description: string;
  character_1_name: string;
  character_2_name: string;
  character_1_gender: string | null;
  character_2_gender: string | null;
  line_count: number;
  estimated_duration_seconds: number;
  difficulty_level: string;
  primary_emotions: string[];
  relationship_dynamic: string;
  tone: string;
  setting: string;
  context_before: string;
  context_after: string;
  rehearsal_count: number;
  is_favorited: boolean;
  lines: SceneLine[];
}

export default function SceneDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sceneId = params.id as string;

  const [scene, setScene] = useState<Scene | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [showCharacterModal, setShowCharacterModal] = useState(false);

  useEffect(() => {
    fetchScene();
  }, [sceneId]);

  const fetchScene = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Scene>(`/api/scenes/${sceneId}`);
      setScene(response.data);
    } catch (error) {
      console.error('Error fetching scene:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRehearsal = async () => {
    if (!selectedCharacter || !scene) return;

    try {
      const response = await api.post('/api/scenes/rehearse/start', {
        scene_id: scene.id,
        user_character: selectedCharacter
      });

      // Navigate to rehearsal page
      router.push(`/scenes/${scene.id}/rehearse?session=${response.data.id}`);
    } catch (error) {
      console.error('Error starting rehearsal:', error);
    }
  };

  const toggleFavorite = async () => {
    if (!scene) return;

    try {
      await api.post(`/api/scenes/${scene.id}/favorite`);
      setScene({ ...scene, is_favorited: !scene.is_favorited });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading scene...</p>
        </div>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Scene not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-purple-200 hover:text-white mb-6 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Scenes
          </button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-4xl font-bold mb-3">{scene.title}</h1>
                <p className="text-xl text-purple-100 mb-2">
                  from <span className="font-semibold">{scene.play_title}</span>
                </p>
                <p className="text-purple-200">by {scene.play_author}</p>
              </div>

              <button
                onClick={toggleFavorite}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition"
              >
                <Heart
                  className={`w-6 h-6 ${scene.is_favorited ? 'fill-red-500 text-red-500' : ''}`}
                />
              </button>
            </div>

            <div className="flex flex-wrap gap-4 mt-6">
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                <Users className="w-5 h-5" />
                <span className="font-medium">
                  {scene.character_1_name} & {scene.character_2_name}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                <Clock className="w-5 h-5" />
                <span>{formatDuration(scene.estimated_duration_seconds)}</span>
              </div>
              {scene.setting && (
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                  <MapPin className="w-5 h-5" />
                  <span>{scene.setting}</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Description & Context */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About This Scene</h2>
              <p className="text-gray-700 leading-relaxed mb-6">{scene.description}</p>

              {scene.context_before && (
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Context Before:</h3>
                  <p className="text-gray-600 text-sm">{scene.context_before}</p>
                </div>
              )}

              {scene.context_after && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Context After:</h3>
                  <p className="text-gray-600 text-sm">{scene.context_after}</p>
                </div>
              )}
            </div>

            {/* Script */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center gap-2 mb-6">
                <BookOpen className="w-6 h-6 text-purple-600" />
                <h2 className="text-2xl font-bold text-gray-900">The Script</h2>
              </div>

              <div className="space-y-4 font-mono text-sm">
                {scene.lines.map((line) => (
                  <div key={line.id} className="border-l-4 border-purple-200 pl-4 py-2 hover:border-purple-400 transition">
                    <div className="font-bold text-purple-900 mb-1">
                      {line.character_name}
                      {line.stage_direction && (
                        <span className="ml-2 text-gray-500 italic font-normal text-xs">
                          [{line.stage_direction}]
                        </span>
                      )}
                    </div>
                    <div className="text-gray-700 leading-relaxed">{line.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Start Rehearsal */}
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl shadow-xl p-6 text-white sticky top-4">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-6 h-6 text-yellow-300" />
                <h3 className="text-xl font-bold">Start Rehearsal</h3>
              </div>
              <p className="text-purple-100 text-sm mb-6">
                Choose which character you'd like to play, and our AI will be your scene partner!
              </p>

              <button
                onClick={() => setShowCharacterModal(true)}
                className="w-full bg-white text-purple-900 py-4 rounded-xl font-bold hover:bg-purple-50 transition flex items-center justify-center gap-2 group"
              >
                <Play className="w-5 h-5 group-hover:scale-110 transition" />
                Choose Character & Begin
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
              </button>

              {scene.rehearsal_count > 0 && (
                <p className="text-center text-purple-200 text-xs mt-4">
                  {scene.rehearsal_count} actors have rehearsed this scene
                </p>
              )}
            </div>

            {/* Scene Info */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="font-bold text-gray-900 mb-4">Scene Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-600">Difficulty:</span>
                  <span className="ml-2 font-semibold text-gray-900 capitalize">
                    {scene.difficulty_level}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Tone:</span>
                  <span className="ml-2 font-semibold text-gray-900 capitalize">
                    {scene.tone}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Dynamic:</span>
                  <span className="ml-2 font-semibold text-gray-900 capitalize">
                    {scene.relationship_dynamic}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Lines:</span>
                  <span className="ml-2 font-semibold text-gray-900">
                    {scene.line_count} total
                  </span>
                </div>
              </div>

              {scene.primary_emotions && scene.primary_emotions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <span className="text-gray-600 text-sm">Emotions:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {scene.primary_emotions.map((emotion) => (
                      <span
                        key={emotion}
                        className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full font-medium"
                      >
                        {emotion}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Character Selection Modal */}
      {showCharacterModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8"
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Character</h3>
            <p className="text-gray-600 mb-6">
              Select which character you'd like to play in this scene.
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => setSelectedCharacter(scene.character_1_name)}
                className={`w-full p-4 rounded-xl border-2 transition ${
                  selectedCharacter === scene.character_1_name
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="font-bold text-gray-900">{scene.character_1_name}</div>
                {scene.character_1_gender && (
                  <div className="text-sm text-gray-600 capitalize">{scene.character_1_gender}</div>
                )}
              </button>

              <button
                onClick={() => setSelectedCharacter(scene.character_2_name)}
                className={`w-full p-4 rounded-xl border-2 transition ${
                  selectedCharacter === scene.character_2_name
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="font-bold text-gray-900">{scene.character_2_name}</div>
                {scene.character_2_gender && (
                  <div className="text-sm text-gray-600 capitalize">{scene.character_2_gender}</div>
                )}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCharacterModal(false);
                  setSelectedCharacter('');
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStartRehearsal}
                disabled={!selectedCharacter}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Rehearsal
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
