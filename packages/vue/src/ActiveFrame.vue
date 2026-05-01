<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ActiveFrame as ActiveFrameCore,
  drawFrame,
  type ActiveFrameManifest,
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
let instance: ActiveFrameCore | null = null;

onMounted(() => {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  instance = new ActiveFrameCore(props.src, {
    hardwareAcceleration: props.hardwareAcceleration,
    process: (frame) => drawFrame(frame, ctx, props.fit),
  });

  instance.loading
    .then(() => emit('ready', instance!.manifest!))
    .catch((err: unknown) => emit('error', err instanceof Error ? err : new Error(String(err))));
});

onBeforeUnmount(() => {
  instance?.destroy();
  instance = null;
});

defineExpose({
  setFrame: (n: number) => instance?.setFrame(n),
  getCurrentFrame: () => instance?.frame ?? null,
  getManifest: () => instance?.manifest ?? null,
});
</script>

<template>
  <canvas ref="canvas" />
</template>
