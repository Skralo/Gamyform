import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcryptjs";
import { z, ZodError } from "zod";
import type { Store } from "./store";
import { AppError } from "./store";
import { generateDraft } from "./ai";
const uuid = z.string().uuid();
const submission = z
  .object({
    formVersionId: uuid,
    sessionId: uuid,
    idempotencyKey: uuid,
    inputMode: z.enum(["game", "standard", "mixed"]),
    answers: z.record(
      z.string().max(80),
      z.union([
        z.string().max(500),
        z.number().finite(),
        z.boolean(),
        z.null(),
      ]),
    ),
  })
  .strict();
export async function buildApp(o: {
  store: Store;
  passwordHash?: string;
  origin: string;
  aiKey?: string;
  aiModel?: string;
}) {
  const app = Fastify({ bodyLimit: 32768, logger: false });
  await app.register(cookie);
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (
      req.url.startsWith("/api/owner") &&
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin !== o.origin
    )
      throw new AppError(403, "Request origin is not allowed.");
    if (
      req.url.startsWith("/api/owner/") &&
      !["/api/owner/login", "/api/owner/status"].includes(req.url.split("?")[0])
    ) {
      if (!req.cookies.session || !(await o.store.session(req.cookies.session)))
        throw new AppError(401, "Sign in to your workspace.");
    }
  });
  app.setErrorHandler((err, req, reply) => {
    const e = err as any;
    if (e instanceof ZodError)
      return reply
        .code(400)
        .send({ error: e.issues.map((i) => i.message).join(" ") });
    const code = e.statusCode ?? 500;
    return reply
      .code(code)
      .send({
        error:
          code >= 500 && !(e instanceof AppError)
            ? "Something went wrong. Please try again."
            : e.message,
      });
  });
  app.get("/api/owner/status", async (req) => ({
    authenticated:
      !!req.cookies.session && (await o.store.session(req.cookies.session)),
    configured: !!o.passwordHash,
    aiConfigured: !!o.aiKey && !!o.aiModel,
  }));
  app.post(
    "/api/owner/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!o.passwordHash)
        throw new AppError(
          503,
          "Create your owner password with npm run setup, then restart the server.",
        );
      const { password } = z
        .object({ password: z.string().max(200) })
        .parse(req.body);
      if (!(await bcrypt.compare(password, o.passwordHash)))
        throw new AppError(401, "That password is not correct.");
      const token = await o.store.login();
      reply.setCookie("session", token, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: o.origin.startsWith("https:"),
        maxAge: 43200,
      });
      return { ok: true };
    },
  );
  app.post("/api/owner/logout", async (req, reply) => {
    await o.store.logout(req.cookies.session!);
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/owner/forms", async () => ({ forms: await o.store.list() }));
  app.post("/api/owner/forms", async (req, reply) => {
    const b = z
      .object({ definition: z.unknown().optional() })
      .parse(req.body ?? {});
    return reply.code(201).send(await o.store.create(b.definition));
  });
  app.get("/api/owner/forms/:id", async (req) =>
    o.store.get((req.params as any).id),
  );
  app.put("/api/owner/forms/:id", async (req) => {
    const b = z
      .object({
        definition: z.unknown(),
        revision: z.number().int().positive(),
      })
      .parse(req.body);
    return o.store.save((req.params as any).id, b.definition, b.revision);
  });
  app.post("/api/owner/forms/:id/publish", async (req) => {
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .parse(req.body);
    return o.store.publish((req.params as any).id, revision);
  });
  for (const [action, status] of [
    ["close", "closed"],
    ["reopen", "open"],
  ] as const)
    app.post(`/api/owner/forms/:id/${action}`, async (req) =>
      o.store.status((req.params as any).id, status),
    );
  app.post(
    "/api/owner/generate",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const b = z
        .object({
          brief: z.string().min(10).max(4000),
          locale: z.enum(["en", "sl"]).default("en"),
        })
        .parse(req.body);
      return {
        definition: await generateDraft(b.brief, b.locale, o.aiKey, o.aiModel),
      };
    },
  );
  app.get("/api/public/forms/:slug", async (req) =>
    o.store.publicForm((req.params as any).slug),
  );
  app.post(
    "/api/public/forms/:slug/submissions",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const r = await o.store.submit(
        (req.params as any).slug,
        submission.parse(req.body),
      );
      return reply.code(r.replayed ? 200 : 201).send(r);
    },
  );
  app.post("/api/public/forms/:slug/events", async (req, reply) => {
    const e = z
      .object({
        eventId: uuid,
        formVersionId: uuid,
        sessionId: uuid,
        name: z.enum([
          "form_view",
          "experience_started",
          "question_viewed",
          "question_committed",
          "validation_failed",
          "mode_switched",
          "review_viewed",
        ]),
        questionId: z.string().max(80).optional(),
        inputMode: z.enum(["game", "standard", "mixed"]).optional(),
      })
      .strict()
      .parse(req.body);
    await o.store.event((req.params as any).slug, e);
    return reply.code(204).send();
  });
  app.get("/api/owner/forms/:id/submissions", async (req) => {
    const { page } = z
      .object({ page: z.coerce.number().int().min(0).max(10000).default(0) })
      .parse(req.query);
    return o.store.responses((req.params as any).id, page);
  });
  app.get("/api/owner/forms/:id/submissions.csv", async (req, reply) =>
    reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="gamyform-responses.csv"',
      )
      .send(await o.store.csv((req.params as any).id)),
  );
  app.delete("/api/owner/submissions/:id", async (req) => {
    await o.store.remove((req.params as any).id);
    return { ok: true };
  });
  return app;
}
