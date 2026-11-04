/**
 * Holds the latest data of every source and a revision counter.
 * The bar polls with the revision it already has; an unchanged revision gets a tiny answer.
 */
export class Hub {
  #parts = new Map();
  #alerts = [];
  #seq = Date.now();
  rev = 1;

  /** Stores a part; bumps the revision only when its content changed. */
  set(name, value) {
    const next = JSON.stringify(value);
    if (this.#parts.get(name)?.json === next) return false;
    this.#parts.set(name, { json: next, value });
    this.rev += 1;
    return true;
  }

  /** Queues a one-off alert for the bar. */
  alert(kind, text, now = Date.now()) {
    this.#seq += 1;
    this.#alerts.push({ id: this.#seq, kind, text: String(text).slice(0, 120), at: now });
    this.#alerts = this.#alerts.slice(-5);
    this.rev += 1;
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
