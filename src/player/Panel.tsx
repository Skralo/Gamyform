import {
  useEffect,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowLeft, Check, Volume2, VolumeX } from "lucide-react";
import type { Answers, Definition, Question } from "../domain";
import type { Copy } from "./copy";

export type Stage = "start" | "question" | "review" | "success";

export type PanelView = {
  stage: Stage;
  mode: "game" | "standard";
  d: Definition;
  index: number;
  answers: Answers;
  error: string;
  busy: boolean;
  frozen: boolean;
  muted: boolean;
  notice: string;
  preview: boolean;
  canExit: boolean;
};

export type PanelActions = {
  start(): void;
  choose(value: string | boolean): void;
  step(delta: 1 | -1): void;
  setValue(value: string | number | null): void;
  confirm(): void;
  back(): void;
  skip(): void;
  edit(index: number): void;
  send(): void;
  exit(): void;
  toggleMute(): void;
};

type Sub = { view: PanelView; actions: PanelActions; t: Copy };

export function choicesOf(q: Question, t: Copy) {
  return q.type === "boolean"
    ? [
        { id: true, label: t.yes },
        { id: false, label: t.no },
      ]
    : (q.options ?? []);
}

export function answerText(q: Question, v: unknown, t: Copy) {
  if (v === null || v === undefined || v === "") return t.notAnswered;
  if (q.type === "boolean") return v ? t.yes : t.no;
  if (q.type === "single_choice")
    return q.options?.find((o) => o.id === v)?.label ?? String(v);
  return String(v);
}

/** The glass panel. Every shootable control carries `data-target`. */
export function Panel({ view, actions, t }: Sub) {
  const total = view.d.questions.length;
  const progress =
    view.stage === "question"
      ? view.index / total
      : view.stage === "start"
        ? 0
        : 1;
  let body: ReactNode = null;
  if (view.stage === "start") body = <Start view={view} actions={actions} t={t} />;
  if (view.stage === "question")
    body = <QuestionView view={view} actions={actions} t={t} />;
  if (view.stage === "review") body = <Review view={view} actions={actions} t={t} />;
  if (view.stage === "success")
    body = <Success view={view} actions={actions} t={t} />;
  return (
    <section className="gf-panel" aria-live="polite">
      <div className="gf-progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="gf-body" key={view.stage + ":" + view.index}>
        {body}
      </div>
      <div className="gf-impacts" aria-hidden="true" />
    </section>
  );
}

function Start({ view, actions, t }: Sub) {
  return (
    <div className="gf-start">
      <button
        type="button"
        className="gf-icon gf-sound"
        onClick={actions.toggleMute}
        aria-label={view.muted ? t.soundOff : t.soundOn}
      >
        {view.muted ? <VolumeX /> : <Volume2 />}
      </button>
      <h1 className="gf-title">{view.d.title}</h1>
      {view.d.description && <p className="gf-help">{view.d.description}</p>}
      {view.notice && <p className="gf-notice">{view.notice}</p>}
      <button
        type="button"
        className="gf-pill gf-primary gf-go"
        onClick={actions.start}
      >
        {t.start}
      </button>
    </div>
  );
}

