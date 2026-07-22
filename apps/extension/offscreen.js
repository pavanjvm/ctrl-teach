let config = null;
let socket = null;
let reconnectTimer = 0;
let realtimeReady = false;
let pttActive = false;
let currentTurn = null;
let micContext = null;
let micStream = null;
let micNode = null;
let micInitPromise = null;
let playerContext = null;
let playerNextStart = 0;
const playerSources = new Set();
const playbackCompletion = TarsPlaybackGate.createPlaybackCompletionGate(() => {
  void emit({
    type: "TARS_STATUS",
    mode: "idle",
    text: "Tars ready — hold Ctrl to talk",
    delayed: true,
  });
});
const MIN_VOICED_MS = 72;
const MIN_CONTINUOUS_VOICE_MS = 32;
let ambientNoise = { rms: 0.004, flux: 0.0025, peak: 0.012 };
let previousMicSample = 0;
let speechStats = null;

function resetSpeechStats() {
  speechStats = {
    totalSamples: 0,
    voicedSamples: 0,
    currentVoiceSamples: 0,
    maxContinuousVoiceSamples: 0,
    peak: 0,
    noise: { ...ambientNoise },
  };
}

function measureAudioFrame(input) {
  if (!input?.length) return { rms: 0, flux: 0, peak: 0 };
  let sumSquares = 0;
  let differenceSquares = 0;
  let peak = 0;
  let previous = previousMicSample;
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    sumSquares += sample * sample;
    const difference = sample - previous;
    differenceSquares += difference * difference;
    previous = sample;
  }
  previousMicSample = previous;
  return {
    rms: Math.sqrt(sumSquares / input.length),
    flux: Math.sqrt(differenceSquares / input.length),
    peak,
  };
}

function updateAmbientNoise(frame) {
  // Follow quieter changes quickly and louder changes slowly. A steady fan is
  // learned as the floor, while a short voice or keyboard click cannot raise
  // the floor enough to mask subsequent speech.
  const smooth = (current, next) => current + (next - current) * (next < current ? 0.08 : 0.012);
  ambientNoise.rms = smooth(ambientNoise.rms, Math.min(frame.rms, 0.08));
  ambientNoise.flux = smooth(ambientNoise.flux, Math.min(frame.flux, 0.08));
  ambientNoise.peak = smooth(ambientNoise.peak, Math.min(frame.peak, 0.2));
}

function recordSpeechFrame(input, frame) {
  if (!speechStats) resetSpeechStats();
  const rmsThreshold = Math.max(0.007, speechStats.noise.rms * 1.85);
  const fluxThreshold = Math.max(0.0035, speechStats.noise.flux * 1.65);
  const peakThreshold = Math.max(0.022, speechStats.noise.peak * 1.5);
  const speechLike = frame.rms >= rmsThreshold
    && frame.flux >= fluxThreshold
    && frame.peak >= peakThreshold;

  speechStats.totalSamples += input.length;
  speechStats.peak = Math.max(speechStats.peak, frame.peak);
  if (speechLike) {
    speechStats.voicedSamples += input.length;
    speechStats.currentVoiceSamples += input.length;
    speechStats.maxContinuousVoiceSamples = Math.max(
      speechStats.maxContinuousVoiceSamples,
      speechStats.currentVoiceSamples,
    );
  } else {
    speechStats.currentVoiceSamples = 0;
  }
}

function speechAnalysis() {
  const sampleRate = micContext?.sampleRate || 16_000;
  if (!speechStats) return { hasSpeech: false, peak: 0, voicedMs: 0, continuousVoiceMs: 0 };
  const voicedMs = (speechStats.voicedSamples / sampleRate) * 1000;
  const continuousVoiceMs = (speechStats.maxContinuousVoiceSamples / sampleRate) * 1000;
  return {
    hasSpeech: voicedMs >= MIN_VOICED_MS && continuousVoiceMs >= MIN_CONTINUOUS_VOICE_MS,
    peak: speechStats.peak,
    voicedMs,
    continuousVoiceMs,
  };
}

resetSpeechStats();

function emit(event) {
  return chrome.runtime.sendMessage({
    type: "TARS_OFFSCREEN_EVENT",
    event,
  });
}

