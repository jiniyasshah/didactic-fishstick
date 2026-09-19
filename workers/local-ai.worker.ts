import type { LocalTask, LocalResult, TimedWord } from '../lib/local-ai';

const report = (text: string) => self.postMessage({ type: 'progress', text });
const MODEL_URL = 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d/htdemucs_embedded.onnx';

async function modelBytes() {
  let cache: Cache | undefined;
  try { cache = await caches.open('verse-local-models-v1'); } catch { /* Storage can be unavailable in private browsing. */ }
  const cached = await cache?.match(MODEL_URL);
  if (cached) { report('Loading saved separation model…'); return cached.arrayBuffer(); }
  report('Downloading separation model · about 172 MB…');
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) throw new Error('Could not download the separation model. Check your connection and retry.');
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0, last = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    chunks.push(value); size += value.length;
    if (Date.now() - last > 300) { report(`Downloading separation model · ${Math.round(size / 1048576)} MB${total ? ` / ${Math.round(total / 1048576)} MB` : ''}`); last = Date.now(); }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { await cache?.put(MODEL_URL, new Response(bytes)); } catch { /* Inference still works when the cache is full. */ }
  return bytes.buffer;
}

async function separate(task: Extract<LocalTask, { kind: 'separate' }>): Promise<LocalResult> {
  const ort = await import('onnxruntime-web/webgpu');
  const { prepareModelInput, standaloneMask, standaloneIspec } = await import('demucs-web');
  // One thread works without cross-origin isolation, including hosted/private previews.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
  const bytes = await modelBytes();
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const useGpu = !!(await gpu?.requestAdapter().catch(() => null));
  report(`Starting separation model · ${useGpu ? 'GPU' : 'CPU'}…`);
  let session: import('onnxruntime-web').InferenceSession;
  try {
    session = await ort.InferenceSession.create(bytes, { executionProviders: useGpu ? ['webgpu', 'wasm'] : ['wasm'], graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false });
  } catch (error) {
    if (!useGpu) throw error;
    report('GPU unavailable for this model. Starting CPU processing…');
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false });
  }
  const length = task.left.length, segment = 343980, stride = Math.floor(segment * .75);
  const vocals = [new Float32Array(length), new Float32Array(length)];
  const instrumental = [new Float32Array(length), new Float32Array(length)];
  const weights = new Float32Array(length);
  // Match Demucs' reference normalization, retaining stereo phase.
  let mean = 0, variance = 0;
  for (let i = 0; i < length; i++) mean += (task.left[i] + task.right[i]) / 2;
  mean /= length;
  for (let i = 0; i < length; i++) variance += ((task.left[i] + task.right[i]) / 2 - mean) ** 2;
  const scale = Math.max(1e-8, Math.sqrt(variance / Math.max(1, length - 1)));
  const segments = Math.max(1, Math.ceil((length - segment) / stride) + 1);
  try {
    for (let part = 0; part < segments; part++) {
      report(`Separating on your device · section ${part + 1} of ${segments}`);
      const start = part * stride, size = Math.min(segment, length - start);
      const left = new Float32Array(segment), right = new Float32Array(segment);
      for (let i = 0; i < size; i++) { left[i] = (task.left[start + i] - mean) / scale; right[i] = (task.right[start + i] - mean) / scale; }
      const input = prepareModelInput(left, right);
      const wave = new ort.Tensor('float32', input.waveform, [1, 2, segment]);
      const spec = new ort.Tensor('float32', input.magSpec, [1, 4, 2048, 336]);
      let outputs: Record<string, import('onnxruntime-web').Tensor> = {};
      try {
        outputs = await session.run({ [session.inputNames[0]]: wave, [session.inputNames[1]]: spec });
        const values = Object.values(outputs);
        const time = values.find(t => t.dims.length === 4 && t.dims[2] === 2);
        const freq = values.find(t => t.dims.length === 5 && t.dims[2] === 4);
        if (!time || !freq) throw new Error('The separation model returned an unsupported result.');
        const spectra = standaloneMask(freq.data as Float32Array), samples = time.dims[3];
        for (let stem = 0; stem < 4; stem++) {
          const reconstructed = standaloneIspec(spectra[stem], segment);
          const target = stem === 3 ? vocals : instrumental;
          for (let c = 0; c < 2; c++) {
            const frequency = c === 0 ? reconstructed.left : reconstructed.right;
            for (let i = 0; i < size; i++) {
              const weight = Math.min(i + 1, size - i, segment / 2) / (segment / 2);
              const sample = ((time.data as Float32Array)[(stem * 2 + c) * samples + i] + frequency[i]) * scale + mean;
              if (!Number.isFinite(sample)) throw new Error('The model produced invalid audio. Try a shorter clip or another browser.');
              target[c][start + i] += sample * weight;
            }
          }
        }
        for (let i = 0; i < size; i++) weights[start + i] += Math.min(i + 1, size - i, segment / 2) / (segment / 2);
      } finally { wave.dispose(); spec.dispose(); Object.values(outputs).forEach(t => t.dispose()); }
    }
    for (let i = 0; i < length; i++) for (let c = 0; c < 2; c++) { vocals[c][i] /= weights[i]; instrumental[c][i] /= weights[i]; }
    return { kind: 'separate', vocals, instrumental };
  } finally { await session.release(); }
}

