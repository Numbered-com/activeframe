export type FrameFit = 'cover' | 'contain' | 'fill';

export function drawFrame(
  frame: VideoFrame,
  ctx: CanvasRenderingContext2D,
  fit: FrameFit = 'cover',
): void {
  const canvas = ctx.canvas;
  const dw = canvas.width;
  const dh = canvas.height;
  const sw = frame.displayWidth ?? frame.codedWidth;
  const sh = frame.displayHeight ?? frame.codedHeight;

  if (fit === 'fill') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(frame, 0, 0, sw, sh, 0, 0, dw, dh);
    return;
  }

  const scale = fit === 'cover'
    ? Math.max(dw / sw, dh / sh)
    : Math.min(dw / sw, dh / sh);

  const tw = sw * scale;
  const th = sh * scale;
  const ox = (dw - tw) / 2;
  const oy = (dh - th) / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(frame, 0, 0, sw, sh, ox, oy, tw, th);
}
