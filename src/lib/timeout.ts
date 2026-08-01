/**
 * Race a promise against a timeout so a slow/unreachable backend (e.g. a
 * paused or deleted Supabase project) can never hang a request. If the
 * timeout fires first, the returned promise rejects with a TimeoutError —
 * callers wrap this in their existing try/catch so public pages still render
 * and auth forms surface a friendly error instead of freezing.
 */
export class TimeoutError extends Error {
  constructor(message = "Operation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms = 8000,
  label = "operation"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
