// Parser tuned specifically to Roll20's 2024 D&D character sheet PDF export
// (sheet_shortname=dnd2024byroll20). PDF text extraction linearizes a visual
// layout into a flat stream, and this template's field order was reverse
// engineered from a real exported sheet. Other PDF sources (D&D Beyond,
// homebrew fillable sheets) will NOT parse correctly with this — the label/
// value ordering is specific to this template.

// Some PDF fonts (seen in Roll20 exports) don't map ligature glyphs to a
// standard Unicode ligature codepoint at all — they fall back to an arbitrary
// placeholder character that happens to render as a diamond, which NFKC
// normalization can't recover since there's no valid ligature codepoint to
// decompose in the first place. This catches what's left over: a lone
// diamond directly between two letters (no spaces) is almost always a
// missing "fi" — by far the most common English ligature — never a real
// bullet point, since real bullets always sit between whole words/phrases
// with spaces on both sides.
// Broad net: catches U+FFFD (the official "couldn't decode this" replacement
// character), Private Use Area codepoints (U+E000-U+F8FF — the single most
// common fallback when a PDF's embedded/subsetted font has no usable
// ToUnicode mapping for a glyph, which is exactly what happens to ligatures
// in some Roll20 PDF exports), and a handful of diamond-shaped symbols in
// case the font substitutes something that merely looks like one visually.
function fixStrayLigatureDiamonds(str) {
  return str.replace(/[\uFFFD\uE000-\uF8FF\u25C6\u25C7\u2666\u2B25\u2B27\u2662]/g, "fi");
}

const SKILLS_BY_ABILITY = {
  STR: ["Athletics"],
  DEX: ["Acrobatics", "Sleight of Hand", "Stealth"],
  CON: [],
  INT: ["Arcana", "History", "Investigation", "Nature", "Religion"],
  WIS: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
  CHA: ["Deception", "Intimidation", "Performance", "Persuasion"],
};
const ABILITY_LABELS = {
  STR: "STRENGTH", DEX: "DEXTERITY", CON: "CONSTITUTION",
  INT: "INTELLIGENCE", WIS: "WISDOM", CHA: "CHARISMA",
};

