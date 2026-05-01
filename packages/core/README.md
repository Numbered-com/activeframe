# @numbered/activeframe

Decode `.af` files in the browser with the WebCodecs API. No `<video>` element, no third-party demuxers/decoders.

Part of the [ActiveFrame project](../../README.md). To transcode videos to `.af`, see [`@numbered/activeframe-cli`](../cli/README.md).

## Install

```bash
bun add @numbered/activeframe
```

## Quick start — `attachCanvas` (recommended)

`attachCanvas` owns a `ResizeObserver`, keeps the canvas bitmap aligned to its CSS size × DPR, and redraws on resize / fit changes.

```js
import { attachCanvas } from '@numbered/activeframe';

const canvas = document.querySelector('canvas');
const { activeFrame, setFit, destroy } = attachCanvas(canvas, '/clip.af', {
  fit: 'cover', // 'cover' | 'contain' | 'fill'
  hardwareAcceleration: 'prefer-hardware',
  onDraw: (frame) => console.log('drew frame', activeFrame.frame),
});

await activeFrame.loading;
activeFrame.setFrame(0);
```

## Low-level — custom rendering

For WebGL/WebGPU or any custom render path, instantiate `ActiveFrame` directly and supply a `process(frame)` callback. The frame is closed for you after `process` resolves.

```js
import ActiveFrame from '@numbered/activeframe';

const af = new ActiveFrame('/clip.af', {
  hardwareAcceleration: 'prefer-hardware',
  process: (frame) => {
    // upload `frame` to a GPU texture, render to your own canvas, etc.
  },
});

await af.loading;
af.setFrame(0);
// later: af.destroy();
```

## API

### `attachCanvas(canvas, src, options)`

| Option                 | Type                                | Default              |
| ---------------------- | ----------------------------------- | -------------------- |
| `fit`                  | `'cover' \| 'contain' \| 'fill'`    | `'cover'`            |
| `hardwareAcceleration` | `HardwareAcceleration`              | `'prefer-hardware'`  |
| `onDraw`               | `(frame: VideoFrame) => void`       | —                    |

Returns `{ activeFrame, setFit(fit), destroy() }`.

### `new ActiveFrame(src, options)`

| Option                 | Type                                            |
| ---------------------- | ----------------------------------------------- |
| `process`              | `(frame: VideoFrame) => void \| Promise<void>`  |
| `hardwareAcceleration` | `HardwareAcceleration`                          |

Methods: `setFrame(n)`, `redraw()`, `destroy()`.  
Properties: `loading: Promise<void>`, `manifest`, `frame`.

## File format

`.af` is **v2**: `[4-byte LE manifestLen][manifest JSON][samples]`. v1 files (manifest at the tail) are not supported by the current runtime — regenerate them with the latest CLI.
