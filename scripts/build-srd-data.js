// Parses the SRD 5.2.1 markdown files (sourced from your5e/5e-srd-markdown,
// itself a faithful conversion of Wizards' official SRD 5.2.1, released under
// CC-BY-4.0) into clean JSON the app can search over.
//
// This work includes material from the System Reference Document 5.2.1
// ("SRD 5.2.1") by Wizards of the Coast LLC, available at
// https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the
// Creative Commons Attribution 4.0 International License, available at
// https://creativecommons.org/licenses/by/4.0/legalcode.
//
// Run with: node scripts/build-srd-data.js <path-to-cloned-5e-srd-markdown-repo>

const fs = require('fs');
const path = require('path');

const srcRoot = process.argv[2];
if (!srcRoot) {
  console.error('Usage: node scripts/build-srd-data.js <path-to-5e-srd-markdown-repo>');
  process.exit(1);
}

function readAllMd(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readAllMd(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function parseSpell(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const name = lines[0].replace(/^#\s*/, '').trim();

  const subtitleLine = lines.find(l => l.startsWith('_') && !l.includes('**'));
  const subtitle = subtitleLine ? subtitleLine.replace(/^_|_$/g, '').trim() : '';

  // Two distinct formats in the source:
  //   Leveled spells: "Level 3 Evocation (Sorcerer, Wizard)"
  //   Cantrips:        "Evocation Cantrip (Sorcerer, Wizard)"  <- school comes FIRST
  const classesMatch = subtitle.match(/\(([^)]+)\)\s*$/);
  const classes = classesMatch ? classesMatch[1].split(',').map(s => s.trim()) : [];
  const withoutClasses = subtitle.replace(/\([^)]+\)\s*$/, '').trim();

  let level, school;
  if (/Cantrip/i.test(withoutClasses)) {
    level = 0;
    school = withoutClasses.replace(/Cantrip/i, '').trim();
  } else {
    const levelMatch = withoutClasses.match(/^Level (\d+)\s*(.*)$/i);
    level = levelMatch ? Number(levelMatch[1]) : null;
    school = levelMatch ? levelMatch[2].trim() : withoutClasses;
  }

  const field = (label) => {
    const l = lines.find(l => l.includes(`**${label}:**`));
    return l ? l.split(`**${label}:**`)[1].trim() : '';
  };

  const bodyStartIdx = lines.findIndex(l => l.startsWith('- **Duration:**')) + 1;
  const body = lines.slice(bodyStartIdx).join('\n').trim();

  return {
    name, level, school, classes,
    castingTime: field('Casting Time'),
    range: field('Range'),
    components: field('Components'),
    duration: field('Duration'),
    description: body,
  };
}

// Finds the first comma NOT nested inside parentheses — needed because both
// the type and rarity portions of a subtitle can contain their own internal
// commas within parens (e.g. a weapon-type list, or a class-restriction list).
function splitTopLevelComma(str) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    else if (str[i] === ',' && depth === 0) return i;
  }
  return -1;
}

function parseMagicItem(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const name = lines[0].replace(/^#\s*/, '').trim();
  const subtitleLine = lines.find(l => l.startsWith('_'));
  const subtitle = subtitleLine ? subtitleLine.replace(/^_|_$/g, '').trim() : '';

  const splitIdx = splitTopLevelComma(subtitle);
  const type = splitIdx >= 0 ? subtitle.slice(0, splitIdx).trim() : subtitle;
  const rest = splitIdx >= 0 ? subtitle.slice(splitIdx + 1).trim() : '';

  const requiresAttunement = /attunement/i.test(subtitle);
  const rarity = rest.replace(/\s*\(requires attunement[^)]*\)/gi, '').trim();

  const bodyStartIdx = lines.findIndex(l => l.startsWith('_')) + 1;
  const description = lines.slice(bodyStartIdx).join('\n').trim();

  return { name, type, rarity, requiresAttunement, description };
}

const spellsDir = path.join(srcRoot, 'dnd/521/markdown/Spells');
const itemsDir = path.join(srcRoot, 'dnd/521/markdown/Magic Items');

const spells = readAllMd(spellsDir)
  .filter(f => path.basename(f) !== 'Spells.md')
  .map(parseSpell)
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
const RARITY_WORDS = /\b(Common|Uncommon|Rare|Very Rare|Legendary|Artifact|Varies)\b/i;
const items = readAllMd(itemsDir)
  .map(parseMagicItem)
  .filter(item => RARITY_WORDS.test(item.type + ' ' + item.rarity))
  .sort((a, b) => a.name.localeCompare(b.name));

const outDir = path.join(__dirname, '..', 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'srd-spells.json'), JSON.stringify(spells));
fs.writeFileSync(path.join(outDir, 'srd-items.json'), JSON.stringify(items));

console.log(`Parsed ${spells.length} spells, ${items.length} magic items.`);
console.log('Sample spell:', JSON.stringify(spells.find(s => s.name === 'Fireball'), null, 2));
console.log('Sample item:', JSON.stringify(items.find(i => i.name === 'Bag of Holding'), null, 2));
