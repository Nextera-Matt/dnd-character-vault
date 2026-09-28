// One Node process serves the app, so open table listeners can live in memory.
// Each entry is an Express response held open as a Server-Sent Events stream.

const subscribers = new Map();

function subscribe(sessionId, res) {
  const key = String(sessionId);
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(res);
  return () => {
    set.delete(res);
    if (set.size === 0) subscribers.delete(key);
  };
}

function publish(sessionId, event) {
  const key = String(sessionId);
  const set = subscribers.get(key);
  if (!set || set.size === 0) return;
  const chunk = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of [...set]) {
    try {
      res.write(chunk);
    } catch (err) {
      console.error('Dropped a session listener after a write failure', {
        sessionId: key,
        message: err instanceof Error ? err.message : String(err),
      });
      set.delete(res);
    }
  }
  if (set.size === 0) subscribers.delete(key);
}

module.exports = { subscribe, publish };
