/**
 * Holds the latest data of every source and a revision counter.
 * The bar polls with the revision it already has; an unchanged revision gets a tiny answer.
 */
export class Hub {
  #parts = new Map();
  #alerts = [];
  #seq = Date.now();
  rev = 1;
  #waiters = new Set();

  #bump() {
    this.rev += 1;
    const waiting = [...this.#waiters];
    this.#waiters.clear();
    waiting.forEach((wake) => wake());
  }

  /** Resolves when the revision is no longer `since`, or after `ms`. This is what lets the bar hear of a change at once. */
  waitForChange(since, ms) {
    if (this.rev !== since || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.#waiters.delete(wake);
        resolve();
      }, ms);
      this.#waiters.add(wake);
    });
  }

  /** Stores a part; bumps the revision only when its content changed. */
  set(name, value) {
    const next = JSON.stringify(value);
    if (this.#parts.get(name)?.json === next) return false;
    this.#parts.set(name, { json: next, value });
    this.#bump();
    return true;
  }

  /** Queues a one-off alert for the bar. */
  alert(kind, text, now = Date.now()) {
    this.#seq += 1;
    this.#alerts.push({ id: this.#seq, kind, text: String(text).slice(0, 120), at: now });
    this.#alerts = this.#alerts.slice(-5);
    this.#bump();
  }

  /** Full snapshot for the requested parts. */
  snapshot(wanted, now = Date.now()) {
    const out = { rev: this.rev, now: Math.floor(now / 1000) };
    for (const name of wanted) {
      const part = this.#parts.get(name);
      if (part) out[name] = part.value;
    }
    out.alerts = this.#alerts.filter((a) => now - a.at < 120_000);
    return out;
  }
}
