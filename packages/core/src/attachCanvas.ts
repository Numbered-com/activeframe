import ActiveFrame, { type ActiveFrameManifest, type ActiveFrameOptions } from './ActiveFrame';
import { drawFrame, type FrameFit } from './drawFrame';

export interface AttachCanvasOptions extends Omit<ActiveFrameOptions, 'process'> {
  fit?: FrameFit;
  onDraw?: (frame: VideoFrame) => void;
}

export interface AttachedCanvas {
  loading: Promise<void>;
  setFrame(n: number): void;
  getCurrentFrame(): number | null;
  getManifest(): ActiveFrameManifest | null;
  setFit(fit: FrameFit): void;
  destroy(): void;
}

export function attachCanvas(
  canvas: HTMLCanvasElement,
  src: string,
  options: AttachCanvasOptions = {},
): AttachedCanvas {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('attachCanvas: could not acquire 2D context');

  let fit: FrameFit = options.fit ?? 'cover';

  const activeFrame = new ActiveFrame(src, {
    ...options,
    process: (frame) => {
      drawFrame(frame, ctx, fit);
      options.onDraw?.(frame);
    },
  });

  let rafId = 0;
  const flushResize = () => {
    rafId = 0;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    activeFrame.redraw();
  };

  const observer = new ResizeObserver(() => {
    if (rafId) return;
    rafId = requestAnimationFrame(flushResize);
  });
  observer.observe(canvas);

  return {
    loading: activeFrame.loading,
    setFrame: (n) => activeFrame.setFrame(n),
    getCurrentFrame: () => activeFrame.frame,
    getManifest: () => activeFrame.manifest,
    setFit(next) {
      if (fit === next) return;
      fit = next;
      activeFrame.redraw();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      activeFrame.destroy();
    },
  };
}
