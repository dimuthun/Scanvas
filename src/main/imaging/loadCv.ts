import { createRequire } from 'node:module'
import type { Cv } from './ops'

/** Load the OpenCV.js WebAssembly build (≈0.5 s); resolves once the runtime is initialized. */
export async function loadOpenCv(): Promise<Cv> {
  const require = createRequire(import.meta.url)
  const mod = require('@techstark/opencv-js') as Cv
  if (typeof mod.then === 'function') return await mod
  if (mod.Mat) return mod
  return await new Promise<Cv>((resolve) => {
    mod.onRuntimeInitialized = () => resolve(mod)
  })
}
