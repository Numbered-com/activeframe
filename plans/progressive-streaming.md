# Progressive Streaming Plan

## Use case

Short scroll-driven videos (typically 5–30 s, 1–10 MB) embedded in pages. User scrolls forward through the timeline. Backward scrolling within already-streamed bytes works (free — bytes stay in memory). **Backward scrolling beyond the streamed region is out of scope** — accept that the user sees the last decoded frame until the stream catches up.

Goal: scrubbing must work before the whole file has downloaded.

## Problem

`docs/ActiveFrame.js:60-75` does `fetch(file).arrayBuffer()` — full download blocks all scrubbing. Two structural causes:
1. Manifest is at the **tail** of the file — sequential streaming gives data first, manifest last.
2. Frame access is direct `Uint8Array` views into one monolithic `ArrayBuffer` — no abstraction to fault in bytes lazily.

Decoder description (`avcC`/`hvcC`) lives in the manifest (`docs/ActiveFrame.js:97`, written at `af.js:77`), so the manifest must arrive before any decode.

## File format change (breaking — no backward compat needed)

Move the manifest from the tail to the front. Drop the footer.

```
v1 (current):  [ samples ........................ ][ manifest JSON ][ 4-byte LE footer ]
v2 (new):      [ 4-byte LE manifestLen ][ manifest JSON ][ samples ........................ ]
```

Manifest JSON shape unchanged: `{codec, width, height, fps, totalFrames, gop, type, description, frames: [{o, l, t, ty, i}, ...]}`. `frame.o` remains an offset relative to start-of-samples (i.e. byte `4 + manifestLen` of the file).

Why JSON, not binary: short videos have small manifests (a 30 s × 30 fps video at GOP=5 is ~900 frames × ~50 B JSON ≈ 45 KB; gzipped ~6 KB). Parse time on mobile is single-digit ms. Binary packing isn't worth the tooling/debuggability loss at this scale.

## Runtime: single-fetch streaming loader

One `fetch(file)` for the whole file. Read with `response.body.getReader()`. Maintain a "watermark" = highest sample byte received. `setFrame(n)` decodes immediately if the required bytes are within the watermark, otherwise registers a waiter that fires when the watermark catches up.

No Range requests. No chunk store. No LRU. No prefetch policy. No pivot. The browser's TCP stack streams bytes in order; we consume them.

### Shared load across instances

`cacheActiveFrameList` (`docs/ActiveFrame.js:1, 42`) currently caches the resolved `{manifest, data}` so multiple `ActiveFrame` instances of the same file share one load. With streaming we share a **live load handle** instead: an object exposing `manifest` (resolved early), `sampleBuf` (mutated as bytes arrive), `watermark` (number, observable), and a subscribe/notify hook. Each instance subscribes to watermark updates and runs its own decoder + `setFrame` against the shared buffer.

### Sanity caps

- Reject `manifestLen > 10 MB` immediately with a clear error. Old v1 files passed accidentally would otherwise buffer indefinitely chasing a bogus length parsed from H.264 bytes.
- `res.ok` and `res.body` checked before stream consumption. 404/HTML responses fail fast.
- If `res.body` is unavailable (older WebViews, opaque responses, certain service worker setups), fall back to `res.arrayBuffer()` and parse synchronously.

### Sample buffer size — derived from manifest, not Content-Length

`Content-Length` reflects encoded size when `Content-Encoding: gzip` is in play and is missing on chunked responses. The manifest already contains exact sample bytes:

```js
const last = manifest.frames[manifest.frames.length - 1];
const sampleTotal = last.o + last.l;
sampleBuf = new Uint8Array(sampleTotal);
```

`Content-Length` may still be read as a *hint* for progress UI but is not load-bearing.

### Loader sketch (replaces `loadBinary` at `docs/ActiveFrame.js:60-75`)

