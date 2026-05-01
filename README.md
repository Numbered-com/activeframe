# ActiveFrame 🖼️ (beta)

![ActiveFrame sample](./public/sample.gif)
![ActiveFrame sample2](./public/sample2.gif)

Demo: https://activeframe.vercel.app/  
[More Context](https://x.com/luruke/status/2037511335257223626?s=20)

> **Fork of [activetheory/activeframe](https://github.com/activetheory/activeframe)** — restructured as a monorepo (core + framework wrappers + CLI) with progressive streaming added to the runtime.

ActiveFrame is a small pipeline and javascript library for turning a video into a **single binary `.af` file** and decoding it in the browser with the **Web Codec API** — without a `<video>` element and **without third-party dependencies** such as FFmpeg.wasm, Mediabunny, or other JS demuxers/decoders.

The file packs a JSON manifest at the front followed by raw encoded samples (H.264 / H.265). The runtime streams the file with a single `fetch()`, configures the decoder as soon as the manifest arrives, and exposes **frame-accurate** navigation via `setFrame(index)` — scrubbing works progressively as bytes arrive.

---

## Packages

| Package                                               | Use for                            | Docs                                       |
| ----------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| [`@numbered/activeframe`](./packages/core)            | Vanilla JS / TS, custom rendering  | [README](./packages/core/README.md)        |
| [`@numbered/activeframe-react`](./packages/react)     | React 18+ component                | [README](./packages/react/README.md)       |
| [`@numbered/activeframe-vue`](./packages/vue)         | Vue 3 component                    | [README](./packages/vue/README.md)         |
| [`@numbered/activeframe-alpine`](./packages/alpine)   | Alpine.js plugin                   | [README](./packages/alpine/README.md)      |
| [`@numbered/activeframe-cli`](./packages/cli)         | Transcode `<video>` → `.af` (CLI)  | [README](./packages/cli/README.md)         |

Each wrapper renders a `<canvas>` and exposes imperative methods so per-frame updates don't re-render the component tree.

---

## Why use this instead of "regular" video?

- Frame-accurate control and random access
- Feed the frame natively to WebGL/WebGPU and Canvas 2D
- Hardware accelerated
- Optimized for interactive scrubbing, 3D, image-like control over which frame is shown
- You can keep multiple videos "in sync"
- Predictable loading times, buffering, etc
- Progressive streaming — first frame renders before the file is fully downloaded

## Why use this instead of "regular" spritesheet?

- Smaller file size, leveraging H.264 / H.265 intra frame compression
- Better memory management

---

## Roadmap / ideas

- Surface **codec support** before loading (e.g. companion manifest or a tiny probe).
- **Backward / random-access streaming**: today's loader streams forward only. Scrubbing past the watermark freezes on the last decoded frame. Range-fetched per-GOP retrieval would unlock instant jumps anywhere.
- **LOD / adaptive quality**: low-res companion track preloaded for instant placeholder while the high-res streams in.
- **Runtime tuning** of hardware vs software decode based on performance.
- **Benchmark suite** to calibrate and fine tune performance and hw support.

---

Demo video is from [Netflix Open Content](https://opencontent.netflix.com/) – Meridian. Under Creative Commons Attribution 4.0 International Public License.
