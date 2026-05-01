import {
  type CanvasHTMLAttributes,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  attachCanvas,
  type ActiveFrameManifest,
  type AttachedCanvas,
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
  const attachedRef = useRef<AttachedCanvas | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const attached = attachCanvas(canvas, src, { hardwareAcceleration, fit });
    attachedRef.current = attached;

    attached.loading
      .then(() => onReadyRef.current?.(attached.getManifest()!))
      .catch((err: unknown) => onErrorRef.current?.(err instanceof Error ? err : new Error(String(err))));

    return () => {
      attached.destroy();
      attachedRef.current = null;
    };
  }, [src, hardwareAcceleration]);

  useEffect(() => {
    attachedRef.current?.setFit(fit);
  }, [fit]);

  useImperativeHandle(ref, () => ({
    setFrame: (n) => attachedRef.current?.setFrame(n),
    getCurrentFrame: () => attachedRef.current?.getCurrentFrame() ?? null,
    getManifest: () => attachedRef.current?.getManifest() ?? null,
  }), []);

  return <canvas ref={canvasRef} {...canvasProps} />;
}
