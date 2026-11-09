import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { platform } from "node:os";
import { artworkToXpm } from "../artwork.mjs";

/** Applies one `media-control stream` message to the accumulated state. */
export function applyMessage(state, msg) {
  const next = msg.diff ? { ...state } : {};
  for (const [key, value] of Object.entries(msg.payload ?? {})) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** Turns the raw media-control state into what the bar needs (no artwork bytes here). */
export function toMusic(raw, now = Date.now()) {
  if (!raw || !raw.title) return { active: false };
  const rate = typeof raw.playbackRate === "number" ? raw.playbackRate : 1;
  const dur = typeof raw.durationMicros === "number" ? raw.durationMicros / 1e6 : 0;
  let pos = typeof raw.elapsedTimeMicros === "number" ? raw.elapsedTimeMicros / 1e6 : 0;
  if (raw.playing && typeof raw.timestampEpochMicros === "number") {
    pos += Math.max(0, (now - raw.timestampEpochMicros / 1000) / 1000) * rate;
  }
  if (dur > 0) pos = Math.min(pos, dur);
  return {
    active: true,
    playing: raw.playing === true,
    title: String(raw.title),
    artist: raw.artist ? String(raw.artist) : "",
    album: raw.album ? String(raw.album) : "",
    dur: Math.round(dur),
    pos: Math.round(pos * 10) / 10,
    app: raw.bundleIdentifier ?? "",
  };
}

/**
 * Follows `media-control stream` and publishes to the hub.
 * The hub is only touched when the track, play state or a seek changes - the bar moves the playhead itself.
 */
export function startMusic({ hub, log, bin = "media-control" }) {
  // The now-playing source is macOS-only (media-control); elsewhere the screen simply shows "no music".
  if (platform() !== "darwin") {
    hub.set("music", { active: false });
    return () => {};
  }
  let state = {};
  let published = null;
  // The cover is converted once per track, off the hot path; `art` is added to the music part when it is ready.
  let art = { key: "", xpm: null };
  let artJob = 0;
  let child;
  let stopped = false;

  const artKey = () => (typeof state.artworkData === "string" ? `${state.title}|${state.artist}|${state.artworkData.length}` : "");

  const updateArt = () => {
    const key = artKey();
    if (key === art.key) return;
    art = { key, xpm: null };
    if (!key) return;
    const job = ++artJob;
    artworkToXpm(state.artworkData)
      .then((xpm) => {
        if (job !== artJob || !xpm) return;
        art = { key, xpm };
        published = null;
        publish();
      })
      .catch((err) => log(`artwork: ${err.message}`));
  };

  const publish = () => {
    const now = Date.now();
    const music = toMusic(state, now);
    if (music.active) music.art = art.key === artKey() ? art.xpm : null;
    // Position is dropped from the comparison unless it jumped (seek, buffering).
    const key = (m) => JSON.stringify({ ...m, pos: 0 });
    let changed = published === null || key(published.music) !== key(music);
    if (!changed && music.active && music.playing) {
      const expected = published.music.pos + (now - published.at) / 1000;
      changed = Math.abs(expected - music.pos) > 1.5;
    } else if (!changed && music.active && !music.playing) {
      changed = Math.abs(published.music.pos - music.pos) > 0.5;
    }
    if (!changed) return;
    published = { music, at: now };
    // `at` is the computer time of the measurement; the bar re-bases on its own clock when it receives it.
    hub.set("music", music);
  };

  const run = () => {
    child = spawn(bin, ["stream", "--micros"], { stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", (err) => log(`media-control: ${err.message}`));
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (!msg || typeof msg !== "object") return;
        state = applyMessage(state, { diff: msg.diff === true, payload: msg.payload });
        updateArt();
        publish();
      } catch {
        /* junk line */
      }
    });
    child.on("exit", (code) => {
      if (stopped) return;
      log(`media-control exited (${code}), restarting in 3 s`);
      setTimeout(run, 3000);
    });
  };

  run();
  // A paused track keeps the same state, but the bar needs a fresh baseline now and then.
  const refresh = setInterval(() => {
    if (state.playing) {
      published = null;
      publish();
    }
  }, 60_000);

  return () => {
    stopped = true;
    clearInterval(refresh);
    child?.kill();
  };
}
