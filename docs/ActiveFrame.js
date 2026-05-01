const cacheActiveFrameList = new Map();

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

Promise.create = function () {
    let resolve = null;
    let reject = null;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    promise.resolve = resolve;
    promise.reject = reject;
    return promise;
};

function streamingLoad(file) {
    const handle = {
        manifest: null,
        sampleBuf: null,
        watermark: 0,
        listeners: new Set(),
        ready: Promise.create(),
        done: Promise.create(),
        error: null,
        refs: 0
    };

    const notify = () => {
        for (const l of handle.listeners) {
            try { l(handle.watermark); } catch (e) { console.error(e); }
        }
    };

    const writeSamples = (chunk) => {
        const room = handle.sampleBuf.length - handle.watermark;
        const take = Math.min(chunk.length, room);
        if (take > 0) {
            handle.sampleBuf.set(chunk.subarray(0, take), handle.watermark);
            handle.watermark += take;
        }
    };

    const fail = (err) => {
        handle.error = err;
        handle.ready.reject(err);
        handle.done.reject(err);
    };

    (async () => {
        let res;
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

                const manifest = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + manifestLen)));
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
        const head = { chunks: [], length: 0 };
        let manifestLen = -1;

        const headBytes = (n) => {
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

        const dropHeadBytes = (n) => {
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
                    const manifest = JSON.parse(new TextDecoder().decode(all.subarray(4)));
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
            if (handle.watermark !== handle.sampleBuf.length) {
                throw new Error(`Truncated stream: watermark ${handle.watermark} of ${handle.sampleBuf.length}`);
            }
            handle.done.resolve();
        } catch (err) {
            fail(err);
        }
    })();

    return handle;
}

