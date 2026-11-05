/**
 * The settings of the app's screens. They live on the Mac (the bar's own settings page is flat and small),
 * the settings page edits them, and the agent hands them to the app on the bar with every state.
 *
 * Field types: boolean, integer (min, max, step), color ("#RRGGBB"), enum (options), string.
 * `local: true` means only the agent uses it, the bar does not need it.
 */
export const GROUPS = [
  {
    id: "music",
    label: "Музыка",
    fields: {
      artwork: { type: "boolean", label: "Обложка альбома", description: "16×16 слева от текста", default: true },
      artworkOpacity: { type: "integer", label: "Непрозрачность обложки, %", default: 100, min: 10, max: 100, step: 10 },
      stateIcon: { type: "boolean", label: "Значок play / пауза", description: "Маленький значок справа от исполнителя; на паузе жёлтый", default: false },
      startToggle: { type: "boolean", label: "Большая кнопка: пуск и пауза", description: "Центральная кнопка Start / Pause на экране музыки запускает или ставит на паузу", default: false },
      color: { type: "color", label: "Акцентный цвет", description: "На паузе тот же цвет, но полупрозрачный", default: "#FFFFFF" },
    },
  },
  {
    id: "ai",
    label: "Агенты",
    fields: {
      mascot: { type: "enum", label: "Маскот", description: "Работает, танцует, когда нейросеть закончила, спит, когда давно ничего нет. У других нейросетей собственного маскота нет, им достаётся привидение", default: "claude", options: [{ value: "claude", label: "Claude" }, { value: "ghost", label: "Привидение" }, { value: "none", label: "Без маскота" }] },
      mascotScreen: { type: "boolean", label: "Экран с маскотом по кнопке OK", description: "На экране агентов OK листает агентов, а последним показывает маскота: он радостно прыгает, пока агент работает, и вокруг расходится синяя затухающая волна", default: true },
      defaultAgent: { type: "enum", label: "Агент по умолчанию", description: "Какой агент показывать первым на экране AI. Если запущено несколько, кнопка OK переключает их", default: "auto", options: [{ value: "auto", label: "Тот, что работает" }, { value: "claude", label: "Claude" }, { value: "codex", label: "Codex" }, { value: "gemini", label: "Gemini" }, { value: "aider", label: "Aider" }, { value: "opencode", label: "OpenCode" }, { value: "cursor", label: "Cursor" }, { value: "goose", label: "Goose" }] },
      overlay: { type: "boolean", label: "Перекрывать другие экраны при завершении", description: "Выключено: о завершении сообщают звук и светодиод, а текст виден на экране AI", default: false },
      color: { type: "color", label: "Акцентный цвет", description: "С маскотом текст чуть светлее", default: "#D97757" },
    },
  },
  {
    id: "servers",
    label: "Серверы",
    fields: {
      view: { type: "enum", label: "Вид", description: "С какого вида начинать. Кнопка OK меняет вид; Play / Pause: на иконках листает серверы по одному, в списке и таблице сдвигает строки вниз", default: "tiles", options: [{ value: "tiles", label: "Иконки" }, { value: "list", label: "Список" }, { value: "table", label: "Таблица" }] },
      colorOk: { type: "color", label: "Цвет «в сети»", description: "Для плашек и списка; у сервера может быть свой", default: "#3DDC84" },
      colorDown: { type: "color", label: "Цвет «не отвечает» в списке", default: "#FF3030" },
      tileDown: { type: "color", label: "Цвет плашки без ответа", description: "По умолчанию серый; у сервера может быть свой", default: "#6A6A6A" },
    },
  },
  {
    id: "calendar",
    label: "Календарь",
    fields: {
      view: { type: "enum", label: "Сетка календаря", description: "Какой вид показывать первым: только встреча, сетка на 3 недели или месяц. Кнопка OK листает виды, Play / Pause показывает следующую встречу", default: "weeks3", options: [{ value: "off", label: "Выкл" }, { value: "weeks3", label: "3 недели" }, { value: "month", label: "Месяц" }] },
      minutes: { type: "integer", label: "Встреча: за сколько минут", description: "0 — не показывать заранее", default: 5, min: 0, max: 60 },
      color: { type: "color", label: "Акцентный цвет", default: "#FF3B30" },
    },
  },
  {
    id: "work",
    label: "Время работы",
    fields: {
      view: { type: "enum", label: "Вид по умолчанию", description: "Тепловая карта активности или вчера и сегодня; кнопка OK листает виды", default: "grid", options: [{ value: "grid", label: "Тепловая карта" }, { value: "today", label: "Вчера и сегодня" }] },
      hours: { type: "integer", label: "Напомнить после, часов", description: "Сколько часов активной работы за день, 0 — выключено", default: 0, min: 0, max: 16 },
      breakMinutes: { type: "integer", label: "Перерыв: напоминать каждые, минут", description: "Минут непрерывной работы за Mac, 0 — выключено", default: 0, min: 0, max: 240, step: 5 },
      keepDays: { type: "integer", label: "Сколько дней хранить", description: "Итоги по дням, из них строится график активности", default: 30, min: 7, max: 365, local: true },
      idleSec: { type: "integer", label: "Считать паузой после, секунд без ввода", description: "Клавиатура и мышь; пока Mac спит или агент выключен, время не идёт", default: 180, min: 30, max: 1800, step: 30, local: true },
      color: { type: "color", label: "Акцентный цвет", default: "#4DA3FF" },
    },
  },
  {
    id: "app",
    label: "Приложение",
    fields: {
      rotateSeconds: { type: "integer", label: "Автоматическая смена экранов в секундах", description: "0 — только колесом. После поворота колеса автолистание на 15 секунд замирает", default: 0, min: 0, max: 600, step: 5 },
      hideEmpty: { type: "boolean", label: "Прятать пустые экраны", description: "Музыку, когда ничего не играет; AI без окна; календарь без встреч", default: false },
      flashMs: { type: "integer", label: "Название экрана при переключении, мс", description: "0 — не показывать", default: 700, min: 0, max: 3000, step: 100 },
      alertSound: { type: "boolean", label: "Звук уведомлений", default: true },
      order: { type: "order", label: "Порядок экранов", description: "Меняется на вкладке «Общее»", default: "music,claude,servers,calendar,work", hidden: true },
    },
  },
];

