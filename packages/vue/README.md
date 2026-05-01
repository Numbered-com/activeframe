# @numbered/activeframe-vue

Vue 3 wrapper for [`@numbered/activeframe`](../core/README.md). Renders a `<canvas>` and exposes imperative methods via `defineExpose` — per-frame updates do **not** trigger reactivity.

Part of the [ActiveFrame project](../../README.md).

## Install

```bash
bun add @numbered/activeframe-vue @numbered/activeframe
# vue is a peer dependency
```

## Usage

```vue
<script setup>
import { ref } from 'vue';
import ActiveFrame from '@numbered/activeframe-vue';

const player = ref();
const onReady = () => player.value?.setFrame(0);
</script>

<template>
  <ActiveFrame ref="player" src="/clip.af" fit="cover" @ready="onReady" />
</template>
```

Imperative scrubbing:

```js
window.addEventListener('scroll', () => {
  const total = player.value?.getManifest()?.totalFrames ?? 0;
  player.value?.setFrame(progress * (total - 1));
});
```

## Props

| Prop                   | Type                                | Default              |
| ---------------------- | ----------------------------------- | -------------------- |
| `src`                  | `string`                            | —                    |
| `fit`                  | `'cover' \| 'contain' \| 'fill'`    | `'cover'`            |
| `hardwareAcceleration` | `HardwareAcceleration`              | `'prefer-hardware'`  |

## Emits

- `ready` — `(manifest: ActiveFrameManifest)`
- `error` — `(err: Error)`

## Exposed methods

```ts
{
  setFrame(n: number): void;
  getCurrentFrame(): number | null;
  getManifest(): ActiveFrameManifest | null;
}
```
