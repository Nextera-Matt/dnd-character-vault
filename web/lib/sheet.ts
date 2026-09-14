export function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(n: number): string {
  return (n >= 0 ? "+" : "") + n;
}

export function parseModifier(str: string): number {
  const n = parseInt(String(str).replace(/[^\d+-]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function normalizeSlots(
  slots: { level: number; total: number; used: number }[] | { total?: number; used?: number } | undefined,
): { level: number; total: number; used: number }[] {
  if (Array.isArray(slots)) return slots;
  const old = slots || { total: 0, used: 0 };
  return [{ level: 1, total: old.total || 0, used: old.used || 0 }];
}

export function parseDamage(expr: string): { total: number; parts: string[] } {
  const tokens = String(expr).replace(/\s+/g, "").match(/[+-]?\d*d?\d+/gi) || [];
  let total = 0;
  const parts: string[] = [];
  tokens.forEach((tok) => {
    let sign = 1;
    let t = tok;
    if (t[0] === "+") t = t.slice(1);
    else if (t[0] === "-") {
      sign = -1;
      t = t.slice(1);
    }
    const m = t.match(/^(\d*)d(\d+)$/i);
    if (m) {
      const count = parseInt(m[1] || "1", 10);
      const sides = parseInt(m[2], 10);
      const rolls = Array.from({ length: count }, () => rollDie(sides));
      const sum = rolls.reduce((a, b) => a + b, 0);
      total += sign * sum;
      parts.push((sign < 0 ? "-" : "") + count + "d" + sides + "[" + rolls.join(",") + "]");
    } else {
      const num = parseInt(t, 10) || 0;
      total += sign * num;
      parts.push((sign < 0 ? "-" : "+") + num);
    }
  });
  return { total, parts };
}

export const SKILL_LIST = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
];

export const LANGUAGE_LIST = [
  "Common",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
  "Abyssal",
  "Celestial",
  "Draconic",
  "Deep Speech",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Undercommon",
];

export const WEAPON_LIST = [
  "Unarmed Strike",
  "Club",
  "Dagger",
  "Greatclub",
  "Handaxe",
  "Javelin",
  "Light Hammer",
  "Mace",
  "Quarterstaff",
  "Sickle",
  "Spear",
  "Dart",
  "Light Crossbow",
  "Shortbow",
  "Sling",
  "Battleaxe",
  "Flail",
  "Glaive",
  "Greataxe",
  "Greatsword",
  "Halberd",
  "Lance",
  "Longsword",
  "Maul",
  "Morningstar",
  "Pike",
  "Rapier",
  "Scimitar",
  "Shortsword",
  "Trident",
  "War Pick",
  "Warhammer",
  "Whip",
  "Blowgun",
  "Hand Crossbow",
  "Heavy Crossbow",
  "Longbow",
  "Net",
];
