'use client';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { LoaderCircle } from 'lucide-react';
import {
  Message,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import type { ChatMessage, Thread } from '@/lib/chat/client';
import { modelLabel } from '@/lib/chat/models';

if (DOMPurify.isSupported)
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

function toHtml(text: string) {
  if (!DOMPurify.isSupported) return '';
  const html = marked.parse(text, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html);
}

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => toHtml(text), [text]);
  return <div className="chat-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

const toolLabel: Record<string, string> = {
  Skill: '収集状況の調べ方を確認中…',
  Read: '収集状況を読み込み中…',
};

function Footer({ m, tool }: { m: ChatMessage; tool: string }) {
  if (m.status === 'streaming')
    return (
      <MessageFooter className="chat-meta">
        <LoaderCircle size={12} className="chat-spin" />
        {toolLabel[tool] ?? (m.content ? '回答中…' : '考え中…')}
      </MessageFooter>
    );
  if (m.status === 'cancelled')
    return <MessageFooter className="chat-meta">中止しました</MessageFooter>;
  if (m.status === 'error')
    return (
      <MessageFooter className="chat-meta chat-error-text">
        エラー: {m.error ?? '不明なエラー'}
      </MessageFooter>
    );
  return m.model ? (
    <MessageFooter className="chat-meta">{modelLabel(m.model)}</MessageFooter>
  ) : null;
}

const examples = [
  'まだ捕まえていない伝説のポケモンは？',
  'このポケモンの入手方法を教えて',
  'HOMEに送っていないのは何匹？',
];

export function ChatThread({
  thread,
  tool,
  onExample,
}: {
  thread: Thread | null;
  tool: string;
  onExample: (text: string) => void;
}) {
  const messages = thread?.messages ?? [];
  if (!messages.length)
    return (
      <div className="chat-empty">
        <p>
          ポケモンのことや、あなたの収集状況について質問できます。いま開いているページも一緒に伝わります。
        </p>
        <div className="chat-examples">
          {examples.map((e) => (
            <button key={e} type="button" onClick={() => onExample(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="chat-scroller">
        <MessageScrollerViewport aria-label="会話">
          <MessageScrollerContent className="chat-messages">
            {messages.map((m) => (
              <MessageScrollerItem
                key={m.id}
                messageId={m.id}
                scrollAnchor={m.role === 'user'}
              >
                <Message
                  align={m.role === 'user' ? 'end' : 'start'}
                  className={'chat-message ' + m.role}
                >
                  <MessageContent>
                    {m.role === 'user' ? (
                      <div className="chat-bubble">{m.content}</div>
                    ) : m.content ? (
                      <Markdown text={m.content} />
                    ) : null}
                    <Footer m={m} tool={tool} />
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
