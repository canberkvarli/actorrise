'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconVideo,
  IconVideoOff,
  IconRefresh,
  IconClock,
  IconStar,
  IconDownload,
  IconTrash,
  IconPlayerPlay,
  IconPlayerPause
} from '@tabler/icons-react';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import api from '@/lib/api';

interface Monologue {
  id: number;
  title: string;
  play_title: string;
  character_name: string;
  text: string;
  word_count: number;
}

interface Take {
  id: string;
  timestamp: Date;
  duration: number;
  blob: Blob;
  url: string;
  feedback?: {
    rating: number;
    strengths: string[];
    areas_for_improvement: string[];
    overall_notes: string;
  };
}

export default function AuditionModePage() {
  // Monologue selection
  const [monologues, setMonologues] = useState<Monologue[]>([]);
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [loadingMonologues, setLoadingMonologues] = useState(true);

  // Recording state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [selectedTake, setSelectedTake] = useState<Take | null>(null);
  const [viewingTake, setViewingTake] = useState<Take | null>(null);
  const [analyzingTake, setAnalyzingTake] = useState(false);

  // Video refs
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);

  // Video recorder hook
  const {
    isRecording,
    recordedBlob,
    recordedUrl,
    duration,
    isSupported,
    startRecording,
    stopRecording,
    clearRecording,
    stream
  } = useVideoRecorder({
    timeLimit: 180, // 3 minutes max
    onRecordingComplete: (blob, url) => {
      const newTake: Take = {
        id: Date.now().toString(),
        timestamp: new Date(),
        duration: duration,
        blob,
        url
      };
      setTakes(prev => [...prev, newTake]);
      setSelectedTake(newTake);
    }
  });

  // Load monologues
  useEffect(() => {
    const fetchMonologues = async () => {
      try {
        const response = await api.get('/api/monologues/bookmarks');
        setMonologues(response.data.slice(0, 20));
      } catch (error) {
        console.error('Failed to load monologues:', error);
      } finally {
        setLoadingMonologues(false);
      }
    };
    fetchMonologues();
  }, []);

  // Show video preview when stream is available
  useEffect(() => {
    if (stream && videoPreviewRef.current && !isRecording) {
      videoPreviewRef.current.srcObject = stream;
    }
  }, [stream, isRecording]);

  // Countdown timer
  const startCountdown = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval);
          startRecording();
          return null;
        }
        return prev! - 1;
      });
    }, 1000);
  };

  // Handle stop recording
  const handleStopRecording = () => {
    stopRecording();
  };

  // Retry current take
  const handleRetry = () => {
    clearRecording();
    setSelectedTake(null);
    setViewingTake(null);
  };

  // Delete take
  const handleDeleteTake = (takeId: string) => {
    setTakes(prev => prev.filter(t => t.id !== takeId));
    if (selectedTake?.id === takeId) {
      setSelectedTake(null);
    }
    if (viewingTake?.id === takeId) {
      setViewingTake(null);
    }
  };

  // View take
  const handleViewTake = (take: Take) => {
    setViewingTake(take);
    if (playbackVideoRef.current) {
      playbackVideoRef.current.src = take.url;
    }
  };

  // Get AI feedback
  const handleGetFeedback = async (take: Take) => {
    if (!selectedMonologue) return;

    setAnalyzingTake(true);
    try {
      // In a real implementation, this would send the video to the backend
      // For now, we'll simulate with the monologue text
      const response = await api.post('/api/audition/analyze', {
        monologue_id: selectedMonologue.id,
        duration: take.duration,
        // video_blob would be sent here in production
      });

      const updatedTake = {
        ...take,
        feedback: response.data
      };

      setTakes(prev => prev.map(t => t.id === take.id ? updatedTake : t));
      setSelectedTake(updatedTake);
      setViewingTake(updatedTake);
    } catch (error) {
      console.error('Failed to analyze take:', error);
    } finally {
      setAnalyzingTake(false);
    }
  };

  // Download take
  const handleDownloadTake = (take: Take) => {
    const a = document.createElement('a');
    a.href = take.url;
    a.download = `audition-${selectedMonologue?.title || 'take'}-${take.timestamp.toISOString()}.webm`;
    a.click();
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isSupported) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <IconVideoOff className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Video Recording Not Supported</h1>
          <p className="text-gray-600">Your browser doesn't support video recording. Try Chrome, Edge, or Safari.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🎬 Audition Mode
          </h1>
          <p className="text-gray-600">
            Practice your auditions and get AI casting director feedback
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Recording/Preview */}
          <div className="lg:col-span-2 space-y-6">
            {/* Monologue Selection */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Monologue
              </label>
              <select
                value={selectedMonologue?.id || ''}
                onChange={(e) => {
                  const mono = monologues.find(m => m.id === Number(e.target.value));
                  setSelectedMonologue(mono || null);
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                disabled={isRecording || countdown !== null}
              >
                <option value="">Choose a monologue...</option>
                {monologues.map(mono => (
                  <option key={mono.id} value={mono.id}>
                    {mono.title} - {mono.character_name} ({mono.play_title})
                  </option>
                ))}
              </select>

              {selectedMonologue && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 p-4 bg-purple-50 rounded-lg"
                >
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">{selectedMonologue.character_name}</span> from{' '}
                    <span className="italic">{selectedMonologue.play_title}</span>
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-4">
                    {selectedMonologue.text}
                  </div>
                </motion.div>
              )}
            </motion.div>

            {/* Video Preview/Recording */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden mb-4">
                {/* Video Preview */}
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${(isRecording || countdown !== null) ? 'block' : 'hidden'}`}
                />

                {/* Viewing Take */}
                {viewingTake && !isRecording && countdown === null && (
                  <video
                    ref={playbackVideoRef}
                    controls
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Idle State */}
                {!isRecording && countdown === null && !viewingTake && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <IconVideo className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-400">Ready to record</p>
                    </div>
                  </div>
                )}

                {/* Countdown Overlay */}
                <AnimatePresence>
                  {countdown !== null && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.5 }}
                      className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50"
                    >
                      <div className="text-9xl font-bold text-white">
                        {countdown}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Recording Indicator */}
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full">
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="w-3 h-3 bg-white rounded-full"
                    />
                    <span className="font-medium">REC {formatDuration(duration)}</span>
                  </div>
                )}

                {/* Duration Display */}
                {isRecording && (
                  <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded-full">
                    <IconClock className="w-4 h-4 inline mr-2" />
                    {formatDuration(180 - duration)} remaining
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4">
                {!isRecording && countdown === null && (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={startCountdown}
                      disabled={!selectedMonologue}
                      className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-pink-500 text-white px-8 py-4 rounded-xl font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <IconVideo className="w-5 h-5" />
                      Start Recording
                    </motion.button>

                    {selectedTake && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRetry}
                        className="flex items-center gap-2 bg-gray-200 text-gray-700 px-6 py-4 rounded-xl font-medium hover:bg-gray-300"
                      >
                        <IconRefresh className="w-5 h-5" />
                        Retry
                      </motion.button>
                    )}
                  </>
                )}

                {isRecording && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleStopRecording}
                    className="flex items-center gap-2 bg-gradient-to-r from-gray-700 to-gray-900 text-white px-8 py-4 rounded-xl font-medium shadow-lg hover:shadow-xl"
                  >
                    <IconPlayerPause className="w-5 h-5" />
                    Stop Recording
                  </motion.button>
                )}
              </div>
            </motion.div>

            {/* AI Feedback */}
            {selectedTake?.feedback && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-lg p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    🎭 Casting Director Feedback
                  </h3>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <IconStar
                        key={star}
                        className={`w-5 h-5 ${
                          star <= selectedTake.feedback!.rating
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-green-700 mb-2">✅ Strengths</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                      {selectedTake.feedback.strengths.map((strength, idx) => (
                        <li key={idx}>{strength}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-orange-700 mb-2">💡 Areas for Improvement</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                      {selectedTake.feedback.areas_for_improvement.map((area, idx) => (
                        <li key={idx}>{area}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-purple-700 mb-2">📝 Overall Notes</h4>
                    <p className="text-gray-700">{selectedTake.feedback.overall_notes}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Takes List */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Your Takes ({takes.length})
              </h3>

              {takes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <IconVideo className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No takes yet</p>
                  <p className="text-xs">Record your first audition!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {takes.map((take, idx) => (
                    <motion.div
                      key={take.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedTake?.id === take.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                      onClick={() => handleViewTake(take)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium text-gray-900">
                            Take {takes.length - idx}
                          </div>
                          <div className="text-xs text-gray-500">
                            {take.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                        {take.feedback && (
                          <div className="flex items-center gap-1">
                            <IconStar className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-sm font-medium">{take.feedback.rating}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 mb-3">
                        Duration: {formatDuration(take.duration)}
                      </div>

                      <div className="flex items-center gap-2">
                        {!take.feedback && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGetFeedback(take);
                            }}
                            disabled={analyzingTake}
                            className="flex-1 text-xs bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                          >
                            {analyzingTake ? 'Analyzing...' : 'Get Feedback'}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadTake(take);
                          }}
                          className="text-xs bg-gray-200 text-gray-700 p-2 rounded-lg hover:bg-gray-300"
                          title="Download"
                        >
                          <IconDownload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTake(take.id);
                          }}
                          className="text-xs bg-red-100 text-red-600 p-2 rounded-lg hover:bg-red-200"
                          title="Delete"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Tips */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl shadow-lg p-6 text-white"
            >
              <h3 className="text-lg font-bold mb-3">💡 Tips</h3>
              <ul className="space-y-2 text-sm">
                <li>• Good lighting is key - face a window or lamp</li>
                <li>• Position camera at eye level</li>
                <li>• Frame yourself from mid-chest up</li>
                <li>• Test your audio before recording</li>
                <li>• Take multiple takes - compare them!</li>
                <li>• Use AI feedback to improve</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
