/**
 * useAudio — manages microphone capture (16 kHz PCM) and audio playback (24 kHz PCM).
 *
 * Uses an AudioWorklet for microphone capture and scheduled AudioBufferSource
 * nodes for reliable streaming playback across Chrome and Safari.
 */

import { useCallback, useRef, useState } from "react";

export function useAudio() {
  const [isRecording, setIsRecording] = useState(false);

  // Recorder refs
  const recorderCtxRef = useRef<AudioContext | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const recorderGainRef = useRef<GainNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Player refs
  const playerCtxRef = useRef<AudioContext | null>(null);
  const playerSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playerNextStartRef = useRef(0);

  // ── Start Microphone Recording ───────────────────────────────────────────

  const startRecording = useCallback(
    async (onAudioData: (pcm: ArrayBuffer) => void) => {
      if (isRecording) return;

      // Create AudioContext at 16 kHz (Live API input requirement)
      const ctx = new AudioContext({ sampleRate: 16000 });
      recorderCtxRef.current = ctx;

      // Register the PCM recorder worklet
      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          constructor() { super(); }
          process(inputs, outputs, params) {
            if (inputs.length > 0 && inputs[0].length > 0) {
              const copy = new Float32Array(inputs[0][0]);
              this.port.postMessage(copy);
            }
            return true;
          }
        }
        registerProcessor("pcm-recorder-processor", PCMProcessor);
      `;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-recorder-processor");
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      recorderNodeRef.current = node;
      recorderGainRef.current = silentGain;

      source.connect(node);
      // Keep the worklet in the browser's active render graph. A dangling
      // AudioWorkletNode may never be pulled, which yields zero mic chunks.
      node.connect(silentGain);
      silentGain.connect(ctx.destination);

      node.port.onmessage = (event: MessageEvent) => {
        const float32: Float32Array = event.data;
        // Convert Float32 [-1.0, 1.0] → Int16
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          pcm16[i] = float32[i] * 0x7fff;
        }
        onAudioData(pcm16.buffer);
      };

      setIsRecording(true);
    },
    [isRecording]
  );

  // ── Stop Recording ───────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    recorderNodeRef.current?.disconnect();
    recorderNodeRef.current = null;
    recorderGainRef.current?.disconnect();
    recorderGainRef.current = null;
    recorderCtxRef.current?.close();
    recorderCtxRef.current = null;
    setIsRecording(false);
  }, []);

  // ── Initialise Audio Player ──────────────────────────────────────────────

  const initPlayer = useCallback(async () => {
    if (playerCtxRef.current) {
      if (playerCtxRef.current.state === "suspended") {
        // This may be called outside a user gesture; Ctrl-down retries through
        // resumeContexts(). A blocked resume must not prevent WS connection.
        await playerCtxRef.current.resume().catch(() => undefined);
      }
      return;
    }

    // Create AudioContext at 24 kHz (Live API output requirement)
    const ctx = new AudioContext({ sampleRate: 24000 });
    playerCtxRef.current = ctx;

    playerNextStartRef.current = ctx.currentTime;
  }, []);

  // Browser autoplay policies can leave contexts created from an async effect
  // suspended. Call this directly from a keyboard/click handler to unlock both
  // Clicky's microphone processing and speaker output.
  const resumeContexts = useCallback(() => {
    if (recorderCtxRef.current?.state === "suspended") {
      void recorderCtxRef.current.resume();
    }
    if (playerCtxRef.current?.state === "suspended") {
      void playerCtxRef.current.resume();
    }
  }, []);

  // ── Play PCM audio chunk ─────────────────────────────────────────────────

  const playAudioChunk = useCallback((pcmArrayBuffer: ArrayBuffer) => {
    const ctx = playerCtxRef.current;
    if (!ctx || pcmArrayBuffer.byteLength < 2) return;

    // Best effort for browsers that briefly suspend an already-unlocked
    // context when the tab loses focus.
    if (ctx.state === "suspended") void ctx.resume();

    const pcm = new Int16Array(pcmArrayBuffer);
    const audioBuffer = ctx.createBuffer(1, pcm.length, 24_000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    playerSourcesRef.current.add(source);
    source.onended = () => {
      playerSourcesRef.current.delete(source);
      source.disconnect();
    };

    // Schedule chunks back-to-back. A small initial lead avoids underruns
    // without adding perceptible latency.
    const startAt = Math.max(playerNextStartRef.current, ctx.currentTime + 0.025);
    source.start(startAt);
    playerNextStartRef.current = startAt + audioBuffer.duration;
  }, []);

  // ── Clear audio buffer (on interruption) ─────────────────────────────────

  const clearPlayback = useCallback(() => {
    for (const source of playerSourcesRef.current) {
      try {
        source.stop();
      } catch {}
    }
    playerSourcesRef.current.clear();
    playerNextStartRef.current = playerCtxRef.current?.currentTime ?? 0;
  }, []);

  const getPlaybackState = useCallback(
    () => playerCtxRef.current?.state ?? "uninitialized",
    [],
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    stopRecording();
    clearPlayback();
    playerCtxRef.current?.close();
    playerCtxRef.current = null;
  }, [clearPlayback, stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    initPlayer,
    resumeContexts,
    playAudioChunk,
    clearPlayback,
    getPlaybackState,
    cleanup,
  };
}
