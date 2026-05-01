import {
  ActiveFrame as ActiveFrameCore,
  drawFrame,
  type ActiveFrameOptions,
  type FrameFit,
} from '@numbered/activeframe';
import type { Alpine } from 'alpinejs';

export interface ActiveFrameAlpineOptions extends Omit<ActiveFrameOptions, 'process'> {
  src: string;
  fit?: FrameFit;
}

export default function activeFramePlugin(Alpine: Alpine) {
  Alpine.data('activeframe', (options: ActiveFrameAlpineOptions) => ({
    instance: null as ActiveFrameCore | null,

    init() {
      const canvas = (this.$refs.canvas ?? this.$el) as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const fit = options.fit ?? 'cover';
      this.instance = new ActiveFrameCore(options.src, {
        hardwareAcceleration: options.hardwareAcceleration ?? 'prefer-hardware',
        process: (frame) => drawFrame(frame, ctx, fit),
      });

      this.instance.loading.then(() => {
        this.instance?.setFrame(0);
        this.$dispatch('ready', { manifest: this.instance?.manifest });
      }).catch((err: unknown) => {
        this.$dispatch('error', { error: err });
      });
    },

    destroy() {
      this.instance?.destroy();
      this.instance = null;
    },

    setFrame(n: number) {
      this.instance?.setFrame(n);
    },

    getCurrentFrame(): number | null {
      return this.instance?.frame ?? null;
    },
  }));
}
