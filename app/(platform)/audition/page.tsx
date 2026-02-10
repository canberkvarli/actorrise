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
  IconPlayerPause,
  IconSearch,
  IconLayoutGrid,
  IconLayoutRows,
  IconX
} from '@tabler/icons-react';
import { Video, Sparkles, Settings, BookOpen } from 'lucide-react';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';

interface Monologue {
  id: number;
  title: string;
  play_title: string;
  character_name: string;
  text: string;
  word_count: number;
  estimated_duration_seconds?: number;
  difficulty_level?: string;
  primary_emotion?: string;
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

type LayoutMode = 'side-by-side' | 'stacked';

export default function AuditionModePage() {
  // Monologue selection
  const [monologues, setMonologues] = useState<Monologue[]>([]);
  const [filteredMonologues, setFilteredMonologues] = useState<Monologue[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [loadingMonologues, setLoadingMonologues] = useState(true);
  const [showMonologueSelector, setShowMonologueSelector] = useState(true);

  // Recording state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [selectedTake, setSelectedTake] = useState<Take | null>(null);
  const [viewingTake, setViewingTake] = useState<Take | null>(null);
  const [analyzingTake, setAnalyzingTake] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('side-by-side');
  const [timeLimit, setTimeLimit] = useState(180); // 3 minutes default
  const [showMonologueText, setShowMonologueText] = useState(true);

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
    timeLimit: timeLimit,
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
      setViewingTake(null);
    }
  });

  // Load monologues
  useEffect(() => {
    const fetchMonologues = async () => {
      try {
        setLoadingMonologues(true);
        // First try to get favorites
        const favoritesResponse = await api.get<Monologue[]>('/api/monologues/favorites/my');
        let monologues: Monologue[] = Array.isArray(favoritesResponse.data) ? favoritesResponse.data : [];
        
        // If no favorites, fall back to trending monologues
        if (monologues.length === 0) {
          try {
            const trendingResponse = await api.get<Monologue[]>('/api/monologues/trending?limit=50');
            monologues = Array.isArray(trendingResponse.data) ? trendingResponse.data : [];
          } catch (trendingError) {
            console.error('Failed to load trending monologues:', trendingError);
            // If trending also fails, try discover
            try {
              const discoverResponse = await api.get<Monologue[]>('/api/monologues/discover?limit=50');
              monologues = Array.isArray(discoverResponse.data) ? discoverResponse.data : [];
            } catch (discoverError) {
              console.error('Failed to load discover monologues:', discoverError);
            }
          }
        }
        
        setMonologues(monologues);
        setFilteredMonologues(monologues);
      } catch (error) {
        console.error('Failed to load monologues:', error);
        setError('Failed to load monologues. Please try again.');
        setMonologues([]);
        setFilteredMonologues([]);
      } finally {
        setLoadingMonologues(false);
      }
    };
    fetchMonologues();
  }, []);

  // Filter monologues based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredMonologues(monologues);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = monologues.filter(m => 
      m.title.toLowerCase().includes(query) ||
      m.character_name.toLowerCase().includes(query) ||
      m.play_title.toLowerCase().includes(query) ||
      m.text.toLowerCase().includes(query)
    );
    setFilteredMonologues(filtered);
  }, [searchQuery, monologues]);

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
    setError(null);
    try {
      const response = await api.post('/api/audition/analyze', {
        monologue_id: selectedMonologue.id,
        duration: take.duration,
      });

      const updatedTake: Take = {
        ...take,
        feedback: response.data as Take['feedback']
      };

      setTakes(prev => prev.map(t => t.id === take.id ? updatedTake : t));
      setSelectedTake(updatedTake);
      setViewingTake(updatedTake);
    } catch (error: any) {
      console.error('Failed to analyze take:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to analyze audition. Please try again.';
      setError(errorMessage);
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <IconVideoOff className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Video Recording Not Supported</h1>
          <p className="text-muted-foreground">Your browser doesn't support video recording. Try Chrome, Edge, or Safari.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Video className="w-8 h-8 text-primary" />
              <Sparkles className="w-5 h-5 text-primary" />
              <h1 className="text-3xl lg:text-4xl font-bold">Audition Mode</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMonologueSelector(!showMonologueSelector)}
                className="gap-2"
              >
                <BookOpen className="w-4 h-4" />
                {showMonologueSelector ? 'Hide' : 'Show'} Monologues
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Practice your auditions and get AI casting director feedback
          </p>
        </motion.div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive"
          >
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
              >
                <IconX className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* Monologue Selector */}
        <AnimatePresence>
          {showMonologueSelector && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Select Monologue</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Search */}
                  <div className="mb-4">
                    <div className="relative flex items-center">
                      <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
                      <Input
                        placeholder="Search monologues by title, character, or play..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Monologue Grid */}
                  {loadingMonologues ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...Array(6)].map((_, i) => (
                        <Card key={i} className="animate-pulse">
                          <CardContent className="pt-6">
                            <div className="h-6 bg-muted rounded mb-2 w-3/4" />
                            <div className="h-4 bg-muted rounded w-1/2" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : filteredMonologues.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No monologues found matching your search.' : 'No monologues available.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                      {filteredMonologues.map((mono) => (
                        <motion.div
                          key={mono.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => {
                            setSelectedMonologue(mono);
                            setShowMonologueSelector(false);
                          }}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedMonologue?.id === mono.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-sm">{mono.title}</h3>
                            {mono.difficulty_level && (
                              <Badge variant="secondary" className="text-xs">
                                {mono.difficulty_level}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            <span className="font-medium">{mono.character_name}</span> from{' '}
                            <span className="italic">{mono.play_title}</span>
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
                            {mono.text.substring(0, 100)}...
                          </p>
                          {mono.estimated_duration_seconds && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                              <IconClock className="w-3 h-3" />
                              ~{Math.floor(mono.estimated_duration_seconds / 60)} min
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Recording Area */}
        <div className={`grid gap-6 ${layoutMode === 'side-by-side' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Left/Top: Video & Controls */}
          <div className="space-y-6">
            {/* Selected Monologue Info */}
            {selectedMonologue && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{selectedMonologue.title}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedMonologue(null)}
                    >
                      <IconX className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{selectedMonologue.character_name}</span> from{' '}
                    <span className="italic">{selectedMonologue.play_title}</span>
                  </p>
                </CardHeader>
                {showMonologueText && (
                  <CardContent>
                    <div className="p-4 bg-muted/50 rounded-lg max-h-64 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{selectedMonologue.text}</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Video Preview/Recording */}
            <Card>
              <CardContent className="pt-6">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
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
                        <IconVideo className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">Ready to record</p>
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
                      {formatDuration(timeLimit - duration)} remaining
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  {!isRecording && countdown === null && (
                    <>
                      <Button
                        onClick={startCountdown}
                        disabled={!selectedMonologue}
                        size="lg"
                        className="gap-2"
                      >
                        <IconVideo className="w-5 h-5" />
                        Start Recording
                      </Button>

                      {selectedTake && (
                        <Button
                          onClick={handleRetry}
                          variant="outline"
                          size="lg"
                          className="gap-2"
                        >
                          <IconRefresh className="w-5 h-5" />
                          Retry
                        </Button>
                      )}
                    </>
                  )}

                  {isRecording && (
                    <Button
                      onClick={handleStopRecording}
                      variant="destructive"
                      size="lg"
                      className="gap-2"
                    >
                      <IconPlayerPause className="w-5 h-5" />
                      Stop Recording
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Feedback */}
            {selectedTake?.feedback && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>🎭 Casting Director Feedback</CardTitle>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <IconStar
                          key={star}
                          className={`w-5 h-5 ${
                            star <= selectedTake.feedback!.rating
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-muted-foreground'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-primary mb-2">✅ Strengths</h4>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {selectedTake.feedback.strengths.map((strength, idx) => (
                          <li key={idx}>{strength}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-primary mb-2">💡 Areas for Improvement</h4>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {selectedTake.feedback.areas_for_improvement.map((area, idx) => (
                          <li key={idx}>{area}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-primary mb-2">📝 Overall Notes</h4>
                      <p className="text-muted-foreground">{selectedTake.feedback.overall_notes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right/Bottom: Takes List & Settings */}
          <div className="space-y-6">
            {/* Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <CardTitle>Settings</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Layout Mode */}
                <div>
                  <Label className="mb-2">Layout</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={layoutMode === 'side-by-side' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLayoutMode('side-by-side')}
                      className="gap-2"
                    >
                      <IconLayoutGrid className="w-4 h-4" />
                      Side by Side
                    </Button>
                    <Button
                      variant={layoutMode === 'stacked' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLayoutMode('stacked')}
                      className="gap-2"
                    >
                      <IconLayoutRows className="w-4 h-4" />
                      Stacked
                    </Button>
                  </div>
                </div>

                {/* Time Limit */}
                <div>
                  <Label htmlFor="timeLimit" className="mb-2">
                    Time Limit (seconds)
                  </Label>
                  <Select
                    id="timeLimit"
                    value={timeLimit.toString()}
                    onChange={(e) => setTimeLimit(Number(e.target.value))}
                    disabled={isRecording}
                  >
                    <option value="60">1 minute</option>
                    <option value="120">2 minutes</option>
                    <option value="180">3 minutes</option>
                    <option value="300">5 minutes</option>
                    <option value="600">10 minutes</option>
                  </Select>
                </div>

                {/* Show Monologue Text */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="showText">Show monologue text during recording</Label>
                  <input
                    type="checkbox"
                    id="showText"
                    checked={showMonologueText}
                    onChange={(e) => setShowMonologueText(e.target.checked)}
                    className="w-4 h-4"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Takes List */}
            <Card>
              <CardHeader>
                <CardTitle>Your Takes ({takes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {takes.length === 0 ? (
                  <div className="text-center py-8">
                    <IconVideo className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No takes yet</p>
                    <p className="text-xs text-muted-foreground">Record your first audition!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {takes.map((take, idx) => (
                      <motion.div
                        key={take.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedTake?.id === take.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => handleViewTake(take)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium">
                              Take {takes.length - idx}
                            </div>
                            <div className="text-xs text-muted-foreground">
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

                        <div className="text-sm text-muted-foreground mb-3">
                          Duration: {formatDuration(take.duration)}
                        </div>

                        <div className="flex items-center gap-2">
                          {!take.feedback && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGetFeedback(take);
                              }}
                              disabled={analyzingTake || !selectedMonologue}
                              size="sm"
                              className="flex-1 text-xs"
                            >
                              {analyzingTake ? 'Analyzing...' : 'Get Feedback'}
                            </Button>
                          )}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadTake(take);
                            }}
                            variant="outline"
                            size="sm"
                            className="p-2"
                            title="Download"
                          >
                            <IconDownload className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTake(take.id);
                            }}
                            variant="destructive"
                            size="sm"
                            className="p-2"
                            title="Delete"
                          >
                            <IconTrash className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="bg-primary/10 border-primary/20">
              <CardHeader>
                <CardTitle>💡 Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Good lighting is key - face a window or lamp</li>
                  <li>• Position camera at eye level</li>
                  <li>• Frame yourself from mid-chest up</li>
                  <li>• Test your audio before recording</li>
                  <li>• Take multiple takes - compare them!</li>
                  <li>• Use AI feedback to improve</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
