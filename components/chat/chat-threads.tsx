'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ThreadSummary } from '@/lib/chat/client';

const time = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function ChatThreads({
  threads,
  currentId,
  onOpen,
  onDelete,
}: {
  threads: ThreadSummary[];
  currentId: string | null;
  onOpen: (t: ThreadSummary) => void;
  onDelete: (id: string) => void;
}) {
  const [target, setTarget] = useState<ThreadSummary | null>(null);
  return (
    <div className="chat-history">
      {threads.length === 0 ? (
        <p className="chat-empty">まだ履歴はありません。</p>
      ) : (
        <ul>
          {threads.map((t) => (
            <li key={t.id} className={t.id === currentId ? 'current' : ''}>
              <button
                type="button"
                className="chat-history-open"
                onClick={() => onOpen(t)}
              >
                <b>{t.title}</b>
                <small>
                  {time.format(new Date(t.updatedAt))} · {t.model}
                </small>
              </button>
              <button
                type="button"
                className="chat-icon"
                aria-label={`「${t.title}」を削除`}
                onClick={() => setTarget(t)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="chat-note">
        履歴はこの Mac のブリッジ（chat/workspace/history）に保存されます。別の
        Mac とは共有されません。
      </p>
      <AlertDialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <AlertDialogContent className="chat-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>スレッドを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{target?.title}
              」の会話をブリッジから削除します。元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>やめる</AlertDialogCancel>
            <button
              type="button"
              className="chat-danger"
              onClick={() => {
                if (target) onDelete(target.id);
                setTarget(null);
              }}
            >
              削除
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
