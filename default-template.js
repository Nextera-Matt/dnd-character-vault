module.exports = function defaultTemplate() {
  return {
    charName: "New Character",
    subtitle: "Species &middot; Class &middot; Background",
    vitals: { ac: 10, hpCur: 8, hpMax: 8, speed: 30, init: "+0", prof: 2, gold: 0, initOverride: false, conditions: "" },
    abilities: [
      { key: "STR", score: 10, save: false },
      { key: "DEX", score: 10, save: false },
      { key: "CON", score: 10, save: false },
      { key: "INT", score: 10, save: false },
      { key: "WIS", score: 10, save: false },
      { key: "CHA", score: 10, save: false },
    ],
    skills: [
      { name: "Skill", val: "+0", proficient: false, override: false },
    ],
    languages: ["Common"],
    traits: [
      { title: "New Trait", body: "Describe what it does." },
    ],
    slots: [{ level: 1, total: 0, used: 0 }],
    attacks: [],
    cantrips: [],
    prepared: [],
    gear: [
      "Starting item",
    ],
    quad: {
      trait: "",
      ideal: "",
      bond: "",
      flaw: "",
    },
    backstoryHTML: "<p>Write your character's story here.</p>",
  };
};
