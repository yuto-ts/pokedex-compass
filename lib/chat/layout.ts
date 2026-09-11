// Shared by the chat dock and the server layout; no React imports here.
export const PREFS_KEY = 'dex-compass-chat-v1';
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 640;
export const DEFAULT_WIDTH = 400;

export const clampWidth = (w: number) =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w) || DEFAULT_WIDTH));

// Runs before the first paint (inline in <head>) so the page keeps its right
// padding across full-page navigations instead of jumping when React hydrates.
export const prePaintScript = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||'{}');if(s.open===true){var d=document.documentElement;d.classList.add('chat-open');d.style.setProperty('--chat-width',Math.min(${MAX_WIDTH},Math.max(${MIN_WIDTH},Math.round(Number(s.width))||${DEFAULT_WIDTH}))+'px')}}catch(e){}`;
