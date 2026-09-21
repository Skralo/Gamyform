import { beforeAll, afterAll, it, expect } from "vitest";
import { buildApp } from "../server/app";
import { createStore } from "../server/store";
import bcrypt from "bcryptjs";
let app: any,
  store: any,
  cookie: string,
  id: string,
  version: string,
  revision: number;
beforeAll(async () => {
  store = await createStore();
  app = await buildApp({
    store,
    passwordHash: await bcrypt.hash("test-password-12345", 4),
    origin: "http://localhost:3000",
  });
  const r = await app.inject({
    method: "POST",
    url: "/api/owner/login",
    payload: { password: "test-password-12345" },
    headers: { origin: "http://localhost:3000" },
  });
  cookie = r.headers["set-cookie"].split(";")[0];
}, 30000);
afterAll(async () => {
  await app?.close();
  await store?.close();
});
const owner = (method: string, url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    payload,
    headers: { cookie, origin: "http://localhost:3000" },
  });
it("protects all private results and rejects cross-origin owner writes", async () => {
  expect((await app.inject("/api/owner/forms")).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/owner/forms",
        headers: { cookie, origin: "https://evil.test" },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
});
it("creates, edits, versions and publishes a draft", async () => {
  let r = await owner("POST", "/api/owner/forms", {});
  expect(r.statusCode).toBe(201);
  const f = r.json();
  id = f.id;
  revision = f.revision;
  expect((await app.inject("/api/public/forms/" + f.slug)).statusCode).toBe(
    404,
  );
  r = await owner("PUT", "/api/owner/forms/" + id, {
    definition: f.definition,
    revision,
  });
  expect(r.statusCode).toBe(200);
  revision = r.json().revision;
  expect(
    (
      await owner("PUT", "/api/owner/forms/" + id, {
        definition: f.definition,
        revision: 1,
      })
    ).statusCode,
  ).toBe(409);
  r = await owner("POST", `/api/owner/forms/${id}/publish`, { revision });
  expect(r.statusCode).toBe(200);
  version = r.json().versionId;
});
it("persists once for idempotent retries and rejects changed payloads", async () => {
  const form = (await owner("GET", "/api/owner/forms/" + id)).json();
  const body = {
    formVersionId: version,
    sessionId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    inputMode: "standard",
    answers: {
      q_goal: "operations",
      q_name: "Anže",
      q_email: "anze@example.com",
    },
  };
  const send = (payload: unknown) =>
    app.inject({
      method: "POST",
      url: `/api/public/forms/${form.slug}/submissions`,
      payload,
    });
  let r = await send(body);
  expect(r.statusCode).toBe(201);
  const first = r.json().id;
  r = await send(body);
  expect(r.json().id).toBe(first);
  expect(
    (await send({ ...body, answers: { ...body.answers, q_name: "Other" } }))
      .statusCode,
  ).toBe(409);
  expect(
    (await owner("GET", `/api/owner/forms/${id}/submissions`)).json().rows,
  ).toHaveLength(1);
});
it("rejects invalid email and honours form closure", async () => {
  const form = (await owner("GET", "/api/owner/forms/" + id)).json();
  const payload = {
    formVersionId: version,
    sessionId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    inputMode: "game",
    answers: { q_goal: "operations", q_name: "A", q_email: "invalid" },
  };
  const url = `/api/public/forms/${form.slug}/submissions`;
  expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(
    400,
  );
  await owner("POST", `/api/owner/forms/${id}/close`, {});
  payload.answers.q_email = "a@example.com";
  expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(
    410,
  );
});
