import { run } from "@core/engine";
import { claude } from "@core/screens/claude";
import manifest from "./appmeta/manifest.json";

/** One screen as an app of its own: only this part of the agent's data is asked for, and only this code is on the bar. */
function main(): void {
  run(manifest.id, [claude]);
}

main();
