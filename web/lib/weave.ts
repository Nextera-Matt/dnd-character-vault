import type { ThemeId } from "@/lib/themes";

export type WeaveMood = {
  camZ: number;
  camY: number;
  rotY: number;
  edge: number;
  flow: number;
  dim: number;
};

export type WeavePalette = {
  node: string;
  nodeHot: string;
  edge: string;
  packet: string;
  alert: string;
};

/** Route moods: the camera's scroll journey, one stance per rite. */
export const WEAVE_MOODS: Record<string, WeaveMood> = {
  gate: { camZ: 11, camY: 0.6, rotY: 0, edge: 0.22, flow: 1.0, dim: 0.85 },
  vault: { camZ: 9.5, camY: 0.2, rotY: 0.35, edge: 0.16, flow: 0.7, dim: 0.4 },
  table: { camZ: 8, camY: -0.2, rotY: -0.3, edge: 0.3, flow: 1.5, dim: 0.5 },
  rite: { camZ: 9.5, camY: 0.1, rotY: 0.25, edge: 0.2, flow: 0.9, dim: 0.4 },
  lore: { camZ: 11, camY: 0.6, rotY: 0, edge: 0.22, flow: 0.8, dim: 0.55 },
};

export function moodForPath(pathname: string): { key: string; mood: WeaveMood } {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "" || p === "/") return { key: "gate", mood: WEAVE_MOODS.gate };
  if (p.startsWith("/session")) return { key: "table", mood: WEAVE_MOODS.table };
  if (p.startsWith("/sheet")) return { key: "rite", mood: WEAVE_MOODS.rite };
  if (p.startsWith("/vault")) return { key: "vault", mood: WEAVE_MOODS.vault };
  return { key: "lore", mood: WEAVE_MOODS.lore };
}

/** Theme palettes: the same weave, lit like each theme's room. */
export const WEAVE_PALETTES: Record<string, WeavePalette> = {
  "": {
    node: "#8a6b2e",
    nodeHot: "#d4a54a",
    edge: "#5a3d72",
    packet: "#efe6d2",
    alert: "#b45a4a",
  },
  candlehall: {
    node: "#b06a32",
    nodeHot: "#8a4b1e",
    edge: "#6b4a32",
    packet: "#2a2218",
    alert: "#9a3328",
  },
  seaglass: {
    node: "#2e6b62",
    nodeHot: "#e0a34a",
    edge: "#1f4a44",
    packet: "#dceae6",
    alert: "#c45a48",
  },
  wartable: {
    node: "#6a7240",
    nodeHot: "#c7d36a",
    edge: "#3a4030",
    packet: "#eceae4",
    alert: "#d45a48",
  },
};

export function paletteForTheme(theme: ThemeId): WeavePalette {
  return WEAVE_PALETTES[theme] ?? WEAVE_PALETTES[""];
}

export const ROLL_IMPULSE_EVENT = "vault:roll-impulse";
export const FLOW_IMPULSE_EVENT = "vault:flow-impulse";

export type RollKind = "crit" | "fumble" | "normal";

export type RollImpulse = {
  kind: RollKind;
  label: string;
  total: number;
};

export type FlowImpulse = Partial<WeaveMood>;

export function dispatchRollImpulse(roll: RollImpulse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RollImpulse>(ROLL_IMPULSE_EVENT, { detail: roll }));
}

export function dispatchFlowImpulse(flow: FlowImpulse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FlowImpulse>(FLOW_IMPULSE_EVENT, { detail: flow }));
}

/** Dice answers land in the scene with different signatures. */
export function impulseForRoll(kind: RollKind): FlowImpulse {
  if (kind === "crit") return { edge: 0.5, flow: 3.0, camZ: -1.6, dim: 0.9 };
  if (kind === "fumble") return { edge: 0.32, flow: 0.5, camZ: 1.0, dim: 0.3 };
  return { edge: 0.35, flow: 1.8 };
}
