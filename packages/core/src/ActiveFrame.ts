export interface ActiveFrameMeta {
  i: number;
  t: number;
  o: number;
  l: number;
  ty: 'key' | 'delta';
  data?: Uint8Array;
}

export interface ActiveFrameManifest {
  codec: string;
  width: number;
  height: number;
  description: string;
  totalFrames: number;
  frames: ActiveFrameMeta[];
}

export interface ActiveFrameOptions {
  process?: (frame: VideoFrame) => void | Promise<void>;
  hardwareAcceleration?: HardwareAcceleration;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

type WatermarkListener = (watermark: number) => void;

interface LoadHandle {
  manifest: ActiveFrameManifest | null;
  sampleBuf: Uint8Array | null;
  watermark: number;
  listeners: Set<WatermarkListener>;
  ready: Deferred<void>;
  done: Deferred<void>;
  error: Error | null;
  refs: number;
}

const cacheActiveFrameList = new Map<string, LoadHandle>();

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function streamingLoad(file: string): LoadHandle {
  const handle: LoadHandle = {
    manifest: null,
    sampleBuf: null,
    watermark: 0,
    listeners: new Set(),
    ready: deferred<void>(),
    done: deferred<void>(),
    error: null,
    refs: 0,
  };

  const notify = () => {
    for (const l of handle.listeners) {
      try { l(handle.watermark); } catch (e) { console.error(e); }
    }
  };

  const writeSamples = (chunk: Uint8Array) => {
    if (!handle.sampleBuf) return;
    const room = handle.sampleBuf.length - handle.watermark;
    const take = Math.min(chunk.length, room);
    if (take > 0) {
      handle.sampleBuf.set(chunk.subarray(0, take), handle.watermark);
      handle.watermark += take;
    }
  };

  const fail = (err: unknown) => {
    handle.error = err instanceof Error ? err : new Error(String(err));
    handle.ready.reject(err);
    handle.done.reject(err);
  };

  (async () => {
    let res: Response;
    try {
      res = await fetch(file);
    } catch (err) {
      fail(err);
      return;
    }

    if (!res.ok) {
      fail(new Error(`Load failed: HTTP ${res.status} for ${file}`));
      return;
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      try {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length < 4) throw new Error('File too small');
        const manifestLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true);
        if (manifestLen <= 0 || manifestLen > MAX_MANIFEST_BYTES) {
          throw new Error(`Manifest length out of range: ${manifestLen}`);
        }
        if (buf.length < 4 + manifestLen) throw new Error('Truncated file');

        const manifest = JSON.parse(
          new TextDecoder().decode(buf.subarray(4, 4 + manifestLen))
        ) as ActiveFrameManifest;
        handle.manifest = manifest;

        const last = manifest.frames[manifest.frames.length - 1];
        const expectedSampleBytes = last.o + last.l;
        handle.sampleBuf = new Uint8Array(expectedSampleBytes);
        const samples = buf.subarray(4 + manifestLen);
        if (samples.length !== expectedSampleBytes) {
          throw new Error(`Sample length mismatch: expected ${expectedSampleBytes}, got ${samples.length}`);
        }
        writeSamples(samples);
        handle.ready.resolve();
        notify();
        handle.done.resolve();
      } catch (err) {
        fail(err);
      }
      return;
    }

    const reader = res.body.getReader();
    const head: { chunks: Uint8Array[]; length: number } = { chunks: [], length: 0 };
    let manifestLen = -1;

    const headBytes = (n: number): Uint8Array => {
      const out = new Uint8Array(n);
      let pos = 0;
      for (const c of head.chunks) {
        if (pos === n) break;
        const take = Math.min(c.length, n - pos);
        out.set(c.subarray(0, take), pos);
        pos += take;
      }
      return out;
    };

    const dropHeadBytes = (n: number) => {
      let remaining = n;
      while (remaining > 0 && head.chunks.length) {
        const c = head.chunks[0];
        if (c.length <= remaining) {
          remaining -= c.length;
          head.chunks.shift();
        } else {
          head.chunks[0] = c.subarray(remaining);
          remaining = 0;
        }
      }
      head.length -= n;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (handle.sampleBuf) {
          writeSamples(value);
          notify();
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

        if (manifestLen > 0 && head.length >= 4 + manifestLen) {
          const all = headBytes(4 + manifestLen);
          const manifest = JSON.parse(
            new TextDecoder().decode(all.subarray(4))
          ) as ActiveFrameManifest;
          handle.manifest = manifest;

          const last = manifest.frames[manifest.frames.length - 1];
          handle.sampleBuf = new Uint8Array(last.o + last.l);

          dropHeadBytes(4 + manifestLen);
          for (const c of head.chunks) writeSamples(c);
          head.chunks = [];
          head.length = 0;

          handle.ready.resolve();
          notify();
        }
      }

      if (!handle.manifest) {
        throw new Error('Stream ended before manifest was received');
      }
      if (!handle.sampleBuf || handle.watermark !== handle.sampleBuf.length) {
        throw new Error(`Truncated stream: watermark ${handle.watermark} of ${handle.sampleBuf?.length ?? 0}`);
      }
      handle.done.resolve();
    } catch (err) {
      fail(err);
    }
  })();

  return handle;
}

