export const THEMES = [
  { id: "", label: "Ember Veil" },
  { id: "candlehall", label: "Candlehall" },
  { id: "seaglass", label: "Seaglass" },
  { id: "wartable", label: "War Table" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "theme";

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : "";
}

export function applyTheme(id: ThemeId): void {
  if (id) document.documentElement.setAttribute("data-theme", id);
  else document.documentElement.removeAttribute("data-theme");
}
