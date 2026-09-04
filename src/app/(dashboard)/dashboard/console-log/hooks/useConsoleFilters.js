"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// v2: `showSystem` flipped to false, so existing viewers adopt the API-calls-only
// default instead of inheriting a stored `true` from v1.
const STORAGE_KEY = "9router.console.prefs.v2";

export const DEFAULT_PREFS = {
  query: "",
  severity: "debug",
  providers: [],
  models: [],
  statuses: [],
  follow: true,
  view: "structured",
  // API calls only by default. Everything the gateway prints that isn't part of a
  // request — [DB], [RTK], startup chatter, debug lines — is one toggle away but stays
  // out of the list, because the reason to open this page is to watch requests.
  showSystem: false,
  density: "comfortable",
};

/**
 * Console filter + view preferences, persisted to localStorage.
 *
 * localStorage is an external store, so prefs live outside React and are read through
 * useSyncExternalStore. That keeps the server's markup on DEFAULT_PREFS while the client
 * adopts stored values without a hydration mismatch — and without copying the store into
 * state in an effect, which would cost an extra render on every mount.
 */

let snapshot = DEFAULT_PREFS;
let readStorage = true;
const listeners = new Set();

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Called during render, so it must be cheap and return a stable reference. localStorage
// is touched exactly once per process; every later call returns the cached snapshot.
function getSnapshot() {
  if (readStorage && typeof window !== "undefined") {
    readStorage = false;
    const stored = readStored();
    if (stored) snapshot = { ...DEFAULT_PREFS, ...stored };
  }
  return snapshot;
}

function getServerSnapshot() {
  return DEFAULT_PREFS;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function commit(next) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota — preferences simply don't persist.
  }
  for (const listener of listeners) listener();
}

export function useConsoleFilters() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback((patch) => {
    const current = getSnapshot();
    commit({ ...current, ...(typeof patch === "function" ? patch(current) : patch) });
  }, []);

  const toggleFacet = useCallback((key, value) => {
    const current = getSnapshot();
    const list = current[key] || [];
    commit({
      ...current,
      [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    });
  }, []);

  const resetFilters = useCallback(() => {
    commit({
      ...getSnapshot(),
      query: DEFAULT_PREFS.query,
      severity: DEFAULT_PREFS.severity,
      showSystem: DEFAULT_PREFS.showSystem,
      providers: [],
      models: [],
      statuses: [],
    });
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (prefs.query.trim()) n++;
    if (prefs.severity !== DEFAULT_PREFS.severity) n++;
    if (prefs.showSystem !== DEFAULT_PREFS.showSystem) n++;
    n += prefs.providers.length + prefs.models.length + prefs.statuses.length;
    return n;
  }, [prefs]);

  return { prefs, set, toggleFacet, resetFilters, activeFilterCount };
}
