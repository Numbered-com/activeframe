# @numbered/activeframe-alpine

Alpine.js plugin for [`@numbered/activeframe`](../core/README.md). Adds `x-data="activeframe(...)"` with imperative methods — per-frame updates do **not** trigger Alpine reactivity.

Part of the [ActiveFrame project](../../README.md).

## Install

```bash
bun add @numbered/activeframe-alpine @numbered/activeframe
# alpinejs is a peer dependency
```

## Register

```js
import Alpine from 'alpinejs';
import activeFramePlugin from '@numbered/activeframe-alpine';

Alpine.plugin(activeFramePlugin);
Alpine.start();
```

## Usage

```html
<canvas
  x-data="activeframe({ src: '/clip.af', fit: 'cover' })"
  @ready="setFrame(0)"
></canvas>
```

The component binds to `$refs.canvas` if present, otherwise to `$el`.

Imperative scrubbing:

```html
<div x-data="activeframe({ src: '/clip.af' })" @scroll.window.passive="
  const total = attached?.activeFrame.manifest?.totalFrames ?? 0;
  setFrame(progress * (total - 1));
">
  <canvas x-ref="canvas"></canvas>
</div>
```

## Methods (on the `x-data` scope)

- `setFrame(n: number)`
- `setFit(fit: 'cover' | 'contain' | 'fill')`
- `getCurrentFrame(): number | null`

## Events

- `ready` — `event.detail.manifest`
- `error` — `event.detail.error`
