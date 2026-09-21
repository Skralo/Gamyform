export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new ApiError(
      data.error ?? "Could not connect. Please try again.",
      r.status,
    );
  return data;
}
export function navigate(path: string) {
  const event = new Event("gamyform:navigate", { cancelable: true });
  if (!dispatchEvent(event)) return;
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}
