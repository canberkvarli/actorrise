'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import {
  ArrowLeft,
  Send,
  RotateCcw,
  Sparkles,
  User,
  Bot,
  Check,
  Trophy,
  Star
} from 'lucide-react';

interface RehearsalSession {
  id: number;
  scene_id: number;
  user_character: string;
  ai_character: string;
  status: string;
  current_line_index: number;
  total_lines_delivered: number;
  completion_percentage: float;
}

interface Message {
  type: 'user' | 'ai' | 'system';
  character: string;
  content: string;
  feedback?: string;
}

export default function RehearsalPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sceneId = params.id as string;
  const sessionId = searchParams.get('session');

  const [session, setSession] = useState<RehearsalSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionId) {
      loadSession();
    }
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSession = async () => {
    // For now, just create a mock session
    // In production, this would fetch the actual session
    setSession({
      id: parseInt(sessionId!),
      scene_id: parseInt(sceneId),
      user_character: 'Character 1',
      ai_character: 'Character 2',
      status: 'in_progress',
      current_line_index: 0,
      total_lines_delivered: 0,
      completion_percentage: 0
    });

    // Add welcome message
    setMessages([{
      type: 'system',
      character: 'Director',
      content: `Welcome to rehearsal! You're playing Character 1. I'll be your scene partner as Character 2. Ready when you are!`
    }]);
  };

  const handleDeliverLine = async () => {
    if (!userInput.trim() || isProcessing || !session) return;

    const userMessage: Message = {
      type: 'user',
      character: session.user_character,
      content: userInput
    };

    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsProcessing(true);

    try {
      const response = await api.post('/api/scenes/rehearse/deliver', {
        session_id: session.id,
        user_input: userInput,
        request_feedback: false,
        request_retry: false
      });

      // Add AI response
      const aiMessage: Message = {
        type: 'ai',
        character: session.ai_character,
        content: response.data.ai_response,
        feedback: response.data.feedback
      };

      setMessages(prev => [...prev, aiMessage]);

      // Update session
      setSession({
        ...session,
        completion_percentage: response.data.completion_percentage,
        total_lines_delivered: session.total_lines_delivered + 1
      });

      // Check if scene complete
      if (response.data.session_status === 'completed') {
        await loadFeedback();
        setShowFeedback(true);
      }
    } catch (error) {
      console.error('Error delivering line:', error);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-400 mx-auto mb-4" />
          <p>Preparing the stage...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Theater Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push(`/scenes/${sceneId}`)}
              className="flex items-center gap-2 text-purple-200 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
              Exit Rehearsal
            </button>

            <div className="flex items-center gap-4">
              <div className="text-sm text-purple-200">
                Progress: {Math.round(session.completion_percentage)}%
              </div>
              <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${session.completion_percentage}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Curtain Effect */}
        <div className="mb-8 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
          <div className="flex items-center gap-2 text-purple-300">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium">ON STAGE</span>
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
        </div>

        {/* Messages */}
        <div className="space-y-6 mb-8 min-h-[500px] max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${message.type === 'system' ? 'w-full' : ''}`}>
                  {message.type === 'system' ? (
                    <div className="text-center py-4">
                      <div className="inline-block bg-white/10 backdrop-blur px-6 py-3 rounded-full border border-white/20">
                        <p className="text-purple-200 text-sm">{message.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className={`relative ${message.type === 'user' ? 'ml-12' : 'mr-12'}`}>
                      {/* Character Icon */}
                      <div className={`absolute top-0 ${message.type === 'user' ? '-right-12' : '-left-12'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          message.type === 'user'
                            ? 'bg-gradient-to-br from-purple-500 to-pink-500'
                            : 'bg-gradient-to-br from-indigo-500 to-blue-500'
                        }`}>
                          {message.type === 'user' ? (
                            <User className="w-5 h-5" />
                          ) : (
                            <Bot className="w-5 h-5" />
                          )}
                        </div>
                      </div>

                      {/* Message Bubble */}
                      <div className={`rounded-2xl p-6 ${
                        message.type === 'user'
                          ? 'bg-gradient-to-br from-purple-600 to-pink-600'
                          : 'bg-gradient-to-br from-indigo-600 to-blue-600'
                      }`}>
                        <div className="font-bold mb-2 text-sm opacity-90">
                          {message.character}
                        </div>
                        <p className="leading-relaxed">{message.content}</p>

                        {message.feedback && (
                          <div className="mt-4 pt-4 border-t border-white/20">
                            <div className="flex items-start gap-2 text-sm text-purple-100">
                              <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
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
          <div className="sticky bottom-4 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2 text-purple-300 text-sm">
                <User className="w-4 h-4" />
                <span>{session.user_character}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleDeliverLine()}
                placeholder="Type your line here..."
                disabled={isProcessing}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
              />

              <button
                onClick={handleRetry}
                className="px-4 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition"
                title="Clear input"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                onClick={handleDeliverLine}
                disabled={!userInput.trim() || isProcessing}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Deliver
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-purple-300 mt-2">
              Press Enter to deliver your line
            </p>
          </div>
        )}

        {/* Feedback Modal */}
        {showFeedback && sessionFeedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-8 text-white shadow-2xl"
          >
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-4">
                <Trophy className="w-10 h-10 text-yellow-300" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Scene Complete!</h2>
              <p className="text-purple-100">Here's your performance feedback</p>
            </div>

            <div className="space-y-6">
              {/* Overall Feedback */}
              <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-300" />
                  Overall Assessment
                </h3>
                <p className="text-purple-50 leading-relaxed">{sessionFeedback.overall_feedback}</p>
              </div>

              {/* Strengths */}
              {sessionFeedback.strengths && sessionFeedback.strengths.length > 0 && (
                <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-300" />
                    What You Did Well
                  </h3>
                  <ul className="space-y-2">
                    {sessionFeedback.strengths.map((strength: string, index: number) => (
                      <li key={index} className="flex items-start gap-2 text-purple-50">
                        <span className="text-green-300">•</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Areas to Improve */}
              {sessionFeedback.areas_to_improve && sessionFeedback.areas_to_improve.length > 0 && (
                <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                    Growth Opportunities
                  </h3>
                  <ul className="space-y-2">
                    {sessionFeedback.areas_to_improve.map((area: string, index: number) => (
                      <li key={index} className="flex items-start gap-2 text-purple-50">
                        <span className="text-yellow-300">•</span>
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => router.push(`/scenes/${sceneId}`)}
                className="flex-1 px-6 py-4 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition"
              >
                Back to Scene
              </button>
              <button
                onClick={() => router.push('/scenes')}
                className="flex-1 px-6 py-4 bg-white hover:bg-gray-100 text-purple-900 rounded-xl font-bold transition"
              >
                Browse More Scenes
              </button>
            </div>
          </motion.div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(147, 51, 234, 0.5);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(147, 51, 234, 0.7);
        }
      `}</style>
    </div>
  );
}
