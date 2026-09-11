// fetch / SSE client for the local chat bridge (docs/chat-sidebar.md §5.2).
import config from '@/chat/config.json';
import { getPrefs } from './store';

export const BRIDGE_URL = `http://127.0.0.1:${config.port}`;

export type ProviderInfo = {
  id: string;
  label: string;
  default: string;
  models: string[];
  available: boolean;
  reason?: 'not_implemented' | 'not_found';
};
export type Health = { version: number; providers: ProviderInfo[] };
export type Page = { view: string; pokemonId?: number; label: string };
export type MessageStatus = 'done' | 'streaming' | 'cancelled' | 'error';
export type Usage = { inputTokens?: number; outputTokens?: number };
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  error?: string;
  jobId?: string;
  contextId?: string;
  page?: Page;
  provider?: string;
  model?: string;
  usage?: Usage;
  createdAt: string;
};
export type Thread = {
  id: string;
  title: string;
  provider: string;
  model: string;
  cliSessionId?: string;
  lastContextId?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};
export type ThreadSummary = Pick<
  Thread,
  'id' | 'title' | 'provider' | 'model' | 'updatedAt'
>;

export type JobEvent =
  | {
      event: 'snapshot';
      data: { messageId: string; status: MessageStatus; content: string };
    }
  | {
      event: 'meta';
      data: {
        provider: string;
        model: string;
        contextId: string;
        cliSessionId?: string;
      };
    }
  | { event: 'delta'; data: { text: string } }
  | { event: 'status'; data: { kind: 'tool'; name: string } }
  | {
      event: 'done';
      data: { status: MessageStatus; error?: string; usage?: Usage };
    };

export class BridgeError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const UNREACHABLE =
  'ブリッジに接続できません。`corepack pnpm chat` が起動しているか確認してください。';

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BRIDGE_URL + path, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${getPrefs().token}`,
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new BridgeError(0, 'unreachable', UNREACHABLE);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok)
    throw new BridgeError(
      res.status,
      data.error ?? `http_${res.status}`,
      res.status === 401
        ? '接続トークンが一致しません。'
        : (data.message ??
            `ブリッジがエラーを返しました（HTTP ${res.status}）`),
    );
  return data as T;
}

export const bridge = {
  // No token: /health is how the dock finds out whether the bridge runs.
  async health(): Promise<Health> {
    let res: Response;
    try {
      res = await fetch(BRIDGE_URL + '/health');
    } catch {
      throw new BridgeError(0, 'unreachable', UNREACHABLE);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok)
      throw new BridgeError(res.status, data.error ?? 'health', UNREACHABLE);
    return data as Health;
  },
  threads: () =>
    call<{ threads: ThreadSummary[] }>('/threads').then((r) => r.threads),
  createThread: (provider: string, model: string) =>
    call<Thread>('/threads', { method: 'POST', body: { provider, model } }),
  thread: (id: string) => call<Thread>(`/threads/${id}`),
  deleteThread: (id: string) =>
    call<void>(`/threads/${id}`, { method: 'DELETE' }),
  send: (
    id: string,
    body: {
      content: string;
      contextId: string;
      page: Page;
      provider: string;
      model: string;
    },
  ) =>
    call<{ jobId: string; messageId: string; userMessageId: string }>(
      `/threads/${id}/messages`,
      { method: 'POST', body },
    ),
  putContext: (body: { source: string; collection: string; state: unknown }) =>
    call<{ contextId: string }>('/contexts', { method: 'PUT', body }),
  cancel: (jobId: string) =>
    call<{ status: MessageStatus }>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),
};

function parseEvent(raw: string): JobEvent | undefined {
  let event = '';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!event || !data) return undefined;
  try {
    return { event, data: JSON.parse(data) } as JobEvent;
  } catch {
    return undefined;
  }
}

// Reads GET /jobs/:id/events with fetch (EventSource cannot send the token).
// Resolves 'done' after the done event, 'gone' on 404 and 'closed' when the
// stream ends early; throws on network errors so the caller can reconnect.
export async function streamJob(
  jobId: string,
  onEvent: (e: JobEvent) => void,
  signal: AbortSignal,
): Promise<'done' | 'gone' | 'closed'> {
  const res = await fetch(`${BRIDGE_URL}/jobs/${jobId}/events`, {
    headers: { authorization: `Bearer ${getPrefs().token}` },
    signal,
  });
  if (res.status === 404) return 'gone';
  if (!res.ok || !res.body)
    throw new BridgeError(res.status, 'events', `HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let i;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      const ev = parseEvent(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
      if (!ev) continue;
      onEvent(ev);
      if (ev.event === 'done') finished = true;
    }
  }
  return finished ? 'done' : 'closed';
}
