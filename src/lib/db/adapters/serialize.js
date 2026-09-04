// Statement serializer shared by the SQLite adapters.
//
// The adapter contract became async when Postgres support landed (no
// synchronous pg client exists). That introduced a hazard the old synchronous
// contract could not have: a `transaction(fn)` callback now yields at every
// `await`, so a statement from a *different* concurrent request could land
// between two statements of an open transaction — inside its SAVEPOINT, and
// therefore rolled back with it.
//
// This restores the previous isolation exactly: one unit of work at a time,
// FIFO. Statements issued from inside a held turn run immediately instead of
// queueing (queueing them would deadlock, since the turn holder is what they
// are waiting on). AsyncLocalStorage is what distinguishes "inside the turn"
// from "some other request that happens to overlap it".
import { AsyncLocalStorage } from "node:async_hooks";

const noop = () => {};

export function createSerializer() {
  const als = new AsyncLocalStorage();
  let tail = Promise.resolve();

  return {
    // Run fn as the sole unit of work. Re-entrant.
    exclusive(fn) {
      if (als.getStore()) return fn();
      const result = tail.then(() => als.run({ held: true }, fn));
      tail = result.then(noop, noop);
      return result;
    },
    // True when the caller is already running inside an exclusive turn.
    held() {
      return !!als.getStore();
    },
  };
}
