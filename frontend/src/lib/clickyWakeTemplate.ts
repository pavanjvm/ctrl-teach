export type WakeTemplate = {
  version: 1;
  createdAt: number;
  vectors: number[][];
};

const STORAGE_KEY = "ctrlteach_clicky_wake_template_v1";
const VECTOR_SIZE = 96;

function normalizeVector(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const centered = values.map((value) => value - mean);
  const norm = Math.hypot(...centered) || 1;
  return centered.map((value) => value / norm);
}

function trimSilence(samples: Float32Array) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  const threshold = Math.max(0.018, max * 0.16);
  let start = 0;
  let end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end]) < threshold) end--;
  const pad = Math.floor(samples.length * 0.035);
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

export function extractWakeVector(samples: Float32Array, sampleRate: number) {
  const trimmed = trimSilence(samples);
  if (trimmed.length < sampleRate * 0.16) return null;

  const envelopeBins = 48;
  const zcrBins = 24;
  const slopeBins = 24;
  const envelope: number[] = [];
  for (let bin = 0; bin < envelopeBins; bin++) {
    const start = Math.floor((bin / envelopeBins) * trimmed.length);
    const end = Math.max(start + 1, Math.floor(((bin + 1) / envelopeBins) * trimmed.length));
    let sum = 0;
    for (let i = start; i < end; i++) sum += trimmed[i] * trimmed[i];
    envelope.push(Math.sqrt(sum / (end - start)));
  }

  const zcr: number[] = [];
  for (let bin = 0; bin < zcrBins; bin++) {
    const start = Math.floor((bin / zcrBins) * trimmed.length);
    const end = Math.max(start + 1, Math.floor(((bin + 1) / zcrBins) * trimmed.length));
    let crossings = 0;
    for (let i = start + 1; i < end; i++) {
      if ((trimmed[i - 1] >= 0 && trimmed[i] < 0) || (trimmed[i - 1] < 0 && trimmed[i] >= 0)) crossings++;
    }
    zcr.push(crossings / Math.max(1, end - start));
  }

  const slopes: number[] = [];
  for (let bin = 0; bin < slopeBins; bin++) {
    const sourceIndex = Math.min(envelope.length - 2, Math.floor((bin / slopeBins) * (envelope.length - 1)));
    slopes.push(envelope[sourceIndex + 1] - envelope[sourceIndex]);
  }

  const vector = normalizeVector([...envelope, ...zcr, ...slopes]);
  return vector.length === VECTOR_SIZE ? vector : null;
}

export function cosineSimilarity(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    an += a[i] * a[i];
    bn += b[i] * b[i];
  }
  return dot / ((Math.sqrt(an) * Math.sqrt(bn)) || 1);
}

export function bestWakeSimilarity(vector: number[], template: WakeTemplate | null) {
  if (!template?.vectors.length) return 0;
  return Math.max(...template.vectors.map((stored) => cosineSimilarity(vector, stored)));
}

export function loadWakeTemplate(): WakeTemplate | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WakeTemplate;
    if (parsed.version !== 1 || !Array.isArray(parsed.vectors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWakeTemplate(vectors: number[][]) {
  const template: WakeTemplate = { version: 1, createdAt: Date.now(), vectors: vectors.slice(-10) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(template));
  return template;
}

export function clearWakeTemplate() {
  localStorage.removeItem(STORAGE_KEY);
}
