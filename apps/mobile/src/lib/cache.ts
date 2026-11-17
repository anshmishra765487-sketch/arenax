import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "arenax:cache:";

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // cache failures are non-fatal
  }
}

/**
 * Offline-friendly fetch: returns cached data immediately and refreshes in the
 * background. Screens call this so a 2G/offline player still sees tournaments.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T, source: "cache" | "network") => void,
): Promise<void> {
  const cached = await readCache<T>(key);
  if (cached) onData(cached, "cache");

  try {
    const fresh = await fetcher();
    await writeCache(key, fresh);
    onData(fresh, "network");
  } catch (error) {
    if (!cached) throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Offline upload queue (screenshot evidence)                                 */
/* -------------------------------------------------------------------------- */

export interface QueuedUpload {
  id: string;
  bucket: "evidence" | "clips";
  path: string;
  uri: string;
  contentType: string;
  createdAt: string;
}

const OUTBOX_KEY = "arenax:outbox";

export async function getOutbox(): Promise<QueuedUpload[]> {
  return (await readCache<QueuedUpload[]>(OUTBOX_KEY)) ?? [];
}

export async function enqueueUpload(item: Omit<QueuedUpload, "id" | "createdAt">): Promise<void> {
  const outbox = await getOutbox();
  outbox.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  await writeCache(OUTBOX_KEY, outbox);
}

/**
 * Flushes queued uploads. Pass an uploader from the calling screen (so the
 * storage client stays in one place) and a callback for each success.
 */
export async function flushOutbox(
  uploader: (item: QueuedUpload) => Promise<{ error?: string }>,
  onUploaded?: (item: QueuedUpload) => void,
): Promise<number> {
  const outbox = await getOutbox();
  if (outbox.length === 0) return 0;

  const remaining: QueuedUpload[] = [];
  let flushed = 0;

  for (const item of outbox) {
    const result = await uploader(item);
    if (result.error) {
      remaining.push(item);
    } else {
      flushed += 1;
      onUploaded?.(item);
    }
  }

  await writeCache(OUTBOX_KEY, remaining);
  return flushed;
}
