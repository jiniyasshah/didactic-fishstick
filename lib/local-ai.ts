export type TimedWord = { word: string; start: number; end: number };
export type LocalTask =
  | { kind: 'separate'; left: Float32Array; right: Float32Array }
  | { kind: 'transcribe'; audio: Float32Array; language: string }
  | { kind: 'emphasis'; captions: { id: string; text: string; candidates: string[] }[] };
export type LocalResult = { kind: 'separate'; vocals: Float32Array[]; instrumental: Float32Array[] }
  | { kind: 'transcribe'; words: TimedWord[] }
  | { kind: 'emphasis'; scores: Record<string, number[]> };

/** A fresh worker per task also releases all model/GPU memory on success or cancellation. */
export function runLocalAI(task: LocalTask, signal: AbortSignal, status: (text: string) => void): Promise<LocalResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker('/ai-runtime/local-ai.worker.js', { type: 'module' });
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException('Canceled', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Local processing could not start. Try current Chrome or Edge.')); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') status(data.text);
      else if (data.type === 'error') { cleanup(); const error = new Error(data.message); if (data.stack) error.stack = data.stack; reject(error); }
      else if (data.type === 'result') { cleanup(); resolve(data.result); }
    };
    const buffers = task.kind === 'separate' ? [task.left.buffer, task.right.buffer] : task.kind === 'transcribe' ? [task.audio.buffer] : [];
    worker.postMessage(task, buffers as ArrayBuffer[]);
  });
}

export function wavBlob(channels: Float32Array[], rate = 44100): Blob {
  const count = channels.length, frames = channels[0].length;
  const buffer = new ArrayBuffer(44 + frames * count * 2), view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, count, true); view.setUint32(24, rate, true); view.setUint32(28, rate * count * 2, true);
  view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * count * 2, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) {
    const sample = Math.max(-1, Math.min(1, channels[c][i]));
    view.setInt16(44 + (i * count + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
