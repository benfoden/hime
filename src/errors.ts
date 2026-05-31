// Error classification for hime — no Chrome API imports.

export type ErrorKind = 'auth' | 'rate_limit' | 'credits' | 'network' | 'unknown';

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
  status?: number;
}

/**
 * Map any provider failure to a typed ClassifiedError.
 *
 * Classification order:
 *  1. AbortError / fetch TypeError → network
 *  2. HTTP status → auth (401/403), credits (402), rate_limit (429), unknown (other)
 *  3. No status, not network → unknown with error message
 */
export function classifyError(
  provider: string,
  err: unknown,
  response?: { status?: number; bodyMessage?: string },
): ClassifiedError {
  // 1. Network errors: AbortError (timeout) or TypeError (offline / failed to fetch)
  if (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError') ||
    err instanceof TypeError
  ) {
    return {
      kind: 'network',
      message: 'Network error — request timed out or offline',
    };
  }

  // 2. HTTP status-based classification
  const status = response?.status;
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        message: 'Invalid or unauthorized API key — check it in options',
        status,
      };
    }
    if (status === 402) {
      return {
        kind: 'credits',
        message: `Out of credits on ${provider} — add funds or switch provider`,
        status,
      };
    }
    if (status === 429) {
      return {
        kind: 'rate_limit',
        message: `Rate limited by ${provider} — wait and retry`,
        status,
      };
    }
    // Any other 4xx / 5xx (or edge status)
    return {
      kind: 'unknown',
      message: `${provider} error ${status}: ${response?.bodyMessage ?? 'unknown'}`,
      status,
    };
  }

  // 3. No status, not a network error
  return {
    kind: 'unknown',
    message: `${provider} error: ${err instanceof Error ? err.message : 'unknown'}`,
  };
}
