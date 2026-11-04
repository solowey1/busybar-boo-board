# Busybar status

JS-приложение для BUSY Bar плюс агент на Mac. Колесо переключает экраны; какие экраны включены, выбирается в настройках приложения.

| Экран | Что показывает |
|---|---|
| Музыка | обложка 16×16 (углы прозрачные), трек и исполнитель бегущей строкой, линия прогресса; бар сам двигает прогресс |
| Claude | слева маскот (по настройке), в первой строке токены 5-часового окна, их стоимость по ценам API и время до сброса; во второй токены за день (D) и неделю (W); внизу линия «сколько окна прошло» (всё из логов Claude Code) |
| Время работы | «Вчера» и «Сегодня» с временем справа; «Сегодня» зелёным, пока Mac в работе, и жёлтым на паузе; с целью на день — линия прогресса. OK: во сколько начал и сколько подряд |
| Календарь | ближайшая встреча и отсчёт; за N минут до начала всплывает поверх любого экрана. OK: следующая встреча |
| Серверы | доступность адресов из `config.json`; красным, если кто-то не отвечает. OK: по одному серверу |

**Маскот Claude** работает, пока Claude Code пишет сообщения (последние 90 секунд), танцует после «Claude закончил», моргает и поглядывает по сторонам в простое и спит с «z», если Claude молчит больше 10 минут. С маскотом текст на экране темнее фирменного цвета, без него — фирменного.

**Стоимость** считается по ценам API из `mac-agent/src/sources/claude.mjs` (`PRICES`): токены ввода и вывода, чтение кеша и запись в кеш (×1,25 от ввода). Это то, что стоило бы то же самое по API; к лимитам подписки отношения не имеет. Неизвестную модель агент считает по ценам Sonnet.

Колесо переключает экраны, OK листает подвиды экрана, Back выходит. Управления музыкой нет.

Настройки: какие экраны включены; обложка и её непрозрачность; маскот Claude; автолистание экранов (и пауза после ручного переключения); «прятать пустые экраны» (нет музыки, нет окна Claude, нет встреч); звук; за сколько минут показывать встречу; напоминание после N часов работы; напоминание о перерыве каждые N минут непрерывной работы.

Всплывающие уведомления: Claude закончил или ждёт ответа, сервер упал или поднялся, встреча скоро (за N минут, за минуту и в момент начала), цель по часам работы, пора размяться.

## Как это устроено

```
Mac: mac-agent (Node 24)  <--- HTTP, раз в 3 с, только если что-то изменилось --->  бар: JS-приложение
  media-control, логи Claude, простой HID, EventKit, ping серверов
```

Приложение на баре не принимает входящих соединений и не может писать в хранилище (на прошивке 1.3.1 `storage` для приложений отвечает 403), поэтому оно само опрашивает агента. Агент отдаёт номер ревизии: пока ничего не изменилось, ответ крошечный. Прогресс трека, время работы и отсчёты бар считает сам; бегущую строку и `countdown` рисует прошивка.

## Установка

Нужен Node 24 (`nvm use`).

```sh
# 1. агент на Mac
cd mac-agent
npm test
node src/index.mjs                 # первый запуск создаёт ~/.config/busybar-status/config.json с токеном
launchd/install.sh                 # автозапуск при входе (uninstall — убрать)

# 2. приложение на бар (адрес и пароль HTTP API по Wi-Fi)
cd ..
npm run build
npm run app:install -- --addr <ip бара> --password <пароль>
npm run app:run     -- --addr <ip бара> --password <пароль>
```

В настройках приложения (веб-интерфейс бара, Apps) укажите адрес Mac, порт (8787) и токен из `~/.config/busybar-status/config.json`. Адрес Mac лучше закрепить за ним в роутере.

Агент слушает локальную сеть и отвечает только с верным токеном (`X-Token` или `?t=`).

### Календарь

Доступ к календарю нужно выдать один раз: запустите в Terminal `~/.cache/busybar-status/events 24` (бинарник соберётся при первом старте агента) и нажмите «Разрешить».

### Уведомления от Claude Code

`mac-agent/bin/notify.mjs` отправляет уведомление на бар и читает токен из конфига. Хуки в `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "node /ПУТЬ/mac-agent/bin/notify.mjs claude_done" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node /ПУТЬ/mac-agent/bin/notify.mjs claude_wait" }] }]
  }
}
```

Уведомление можно отправить и вручную: `node bin/notify.mjs info "Текст"`.

### Конфиг агента

`~/.config/busybar-status/config.json`: `port`, `token`, `servers` (`[{ "name", "url" }]`), `calendarExclude` (названия календарей, которые не показывать).

## Разработка приложения

(Ниже справка из шаблона BUSY.)

## Getting started

```sh
npm install
npm run build         # build the app into dist/app.solowey.busybar-status.tgz
npm run app:install   # install it on the BUSY Bar connected over USB
npm run app:run       # launch the installed app
```

The app's id is `app.solowey.busybar-status`, set in `src/appmeta/manifest.json`. An id is `<namespace>.<app>`, at most 32 characters, made of Latin letters, digits, underscores, dashes, and dots, and not starting with a dot. If yours still says `app.example`, change it to your own namespace before publishing.

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
| `npm run build` | empties `dist/` and builds the package into `dist/app.solowey.busybar-status.tgz` |
| `npm run build -- --emit dir` | leaves the `app.solowey.busybar-status/` folder instead of the `.tgz` |
| `npm run build -- --emit both` | leaves the folder and the `.tgz` |
| `npm run build -- --out <path>` | builds into `<path>` instead, replacing only this app's package there |
| `npm run build -- --tgz-name <name>` | names the `.tgz`, e.g. `"{id}-{version}.tgz"` |
| `npm run build -- --no-minify` | readable output, for debugging |
| `npm run build -- --bundle` | inlines every module into one `main.js` |
| `npm run build -- --addr <host>` | sets the BUSY Bar address the app connects to, `localhost` by default |
| `npm run typecheck` | type-checks the app |
| `npm run app:install` | installs `dist/app.solowey.busybar-status.tgz` on the BUSY Bar; build it first with `npm run build` |
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
└── app.solowey.busybar-status/
    ├── appmeta/manifest.json
    ├── scripts/main.js
    └── images/ animations/ sounds/ resources/
```

By default the build packs that folder into `dist/app.solowey.busybar-status.tgz`, with the folder itself at the root of the archive, and removes the folder; `--emit dir` keeps only the folder, `--emit both` keeps both. `--tgz-name` gives the archive another name; `{id}` and `{version}` in it are replaced with the manifest values.

## Releasing

Pushing a git tag matching the manifest `version` (e.g. `0.1.0`) builds the app and attaches `app.solowey.busybar-status-<version>.tgz` to a GitHub release. The release notes open with the app's name, id, version and API version. The release fails when the tag differs from the manifest `version`.

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

## Settings

To give the app a settings screen, add `src/appmeta/settings.json` describing the fields, then read the stored values:

```ts
import { loadValues } from "@shared/settings";

const values = await loadValues();
```

`loadValues()` returns `null` when nothing is stored yet — use the defaults.
