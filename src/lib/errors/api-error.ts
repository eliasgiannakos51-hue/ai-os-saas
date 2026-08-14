import { codeForStatus, isErrorCode, type ApiErrorPayload, type ErrorCode } from "./error-codes";

/**
 * A failed request, carrying the two things the UI needs and the old code
 * threw away: the STATUS and whether credits came back.
 *
 * Call sites used to do this:
 *
 *     const res = await fetch(...);
 *     const data = await res.json();
 *     if (!res.ok) setError(getErrorMessage(data?.error, t("uploadError")));
 *
 * `res.status` is right there and is discarded on the next line. That is
 * why the client could never translate anything: by the time the message
 * was chosen, the only thing left was the server's English sentence.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly creditsRefunded: boolean | undefined;

  constructor(status: number, payload: ApiErrorPayload | null) {
    // `message` stays the server's English prose on purpose: it is what
    // goes to the console and to error tracking, where English is correct
    // and a translated string would be actively worse to search for. The
    // USER never reads this — useErrorText builds their message from the
    // code below.
    super(payload?.error ?? `Request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = isErrorCode(payload?.code) ? payload.code : codeForStatus(status);
    this.creditsRefunded = payload?.creditsRefunded;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * fetch + parse + throw, so a caller's catch block gets a typed failure
 * instead of having to re-derive one from a Response it no longer has.
 *
 * A non-JSON body is not an error in itself — a 502 from a proxy is HTML —
 * so a parse failure yields a null payload and the status still decides the
 * message.
 */
export async function requestJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (cause) {
    // Status 0 is "the request never reached the server" — a dropped
    // connection, an offline device, a blocked request. codeForStatus maps
    // it to "offline", which is a different sentence from "the server
    // broke" and a different answer to "was I charged".
    throw new ApiError(0, { error: cause instanceof Error ? cause.message : "network error" });
  }

  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await res.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  if (!res.ok) throw new ApiError(res.status, payload);
  // Some routes answer 200 with `{ ok: false, error }`. Treat that as the
  // failure it is rather than letting it through as a success object the
  // caller has to re-check.
  if (payload && payload.ok === false) throw new ApiError(res.status, payload);
  return payload as T;
}
