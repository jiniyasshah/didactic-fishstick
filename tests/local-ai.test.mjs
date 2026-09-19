import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wavBlob, runLocalAI } from '../lib/local-ai.ts';

test('stem WAV preserves stereo order, duration, and signed sample bounds', async () => {
  const blob = wavBlob([new Float32Array([-1, 0, 1]), new Float32Array([.5, -.5, 2])]);
  const data = new DataView(await blob.arrayBuffer());
  assert.equal(data.getUint16(22, true), 2);
  assert.equal(data.getUint32(24, true), 44100);
  assert.equal(data.getUint32(40, true), 12);
  assert.equal(data.getInt16(44, true), -32768);
  assert.equal(data.getInt16(46, true), 16384);
  assert.equal(data.getInt16(54, true), 32767);
});

test('already-canceled processing never creates a worker', () => {
  const ctrl = new AbortController(); ctrl.abort();
  assert.throws(() => runLocalAI({ kind: 'transcribe', audio: new Float32Array(16), language: '' }, ctrl.signal, () => {}), { name: 'AbortError' });
});
