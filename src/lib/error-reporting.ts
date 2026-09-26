type ErrorReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

/**
 * Minimal client-side error reporter used by the React error boundary in
 * `__root.tsx`. Logs to the console; wire it up to a real monitoring
 * service (Sentry, PostHog, your own backend, etc.) by replacing the body
 * of this function.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = { mechanism: "react_error_boundary", handled: false, severity: "error" },
) {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[error-reporting]", message, {
    stack,
    route: window.location.pathname,
    ...context,
    ...options,
  });
}