export default class ActiveFrame {
  file: string | null = null;
  manifest: ActiveFrameManifest | null = null;
  data: Uint8Array | null = null;
  decoder: VideoDecoder | null = null;
  frame: number | null = null;
  desideredFrame = 0;
  enabled = true;
  framesByTimestamp = new Map<number, number>();
  frameProcessed: number | null = null;
  waiter: { frame: number; byteEnd: number } | null = null;
  handle: LoadHandle | null = null;

  loading: Promise<void>;
  process: ActiveFrameOptions['process'];
  hardwareAcceleration: HardwareAcceleration;
  config: VideoDecoderConfig | null = null;

  private _loading: Deferred<void>;
  private _watermarkListener: WatermarkListener | null = null;
  private _pendingFrame: number | null = null;
  private _lastFrame: VideoFrame | null = null;
  private _destroyed = false;

  constructor(file: string, {
    process = () => {},
    hardwareAcceleration = 'prefer-hardware',
  }: ActiveFrameOptions = {}) {
    this._loading = deferred<void>();
    this.loading = this._loading.promise;
    this.process = process;
    this.hardwareAcceleration = hardwareAcceleration;

    this.file = file;
    this.init();
  }

  async init(): Promise<void> {
    if (!this.file) return;
    if (!cacheActiveFrameList.has(this.file)) {
      cacheActiveFrameList.set(this.file, streamingLoad(this.file));
    }
    const handle = cacheActiveFrameList.get(this.file)!;
    handle.refs += 1;
    this.handle = handle;

    try {
      await handle.ready.promise;
    } catch (err) {
      this._loading.reject(err);
      return;
    }

    if (this.handle !== handle) return;

    this.manifest = handle.manifest;
    this.data = handle.sampleBuf;

    if (!this.manifest || !this.data) return;

    const data = this.data;
    this.manifest.frames.forEach(frame => {
      frame.data = new Uint8Array(data.buffer, data.byteOffset + frame.o, frame.l);
      this.framesByTimestamp.set(frame.t, frame.i);
    });

    await this.initDecoder();

    if (this.handle !== handle) return;

    this._watermarkListener = (watermark) => this.flushWaiter(watermark);
    handle.listeners.add(this._watermarkListener);

    this._loading.resolve();
  }

  async loadBinary(file: string): Promise<{ manifest: ActiveFrameManifest | null; data: Uint8Array | null }> {
    const handle = streamingLoad(file);
    await handle.done.promise;
    return { manifest: handle.manifest, data: handle.sampleBuf };
  }

