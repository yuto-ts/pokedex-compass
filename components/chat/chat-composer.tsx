'use client';
import { ArrowUp, Square } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useSyncStatus } from '@/lib/chat/context';
import { setPrefs } from '@/lib/chat/store';
import type { Sending } from './use-chat';

const MAX = 8000;

export function ChatComposer({
  draft,
  sending,
  streaming,
  error,
  disabledReason,
  onSend,
  onCancel,
}: {
  draft: string;
  sending: Sending;
  streaming: boolean;
  error: string;
  disabledReason: string;
  onSend: () => void;
  onCancel: () => void;
}) {
  const sync = useSyncStatus();
  const busy = sending !== 'idle' || streaming;
  const reason = !sync.loaded ? '収集状況を読み込み中です' : disabledReason;
  const canSend = !busy && !reason && !!draft.trim() && draft.length <= MAX;
  const note =
    sending === 'syncing'
      ? '収集状況を同期中…'
      : sending === 'posting'
        ? '送信中…'
        : reason;

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      {error && (
        <div className="chat-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onSend} disabled={busy}>
            再試行
          </button>
        </div>
      )}
      <Textarea
        aria-label="質問を入力"
        placeholder="ポケモンについて質問（Enter で送信、Shift+Enter で改行）"
        value={draft}
        disabled={sending !== 'idle'}
        maxLength={MAX}
        onChange={(e) => setPrefs({ draft: e.target.value })}
        onKeyDown={(e) => {
          // isComposing: Enter that confirms IME conversion must not send.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="chat-composer-row">
        <span className="chat-note" aria-live="polite">
          {note}
        </span>
        {streaming ? (
          <button type="button" className="chat-stop" onClick={onCancel}>
            <Square size={12} fill="currentColor" /> 停止
          </button>
        ) : (
          <button
            type="submit"
            className="chat-send"
            disabled={!canSend}
            aria-label="送信"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
