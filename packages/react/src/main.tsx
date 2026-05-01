import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ActiveFrame, { type ActiveFrameHandle } from './ActiveFrame';

function App() {
  const ref = useRef<ActiveFrameHandle>(null);
  const [src] = useState(() => {
    const portrait = window.innerWidth < window.innerHeight;
    const codec = 'VideoDecoder' in window ? 'h265' : 'h264';
    return `/assets/${portrait ? 'p_' : ''}meridian_${codec}.af`;
  });

  useEffect(() => {
    const onScroll = () => {
      const total = ref.current?.getManifest()?.totalFrames ?? 0;
      if (!total) return;
      const progress = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      const frame = Math.round(progress * (total - 1));
      ref.current?.setFrame(frame);
      const out = document.getElementById('frame');
      if (out) out.textContent = `Frame: ${frame}`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ActiveFrame
      ref={ref}
      src={src}
      fit="cover"
      onReady={() => ref.current?.setFrame(0)}
    />
  );
}

if (history.scrollRestoration) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
