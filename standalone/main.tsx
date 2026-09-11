import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import ChatDock from '@/components/chat/chat-dock';
import DexApp from '@/components/dex-app';
import { setChatSource } from '@/lib/chat/context';
import '@/app/globals.css';

setChatSource('standalone');

const views = ['missing', 'legends', 'routes', 'bank', 'settings', 'living'];

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

function App() {
  const path = useSyncExternalStore(
    subscribe,
    () => location.hash.slice(1) || '/',
  );
  const id = Number(path.match(/^\/pokemon\/(\d+)$/)?.[1]);
  if (id >= 1 && id <= 1025) return <DexApp key={path} id={id} />;
  const view = path.slice(1);
  return <DexApp key={path} view={views.includes(view) ? view : undefined} />;
}

window.addEventListener('hashchange', () => window.scrollTo(0, 0));
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <ChatDock />
  </>,
);
