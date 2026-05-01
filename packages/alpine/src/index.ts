import {
  attachCanvas,
  type ActiveFrameOptions,
  type AttachedCanvas,
  type FrameFit,
} from '@numbered/activeframe';
import type { Alpine } from 'alpinejs';

export interface ActiveFrameAlpineOptions extends Omit<ActiveFrameOptions, 'process'> {
  src: string;
  fit?: FrameFit;
}

export default function activeFramePlugin(Alpine: Alpine) {
  Alpine.data('activeframe', (options: ActiveFrameAlpineOptions) => ({
    attached: null as AttachedCanvas | null,

    init() {
      const canvas = (this.$refs.canvas ?? this.$el) as HTMLCanvasElement;

      this.attached = attachCanvas(canvas, options.src, {
        hardwareAcceleration: options.hardwareAcceleration ?? 'prefer-hardware',
        fit: options.fit ?? 'cover',
      });

      this.attached.loading.then(() => {
        this.attached?.setFrame(0);
        this.$dispatch('ready', { manifest: this.attached?.getManifest() });
      }).catch((err: unknown) => {
        this.$dispatch('error', { error: err });
      });
    },

    destroy() {
      this.attached?.destroy();
      this.attached = null;
    },

    setFrame(n: number) {
      this.attached?.setFrame(n);
    },

    setFit(fit: FrameFit) {
      this.attached?.setFit(fit);
    },

    getCurrentFrame(): number | null {
      return this.attached?.getCurrentFrame() ?? null;
    },
  }));
}