function QuestionView({ view, actions, t }: Sub) {
  const q = view.d.questions[view.index];
  const value = view.answers[q.id];
  return (
    <>
      <div className="gf-top">
        {view.index > 0 ? (
          <button
            type="button"
            className="gf-pill gf-quiet gf-back"
            data-target
            onClick={actions.back}
            aria-label={t.back}
          >
            <ArrowLeft />
          </button>
        ) : (
          <span className="gf-spacer" />
        )}
        <span className="gf-meta">
          {view.index + 1} / {view.d.questions.length}
        </span>
        {!q.required ? (
          <button
            type="button"
            className="gf-pill gf-quiet"
            data-target
            onClick={actions.skip}
          >
            {t.skip}
          </button>
        ) : (
          <span className="gf-spacer" />
        )}
      </div>
      <h2 className="gf-question" id="gf-q">
        {q.label}
      </h2>
      {q.help && <p className="gf-help">{q.help}</p>}
      {(q.type === "single_choice" || q.type === "boolean") && (
        <div className="gf-choices" role="group" aria-labelledby="gf-q">
          {choicesOf(q, t).map((o, i) => (
            <button
              key={String(o.id)}
              type="button"
              data-target
              className={"gf-card" + (value === o.id ? " is-selected" : "")}
              style={{ "--i": i } as CSSProperties}
              onClick={() => actions.choose(o.id)}
            >
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
      {q.type === "number" && (
        <NumberField q={q} value={value} actions={actions} t={t} />
      )}
      {(q.type === "short_text" || q.type === "email") && (
        <TextField q={q} value={value} actions={actions} t={t} />
      )}
      {view.error && (
        <p className="gf-error" role="alert">
          {view.error}
        </p>
      )}
    </>
  );
}

/** Focus without scrolling: the panel may live inside a 3D-transformed layer. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

type FieldProps = {
  q: Question;
  value: unknown;
  actions: PanelActions;
  t: Copy;
};

function NumberField({ q, value, actions, t }: FieldProps) {
  const ref = useFocusOnMount<HTMLInputElement>();
  const min = q.min ?? 0,
    max = q.max ?? 100;
  const n = typeof value === "number" ? value : null;
  return (
    <form
      className="gf-number"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        actions.confirm();
      }}
    >
      <button
        type="button"
        className="gf-round"
        data-target
        disabled={n !== null && n <= min}
        onClick={() => actions.step(-1)}
        aria-label={t.decrease}
      >
        <span>−</span>
      </button>
      <input
        ref={ref}
        className="gf-number-value"
        inputMode="numeric"
        aria-labelledby="gf-q"
        value={n ?? ""}
        placeholder={String(q.displayStart ?? min)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9-]/g, "");
          actions.setValue(raw === "" || raw === "-" ? null : Number(raw));
        }}
      />
      <button
        type="button"
        className="gf-round"
        data-target
        disabled={n !== null && n >= max}
        onClick={() => actions.step(1)}
        aria-label={t.increase}
      >
        <span>+</span>
      </button>
      <button type="submit" className="gf-pill gf-primary gf-continue" data-target>
        {t.continue}
      </button>
    </form>
  );
}

function TextField({ q, value, actions, t }: FieldProps) {
  const ref = useFocusOnMount<HTMLInputElement & HTMLTextAreaElement>();
  const long = q.type === "short_text" && (q.maxLength ?? 120) > 120;
  const common = {
    ref,
    className: "gf-input",
    value: String(value ?? ""),
    maxLength: q.type === "email" ? 254 : (q.maxLength ?? 120),
    placeholder: q.type === "email" ? t.emailHere : t.typeHere,
    "aria-labelledby": "gf-q",
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      actions.setValue(e.target.value),
  };
  return (
    <form
      className="gf-text"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        actions.confirm();
      }}
    >
      {long ? (
        <textarea
          {...common}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              actions.confirm();
            }
          }}
        />
      ) : (
        <input
          {...common}
          type={q.type === "email" ? "email" : "text"}
          spellCheck={q.type !== "email"}
          autoComplete={
            q.contactRole === "email"
              ? "email"
              : q.contactRole === "name"
                ? "name"
                : "off"
          }
        />
      )}
      <button type="submit" className="gf-pill gf-primary gf-continue" data-target>
        {t.continue}
      </button>
    </form>
  );
}

function Review({ view, actions, t }: Sub) {
  return (
    <>
      <h2 className="gf-question gf-question-sm">{t.review}</h2>
      <div className="gf-review">
        {view.d.questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            className="gf-row"
            data-target
            disabled={view.frozen}
            onClick={() => actions.edit(i)}
          >
            <span className="gf-row-q">{q.label}</span>
            <span className="gf-row-a">{answerText(q, view.answers[q.id], t)}</span>
          </button>
        ))}
      </div>
      {view.d.privacyUrl && (
        <a
          className="gf-privacy"
          href={view.d.privacyUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t.privacy}
        </a>
      )}
      {view.error && (
        <p className="gf-error" role="alert">
          {view.error}
        </p>
      )}
      <button
        type="button"
        className="gf-pill gf-primary gf-wide"
        data-target
        disabled={view.busy}
        onClick={actions.send}
      >
        {view.busy ? t.sending : view.frozen ? t.retry : t.send}
      </button>
    </>
  );
}

function Success({ view, actions, t }: Sub) {
  return (
    <div className="gf-success">
      <div className="gf-check" aria-hidden="true">
        <Check strokeWidth={3} />
      </div>
      <h2 className="gf-question">{view.d.completion.title}</h2>
      {view.d.completion.message && (
        <p className="gf-help">{view.d.completion.message}</p>
      )}
      {view.preview && <p className="gf-notice">{t.savedNothing}</p>}
      {view.canExit && (
        <button type="button" className="gf-pill gf-quiet" onClick={actions.exit}>
          {t.backToWorkspace}
        </button>
      )}
    </div>
  );
}
