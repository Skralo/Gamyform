import "dotenv/config";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createStore } from "./store";
import { buildApp } from "./app";
const args = process.argv.slice(2),
  cliPort = args.indexOf("--port");
const port = Number(
    cliPort >= 0 ? args[cliPort + 1] : (process.env.PORT ?? 3000),
  ),
  production = process.env.NODE_ENV === "production";
if (production && (!process.env.APP_ORIGIN || !process.env.OWNER_PASSWORD_HASH))
  throw new Error(
    "Set APP_ORIGIN and OWNER_PASSWORD_HASH before starting production.",
  );
const dir = resolve(process.env.DATA_DIR ?? "./data");
await mkdir(dir, { recursive: true });
const store = await createStore({
  url: process.env.DATABASE_URL || undefined,
  path: dir + "/postgres",
});
const app = await buildApp({
  store,
  passwordHash: process.env.OWNER_PASSWORD_HASH,
  origin: process.env.APP_ORIGIN ?? `http://localhost:${port}`,
  aiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL,
});
if (production) {
  const { default: staticPlugin } = await import("@fastify/static");
  await app.register(staticPlugin, { root: resolve("dist") });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found." })
      : reply.sendFile("index.html"),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server: app.server } },
    appType: "spa",
  });
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/")) return;
    await new Promise<void>((resolve) => {
      vite.middlewares(req.raw, reply.raw, () => resolve());
      reply.raw.on("finish", resolve);
    });
    if (reply.raw.writableEnded) reply.hijack();
  });
  app.addHook("onClose", async () => vite.close());
}
app.addHook("onClose", async () => store.close());
await app.listen({ port, host: "0.0.0.0" });
console.log(`Gamyform is running at http://localhost:${port}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.close().then(() => process.exit(0)));
