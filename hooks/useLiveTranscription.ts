'use client';

/**
 * One live transcription session, open for a whole rehearsal.
 *
 * The batch design this replaces opened a recorder per line, closed it, posted
 * the file and waited. Three of those four steps happen after the actor has
 * finished speaking, which is why the app could never highlight a word while
 * it was being said and why the handover always landed a beat late.
 *
 * Here the session is opened ONCE, when the scene loads, and stays up. The
 * browser streams microphone audio straight to OpenAI over WebRTC — the audio
 * never passes through our server — and transcript deltas come back down a
 * data channel while the actor is still talking. Per line there is no setup at
 * all: `beginTurn` enables a track that is already connected, which is what
 * "warmed up" actually means. No upload, no round trip, nothing to wait for.
 *
 * The microphone track is DISABLED except on the actor's own turn. That halves
 * the bill, since the session is charged by the minute of audio sent, and more
 * importantly it stops the session hearing our own synthesised partner through
 * the speakers and matching it against the actor's next speech.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

/**
 * How long the transcript may gain no new words before the actor counts as
 * stopped.
 *
 * This is the one timer left of the seven, and it is the only one that was
 * ever measuring the right thing. The others asked the microphone whether
 * sound was arriving, which a fan answers yes to; this asks the transcriber
 * whether WORDS are arriving, which only the actor can.
 *
 * It is also not in the fast path. An actor who reads to the end of their
 * line never waits on it — the scene moves on the final word. This only
 * catches a speech that trailed off or was misheard at the tail.
 */
export const QUIET_AFTER_WORDS_MS = 1400;

/** Where the session is. Every state the UI might need to distinguish. */
export type LiveStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface LiveTranscription {
  status: LiveStatus;
  /** Why it failed, for the one line the page shows. Null when fine. */
  error: string | null;
  /** The current turn's transcript, growing. Empty between turns. */
  transcript: string;
  /** The transcript has gained no new words for `QUIET_AFTER_WORDS_MS`. */
  turnEnded: boolean;
  /** Is the microphone live right now? */
  listening: boolean;

  /** Open the session. Safe to call more than once; later calls are no-ops. */
  open: () => Promise<void>;
  /** The actor's turn starts: clear the transcript and enable the microphone. */
  beginTurn: (hint?: TurnHint) => void;
  /** The actor's turn ends: disable the microphone. */
  endTurn: () => void;
  /** Tear the session down. */
  close: () => void;
}

export interface TurnHint {
  /** Literal terms in the coming speech — names, period diction. */
  keywords?: string[];
}

interface OpenOptions {
  /** What the recording is, in a sentence. Setting, not script. */
  prompt?: string;
  /** Proper nouns for the whole scene. Re-pointed per turn by `beginTurn`. */
  keywords?: string[];
}

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