function parseRoll20Sheet(rawText) {
  const warnings = [];
  // PDF.js sometimes extracts a broken ligature as its own isolated text
  // item, which would otherwise become "re fi exively" once lines get
  // trimmed and rejoined later. The surrounding whitespace pattern reliably
  // distinguishes two cases: a single bare newline means the placeholder
  // sits mid-word ("re" + [x] + "exively" -> fuse fully, no space), while a
  // double newline or an actual space character means it's a genuine word
  // boundary ("basic" + [x] + "ghting" -> keep one space, since "basic" and
  // "fighting" are different words). Confirmed against the real PDF's exact
  // whitespace patterns for every occurrence, not assumed.
  const fusedText = rawText.replace(/([ \t\n]*)[\uFFFD\uE000-\uF8FF]([ \t\n]*)/g, (match, lead) => {
    const isWordBoundary = / /.test(lead) || (lead.match(/\n/g) || []).length > 1;
    return (isWordBoundary ? " " : "") + "fi";
  });
  const text = fusedText.normalize("NFKC").replace(/\r/g, "");
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const idxOf = (label, from = 0) => lines.findIndex((l, i) => i >= from && l === label);
  const valueBefore = (label, from = 0) => {
    const i = idxOf(label, from);
    if (i <= 0) return { value: "", nextIndex: from };
    return { value: lines[i - 1], nextIndex: i + 1 };
  };
  const valueAfter = (label, from = 0) => {
    const i = idxOf(label, from);
    if (i < 0) return { value: "", nextIndex: from };
    return { value: lines[i + 1] || "", nextIndex: i + 2 };
  };

  const result = {
    charName: "Imported Character",
    subtitle: "",
    vitals: { ac: 10, hpCur: 0, hpMax: 0, speed: 30, init: "+0", prof: 2, gold: 0 },
    abilities: [],
    skills: [],
    languages: [],
    traits: [],
    slots: { total: 0, used: 0 },
    cantrips: [],
    prepared: [],
    gear: [],
    quad: { trait: "", ideal: "", bond: "", flaw: "" },
    backstoryHTML: "",
  };

  // ---- Header block: Name, Background, Class, Species, Level, XP, AC, HP, Prof ----
  let backgroundName = "";
  try {
    let cur = 0;
    let r = valueBefore("NAME", cur); result.charName = r.value || result.charName; cur = r.nextIndex;
    r = valueBefore("BACKGROUND", cur); backgroundName = r.value; cur = r.nextIndex;
    r = valueBefore("CLASS", cur); const classLevel = r.value; cur = r.nextIndex;
    r = valueBefore("SPECIES SUBCLASS", cur); const species = r.value; cur = r.nextIndex;
    r = valueBefore("LEVEL", cur); const level = r.value; cur = r.nextIndex;
    r = valueBefore("XP", cur); cur = r.nextIndex;

    result.subtitle = [species, classLevel].filter(Boolean).join(" &middot; ");
    if (backgroundName) result.traits.push({ title: "Background", body: backgroundName });

    r = valueAfter("ARMOR CLASS", cur);
    if (!r.value || isNaN(parseInt(r.value))) {
      // "ARMOR" and "CLASS" sometimes land on separate lines
      const iA = idxOf("ARMOR", cur);
      if (iA >= 0 && lines[iA + 1] === "CLASS") {
        result.vitals.ac = parseInt(lines[iA + 2]) || result.vitals.ac;
        cur = iA + 3;
      } else {
        warnings.push("Could not confidently find Armor Class — check it manually.");
      }
    } else {
      result.vitals.ac = parseInt(r.value);
      cur = r.nextIndex;
    }

    r = valueBefore("CURRENT", cur); result.vitals.hpCur = parseInt(r.value) || 0; cur = r.nextIndex;
    r = valueBefore("MAX", cur); result.vitals.hpMax = parseInt(r.value) || 0; cur = r.nextIndex;

    r = valueAfter("PROFICIENCY BONUS", cur);
    result.vitals.prof = parseInt(r.value) || 2; cur = r.nextIndex;
  } catch (e) {
    warnings.push("Header block (name/class/species/level/AC/HP) only partially parsed.");
  }

  // ---- Ability scores, saves, skills ----
  let cursor = 0;
  for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
    try {
      const labelIdx = idxOf(ABILITY_LABELS[key], cursor);
      if (labelIdx < 0) { warnings.push(`Could not find ${key} block.`); continue; }
      const mod = lines[labelIdx + 1];
      const score = parseInt(lines[labelIdx + 3]) || 10;
      let i = labelIdx + 5; // skip past MODIFIER value, "MODIFIER", score value, "SCORE"
      let saveVal = null;
      if (lines[i]) {
        const mCombined = lines[i].match(/^([+-]?\d+)\s*Saving Throw$/);
        if (mCombined) { saveVal = mCombined[1]; i++; }
        else if (lines[i] === "Saving Throw") { i++; }
      }
      const skillNames = SKILLS_BY_ABILITY[key];
      const foundNames = [];
      let j = i;
      while (j < lines.length && skillNames.includes(lines[j])) { foundNames.push(lines[j]); j++; }
      const needed = foundNames.length + (saveVal === null ? 1 : 0);
      const numbers = lines.slice(j, j + needed);
      if (saveVal === null) { saveVal = numbers.shift() || "+0"; }
      const saveMod = parseInt(saveVal.replace("+", "")) || 0;
      const rawMod = parseInt(mod.replace("+", "")) || 0;
      const isProficientSave = saveMod > rawMod;

      result.abilities.push({ key, score, save: isProficientSave });

      foundNames.forEach((name, idx) => {
        const val = numbers[idx] || "+0";
        result.skills.push({ name, val });
      });

      cursor = j + needed;
    } catch (e) {
      warnings.push(`${key} block only partially parsed.`);
    }
  }

  // ---- Initiative / Speed / Passive Perception ----
  try {
    let r = valueAfter("INITIATIVE", cursor);
    if (r.value) { result.vitals.init = r.value; cursor = r.nextIndex; }
    r = valueAfter("SPEED", cursor);
    if (r.value) { result.vitals.speed = parseInt(r.value) || 30; cursor = r.nextIndex; }
  } catch (e) {
    warnings.push("Initiative/Speed not confidently parsed — defaults used.");
  }

  // ---- Class features / species traits / feats -> traits ----
  try {
    const grab = (startLabel, endLabels) => {
      const start = idxOf(startLabel);
      if (start < 0) return null;
      let end = lines.length;
      for (const el of endLabels) {
        const e = idxOf(el, start + 1);
        if (e > 0 && e < end) end = e;
      }
      return lines.slice(start + 1, end).join(" ")
        .replace(/\s*◆\s*/g, ", ")             // bullet markers -> readable separator
        .replace(/[^,]*:\s*(?=,|$)/g, "")       // drop empty fill-in labels ("Favored Terrain:" with nothing typed in)
        .replace(/,(\s*,)+/g, ",")              // collapse doubled-up commas left behind
        .replace(/^[\s,]+|[\s,–-]+$/g, "")      // trim leading/trailing junk
        .trim();
    };
    // SPELL SLOTS / spellcasting block sits between FEATS and APPEARANCE in the
    // real multi-page export — must be an end-boundary everywhere, not just for Feats,
    // or a non-spellcaster's blank spellcasting block gets swallowed into whichever
    // trait happens to be scanned last.
    const spellBoundaries = ["SPELL SLOTS", "Spellcasting", "CANTRIPS & PREPARED SPELLS"];
    const classFeatures = grab("CLASS FEATURES", ["SPECIES TRAITS", "FEATS", ...spellBoundaries]);
    if (classFeatures) result.traits.push({ title: "Class Features", body: classFeatures });
    const speciesTraits = grab("SPECIES TRAITS", ["FEATS", "WEAPONS & DAMAGE", ...spellBoundaries]);
    if (speciesTraits) result.traits.push({ title: "Species Traits", body: speciesTraits });
    const feats = grab("FEATS", ["APPEARANCE", "WEAPONS & DAMAGE", ...spellBoundaries]);
    if (feats && feats.trim()) result.traits.push({ title: "Feats", body: feats });
  } catch (e) {
    warnings.push("Features/traits section only partially captured.");
  }

  // ---- Alignment / Pronouns ----
  try {
    const alignLine = lines.find(l => l.startsWith("ALIGNMENT"));
    const alignment = alignLine ? alignLine.replace(/^ALIGNMENT\s*/, "").trim() : "";
    const pronounLine = lines.find(l => l.startsWith("PRONOUNS") && l !== "PRONOUNS");
    const pronouns = pronounLine ? pronounLine.replace(/^PRONOUNS\s*/, "").trim() : "";
    const bits = [];
    if (alignment) bits.push("Alignment: " + alignment);
    if (pronouns) bits.push("Pronouns: " + pronouns);
    if (bits.length) result.traits.push({ title: "Identity", body: bits.join(" · ") });
  } catch (e) { /* non-critical */ }

  // ---- Languages ----
  try {
    const i = idxOf("LANGUAGES");
    if (i >= 0) {
      const next = lines[i + 1] || "";
      result.languages = next.split(",").map(s => s.trim()).filter(Boolean);
    }
  } catch (e) {
    warnings.push("Languages not found.");
  }

  // ---- Equipment (simple list) ----
  try {
    const i = idxOf("EQUIPMENT");
    if (i >= 0) {
      let j = i + 1;
      const items = [];
      while (j < lines.length && lines[j] !== "MAGIC ITEM ATTUNEMENT" && lines[j] !== "COINS") {
        items.push(lines[j]);
        j++;
      }
      const joined = items.join(" ");
      result.gear = joined.split(",").map(s => s.trim()).filter(Boolean);
    }
  } catch (e) {
    warnings.push("Equipment list not found — add items manually.");
  }
  if (result.gear.length === 0) {
    warnings.push("No equipment auto-detected — the detailed possessions table (arrows, rope, rations etc.) isn't parsed in this version; add anything important by hand.");
  }

  // ---- Coins ----
  try {
    const i = idxOf("COINS");
    if (i >= 0) {
      // Real PDF.js extraction puts each currency label on its own line
      // (CP / SP / EP / GP / PP, one per line) followed by five more
      // lines with just the numbers — not joined into one row like a
      // human reading the visual table would expect.
      const currencyOrder = ["CP", "SP", "EP", "GP", "PP"];
      let j = i + 1;
      const foundLabels = [];
      while (j < lines.length && foundLabels.length < 5 && currencyOrder.includes(lines[j])) {
        foundLabels.push(lines[j]);
        j++;
      }
      if (foundLabels.length === 5) {
        const numLines = lines.slice(j, j + 5);
        if (numLines.every(l => /^\d+$/.test(l))) {
          const values = {};
          foundLabels.forEach((label, idx) => { values[label] = Number(numLines[idx]); });
          result.vitals.gold = values["GP"] || 0;
          if (values["CP"] || values["SP"] || values["EP"] || values["PP"]) {
            warnings.push(`Non-gold coins found (CP ${values["CP"]||0}, SP ${values["SP"]||0}, EP ${values["EP"]||0}, PP ${values["PP"]||0}) — only GP is tracked in this sheet, add a note if it matters.`);
          }
        } else {
          warnings.push("Coins section found but the numbers row didn't look right — gold defaulted to 0, check manually.");
        }
      } else {
        warnings.push("Coins section found but couldn't locate the numbers row — gold defaulted to 0, check manually.");
      }
    }
  } catch (e) {
    warnings.push("Coins not found — gold defaulted to 0.");
  }

  // ---- Backstory & Personality ----
  try {
    const i = idxOf("BACKSTORY & PERSONALITY");
    if (i >= 0) {
      let j = i + 1;
      const buf = [];
      while (j < lines.length && !lines[j].startsWith("ALIGNMENT") && lines[j] !== "LANGUAGES") {
        const isRepeatedHeading = buf.length === 0 && backgroundName && lines[j].toLowerCase() === backgroundName.toLowerCase();
        if (!isRepeatedHeading) buf.push(lines[j]);
        j++;
      }
      const prose = buf.join(" ");
      if (prose) result.backstoryHTML = "<p>" + prose.replace(/</g, "&lt;") + "</p>";
    }
  } catch (e) {
    warnings.push("Backstory text not found.");
  }
  if (!result.backstoryHTML) {
    result.backstoryHTML = "<p>Add your character's story here.</p>";
    warnings.push("No backstory text detected in the PDF.");
  }

  // Spellcasting: intentionally not parsed in v1 — flag if the sheet looks like it has prepared spells
  if (idxOf("CANTRIPS & PREPARED SPELLS") >= 0) {
    const spellIdx = idxOf("CANTRIPS & PREPARED SPELLS");
    const nextFewLines = lines.slice(spellIdx + 1, spellIdx + 10).join(" ");
    if (/[A-Za-z]{3,}/.test(nextFewLines.replace(/LVL|NAME|CASTING TIME|RANGE|CONCENTRATION|RITUAL|MATERIAL|NOTES|C R M/g, "").trim())) {
      warnings.push("This sheet appears to have spells listed — spell parsing isn't supported yet, add cantrips/prepared spells manually after import.");
    }
  }

  // Final safety net: catch any stray placeholder characters (broken
  // ligatures) that survived normalization, across every text field —
  // not just backstory, in case the same issue shows up in gear names,
  // skill labels, or anywhere else text was extracted from the PDF.
  result.charName = fixStrayLigatureDiamonds(result.charName);
  result.subtitle = fixStrayLigatureDiamonds(result.subtitle);
  result.backstoryHTML = fixStrayLigatureDiamonds(result.backstoryHTML);
  result.traits = result.traits.map(t => ({
    title: fixStrayLigatureDiamonds(t.title),
    body: fixStrayLigatureDiamonds(t.body),
  }));
  result.skills = result.skills.map(s => ({ ...s, name: fixStrayLigatureDiamonds(s.name) }));
  result.languages = result.languages.map(fixStrayLigatureDiamonds);
  result.gear = result.gear.map(fixStrayLigatureDiamonds);

  return { data: result, warnings };
}

export { parseRoll20Sheet };
if (typeof module !== "undefined") module.exports = { parseRoll20Sheet };
