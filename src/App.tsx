import { useState, useEffect, lazy, Suspense } from "react";
import { api } from "./api";
import { Login, Workspace } from "./admin/Workspace";
const Runner = lazy(() => import("./game/Runner"));
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
      <Suspense
        fallback={<div className="loading-page">Opening your experience…</div>}
      >
        <Runner key={path} path={path} />
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
