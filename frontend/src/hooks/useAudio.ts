/**
 * useAudio — manages microphone capture (16 kHz PCM) and audio playback (24 kHz PCM).
 *
 * Uses AudioWorklet processors for low-latency, glitch-free audio processing
 * on separate audio threads (following the bidi-demo pattern).
 */

import { useCallback, useRef, useState } from "react";

export function useAudio() {
  const [isRecording, setIsRecording] = useState(false);

  // Recorder refs
  const recorderCtxRef = useRef<AudioContext | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Player refs
  const playerCtxRef = useRef<AudioContext | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);

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
        audio: { channelCount: 1 },
      });
      micStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-recorder-processor");
      recorderNodeRef.current = node;

      source.connect(node);

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
    recorderCtxRef.current?.close();
    recorderCtxRef.current = null;
    setIsRecording(false);
  }, []);

  // ── Initialise Audio Player ──────────────────────────────────────────────

  const initPlayer = useCallback(async () => {
    if (playerCtxRef.current) return;

    // Create AudioContext at 24 kHz (Live API output requirement)
    const ctx = new AudioContext({ sampleRate: 24000 });
    playerCtxRef.current = ctx;

    // Ring-buffer PCM player worklet
    const workletCode = `
      class PCMPlayerProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferSize = 24000 * 180; // ~3 min ring buffer
          this.buffer = new Float32Array(this.bufferSize);
          this.writeIndex = 0;
          this.readIndex = 0;

          this.port.onmessage = (event) => {
            if (event.data.command === "endOfAudio") {
              this.readIndex = this.writeIndex;
              return;
            }
            const int16 = new Int16Array(event.data);
            for (let i = 0; i < int16.length; i++) {
              this.buffer[this.writeIndex] = int16[i] / 32768;
              this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
              if (this.writeIndex === this.readIndex) {
                this.readIndex = (this.readIndex + 1) % this.bufferSize;
              }
            }
          };
        }

        process(inputs, outputs, params) {
          const output = outputs[0];
          const len = output[0].length;
          for (let i = 0; i < len; i++) {
            output[0][i] = this.buffer[this.readIndex];
            if (output.length > 1) output[1][i] = this.buffer[this.readIndex];
            if (this.readIndex !== this.writeIndex) {
              this.readIndex = (this.readIndex + 1) % this.bufferSize;
            }
          }
          return true;
        }
      }
      registerProcessor("pcm-player-processor", PCMPlayerProcessor);
    `;
    const blob = new Blob([workletCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const node = new AudioWorkletNode(ctx, "pcm-player-processor");
    node.connect(ctx.destination);
    playerNodeRef.current = node;
  }, []);

  // ── Play PCM audio chunk ─────────────────────────────────────────────────

  const playAudioChunk = useCallback((pcmArrayBuffer: ArrayBuffer) => {
    playerNodeRef.current?.port.postMessage(pcmArrayBuffer);
  }, []);

  // ── Clear audio buffer (on interruption) ─────────────────────────────────

  const clearPlayback = useCallback(() => {
    playerNodeRef.current?.port.postMessage({ command: "endOfAudio" });
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    stopRecording();
    playerNodeRef.current?.disconnect();
    playerCtxRef.current?.close();
    playerNodeRef.current = null;
    playerCtxRef.current = null;
  }, [stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    initPlayer,
    playAudioChunk,
    clearPlayback,
    cleanup,
  };
}
