import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import {
  validateAnswers,
  validateDefinition,
  csvCell,
  answerLabel,
  type Definition,
} from "../src/domain";
import { seed } from "../src/seed";
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
type Query = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
export async function createStore(
  options: { url?: string; path?: string } = {},
) {
  const local = options.url ? null : new PGlite(options.path);
  const pool = options.url
    ? new pg.Pool({ connectionString: options.url })
    : null;
  const query: Query = async (sql, params = []) =>
    pool ? pool.query(sql, params) : local!.query(sql, params);
  const tx = async <T>(fn: (q: Query) => Promise<T>): Promise<T> => {
    if (local)
      return local.transaction((t) => fn((s, p = []) => t.query(s, p)));
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const r = await fn((s, p) => client.query(s, p));
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  };
  const migration = `CREATE TABLE IF NOT EXISTS forms(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,definition JSONB NOT NULL,revision INT NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'draft',current_version TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,form_id TEXT NOT NULL REFERENCES forms(id),number INT NOT NULL,definition JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(form_id,number));
 CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,form_id TEXT NOT NULL REFERENCES forms(id),version_id TEXT NOT NULL REFERENCES versions(id),key TEXT NOT NULL,hash TEXT NOT NULL,session_id TEXT NOT NULL,answers JSONB NOT NULL,input_mode TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(form_id,key));
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires_at TIMESTAMPTZ NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,form_id TEXT NOT NULL REFERENCES forms(id),version_id TEXT NOT NULL REFERENCES versions(id),session_id TEXT NOT NULL,name TEXT NOT NULL,question_id TEXT,input_mode TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());`;
  if (local) await local.exec(migration);
  else await pool!.query(migration);
  const get = async (id: string, q: Query = query) => {
    const r = (await q("SELECT * FROM forms WHERE id=$1", [id])).rows[0];
    if (!r) throw new AppError(404, "Form not found.");
    return r;
  };
  return {
    query,
    close: async () => {
      await pool?.end();
      await local?.close();
    },
    async list() {
      return (
        await query(
          "SELECT f.*, (SELECT count(*)::int FROM submissions s WHERE s.form_id=f.id) AS responses FROM forms f ORDER BY created_at DESC",
        )
      ).rows;
    },
    get,
    async create(def: unknown = seed) {
      const definition = validateDefinition(def),
        id = randomUUID(),
        slug =
          definition.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 40)
            .replace(/^-|-$/g, "") +
          "-" +
          id.slice(0, 8);
      await query("INSERT INTO forms(id,slug,definition) VALUES($1,$2,$3)", [
        id,
        slug,
        JSON.stringify(definition),
      ]);
      return get(id);
    },
    async save(id: string, definition: unknown, revision: number) {
      const d = validateDefinition(definition);
      const rows = (
        await query(
          "UPDATE forms SET definition=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING *",
          [JSON.stringify(d), id, revision],
        )
      ).rows;
      if (!rows.length)
        throw new AppError(
          409,
          "This draft changed in another tab. Reload before saving.",
        );
      return rows[0];
    },
    async publish(id: string, revision: number) {
      return tx(async (q) => {
        await q("SELECT id FROM forms WHERE id=$1 FOR UPDATE", [id]);
        const f = await get(id, q);
        if (f.revision !== revision)
          throw new AppError(
            409,
            "Save or reload this draft before publishing.",
          );
        const d = validateDefinition(f.definition);
        const number = (
          await q(
            "SELECT COALESCE(MAX(number),0)+1 AS n FROM versions WHERE form_id=$1",
            [id],
          )
        ).rows[0].n;
        const vid = randomUUID();
        await q(
          "INSERT INTO versions(id,form_id,number,definition) VALUES($1,$2,$3,$4)",
          [vid, id, number, JSON.stringify(d)],
        );
        await q(
          "UPDATE forms SET current_version=$1,status='open' WHERE id=$2",
          [vid, id],
        );
        return { versionId: vid, number, slug: f.slug };
      });
    },
    async status(id: string, status: "open" | "closed") {
      const f = await get(id);
      if (!f.current_version)
        throw new AppError(400, "Publish this form first.");
      await query("UPDATE forms SET status=$1 WHERE id=$2", [status, id]);
      return get(id);
    },
    async publicForm(slug: string) {
      const f = (
        await query(
          'SELECT f.id,f.slug,f.status,v.id AS "versionId",v.number,v.definition FROM forms f JOIN versions v ON v.id=f.current_version WHERE f.slug=$1',
          [slug],
        )
      ).rows[0];
      if (!f) throw new AppError(404, "This form is not published.");
      if (f.status === "closed")
        throw new AppError(410, "This form is closed.");
      return f;
    },
    async submit(slug: string, body: any) {
      return tx(async (q) => {
        const f = (
          await q("SELECT * FROM forms WHERE slug=$1 FOR UPDATE", [slug])
        ).rows[0];
        if (!f) throw new AppError(404, "Form not found.");
        const hash = createHash("sha256")
          .update(
            JSON.stringify({
              version: body.formVersionId,
              session: body.sessionId,
              mode: body.inputMode,
              answers: Object.fromEntries(
                Object.entries(body.answers).sort(([a], [b]) =>
                  a.localeCompare(b),
                ),
              ),
            }),
          )
          .digest("hex");
        const previous = (
          await q("SELECT * FROM submissions WHERE form_id=$1 AND key=$2", [
            f.id,
            body.idempotencyKey,
          ])
        ).rows[0];
        if (previous) {
          if (previous.hash !== hash)
            throw new AppError(
              409,
              "This submission attempt has different answers.",
            );
          return {
            id: previous.id,
            submittedAt: previous.created_at,
            replayed: true,
          };
        }
        if (f.status !== "open")
          throw new AppError(410, "This form is closed.");
        const v = (
          await q("SELECT * FROM versions WHERE id=$1 AND form_id=$2", [
            body.formVersionId,
            f.id,
          ])
        ).rows[0];
        if (!v) throw new AppError(400, "Invalid form version.");
        const answers = validateAnswers(v.definition, body.answers),
          id = randomUUID();
        const row = (
          await q(
            "INSERT INTO submissions(id,form_id,version_id,key,hash,session_id,answers,input_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at",
            [
              id,
              f.id,
              v.id,
              body.idempotencyKey,
              hash,
              body.sessionId,
              JSON.stringify(answers),
              body.inputMode,
            ],
          )
        ).rows[0];
        return { id, submittedAt: row.created_at, replayed: false };
      });
    },
    async responses(id: string, page = 0) {
      await get(id);
      return {
        rows: (
          await query(
            "SELECT s.id,s.answers,s.input_mode,s.created_at,v.number,v.definition FROM submissions s JOIN versions v ON v.id=s.version_id WHERE s.form_id=$1 ORDER BY s.created_at DESC LIMIT 50 OFFSET $2",
            [id, page * 50],
          )
        ).rows,
        total: (
          await query(
            "SELECT count(*)::int AS n FROM submissions WHERE form_id=$1",
            [id],
          )
        ).rows[0].n,
      };
    },
    async csv(id: string) {
      await get(id);
      const rows = (
        await query(
          "SELECT s.*,v.number,v.definition FROM submissions s JOIN versions v ON v.id=s.version_id WHERE s.form_id=$1 ORDER BY s.created_at",
          [id],
        )
      ).rows;
      const keys = new Map<string, string>();
      rows.forEach((r) =>
        (r.definition as Definition).questions.forEach((q) =>
          keys.set(q.id, `${q.label} [${q.id}]`),
        ),
      );
      return (
        "\uFEFF" +
        [
          ["Submission ID", "Submitted (UTC)", "Version", ...keys.values()]
            .map(csvCell)
            .join(","),
          ...rows.map((r) =>
            [
              r.id,
              new Date(r.created_at).toISOString(),
              r.number,
              ...[...keys.keys()].map((id) => {
                const q = (r.definition as Definition).questions.find(
                  (q) => q.id === id,
                );
                return q ? answerLabel(q, r.answers[id]) : "";
              }),
            ]
              .map(csvCell)
              .join(","),
          ),
        ].join("\r\n")
      );
    },
    async remove(id: string) {
      await query("DELETE FROM submissions WHERE id=$1", [id]);
    },
    async session(token: string) {
      return !!(
        await query(
          "SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now()",
          [createHash("sha256").update(token).digest("hex")],
        )
      ).rows.length;
    },
    async login() {
      const token = randomUUID() + randomUUID();
      await query(
        "INSERT INTO sessions(token_hash,expires_at) VALUES($1,now()+INTERVAL '12 hours')",
        [createHash("sha256").update(token).digest("hex")],
      );
      return token;
    },
    async logout(token: string) {
      await query("DELETE FROM sessions WHERE token_hash=$1", [
        createHash("sha256").update(token).digest("hex"),
      ]);
    },
    async event(slug: string, e: any) {
      const f = await this.publicForm(slug);
      const v = (
        await query("SELECT id FROM versions WHERE id=$1 AND form_id=$2", [
          e.formVersionId,
          f.id,
        ])
      ).rows[0];
      if (!v) throw new AppError(400, "Invalid event version.");
      await query(
        "INSERT INTO events(id,form_id,version_id,session_id,name,question_id,input_mode) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        [
          e.eventId,
          f.id,
          v.id,
          e.sessionId,
          e.name,
          e.questionId ?? null,
          e.inputMode ?? null,
        ],
      );
    },
  };
}
export type Store = Awaited<ReturnType<typeof createStore>>;
