// Minimal emulation of the parts of Supabase our migrations rely on
// (auth.uid(), auth.users, storage schema, the "authenticated" role),
// running in a real PostgreSQL engine (PGlite).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sql = f => readFileSync(path.join(root, 'supabase', f), 'utf8');

export const SUPABASE_EMULATION = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage; create schema extensions;
grant usage on schema public, auth, storage, extensions to anon, authenticated;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
grant execute on all functions in schema auth to anon, authenticated;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant execute on all functions in schema storage to anon, authenticated;
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const MIGRATIONS = ['schema.sql', 'v21-approval.sql', 'v22-invitations.sql', 'v23-homework.sql'];

export async function freshDb({withV26 = true, v27Twice = true} = {}) {
  const db = new PGlite({extensions: {pgcrypto}});
  await db.exec(SUPABASE_EMULATION);
  for (const f of MIGRATIONS) await db.exec(sql(f));
  if (withV26) await db.exec(sql('v26.sql'));
  await db.exec(sql('v27.sql'));
  if (v27Twice) await db.exec(sql('v27.sql'));
  return db;
}

/** Run fn inside a transaction as role "authenticated" with JWT subject uid. */
export async function as(db, uid, fn) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    await db.exec('set local role authenticated');
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
