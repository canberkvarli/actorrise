'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SCRIPTS_FEATURE_ENABLED } from '@/lib/featureFlags';
import UnderConstructionScripts from '@/components/UnderConstructionScripts';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Send,
  RotateCcw,
  Sparkles,
  User,
  Bot,
  Check,
  Trophy,
  Star,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings
} from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import {
  getRehearsalSettings,
  setRehearsalSettings,
  type RehearsalSettings,
} from '@/lib/scenepartnerStorage';

interface RehearsalSession {
  id: number;
  scene_id: number;
  user_character: string;
  ai_character: string;
  status: string;
  current_line_index: number;
  total_lines_delivered: number;
  completion_percentage: number;
  first_line_for_user?: string | null;
  current_line_for_user?: string | null;
}

interface Message {
  type: 'user' | 'ai' | 'system';
  character: string;
  content: string;
  feedback?: string;
}

interface SceneLineRow {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
  word_count: number;
}

interface SceneWithLines {
  id: number;
  title: string;
  play_title: string;
  play_author: string;
  lines: SceneLineRow[];
}

export default function RehearsalPage() {
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sceneId = params.id as string;
  const sessionId = searchParams.get('session');

  const [session, setSession] = useState<RehearsalSession | null>(null);
  /** Full scene with lines for script-style display. */
  const [sceneWithLines, setSceneWithLines] = useState<SceneWithLines | null>(null);
  /** The line the user should deliver next (from script). Updated from session fetch and deliver response next_line_preview. */
  const [currentLineForUser, setCurrentLineForUser] = useState<string | null>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** Focus mode: dark room, single prominent line. Default true. */
  const [focusMode, setFocusMode] = useState(true);
  /** Last AI line shown in focus mode (so we can highlight it briefly). */
  const [lastAiLine, setLastAiLine] = useState<string | null>(null);
  /** Countdown before scene starts (3, 2, 1). Null when not running, 0 when done. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const [focusInitialized, setFocusInitialized] = useState(false);
  const [autoListenLineKey, setAutoListenLineKey] = useState<string | null>(null);
  /** Rehearsal settings (from localStorage). */
  const [rehearsalSettings, setRehearsalSettingsState] = useState<RehearsalSettings>(() =>
    typeof window !== 'undefined' ? getRehearsalSettings() : { pauseBetweenLinesSeconds: 3, skipMyLineIfSilent: false, skipAfterSeconds: 10, countdownSeconds: 3 }
  );
  const skipSilentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice settings
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  // Speech recognition hook
  const {
    transcript,
    isListening,
    isSupported: isSpeechRecognitionSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    continuous: false,
    interimResults: true,
    onResult: (text) => {
      setUserInput(text);
      stopListening();
      // Voice-only focus mode: auto-submit recognized line
      handleDeliverLine(text);
      resetTranscript();
    },
  });

  // Speech synthesis hook; after TTS ends, wait pauseBetweenLines then clear AI line
  const {
    speak,
    cancel: cancelSpeech,
    isSpeaking,
    isSupported: isSpeechSynthesisSupported,
    voices,
    selectedVoice,
    setVoice,
  } = useSpeechSynthesis({
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    onEnd: () => {
      const pauseMs = getRehearsalSettings().pauseBetweenLinesSeconds * 1000;
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        setLastAiLine(null);
        pauseTimerRef.current = null;
      }, pauseMs);
    },
  });

  useEffect(() => {
    if (sessionId) {
      loadSession();
    } else {
      setError('No session. Start rehearsal from your script (My Scripts → pick character → Rehearse).');
    }
  }, [sessionId]);

  // Countdown tick
  useEffect(() => {
    if (countdown === null || countdown < 0) return;
    if (countdown === 0) {
      const t = setTimeout(() => setCountdown(null), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const activeUserLineKey = session ? `${session.id}:${currentLineForUser ?? ''}` : null;

  // Auto-listen once per active user line in focus mode
  useEffect(() => {
    const isUserTurn = currentLineForUser != null && lastAiLine == null;
    const canAutoListen =
      focusMode &&
      !showFeedback &&
      isUserTurn &&
      isSpeechRecognitionSupported &&
      !isListening &&
      !isSpeaking &&
      !isProcessing &&
      (countdown === null || countdown <= 0) &&
      activeUserLineKey !== null &&
      autoListenLineKey !== activeUserLineKey;
    if (!canAutoListen) return;
    setAutoListenLineKey(activeUserLineKey);
    startListening();
  }, [
    focusMode,
    showFeedback,
    currentLineForUser,
    lastAiLine,
    isSpeechRecognitionSupported,
    isListening,
    isSpeaking,
    isProcessing,
    countdown,
    activeUserLineKey,
    autoListenLineKey,
    startListening,
  ]);

  // Scroll script to current line when highlight changes (focus mode)
  useEffect(() => {
    if (focusMode && session && sceneWithLines?.lines && (currentLineForUser != null || lastAiLine != null)) {
      const t = setTimeout(() => {
        currentLineRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [focusMode, session?.id, currentLineForUser, lastAiLine, sceneWithLines?.lines?.length]);

  // Skip-if-silent timer: when it's user's turn and setting is on, auto-deliver after N seconds
  useEffect(() => {
    if (!session || !rehearsalSettings.skipMyLineIfSilent || !currentLineForUser || isProcessing || lastAiLine != null) return;
    if (userInput.trim().length > 0) return;
    if (focusMode && countdown !== null && countdown > 0) return;
    const sec = rehearsalSettings.skipAfterSeconds * 1000;
    skipSilentTimerRef.current = setTimeout(() => {
      skipSilentTimerRef.current = null;
      handleDeliverLine(currentLineForUser);
    }, sec);
    return () => {
      if (skipSilentTimerRef.current) {
        clearTimeout(skipSilentTimerRef.current);
        skipSilentTimerRef.current = null;
      }
    };
  }, [session?.id, rehearsalSettings.skipMyLineIfSilent, rehearsalSettings.skipAfterSeconds, currentLineForUser, focusMode, countdown, isProcessing, lastAiLine, userInput]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get<RehearsalSession>(
        `/api/scenes/rehearse/sessions/${sessionId}`
      );
      setSession(data);
      const lineToShow = data.current_line_for_user ?? data.first_line_for_user ?? null;
      setCurrentLineForUser(lineToShow);
      setMessages([{
        type: 'system',
        character: 'Director',
        content: `You're playing ${data.user_character}. I'll be your scene partner as ${data.ai_character}. Deliver your lines when ready.`
      }]);
      // Fetch full scene with lines for script-style view
      try {
        const sceneRes = await api.get<SceneWithLines>(`/api/scenes/${data.scene_id}`);
        setSceneWithLines(sceneRes.data);
      } catch {
        // Non-fatal; script view will show loading
      }
      // Start countdown only after initial session + scene request settle (prevents instant/jumpy start)
      const settings = getRehearsalSettings();
      if (settings.countdownSeconds > 0) setCountdown(settings.countdownSeconds);
      else setCountdown(null);
      setFocusInitialized(true);
    } catch {
      setError('Session not found. Start rehearsal from your script.');
    }
  };

  const handleDeliverLine = async (overrideInput?: string) => {
    const toSend = (overrideInput ?? userInput).trim();
    if (!toSend || isProcessing || !session) return;
    if (skipSilentTimerRef.current) {
      clearTimeout(skipSilentTimerRef.current);
      skipSilentTimerRef.current = null;
    }

    // Save input before clearing
    const inputToSend = toSend;

    const userMessage: Message = {
      type: 'user',
      character: session.user_character,
      content: inputToSend
    };

    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsProcessing(true);

    try {
      const response = await api.post<{
        ai_response: string;
        feedback?: string;
        completion_percentage: number;
        session_status: string;
        next_line_preview?: string | null;
      }>('/api/scenes/rehearse/deliver', {
        session_id: session.id,
        user_input: inputToSend,
        request_feedback: false,
        request_retry: false
      });

      const data = response.data;

      // Add AI response
      const aiMessage: Message = {
        type: 'ai',
        character: session.ai_character,
        content: data.ai_response,
        feedback: data.feedback
      };

      setMessages(prev => [...prev, aiMessage]);
      setLastAiLine(data.ai_response);

      // Auto-speak AI response if voice enabled
      if (autoSpeak && voiceEnabled && isSpeechSynthesisSupported) {
        speak(data.ai_response);
      }

      // Update session and next line for user
      setSession({
        ...session,
        completion_percentage: data.completion_percentage,
        total_lines_delivered: session.total_lines_delivered + 1
      });
      setCurrentLineForUser(data.next_line_preview ?? null);
      setAutoListenLineKey(null);

      // Check if scene complete
      if (data.session_status === 'completed') {
        setCurrentLineForUser(null);
        await loadFeedback();
        setShowFeedback(true);
      }
      
      // Clear any previous errors
      setError(null);
    } catch (error: any) {
      console.error('Error delivering line:', error);
      
      // Show user-friendly error message
      let errorMessage = 'Failed to connect to the server. Please make sure the backend is running.';
      
      if (error?.message) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Unable to connect to the server. Please check that the backend is running on http://localhost:8000';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      
      // Remove the user message from the UI since the request failed
      setMessages(prev => prev.slice(0, -1));
      // Restore the input so user can try again
      setUserInput(inputToSend);
    } finally {
      setIsProcessing(false);
    }
  };

  const loadFeedback = async () => {
    if (!session) return;

    try {
      const response = await api.get(`/api/scenes/rehearse/${session.id}/feedback`);
      setSessionFeedback(response.data);
    } catch (error) {
      console.error('Error loading feedback:', error);
    }
  };

  const handleRetry = () => {
    setUserInput('');
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          {error ? (
            <>
              <p className="text-muted-foreground text-sm">{error}</p>
              <Button variant="outline" onClick={() => router.push('/my-scripts')}>
                Go to My Scripts
              </Button>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary mx-auto" />
              <p className="text-muted-foreground text-sm">Preparing your rehearsal session...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Focus mode: script-only stage, no header, no text input
  if (focusMode && !showFeedback) {
    const showCountdown = countdown !== null;
    const orderedLines = sceneWithLines?.lines?.slice().sort((a, b) => a.line_order - b.line_order) ?? [];
    const currentLineMatchId = (() => {
      if (lastAiLine != null) {
        const ai = orderedLines.find(
          (l) => l.character_name === session.ai_character && l.text === lastAiLine
        );
        return ai?.id ?? null;
      }
      if (currentLineForUser != null) {
        const user = orderedLines.find(
          (l) => l.character_name === session.user_character && l.text === currentLineForUser
        );
        return user?.id ?? null;
      }
      return null;
    })();
    const isCurrentLine = (line: SceneLineRow) => line.id === currentLineMatchId;
    const isUserTurn = currentLineForUser != null && lastAiLine == null;

    return (
      <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col z-[10050]">
        {!focusInitialized && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950">
            <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {showCountdown && (
          <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 z-30">
            <motion.span
              key={countdown}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-8xl font-bold text-neutral-100"
            >
              {countdown === 0 ? 'Go' : countdown}
            </motion.span>
          </div>
        )}

        {/* Script page: traditional script look, all lines visible */}
        <div className="flex-1 overflow-auto flex justify-center px-4 py-6">
          <div
            className="w-full max-w-2xl bg-[#f4ecd8] text-neutral-900 rounded-sm shadow-2xl border border-amber-200/50"
            style={{ fontFamily: 'Courier, \"Courier New\", monospace' }}
          >
            <div className="px-10 py-8 sm:px-14 sm:py-10">
              {sceneWithLines ? (
                <>
                  <div className="text-center mb-8">
                    <h1 className="text-lg font-bold uppercase tracking-wider text-neutral-800">
                      {sceneWithLines.title}
                    </h1>
                    <p className="text-sm text-neutral-600 mt-1">
                      {sceneWithLines.play_title}
                      {sceneWithLines.play_author && ` by ${sceneWithLines.play_author}`}
                    </p>
                  </div>
                  <div className="space-y-4">
                    {orderedLines.map((line) => {
                      const current = isCurrentLine(line);
                      const isUser = line.character_name === session.user_character;
                      return (
                        <div
                          key={line.id}
                          ref={current ? currentLineRef : undefined}
                          className={current
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-[#f4ecd8] bg-amber-100/80 -m-1 p-3 rounded'
                            : 'opacity-90'
                          }
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            {current && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wider ${
                                  isUser ? 'bg-primary/15 text-primary' : 'bg-amber-200 text-amber-900'
                                }`}
                              >
                                {isUser ? 'YOUR LINE' : 'AI LINE'}
                              </span>
                            )}
                            <p className="text-xs font-bold uppercase tracking-widest text-neutral-700">
                              {line.character_name}
                              {line.stage_direction && (
                                <span className="normal-case tracking-normal font-normal italic text-neutral-600">
                                  {' '}[{line.stage_direction}]
                                </span>
                              )}
                            </p>
                          </div>
                          <p className="text-[15px] leading-relaxed pl-0">
                            {line.text}
                          </p>
                          {current && isSpeaking && !isUser && (
                            <p className="text-xs text-amber-800 mt-1 flex items-center gap-1">
                              <Volume2 className="h-3 w-3" />
                              AI speaking…
                            </p>
                          )}
                          {current && isListening && isUser && (
                            <p className="text-xs text-primary mt-1 flex items-center gap-1">
                              <Mic className="h-3 w-3" />
                              Listening for your delivery…
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-neutral-600 text-sm">Loading script…</p>
              )}
            </div>
          </div>
        </div>

        {/* Voice-only control strip */}
        <div className="shrink-0 border-t border-neutral-800 bg-neutral-950/98 px-4 py-3 safe-area-bottom">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="text-xs text-neutral-300">
              {isSpeaking
                ? 'AI speaking'
                : isListening
                ? 'Listening for your line'
                : isUserTurn
                ? 'Your turn'
                : 'AI turn'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-700 text-neutral-200 min-h-[44px] sm:min-h-0"
                onClick={() => router.push(`/scenes/${sceneId}`)}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-700 text-neutral-200 min-h-[44px] sm:min-h-0"
                onClick={() => router.push(`/scenes/${sceneId}`)}
              >
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-700 text-neutral-200 min-h-[44px] sm:min-h-0"
                onClick={() => router.push(`/my-scripts`)}
              >
                Edit script
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-700 text-neutral-200 min-h-[44px] sm:min-h-0"
                onClick={() => setVoiceEnabled((v) => !v)}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4 mr-1" /> : <VolumeX className="h-4 w-4 mr-1" />}
                {voiceEnabled ? 'Voice on' : 'Voice off'}
              </Button>
              {isSpeechRecognitionSupported && (
                <Button
                  variant={isListening ? 'destructive' : 'outline'}
                  size="sm"
                  className="border-neutral-700 text-neutral-200 min-h-[44px] sm:min-h-0"
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessing || isSpeaking || !isUserTurn}
                >
                  {isListening ? <MicOff className="h-4 w-4 mr-1" /> : <Mic className="h-4 w-4 mr-1" />}
                  {isListening ? 'Stop' : 'Listen'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-700 text-neutral-200 min-h-[44px] sm:min-h-0"
                onClick={() => {
                  setError(null);
                  resetTranscript();
                  if (isListening) stopListening();
                  if (isSpeechRecognitionSupported && isUserTurn && !isSpeaking && !isProcessing) {
                    startListening();
                  }
                }}
                disabled={!isUserTurn || isProcessing}
              >
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-neutral-400 hover:text-neutral-100 min-h-[44px] sm:min-h-0"
                onClick={() => setFocusMode(false)}
              >
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </div>
          </div>
          {error && (
            <p className="max-w-2xl mx-auto text-xs text-red-400 mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <Button
            variant="ghost"
            onClick={() => router.push(`/scenes/${sceneId}`)}
            className="hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Scene
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFocusMode(true)}>
            Focus mode
          </Button>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Rehearsal settings
            </CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label className="text-xs">Pause between lines (sec)</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={rehearsalSettings.pauseBetweenLinesSeconds}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0));
                    setRehearsalSettings({ pauseBetweenLinesSeconds: v });
                    setRehearsalSettingsState((s) => ({ ...s, pauseBetweenLinesSeconds: v }));
                  }}
                  className="mt-1 h-8"
                />
              </div>
              <div>
                <Label className="text-xs">Countdown before scene (sec)</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={rehearsalSettings.countdownSeconds}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0));
                    setRehearsalSettings({ countdownSeconds: v });
                    setRehearsalSettingsState((s) => ({ ...s, countdownSeconds: v }));
                  }}
                  className="mt-1 h-8"
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="skip-silent"
                  checked={rehearsalSettings.skipMyLineIfSilent}
                  onChange={(e) => {
                    const v = (e.target as HTMLInputElement).checked;
                    setRehearsalSettings({ skipMyLineIfSilent: v });
                    setRehearsalSettingsState((s) => ({ ...s, skipMyLineIfSilent: v }));
                  }}
                />
                <Label htmlFor="skip-silent" className="text-xs cursor-pointer">
                  Skip my line if I stay silent
                </Label>
              </div>
              {rehearsalSettings.skipMyLineIfSilent && (
                <div>
                  <Label className="text-xs">Skip after (sec)</Label>
                  <Input
                    type="number"
                    min={3}
                    max={60}
                    value={rehearsalSettings.skipAfterSeconds}
                    onChange={(e) => {
                      const v = Math.max(3, Math.min(60, parseInt(e.target.value, 10) || 10));
                      setRehearsalSettings({ skipAfterSeconds: v });
                      setRehearsalSettingsState((s) => ({ ...s, skipAfterSeconds: v }));
                    }}
                    className="mt-1 h-8"
                  />
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span>Scene Rehearsal</span>
                  <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                    <Sparkles className="h-3 w-3" />
                    On Stage
                  </Badge>
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;re playing <span className="font-medium">{session.user_character}</span> opposite{' '}
                  <span className="font-medium">{session.ai_character}</span>.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className="text-xs text-muted-foreground">Progress</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {Math.round(session.completion_percentage)}%
                  </span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${session.completion_percentage}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <User className="h-3 w-3" />
                <span>Your line as {session.user_character}</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="h-3 w-3" />
                <span>AI scene partner replies as {session.ai_character}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Messages */}
            <div className="space-y-4 min-h-[320px] max-h-[480px] overflow-y-auto pr-1">
              <AnimatePresence>
                {messages.map((message, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.25 }}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] ${message.type === 'system' ? 'w-full' : ''}`}>
                      {message.type === 'system' ? (
                        <div className="text-center py-3">
                          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <p className="text-xs text-muted-foreground">{message.content}</p>
                          </div>
                        </div>
                      ) : (
                        <div className={`relative ${message.type === 'user' ? 'ml-10' : 'mr-10'}`}>
                          {/* Character Icon */}
                          <div
                            className={`absolute top-0 ${
                              message.type === 'user' ? '-right-10' : '-left-10'
                            }`}
                          >
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                message.type === 'user'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {message.type === 'user' ? (
                                <User className="h-4 w-4" />
                              ) : (
                                <Bot className="h-4 w-4" />
                              )}
                            </div>
                          </div>

                          {/* Message Bubble */}
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                              message.type === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            <div className="mb-1 text-xs font-semibold opacity-80">
                              {message.character}
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>

                            {message.feedback && (
                              <div className="mt-3 border-t border-border/40 pt-2">
                                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <Sparkles className="mt-0.5 h-3 w-3 text-primary" />
                                  <p className="italic">{message.feedback}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {!showFeedback && (
              <div className="space-y-3 border-t border-border pt-4">
                {/* Error Message */}
                {error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-destructive">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="mt-1 text-[11px] text-destructive/80 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {currentLineForUser && (
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Your line</p>
                    <p className="text-sm">{currentLineForUser}</p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3" />
                    <span>{session.user_character}</span>
                  </div>

                  {/* Voice Controls */}
                  <div className="flex items-center gap-2">
                    {isSpeechRecognitionSupported && (
                      <span className="flex items-center gap-1">
                        <Mic className="h-3 w-3" />
                        <span>Voice input</span>
                      </span>
                    )}
                    {isSpeaking && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 animate-pulse">
                        <Volume2 className="h-3 w-3" />
                        AI speaking
                      </span>
                    )}
                    {isListening && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 animate-pulse">
                        <Mic className="h-3 w-3" />
                        Listening…
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7"
                      onClick={() => setAutoSpeak(!autoSpeak)}
                      title={autoSpeak ? 'Disable AI voice' : 'Enable AI voice'}
                    >
                      {autoSpeak ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={isListening ? transcript : userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isListening && handleDeliverLine()}
                    placeholder={isListening ? 'Listening…' : 'Speak your next line'}
                    disabled={isProcessing || isListening}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  {/* Voice Input Button */}
                  {isSpeechRecognitionSupported && (
                    <Button
                      type="button"
                      variant={isListening ? 'destructive' : 'outline'}
                      size="icon"
                      className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-9 sm:w-9"
                      onClick={isListening ? stopListening : startListening}
                      disabled={isProcessing || isSpeaking}
                      title={isListening ? 'Stop recording' : 'Record voice'}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-9 sm:w-9"
                    onClick={handleRetry}
                    title="Clear input"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleDeliverLine()}
                    disabled={!userInput.trim() || isProcessing}
                    className="gap-2 min-h-[44px] sm:min-h-0"
                  >
                    {isProcessing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-primary-foreground" />
                        <span className="text-sm">Processing</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span className="text-sm">Deliver</span>
                      </>
                    )}
                  </Button>
                </div>

                {isSpeechRecognitionSupported && (
                  <p className="text-[11px] text-muted-foreground">
                    Use the mic to speak your line.
                  </p>
                )}
              </div>
            )}

            {/* Feedback */}
            {showFeedback && sessionFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-4 rounded-lg border border-border bg-muted/60 p-4"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  <div>
                    <h2 className="text-base font-semibold">Scene complete!</h2>
                    <p className="text-xs text-muted-foreground">
                      Here&apos;s your performance feedback.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="rounded-lg bg-background/60 p-3">
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Overall assessment
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {sessionFeedback.overall_feedback}
                    </p>
                  </div>

                  {sessionFeedback.strengths && sessionFeedback.strengths.length > 0 && (
                    <div className="rounded-lg bg-background/60 p-3">
                      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                        <Check className="h-4 w-4 text-emerald-500" />
                        What you did well
                      </h3>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {sessionFeedback.strengths.map((strength: string, index: number) => (
                          <li key={index} className="flex gap-2">
                            <span>•</span>
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sessionFeedback.areas_to_improve &&
                    sessionFeedback.areas_to_improve.length > 0 && (
                      <div className="rounded-lg bg-background/60 p-3">
                        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Growth opportunities
                        </h3>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {sessionFeedback.areas_to_improve.map(
                            (area: string, index: number) => (
                              <li key={index} className="flex gap-2">
                                <span>•</span>
                                <span>{area}</span>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                </div>

                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push(`/scenes/${sceneId}`)}
                  >
                    Back to scene
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => router.push('/scenes')}
                  >
                    Browse more scenes
                  </Button>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
