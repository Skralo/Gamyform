import { newId } from "../id";
import { useEffect, useState, useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Play,
  Save,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Download,
  Check,
  Link as LinkIcon,
  Eye,
  MoreHorizontal,
  X,
  MessageSquare,
  MousePointer2,
  LayoutGrid,
  LogOut,
  Target,
  FileText,
} from "lucide-react";
import { api, navigate } from "../api";
import {
  validateDefinition,
  newQuestion,
  answerLabel,
  type Definition,
} from "../domain";
import { QuestionEditor, types } from "./QuestionEditor";
import { FormWrapper } from "../components/FormWrapper";
import { z } from "zod";
type FormRecord = {
  id: string;
  slug: string;
  definition: Definition;
  revision: number;
  status: string;
  responses: number;
  current_version: string | null;
  created_at: string;
};
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Target size={22} />
      </span>
      gamyform<span className="beta">BETA</span>
    </span>
  );
}
export function Login({
  configured,
  onLogin,
}: {
  configured: boolean;
  onLogin: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <div className="login-page">
      <Brand />
      <div className="login-layout">
        <section>
          <span className="eyebrow">A LITTLE LESS FORM. A LOT MORE PLAY.</span>
          <h1>
            Make every
            <br />
            answer an
            <br />
            <em>experience.</em>
          </h1>
          <p>Your questions. Your world. A better way to connect.</p>
          <button className="btn primary" onClick={() => navigate("/demo")}>
            <Play size={17} /> Try the interactive demo{" "}
            <ArrowUpRight size={17} />
          </button>
          <small className="muted">
            Desktop experience · sound on recommended
          </small>
        </section>
        <div className="login-card">
          <div className="round-icon">
            <LayoutGrid />
          </div>
          <h2>Your creative workspace</h2>
          <p>Sign in to create, publish and see what comes back.</p>
          {configured ? (
            <FormWrapper
              schema={z.object({ password: z.string().min(1) })}
              defaultValues={{ password: "" }}
              onSubmit={async (v) => {
                try {
                  await api("/owner/login", "POST", v);
                  onLogin();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {(form) => (
                <>
                  <label>
                    Workspace password
                    <input
                      {...form.register("password")}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                    />
                  </label>
                  {error && (
                    <div className="error" role="alert">
                      {error}
                    </div>
                  )}
                  <button
                    className="btn primary full"
                    disabled={form.formState.isSubmitting}
                  >
                    Open workspace <ArrowRight size={17} />
                  </button>
                </>
              )}
            </FormWrapper>
          ) : (
            <div className="notice">
              One-time setup: run <code>npm run setup</code> in your project,
              then restart the server. Your forms and responses stay on your own
              infrastructure.
            </div>
          )}
          <div className="login-footer">
            <span className="status-dot" /> A workspace of your own
          </div>
        </div>
      </div>
      <footer>MADE FOR HUMAN CONNECTION.</footer>
    </div>
  );
}
export function Workspace({
  path,
  aiConfigured,
  onLogout,
}: {
  path: string;
  aiConfigured: boolean;
  onLogout: () => void;
}) {
  const [forms, setForms] = useState<FormRecord[]>([]),
    [error, setError] = useState(""),
    [create, setCreate] = useState(false),
    [brief, setBrief] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/owner/forms")
      .then((r) => setForms(r.forms))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [path]);
  const make = async (ai: boolean) => {
    setBusy(true);
    setError("");
    try {
      const generated = ai
        ? await api("/owner/generate", "POST", { brief, locale: "en" })
        : null;
      const f = await api(
        "/owner/forms",
        "POST",
        generated ? { definition: generated.definition } : {},
      );
      setCreate(false);
      navigate("/forms/" + f.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const parts = path.split("/");
  const selected = parts[1] === "forms" ? parts[2] : undefined;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <Brand />
        </a>
        <div className="workspace-label">
          <span className="avatar">S</span>
          <span>
            SKRALOVNIK<small>Personal workspace</small>
          </span>
          <MoreHorizontal size={17} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <button className="nav-item active" onClick={() => navigate("/")}>
          <LayoutGrid size={18} />
          My forms<span>{forms.length}</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/demo")}>
          <MousePointer2 size={18} />
          Try the experience
          <ArrowUpRight size={15} />
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-cross">✳</span>
            <strong>
              Good questions.
              <br />
              Better connections.
            </strong>
            <p>Make filling out a form the fun part.</p>
          </div>
          <button
            className="profile"
            onClick={async () => {
              await api("/owner/logout", "POST", {});
              onLogout();
            }}
          >
            <span className="avatar warm">AS</span>
            <span>
              Anže Skralovnik<small>Workspace owner</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>{selected ? "Form studio" : "My forms"}</strong>
          </span>
          <span className="topbar-right">
            <span className="status-dot" /> YOUR SPACE TO CREATE
          </span>
        </header>
        {selected ? (
          parts[3] === "responses" ? (
            <Responses id={selected} />
          ) : (
            <Editor key={selected} id={selected} />
          )
        ) : (
          <main className="workspace-main">
            <div className="page-heading">
              <div className="eyebrow">LET’S MAKE SOMETHING INTERACTIVE</div>
              <div className="heading-row">
                <div>
                  <h1>
                    Your forms, with more <em>play.</em>
                  </h1>
                  <p>
                    Turn a few questions into an experience people remember.
                  </p>
                </div>
                <button
                  className="btn primary"
                  onClick={() => {
                    setError("");
                    setCreate(true);
                  }}
                >
                  <Plus size={18} />
                  Create a form
                </button>
              </div>
            </div>
            <section className="feature-strip">
              <div>
                <div className="pill dark">
                  <span className="status-dot" /> THE FIRST-PERSON FORM
                </div>
                <h2>
                  Less scrolling.
                  <br />
                  More <em>“one more question.”</em>
                </h2>
                <p>
                  Aim. Answer. Connect.
                  <br />
                  See your questions in a whole new dimension.
                </p>
                <button className="btn light" onClick={() => navigate("/demo")}>
                  <Play size={16} />
                  Play the demo
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="target-illustration" aria-hidden="true">
                <div className="illustration-line" />
                <div className="floating-label">
                  01 / WHAT’S YOUR NEXT MOVE?
                </div>
                <div className="demo-target t1">
                  <span>A</span>Build something new<i>↗</i>
                </div>
                <div className="demo-target t2">
                  <span>B</span>Make things better<i>↗</i>
                </div>
                <div className="decor-cross">+</div>
                <div className="orbit orbit1" />
                <div className="orbit orbit2" />
                <span className="coordinate">
                  STATIONARY WORLD. ENDLESS POSSIBILITIES.
                </span>
              </div>
            </section>
            <div className="section-title">
              <h2>
                All forms <span className="count">{forms.length}</span>
              </h2>
              <span className="muted">Made by you. Played by them.</span>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <div className="form-grid">
              {forms.map((f) => (
                <article className="form-card" key={f.id}>
                  <button
                    className="card-art"
                    onClick={() => navigate("/forms/" + f.id)}
                    aria-label={"Edit " + f.definition.title}
                  >
                    <span className="card-brand">SKRALOVNIK</span>
                    <div className="card-target">
                      <Target size={64} strokeWidth={0.8} />
                    </div>
                    <span className="art-caption">
                      THE COURTYARD <span>3D EXPERIENCE</span>
                    </span>
                  </button>
                  <div className="card-body">
                    <div className="card-status">
                      <span
                        className={
                          "pill " + (f.status === "open" ? "green" : "")
                        }
                      >
                        {f.status === "open"
                          ? "Live"
                          : f.status === "closed"
                            ? "Closed"
                            : "Draft"}
                      </span>
                      <span>{f.definition.questions.length} questions</span>
                    </div>
                    <h3>{f.definition.title}</h3>
                    <div className="card-actions">
                      <button
                        onClick={() =>
                          navigate("/forms/" + f.id + "/responses")
                        }
                      >
                        <MessageSquare size={15} />
                        {f.responses} responses
                      </button>
                      <button
                        onClick={() => navigate("/forms/" + f.id)}
                        aria-label={"Open " + f.definition.title}
                      >
                        Open studio <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              <button
                className="new-form-card"
                onClick={() => {
                  setError("");
                  setCreate(true);
                }}
              >
                <span className="round-icon">
                  <Plus size={25} />
                </span>
                <strong>Your next great question</strong>
                <span>Start with an idea. Add a little play.</span>
              </button>
            </div>
            <div className="workspace-footer">
              <span>CRAFTED FOR CONNECTION</span>
              <span>Gamyform · Early access</span>
            </div>
          </main>
        )}
      </div>
      {create && (
        <div className="modal-backdrop">
          <div className="modal">
            <button
              className="icon-button close"
              onClick={() => !busy && setCreate(false)}
              aria-label="Close"
            >
              <X />
            </button>
            <span className="round-icon">
              <Sparkles />
            </span>
            <h2>What do you want to ask?</h2>
            <p>Describe who it’s for and what you’d like to learn.</p>
            <label>
              Your idea
              <textarea
                rows={5}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                maxLength={4000}
                placeholder="A short enquiry form for my AI consulting service. Ask what they need help with, their team size, name and email."
              />
            </label>
            {!aiConfigured && (
              <div className="notice">
                AI drafting needs a server API key. You can build and publish
                with the editable sample right now.
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button
              className="btn primary full"
              disabled={busy || brief.length < 10 || !aiConfigured}
              onClick={() => make(true)}
            >
              <Sparkles size={16} />
              {busy ? "Creating…" : "Generate my form"}
            </button>
            <button
              className="btn secondary full"
              disabled={busy}
              onClick={() => make(false)}
            >
              Start with the editable sample <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Editor({ id }: { id: string }) {
  const [record, setRecord] = useState<FormRecord>(),
    [def, setDef] = useState<Definition>(),
    [selected, setSelected] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("questions");
  useEffect(() => {
    api("/owner/forms/" + id)
      .then((f) => {
        setRecord(f);
        setDef(f.definition);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const dirtyRef = useRef(false);
  useEffect(() => {
    const guard = (e: Event) => {
      if (dirtyRef.current && !confirm("Leave with unsaved changes?"))
        e.preventDefault();
    };
    window.addEventListener("gamyform:navigate", guard);
    return () => window.removeEventListener("gamyform:navigate", guard);
  }, []);
  const change = (d: Definition) => {
    if (busy) return;
    dirtyRef.current = true;
    setDef(d);
    setDirty(true);
    setNotice("");
  };
  const save = async () => {
    if (!def || !record) return;
    const d = validateDefinition(def);
    const r = await api("/owner/forms/" + id, "PUT", {
      definition: d,
      revision: record.revision,
    });
    setRecord(r);
    setDef(r.definition);
    dirtyRef.current = false;
    setDirty(false);
    setNotice("All changes saved");
    return r;
  };
  const updatePublication = (remote: FormRecord) =>
    setRecord((current) =>
      current
        ? {
            ...current,
            status: remote.status,
            current_version: remote.current_version,
          }
        : current,
    );
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!def || !record)
    return (
      <main className="workspace-main">{error || "Opening your studio…"}</main>
    );
  const q = def.questions[selected];
  const reorder = (delta: number) => {
    const qs = [...def.questions];
    const to = selected + delta;
    if (to < 0 || to >= qs.length) return;
    [qs[selected], qs[to]] = [qs[to], qs[selected]];
    change({ ...def, questions: qs });
    setSelected(to);
  };
  return (
    <main className="editor-page">
      <fieldset className="editor-lock" disabled={busy}>
        <div className="editor-top">
          <button
            className="text-button"
            onClick={() => {
              navigate("/");
            }}
          >
            <ArrowLeft size={16} />
            My forms
          </button>
          <div className="editor-actions">
            <span className="save-state">
              {dirty ? "Unsaved changes" : notice || "Saved"}
            </span>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await save();
                })
              }
            >
              <Save size={15} />
              Save
            </button>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await save();
                  navigate("/preview/" + id);
                })
              }
            >
              <Play size={15} />
              Preview
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await save();
                  await api(`/owner/forms/${id}/publish`, "POST", {
                    revision: r.revision,
                  });
                  updatePublication(await api("/owner/forms/" + id));
                  setNotice("Published. Your experience is live.");
                })
              }
            >
              <ArrowUpRight size={15} />
              {record.current_version ? "Publish changes" : "Publish"}
            </button>
          </div>
        </div>
        <div className="editor-heading">
          <span className="eyebrow">FORM STUDIO</span>
          <input
            aria-label="Form title"
            className="title-input"
            maxLength={80}
            value={def.title}
            onChange={(e) => change({ ...def, title: e.target.value })}
          />
          <input
            aria-label="Form description"
            className="description-input"
            maxLength={600}
            value={def.description}
            onChange={(e) => change({ ...def, description: e.target.value })}
          />
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {record.current_version && (
          <div className="published-bar">
            <span>
              <span className="status-dot" />{" "}
              {record.status === "open"
                ? "Live experience"
                : "Experience closed"}
            </span>
            <a href={"/f/" + record.slug} target="_blank" rel="noreferrer">
              Open link <ArrowUpRight size={14} />
            </a>
            <button
              className="text-button"
              onClick={() =>
                act(async () => {
                  await navigator.clipboard.writeText(
                    location.origin + "/f/" + record.slug,
                  );
                  setNotice("Link copied");
                })
              }
            >
              <Copy size={14} />
              Copy
            </button>
            <button
              className="text-button"
              onClick={() =>
                act(async () => {
                  updatePublication(
                    await api(
                      `/owner/forms/${id}/${record.status === "open" ? "close" : "reopen"}`,
                      "POST",
                      {},
                    ),
                  );
                })
              }
            >
              {record.status === "open" ? "Close form" : "Reopen"}
            </button>
          </div>
        )}
        <div className="tabs">
          <button
            className={tab === "questions" ? "selected" : ""}
            onClick={() => setTab("questions")}
          >
            Questions <span>{def.questions.length}</span>
          </button>
          <button
            className={tab === "settings" ? "selected" : ""}
            onClick={() => setTab("settings")}
          >
            Experience settings
          </button>
          <button
            onClick={() => {
              navigate(`/forms/${id}/responses`);
            }}
          >
            Responses <ArrowUpRight size={14} />
          </button>
        </div>
        {tab === "questions" ? (
          <div className="editor-grid">
            <section className="question-list">
              <div className="eyebrow">YOUR CONVERSATION</div>
              {def.questions.map((f, i) => (
                <button
                  className={
                    "question-row " + (i === selected ? "selected" : "")
                  }
                  key={f.id}
                  onClick={() => setSelected(i)}
                >
                  <span className="question-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <small>{types[f.type]}</small>
                    <strong>{f.label}</strong>
                  </span>
                  <span className="question-arrow">↗</span>
                </button>
              ))}
              <button
                className="add-question"
                disabled={def.questions.length >= 10}
                onClick={() => {
                  change({
                    ...def,
                    questions: [...def.questions, newQuestion()],
                  });
                  setSelected(def.questions.length);
                }}
              >
                <Plus size={17} />
                Add question
              </button>
              <div className="question-list-note">
                <Target size={18} />
                <p>
                  Every question becomes a new target.
                  <br />
                  Keep it short. Make it count.
                </p>
              </div>
            </section>
            <section className="question-panel">
              <div className="question-toolbar">
                <span>
                  QUESTION {selected + 1} OF {def.questions.length}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Move question up"
                    disabled={!selected}
                    onClick={() => reorder(-1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move question down"
                    disabled={selected === def.questions.length - 1}
                    onClick={() => reorder(1)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Duplicate question"
                    disabled={def.questions.length >= 10}
                    onClick={() => {
                      change({
                        ...def,
                        questions: [
                          ...def.questions,
                          { ...q, id: newId(), contactRole: undefined },
                        ],
                      });
                      setSelected(def.questions.length);
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label="Delete question"
                    disabled={def.questions.length <= 1}
                    onClick={() => {
                      change({
                        ...def,
                        questions: def.questions.filter(
                          (_, i) => i !== selected,
                        ),
                      });
                      setSelected(Math.max(0, selected - 1));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <QuestionEditor
                field={q}
                onSave={(v) =>
                  change({
                    ...def,
                    questions: def.questions.map((x, i) =>
                      i === selected ? v : x,
                    ),
                  })
                }
              />
            </section>
          </div>
        ) : (
          <div className="settings-panel">
            <div className="scene-swatch">
              <Target size={60} />
              <span>SKRALOVNIK / THE COURTYARD</span>
              <strong>Your world, in deep teal & gold.</strong>
            </div>
            <div>
              <label>
                Form language
                <select
                  value={def.locale}
                  onChange={(e) =>
                    change({ ...def, locale: e.target.value as "en" | "sl" })
                  }
                >
                  <option value="en">English</option>
                  <option value="sl">Slovenian</option>
                </select>
              </label>
              <label>
                Privacy information URL
                <input
                  type="url"
                  value={def.privacyUrl}
                  placeholder="https://yourwebsite.com/privacy"
                  onChange={(e) =>
                    change({ ...def, privacyUrl: e.target.value })
                  }
                />
              </label>
              <label>
                Completion title
                <input
                  value={def.completion.title}
                  maxLength={80}
                  onChange={(e) =>
                    change({
                      ...def,
                      completion: { ...def.completion, title: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Completion message
                <textarea
                  value={def.completion.message}
                  maxLength={500}
                  onChange={(e) =>
                    change({
                      ...def,
                      completion: {
                        ...def.completion,
                        message: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <p className="muted">
                One handcrafted scene. Desktop controls. Sound and reduced
                motion can be adjusted by each visitor.
              </p>
            </div>
          </div>
        )}
      </fieldset>
    </main>
  );
}
function Responses({ id }: { id: string }) {
  const [data, setData] = useState<any>({ rows: [], total: 0 }),
    [form, setForm] = useState<FormRecord>(),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<any>(),
    [error, setError] = useState("");
  const load = () =>
    api(`/owner/forms/${id}/submissions?page=${page}`)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api("/owner/forms/" + id)
      .then(setForm)
      .catch((e) => setError(e.message));
  }, [id, page]);
  return (
    <main className="workspace-main">
      <button className="text-button" onClick={() => navigate("/forms/" + id)}>
        <ArrowLeft size={16} />
        Back to studio
      </button>
      <div className="heading-row response-heading">
        <div>
          <div className="eyebrow">THE OTHER SIDE OF THE CONVERSATION</div>
          <h1>
            Responses <span className="count">{data.total}</span>
          </h1>
          <p>{form?.definition.title}</p>
        </div>
        <a
          className="btn secondary"
          href={`/api/owner/forms/${id}/submissions.csv`}
        >
          <Download size={16} />
          Export CSV
        </a>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Received</th>
              <th>Version</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => {
              const contact = (role: string) =>
                r.answers[
                  r.definition.questions.find(
                    (q: any) => q.contactRole === role,
                  )?.id
                ] ?? "—";
              return (
                <tr key={r.id}>
                  <td>{contact("name")}</td>
                  <td>{contact("email")}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>v{r.number}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setDetail(r)}
                    >
                      View <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.rows.length && (
          <div className="empty-state">
            <MessageSquare size={35} />
            <h3>The conversation starts here.</h3>
            <p>
              Publish your form and share its link. Answers will appear here.
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <button
          className="btn secondary"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="btn secondary"
          disabled={(page + 1) * 50 >= data.total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      {detail && (
        <div className="modal-backdrop">
          <div className="modal">
            <button
              className="icon-button close"
              aria-label="Close response"
              onClick={() => setDetail(undefined)}
            >
              <X />
            </button>
            <div className="eyebrow">RESPONSE · VERSION {detail.number}</div>
            <h2>A new connection.</h2>
            {detail.definition.questions.map((q: any) => (
              <div className="answer-detail" key={q.id}>
                <small>{q.label}</small>
                <strong>{answerLabel(q, detail.answers[q.id])}</strong>
              </div>
            ))}
            <button
              className="text-button danger"
              onClick={async () => {
                if (confirm("Permanently delete this response?"))
                  try {
                    await api("/owner/submissions/" + detail.id, "DELETE");
                    setDetail(undefined);
                    load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
              }}
            >
              <Trash2 size={15} />
              Delete response
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
