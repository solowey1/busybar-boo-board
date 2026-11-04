/** The agent's own phrases (what it says to the bar and in the console); the settings page has its own. */
const TEXTS = {
  ru: { serverDown: "{name} недоступен", serverUp: "{name} снова в сети", done: "Готово", wait: "Ждёт ответа", doneIn: "Готово: {name}" },
  en: { serverDown: "{name} is down", serverUp: "{name} is back online", done: "Done", wait: "Waiting for a reply", doneIn: "Done: {name}" },
};

export function t(lang, key, vars = {}) {
  const text = (TEXTS[lang] ?? TEXTS.ru)[key] ?? TEXTS.ru[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