export function useLiveTranscription(options: OpenOptions = {}): LiveTranscription {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [turnEnded, setTurnEnded] = useState(false);
  const [listening, setListening] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const quietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingRef = useRef<Promise<void> | null>(null);

  /* The turn's transcript, as a ref as well as state.
     Deltas arrive faster than React re-renders, so appending to the state
     value loses words — the handler must accumulate somewhere synchronous. */
  const turnTextRef = useRef('');

  /* Deltas that arrive after the turn is over belong to nothing. The model can
     still be finishing a word when the scene has already moved, and without
     this they land on the NEXT line and match it before the actor has opened
     their mouth. */
  const turnOpenRef = useRef(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearQuietTimer = () => {
    if (quietTimerRef.current) {
      clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
  };

  /** Restart the "they have stopped" clock. Called on every delta. */
  const bumpQuietTimer = useCallback(() => {
    clearQuietTimer();
    setTurnEnded(false);
    quietTimerRef.current = setTimeout(() => {
      quietTimerRef.current = null;
      // Only meaningful if something was actually heard. A turn that goes
      // quiet having transcribed nothing is a room, not a performance, and
      // `shouldHandOver` refuses it anyway — but saying so here keeps the flag
      // honest for anything else reading it.
      if (turnTextRef.current.trim()) setTurnEnded(true);
    }, QUIET_AFTER_WORDS_MS);
  }, []);

  const handleEvent = useCallback((raw: string) => {
    let evt: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }

    switch (evt.type) {
      /* A word, while it is being said. The reason all of this exists. */
      case 'conversation.item.input_audio_transcription.delta': {
        if (!turnOpenRef.current || !evt.delta) return;
        turnTextRef.current += evt.delta;
        setTranscript(turnTextRef.current);
        bumpQuietTimer();
        return;
      }

      /* The model's tidied-up version of what it already sent in pieces.
         Preferred when it arrives, because it punctuates and un-mangles — but
         it is never waited for, since by then the actor has usually stopped
         and the scene has usually moved. */
      case 'conversation.item.input_audio_transcription.completed': {
        if (!turnOpenRef.current || !evt.transcript) return;
        turnTextRef.current = evt.transcript;
        setTranscript(evt.transcript);
        bumpQuietTimer();
        return;
      }

      case 'error': {
        setError(evt.error?.message || 'Live transcription error');
        return;
      }

      default:
        return;
    }
  }, [bumpQuietTimer]);

  const open = useCallback(async () => {
    if (pcRef.current) return;
    if (openingRef.current) return openingRef.current;

    const run = (async () => {
      setStatus('connecting');
      setError(null);
      try {
        const { data } = await api.post<{ client_secret: string }>(
          '/api/speech/live-session',
          {
            prompt: optionsRef.current.prompt ?? '',
            keywords: optionsRef.current.keywords ?? [],
          },
        );

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;
        const track = stream.getAudioTracks()[0];
        trackRef.current = track;
        /* Muted from the moment it exists. The session comes up during the
           partner's line as often as not, and a live microphone then hears the
           partner. */
        track.enabled = false;

        const pc = new RTCPeerConnection();
        pc.addTrack(track, stream);

        const dc = pc.createDataChannel('oai-events');
        dc.addEventListener('message', (e: MessageEvent) => handleEvent(e.data));
        dcRef.current = dc;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(CALLS_URL, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${data.client_secret}`,
            'Content-Type': 'application/sdp',
          },
        });
        if (!res.ok) throw new Error(`SDP exchange failed (${res.status})`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });

        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            setStatus('error');
            setError('Live transcription disconnected');
          }
        });

        pcRef.current = pc;
        setStatus('ready');
      } catch (err: unknown) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Could not start live transcription');
        // Leave nothing half-built: a peer connection without a remote
        // description holds the microphone light on for no reason.
        try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* gone */ }
        streamRef.current = null;
        trackRef.current = null;
      } finally {
        openingRef.current = null;
      }
    })();

    openingRef.current = run;
    return run;
  }, [handleEvent]);

  const beginTurn = useCallback((hint?: TurnHint) => {
    turnTextRef.current = '';
    turnOpenRef.current = true;
    setTranscript('');
    setTurnEnded(false);
    clearQuietTimer();

    /* Re-point the transcriber at the words about to be said. The session is
       already open, so this costs one data-channel message and no round trip —
       and it is where most of the accuracy comes from, because we know what
       the actor is about to say and can simply tell it. */
    const dc = dcRef.current;
    if (dc?.readyState === 'open' && hint?.keywords?.length) {
      dc.send(JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              transcription: {
                model: 'gpt-live-transcribe',
                delay: 'low',
                languages: ['en'],
                keywords: hint.keywords
                  .filter(k => k && !/[<>\r\n]/.test(k))
                  .slice(0, 100)
                  .map(k => k.slice(0, 80)),
              },
              turn_detection: null,
            },
          },
        },
      }));
    }

    if (trackRef.current) {
      trackRef.current.enabled = true;
      setListening(true);
    }
  }, []);

  const endTurn = useCallback(() => {
    turnOpenRef.current = false;
    clearQuietTimer();
    setTurnEnded(false);
    if (trackRef.current) {
      trackRef.current.enabled = false;
      setListening(false);
    }
  }, []);

  const close = useCallback(() => {
    clearQuietTimer();
    turnOpenRef.current = false;
    try { dcRef.current?.close(); } catch { /* already gone */ }
    try { pcRef.current?.close(); } catch { /* already gone */ }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* already gone */ }
    dcRef.current = null;
    pcRef.current = null;
    trackRef.current = null;
    streamRef.current = null;
    setListening(false);
    setStatus('idle');
  }, []);

  // The microphone light must not survive the page.
  useEffect(() => close, [close]);

  return {
    status, error, transcript, turnEnded, listening,
    open, beginTurn, endTurn, close,
  };
}
