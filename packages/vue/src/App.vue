<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import ActiveFrame from './ActiveFrame.vue';

const portrait = window.innerWidth < window.innerHeight;
const codec = 'VideoDecoder' in window ? 'h265' : 'h264';
const src = `/assets/${portrait ? 'p_' : ''}meridian_${codec}.af`;
const w = window.innerWidth;
const h = window.innerHeight;

const frame = ref<InstanceType<typeof ActiveFrame> | null>(null);
const frameLabel = ref('');
let total = 0;

const onScroll = () => {
  if (!total) return;
  const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
  const n = Math.round(progress * (total - 1));
  frame.value?.setFrame(n);
  frameLabel.value = `Frame: ${n}`;
};

onMounted(() => {
  if (history.scrollRestoration) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  window.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));

const onReady = (manifest: { totalFrames: number }) => {
  total = manifest.totalFrames;
  frame.value?.setFrame(0);
};
</script>

<template>
  <ActiveFrame
    ref="frame"
    :src="src"
    fit="cover"
    :width="w"
    :height="h"
    @ready="onReady"
  />
  <div id="frame">{{ frameLabel }}</div>
</template>
