import { newId } from "../id";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Keyboard,
  Volume2,
  VolumeX,
  RotateCcw,
  Target,
  MousePointer2,
  X,
  CheckCircle2,
} from "lucide-react";
import { api, navigate } from "../api";
import { seed } from "../seed";
import {
  answerLabel,
  fieldError,
  stepNumber,
  validateAnswers,
  type Answers,
  type Definition,
} from "../domain";
import { sound } from "../audio";
import type { TargetSpec } from "./Scene";
const Scene = lazy(() => import("./Scene"));
type FormData = { definition: Definition; versionId?: string; slug?: string };
type Stage = "intro" | "practice" | "question" | "review" | "success";
export default function Runner({ path }: { path: string }) {
  const [form, setForm] = useState<FormData | null>(null),
    [loadError, setLoadError] = useState("");
  const preview = path.startsWith("/preview/"),
    demo = path === "/demo";
  useEffect(() => {
    let alive = true;
    const load = demo
      ? Promise.resolve({ definition: seed })
      : api<FormData>(
          preview
            ? "/owner/forms/" + path.split("/")[2]
            : "/public/forms/" + path.split("/")[2],
        );
    load
      .then((f) => {
        if (alive) setForm(f);
      })
      .catch((e) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, preview, demo]);
  if (loadError)
    return (
      <div className="center-screen">
        <Target size={36} />
        <h1>This form is unavailable</h1>
        <p>{loadError}</p>
        <button onClick={() => navigate("/")}>Back to workspace</button>
      </div>
    );
  if (!form)
    return (
      <div className="center-screen">
        <span className="loader" />
        Opening the courtyard…
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
    sl = d.locale === "sl",
    t = (en: string, si: string) => (sl ? si : en);
  const methods = useForm<Answers>({
      defaultValues: {},
      shouldUnregister: false,
    }),
    answers = useWatch({ control: methods.control }) as Answers;
  const [stage, setStage] = useState<Stage>("intro"),
    [index, setIndex] = useState(0),
    [mode, setMode] = useState<"game" | "standard">("game"),
    [locked, setLocked] = useState(false),
    [typing, setTyping] = useState(false),
    [error, setError] = useState(""),
    [hit, setHit] = useState(false),
    [aim, setAim] = useState(false),
    [recenter, setRecenter] = useState(0),
    [caps, setCaps] = useState(false),
    [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(0.45),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [fallback, setFallback] = useState("");
  const [graphicsReady, setGraphicsReady] = useState(false);
  useEffect(() => {
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("webgl2");
    if (!ctx) {
      setFallback(
        t(
          "3D is unavailable in this browser. You can use the standard form.",
          "3D ni na voljo. Uporabi običajen obrazec.",
        ),
      );
      setMode("standard");
    } else {
      ctx.getExtension("WEBGL_lose_context")?.loseContext();
      setGraphicsReady(true);
    }
  }, []);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const session = useRef(newId()),
    usedModes = useRef(new Set<string>()),
    transition = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    frozen = useRef<any>(null),
    sending = useRef(false);
  const q = d.questions[index],
    value = answers[q.id],
    generation = stage + ":" + index;
  function event(name: string, questionId?: string) {
    if (preview || demo || !form.slug) return;
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
      document.exitPointerLock?.();
    };
  }, []);
  useEffect(() => {
    if (stage === "question") event("question_viewed", q.id);
  }, [stage, index]);
  useEffect(() => {
    sound.settings(volume, muted);
  }, [muted, volume]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        document.exitPointerLock?.();
        sound.pause();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  function unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  async function lock() {
    try {
      await sound.unlock();
      const canvas = document.querySelector(
        ".game-world canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas) throw Error("3D scene is still loading.");
      await canvas.requestPointerLock();
    } catch {
      setFallback(
        t(
          "Your browser could not capture the mouse. You can continue with standard inputs.",
          "Brskalnik ne podpira zajema miške. Nadaljuj z običajnim vnosom.",
        ),
      );
      setMode("standard");
      setStage((s) => (s === "practice" ? "question" : s));
    }
  }
  function start(nextMode: "game" | "standard") {
    usedModes.current.add(nextMode);
    setMode(nextMode);
    event("experience_started");
    if (nextMode === "game") {
      setStage("practice");
      void lock();
    } else setStage("question");
  }
  function switchMode() {
    unlock();
    setTyping(false);
    setMode("standard");
    usedModes.current.add("standard");
    if (stage === "practice") setStage("question");
    event("mode_switched");
  }
  function advance() {
    setError("");
    setTyping(false);
    if (index === d.questions.length - 1) {
      unlock();
      setStage("review");
      event("review_viewed");
    } else setIndex((i) => i + 1);
  }
  function commit(v: unknown = value) {
    if (transition.current) return;
    const err = fieldError(q, v);
    if (err) {
      setError(err);
      sound.play("error");
      event("validation_failed", q.id);
      return;
    }
    methods.setValue(q.id, v === undefined ? null : (v as any));
    event("question_committed", q.id);
    advance();
  }
  function choice(v: any) {
    if (transition.current) return;
    transition.current = true;
    methods.setValue(q.id, v);
    setError("");
    sound.play("hit");
    timer.current = setTimeout(() => {
      transition.current = false;
      event("question_committed", q.id);
      advance();
    }, 300);
  }
  function goBack() {
    if (transition.current || frozen.current) return;
    setError("");
    setTyping(false);
    if (stage === "review") {
      setStage("question");
      setIndex(d.questions.length - 1);
    } else setIndex((i) => Math.max(0, i - 1));
  }
  function edit(i: number) {
    if (frozen.current) return;
    setIndex(i);
    setStage("question");
    setMode("standard");
    usedModes.current.add("standard");
  }
  function skip() {
    if (transition.current) return;
    methods.setValue(q.id, null);
    event("question_committed", q.id);
    advance();
  }
  function action(target: TargetSpec) {
    if (transition.current) return;
    if (target.action === "practice") {
      sound.play("hit");
      setStage("question");
      return;
    }
    if (target.action === "choice") {
      choice(target.value);
      return;
    }
    if (target.action === "back") {
      goBack();
      return;
    }
    if (target.action === "skip") {
      skip();
      return;
    }
    if (target.action === "number") {
      methods.setValue(q.id, stepNumber(q, value, Number(target.value)));
      sound.play("key");
      return;
    }
    if (target.action === "confirm") {
      commit(q.type === "number" ? (value ?? q.displayStart ?? q.min) : value);
      return;
    }
    if (target.action === "type") {
      unlock();
      setTyping(true);
      usedModes.current.add("standard");
      return;
    }
    if (target.action === "caps") {
      setCaps((v) => !v);
      return;
    }
    if (target.action === "key") {
      const current = String(value ?? "");
      methods.setValue(
        q.id,
        target.value === "Backspace"
          ? current.slice(0, -1)
          : (current + String(target.value)).slice(
              0,
              q.type === "email" ? 254 : (q.maxLength ?? 120),
            ),
      );
      setError("");
      sound.play("key");
    }
  }
  const targets: TargetSpec[] = [];
  const add = (
    id: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    action: string,
    value?: string | number | boolean,
    selected?: boolean,
  ) => targets.push({ id, text, x, y, width, height, action, value, selected });
  if (stage === "intro" || stage === "practice")
    add(
      "practice",
      t("TAKE YOUR FIRST SHOT", "USTRELI PRVO TARČO"),
      0,
      2.1,
      4.1,
      1.05,
      "practice",
    );
  if (stage === "question") {
    if (q.type === "single_choice" || q.type === "boolean") {
      const opts =
        q.type === "boolean"
          ? [
              { id: true, label: t("Yes", "Da") },
              { id: false, label: t("No", "Ne") },
            ]
          : q.options!;
      opts.forEach((o, i) =>
        add(
          "choice" + i,
          o.label,
          (i % 2 === 0 ? -1 : 1) * 1.72,
          2.5 - Math.floor(i / 2) * 0.72,
          3.2,
          0.6,
          "choice",
          o.id,
          value === o.id,
        ),
      );
    } else if (q.type === "number") {
      add("minus", "−", -1.65, 2.1, 1.3, 1.1, "number", -1);
      add("plus", "+", 1.65, 2.1, 1.3, 1.1, "number", 1);
      add(
        "confirm",
        t("Confirm number →", "Potrdi številko →"),
        0,
        1.14,
        4.6,
        0.6,
        "confirm",
      );
    } else {
      ["1234567890@.", "qwertyuiop-_", "asdfghjkl+!", "zxcvbnm,?čšž"].forEach(
        (row, r) =>
          [...row].forEach((char, c) => {
            const key = caps ? char.toUpperCase() : char;
            add(
              "key" + r + c,
              key,
              (c - (row.length - 1) / 2) * 0.53,
              2.44 - r * 0.42,
              0.47,
              0.35,
              "key",
              key,
            );
          }),
      );
      add("caps", caps ? "ABC" : "abc", -2.8, 0.7, 0.8, 0.38, "caps");
      add("space", t("Space", "Presledek"), -1.35, 0.7, 1.9, 0.38, "key", " ");
      add("delete", "⌫", 0.1, 0.7, 0.8, 0.38, "key", "Backspace");
      add("type", t("Type", "Tipkaj"), 1.3, 0.7, 1.35, 0.38, "type");
      add("confirm", t("Done →", "Naprej →"), 2.8, 0.7, 1.4, 0.38, "confirm");
    }
    if (index > 0)
      add("back", t("← Back", "← Nazaj"), -2.7, 0.22, 1.3, 0.32, "back");
    if (!q.required)
      add("skip", t("Skip →", "Preskoči →"), 2.7, 0.22, 1.3, 0.32, "skip");
  }
  async function submit() {
    if (sending.current) return;
    setError("");
    let payload;
    try {
      payload = frozen.current ?? {
        formVersionId: form.versionId,
        sessionId: session.current,
        idempotencyKey: newId(),
        inputMode: usedModes.current.size > 1 ? "mixed" : mode,
        answers: validateAnswers(d, methods.getValues()),
      };
    } catch {
      setError(
        t(
          "Check your answers before sending.",
          "Preveri odgovore pred oddajo.",
        ),
      );
      return;
    }
    if (preview || demo) {
      setStage("success");
      sound.play("success");
      return;
    }
    frozen.current = payload;
    sending.current = true;
    setBusy(true);
    try {
      await api("/public/forms/" + form.slug + "/submissions", "POST", payload);
      setSent(true);
      setStage("success");
      sound.play("success");
    } catch (e: any) {
      setError(
        e.message +
          " " +
          t(
            "Retry sends the same answers only once.",
            "Ponovitev varno pošlje iste odgovore.",
          ),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const native = (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <span className="eyebrow">
        {t("Question", "Vprašanje")} {index + 1} / {d.questions.length}{" "}
        {!q.required && " · " + t("Optional", "Neobvezno")}
      </span>
      <h2 id="question-title">{q.label}</h2>
      {q.help && <p className="muted">{q.help}</p>}
      {q.type === "single_choice" || q.type === "boolean" ? (
        <div
          className="native-options"
          role="group"
          aria-labelledby="question-title"
        >
          {(q.type === "boolean"
            ? [
                { id: true, label: t("Yes", "Da") },
                { id: false, label: t("No", "Ne") },
              ]
            : q.options!
          ).map((o) => (
            <button
              type="button"
              className={value === o.id ? "selected" : ""}
              key={String(o.id)}
              disabled={transition.current}
              onClick={() => choice(o.id)}
            >
              {o.label}
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <label className="field">
          {t("Your answer", "Tvoj odgovor")}
          {q.type === "short_text" ? (
            <textarea
              autoFocus
              aria-describedby={error ? "answer-error" : undefined}
              value={String(value ?? "")}
              maxLength={q.maxLength ?? 120}
              onChange={(e) => methods.setValue(q.id, e.target.value)}
            />
          ) : (
            <input
              autoFocus
              type={q.type === "number" ? "number" : "email"}
              value={value === null || value === undefined ? "" : String(value)}
              min={q.min}
              max={q.max}
              step={q.step}
              maxLength={254}
              onChange={(e) =>
                methods.setValue(
                  q.id,
                  q.type === "number"
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
            />
          )}
        </label>
      )}
      {error && (
        <p className="error" id="answer-error" role="alert">
          {error}
        </p>
      )}
      <div className="between">
        <button
          className="text-button"
          type="button"
          onClick={goBack}
          disabled={index === 0}
        >
          <ArrowLeft size={16} />
          {t("Back", "Nazaj")}
        </button>
        <div className="row">
          {!q.required && (
            <button className="text-button" type="button" onClick={skip}>
              {t("Skip", "Preskoči")}
            </button>
          )}
          {!["single_choice", "boolean"].includes(q.type) && (
            <button className="primary" type="submit">
              {t("Continue", "Nadaljuj")}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
  return (
    <div className={"experience " + (reduced ? "reduce-motion" : "")}>
      {mode === "game" && graphicsReady && !fallback && (
        <div
          className={
            "game-world " +
            (stage === "intro" ||
            (!locked && stage === "question") ||
            stage === "review" ||
            stage === "success"
              ? "soften"
              : "")
          }
        >
          <Suspense fallback={<div className="center-screen">Loading 3D…</div>}>
            <Scene
              targets={targets}
              title={
                stage === "question"
                  ? q.label
                  : t(
                      "A little less form. A little more play.",
                      "Manj obrazca. Več igre.",
                    )
              }
              subtitle={
                stage === "question"
                  ? `${t("QUESTION", "VPRAŠANJE")} ${String(index + 1).padStart(2, "0")} / ${String(d.questions.length).padStart(2, "0")}  ·  ${q.required ? t("REQUIRED", "OBVEZNO") : t("OPTIONAL", "NEOBVEZNO")}`
                  : "GAMYFORM  /  THE COURTYARD"
              }
              value={
                stage === "question" &&
                !["single_choice", "boolean"].includes(q.type)
                  ? String(
                      value ??
                        (q.type === "number" ? (q.displayStart ?? q.min) : ""),
                    )
                  : undefined
              }
              generation={generation}
              active={
                locked &&
                (stage === "question" || stage === "practice") &&
                !typing
              }
              reduced={reduced}
              onAction={action}
              onLock={setLocked}
              onShot={(hit) => {
                sound.play("shot");
                setHit(hit);
                setTimeout(() => setHit(false), 130);
              }}
              onAim={setAim}
              onError={() => {
                unlock();
                setFallback(
                  t(
                    "3D is unavailable in this browser. Your answers are safe; continue below.",
                    "3D ni na voljo. Tvoji odgovori so ohranjeni.",
                  ),
                );
                setMode("standard");
                if (stage === "practice") setStage("question");
              }}
              recenter={recenter}
            />
          </Suspense>
        </div>
      )}
      <header className="game-header">
        <a
          href={back}
          onClick={(e) => {
            e.preventDefault();
            navigate(back);
          }}
          className="game-brand"
        >
          <Target size={25} />
          gamyform<span>PLAYFUL BY DESIGN</span>
        </a>
        <div className="row">
          {(preview || demo) && (
            <span className="preview-pill">
              {preview ? "PREVIEW" : "DEMO"} ·{" "}
              {t("No responses saved", "Odgovori se ne shranijo")}
            </span>
          )}
          <span className="courtyard-label">
            THE COURTYARD <i />
          </span>
        </div>
      </header>
      {locked && ["practice", "question"].includes(stage) && (
        <>
          <div
            className={
              "crosshair " + (aim ? "on-target " : "") + (hit ? "hit" : "")
            }
          >
            <i />
            <b />
          </div>
          <div className="game-progress">
            <span>
              {stage === "practice"
                ? t(
                    "A practice shot. Nothing is submitted.",
                    "Poskusni strel. Nič se ne odda.",
                  )
                : t(
                    "Your next chapter starts here.",
                    "Tvoja naslednja zgodba se začne tukaj.",
                  )}
            </span>
            <div>
              {d.questions.map((x, i) => (
                <i
                  key={x.id}
                  className={i < index ? "done" : i === index ? "current" : ""}
                />
              ))}
            </div>
          </div>
          {stage === "question" && q.help && !error && (
            <div className="question-help">{q.help}</div>
          )}
          {error && (
            <div className="game-error" role="alert">
              {error}
            </div>
          )}
          <footer className="game-hints">
            <span>
              <MousePointer2 size={15} />{" "}
              {t("Move to aim", "Premikaj za merjenje")}
            </span>
            <span>
              <Target size={16} />
              {t("Click to shoot", "Klikni za strel")}
            </span>
            <span>
              <kbd>ESC</kbd>
              {t("Pause & options", "Premor in možnosti")}
            </span>
          </footer>
        </>
      )}
      {stage === "intro" && (
        <div className="game-overlay">
          <div className="intro-card">
            <span className="eyebrow">
              <i className="status-dot" />
              {t(
                "A MORE HUMAN WAY TO CONNECT",
                "BOLJ ZABAVEN NAČIN POVEZOVANJA",
              )}
            </span>
            <h1>{d.title}</h1>
            <p>
              {d.description ||
                t(
                  "A few questions. A fresh perspective. Make yourself at home.",
                  "Nekaj vprašanj. Sveža perspektiva. Dobrodošel.",
                )}
            </p>
            <div className="intro-meta">
              <span>
                {d.questions.length} {t("questions", "vprašanj")}
              </span>
              <i /> <span>{t("About 2 minutes", "Približno 2 minuti")}</span>
              <i />
              <span>{t("No wrong answers", "Ni napačnih odgovorov")}</span>
            </div>
            <button
              className="gold big"
              onClick={() => start("game")}
              disabled={!graphicsReady || !!fallback}
            >
              <Target size={19} />
              {t("Let’s play", "Začni igro")}
              <ArrowRight size={18} />
            </button>
            <button
              className="intro-alternative"
              onClick={() => start("standard")}
            >
              {t("Prefer a classic form?", "Želiš običajen obrazec?")}{" "}
              <span>{t("Use standard mode", "Običajen način")} ↗</span>
            </button>
            {fallback && <p className="notice">{fallback}</p>}
            <p className="desktop-note">
              {t(
                "Made for desktop. Mouse + keyboard.",
                "Za računalnik. Miška in tipkovnica.",
              )}
            </p>
          </div>
        </div>
      )}
      {((!locked &&
        mode === "game" &&
        ["question", "practice"].includes(stage)) ||
        typing) && (
        <div className="game-overlay">
          <div className="overlay-card">
            {typing ? (
              <>
                <button
                  className="icon close"
                  aria-label="Close typing"
                  onClick={() => setTyping(false)}
                >
                  <X size={20} />
                </button>
                {native}
              </>
            ) : (
              <>
                <span className="eyebrow">
                  {t("TAKE YOUR TIME", "BREZ HITENJA")}
                </span>
                <h2>{t("A little pause.", "Kratek premor.")}</h2>
                <p>
                  {t(
                    "Your answers stay right here.",
                    "Tvoji odgovori ostanejo tukaj.",
                  )}
                </p>
                <button className="gold wide" onClick={() => void lock()}>
                  <Target size={18} />
                  {t("Resume experience", "Nadaljuj igro")}
                </button>
                <button
                  className="outline wide"
                  onClick={() => {
                    setRecenter((v) => v + 1);
                    void lock();
                  }}
                >
                  <RotateCcw size={16} />
                  {t("Recenter & resume", "Poravnaj pogled in nadaljuj")}
                </button>
                <button className="text-button wide" onClick={switchMode}>
                  <Keyboard size={16} />
                  {t("Switch to standard form", "Preklopi na običajen obrazec")}
                </button>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reduced}
                    onChange={(e) => setReduced(e.target.checked)}
                  />
                  {t("Reduce motion", "Zmanjšaj gibanje")}
                </label>
                <label className="check-row">
                  {t("Sound", "Zvok")}
                  <input
                    aria-label="Sound volume"
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                  />
                </label>
              </>
            )}
          </div>
        </div>
      )}
      {mode === "standard" && stage === "question" && (
        <div className="game-overlay standard-overlay">
          <div className="overlay-card">
            {fallback && <p className="notice">{fallback}</p>}
            {native}
          </div>
        </div>
      )}
      {stage === "review" && (
        <div className="game-overlay">
          <div className="overlay-card review-card">
            <span className="eyebrow">
              {t("ONE LAST LOOK", "ŠE ZADNJI PREGLED")}
            </span>
            <h2>{t("Looking good?", "Vse v redu?")}</h2>
            <p className="muted">
              {t(
                "Check your answers before you send them.",
                "Preveri odgovore pred oddajo.",
              )}
            </p>
            <div className="review-list">
              {d.questions.map((q, i) => (
                <div key={q.id}>
                  <div>
                    <span>{q.label}</span>
                    <strong>{answerLabel(q, answers[q.id])}</strong>
                  </div>
                  <button
                    disabled={!!frozen.current}
                    className="text-button"
                    onClick={() => edit(i)}
                  >
                    {t("Edit", "Uredi")}
                  </button>
                </div>
              ))}
            </div>
            {d.privacyUrl && (
              <p className="muted small">
                {t(
                  "Learn how your information is used:",
                  "Kako uporabljamo tvoje podatke:",
                )}{" "}
                <a target="_blank" rel="noreferrer" href={d.privacyUrl}>
                  {t("Privacy policy", "Zasebnost")}
                </a>
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" onClick={submit} disabled={busy}>
              {busy
                ? t("Sending…", "Pošiljanje…")
                : frozen.current
                  ? t("Retry submission", "Ponovi oddajo")
                  : t("Send my answers", "Pošlji odgovore")}
              <ArrowRight size={17} />
            </button>
            <p className="small muted centered">
              {t(
                "Only this button submits your answers.",
                "Šele ta gumb odda tvoje odgovore.",
              )}
            </p>
          </div>
        </div>
      )}
      {stage === "success" && (
        <div className="game-overlay">
          <div className="overlay-card success-card">
            <div className="success-icon">
              <CheckCircle2 size={35} />
            </div>
            <span className="eyebrow">
              {sent
                ? t("MESSAGE RECEIVED", "ODGOVORI PREJETI")
                : t("EXPERIENCE COMPLETE", "IGRA KONČANA")}
            </span>
            <h2>{d.completion.title}</h2>
            <p>{d.completion.message}</p>
            {(preview || demo) && (
              <p className="notice">
                {t(
                  "This was a preview. No response was saved.",
                  "To je bil predogled. Odgovori niso shranjeni.",
                )}
              </p>
            )}
            {(preview || demo) && (
              <button className="primary" onClick={() => navigate(back)}>
                {t("Back to workspace", "Nazaj v aplikacijo")}
                <ArrowRight size={16} />
              </button>
            )}
            <div className="signature">
              Made a little more fun with <strong>gamyform</strong>
            </div>
          </div>
        </div>
      )}
      <div className="game-bottom">
        <span>GAMYFORM EXPERIENCE / 001</span>
        <button
          className="sound-button"
          onClick={() => {
            void sound.unlock();
            setMuted((v) => !v);
          }}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          <span>{muted ? "SOUND OFF" : "SOUND ON"}</span>
        </button>
      </div>
    </div>
  );
}
