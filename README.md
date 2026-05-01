# ActiveFrame 🖼️ (beta)

![ActiveFrame sample](./public/sample.gif)
![ActiveFrame sample2](./public/sample2.gif)

Demo: https://activetheory.github.io/activeframe/  
[More Context](https://x.com/luruke/status/2037511335257223626?s=20)

ActiveFrame is a small pipeline and javascript library for turning a video into a **single binary `.af` file** and decoding it in the browser with the **Web Codec API** — without a `<video>` element and **without third-party dependencies** such as FFmpeg.wasm, Mediabunny, or other JS demuxers/decoders.

The file packs a **JSON manifest** at the front followed by **raw encoded samples** (H.264 / H.265). The runtime streams the file with a single `fetch()`, configures the decoder as soon as the manifest arrives, and exposes **frame-accurate** navigation via `setFrame(index)` — scrubbing works progressively as bytes arrive.

---

## Why use this instead of “regular” video?

- Frame-accurate control and random access
- Feed the frame natively to WebGL/WebGPU and Canvas 2D
- Hardware accelerated**
- Optimized for interactive scrubbing, 3D, image-like control over which frame is shown
- You can keep multiple videos "in sync"
- Predictable loading times, buffering, etc
- Progressive streaming — first frame renders before the file is fully downloaded

---

## Why use this instead of “regular” spritesheet?

- Smaller file size, leveraging H.264 / H.265 intra frame compression
- Better memory management


---

## Generating an `.af` file

No clone required:

```bash
bunx @numbered/activeframe-cli <input video> <output.af> [maxWidth] [h264|h265] [gop] [crf] [fps]
```

Or from a clone of this repo:

```bash
node packages/cli/af.js <input video> <output.af> [maxWidth] [h264|h265] [gop] [crf] [fps]
```

| Arg | Default | Notes |
|---|---|---|
| `maxWidth` | 1080 | Source is downscaled to fit; aspect ratio preserved |
| `type` | h264 | `h264` (broad support) or `h265` (~50% smaller at same quality) |
| `gop` | 5 | Group of Pictures size. Lower = better random-access scrub, larger file |
| `crf` | 28 | Quality. Lower = better quality + bigger file. h264: 20–28, h265: 26–32 |
| `fps` | (preserve input) | Resamples output to this fps. Affects scroll feel more than file size |

> The `.af` format is **v2** as of the streaming refactor: `[4-byte LE manifestLen][manifest JSON][samples]`. v1 files (manifest at the tail) are not supported by the current runtime and will fail fast — regenerate them with the latest `af.js`.

---

## Roadmap / ideas

- Surface **codec support** before loading (e.g. companion manifest or a tiny probe).
- **Backward / random-access streaming**: today's loader streams forward only. Scrubbing past the watermark freezes on the last decoded frame. Range-fetched per-GOP retrieval would unlock instant jumps anywhere.
- **LOD / adaptive quality**: low-res companion track preloaded for instant placeholder while the high-res streams in.
- **Runtime tuning** of hardware vs software decode based on performance.
- **Benchmark suite** to calibrate and fine tune performance and hw support.


---

Demo video is from [Netflix Open Content](https://opencontent.netflix.com/) – Meridian. Under Creative Commons Attribution 4.0 International Public License.
