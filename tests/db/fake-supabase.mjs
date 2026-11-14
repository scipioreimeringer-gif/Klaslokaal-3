// A tiny stand-in for the supabase-js client that executes the query-builder
// calls our app uses as real SQL in PGlite, as the given user, with RLS on.
// It only implements the subset of the API used by lib/classroomBridge.ts and
// lib/data.ts — enough to test that code against the real policies.
import {as} from './emulation.mjs';

const ident = s => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error('bad identifier ' + s);
  return '"' + s + '"';
};

class Query {
  constructor(client, table) {
    this.c = client; this.table = table; this.op = 'select'; this.cols = '*';
    this.where = []; this.params = []; this.orders = []; this.mode = 'many'; this.values = null; this.conflict = null; this.returning = false;
  }
  p(v) {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) { this.params.push(JSON.stringify(v)); return `$${this.params.length}::jsonb`; }
    this.params.push(v); return `$${this.params.length}`;
  }
  select(cols = '*') { if (this.op === 'select') this.cols = cols; else this.returning = cols; return this; }
  eq(col, v) { this.where.push(() => `${ident(col)} = ${this.p(v)}`); return this; }
  in(col, arr) { this.where.push(() => arr.length ? `${ident(col)} in (${arr.map(v => this.p(v)).join(',')})` : 'false'); return this; }
  order(col, o = {}) { this.orders.push(`${ident(col)} ${o.ascending === false ? 'desc' : 'asc'}`); return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'single'; return this; }
  update(v) { this.op = 'update'; this.values = v; return this; }
  insert(v) { this.op = 'insert'; this.values = v; return this; }
  upsert(v, o = {}) { this.op = 'insert'; this.values = v; this.conflict = o.onConflict || 'id'; return this; }
  delete() { this.op = 'delete'; return this; }
  build() {
    const t = 'public.' + ident(this.table);
    const where = () => this.where.length ? ' where ' + this.where.map(f => f()).join(' and ') : '';
    const cols = c => c === '*' ? '*' : c.split(',').map(x => ident(x.trim())).join(',');
    if (this.op === 'select') return `select ${cols(this.cols)} from ${t}${where()}${this.orders.length ? ' order by ' + this.orders.join(',') : ''}`;
    if (this.op === 'update') {
      const set = Object.entries(this.values).map(([k, v]) => `${ident(k)} = ${this.p(v)}`).join(', ');
      return `update ${t} set ${set}${where()}` + (this.returning ? ` returning ${cols(this.returning)}` : '');
    }
    if (this.op === 'delete') return `delete from ${t}${where()}` + (this.returning ? ` returning ${cols(this.returning)}` : '');
    const rows = Array.isArray(this.values) ? this.values : [this.values];
    const keys = Object.keys(rows[0]);
    const vals = rows.map(r => '(' + keys.map(k => this.p(r[k])).join(',') + ')').join(',');
    let q = `insert into ${t} (${keys.map(ident).join(',')}) values ${vals}`;
    if (this.conflict) {
      const conflictCols = this.conflict.split(',').map(s => s.trim());
      const upd = keys.filter(k => !conflictCols.includes(k)).map(k => `${ident(k)} = excluded.${ident(k)}`);
      q += ` on conflict (${conflictCols.map(ident).join(',')}) ` + (upd.length ? `do update set ${upd.join(', ')}` : 'do nothing');
    }
    return q + (this.returning ? ` returning ${cols(this.returning)}` : '');
  }
  async run() {
    try {
      const text = this.build();
      const r = await as(this.c.pg, this.c.uid, () => this.c.pg.query(text, this.params));
      let data = r.rows;
      if (this.op !== 'select' && !this.returning) data = null;
      if (this.mode === 'maybe') { if (data.length > 1) return {data: null, error: {message: 'multiple rows'}}; data = data[0] ?? null; }
      if (this.mode === 'single') { if (data.length !== 1) return {data: null, error: {message: 'not exactly one row'}}; data = data[0]; }
      return {data, error: null, count: r.affectedRows};
    } catch (e) {
      return {data: null, error: {message: e.message, code: e.code}};
    }
  }
  then(res, rej) { return this.run().then(res, rej); }
}

export function fakeSupabase(pg, uid) {
  const client = {
    pg, uid,
    from: table => new Query(client, table),
    rpc: async (fn, args = {}) => {
      const keys = Object.keys(args);
      const q = `select * from public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(',')})`;
      try { const r = await as(pg, uid, () => pg.query(q, keys.map(k => args[k]))); return {data: r.rows, error: null}; }
      catch (e) { return {data: null, error: {message: e.message}}; }
    },
    auth: {getSession: async () => ({data: {session: {access_token: 'test-token-' + uid}}})},
    storage: {
      from: bucket => ({
        upload: async (name) => {
          try { await as(pg, uid, () => pg.query(`insert into storage.objects(bucket_id,name) values ($1,$2)`, [bucket, name])); return {data: {path: name}, error: null}; }
          catch (e) { return {data: null, error: {message: e.message}}; }
        },
        remove: async (names) => {
          try { const r = await as(pg, uid, () => pg.query(`delete from storage.objects where bucket_id=$1 and name = any($2)`, [bucket, names])); return {data: r.affectedRows, error: null}; }
          catch (e) { return {data: null, error: {message: e.message}}; }
        },
      }),
    },
  };
  return client;
}
