import { loadConfig } from "./config.mjs";
import { Hub } from "./hub.mjs";
import { createApi } from "./server.mjs";
import { startMusic } from "./sources/music.mjs";
import { startClaude } from "./sources/claude.mjs";
import { startWork } from "./sources/work.mjs";
import { startCalendar } from "./sources/calendar.mjs";
import { startServers } from "./sources/servers.mjs";

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
const config = loadConfig();
const hub = new Hub();

const stops = [
  startMusic({ hub, log }),
  startClaude({ hub, log }),
  startWork({ hub, log }),
  startCalendar({ hub, log, exclude: config.calendarExclude }),
  startServers({ hub, log, servers: config.servers }),
];

const server = createApi({ hub, token: config.token, log });
server.listen(config.port, config.host, () => log(`busybar-status agent on ${config.host}:${config.port}`));

const shutdown = () => {
  for (const stop of stops) stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
