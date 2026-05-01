# @numbered/activeframe-react

React 18+ wrapper for [`@numbered/activeframe`](../core/README.md). Renders a `<canvas>` and exposes an imperative ref — per-frame updates do **not** trigger re-renders.

Part of the [ActiveFrame project](../../README.md).

## Install

```bash
bun add @numbered/activeframe-react @numbered/activeframe
# react / react-dom are peer dependencies
```

## Usage

```tsx
import { useRef } from 'react';
import ActiveFrame, { type ActiveFrameHandle } from '@numbered/activeframe-react';

function Player() {
  const ref = useRef<ActiveFrameHandle>(null);

  return (
    <ActiveFrame
      ref={ref}
      src="/clip.af"
      fit="cover"
      onReady={() => ref.current?.setFrame(0)}
      style={{ width: '100%', height: '100vh' }}
    />
  );
}
```

Imperative scrubbing (e.g. on scroll) — never re-renders:

```tsx
window.addEventListener('scroll', () => {
  const total = ref.current?.getManifest()?.totalFrames ?? 0;
  ref.current?.setFrame(progress * (total - 1));
});
```

## Props

| Prop                   | Type                                    | Default              |
| ---------------------- | --------------------------------------- | -------------------- |
| `src`                  | `string`                                | —                    |
| `fit`                  | `'cover' \| 'contain' \| 'fill'`        | `'cover'`            |
| `hardwareAcceleration` | `HardwareAcceleration`                  | `'prefer-hardware'`  |
| `onReady`              | `(manifest: ActiveFrameManifest) => void` | —                  |
| `onError`              | `(err: Error) => void`                  | —                    |

Any extra prop is forwarded to the inner `<canvas>`.

## Ref handle

```ts
interface ActiveFrameHandle {
  setFrame(n: number): void;
  getCurrentFrame(): number | null;
  getManifest(): ActiveFrameManifest | null;
}
```