function clearPlayback() {
  // Reset before stopping sources because AudioBufferSourceNode.onended also
  // runs for an explicit stop. It must not complete an interrupted old turn.
  playbackCompletion.reset();
  for (const source of playerSources) {
    try { source.stop(); } catch {}
  }
  playerSources.clear();
  playerNextStart = playerContext?.currentTime || 0;
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function ensurePlayer() {
  if (!playerContext) playerContext = new AudioContext({ sampleRate: 24_000 });
  if (playerContext.state === "suspended") await playerContext.resume().catch(() => undefined);
}

async function playPcm(base64) {
  // Increment synchronously, before the first await, so a turnComplete event
  // arriving in the same WebSocket message cannot declare playback finished.
  playbackCompletion.beginScheduling();
  let source = null;
  try {
    await ensurePlayer();
    const bytes = base64ToBytes(base64);
    if (bytes.byteLength < 2) {
      playbackCompletion.schedulingFailed();
      return;
    }
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = playerContext.createBuffer(1, pcm.length, 24_000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    source = playerContext.createBufferSource();
    source.buffer = buffer;
    source.connect(playerContext.destination);
    playerSources.add(source);
    source.onended = () => {
      playerSources.delete(source);
      source.disconnect();
      playbackCompletion.sourceEnded();
    };
    const startAt = Math.max(playerNextStart, playerContext.currentTime + 0.025);
    source.start(startAt);
    playerNextStart = startAt + buffer.duration;
    playbackCompletion.sourceScheduled();
    void emit({ type: "TARS_STATUS", mode: "speaking" });
  } catch (error) {
    if (source) {
      playerSources.delete(source);
      try { source.disconnect(); } catch {}
    }
    playbackCompletion.schedulingFailed();
    throw error;
  }
}

async function ensureMic() {
  if (micStream && micContext && micNode) return true;
  if (micInitPromise) return micInitPromise;
  micInitPromise = (async () => {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      micContext = new AudioContext({ sampleRate: 16_000 });
      await micContext.audioWorklet.addModule("pcm-worklet.js");
      const source = micContext.createMediaStreamSource(micStream);
      micNode = new AudioWorkletNode(micContext, "tars-pcm-processor");
      const silent = micContext.createGain();
      silent.gain.value = 0;
      source.connect(micNode);
      micNode.connect(silent);
      silent.connect(micContext.destination);
      micNode.port.onmessage = (event) => {
        const input = event.data;
        const frame = measureAudioFrame(input);
        if (!pttActive || socket?.readyState !== WebSocket.OPEN || !realtimeReady) {
          if (!pttActive) updateAmbientNoise(frame);
          return;
        }
        recordSpeechFrame(input, frame);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const sample = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        socket.send(pcm.buffer);
      };
      await micContext.resume().catch(() => undefined);
      return true;
    } catch (error) {
      console.warn("[Tars] microphone unavailable", error);
      void emit({ type: "TARS_MIC_REQUIRED" });
      return false;
    } finally {
      micInitPromise = null;
    }
  })();
  return micInitPromise;
}

function disconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  realtimeReady = false;
  if (socket) {
    const previous = socket;
    socket = null;
    previous.close(1000, "Tars disabled");
  }
}

function connect() {
  if (!config?.enabled || config.suspended || !config.accessToken || !config.userId || !config.wsUrl) {
    disconnect();
    return;
  }
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  clearTimeout(reconnectTimer);
  const sessionId = crypto.randomUUID();
  const base = String(config.wsUrl).replace(/\/$/, "");
  const protocol = `ctrlteach-tars-auth.${config.accessToken}`;
  socket = new WebSocket(
    `${base}/ws/${encodeURIComponent(config.userId)}/${sessionId}?mode=page&agent=tars`,
    protocol,
  );
  socket.onopen = () => void emit({ type: "TARS_STATUS", mode: "connecting", text: "Tars connecting" });
  socket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    try { handleServerEvent(JSON.parse(event.data)); } catch (error) { console.warn("[Tars] bad server event", error); }
  };
  socket.onclose = (event) => {
    socket = null;
    realtimeReady = false;
    void emit({ type: "TARS_STATUS", mode: "offline", text: event.reason || "Tars disconnected" });
    if (config?.enabled && !config.suspended && event.code !== 1008) {
      reconnectTimer = setTimeout(connect, 1500);
    }
  };
  socket.onerror = () => void emit({ type: "TARS_STATUS", mode: "offline", text: "Tars backend unavailable" });
}

