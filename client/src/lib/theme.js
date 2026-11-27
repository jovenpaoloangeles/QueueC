export function initTheme() {
  let dark = false;
  try {
    dark = typeof localStorage !== "undefined" && localStorage.getItem("queuec-theme") === "dark";
  } catch {
    dark = false;
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", dark);
  }
  return dark;
}

export function toggleTheme() {
  if (typeof document === "undefined") return false;
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("queuec-theme", dark ? "dark" : "light");
  } catch {}
  return dark;
}

// "Hide skill": a privacy switch for when players can see the screen. Every
// skill surface carries .tier or .skill-info; one class on <html> hides them
// all (index.css). Per-device, persisted like the theme.
const SKILL_KEY = "queuec-hide-skill";
export function initSkillPrivacy() {
  let hidden = false;
  try {
    hidden = localStorage.getItem(SKILL_KEY) === "1";
  } catch {}
  document.documentElement.classList.toggle("hide-skill", hidden);
  return hidden;
}

export function toggleSkillPrivacy() {
  const hidden = !document.documentElement.classList.contains("hide-skill");
  document.documentElement.classList.toggle("hide-skill", hidden);
  try {
    localStorage.setItem(SKILL_KEY, hidden ? "1" : "0");
  } catch {}
  return hidden;
}
