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
  /** Tell the transcriber what is coming. Sent when the partner starts, so it is ready when the mic opens. */
  prime: (keywords: string[]) => void;
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
  /**
   * The microphone to stream, supplied by the caller.
   *
   * Deliberately not acquired here. The rehearsal already holds a stream for
   * the level meter and for recording the take, and calling getUserMedia a
   * second time on the same device gives the browser two independent capture
   * paths with their own gain control — which is both wasteful and a plausible
   * source of the AGC behaviour that kept the old level gate pinned open. One
   * microphone, one stream, three consumers.
   */
  getStream: () => Promise<MediaStream | null>;
  /**
   * Called synchronously with the turn's transcript on every delta, after the
   * state is set. The rehearsal engine hands over from here, so no React
   * render sits between the last word and the partner's line. Never called
   * with an empty string or outside an open turn. When given, the hook does
   * NOT set `transcript` / `turnEnded` state per delta (the caller renders on
   * its own clock, one frame at a time): read the callback, not the state.
   */
  onTranscript?: (transcript: string) => void;
  /** Called when `turnEnded` goes true, synchronously. */
  onQuiet?: () => void;
}

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

export function useLiveTranscription(options: OpenOptions): LiveTranscription {
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

  /* Late words stay on their line. The turn's transcript is built from the
     transcriber's items (by item_id), in arrival order; `completed` replaces
     only its own item. An item seen in an earlier turn is retired, and any
     delta or completed for it afterwards is dropped, so the tail of one line
     (or its tidied-up `completed`) can never land on the next line when two
     actor lines run back to back. Refs only: no React state in this path. */
  const turnItemsRef = useRef(new Map<string, string>());
  const staleItemsRef = useRef(new Set<string>());
  /** event_ids of our own commits, so a server error about one is not a dropped session. */
  const commitIdsRef = useRef(new Set<string>());

  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** This turn's items become earlier-turn items; an id-less item is never retired (it would block every later one). */
  const retireTurnItems = () => {
    turnItemsRef.current.forEach((_t, id) => { if (id) staleItemsRef.current.add(id); });
    turnItemsRef.current = new Map();
  };

  const clearQuietTimer = () => {
    if (quietTimerRef.current) {
      clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
  };

  /** Restart the "they have stopped" clock. Called on every delta. */
  const bumpQuietTimer = useCallback(() => {
    clearQuietTimer();
    // With a callback the caller renders on its own clock: no state per delta.
    if (!optionsRef.current.onTranscript) setTurnEnded(false);
    quietTimerRef.current = setTimeout(() => {
      quietTimerRef.current = null;
      // Only meaningful if something was actually heard. A turn that goes
      // quiet having transcribed nothing is a room, not a performance, and
      // `shouldHandOver` refuses it anyway — but saying so here keeps the flag
      // honest for anything else reading it.
      if (!turnTextRef.current.trim()) return;
      if (!optionsRef.current.onTranscript) setTurnEnded(true);
      optionsRef.current.onQuiet?.();
    }, QUIET_AFTER_WORDS_MS);
  }, []);

  const handleEvent = useCallback((raw: string) => {
    let evt: { type?: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string; event_id?: string } };
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }

    const id = evt.item_id ?? '';
    const accepts = () => turnOpenRef.current && !staleItemsRef.current.has(id);
    /* Something was heard on the open turn: rebuild its text from its items. */
    const heard = () => {
      turnTextRef.current = [...turnItemsRef.current.values()].join(' ');
      const onTranscript = optionsRef.current.onTranscript;
      if (!onTranscript) setTranscript(turnTextRef.current);
      bumpQuietTimer();
      // Last: a handover here may end this turn and begin the next, and those
      // resets must land after everything above, not before it.
      onTranscript?.(turnTextRef.current);
    };

    switch (evt.type) {
      /* A word, while it is being said. The reason all of this exists. */
      case 'conversation.item.input_audio_transcription.delta': {
        if (!evt.delta || !accepts()) return;
        turnItemsRef.current.set(id, (turnItemsRef.current.get(id) ?? '') + evt.delta);
        heard();
        return;
      }

      /* The model's tidied-up version of what it already sent in pieces.
         Preferred when it arrives, because it punctuates and un-mangles — but
         it is never waited for, since by then the actor has usually stopped
         and the scene has usually moved. */
      case 'conversation.item.input_audio_transcription.completed': {
        if (!evt.transcript || !accepts()) return;
        turnItemsRef.current.set(id, evt.transcript);
        heard();
        return;
      }

      case 'error': {
        // Our own commit refused (an empty buffer, say) is not a broken session.
        if (evt.error?.event_id && commitIdsRef.current.has(evt.error.event_id)) return;
        setError(evt.error?.message || 'Live transcription error');
        // A server error on an open session is the session failing: say so in the status too.
        setStatus(s => (s === 'ready' ? 'error' : s));
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

        const stream = await optionsRef.current.getStream();
        if (!stream) throw new Error('No microphone');
        streamRef.current = stream;
        const track = stream.getAudioTracks()[0];
        if (!track) throw new Error('No microphone track');
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
        /* The stream belongs to the caller, so it is released, not stopped —
           the mic check is still using it. */
        streamRef.current = null;
        trackRef.current = null;
      } finally {
        openingRef.current = null;
      }
    })();

    openingRef.current = run;
    return run;
  }, [handleEvent]);

  /* Re-point the transcriber at the words about to be said. The session is
     already open, so this costs one data-channel message and no round trip —
     and it is where most of the accuracy comes from, because we know what
     the actor is about to say and can simply tell it. */
  const prime = useCallback((keywords: string[]) => {
    const dc = dcRef.current;
    if (dc?.readyState !== 'open' || !keywords.length) return;
    dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: { input: { transcription: {
          model: 'gpt-live-transcribe', delay: 'low', languages: ['en'],
          keywords: keywords.filter(k => k && !/[<>\r\n]/.test(k)).slice(0, 100).map(k => k.slice(0, 80)),
        }, turn_detection: null } },
      },
    }));
  }, []);

  const beginTurn = useCallback((hint?: TurnHint) => {
    retireTurnItems();
    turnTextRef.current = '';
    turnOpenRef.current = true;
    setTranscript('');
    setTurnEnded(false);
    clearQuietTimer();

    if (hint?.keywords?.length) prime(hint.keywords);

    if (trackRef.current) {
      trackRef.current.enabled = true;
      setListening(true);
    }
  }, [prime]);

  const endTurn = useCallback(() => {
    turnOpenRef.current = false;
    clearQuietTimer();
    setTurnEnded(false);
    if (trackRef.current) {
      trackRef.current.enabled = false;
      setListening(false);
    }
    /* Close this turn's item on the server. With `turn_detection: null` the
       server never commits the audio buffer by itself, so without this one
       item could run on across turns and the next line's words would arrive
       under an id already retired (and be dropped). Committing makes the next
       turn's audio a new item with a new id, which is what lets the late tail
       of THIS line be told apart from the next one. Only when something was
       heard: committing an empty buffer is an error. Our event_ids are kept so
       a refusal is not read as the session failing. */
    const dc = dcRef.current;
    if (dc?.readyState === 'open' && [...turnItemsRef.current.values()].some(t => t.trim())) {
      const event_id = `commit_${commitIdsRef.current.size + 1}`;
      commitIdsRef.current.add(event_id);
      try { dc.send(JSON.stringify({ type: 'input_audio_buffer.commit', event_id })); } catch { /* the session is going anyway */ }
    }
    retireTurnItems();
  }, []);

  const close = useCallback(() => {
    clearQuietTimer();
    turnOpenRef.current = false;
    try { dcRef.current?.close(); } catch { /* already gone */ }
    try { pcRef.current?.close(); } catch { /* already gone */ }
    // Not ours to stop; useLiveCapture owns the stream's lifetime.
    dcRef.current = null;
    pcRef.current = null;
    trackRef.current = null;
    streamRef.current = null;
    setListening(false);
    setStatus('idle');
  }, []);

  // The peer connection must not survive the page.
  useEffect(() => close, [close]);

  return {
    status, error, transcript, turnEnded, listening,
    open, prime, beginTurn, endTurn, close,
  };
}
