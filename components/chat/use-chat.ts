'use client';
// Connection, threads, streaming and sending for the chat dock
// (docs/chat-sidebar.md §6.3, §7.3, §7.4).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BridgeError,
  bridge,
  streamJob,
  type ChatMessage,
  type Health,
  type JobEvent,
  type ProviderInfo,
  type Thread,
  type ThreadSummary,
} from '@/lib/chat/client';
import { ensureSynced, forgetSynced, getPageContext } from '@/lib/chat/context';
import { getPrefs, setPrefs, type ChatPrefs } from '@/lib/chat/store';

export type Conn =
  | { kind: 'checking'; slow: boolean }
  | { kind: 'offline' }
  | { kind: 'denied' }
  | { kind: 'origin' }
  | { kind: 'ready'; health: Health };

export type Auth = 'missing' | 'checking' | 'ok' | 'invalid';
export type Sending = 'idle' | 'syncing' | 'posting';

export const INTERRUPTED = 'ブリッジが停止したため中断しました';

const NO_PROVIDERS: ProviderInfo[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function patchMessage(
  thread: Thread | null,
  id: string,
  fn: (m: ChatMessage) => ChatMessage,
): Thread | null {
  if (!thread) return thread;
  return {
    ...thread,
    messages: thread.messages.map((m) => (m.id === id ? fn(m) : m)),
  };
}

// Chrome keeps the fetch pending while its local network prompt is open and
// fails it at once after "block"; the permission API tells the two apart.
async function localNetworkDenied() {
  try {
    const status = await navigator.permissions.query({
      name: 'local-network-access' as PermissionName,
    });
    return status.state === 'denied';
  } catch {
    return false;
  }
}

export function pickModel(providers: ProviderInfo[], prefs: ChatPrefs) {
  const provider =
    providers.find((p) => p.id === prefs.provider && p.available) ??
    providers.find((p) => p.available);
  const model =
    provider && provider.models.includes(prefs.model)
      ? prefs.model
      : provider?.default;
  return { provider, model };
}

export function useChat(prefs: ChatPrefs) {
  const [conn, setConn] = useState<Conn>({ kind: 'checking', slow: false });
  const [attempt, setAttempt] = useState(0);
  const [authResult, setAuthResult] = useState<{
    token: string;
    ok: boolean;
  }>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [tool, setTool] = useState('');
  const [sending, setSending] = useState<Sending>('idle');
  const [error, setError] = useState('');
  const threadSeq = useRef(0);

  // No request to 127.0.0.1 until the dock is opened or a token is saved:
  // the first one raises Chrome's local network prompt.
  const active = prefs.open || !!prefs.token;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const slow = setTimeout(() => {
      if (alive)
        setConn((c) =>
          c.kind === 'checking' ? { kind: 'checking', slow: true } : c,
        );
    }, 1500);
    bridge
      .health()
      .then((health) => {
        if (alive) setConn({ kind: 'ready', health });
      })
      .catch(async (e: unknown) => {
        if (!alive) return;
        if (e instanceof BridgeError && e.code === 'origin_not_allowed')
          setConn({ kind: 'origin' });
        else
          setConn({
            kind: (await localNetworkDenied()) ? 'denied' : 'offline',
          });
      })
      .finally(() => clearTimeout(slow));
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [active, attempt]);

  const ready = conn.kind === 'ready';
  const token = prefs.token;
  useEffect(() => {
    if (!ready || !token) return;
    let alive = true;
    bridge
      .threads()
      .then((list) => {
        if (!alive) return;
        setThreads(list);
        setAuthResult({ token, ok: true });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof BridgeError && e.status === 401)
          setAuthResult({ token, ok: false });
        else setConn({ kind: 'offline' });
      });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  const auth: Auth = !token
    ? 'missing'
    : authResult?.token !== token
      ? 'checking'
      : authResult.ok
        ? 'ok'
        : 'invalid';
  const authed = ready && auth === 'ok';

  const refreshThreads = useCallback(() => {
    bridge
      .threads()
      .then(setThreads)
      .catch(() => {});
  }, []);

  // Only the newest request may replace the shown thread.
  const loadThread = useCallback((id: string) => {
    const seq = ++threadSeq.current;
    return bridge.thread(id).then(
      (t) => {
        if (seq === threadSeq.current) setThread(t);
        return t;
      },
      (e: unknown) => {
        if (seq !== threadSeq.current) return undefined;
        if (e instanceof BridgeError && e.status === 404) {
          setThread(null);
          if (getPrefs().threadId === id) setPrefs({ threadId: null });
        } else if (e instanceof BridgeError) setError(e.message);
        return undefined;
      },
    );
  }, []);

  const threadId = prefs.threadId;
  useEffect(() => {
    if (authed && threadId) void loadThread(threadId);
  }, [authed, threadId, loadThread]);

  const current = thread && thread.id === threadId ? thread : null;
  const live = current?.messages.findLast(
    (m) => m.role === 'assistant' && m.status === 'streaming' && m.jobId,
  );
  const jobId = live?.jobId;
  const messageId = live?.id;
  const liveThreadId = current?.id;

  // Attach to the running job: `snapshot` replaces the text, `delta` appends
  // (§5.2, §7.3). Deltas are applied once per animation frame.
  useEffect(() => {
    if (!authed || !jobId || !messageId || !liveThreadId) return;
    const ctrl = new AbortController();
    let buffer = '';
    let frame = 0;
    const flush = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      const text = buffer;
      buffer = '';
      if (text)
        setThread((t) =>
          patchMessage(t, messageId, (m) => ({
            ...m,
            content: m.content + text,
          })),
        );
    };
    const onEvent = (ev: JobEvent) => {
      if (ev.event === 'snapshot') {
        cancelAnimationFrame(frame);
        frame = 0;
        buffer = '';
        setThread((t) =>
          patchMessage(t, messageId, (m) => ({
            ...m,
            content: ev.data.content,
          })),
        );
      } else if (ev.event === 'delta') {
        setTool('');
        buffer += ev.data.text;
        if (!frame) frame = requestAnimationFrame(flush);
      } else if (ev.event === 'status') {
        setTool(ev.data.name);
      } else if (ev.event === 'done') {
        flush();
        setTool('');
      }
    };
    void (async () => {
      for (let tries = 0; !ctrl.signal.aborted; tries++) {
        try {
          const result = await streamJob(jobId, onEvent, ctrl.signal);
          if (result !== 'closed' || tries >= 5) break;
        } catch {
          if (ctrl.signal.aborted || tries >= 5) break;
        }
        await sleep(1000);
      }
      if (ctrl.signal.aborted) return;
      flush();
      setTool('');
      // The thread file holds the final status (done / cancelled / error).
      const t = await loadThread(liveThreadId);
      if (t?.messages.find((m) => m.id === messageId)?.status === 'streaming')
        setThread((x) =>
          patchMessage(x, messageId, (m) => ({
            ...m,
            status: 'error',
            error: INTERRUPTED,
            jobId: undefined,
          })),
        );
      refreshThreads();
    })();
    return () => {
      ctrl.abort();
      cancelAnimationFrame(frame);
    };
  }, [authed, jobId, messageId, liveThreadId, loadThread, refreshThreads]);

  const providers =
    conn.kind === 'ready' ? conn.health.providers : NO_PROVIDERS;

  const send = useCallback(async () => {
    const p = getPrefs();
    const content = p.draft.trim();
    const { provider, model } = pickModel(providers, p);
    if (!content || !provider || !model) return;
    setError('');
    setSending('syncing');
    let contextId: string;
    try {
      contextId = await ensureSynced();
    } catch (e) {
      setSending('idle');
      setError(
        '収集状況を同期できなかったため送信していません。' +
          (e instanceof Error ? e.message : ''),
      );
      return;
    }
    setSending('posting');
    try {
      let id = p.threadId;
      if (!id) {
        const created = await bridge.createThread(provider.id, model);
        id = created.id;
        threadSeq.current++;
        setThread(created);
        setPrefs({ threadId: id });
      }
      const body = {
        content,
        contextId,
        page: getPageContext(),
        provider: provider.id,
        model,
      };
      try {
        await bridge.send(id, body);
      } catch (e) {
        if (!(e instanceof BridgeError && e.code === 'context_not_found'))
          throw e;
        // The bridge pruned the snapshot or its workspace was reset.
        forgetSynced();
        await bridge.send(id, { ...body, contextId: await ensureSynced() });
      }
      setPrefs({ draft: '' });
      await loadThread(id);
      refreshThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信できませんでした。');
    } finally {
      setSending('idle');
    }
  }, [providers, loadThread, refreshThreads]);

  const cancel = useCallback(() => {
    if (jobId) bridge.cancel(jobId).catch(() => {});
  }, [jobId]);

  return {
    conn,
    auth,
    authed,
    providers,
    threads,
    thread: current,
    streaming: !!live,
    tool,
    sending,
    error,
    send,
    cancel,
    refreshThreads,
    retry: () => {
      setConn({ kind: 'checking', slow: false });
      setAttempt((a) => a + 1);
    },
    newThread: () => {
      setError('');
      setPrefs({ threadId: null });
    },
    openThread: (t: ThreadSummary) => {
      setError('');
      setPrefs({ threadId: t.id, provider: t.provider, model: t.model });
    },
    deleteThread: async (id: string) => {
      await bridge.deleteThread(id).catch(() => {});
      if (getPrefs().threadId === id) setPrefs({ threadId: null });
      refreshThreads();
    },
  };
}

export type Chat = ReturnType<typeof useChat>;
