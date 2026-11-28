export function readStorage(scope: 'local' | 'session', key: string) {
  try {
    return (scope === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch { return null; }
}

export function writeStorage(scope: 'local' | 'session', key: string, value: string | null) {
  try {
    const storage = scope === 'local' ? localStorage : sessionStorage;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch { /* The game is still playable with browser storage disabled. */ }
}
