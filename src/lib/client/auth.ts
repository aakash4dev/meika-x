// Client helper: when an API call needs an account (HTTP 401), send the visitor to sign in and come back here.
export function needsLogin(res: Response): boolean {
  if (res.status !== 401) return false;
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
  return true;
}
