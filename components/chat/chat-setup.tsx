'use client';
import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { BRIDGE_URL } from '@/lib/chat/client';
import { setPrefs } from '@/lib/chat/store';
import type { Auth, Conn } from './use-chat';

function Command() {
  return <code className="chat-command">corepack pnpm chat</code>;
}

function TokenForm({ auth, token }: { auth: Auth; token: string }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="chat-token"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) setPrefs({ token: value.trim() });
        setValue('');
      }}
    >
      <label htmlFor="chat-token">接続トークン</label>
      <p>
        ブリッジの起動ログに表示されたトークンを貼り付けてください（
        <code>chat/workspace/.token</code>{' '}
        にも保存されています）。このブラウザの localStorage に保存します。
      </p>
      {auth === 'invalid' && (
        <p className="chat-error-text" role="alert">
          トークンが一致しません。ブリッジの起動ログを確認してください。
        </p>
      )}
      {auth === 'checking' && (
        <p className="chat-note">
          <LoaderCircle size={12} className="chat-spin" /> 確認中…
        </p>
      )}
      <div className="chat-token-row">
        <input
          id="chat-token"
          type="password"
          autoComplete="off"
          value={value}
          placeholder={token ? '保存済み（変更するときだけ入力）' : 'トークン'}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={!value.trim()}>
          保存
        </button>
      </div>
    </form>
  );
}

export function ChatSetup({
  conn,
  auth,
  token,
  onRetry,
}: {
  conn: Conn;
  auth: Auth;
  token: string;
  onRetry: () => void;
}) {
  if (conn.kind === 'checking')
    return (
      <div className="chat-setup">
        <p>
          <LoaderCircle size={14} className="chat-spin" />{' '}
          {conn.slow
            ? 'ブラウザの許可ダイアログ（ローカル ネットワークへのアクセス）が出ていたら「許可」を押してください。'
            : 'ブリッジに接続中…'}
        </p>
      </div>
    );

  if (conn.kind === 'denied')
    return (
      <div className="chat-setup">
        <h3>ローカル ネットワークへのアクセスが拒否されています</h3>
        <p>
          アドレスバー左のサイト情報アイコンから「ローカル
          ネットワークへのアクセス」を「許可」に戻し、ページを再読み込みしてください。
        </p>
        <button type="button" onClick={onRetry}>
          再接続
        </button>
      </div>
    );

  if (conn.kind === 'origin') {
    const origin = typeof location === 'undefined' ? '' : location.origin;
    // file:// pages send `Origin: null` although location.origin reads "file://".
    const file =
      typeof location !== 'undefined' && location.protocol === 'file:';
    return (
      <div className="chat-setup">
        <h3>このページはブリッジの許可リストにありません</h3>
        {file ? (
          <p>
            単一 HTML 版（file://）から使うには、<code>chat/config.json</code>{' '}
            の <code>allowNullOrigin</code> を <code>true</code>{' '}
            にしてブリッジを再起動してください。
          </p>
        ) : (
          <p>
            <code>chat/config.json</code> の <code>allowedOrigins</code> に{' '}
            <code>{origin}</code> を追加して、ブリッジを再起動してください。
          </p>
        )}
        <button type="button" onClick={onRetry}>
          再接続
        </button>
      </div>
    );
  }

  if (conn.kind === 'offline')
    return (
      <div className="chat-setup">
        <h3>ブリッジが起動していません</h3>
        <p>
          チャットはこの Mac で動く claude CLI
          に質問を中継します。リポジトリで次を実行してから再接続してください。
        </p>
        <Command />
        <p className="chat-note">
          接続先: {BRIDGE_URL}。対応ブラウザは Chrome です。
        </p>
        <button type="button" onClick={onRetry}>
          再接続
        </button>
      </div>
    );

  return (
    <div className="chat-setup">
      <TokenForm auth={auth} token={token} />
      <p className="chat-note">
        接続先: {BRIDGE_URL}。質問はこの Mac の claude
        CLI（サブスクリプション）で処理され、履歴もこの Mac に保存されます。
      </p>
    </div>
  );
}
