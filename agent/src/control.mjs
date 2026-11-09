import { execFile } from "node:child_process";
import { platform } from "node:os";

/** Play / pause the player that is currently active. Returns when the command has run. */
export function togglePlayPause() {
  const [file, args] =
    platform() === "darwin" ? ["media-control", ["toggle-play-pause"]] : platform() === "linux" ? ["playerctl", ["play-pause"]] : [null, []];
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("not supported on this system"));
    execFile(file, args, { timeout: 4000, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` } }, (err) => (err ? reject(err) : resolve()));
  });
}