```js
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

async function streamingLoad(file) {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);

  if (!res.body || typeof res.body.getReader !== 'function') {
    // Fallback: full buffer load, parse synchronously.
    return parseAllAtOnce(await res.arrayBuffer());
  }

  const reader = res.body.getReader();
  const handle = {
    manifest: null,
    sampleBuf: null,
    watermark: 0,
    listeners: new Set(),
    ready: Promise.create(),    // resolves when manifest+decoder-config available
    done: Promise.create(),     // resolves when stream completes
  };

  // Cursor-based head accumulator (does not re-grow per chunk).
  const head = { chunks: [], length: 0 };
  let manifestLen = -1;
  let sampleStart = 0;

  const headBytes = (n) => {
    // Concatenate just enough bytes from head.chunks to read first n bytes.
    const out = new Uint8Array(n);
    let pos = 0;
    for (const c of head.chunks) {
      const take = Math.min(c.length, n - pos);
      out.set(c.subarray(0, take), pos);
      pos += take;
      if (pos === n) break;
    }
    return out;
  };

  const dropHeadBytes = (n) => {
    let remaining = n;
    while (remaining > 0 && head.chunks.length) {
      const c = head.chunks[0];
      if (c.length <= remaining) { remaining -= c.length; head.chunks.shift(); }
      else { head.chunks[0] = c.subarray(remaining); remaining = 0; }
    }
    head.length -= n;
  };

  const writeSamples = (chunk) => {
    handle.sampleBuf.set(chunk, handle.watermark);
    handle.watermark += chunk.length;
    for (const l of handle.listeners) l(handle.watermark);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (handle.sampleBuf) {
        writeSamples(value);
        continue;
      }

      head.chunks.push(value);
      head.length += value.length;

      if (manifestLen < 0 && head.length >= 4) {
        const lenBytes = headBytes(4);
        manifestLen = new DataView(lenBytes.buffer).getUint32(0, true);
        if (manifestLen <= 0 || manifestLen > MAX_MANIFEST_BYTES) {
          throw new Error(`Manifest length out of range: ${manifestLen} (likely a v1 .af file)`);
        }
      }

      if (manifestLen >= 0 && head.length >= 4 + manifestLen) {
        // Pull manifest out.
        const allHead = headBytes(4 + manifestLen);
        const manifest = JSON.parse(new TextDecoder().decode(allHead.subarray(4)));
        handle.manifest = manifest;

        const last = manifest.frames[manifest.frames.length - 1];
        handle.sampleBuf = new Uint8Array(last.o + last.l);
        sampleStart = 4 + manifestLen;

        // Any sample bytes that arrived in the same chunks as the manifest:
        dropHeadBytes(4 + manifestLen);
        for (const c of head.chunks) writeSamples(c);
        head.chunks = []; head.length = 0;

        handle.ready.resolve();
      }
    }
  } catch (err) {
    handle.ready.reject(err); handle.done.reject(err); throw err;
  }

  handle.done.resolve();
  return handle;
}
```

Each `ActiveFrame` instance:
1. Gets the (possibly shared) handle from the cache.
2. `await handle.ready` → has `manifest` + `sampleBuf`.
3. Allocates per-frame `Uint8Array` views into `handle.sampleBuf` (the existing loop at `docs/ActiveFrame.js:50-54`, now safe because `sampleBuf` exists).
4. Configures its own decoder.
5. Subscribes to `handle.listeners` so its `setFrame` waiters re-evaluate as bytes arrive.

### `setFrame(n)` change

Add a watermark gate **before** the `_pendingFrame === desideredFrame` early return at `docs/ActiveFrame.js:173`. If we set `_pendingFrame` and then return for "waiting on bytes", `flushWaiters → setFrame(f)` would hit the early return and never decode.

```js
setFrame(n) {
  if (!this.manifest) return;
  if (!this.enabled) return;

  n = Math.round(Number(n));
  const maxFrame = Math.max(0, this.manifest.totalFrames - 1);
  n = Math.min(Math.max(n, 0), maxFrame);
  this.desideredFrame = n;

  const frameMeta = this.manifest.frames[n];
  if (!frameMeta) return;

  // Walk back to keyframe + every delta in between. Compute max required byte.
  // This is O(GOP) which is trivially small (GOP=5).
  let requiredEnd = frameMeta.o + frameMeta.l;
  for (let i = n; i >= 0; i--) {
    const f = this.manifest.frames[i];
    requiredEnd = Math.max(requiredEnd, f.o + f.l);
    if (f.ty === 'key') break;
  }

  // Watermark gate FIRST — before _pendingFrame.
  if (requiredEnd > this.handle.watermark) {
    this.waiter = { frame: n, byteEnd: requiredEnd };
    return; // last decoded frame remains on screen
  }
  this.waiter = null;

  if (n === this.frame) return;
  if (n === this._pendingFrame) return;
  this._pendingFrame = n;

  // ... existing decode path from docs/ActiveFrame.js:177 onward ...
}

flushWaiters(watermark) {
  const w = this.waiter;
  if (!w) return;
  if (w.byteEnd > watermark) return;
  if (w.frame !== this.desideredFrame) { this.waiter = null; return; }
  this.waiter = null;
  this.setFrame(w.frame);
}
```

Single waiter (only the most recent target matters). Stale waiters are dropped when `desideredFrame` moves on.

**Why the loop is correct over `max(frameEnd, keyEnd)`**: the simpler max only works because samples in the file are written in manifest (decode) order with monotonic offsets (`af.js:94, 108`) and B-frames are disabled (`af.js:50`). The explicit loop documents and enforces the invariant — at GOP=5 it's at most 5 iterations and negligibly cheap.

### Eager view allocation stays

The existing loop at `docs/ActiveFrame.js:50-54` (`frame.data = new Uint8Array(this.data, frame.o, frame.l)`) still works — `this.data` is now `handle.sampleBuf` and `frame.o` indexes into it. Allocate views *after* the handle's `ready` resolves, not before. The view bytes themselves may not be populated yet — that's what the watermark gate guards.

