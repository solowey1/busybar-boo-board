import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Publishes a name on the local network (Bonjour), so the settings page opens at http://NAME.local:PORT/ui.
 * Works on macOS without any rights. Returns a function that withdraws the name.
 */
export function startAlias({ name, port, address, log }) {
  if (!name || !address) return () => {};
  if (platform() !== "darwin") {
    log(`alias: ${name}.local is only published on macOS`);
    return () => {};
  }
  const child = spawn("/usr/bin/dns-sd", ["-P", "Boo Board", "_http._tcp", "local", String(port), `${name}.local`, address, "path=/ui"], { stdio: "ignore" });
  child.on("error", (err) => log(`alias: ${err.message}`));
  return () => child.kill();
}
