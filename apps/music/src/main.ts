import { run } from "@core/engine";
import { music } from "@core/screens/music";
import manifest from "./appmeta/manifest.json";

/** One screen as an app of its own: only this part of the agent's data is asked for, and only this code is on the bar. */
function main(): void {
  run(manifest.id, [music]);
}

main();
