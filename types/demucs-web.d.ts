declare module 'demucs-web' {
  export function prepareModelInput(left: Float32Array, right: Float32Array): { waveform: Float32Array; magSpec: Float32Array };
  export type Spectrum = { leftReal: Float32Array; leftImag: Float32Array; rightReal: Float32Array; rightImag: Float32Array };
  export function standaloneMask(data: Float32Array): Spectrum[];
  export function standaloneIspec(spec: Spectrum, length: number): { left: Float32Array; right: Float32Array };
}
