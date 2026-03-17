/// <reference types="vite/client" />

// Декларации для импорта изображений через Vite
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}

declare module "*.icns" {
  const src: string;
  export default src;
}

// Типизация window.electronAPI (краткая, полная — в lib/electron.ts)
interface Window {
  electronAPI?: Record<string, any>;
}
