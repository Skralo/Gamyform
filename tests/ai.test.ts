import { it, expect, vi, afterEach } from "vitest";
import { generateDraft } from "../server/ai";
import { seed } from "../src/seed";
afterEach(() => vi.unstubAllGlobals());
it("does not simulate a draft when credentials are missing", async () => {
  await expect(generateDraft("lead form", "en")).rejects.toMatchObject({
    statusCode: 503,
  });
});
it("validates provider output and regenerates stable field IDs", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(seed) } }],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await generateDraft(
    "lead form",
    "en",
    "test-only-key",
    "test-model",
  );
  expect(result.questions[0].id).not.toBe(seed.questions[0].id);
  expect(result.title).toBe(seed.title);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("repairs invalid provider output once, then fails without persisting", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"bad":true}' } }],
          }),
        ),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    generateDraft("lead form", "en", "test-only-key", "test-model"),
  ).rejects.toMatchObject({ statusCode: 422 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