async function transcribe(task: Extract<LocalTask, { kind: 'transcribe' }>): Promise<LocalResult> {
  let energy = 0;
  for (const sample of task.audio) energy += sample * sample;
  if (Math.sqrt(energy / task.audio.length) < 0.0001) return { kind: 'transcribe', words: [] };
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'huggingface.co') url.searchParams.set('download', 'true');
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, { ...init, credentials: 'omit' });
        if (response.status >= 500 && attempt < 2) continue;
        return response;
      } catch {
        if (attempt >= 2) throw new Error(`Could not download ${url.pathname.split('/').at(-1)} from ${url.hostname}. Check your connection and try again.`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };
  env.backends.onnx.wasm!.numThreads = 1;
  report('Loading speech model · first download about 150 MB…');
  const pipe = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', {
    device: 'wasm', dtype: 'q8', revision: '608c49e61301901684bc36cac8f74b95ff6b5a8e',
    progress_callback: info => { if (info.status === 'progress') report(`Downloading speech model · ${info.file} · ${Math.round(info.progress ?? 0)}%`); },
  });
  try {
    report('Transcribing on your device · this can take several minutes…');
    const result = await pipe(task.audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', ...(task.language ? { language: task.language } : {}) });
    const output = Array.isArray(result) ? result[0] : result;
    const duration = task.audio.length / 16000;
    const words: TimedWord[] = [];
    for (const chunk of output.chunks ?? []) {
      const [start, end] = chunk.timestamp;
      if (start === null || !Number.isFinite(start) || start >= duration || !chunk.text.trim()) continue;
      words.push({ word: chunk.text.trim(), start: Math.max(0, start), end: Math.min(duration, Math.max(start + .02, end ?? duration)) });
    }
    return { kind: 'transcribe', words };
  } finally { await pipe.dispose(); }
}

async function semanticEmphasis(task: Extract<LocalTask, { kind: 'emphasis' }>): Promise<LocalResult> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.backends.onnx.wasm!.numThreads = 1;
  env.fetch = async (input, init) => { const url = new URL(String(input)); if (url.hostname === 'huggingface.co') url.searchParams.set('download', 'true'); return fetch(url, { ...init, credentials: 'omit' }); };
  report('Loading local meaning model · about 25 MB on first use…');
  const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'wasm', dtype: 'q8', revision: '751bff37182d3f1213fa05d7196b954e230abad9', progress_callback: info => { if (info.status === 'progress') report(`Downloading meaning model · ${Math.round(info.progress ?? 0)}%`); } });
  const scores: Record<string, number[]> = {};
  try {
    for (let n = 0; n < task.captions.length; n++) {
      const c = task.captions[n]; report(`Finding key words · caption ${n + 1} of ${task.captions.length}`);
      const candidates = [...new Set(c.candidates.filter(Boolean))];
      const vectors: number[][] = [];
      const texts = [c.text, ...candidates];
      for (let offset = 0; offset < texts.length; offset += 16) {
        const output = await pipe(texts.slice(offset, offset + 16), { pooling: 'mean', normalize: true });
        vectors.push(...output.tolist() as number[][]); output.dispose();
      }
      scores[c.id] = c.candidates.map(text => {
        const i = candidates.indexOf(text); if (i < 0) return 0;
        return vectors[0].reduce((sum, value, j) => sum + value * vectors[i + 1][j], 0);
      });
    }
    return { kind: 'emphasis', scores };
  } finally { await pipe.dispose(); }
}

self.onmessage = async ({ data }: MessageEvent<LocalTask>) => {
  try {
    const result = data.kind === 'separate' ? await separate(data) : data.kind === 'transcribe' ? await transcribe(data) : await semanticEmphasis(data);
    const transfers = result.kind === 'separate' ? [...result.vocals, ...result.instrumental].map(c => c.buffer) : [];
    self.postMessage({ type: 'result', result }, { transfer: transfers as ArrayBuffer[] });
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); }
};