  decodeDescription(description: string): Uint8Array {
    const binaryString = atob(description);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async initDecoder(): Promise<void> {
    if (!this.manifest) throw new Error('Manifest not loaded');

    const baseConfig: VideoDecoderConfig = {
      codec: this.manifest.codec,
      codedWidth: this.manifest.width,
      codedHeight: this.manifest.height,
      colorSpace: {
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        fullRange: false,
      },
      description: this.decodeDescription(this.manifest.description),
    };

    const candidates: VideoDecoderConfig[] = [
      { ...baseConfig, hardwareAcceleration: this.hardwareAcceleration, optimizeForLatency: true },
      { ...baseConfig, hardwareAcceleration: this.hardwareAcceleration },
      { ...baseConfig, optimizeForLatency: true },
      { ...baseConfig },
    ];

    this.config = null;

    for (const candidate of candidates) {
      const support = await VideoDecoder.isConfigSupported(candidate);
      if (this._destroyed) return;
      if (support.supported) {
        this.config = candidate;
        break;
      }
    }

    if (!this.config) {
      throw new Error('Decoder not supported');
    }

    if (this._destroyed) return;

    this.decoder = new VideoDecoder({
      output: this.outputFrame.bind(this),
      error: (e) => {
        console.log(this.file);
        console.log(this.config);
        console.error('Decoder error:', e);
      },
    });
    this.decoder.configure(this.config);
  }

  async outputFrame(frame: VideoFrame): Promise<void> {
    if (!this.enabled) {
      frame.close();
      return;
    }

    const timestampToFrameId = this.framesByTimestamp.get(frame.timestamp);

    if (timestampToFrameId === undefined || this.desideredFrame !== timestampToFrameId) {
      frame.close();
      return;
    }

    this.frame = timestampToFrameId;

    if (this.process) {
      this._lastFrame?.close();
      this._lastFrame = frame.clone();
      await this.process(frame);
    }

    this.frameProcessed = timestampToFrameId;

    frame.close();
  }

  async redraw(): Promise<void> {
    if (!this.enabled || !this.process || !this._lastFrame) return;
    const clone = this._lastFrame.clone();
    try {
      await this.process(clone);
    } finally {
      clone.close();
    }
  }

  setFrame(desideredFrame: number): void {
    if (!this.manifest) return;
    if (!this.enabled) return;
    if (!this.decoder || !this.config || !this.handle) return;

    desideredFrame = Math.round(Number(desideredFrame));
    const maxFrame = Math.max(0, this.manifest.totalFrames - 1);
    desideredFrame = Math.min(Math.max(desideredFrame, 0), maxFrame);
    this.desideredFrame = desideredFrame;

    if (desideredFrame === this.frame || desideredFrame === this._pendingFrame) {
      this.waiter = null;
      return;
    }

    const frameMeta = this.manifest.frames[this.desideredFrame];

    if (!frameMeta) {
      return;
    }

    let requiredEnd = frameMeta.o + frameMeta.l;
    for (let i = this.desideredFrame; i >= 0; i--) {
      const f = this.manifest.frames[i];
      const end = f.o + f.l;
      if (end > requiredEnd) requiredEnd = end;
      if (f.ty === 'key') break;
    }

    if (requiredEnd > this.handle.watermark) {
      this.waiter = { frame: this.desideredFrame, byteEnd: requiredEnd };
      this._pendingFrame = null;
      return;
    }
    this.waiter = null;

    this._pendingFrame = desideredFrame;

    const isSequential = this.frame !== null
      && this.desideredFrame === this.frame + 1
      && frameMeta.ty === 'delta';

    if (isSequential && frameMeta.data) {
      this.decoder.decode(new EncodedVideoChunk({
        type: frameMeta.ty,
        timestamp: frameMeta.t,
        data: frameMeta.data,
      }));
      return;
    }

    if (this.decoder.decodeQueueSize > 0 || this.decoder.state !== 'configured') {
      this.decoder.reset();
      this.decoder.configure(this.config);
    }

    if (frameMeta.ty === 'key' && frameMeta.data) {
      this.decoder.decode(new EncodedVideoChunk({
        type: frameMeta.ty,
        timestamp: frameMeta.t,
        data: frameMeta.data,
      }));
    } else {
      let keyFrame: ActiveFrameMeta | null = null;
      for (let i = this.desideredFrame; i >= 0; i--) {
        const f = this.manifest.frames[i];
        if (f.ty === 'key') {
          keyFrame = f;
          break;
        }
      }

      if (!keyFrame || !keyFrame.data) {
        console.error('No key frame found');
        return;
      }

      this.decoder.decode(new EncodedVideoChunk({
        type: keyFrame.ty,
        timestamp: keyFrame.t,
        data: keyFrame.data,
      }));

      for (let i = keyFrame.i + 1; i <= this.desideredFrame; i++) {
        const f = this.manifest.frames[i];
        if (f.ty === 'delta' && f.data) {
          this.decoder.decode(new EncodedVideoChunk({
            type: f.ty,
            timestamp: f.t,
            data: f.data,
          }));
        } else {
          break;
        }
      }
    }
  }

  flushWaiter(watermark: number): void {
    const w = this.waiter;
    if (!w) return;
    if (w.byteEnd > watermark) return;
    if (w.frame !== this.desideredFrame) {
      this.waiter = null;
      return;
    }
    this.waiter = null;
    this.setFrame(w.frame);
  }

  destroy(): void {
    this._destroyed = true;
    if (this.handle) {
      if (this._watermarkListener) {
        this.handle.listeners.delete(this._watermarkListener);
      }
      this.handle.refs -= 1;
      if (this.handle.refs <= 0 && this.file) {
        cacheActiveFrameList.delete(this.file);
      }
    }
    this.decoder?.close();
    this.decoder = null;
    this.data = null;
    this.manifest = null;
    this.handle = null;
    this.file = null;
    this.process = undefined;
    this.frameProcessed = null;
    this.waiter = null;
    this.enabled = false;
    this._lastFrame?.close();
    this._lastFrame = null;
    this.framesByTimestamp.clear();
  }
}
