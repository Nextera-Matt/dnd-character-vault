// One-off helper: node seed-caelric.js <userId> <sessionId>
// Inserts Caelric Duskmere as a character owned by the given user, in the given session.
require('dotenv').config();
const db = require('./db');

const userId = Number(process.argv[2]);
const sessionId = Number(process.argv[3]);
if (!userId || !sessionId) {
  console.error('Usage: node seed-caelric.js <userId> <sessionId>');
  console.error('Find these by checking data.sqlite:');
  console.error('  sqlite3 data.sqlite "select id, display_name from users;"');
  console.error('  sqlite3 data.sqlite "select id, name from sessions;"');
  process.exit(1);
}

const data = {
  charName: "Caelric Duskmere",
  subtitle: "Elf Sorcerer &middot; Shadow Magic &middot; Sage",
  vitals: { ac: 14, hpCur: 8, hpMax: 8, speed: 30, init: "+2", prof: 2, gold: 36 },
  abilities: [
    { key: "STR", score: 8, save: false },
    { key: "DEX", score: 14, save: false },
    { key: "CON", score: 15, save: true },
    { key: "INT", score: 11, save: false },
    { key: "WIS", score: 12, save: false },
    { key: "CHA", score: 15, save: true },
  ],
  skills: [
    { name: "Arcana", val: "+2" },
    { name: "History", val: "+2" },
    { name: "Insight", val: "+3" },
    { name: "Persuasion", val: "+4" },
    { name: "Perception", val: "+1" },
  ],
  languages: ["Common", "Elvish", "Infernal"],
  traits: [
    { title: "Darkvision, Fey Ancestry, Keen Senses (Perception), Trance", body: "Standard Elf traits: Darkvision 60 ft, advantage on saves vs. being Charmed, proficiency in Perception, and the ability to trance instead of sleeping." },
    { title: "Elven Lineage", body: "Prestidigitation cantrip (swappable on Long Rest). Detect Magic free 1/Long Rest at level 3. Misty Step free 1/Long Rest at level 5. Cast using Charisma." },
    { title: "Magic Initiate (Wizard) — Sage", body: "Mage Hand and Toll the Dead cantrips. Shield always prepared, castable free once per Long Rest." },
    { title: "Innate Sorcery", body: "Bonus action, 1 minute: advantage on spell attack rolls, +1 spell save DC. 2 uses, refills on Long Rest." },
    { title: "Shadow Magic — unlocks level 3", body: "Eyes of the Dark: darkvision extends to 120 ft starting at level 1. At level 3 you learn Darkness for free (doesn't count as a known spell), castable by spending 2 sorcery points or a spell slot — spend the sorcery points and you can see through it yourself. Strength of the Grave: when damage would drop you to 0 HP, roll a CHA save (DC 5 + the damage taken) to drop to 1 HP instead. Doesn't work against radiant damage or a critical hit, and only once per long rest." },
  ],
  slots: { total: 2, used: 0 },
  cantrips: [
    { name: "Fire Bolt", tag: "Sorcerer" },
    { name: "Chill Touch", tag: "Sorcerer" },
    { name: "Minor Illusion", tag: "Sorcerer" },
    { name: "Ray of Frost", tag: "Sorcerer" },
    { name: "Mage Hand", tag: "Magic Initiate" },
    { name: "Toll the Dead", tag: "Magic Initiate" },
    { name: "Prestidigitation", tag: "Elven Lineage" },
  ],
  prepared: [
    { name: "Magic Missile", tag: "Sorcerer" },
    { name: "Chromatic Orb", tag: "Sorcerer" },
    { name: "Shield", tag: "Magic Initiate — free 1/rest" },
  ],
  gear: [
    "Spear", "2 Daggers", "Arcane Focus — a shard of shadow-touched glass",
    "Dungeoneer's Pack — backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft rope",
    "Calligrapher's Supplies", "A book (history)", "Parchment (8 sheets)", "A robe",
  ],
  quad: {
    trait: "I narrate what I'm observing under my breath — a scholar's habit that's unsettling to watch in a haunted castle.",
    ideal: "Knowledge. Understanding the shape of a danger is the first step to surviving it.",
    bond: "The shadow-touched tome that changed me is still out there, incomplete.",
    flaw: "I underestimate how much the power I channel has already changed me.",
  },
  backstoryHTML: `<p>I was an archivist attached to my high elf enclave's restricted collection — the kind of sage whose job was to catalogue dangerous texts, not read them cover to cover. I broke that rule exactly once, with a bound manuscript that shouldn't have been in the collection at all. I don't remember most of what happened that night. I remember finishing the book. I remember my shadow moving half a second after I did, for about a week afterward.</p><p>My magic came in wrong after that — colder, quieter, threaded through with something that wasn't mine. The enclave was polite about asking me to leave. I pried a shard of the tome's binding loose before they confiscated the rest, and I've carried it ever since — my arcane focus now, and the only physical trace left of what happened to me.</p><p>I've spent the time since trying to get ahead of what I started: chasing references to the tome, to whoever wrote it, to what it actually did to me. The trail — and the mists — brought me to Barovia.</p><p>I'm not here to fight Strahd. I'm here because this is exactly the kind of place that would have answers, and I'm used to that trade-off by now.</p>`,
};

const info = db.prepare('INSERT INTO characters (user_id, session_id, name, data) VALUES (?, ?, ?, ?)')
  .run(userId, sessionId, data.charName, JSON.stringify(data));

console.log(`Inserted Caelric Duskmere as character id ${info.lastInsertRowid} for user ${userId} in session ${sessionId}.`);