function handleServerEvent(event) {
  if (event.type === "realtime_ready") {
    realtimeReady = true;
    void ensureMic();
    void emit({ type: "TARS_STATUS", mode: "idle", text: "Tars ready — hold Ctrl to talk" });
    return;
  }
  if (event.type === "tars_point") {
    void emit({ type: "TARS_POINT", response: event.response || {} });
    return;
  }
  if (event.type === "tars_draw") {
    void emit({ type: "TARS_DRAW", tool: event.tool, response: event.response || {} });
    return;
  }
  if (event.type === "tars_draw_batch") {
    void emit({ type: "TARS_DRAW_BATCH", tool: event.tool, responses: event.responses || [] });
    return;
  }
  if (event.type === "tars_action") {
    void emit({ type: "TARS_ACTION", response: event.response || {} });
    return;
  }
  if (event.type === "tars_recoverable_error") {
    clearPlayback();
    void emit({
      type: "TARS_STATUS",
      mode: "idle",
      text: event.message || "Tars missed that — hold Ctrl and try again.",
    });
    return;
  }
  if (event.interrupted) {
    clearPlayback();
    // This interruption is requested when a new Ctrl turn begins. The content
    // script already owns the listening/thinking transition, so emitting idle
    // here would erase the waveform or spinner with a stale acknowledgement.
  }
  if (event.outputTranscription?.text) {
    void emit({ type: "TARS_STATUS", mode: "speaking", text: event.outputTranscription.text, append: true });
  }
  for (const part of event.content?.parts || []) {
    if (part.inlineData?.mimeType?.startsWith("audio/pcm") && part.inlineData.data) {
      void playPcm(part.inlineData.data).catch((error) => {
        console.warn("[Tars] audio playback failed", error);
      });
    }
  }
  if (event.turnComplete && !event.interrupted) {
    // Network streaming is complete, but scheduled PCM may still be audible.
    // Keep the transcript visible until the final AudioBufferSourceNode ends.
    playbackCompletion.markTurnComplete();
  }
  if (event.type === "error") {
    void emit({ type: "TARS_STATUS", mode: "offline", text: event.message || "Tars error" });
  }
}

function imageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function createMediaGridCrop(dataUrl, mediaRect) {
  if (!mediaRect || mediaRect.width < 24 || mediaRect.height < 24) return null;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  });
  const sx = Math.max(0, Math.min(image.naturalWidth - 1, mediaRect.x));
  const sy = Math.max(0, Math.min(image.naturalHeight - 1, mediaRect.y));
  const sw = Math.max(1, Math.min(image.naturalWidth - sx, mediaRect.width));
  const sh = Math.max(1, Math.min(image.naturalHeight - sy, mediaRect.height));
  let width = Math.min(1280, Math.max(800, Math.round(sw)));
  let height = Math.max(240, Math.round(width * (sh / sw)));
  if (height > 1000) {
    height = 1000;
    width = Math.max(360, Math.round(height * (sw / sh)));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  // Keep an unmodified high-quality crop for the dedicated Computer Use
  // grounding pass. The gridded copy below remains useful to Realtime for
  // deciding what kind of annotation to request.
  const rawDataUrl = canvas.toDataURL("image/png");

  context.save();
  context.lineWidth = 1;
  context.font = "700 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textBaseline = "top";
  for (let index = 0; index <= 10; index++) {
    const x = (index / 10) * width;
    const y = (index / 10) * height;
    context.strokeStyle = "rgba(34,211,238,.48)";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    if (index < 10) {
      const label = String(index * 100);
      context.lineWidth = 3;
      context.strokeStyle = "rgba(0,0,0,.78)";
      context.fillStyle = "rgba(255,255,255,.96)";
      context.strokeText(label, Math.min(width - 34, x + 3), 3);
      context.fillText(label, Math.min(width - 34, x + 3), 3);
      context.strokeText(label, 3, Math.min(height - 17, y + 3));
      context.fillText(label, 3, Math.min(height - 17, y + 3));
    }
  }
  context.restore();
  const cropDataUrl = canvas.toDataURL("image/jpeg", 0.94);
  return {
    data: cropDataUrl.split(",", 2)[1] || "",
    mimeType: "image/jpeg",
    rawData: rawDataUrl.split(",", 2)[1] || "",
    rawMimeType: "image/png",
    width,
    height,
    coordinateExtent: 1000,
  };
}

async function startPtt(message) {
  const micReady = await ensureMic();
  if (!micReady || !realtimeReady || socket?.readyState !== WebSocket.OPEN) {
    void emit({ type: "TARS_STATUS", mode: "offline", text: "Tars is not ready yet" });
    return;
  }
  await ensurePlayer();
  clearPlayback();
  socket.send(JSON.stringify({ type: "interrupt" }));
  currentTurn = { contextId: message.contextId, tabId: message.tabId };
  resetSpeechStats();
  pttActive = true;
  if (micContext?.state === "suspended") await micContext.resume().catch(() => undefined);
  void emit({ type: "TARS_STATUS", mode: "listening", text: "Tars listening — release Ctrl" });
}

function cancelPtt() {
  pttActive = false;
  currentTurn = null;
  resetSpeechStats();
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "tars_cancel_audio" }));
  void emit({ type: "TARS_STATUS", mode: "idle", text: "Tars ready — hold Ctrl to talk" });
}

function endPtt(message) {
  if (!currentTurn || currentTurn.contextId !== message.contextId) {
    return { hasSpeech: false, peak: 0, voicedMs: 0 };
  }
  pttActive = false;
  const analysis = speechAnalysis();
  if (!analysis.hasSpeech) {
    currentTurn = null;
    resetSpeechStats();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "tars_cancel_audio" }));
    }
    void emit({ type: "TARS_STATUS", mode: "idle", text: "Tars ready — hold Ctrl to talk" });
  }
  return analysis;
}

