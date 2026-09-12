'use client';
// Right-hand chat dock (docs/chat-sidebar.md §7). Rendered next to the page
// in app/layout.tsx and standalone/main.tsx, so it is independent of DexApp.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  History,
  MessageCircle,
  PanelRightClose,
  Settings,
  SquarePen,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { modelLabel } from '@/lib/chat/models';
import {
  MAX_WIDTH,
  MIN_WIDTH,
  clampWidth,
  getPrefs,
  setPrefs,
  usePrefs,
  type ChatPrefs,
} from '@/lib/chat/store';
import { ChatComposer } from './chat-composer';
import { ChatSetup } from './chat-setup';
import { ChatThread } from './chat-thread';
import { ChatThreads } from './chat-threads';
import { pickModel, useChat, type Chat } from './use-chat';

type View = 'chat' | 'history' | 'settings';

// Same breakpoint as the existing mobile layout in app/globals.css.
const MOBILE = '(max-width: 640px)';
function subscribeMobile(fn: () => void) {
  const mql = window.matchMedia(MOBILE);
  mql.addEventListener('change', fn);
  return () => mql.removeEventListener('change', fn);
}
const useMobile = () =>
  useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE).matches,
    () => false,
  );

const reasons: Record<string, string> = {
  not_implemented: '未対応（フェーズ 2）',
  not_found: 'CLI が見つかりません',
};