window.ActiveFrame = class ActiveFrame {
    file = null;
    manifest = null;
    data = null;
    decoder = null;
    frame = null;
    desideredFrame = 0;
    enabled = true;
    framesByTimestamp = new Map();
    frameProcessed = null;
    waiter = null;
    handle = null;
    _watermarkListener = null;

    constructor(file, {
        process = () => {},
        // texture = null,
        hardwareAcceleration = 'prefer-hardware'
    }) {
        this.loading = Promise.create();
        this.process = process;
        // this.texture = texture;
        this.hardwareAcceleration = hardwareAcceleration;

        this.file = file;
        this.init();
    }

    async init() {
        if (!cacheActiveFrameList.has(this.file)) {
            cacheActiveFrameList.set(this.file, streamingLoad(this.file));
        }
        const handle = cacheActiveFrameList.get(this.file);
        handle.refs += 1;
        this.handle = handle;

        try {
            await handle.ready;
        } catch (err) {
            this.loading.reject(err);
            return;
        }

        // destroy() may have run during await; bail without mutating.
        if (this.handle !== handle) return;

        this.manifest = handle.manifest;
        this.data = handle.sampleBuf;

        this.manifest.frames.forEach(frame => {
            // preallocate data view for faster access
            frame.data = new Uint8Array(this.data.buffer, this.data.byteOffset + frame.o, frame.l);
            this.framesByTimestamp.set(frame.t, frame.i);
        });

        await this.initDecoder();

        if (this.handle !== handle) return;

        this._watermarkListener = (watermark) => this.flushWaiter(watermark);
        handle.listeners.add(this._watermarkListener);

        this.loading.resolve();
    }

    async loadBinary(file) {
        // Kept for backwards-compatible API surface; not used internally.
        const handle = streamingLoad(file);
        await handle.done;
        return { manifest: handle.manifest, data: handle.sampleBuf };
    }

    decodeDescription(description) {
        const binaryString = atob(description);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async initDecoder() {
        const baseConfig = {
            codec: this.manifest.codec,
            codedWidth: this.manifest.width,
            codedHeight: this.manifest.height,
            colorSpace: {
                primaries: 'bt709',
                transfer: 'bt709',
                matrix: 'bt709',
                fullRange: false
            },
            description: this.decodeDescription(this.manifest.description)
        };

        const candidates = [
            { ...baseConfig, hardwareAcceleration: this.hardwareAcceleration, optimizeForLatency: true },
            { ...baseConfig, hardwareAcceleration: this.hardwareAcceleration },
            { ...baseConfig, optimizeForLatency: true },
            { ...baseConfig }
        ];

        this.config = null;

        for (const candidate of candidates) {
            const support = await VideoDecoder.isConfigSupported(candidate);
            if (support.supported) {
                this.config = candidate;
                break;
            }
        }

        if (!this.config) {
            throw new Error('Decoder not supported');
        }

        this.decoder = new VideoDecoder({
            output: this.outputFrame.bind(this),
            error: (e) => {
                console.log(this.file);
                console.log(this.config);
                console.error('Decoder error:', e);
            }
        });

        // this.decoder.reset();
        this.decoder.configure(this.config);
    }

    async outputFrame(frame) {
        if (!this.enabled) {
            frame.close();
            return;
        };

        const timestampToFrameId = this.framesByTimestamp.get(frame.timestamp);

        if (this.desideredFrame !== timestampToFrameId) {
            frame.close();
            return;
        }

        this.frame = timestampToFrameId;

        if (this.process) {
            await this.process(frame);
        }

        // if (this.texture) {
        //     this.texture.image = frame;
        //     Texture.renderer.manualUpdateDynamic(this.texture);
        // }

        this.frameProcessed = timestampToFrameId;

        frame.close();
    }

    setFrame(desideredFrame) {
        if (!this.manifest) return;
        if (!this.enabled) return;

        desideredFrame = Math.round(Number(desideredFrame));
        const maxFrame = Math.max(0, this.manifest.totalFrames - 1);
        desideredFrame = Math.min(Math.max(desideredFrame, 0), maxFrame);
        this.desideredFrame = desideredFrame;

        const frameMeta = this.manifest.frames[this.desideredFrame];

        if (!frameMeta) {
            return;
        }

        // Walk back to nearest keyframe; track max byte end across keyframe + deltas.
        let requiredEnd = frameMeta.o + frameMeta.l;
        for (let i = this.desideredFrame; i >= 0; i--) {
            const f = this.manifest.frames[i];
            const end = f.o + f.l;
            if (end > requiredEnd) requiredEnd = end;
            if (f.ty === 'key') break;
        }

        if (requiredEnd > this.handle.watermark) {
            this.waiter = { frame: this.desideredFrame, byteEnd: requiredEnd };
            // Clear pending state: any in-flight decode for a different frame
            // is stale, and we must not let a future setFrame() to the old
            // _pendingFrame get dedup-blocked.
            this._pendingFrame = null;
            return; // last decoded frame stays on screen
        }
        this.waiter = null;

        if (this.desideredFrame === this.frame) return;
        if (this.desideredFrame === this._pendingFrame) return;

        this._pendingFrame = desideredFrame;

        const isSequential = this.frame !== null
        && this.desideredFrame === this.frame + 1
        && frameMeta.ty === 'delta';

        if (isSequential) {
            this.decoder.decode(new EncodedVideoChunk({
                type: frameMeta.ty,
                timestamp: frameMeta.t,
                data: frameMeta.data
            }));
            return;
        }

        if (this.decoder.decodeQueueSize > 0 || this.decoder.state !== 'configured') {
            this.decoder.reset();
            this.decoder.configure(this.config);
        }

        if (frameMeta.ty === 'key') {
            this.decoder.decode(new EncodedVideoChunk({
                type: frameMeta.ty,
                timestamp: frameMeta.t,
                data: frameMeta.data
            }));

        } else {
            let keyFrame = null;
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
                data: keyFrame.data
            }));

            for (let i = keyFrame.i + 1; i <= this.desideredFrame; i++) {
                const f = this.manifest.frames[i];
                if (f.ty === 'delta') {
                    this.decoder.decode(new EncodedVideoChunk({
                        type: f.ty,
                        timestamp: f.t,
                        data: f.data
                    }));
                } else {
                    break;
                }
            }
        }
    }

    flushWaiter(watermark) {
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

    destroy() {
        if (this.handle) {
            if (this._watermarkListener) {
                this.handle.listeners.delete(this._watermarkListener);
            }
            this.handle.refs -= 1;
            if (this.handle.refs <= 0) {
                cacheActiveFrameList.delete(this.file);
            }
        }
        this.decoder?.close();
        this.decoder = null;
        this.data = null;
        this.manifest = null;
        this.handle = null;
        this.file = null;
        // this.texture?.destroy?.();
        // this.texture = null;
        this.process = null;
        this.frameProcessed = null;
        this.waiter = null;
        this.enabled = false;
        this.framesByTimestamp.clear();
    }
}
