const sanitizeHtml = require('sanitize-html');
const defaultTemplate = require('./default-template');

const SANITIZE_OPTS = {
  allowedTags: ['p', 'br', 'b', 'i', 'strong', 'em'],
  allowedAttributes: {},
};

function sanitizeField(obj, key) {
  if (obj && typeof obj[key] === 'string') obj[key] = sanitizeHtml(obj[key], SANITIZE_OPTS);
}

function sanitizeCharacterData(data) {
  if (!data || typeof data !== 'object') return data;
  sanitizeField(data, 'backstoryHTML');
  sanitizeField(data, 'subtitle');
  if (Array.isArray(data.traits)) {
    data.traits.forEach((t) => { sanitizeField(t, 'title'); sanitizeField(t, 'body'); });
  }
  ['cantrips', 'prepared'].forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key].forEach((s) => { sanitizeField(s, 'name'); sanitizeField(s, 'tag'); sanitizeField(s, 'info'); });
    }
  });
  if (Array.isArray(data.gear)) {
    data.gear = data.gear.map((item) => (typeof item === 'string' ? sanitizeHtml(item, SANITIZE_OPTS) : item));
  }
  return data;
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

function pickArray(incoming, existing, fallback) {
  if (Array.isArray(incoming)) return incoming;
  if (Array.isArray(existing)) return existing;
  return fallback;
}

// Overlay a PUT body onto the stored character, filling any omitted keys from
// the stored blob then the blank template. A partial payload therefore cannot
// wipe skills/spells — it only changes the fields it actually sent.
function mergeCharacterData(incoming, existing) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { ok: false, error: 'Invalid character data.' };
  }
  const stored = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const base = defaultTemplate();
  const incomingVitals = incoming.vitals && typeof incoming.vitals === 'object' ? incoming.vitals : {};
  const storedVitals = stored.vitals && typeof stored.vitals === 'object' ? stored.vitals : {};
  const incomingQuad = incoming.quad && typeof incoming.quad === 'object' ? incoming.quad : {};
  const storedQuad = stored.quad && typeof stored.quad === 'object' ? stored.quad : {};

  const data = {
    ...base,
    ...stored,
    ...incoming,
    vitals: {
      ...base.vitals,
      ...storedVitals,
      ...incomingVitals,
      ac: asNumber(incomingVitals.ac ?? storedVitals.ac, base.vitals.ac),
      hpCur: asNumber(incomingVitals.hpCur ?? storedVitals.hpCur, base.vitals.hpCur),
      hpMax: asNumber(incomingVitals.hpMax ?? storedVitals.hpMax, base.vitals.hpMax),
      speed: asNumber(incomingVitals.speed ?? storedVitals.speed, base.vitals.speed),
      prof: asNumber(incomingVitals.prof ?? storedVitals.prof, base.vitals.prof),
      gold: asNumber(incomingVitals.gold ?? storedVitals.gold, base.vitals.gold),
      init: asString(incomingVitals.init ?? storedVitals.init, base.vitals.init),
    },
    quad: {
      ...base.quad,
      ...storedQuad,
      ...incomingQuad,
      trait: asString(incomingQuad.trait ?? storedQuad.trait, ''),
      ideal: asString(incomingQuad.ideal ?? storedQuad.ideal, ''),
      bond: asString(incomingQuad.bond ?? storedQuad.bond, ''),
      flaw: asString(incomingQuad.flaw ?? storedQuad.flaw, ''),
    },
    charName: asString(incoming.charName ?? stored.charName, base.charName).slice(0, 80) || 'Unnamed',
    subtitle: asString(incoming.subtitle ?? stored.subtitle, base.subtitle),
    backstoryHTML: asString(incoming.backstoryHTML ?? stored.backstoryHTML, base.backstoryHTML),
    abilities: pickArray(incoming.abilities, stored.abilities, base.abilities),
    skills: pickArray(incoming.skills, stored.skills, base.skills),
    languages: pickArray(incoming.languages, stored.languages, base.languages),
    traits: pickArray(incoming.traits, stored.traits, base.traits),
    slots: incoming.slots !== undefined ? incoming.slots : (stored.slots !== undefined ? stored.slots : base.slots),
    attacks: pickArray(incoming.attacks, stored.attacks, base.attacks),
    cantrips: pickArray(incoming.cantrips, stored.cantrips, base.cantrips),
    prepared: pickArray(incoming.prepared, stored.prepared, base.prepared),
    gear: pickArray(incoming.gear, stored.gear, base.gear),
  };

  return { ok: true, data: sanitizeCharacterData(data) };
}

function parseStoredCharacter(raw, id) {
  try {
    const parsed = JSON.parse(raw);
    const merged = mergeCharacterData(parsed, null);
    if (!merged.ok) throw new Error(merged.error);
    return merged.data;
  } catch (err) {
    console.error('Corrupt character JSON', { id, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

module.exports = {
  mergeCharacterData,
  sanitizeCharacterData,
  parseStoredCharacter,
};
