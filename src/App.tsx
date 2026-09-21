import { useState, useEffect, lazy, Suspense } from "react";
import { api } from "./api";
import { Login, Workspace } from "./admin/Workspace";
const Player = lazy(() => import("./player/Player"));
export default function App() {
  const [path, setPath] = useState(location.pathname),
    [status, setStatus] = useState<any>(),
    [error, setError] = useState("");
  const check = () =>
    api("/owner/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  useEffect(() => {
    check();
    const h = () => setPath(location.pathname);
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  if (
    path === "/demo" ||
    path.startsWith("/f/") ||
    path.startsWith("/preview/")
  )
    return (
      <Suspense fallback={<div className="loading-page">Loading…</div>}>
        <Player key={path} path={path} />
      </Suspense>
    );
  if (!status)
    return <div className="loading-page">{error || "Opening Gamyform…"}</div>;
  return status.authenticated ? (
    <Workspace
      path={path}
      aiConfigured={status.aiConfigured}
      onLogout={check}
    />
  ) : (
    <Login configured={status.configured} onLogin={check} />
  );
}