export function defaultSettings() {
  const out = {};
  for (const g of GROUPS) {
    out[g.id] = {};
    for (const [k, f] of Object.entries(g.fields)) out[g.id][k] = f.default;
  }
  return out;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
/** The screens that go round on the wheel; the order is a permutation of these, comma-separated. */
export const SCREEN_IDS = ["music", "claude", "servers", "calendar", "work"];
const validOrder = (v) => typeof v === "string" && v.split(",").sort().join() === [...SCREEN_IDS].sort().join();

/** Takes stored or submitted values and returns a complete, valid set: unknown keys dropped, bad values replaced. */
export function sanitizeSettings(input) {
  const out = defaultSettings();
  for (const g of GROUPS) {
    for (const [k, f] of Object.entries(g.fields)) {
      const v = input?.[g.id]?.[k];
      if (v === undefined) continue;
      if (f.type === "boolean" && typeof v === "boolean") out[g.id][k] = v;
      else if (f.type === "integer" && Number.isFinite(v)) {
        const step = f.step ?? 1;
        out[g.id][k] = Math.min(f.max, Math.max(f.min, Math.round((v - f.min) / step) * step + f.min));
      } else if (f.type === "color" && typeof v === "string" && HEX.test(v)) out[g.id][k] = v.toUpperCase();
      else if (f.type === "enum" && f.options.some((o) => o.value === v)) out[g.id][k] = v;
      else if (f.type === "order" && validOrder(v)) out[g.id][k] = v;
      // The mascot used to be an on/off switch.
      else if (g.id === "ai" && k === "mascot" && typeof v === "boolean") out[g.id][k] = v ? "claude" : "none";
    }
  }
  return out;
}

/** What the bar needs, flat: music.artworkOpacity -> musicArtworkOpacity. */
export function forBar(settings) {
  const out = {};
  for (const g of GROUPS) {
    for (const [k, f] of Object.entries(g.fields)) {
      if (!f.local) out[g.id + k[0].toUpperCase() + k.slice(1)] = settings[g.id][k];
    }
  }
  return out;
}

/** English texts for the settings page: group id -> { label, fields: { field -> [label, description] } }; enum options by value. */
const EN = {
  music: { label: "Music", fields: { artwork: ["Album cover", "16×16 to the left of the text"], artworkOpacity: ["Cover opacity, %"], stateIcon: ["Play / pause icon", "A small icon to the right of the artist; yellow on pause"], startToggle: ["Big button: play and pause", "The central Start / Pause button on the music screen plays or pauses"], color: ["Accent colour", "On pause the same colour, half transparent"] } },
  ai: { label: "Agents", fields: { mascot: ["Mascot", "Works, dances when an AI is done, sleeps when nothing happens for a while. Other AIs have no mascot of their own and get the ghost", { claude: "Claude", ghost: "Ghost", none: "No mascot" }], mascotScreen: ["Mascot screen on the OK button", "On the agents screen OK steps through the agents and last shows the mascot: it jumps for joy while an agent works and a fading blue wave spreads around it"], defaultAgent: ["Default agent", "Which agent the AI screen shows first. With several running, the OK button switches between them", { auto: "The one that works", claude: "Claude", codex: "Codex", gemini: "Gemini", aider: "Aider", opencode: "OpenCode", cursor: "Cursor", goose: "Goose" }], overlay: ["Cover other screens when finished", "Off: only the sound and the LED tell, and the news waits on the AI screen"], color: ["Accent colour", "With a mascot the text is a little lighter"] } },
  work: { label: "Work time", fields: { view: ["Default view", "The activity heat map, or yesterday and today; the OK button steps through the views", { grid: "Heat map", today: "Yesterday and today" }], hours: ["Remind after, hours", "Hours of active work in a day, 0 = off"], breakMinutes: ["Break: remind every, minutes", "Minutes of continuous work at the Mac, 0 = off"], keepDays: ["Days to keep", "Totals per day; the activity grid is made of them"], idleSec: ["Count as a pause after, seconds without input", "Keyboard and mouse; while the Mac sleeps or the agent is off, time stands still"], color: ["Accent colour"] } },
  calendar: { label: "Calendar", fields: { view: ["Calendar grid", "Which view comes first: only the meeting, a grid of 3 weeks, or a month. The OK button steps through the views, Play / Pause shows the next meeting", { off: "Off", weeks3: "3 weeks", month: "Month" }], minutes: ["Meeting: how many minutes ahead", "0 = do not pop up ahead of time"], color: ["Accent colour"] } },
  servers: { label: "Servers", fields: { view: ["View", "Which view to start with. The OK button changes the view; Play / Pause: on icons it steps through the servers one by one, in the list and the table it moves the rows up", { tiles: "Icons", list: "List", table: "Table" }], colorOk: ["“Up” colour", "For tiles and the list; a server can have its own"], colorDown: ["“Not answering” colour in the list"], tileDown: ["Tile colour when not answering", "Grey by default; a server can have its own"] } },
  app: { label: "App", fields: { rotateSeconds: ["Automatic screen change, in seconds", "0 = only with the wheel. After a turn of the wheel the rotation waits 15 seconds"], hideEmpty: ["Hide empty screens", "Music when nothing plays; AI without a window; calendar without meetings"], flashMs: ["Screen name when switching, ms", "0 = do not show"], alertSound: ["Notification sound"], order: ["Screen order", "Changed on the General tab"] } },
};

/** The settings groups with their texts in `lang`. */
export function localizedGroups(lang) {
  if (lang !== "en") return GROUPS;
  return GROUPS.map((g) => ({
    ...g,
    label: EN[g.id].label,
    fields: Object.fromEntries(
      Object.entries(g.fields).map(([k, f]) => {
        const [label, description, options] = EN[g.id].fields[k];
        return [k, { ...f, label, description, options: f.options ? f.options.map((o) => ({ ...o, label: options?.[o.value] ?? o.label })) : undefined }];
      }),
    ),
  }));
}
