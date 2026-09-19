import { Input, ALL_FORMATS, BlobSource, CanvasSink, AudioBufferSink, Output, BufferTarget, Mp4OutputFormat, CanvasSource, AudioSampleSink, AudioSampleSource, Conversion, WavOutputFormat, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { drawProject, type Project } from './editor';
import { wavBlob } from './local-ai';
import { ensureFont } from './fonts';
export async function inspectMedia(file: Blob) { const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS }); try {
    const duration = await input.computeDuration();
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!Number.isFinite(duration) || duration <= 0)
        throw new Error('This file has no readable duration.');
    return { duration, hasVideo: !!video, hasAudio: !!audio };
}
finally {
    input.dispose();
} }
export async function waveform(file: Blob) { const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS }); try {
    const track = await input.getPrimaryAudioTrack();
    if (!track)
        return [];
    const d = await input.computeDuration(), peaks = new Array(500).fill(0);
    const sink = new AudioBufferSink(track);
    for await (const chunk of sink.buffers()) {
        const a = chunk.buffer.getChannelData(0);
        for (let i = 0; i < a.length; i += 100) {
            const bin = Math.min(499, Math.floor((chunk.timestamp + i / chunk.buffer.sampleRate) / d * 500));
            peaks[bin] = Math.max(peaks[bin], Math.abs(a[i]));
        }
    }
    return peaks;
}
finally {
    input.dispose();
} }
let aacReady: Promise<void> | undefined;
async function ensureAac() { aacReady ??= (async () => { const { registerAacEncoder } = await import('@mediabunny/aac-encoder'); registerAacEncoder(); })(); await aacReady; }
export async function extractAudio(file: Blob, separation = false) { if (separation)
    await ensureAac(); const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS }); try {
    if (!await input.getPrimaryAudioTrack())
        throw new Error('This media has no audio track.');
    const output = new Output({ format: separation ? new Mp4OutputFormat() : new WavOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, audio: separation ? { codec: 'aac', sampleRate: 44100, numberOfChannels: 2, bitrate: 256000 } : { sampleRate: 16000, numberOfChannels: 1 } });
    if (!conversion.isValid)
        throw new Error('This audio could not be converted. Try an MP3, WAV or AAC file in a current browser.');
    await conversion.execute();
    const blob = new Blob([output.target.buffer!], { type: separation ? 'audio/mp4' : 'audio/wav' });
    if (blob.size > 24 * 1024 * 1024)
        throw new Error('AI processing supports up to 12 minutes. Import a shorter clip.');
    return blob;
}
finally {
    input.dispose();
} }
export async function exportMp4(project: Project, media: Blob | null, audio: Blob | null, height: number, fps: number, onProgress: (n: number) => void, signal: AbortSignal) {
    await ensureAac();
    const width = height / 9 * 16;
    if (!await canEncodeVideo('avc', { width, height, bitrate: height === 2160 ? 40000000 : 12000000 }))
        throw new Error('H.264 export is unavailable at this resolution in this browser. Try 1080p in Chrome or Edge.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    await Promise.all(project.captions.map(c => ensureFont(c.font, c.words.map(w => w.text).join(''))));
    await document.fonts.ready;
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: height === 2160 ? 40000000 : 12000000 });
    output.addVideoTrack(videoSource, { frameRate: fps });
    const inputs: Input[] = [];
    let videoSink: CanvasSink | null = null;
    let audioSource: AudioSampleSource | null = null;
    let audioSink: AudioSampleSink | null = null;
    try {
        if (media) {
            const i = new Input({ source: new BlobSource(media), formats: ALL_FORMATS });
            inputs.push(i);
            const t = await i.getPrimaryVideoTrack();
            if (t) {
                if (!await t.canDecode())
                    throw new Error('This video codec cannot be decoded. Try an H.264 MP4.');
                videoSink = new CanvasSink(t, { width, height, fit: 'contain', poolSize: 2 });
            }
        }
        if (audio) {
            const i = new Input({ source: new BlobSource(audio), formats: ALL_FORMATS });
            inputs.push(i);
            const t = await i.getPrimaryAudioTrack();
            if (t) {
                if (!await canEncodeAudio('aac'))
                    throw new Error('AAC audio export is unavailable in this browser. Try Chrome or Edge.');
                if (!await t.canDecode())
                    throw new Error('The source audio cannot be decoded.');
                audioSink = new AudioSampleSink(t);
                audioSource = new AudioSampleSource({ codec: 'aac', bitrate: 256000 });
                output.addAudioTrack(audioSource);
            }
        }
        await output.start();
        const videoJob = async () => { const count = Math.ceil(project.duration * fps); const timestamps = Array.from({ length: count }, (_, i) => i / fps); const frames = videoSink?.canvasesAtTimestamps(timestamps); const iterator = frames?.[Symbol.asyncIterator](); try {
            for (let frame = 0; frame < count; frame++) {
                signal.throwIfAborted();
                const result = iterator ? await iterator.next() : null;
                const image = result && !result.done ? result.value?.canvas : null;
                drawProject(ctx, project, frame / fps, image);
                await videoSource.add(frame / fps, 1 / fps);
                if (frame % 5 === 0) {
                    onProgress(frame / count);
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
        finally {
            await iterator?.return?.();
            videoSource.close();
        } };
        const audioJob = async () => { if (audioSink && audioSource) {
            for await (const sample of audioSink.samples(0, project.duration)) {
                try {
                    signal.throwIfAborted();
                    await audioSource.add(sample);
                }
                finally {
                    sample.close();
                }
            }
            audioSource.close();
        } };
        const results = await Promise.allSettled([videoJob(), audioJob()]);
        const failed = results.find(r => r.status === 'rejected');
        if (failed?.status === 'rejected')
            throw failed.reason;
        signal.throwIfAborted();
        await output.finalize();
        onProgress(1);
        return new Blob([output.target.buffer!], { type: 'video/mp4' });
    }
    catch (e) {
        await output.cancel().catch(() => { });
        throw e;
    }
    finally {
        inputs.forEach(i => i.dispose());
    }
}
export function download(blob: Blob, name: string) { const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }

/** Decode and resample locally; preserve timestamps, including gaps in the source track. */
export async function decodePcm(file: Blob, rate: number, channels: number, signal: AbortSignal) {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
        if (!await input.getPrimaryAudioTrack()) throw new Error('This file has no audio track.');
        const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
        const conversion = await Conversion.init({ input, output, video: { discard: true }, audio: { sampleRate: rate, numberOfChannels: channels } });
        if (!conversion.isValid) throw new Error('This audio format cannot be decoded. Try WAV, MP3, or AAC.');
        const cancel = () => { void conversion.cancel(); };
        signal.addEventListener('abort', cancel, { once: true });
        try { signal.throwIfAborted(); await conversion.execute(); signal.throwIfAborted(); }
        finally { signal.removeEventListener('abort', cancel); }
        const context = new OfflineAudioContext(channels, 1, rate);
        const audio = await context.decodeAudioData(output.target.buffer!);
        signal.throwIfAborted();
        return Array.from({ length: channels }, (_, c) => new Float32Array(audio.getChannelData(Math.min(c, audio.numberOfChannels - 1))));
    } finally { input.dispose(); }
}

export async function mixAudio(tracks: { file: Blob; gain: number }[], duration: number, signal: AbortSignal) {
    const active = tracks.filter(t => t.gain > 0);
    if (!active.length) return null;
    const frames = Math.ceil(duration * 44100), mix = [new Float32Array(frames), new Float32Array(frames)];
    for (const track of active) {
        const channels = await decodePcm(track.file, 44100, 2, signal);
        for (let c = 0; c < 2; c++) for (let i = 0; i < Math.min(frames, channels[c].length); i++) mix[c][i] += channels[c][i] * track.gain;
        signal.throwIfAborted();
    }
    return wavBlob(mix);
}
