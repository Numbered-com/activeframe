<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  attachCanvas,
  type ActiveFrameManifest,
  type AttachedCanvas,
  type FrameFit,
} from '@numbered/activeframe';

const props = withDefaults(
  defineProps<{
    src: string;
    fit?: FrameFit;
    hardwareAcceleration?: HardwareAcceleration;
  }>(),
  { fit: 'cover', hardwareAcceleration: 'prefer-hardware' },
);

const emit = defineEmits<{
  ready: [manifest: ActiveFrameManifest];
  error: [err: Error];
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let attached: AttachedCanvas | null = null;

function setup() {
  if (!canvas.value) return;
  attached?.destroy();

  const current = attachCanvas(canvas.value, props.src, {
    hardwareAcceleration: props.hardwareAcceleration,
    fit: props.fit,
  });
  attached = current;

  current.loading
    .then(() => {
      if (attached !== current) return;
      emit('ready', current.getManifest()!);
    })
    .catch((err: unknown) => {
      if (attached !== current) return;
      emit('error', err instanceof Error ? err : new Error(String(err)));
    });
}

onMounted(setup);

watch([() => props.src, () => props.hardwareAcceleration], setup);

watch(() => props.fit, (next) => attached?.setFit(next));

onBeforeUnmount(() => {
  attached?.destroy();
  attached = null;
});

defineExpose({
  setFrame: (n: number) => attached?.setFrame(n),
  getCurrentFrame: () => attached?.getCurrentFrame() ?? null,
  getManifest: () => attached?.getManifest() ?? null,
});
</script>

<template>
  <canvas ref="canvas" />
</template>
