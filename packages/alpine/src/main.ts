import Alpine from 'alpinejs';
import activeFramePlugin from './index';

Alpine.plugin(activeFramePlugin);
window.Alpine = Alpine;
Alpine.start();

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}
