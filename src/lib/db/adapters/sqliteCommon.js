// Shared async wrapper for the SQLite adapters.
//
// Every SQLite driver we support (better-sqlite3, bun:sqlite, node:sqlite,
// sql.js) is synchronous. The adapter contract is async because Postgres has
// no synchronous client — so the sync primitives get wrapped here once instead
// of four times, and every statement goes through one FIFO serializer.
//
// Why serialize when the driver is already synchronous: an async
// `transaction(fn)` yields at each `await` inside fn, so without a gate a
// statement from a different in-flight request could execute between two
// statements of an open transaction — inside its SAVEPOINT, and rolled back
// with it. Two overlapping transactions would also interleave their SAVEPOINTs
// and release them out of order. Serializing restores the isolation the old
// fully-synchronous contract had for free.
import { createSerializer } from "./serialize.js";

let spCounter = 0;

export function wrapSqlite({ driver, run, get, all, exec, checkpoint, close, raw }) {
  const ser = createSerializer();

  return {
    driver,
    dialect: "sqlite",
    run: (sql, params = []) => ser.exclusive(() => run(sql, params)),
    get: (sql, params = []) => ser.exclusive(() => get(sql, params)),
    all: (sql, params = []) => ser.exclusive(() => all(sql, params)),
    exec: (sql) => ser.exclusive(() => exec(sql)),
    transaction(fn) {
      return ser.exclusive(async () => {
        // SAVEPOINT rather than BEGIN so nested transaction() calls compose.
        const sp = `sp_${(spCounter = (spCounter + 1) % 1e9)}`;
        exec(`SAVEPOINT ${sp}`);
        try {
          const result = await fn();
          exec(`RELEASE ${sp}`);
          return result;
        } catch (e) {
          try { exec(`ROLLBACK TO ${sp}`); exec(`RELEASE ${sp}`); } catch {}
          throw e;
        }
      });
    },
    checkpoint: checkpoint || (() => {}),
    close,
    raw,
  };
}
