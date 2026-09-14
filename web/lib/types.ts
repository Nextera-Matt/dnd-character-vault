export type Ability = {
  key: string;
  score: number;
  save: boolean;
};

export type Skill = {
  name: string;
  val: string;
  proficient?: boolean;
  override?: boolean;
};

export type Trait = {
  title: string;
  body: string;
};

export type SpellCard = {
  name: string;
  tag: string;
  info?: string;
};

export type Attack = {
  name: string;
  bonus: string;
  damage: string;
  range?: string;
};

export type SlotTier = {
  level: number;
  total: number;
  used: number;
};

export type CharacterData = {
  charName: string;
  subtitle: string;
  vitals: {
    ac: number;
    hpCur: number;
    hpMax: number;
    speed: number;
    init: string;
    prof: number;
    gold: number;
    initOverride?: boolean;
  };
  abilities: Ability[];
  skills: Skill[];
  languages: string[];
  traits: Trait[];
  slots: SlotTier[] | { total: number; used: number };
  attacks?: Attack[];
  cantrips: SpellCard[];
  prepared: SpellCard[];
  gear: string[];
  quad: {
    trait: string;
    ideal: string;
    bond: string;
    flaw: string;
  };
  backstoryHTML: string;
};

export type MeUser = {
  id: number;
  displayName: string;
  isSiteAdmin: boolean;
};

export type SessionSummary = {
  id: number;
  name: string;
  memberCount: number;
  characterCount: number;
  isAdmin: boolean;
};

export type VaultCharacter = {
  id: number;
  name: string;
  updatedAt: string;
  sessionId: number;
  sessionName: string;
};

export type SessionDetail = {
  id: number;
  name: string;
  isAdmin: boolean;
  inviteCode?: string;
  members?: { id: number; displayName: string; joinedAt: string }[];
};

export type SessionCharacter = {
  id: number;
  name: string;
  updatedAt: string;
  ownerId: number;
  ownerName: string;
  isOwner: boolean;
};

export type CharacterPayload = {
  id: number;
  name: string;
  data: CharacterData;
  updatedAt: string;
  ownerId: number;
  ownerName: string;
  isOwner: boolean;
  sessionId: number;
  sessionName: string;
};

export type AdminOverview = {
  users: {
    id: number;
    displayName: string;
    role: string;
    createdAt: string;
  }[];
  sessions: {
    id: number;
    name: string;
    inviteCode: string;
    createdBy: number | null;
    adminName: string | null;
    memberCount: number;
    characterCount: number;
  }[];
  characters: {
    id: number;
    name: string;
    updatedAt: string;
    ownerName: string;
    sessionName: string;
  }[];
};

export type SrdSpell = {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  classes: string[];
  description: string;
};

export type SrdItem = {
  name: string;
  type: string;
  rarity: string;
  requiresAttunement?: boolean;
  description: string;
};