function ModelBar({ chat, prefs }: { chat: Chat; prefs: ChatPrefs }) {
  const { provider, model } = pickModel(chat.providers, prefs);
  return (
    <div className="chat-models">
      <select
        aria-label="AI"
        value={provider?.id ?? ''}
        onChange={(e) => {
          const next = chat.providers.find((p) => p.id === e.target.value);
          if (next) setPrefs({ provider: next.id, model: next.default });
        }}
      >
        {chat.providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.available}>
            {p.label}
            {!p.available && `（${reasons[p.reason ?? ''] ?? '利用不可'}）`}
          </option>
        ))}
      </select>
      <select
        aria-label="モデル"
        value={model ?? ''}
        onChange={(e) => setPrefs({ model: e.target.value })}
      >
        {provider?.models.map((m) => (
          <option key={m} value={m}>
            {modelLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Panel({
  chat,
  prefs,
  view,
  setView,
  mobile,
}: {
  chat: Chat;
  prefs: ChatPrefs;
  view: View;
  setView: (v: View) => void;
  mobile: boolean;
}) {
  const ready = chat.conn.kind === 'ready';
  const showSetup = !chat.authed || view === 'settings';
  const noProvider = ready && !pickModel(chat.providers, prefs).provider;
  const toggle = (v: View) => setView(view === v ? 'chat' : v);
  // Before the first message the composer follows the intro instead of
  // sitting at the bottom of an empty panel.
  const empty = !showSetup && view === 'chat' && !chat.thread?.messages.length;
  return (
    <div className={empty ? 'chat-ui is-empty' : 'chat-ui'}>
      <div className="chat-head">
        <b>ポケモン相談</b>
        <div className="chat-actions">
          <button
            type="button"
            className="chat-icon"
            aria-label="新しいスレッド"
            title="新しいスレッド"
            disabled={!chat.authed}
            onClick={() => {
              chat.newThread();
              setView('chat');
            }}
          >
            <SquarePen size={16} />
          </button>
          <button
            type="button"
            className="chat-icon"
            aria-label="履歴"
            title="履歴"
            aria-pressed={view === 'history'}
            disabled={!chat.authed}
            onClick={() => {
              if (view !== 'history') chat.refreshThreads();
              toggle('history');
            }}
          >
            <History size={16} />
          </button>
          <button
            type="button"
            className="chat-icon"
            aria-label="接続設定"
            title="接続設定"
            aria-pressed={view === 'settings'}
            onClick={() => toggle('settings')}
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            className="chat-icon"
            aria-label="チャットを閉じる"
            title="閉じる"
            onClick={() => setPrefs({ open: false })}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>
      {showSetup ? (
        <ChatSetup
          conn={chat.conn}
          auth={chat.auth}
          token={prefs.token}
          onRetry={chat.retry}
        />
      ) : view === 'history' ? (
        <ChatThreads
          threads={chat.threads}
          currentId={prefs.threadId}
          onOpen={(t) => {
            chat.openThread(t);
            setView('chat');
          }}
          onDelete={chat.deleteThread}
        />
      ) : (
        <>
          <ModelBar chat={chat} prefs={prefs} />
          <ChatThread
            thread={chat.thread}
            tool={chat.tool}
            onExample={(text) => setPrefs({ draft: text })}
          />
          <ChatComposer
            draft={prefs.draft}
            sending={chat.sending}
            streaming={chat.streaming}
            error={chat.error}
            disabledReason={noProvider ? '利用できる AI がありません' : ''}
            enterSends={!mobile}
            onSend={chat.send}
            onCancel={chat.cancel}
          />
        </>
      )}
    </div>
  );
}

function ResizeHandle({ width }: { width: number }) {
  const drag = useRef<number | null>(null);
  const apply = (w: number) =>
    document.documentElement.style.setProperty('--chat-width', `${w}px`);
  return (
    <button
      type="button"
      className="chat-resize"
      aria-label={`チャットの幅 ${width}px（${MIN_WIDTH}〜${MAX_WIDTH}px、← → キーで変更）`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = width;
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        drag.current = clampWidth(window.innerWidth - e.clientX);
        apply(drag.current);
      }}
      onPointerUp={() => {
        if (drag.current !== null) setPrefs({ width: drag.current });
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
        apply(width);
      }}
      onKeyDown={(e) => {
        const step =
          e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : 0;
        if (!step) return;
        e.preventDefault();
        setPrefs({ width: clampWidth(getPrefs().width + step) });
      }}
    />
  );
}

export default function ChatDock() {
  const prefs = usePrefs();
  const chat = useChat(prefs);
  const mobile = useMobile();
  const [view, setView] = useState<View>('chat');

  // Read the store directly: during hydration `prefs` is still the server
  // snapshot (closed) and would undo the pre-paint class for one frame.
  useLayoutEffect(() => {
    const p = getPrefs();
    const root = document.documentElement;
    root.classList.toggle('chat-open', p.open);
    root.style.setProperty('--chat-width', `${p.width}px`);
  }, [prefs.open, prefs.width]);

  // The sheet follows the visual viewport, so the composer stays above the
  // on-screen keyboard and the panel does not jump when Safari's toolbars
  // slide in and out.
  useEffect(() => {
    const vv =
      typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!mobile || !prefs.open || !vv) return;
    const apply = () => {
      const root = document.documentElement.style;
      root.setProperty('--chat-vvh', `${vv.height}px`);
      root.setProperty('--chat-vvtop', `${vv.offsetTop}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, [mobile, prefs.open]);

  const tab = (
    <button
      type="button"
      className="chat-tab"
      aria-label="チャットを開く"
      onClick={() => setPrefs({ open: true })}
    >
      <MessageCircle size={18} />
      <span>チャット</span>
    </button>
  );
  // Sits where the open tab was, on the panel edge (desktop only).
  const closeTab = (
    <button
      type="button"
      className="chat-tab chat-close-tab"
      aria-label="チャットを閉じる"
      onClick={() => setPrefs({ open: false })}
    >
      <PanelRightClose size={18} />
      <span>閉じる</span>
    </button>
  );
  const panel = (
    <Panel
      chat={chat}
      prefs={prefs}
      view={view}
      setView={setView}
      mobile={mobile}
    />
  );

  if (mobile)
    return (
      <>
        {tab}
        <Sheet open={prefs.open} onOpenChange={(open) => setPrefs({ open })}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="chat-sheet"
          >
            <SheetTitle className="sr-only">ポケモン相談チャット</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );

  return (
    <>
      {tab}
      {closeTab}
      <aside className="chat-dock" aria-label="ポケモン相談チャット">
        <ResizeHandle width={prefs.width} />
        {panel}
      </aside>
    </>
  );
}
