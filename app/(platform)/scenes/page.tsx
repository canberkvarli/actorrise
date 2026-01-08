'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { TheaterMasks, Users, Clock, TrendingUp, Heart, ChevronRight, Sparkles } from 'lucide-react';

interface Scene {
  id: number;
  play_id: number;
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
  rehearsal_count: number;
  favorite_count: number;
  is_favorited: boolean;
}

export default function ScenesPage() {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState({
    difficulty: '',
    tone: ''
  });

  useEffect(() => {
    fetchScenes();
  }, [filter]);

  const fetchScenes = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filter.difficulty) params.append('difficulty', filter.difficulty);

      const response = await api.get<Scene[]>(`/api/scenes?${params.toString()}`);
      setScenes(response.data);
    } catch (error) {
      console.error('Error fetching scenes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const getDifficultyColor = (level: string): string => {
    switch (level) {
      case 'beginner':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'intermediate':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'advanced':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getToneEmoji = (tone: string): string => {
    const toneMap: Record<string, string> = {
      romantic: '💕',
      comedic: '😄',
      tragic: '😢',
      tense: '😰',
      dramatic: '🎭',
      philosophical: '🤔'
    };
    return toneMap[tone?.toLowerCase()] || '🎭';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Theater Curtain Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 text-white">
        <div className="absolute inset-0 bg-[url('/theater-pattern.svg')] opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <TheaterMasks className="w-12 h-12" />
              <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
            </div>
            <h1 className="text-5xl font-bold mb-4">ScenePartner</h1>
            <p className="text-xl text-purple-100 max-w-2xl">
              Practice two-person scenes with your AI scene partner. Available 24/7, always ready to rehearse.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8"
        >
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty
              </label>
              <select
                value={filter.difficulty}
                onChange={(e) => setFilter({ ...filter, difficulty: e.target.value })}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              >
                <option value="">All Levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tone
              </label>
              <select
                value={filter.tone}
                onChange={(e) => setFilter({ ...filter, tone: e.target.value })}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              >
                <option value="">All Tones</option>
                <option value="romantic">💕 Romantic</option>
                <option value="comedic">😄 Comedic</option>
                <option value="tragic">😢 Tragic</option>
                <option value="tense">😰 Tense</option>
                <option value="dramatic">🎭 Dramatic</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Scenes Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-lg animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-4 w-3/4" />
                <div className="h-4 bg-gray-200 rounded mb-2" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenes.map((scene, index) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => router.push(`/scenes/${scene.id}`)}
                  className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl border border-gray-100 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Card Header */}
                  <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-6 text-white">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-4xl">{getToneEmoji(scene.tone)}</span>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getDifficultyColor(scene.difficulty_level)}`}>
                        {scene.difficulty_level}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-yellow-200 transition">
                      {scene.title}
                    </h3>
                    <p className="text-sm text-purple-100">
                      from <span className="font-semibold">{scene.play_title}</span>
                    </p>
                    <p className="text-xs text-purple-200">by {scene.play_author}</p>
                  </div>

                  {/* Card Body */}
                  <div className="p-6">
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {scene.description}
                    </p>

                    {/* Characters */}
                    <div className="flex items-center gap-2 mb-4 p-3 bg-purple-50 rounded-lg">
                      <Users className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-900">
                        {scene.character_1_name} & {scene.character_2_name}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{formatDuration(scene.estimated_duration_seconds)}</span>
                        <span className="text-gray-400">•</span>
                        <span>{scene.line_count} lines</span>
                      </div>

                      {scene.rehearsal_count > 0 && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          <span>{scene.rehearsal_count} rehearsals</span>
                        </div>
                      )}
                    </div>

                    {/* Emotions */}
                    {scene.primary_emotions && scene.primary_emotions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {scene.primary_emotions.slice(0, 3).map((emotion) => (
                          <span
                            key={emotion}
                            className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full"
                          >
                            {emotion}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* CTA */}
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between text-purple-600 font-medium">
                        <span>Start Rehearsal</span>
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}

        {!isLoading && scenes.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <TheaterMasks className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              No scenes found
            </h3>
            <p className="text-gray-500">
              Try adjusting your filters or check back soon for new scenes!
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
