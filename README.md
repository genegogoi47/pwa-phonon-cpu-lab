# PWA Phonon CPU Lab — Prototype 3.0

A mobile-first PWA experiment for running **Phonon 31M English TTS** in the browser using Blixt's CPU/WebAssembly backend. The app deliberately forces `backend: "cpu"` so the experiment does not depend on WebGPU or MediaPipe's JSPI runtime.

## What this tests

- iPhone Safari / Home Screen PWA compatibility on the WebAssembly SIMD CPU path.
- Android Chrome compatibility on the same CPU path.
- First model download and browser Cache Storage reuse.
- Voice discovery, local synthesis, PCM output and WAV encoding.
- HTML audio playback with the screen locked / another app open.

This is an experiment, not a production audiobook engine. CPU performance, memory use, battery use and iOS PWA background playback must be verified on real devices.

## Important technical choices

- `phonon-webgpu` is installed directly from `github:blixt/phonon`.
- The package's complete `dist/` folder is copied to `public/vendor/phonon/` at build time. Keeping the directory structure intact is important because the package dynamically loads its CPU worker and WASM assets relative to its own files.
- The browser imports `/vendor/phonon/phonon.js` as a native ES module.
- The model is loaded with `Phonon.load({ model: "phonon-31m-en", backend: "cpu", threads: 1 })`.
- The PWA service worker caches the app shell and same-origin runtime files. Phonon's own Cache Storage logic caches its model files fetched from Hugging Face.
- No COOP/COEP headers are set. This keeps the compatibility test simple and uses the single-thread CPU mode when cross-origin isolation is unavailable.

## Deploy on Vercel

1. Create a new GitHub repository, e.g. `pwa-phonon-cpu-lab`.
2. Upload the contents of this folder to the repository root (the `index.html`, `package.json`, `src/`, `public/`, `scripts/`, `vite.config.js`, and `vercel.json` should be at the root).
3. Import the repository into Vercel.
4. Use these project settings:
   - Framework preset: **Vite** (or Other if Vite is not listed)
   - Root directory: `./`
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Deploy and open the HTTPS URL.
6. On iPhone, open in Safari and use Share → Add to Home Screen. On Android, open in Chrome and use Install app / Add to Home screen.

Vercel runs `npm run build`, which downloads the `phonon-webgpu` Git dependency, copies its prebuilt distribution into `public/vendor/phonon/`, then builds the PWA shell with Vite.

## Test sequence

1. Open the deployed site in the browser/PWA.
2. Check Device Diagnostics. The app reports whether WebAssembly SIMD is available.
3. Tap **Download & load CPU model**. Keep the page in the foreground during initial loading.
4. Confirm that the active backend says `cpu` and displays its SIMD mode and thread count.
5. Select one of the voices discovered from `tts.voices`.
6. Generate the provided English sample text.
7. Wait for the WAV audio file to be created, then tap Play.
8. With audio playing, lock the phone or switch apps. Record whether audio continues.
9. Repeat on iPhone Safari, installed iOS PWA, Android Chrome and desktop Chrome/Edge.

## Expected download

The upstream project's README currently reports a first download of about **44.3 MB** for the default Phonon 31M English model bundle (weights, tokenizer and voice). Exact transferred bytes can vary with cache state and upstream changes. The app runtime and CPU WebAssembly files are additional small downloads.

## Licensing

- Blixt's `phonon-webgpu` implementation is Apache-2.0.
- The default Phonon 31M English model is Apache-2.0 according to the upstream repository.
- The larger Phonon 40M multilingual/other-language models are not used in this prototype; upstream marks them CC BY-NC 4.0 and they are not suitable for commercial use.
- Retain the upstream `LICENSE` and `NOTICE` files distributed with the package. This prototype is not affiliated with Google, Gradium or Blixt.

## Known limitations

- Phonon 31M is English-only.
- The CPU path needs WebAssembly SIMD. Upstream documents Safari 16.4, Chrome 91 and Firefox 89 as baseline support for SIMD, but that does not guarantee memory/performance suitability on every device.
- Without cross-origin isolation, the CPU path runs single-threaded. This prototype intentionally does not request COOP/COEP headers.
- The browser may evict Cache Storage. Persistent storage is requested but not guaranteed.
- The full sample is rendered to a WAV blob before playback. This is deliberate for testing the HTML audio background-playback path, not continuous TTS while the page is suspended.
- Audio output is converted to 16-bit mono WAV at the model's 24 kHz sample rate. The model API returns 24 kHz Float32 PCM.

## Local development

Requires Node.js 20+ recommended.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```