async function finishPtt(turn) {
  if (!currentTurn || currentTurn.contextId !== turn.contextId) return;
  pttActive = false;
  if (socket?.readyState !== WebSocket.OPEN || !realtimeReady) return;
  const dimensions = await imageDimensions(turn.screenshotDataUrl);
  const viewport = turn.context.viewport || { width: dimensions.width, height: dimensions.height };
  const scaleX = dimensions.width / Math.max(1, viewport.width);
  const scaleY = dimensions.height / Math.max(1, viewport.height);
  const elements = (turn.context.elements || []).map((element) => ({
    ...element,
    rect: {
      x: Math.round(element.rect.x * scaleX),
      y: Math.round(element.rect.y * scaleY),
      width: Math.max(1, Math.round(element.rect.width * scaleX)),
      height: Math.max(1, Math.round(element.rect.height * scaleY)),
    },
  }));
  const sourceMedia = turn.context.media || {};
  const sourceFocusRegion = turn.context.focusRegion || null;
  const ctrlGesture = TarsGroundingGeometry.scaleCtrlGesture(
    turn.context.ctrlGesture,
    scaleX,
    scaleY,
  );
  const scaleRect = (rect) => rect ? {
    x: Math.round(rect.x * scaleX),
    y: Math.round(rect.y * scaleY),
    width: Math.max(1, Math.round(rect.width * scaleX)),
    height: Math.max(1, Math.round(rect.height * scaleY)),
  } : null;
  const actualMediaRect = scaleRect(sourceMedia.rect);
  // Keep the legacy `mediaRect` coordinate mapping for media/canvas surfaces.
  // Static webpage images are grounded against the complete lossless tab
  // screenshot. Do not create a second crop/grid for <img> content: Sol gets
  // the exact same full frame that the Realtime agent used for context.
  const focusCropRect = TarsGroundingGeometry.shouldCropFocusRegion(sourceFocusRegion)
    ? scaleRect(sourceFocusRegion?.rect)
    : null;
  const mediaRect = actualMediaRect || focusCropRect;
  const media = { ...sourceMedia, rect: actualMediaRect };
  const scaledFocusRect = scaleRect(sourceFocusRegion?.rect);
  const focusRegion = scaledFocusRect ? {
    kind: sourceFocusRegion?.kind || "region",
    label: sourceFocusRegion?.label || "non-DOM region",
    rect: scaledFocusRect,
  } : null;
  const mediaCrop = mediaRect
    ? await createMediaGridCrop(turn.screenshotDataUrl, mediaRect).catch((error) => {
      console.warn("[Tars] media crop failed", error);
      return null;
    })
    : null;
  const context = {
    contextId: turn.contextId,
    tabId: turn.tabId,
    screenshotWidth: dimensions.width,
    screenshotHeight: dimensions.height,
    viewport,
    mediaRect,
  };
  await emit({ type: "TARS_CONTEXT_BOUND", context });
  const [header, data = ""] = turn.screenshotDataUrl.split(",", 2);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
  socket.send(JSON.stringify({
    type: "tars_screen",
    contextId: turn.contextId,
    data,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    calibrated: true,
    elements,
    page: turn.context.page || {},
    media,
    focusRegion,
    ctrlGesture,
    mediaCrop,
    tabs: turn.tabs || [],
    intentText: "user just spoke while viewing this active browser tab",
  }));
  socket.send(new Int16Array(1600).buffer);
  socket.send(JSON.stringify({ type: "tars_commit_audio" }));
  currentTurn = null;
  resetSpeechStats();
  void emit({ type: "TARS_STATUS", mode: "thinking", text: "Tars thinking" });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;
  void (async () => {
    let response = { ok: true };
    if (message.type === "TARS_CONFIG") {
      const changedIdentity = config?.accessToken !== message.config?.accessToken || config?.userId !== message.config?.userId;
      if (changedIdentity || !message.config?.enabled || message.config?.suspended) {
        clearPlayback();
        cancelPtt();
      }
      config = message.config;
      if (changedIdentity) disconnect();
      connect();
      if (config?.enabled && !config.suspended) void ensureMic();
    } else if (message.type === "TARS_PTT_START") {
      await startPtt(message);
    } else if (message.type === "TARS_PTT_CANCEL") {
      cancelPtt();
    } else if (message.type === "TARS_PTT_END") {
      response = { ok: true, ...endPtt(message) };
    } else if (message.type === "TARS_PTT_CONTEXT") {
      await finishPtt(message.turn);
    } else if (message.type === "TARS_RETRY_MIC") {
      if (micStream) micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
      micNode = null;
      await ensureMic();
    }
    sendResponse(response);
  })();
  return true;
});
