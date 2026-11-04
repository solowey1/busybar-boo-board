import { run } from "@core/engine";
import { calendar } from "@core/screens/calendar";
import { claude } from "@core/screens/claude";
import { music } from "@core/screens/music";
import { servers } from "@core/screens/servers";
import { work } from "@core/screens/work";
import manifest from "./appmeta/manifest.json";

/** All the screens in one app: the wheel goes round them, in the order of the settings page. */
function main(): void {
  run(manifest.id, [music, claude, work, calendar, servers]);
}

main();
