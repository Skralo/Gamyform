import "./player.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { api, navigate } from "../api";
import { seed } from "../seed";
import { newId } from "../id";
import {
  experienceOf,
  fieldError,
  stepNumber,
  TOOLS,
  validateAnswers,
  type Answers,
  type Definition,
  type ToolId,
} from "../domain";
import { sound } from "../audio";
import { copyFor } from "./copy";
import type { PanelActions, PanelView, Stage } from "./Panel";
import { StandardView } from "./StandardView";

const GameView = lazy(() => import("./GameView"));

type FormData = { definition: Definition; versionId?: string; slug?: string };

/** WebGL 2 and pointer lock are required for the 3D player. */
export function canPlay3D(): boolean {
  try {
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("webgl2");
    if (!ctx) return false;
    ctx.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof Element.prototype.requestPointerLock === "function";
  } catch {
    return false;
  }
}

function demoDefinition(tool: string | null): Definition {
  if (!TOOLS.includes(tool as ToolId)) return seed;
  return { ...seed, experience: { ...experienceOf(seed), tool: tool as ToolId } };
}

export default function Player({ path }: { path: string }) {
  const [form, setForm] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState("");
  const preview = path.startsWith("/preview/");
  const demo = path === "/demo";
  useEffect(() => {
    let alive = true;
    const id = path.split("/")[2];
    const load: Promise<FormData> = demo
      ? Promise.resolve({
          definition: demoDefinition(new URLSearchParams(location.search).get("tool")),
        })
      : api<FormData>(preview ? "/owner/forms/" + id : "/public/forms/" + id);
    load
      .then((f) => alive && setForm(f))
      .catch((e) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [path, preview, demo]);
  if (loadError)
    return (
      <div className="gf-root gf-message">
        <h1>{copyFor("en").unavailable}</h1>
        <p>{loadError}</p>
      </div>
    );
  if (!form)
    return (
      <div className="gf-root gf-message" aria-busy="true">
        <span className="gf-spinner" />
      </div>
    );
  return (
    <Experience
      key={path}
      form={form}
      preview={preview}
      demo={demo}
      back={preview ? "/forms/" + path.split("/")[2] : "/"}
    />
  );
}

function Experience({
  form,
  preview,
  demo,
  back,
}: {
  form: FormData;
  preview: boolean;
  demo: boolean;
  back: string;
}) {
  const d = form.definition,
    exp = experienceOf(d),
    t = copyFor(d.locale);
  const methods = useForm<Answers>({ defaultValues: {}, shouldUnregister: false });
  const answers = useWatch({ control: methods.control }) as Answers;
  const [stage, setStage] = useState<Stage>("start");
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"game" | "standard">(() =>
    canPlay3D() ? "game" : "standard",
  );
  const [notice, setNotice] = useState(() => (canPlay3D() ? "" : t.noGraphics));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const session = useRef(newId()),
    usedModes = useRef(new Set<string>()),
    transition = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    frozen = useRef<unknown>(null),
    sending = useRef(false),
    returnToReview = useRef(false);
  const q = d.questions[index],
    value = answers[q.id];
  const nothingSaved = preview || demo;

  function event(name: string, questionId?: string) {
    if (nothingSaved || !form.slug) return;
    void api("/public/forms/" + form.slug + "/events", "POST", {
      eventId: newId(),
      formVersionId: form.versionId,
      sessionId: session.current,
      name,
      questionId,
      inputMode: usedModes.current.size > 1 ? "mixed" : mode,
    }).catch(() => {});
  }
  useEffect(() => {
    event("form_view");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (stage === "question") event("question_viewed", q.id);
  }, [stage, index]);
  useEffect(() => {
    sound.settings(volume, muted);
  }, [volume, muted]);
  useEffect(() => {
    const hide = () => document.hidden && sound.pause();
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  function toReview() {
    setStage("review");
    event("review_viewed");
  }
  function advance() {
    setError("");
    if (returnToReview.current) {
      returnToReview.current = false;
      toReview();
    } else if (index === d.questions.length - 1) toReview();
    else setIndex((i) => i + 1);
  }
  function commit(v: unknown) {
    if (transition.current) return;
    const clean = typeof v === "string" ? v.trim() : v;
    const err = fieldError(q, clean);
    if (err) {
      setError(err);
      sound.play("error");
      event("validation_failed", q.id);
      return;
    }
    methods.setValue(q.id, clean === undefined || clean === "" ? null : (clean as never));
    event("question_committed", q.id);
    advance();
  }
  async function submit() {
    if (sending.current) return;
    setError("");
    let payload: unknown;
    try {
      payload = frozen.current ?? {
        formVersionId: form.versionId,
        sessionId: session.current,
        idempotencyKey: newId(),
        inputMode: usedModes.current.size > 1 ? "mixed" : mode,
        answers: validateAnswers(d, methods.getValues()),
      };
    } catch {
      setError(t.fixAnswers);
      return;
    }
    if (nothingSaved) {
      setStage("success");
      sound.play("success");
      return;
    }
    frozen.current = payload;
    sending.current = true;
    setBusy(true);
    try {
      await api("/public/forms/" + form.slug + "/submissions", "POST", payload);
      setStage("success");
      sound.play("success");
    } catch (e) {
      setError((e as Error).message + " " + t.retryNote);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const actions: PanelActions = {
    start() {
      usedModes.current.add(mode);
      event("experience_started");
      setStage("question");
    },
    choose(v) {
      if (transition.current) return;
      transition.current = true;
      methods.setValue(q.id, v as never);
      setError("");
      if (mode === "standard") sound.play("select");
      timer.current = setTimeout(() => {
        transition.current = false;
        event("question_committed", q.id);
        advance();
      }, 300);
    },
    step(delta) {
      methods.setValue(q.id, stepNumber(q, value, delta) as never);
      setError("");
      sound.play("tick");
    },
    setValue(v) {
      methods.setValue(q.id, v as never);
      setError("");
    },
    confirm() {
      commit(q.type === "number" ? (value ?? q.displayStart ?? q.min) : value);
    },
    back() {
      if (transition.current || frozen.current) return;
      setError("");
      returnToReview.current = false;
      if (stage === "review") {
        setStage("question");
        setIndex(d.questions.length - 1);
      } else setIndex((i) => Math.max(0, i - 1));
    },
    skip() {
      if (transition.current) return;
      methods.setValue(q.id, null as never);
      event("question_committed", q.id);
      advance();
    },
    edit(i) {
      if (frozen.current) return;
      returnToReview.current = true;
      setError("");
      setIndex(i);
      setStage("question");
    },
    send: () => void submit(),
    exit: () => navigate(back),
    toggleMute() {
      void sound.unlock();
      setMuted((m) => !m);
    },
  };

  function switchToStandard(reason?: string) {
    document.exitPointerLock?.();
    usedModes.current.add("standard");
    setMode("standard");
    if (reason) setNotice(reason);
    event("mode_switched");
  }

  const view: PanelView = {
    stage,
    mode,
    d,
    index,
    answers,
    error,
    busy,
    frozen: !!frozen.current,
    muted,
    notice,
    preview: nothingSaved,
    canExit: preview,
  };
  const badge = preview ? t.previewBadge : demo ? t.demoBadge : "";
  if (mode === "game")
    return (
      <Suspense
        fallback={
          <div className="gf-root gf-message" aria-busy="true">
            <span className="gf-spinner" />
          </div>
        }
      >
        <GameView
          view={view}
          actions={actions}
          t={t}
          exp={exp}
          badge={badge}
          generation={`${stage}:${index}`}
          volume={volume}
          setVolume={setVolume}
          onStandard={switchToStandard}
        />
      </Suspense>
    );
  return (
    <StandardView view={view} actions={actions} t={t} exp={exp} badge={badge} />
  );
}
