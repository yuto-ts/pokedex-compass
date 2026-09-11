import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { parseState } from '@/lib/state';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let ready: Promise<unknown> | undefined;

async function authorized(request: Request) {
  if (import.meta.env.DEV) return true;
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = env;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!team || !aud || !token) return false;
  const issuer = `https://${team}`;
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  try {
    await jwtVerify(token, jwks, { issuer, audience: aud });
    return true;
  } catch {
    return false;
  }
}

function db() {
  ready ??= env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, revision INTEGER NOT NULL)',
  )
    .run()
    .catch((e: unknown) => {
      ready = undefined;
      throw e;
    });
  return ready.then(() => env.DB);
}

const forbidden = () => Response.json({ error: 'forbidden' }, { status: 403 });

export async function GET(request: Request) {
  if (!(await authorized(request))) return forbidden();
  const d = await db();
  const row = await d
    .prepare('SELECT data, revision FROM state WHERE id = 1')
    .first<{ data: string; revision: number }>();
  return Response.json(
    { state: row ? JSON.parse(row.data) : null, revision: row?.revision ?? 0 },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  if (!(await authorized(request))) return forbidden();
  let data: string, revision: number;
  try {
    const body = (await request.json()) as {
      state: unknown;
      revision: unknown;
    };
    data = JSON.stringify(parseState(body.state));
    if (!Number.isInteger(body.revision) || (body.revision as number) < 0)
      throw Error('invalid revision');
    revision = body.revision as number;
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }
  const d = await db();
  const { meta } =
    revision === 0
      ? await d
          .prepare(
            'INSERT INTO state (id, data, revision) VALUES (1, ?, 1) ON CONFLICT (id) DO NOTHING',
          )
          .bind(data)
          .run()
      : await d
          .prepare(
            'UPDATE state SET data = ?, revision = revision + 1 WHERE id = 1 AND revision = ?',
          )
          .bind(data, revision)
          .run();
  if (!meta.changes)
    return Response.json({ error: 'conflict' }, { status: 409 });
  return Response.json({ revision: revision + 1 });
}