### Seek token: deferred

Initially planned as a ship requirement, but **not implementable cleanly with the current architecture**: `EncodedVideoChunk` properties don't propagate to the output `VideoFrame`, so a per-decode token can't be read in `outputFrame` without restructuring the decoder pipeline (e.g. parallel ID queue keyed by timestamp).

Analysis: the existing `framesByTimestamp` check at `docs/ActiveFrame.js:140-145` correctly drops stale outputs whose decoded frame index doesn't match `desideredFrame`. WebCodecs `decoder.reset()` is specced to discard pending outputs. Re-rendering an identical frame from a re-issued decode is harmless (same input bytes → same output).

If a real bug surfaces in practice (e.g. visual glitches during fast scrubbing), revisit by adding a side-channel timestamp→token map.

## Builder change (`af.js`)

Replace the JSON-then-footer block at `af.js:112-131` with len-prefix-then-JSON-then-samples. ~10 lines:

```js
const manifestStr = JSON.stringify(manifest);
const manifestBuf = Buffer.from(manifestStr);
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32LE(manifestBuf.length, 0);

const out = Buffer.concat([lenBuf, manifestBuf, databuf.subarray(0, offset)]);
fs.writeFileSync(outputFile, out);
```

`offset` already tracks total sample bytes. Frame offsets in the manifest stay as-is (relative to start-of-samples).

## Server requirements

- Static file serving over HTTP/1.1 or HTTP/2.
- No Range support needed. No CORS-expose-headers gymnastics. No `Content-Length` requirement (sample buffer size is derived from the manifest).
- If the host serves with `Content-Encoding: gzip`, the `.af` file is already H.264/H.265-compressed and won't compress further; consider serving with `Content-Encoding: identity` to avoid wasted CPU on both ends.

## What we explicitly don't do

- **No backward streaming beyond watermark.** Out of scope. User sees frozen frame until stream arrives.
- **No Range requests.** One fetch, one connection.
- **No chunk cache, LRU, prefetch policy, pivot logic.** Not needed.
- **No magic bytes / version field.** Breaking change is acknowledged; old `.af` files are regenerated.
- **No binary manifest packing.** JSON is small enough.
- **No MSE / `<video>` fallback.** Defeats the library's reason for existing.
- **No `flush()` as a seek primitive.** Use `reset()` + seek token.

## What the user experiences

- **First frame**: visible after ~`(4 + manifestLen + first GOP bytes)` arrive — typically <200 KB. Massive improvement over today's full-file wait.
- **Forward scroll within watermark**: instant, identical to today.
- **Forward scroll past watermark**: last rendered frame stays on screen until stream catches up. On a 5 MB file at 5 Mbps, worst case (jump to end on cold start) is ~8 s. For typical scroll UX, the user reaches the end naturally as the stream completes.
- **Backward scroll within watermark**: instant.
- **Once stream completes**: behavior is identical to current full-load implementation.

## Risks / open questions

- **Mid-stream fetch failure**: network drops → partial `sampleBuf`. v1 behavior: reject `handle.done` with a clear error and stop accepting `setFrame` calls past the watermark (existing waiter sits indefinitely until external retry). Optional v1.1: narrow Range retry from `watermark` on a single transient failure. Not in v1.
- **`response.body` unsupported** (older WebViews, opaque responses): fall back to `arrayBuffer()` and parse synchronously. Same UX as today minus streaming benefit.
- **Stale v1 file loaded by v2 runtime**: first 4 H.264 bytes parse as a bogus length. Sanity cap (10 MB) catches this and fails fast. Document the breaking change clearly in the README.
- **Decoder reset cost on Android**: `docs/index.html:128-136` notes segmented hardware decoder behavior. Streaming doesn't change this; orthogonal concern.
- **Phase 3 LOD (low-res companion) still useful?** Optional. With this design, first-frame is fast enough that the LOD hide is less critical. Keep on the roadmap for poor-network UX.

## Implementation order

1. Update `af.js`: emit `[4-byte LE manifestLen][manifest JSON][samples]`, drop the footer. Regenerate sample `.af` files.
2. Replace `loadBinary` with the streaming loader. Refactor `cacheActiveFrameList` to share a live handle (manifest, sampleBuf, watermark, listeners) across instances.
3. Move per-frame view allocation to after `handle.ready`.
4. Add watermark gate + single waiter to `setFrame`. Place gate **before** `_pendingFrame` early return.
5. Add `res.ok` check, `res.body` fallback to `arrayBuffer()`, and `manifestLen` sanity cap.
6. (v1.1, optional) Narrow Range retry from `watermark` on transient network error.
7. (v1.1, optional) Seek token via timestamp→token side channel if visual glitches surface.
8. (Optional) Phase 3 LOD companion for slow networks.
