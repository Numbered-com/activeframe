import {
  type CanvasHTMLAttributes,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  ActiveFrame as ActiveFrameCore,
  drawFrame,
  type ActiveFrameManifest,
  type FrameFit,
} from '@numbered/activeframe';

export interface ActiveFrameHandle {
  setFrame(n: number): void;
  getCurrentFrame(): number | null;
  getManifest(): ActiveFrameManifest | null;
}

export interface ActiveFrameProps extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'ref' | 'onError'> {
  src: string;
  fit?: FrameFit;
  hardwareAcceleration?: HardwareAcceleration;
  onReady?: (manifest: ActiveFrameManifest) => void;
  onError?: (err: Error) => void;
  ref?: Ref<ActiveFrameHandle | null>;
}

export default function ActiveFrame({
  src,
  fit = 'cover',
  hardwareAcceleration = 'prefer-hardware',
  onReady,
  onError,
  ref,
  ...canvasProps
}: ActiveFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<ActiveFrameCore | null>(null);
  const fitRef = useRef<FrameFit>(fit);
  fitRef.current = fit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const af = new ActiveFrameCore(src, {
      hardwareAcceleration,
      process: (frame) => drawFrame(frame, ctx, fitRef.current),
    });
    instanceRef.current = af;

    af.loading
      .then(() => onReady?.(af.manifest!))
      .catch((err: unknown) => onError?.(err instanceof Error ? err : new Error(String(err))));

    return () => {
      af.destroy();
      instanceRef.current = null;
    };
  }, [src, hardwareAcceleration]);

  useImperativeHandle(ref, () => ({
    setFrame: (n) => instanceRef.current?.setFrame(n),
    getCurrentFrame: () => instanceRef.current?.frame ?? null,
    getManifest: () => instanceRef.current?.manifest ?? null,
  }), []);

  return <canvas ref={canvasRef} {...canvasProps} />;
}
