// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import Player from "../src/player/Player";
import { Workspace } from "../src/admin/Workspace";
import { api } from "../src/api";
import { seed } from "../src/seed";
vi.mock("../src/api", () => ({ api: vi.fn(), navigate: vi.fn() }));
vi.mock("../src/audio", () => ({
  sound: {
    play: vi.fn(),
    pause: vi.fn(),
    settings: vi.fn(),
    unlock: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../src/seed", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/seed")>();
  const copy = structuredClone(m.seed);
  copy.questions[0].required = false;
  return { seed: copy };
});
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.mocked(api).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
it("cannot skip twice when an optional choice is transitioning", async () => {
  render(<Player path="/demo" />);
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  expect(
    screen.getByRole("heading", { name: seed.questions[0].label }),
  ).toBeTruthy();
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole("button", { name: seed.questions[0].options![0].label }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  expect(
    screen.getByRole("heading", { name: seed.questions[1].label }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: seed.questions[2].label }),
  ).toBeNull();
});
it("continues text with Enter and returns to review after an edit", async () => {
  render(<Player path="/demo" />);
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole("button", { name: seed.questions[0].options![1].label }),
  );
  await act(async () => {
    vi.advanceTimersByTime(350);
  });
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  const name = screen.getByRole("textbox", { name: seed.questions[2].label });
  fireEvent.change(name, { target: { value: "  Ana  " } });
  fireEvent.submit(name.closest("form")!);
  const email = screen.getByRole("textbox", { name: seed.questions[3].label });
  fireEvent.change(email, { target: { value: "not-an-email" } });
  fireEvent.submit(email.closest("form")!);
  expect(screen.getByRole("alert").textContent).toMatch(/valid email/);
  fireEvent.change(email, { target: { value: "ana@example.com" } });
  fireEvent.submit(email.closest("form")!);
  const note = screen.getByRole("textbox", { name: seed.questions[4].label });
  fireEvent.keyDown(note, { key: "Enter" });
  expect(
    screen.getByRole("heading", { name: "Check your answers" }),
  ).toBeTruthy();
  expect(screen.getByText("Ana")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(escape(seed.questions[2].label)),
    }),
  );
  const again = screen.getByRole("textbox", { name: seed.questions[2].label });
  fireEvent.change(again, { target: { value: "Ana Novak" } });
  fireEvent.submit(again.closest("form")!);
  expect(
    screen.getByRole("heading", { name: "Check your answers" }),
  ).toBeTruthy();
  expect(screen.getByText("Ana Novak")).toBeTruthy();
});
it("closing a form does not adopt a newer revision belonging to another draft", async () => {
  const f = {
    id: "f1",
    slug: "test",
    definition: structuredClone(seed),
    revision: 1,
    status: "open",
    current_version: "v1",
    responses: 0,
    created_at: new Date().toISOString(),
  };
  const other = {
    ...f,
    revision: 2,
    status: "closed",
    definition: { ...seed, title: "Another tab saved this" },
  };
  let saved: any;
  vi.mocked(api).mockImplementation(async (url, method, body) => {
    if (url === "/owner/forms") return { forms: [f] };
    if (url === "/owner/forms/f1/close") return other;
    if (method === "PUT") {
      saved = body;
      throw new Error(
        "This draft changed in another tab. Reload before saving.",
      );
    }
    return f;
  });
  render(
    <Workspace path="/forms/f1" aiConfigured={false} onLogout={() => {}} />,
  );
  const title = await screen.findByRole("textbox", { name: "Form title" });
  fireEvent.change(title, { target: { value: "My unsaved title" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Close form" }),
  );
  await screen.findByRole("button", { name: "Reopen" });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved).toBeDefined());
  expect(saved.revision).toBe(1);
  expect(saved.definition.title).toBe("My unsaved title");
  expect(await screen.findByRole("alert")).toBeTruthy();
});
