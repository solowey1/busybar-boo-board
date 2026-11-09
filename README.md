# Boo Board

[Русская версия](README.ru.md)

A status display for the [BUSY Bar](https://busy.app) (a 72×16 LED strip with a wheel). It shows what is going on on your computer: the track that is playing, what your AI tools are doing, how long you have worked, your next meeting and whether your servers are up. The wheel switches screens, **OK** steps through a screen's pages, the big central **Start / Pause** button does one more thing on three screens (below).

It has two parts: a JavaScript app that runs **on the bar**, and an agent that runs **on your computer** (Node 24) and feeds it. On a Mac the agent comes with a menu-bar app and a settings page in the browser.

| Screen | What it shows | OK / Start |
|---|---|---|
| Music | cover (16×16, rounded), title and artist (long ones scroll), a progress line the bar moves by itself, an optional play/pause icon | Start: optionally play / pause |
| Agents | tokens and API-price cost of the current 5-hour Claude window, time to reset, tokens today (`D`) and this week (`W`), a line for how much of the window has passed, and a mascot (a rainbow ghost, Claude's own, a blue block or a cat) that works the moment any agent works, dances when an AI is done, blinks and sleeps. Several agents running (Claude, Codex, Gemini, Aider, …)? | OK: next agent, then the mascot |
| Work time | by default the activity squares of the last five weeks, like GitHub's (a row a week, today's cell has a white top), with the week and month totals; or yesterday and today (green while you work, yellow on a pause) | OK: the next view (squares, yesterday and today, since when / streak) |
| Calendar | three views: **off** (only the next meeting with a countdown), **3 weeks** (a row a week, Monday first, big squares, the days with meetings red, today in a white frame) and **month** (five weeks of small squares, like the work screen's); the date and the next meeting stand beside a grid. The setting says which one comes first; it also pops up N minutes before a meeting on any screen | OK: the next view. Start: the next meeting |
| Servers | one rounded tile per server with its icon (green = up, grey = not answering); the more servers, the smaller the tiles: the icon gives way to the first letter, then to the colour alone. Or a list, or a table of two columns (more servers fit; a name that is too long scrolls) | OK: the view (icons, list, table). Start: on icons, the card of one server at a time (icon, name and address, state and for how long; the address and the time are semi-transparent); in the list and the table, the rows move up one at a time in four quick steps |

**The buttons follow one rule:** the wheel changes the **screen**, **OK** changes the **state** of the screen (a view, the next agent, the mascot), and **Start / Play / Pause** is for the screen's **extra function** (music: play / pause, servers: the card of each server on the icons view, the rows moving up in the list and the table, the calendar: the next meeting).

Every screen has an accent colour you can change, and its own say on how its news is told (a sound, the LED, the LED's colour). Reminders: a meeting is near, you worked for N hours, time for a break, a server went down, an AI finished.

## Quick start (macOS)

You need macOS 13+, Node 24 (`nvm use` reads `.nvmrc`), the Xcode command line tools (`xcode-select --install`, for `swiftc`), [`media-control`](https://github.com/ungive/media-control) for the music screen (`brew install media-control`), and a BUSY Bar on the same Wi-Fi.

```sh
git clone git@github.com:solowey1/busybar-boo-board.git && cd busybar-boo-board
nvm use && npm ci
npm run build                                   # the apps for the bar -> apps/*/dist/*.tgz
npm run app:install -- --addr <bar ip> --password <bar password>   # the app with all the screens
npm run app:run     -- --addr <bar ip> --password <bar password>
(cd agent && ./tray/install.sh)             # builds and starts the menu-bar app and the agent
```

Then click the icon in the menu bar → **Настроить… / Settings** (the page is `http://127.0.0.1:8787/ui`). On the **General** tab enter the bar's address and password, press **Bind** (it writes the computer's IP and port into the app on the bar) and **Save**. macOS asks once whether the app may read your calendar.

Prebuilt packages for macOS, Windows and Linux are attached to every [release](https://github.com/solowey1/busybar-boo-board/releases) (see [Packages](#packages)). To remove the menu-bar app: `agent/tray/install.sh uninstall`.

## Settings

**On the bar** (Settings → the app): the language (Русский / English), the computer's IP and port, and an on/off switch for each of the five screens (Music, Agents, Servers, Calendar, Work time). That is all; the bar's own settings page is flat and small, and its labels are in English only (the firmware takes one text per label and cannot follow the app's language; the settings page on the computer is fully translated). There is no token on the bar: the agent knows the bar by its address (the one set on the General tab) and lets it read the state and press the big button, nothing else; everything else needs the token, which is only for the browser and the hooks.

**In the browser** (`/ui`, from the menu-bar icon): everything else, one tab per screen. Changes are saved on the computer and reach the bar within seconds.

The page of every screen opens with the same block, **Screen and alerts**: **show the screen** (the same switch as on the bar, available when the app with all the screens is installed), the **accent colour**, the **alert sound** on / off, the **alert LED** on / off and the **LED's colour** (the accent colour by default). The music screen has no news, so it has no sound or LED. All the other settings of the screen follow in the block **Other settings**.

| Tab | Other settings of the tab |
|---|---|
| General | the bar's address and password, **Bind**; **language of the whole app** (the bar, this page, the menu-bar menu, notifications; applied at once; the first start takes the system's language, Russian or else English); **the order of the screens** (the wheel and the tabs follow it); start at login; show the app in the Dock / menu bar / both / neither; a `.local` name for this page (`boo` by default, so `http://boo.local`; not `busybar`: that is the bar's own name); the look of the menu-bar icon |
| Music | cover and its opacity; play/pause icon (green, yellow on pause); the big **Start / Pause** button plays / pauses; on pause the accent colour is half transparent |
| Agents | mascot: ghost, Claude, a **block** (a blue rounded rectangle with black eyes, no arms or legs), a **cat** or none (in the **Mascots** panel a click on a mascot chooses it: it gets a frame in the accent colour and jumps for joy for 2 seconds); **the mascot page** (the last page after the agents when you press OK; there is no separate screen for it on the wheel); the **default agent** (when Claude is the mascot, other AIs get the ghost when they report); **cover other screens when an AI finishes** (off by default: then only the sound and the LED tell, and the news waits on the AI screen) |
| Work time | the view to start with (heat map or yesterday and today); reminder after N hours; break reminder every N minutes; how many days to keep (30); idle time that counts as a pause; the activity squares |
| Calendar | **the grid** (off, 3 weeks, month: the view to start with); minutes before a meeting to pop up; calendars to ignore (the accent colour is red by default) |
| Servers | the list (name, address, icon, colours; reorder with the arrows); which view to start with (icons, list, table); colours for not answering (the accent colour is the colour of a server that is up) |
| App | auto-rotation, hide empty screens, how long the screen's name stays after the wheel (700 ms, 0 = off); the **About** block: the version, the link to GitHub and the author (the sound is set on each screen's tab) |

The settings page works on a phone too (open the same address on the same network, with the token link from the General tab): the tabs become a strip on top and the rows stack.

If you choose to show the app **nowhere**, the settings stay reachable at their address in a browser (`http://127.0.0.1:8787/ui`, or `http://<name>.local/ui` if you set a name; while a name is set the page is also served on port 80, so no `:8787` is needed). A browser that has never seen the page asks for the token once (the General tab shows a ready link with it). The name is published on the local network by macOS (Bonjour); `busybar` is refused because `busybar.local` is the bar itself.

## The menu-bar app (macOS)

A click on the icon (a rainbow ghost; other looks are on the settings page) opens a menu: the agent's state and port, the bar's address, calendar access, **Settings…**, **Restart** and **Disable** (stops the agent too). It starts the agent as its own child and brings it back if it dies. Start-at-login is a switch on the settings page, handled by macOS as a login item (System Settings → General → Login Items); nothing is installed unless you switch it on.

The calendar is read by the app itself, so the permission belongs to it, not to the terminal you started something from. After you rebuild the app macOS may ask again.

## Notifications from AI tools

A hook tells the bar that an AI is done. For Claude Code, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "node /PATH/TO/agent/bin/notify.mjs claude_done" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node /PATH/TO/agent/bin/notify.mjs claude_wait" }] }]
  }
}
```

The bar learns that an agent works in about a second without any hook: the agent on the computer watches the agents' processes (CPU of the process and of what it started), their session logs and the hooks. A hook makes it exact: add `UserPromptSubmit` → `node /PATH/TO/agent/bin/notify.mjs claude_start` for the start (no pop-up), and the `Stop` hook above ends it at once. Several agents running at once (Claude, Codex, Gemini, Aider, OpenCode, Cursor, Goose) are listed on the settings page; **OK** on the AI screen switches between them and the settings choose which one comes first. Usage figures (tokens, cost) exist for Claude only; the others show their state. Any other tool (Codex, Gemini, a script) can use `node agent/bin/notify.mjs ai_done "Codex: project"` and `ai_wait`. Usage figures (tokens, cost) are read from Claude Code's logs in `~/.claude/projects`. The cost is what the same tokens would cost at API prices (`PRICES` in `agent/src/sources/claude.mjs`), not your subscription's.

## Work time

The agent samples the keyboard and mouse idle time every 15 seconds and adds the active ones up per day in `~/.local/state/busybar-status/work.json` (the last N days, 30 by default). It counts only while it runs and the computer is awake, so start it at login if you want whole days.

## Apps on the bar: all the screens, or only the ones you need

The repository is a monorepo that builds several apps for the bar from the same code:

| App | id | What it is |
|---|---|---|
| **Boo Board** | `app.solowey.boo-board` | all the screens in one: the wheel goes round them, in the order you set, and a meeting, a server going down or an AI finishing pops up over any screen |
| Boo: Music | `app.solowey.boo-music` | the music screen alone |
| Boo: Agents | `app.solowey.boo-agents` | the agents screen (usage, the agents, the mascot page) alone |
| Boo: Servers | `app.solowey.boo-servers` | the servers screen alone |
| Boo: Calendar | `app.solowey.boo-calendar` | the calendar screen alone |
| Boo: Work time | `app.solowey.boo-work` | the work-time screen alone |

Install the one with all the screens, or any of the single screens (`npm run app:install -w apps/music -- --addr <bar ip> --password <password>`, or the `.tgz` from a release with `busy-cli app install`). The bar runs one app at a time, so single screens are opened from the bar's apps menu and have no wheel between them, and each shows only the news of its own screen; in return each is small (its code only) and asks the agent only for its own data. The settings page on the computer knows which screens are on the bar: the tab of a screen that is not there shows how to install it instead of its settings. The common settings (language, the computer's IP and port) are written to every app of ours on the bar when you save, and to a new one once it appears.

A measurement on the bar (firmware 1.3.1): the app with all the screens ran through every screen and state with a 128 KiB heap, and failed to start with 96 KiB; the manifests ask for 192 KiB (the combined app) and 128 KiB (each screen), the rest of the memory stays with the firmware. A stress test followed on those sizes: the combined app took 592 random key presses in 4 minutes (the agent switching between working and idle meanwhile, seven servers in the table), and each single-screen app 100 seconds of the same, with no error and no restart; 256 KiB is not needed. A bigger heap is not free: it is taken from the memory the firmware keeps for its own services (its web server, which answers the settings page and the agent's calls, among them), and a bar short of it answers slowly or restarts. The "Loading" the bar shows for a moment is not about memory: the firmware shows it whenever an app has nothing on the display, and the app used to clear the old screen before drawing the new one (and cleared everything once a minute); now the elements that go are replaced in the same request that draws the new ones, and the sampling of the display (3300 frames over 140 s with key presses) found no "Loading" frame, against 40 before.

## Packages

Each release has `boo-board-<version>-<system>` archives for `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` and `win-x64`. Every one carries its own Node and, in an `apps` folder, the `.tgz` of every app for the bar.

| System | What you get | Not available |
|---|---|---|
| macOS | `Boo Board.app` with the menu-bar icon (ad-hoc signed, not notarised: open it with right click → Open the first time) | – |
| Windows, Linux | the agent and `start.cmd` / `start.sh`, which start it and open the settings page | menu-bar app, now-playing, calendar; work time needs `xprintidle` or GNOME on Linux |

The packages are built by GitHub Actions (`.github/workflows/release.yml`), not by hand: pushing a version tag builds one on a runner of each system and attaches them to the release. To try the build without a tag, run the workflow from the Actions tab ("Run workflow"); the packages come as artifacts of the run. The Windows and Linux packages have not been run on those systems by the author. (`node agent/tools/package.mjs <system>` is what the workflow runs; macOS packages need a Mac.)

## How it works

```
computer: agent (Node 24) <--- HTTP every 3 s, a tiny answer if nothing changed ---> bar: JS app
  media-control, Claude Code logs, idle time, EventKit (via the menu-bar app), server pings
```

The app on the bar cannot accept connections and cannot write to storage on firmware 1.3.1, so it asks the agent. The agent keeps a revision number and holds each request for up to two seconds while nothing changes (long polling), so a change reaches the bar the moment it happens. The bar counts the playhead, work time and countdowns on its own clock; scrolling and `countdown` elements are drawn by the firmware. Only elements that changed are sent to the display. The settings of the screens travel in the same answer.

`~/.config/busybar-status/config.json` (private, edited from the settings page): port, token (for the browser and the hooks), the bar's address and password, servers, calendars to ignore, icon and Dock choice, `.local` name, login switch, and `settings` for the screens (see `agent/src/appsettings.mjs`).

## Development

```sh
npm run typecheck             # every app for the bar
npm run build                 # every app -> apps/*/dist/*.tgz
npm run versions              # all apps have the version of package.json
npm test                      # the agent: 30 tests
node agent/tools/icons.mjs appmeta apps/board/src/appmeta   # redraws the ghost icons of the app with all the screens
node agent/tools/icons.mjs modules apps                     # the icons of the single-screen apps: a picture and the screen's colour each
```

`packages/core/src/` is the code of the bar apps (TypeScript, strict, runs in the firmware's JerryScript, not Node: the engine, the screens, the texts) and `apps/<name>/` is one app each: a `main.ts` that names its screens, its `appmeta/` (manifest, settings, icons) and, for the agents screen, the pulse animation. Heaps are 192 KiB (all the screens) and 128 KiB (a single screen); screens keep their buffers only while they are on the display, and running out of heap stops the app and can restart the whole bar (it did during the measurement, below 112 KiB), so keep per-frame allocations small. `agent/` is the agent: `src/` sources, `ui/` the settings page, `tray/` the menu-bar app (Swift), `tools/` icons and packaging. The mascot page's wave is a native bar animation, `apps/{board,agents}/src/animations/pulse.anim`, written by `node agent/tools/anim.mjs pulse` (the `.anim` format, "bicycle1", is described in the [firmware's `anim_file_format.h`](https://github.com/busy-app/busybar-firmware/blob/dev/lib/anim_file/anim_file_format.h); the writer uses BGRA8888 raw frames, which the bar plays; BGR888 it did not). The firmware loops it by itself, so the app sends the element once. Server tile icons are 9×9 LED versions of [Lucide](https://lucide.dev) icons (ISC licence), made by `agent/tools/glyphs/raster.py` into `packages/core/src/glyphs.json` (one 81-character string per icon); the buttons on the settings page use Lucide icons too. Read `AGENTS.md` before changing the bar app.

## BUSY app template reference

(From the BUSY template this app started from.)

## Getting started

```sh
npm install
npm run build         # build the app into dist/app.solowey.boo-board.tgz
npm run app:install   # install it on the BUSY Bar connected over USB
npm run app:run       # launch the installed app
```

The app's id is `app.solowey.boo-board`, set in `src/appmeta/manifest.json`. An id is `<namespace>.<app>`, at most 32 characters, made of Latin letters, digits, underscores, dashes, and dots, and not starting with a dot. If yours still says `app.example`, change it to your own namespace before publishing.

## Layout

`src/` is the app — everything in it is yours to edit.

The entry point is `src/main.ts` (or `src/main.js`). The name is fixed: the build turns it into `scripts/main.js`, the file the BUSY Bar starts. Any imported modules are emitted as separate files alongside it in `scripts/`, unless `npm run build -- --bundle` inlines them.

`src/main.ts` is run from top to bottom, not imported: it starts the app by calling `main()` at the end and must not export anything. Imported modules can use standard exports.

```
my-app/
├── src/                          the app
│   ├── main.ts                   the entry point: function main(), called at the end
│   ├── appmeta/
│   │   ├── manifest.json         id, name, version, api_version
│   │   ├── settings.json         the settings screen — optional
│   │   ├── icon_front_8x8.png    front icon, 8×8 color — optional
│   │   └── icon_back_11x11.png   back icon, 11×11 grayscale — optional
│   ├── images/
│   ├── animations/
│   └── sounds/
├── shared/                       app-level helpers, imported as @shared/*
```

Both icons are optional; without them a default is used.

## Resources

Anything in `src/` that isn't a source file is copied into the package, sorted by what the BUSY Bar can read:

| Extension | Destination |
| --- | --- |
| `.png` `.image` | `images/` |
| `.anim` | `animations/` |
| `.snd` | `sounds/` |
| anything else | `resources/` |

A file in `src/images`, `src/animations` or `src/sounds` keeps its folder as long as the BUSY Bar reads its format.

`images/`, `animations/` and `sounds/` hold only those formats. An image, animation or sound in another format — `.jpg`, `.gif`, `.svg`, `.wav`, `.mp3` and the like — goes to `resources/`, and the build warns that the device cannot read it.

Everything the app draws goes through the layout helpers in `@busy-app/busy-lib`: build a tree out of `row` / `column` / `stack`, hand it to `render()`, and send the result with `device.DisplayDraw()`. The screen is 72×16 pixels.

## Input

`listen("input", handler)` delivers the device keys: `ok`, `start` and `back` with a `press` / `release` / `short` / `long` / `repeat` action, and `encoder` with a `delta` of `1` or `-1`. It returns an unbind function.

Use `short` as the default action for a button press: it fires once, after a normal press and release. `press` fires immediately on key down and is followed by `short`, so handling `press` as a tap can react twice. Use `long` and `repeat` for hold gestures.

## Commands

| Command | Description |
| --- | --- |
| `npm run build` | empties `dist/` and builds the package into `dist/app.solowey.boo-board.tgz` |
| `npm run build -- --emit dir` | leaves the `app.solowey.boo-board/` folder instead of the `.tgz` |
| `npm run build -- --emit both` | leaves the folder and the `.tgz` |
| `npm run build -- --out <path>` | builds into `<path>` instead, replacing only this app's package there |
| `npm run build -- --tgz-name <name>` | names the `.tgz`, e.g. `"{id}-{version}.tgz"` |
| `npm run build -- --no-minify` | readable output, for debugging |
| `npm run build -- --bundle` | inlines every module into one `main.js` |
| `npm run build -- --addr <host>` | sets the BUSY Bar address the app connects to, `localhost` by default |
| `npm run typecheck` | type-checks the app |
| `npm run app:install` | installs `dist/app.solowey.boo-board.tgz` on the BUSY Bar; build it first with `npm run build` |
| `npm run app:uninstall` | removes the app from the BUSY Bar, keeping its settings |
| `npm run app:run` | launches the installed app |
| `npm run app:stop` | quits the running app |

The four `app:` commands talk to the BUSY Bar connected over USB. For a device connected over Wi-Fi, pass `--addr <host>` with its network IP address or hostname, and `--password <password>` if password protection is enabled:

```sh
npm run app:install -- --addr <host>
npm run app:install -- --addr <host> --password <password>
```

## Build output

The package folder is named after the app id:

```
dist/
└── app.solowey.boo-board/
    ├── appmeta/manifest.json
    ├── scripts/main.js
    └── images/ animations/ sounds/ resources/
```

By default the build packs that folder into `dist/app.solowey.boo-board.tgz`, with the folder itself at the root of the archive, and removes the folder; `--emit dir` keeps only the folder, `--emit both` keeps both. `--tgz-name` gives the archive another name; `{id}` and `{version}` in it are replaced with the manifest values.

## Releasing

Pushing a git tag matching the manifest `version` (e.g. `0.1.0`) builds the app and attaches `app.solowey.boo-board-<version>.tgz` to a GitHub release, followed by the agent packages for macOS (arm64 and Intel), Windows and Linux (x64 and arm64) built on runners of those systems (see Packages above). The release notes open with the app's name, id, version and API version. The release fails when the tag differs from the manifest `version`.

## Manifest

`src/appmeta/manifest.json` carries the app's identity and a couple of knobs (see the [apps documentation](https://github.com/busy-app/busybar-firmware/blob/dev/documentation/JavaScript%20Applications.dox.md)):

| Field | Description |
| --- | --- |
| `format_version` | manifest format, `1` — required |
| `id` | up to 32 characters — required |
| `name` | display name — required |
| `version` | semver, e.g. `1.0.0` — required |
| `api_version` | minimum BUSY Bar HTTP API version the app needs, e.g. `27.12.0` — required |
| `description`, `author` | free form, default `""` |
| `heap_size_kib` | memory for the app heap, 1–512, default 128 |
| `debug` | when true, shown only in developer mode, default false |

Raise `heap_size_kib` if the app runs out of memory.

## Node version

The app builds on Node 24 — the version in `.nvmrc` and the range `engines` allows. Node 26 breaks the build and is excluded. With `fnm` or `nvm` installed, `fnm use` / `nvm use` picks the right one up from `.nvmrc`.

## Settings file

To give the app a settings screen, add `src/appmeta/settings.json` describing the fields, then read the stored values:

```ts
import { loadValues } from "@shared/settings";

const values = await loadValues();
```

`loadValues()` returns `null` when nothing is stored yet — use the defaults.
