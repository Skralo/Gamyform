import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store";
import { seed } from "../src/seed";
it("keeps submissions after restart and pins old sessions to their published version", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gamyform-test-"));
  let db = await createStore({ path: join(dir, "pg") });
  try {
    const form = await db.create(),
      v1 = await db.publish(form.id, 1);
    const original = structuredClone(seed);
    original.questions[0].options![0].label = "Changed draft label";
    await db.save(form.id, original, 1);
    const v2 = await db.publish(form.id, 2);
    expect(v2.number).toBe(2);
    const payload = {
      formVersionId: v1.versionId,
      sessionId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      inputMode: "game",
      answers: {
        q_goal: "operations",
        q_name: "=SUM(A1)",
        q_email: "qa@example.com",
        q_team: 1,
      },
    };
    const [a, b] = await Promise.all([
      db.submit(form.slug, payload),
      db.submit(form.slug, payload),
    ]);
    expect(a.id).toBe(b.id);
    await db.close();
    db = await createStore({ path: join(dir, "pg") });
    const result = await db.responses(form.id);
    expect(result.total).toBe(1);
    expect(result.rows[0].number).toBe(1);
    expect(result.rows[0].definition.questions[0].options[0].label).toBe(
      seed.questions[0].options![0].label,
    );
    const csv = await db.csv(form.id);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain(seed.questions[0].options![0].label);
    await db.status(form.id, "closed");
    expect((await db.submit(form.slug, payload)).id).toBe(a.id);
    await expect(
      db.submit(form.slug, { ...payload, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ statusCode: 410 });
    await db.remove(a.id);
    expect((await db.responses(form.id)).total).toBe(0);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
