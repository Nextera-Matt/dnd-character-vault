"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { parseDamage, rollDie } from "@/lib/sheet";

export type RollMode = "normal" | "adv" | "dis";

export type DiceHandle = {
  rollD20: (modifier: number, label: string) => void;
  rollDamage: (expr: string, label: string) => void;
};

export function DiceTray({
  handleRef,
}: {
  handleRef: React.MutableRefObject<DiceHandle | null>;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RollMode>("normal");
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [result, setResult] = useState("—");
  const [tone, setTone] = useState<"ok" | "crit" | "fumble">("ok");
  const [history, setHistory] = useState<string[]>([]);
  const [tumble, setTumble] = useState(0);

  function flashDie() {
    if (reduce) return;
    setTumble((n) => n + 1);
  }

  function pushHistory(line: string) {
    setHistory((h) => [line, ...h].slice(0, 8));
    setOpen(true);
  }

  function rollD20(modifier: number, label: string) {
    const rolls = mode === "normal" ? [rollDie(20)] : [rollDie(20), rollDie(20)];
    const picked = mode === "dis" ? Math.min(...rolls) : Math.max(...rolls);
    const sum = picked + modifier;
    const modStr = modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : "";
    const modeTag = mode !== "normal" ? ` (${mode === "adv" ? "Adv" : "Dis"})` : "";
    setResult(String(sum));
    setTone(picked === 20 ? "crit" : picked === 1 ? "fumble" : "ok");
    flashDie();
    const rollsDisplay = rolls.length > 1 ? `[${rolls.map((r) => (r === picked ? r : r)).join(", ")}]` : `[${rolls[0]}]`;
    pushHistory(`${label ? label + ": " : ""}d20${modeTag}${modStr} ${rollsDisplay} = ${sum}`);
  }

  function rollExpr(sides: number, n: number, modifier: number, label?: string) {
    const rolls = Array.from({ length: Math.max(1, n) }, () => rollDie(sides));
    const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
    const modStr = modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : "";
    setResult(String(sum));
    setTone("ok");
    flashDie();
    pushHistory(`${label ? label + ": " : ""}${n}d${sides}${modStr} [${rolls.join(", ")}] = ${sum}`);
  }

  function rollDmg(expr: string, label: string) {
    const { total, parts } = parseDamage(expr);
    setResult(String(total));
    setTone("ok");
    flashDie();
    pushHistory(`${label ? label + ": " : ""}${expr} ${parts.join(" ")} = ${total}`);
  }

  handleRef.current = {
    rollD20,
    rollDamage: rollDmg,
  };

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 left-4 z-30 w-12 h-12 rounded-full surface border-[var(--gold-dim)] text-[var(--gold)] text-xl"
        title="Roll dice"
        onClick={() => setOpen((v) => !v)}
      >
        d20
      </button>
      {open ? (
        <motion.div
          className="fixed bottom-[4.4rem] left-4 z-30 w-[260px] surface p-4"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h4 className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.08em] uppercase text-[var(--gold-dim)] mb-2">
            Dice Tray
          </h4>
          <div className="grid grid-cols-4 gap-1 mb-2">
            {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
              <button
                key={sides}
                type="button"
                className="btn font-[family-name:var(--font-mono)] text-xs py-1"
                onClick={() => rollExpr(sides, count, mod)}
              >
                d{sides}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mb-2">
            {(["normal", "adv", "dis"] as const).map((m) => (
              <button
                key={m}
                type="button"
                title={m === "normal" ? "Normal" : m === "adv" ? "Advantage" : "Disadvantage"}
                className={`btn flex-1 px-1 py-1 text-[0.55rem] tracking-[0.02em] whitespace-nowrap ${mode === m ? "btn-primary" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "normal" ? "Normal" : m === "adv" ? "Adv" : "Dis"}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center text-xs text-[var(--ink-dim)] mb-2">
            <span>Count</span>
            <input className="w-12 text-center border border-[var(--hairline)] bg-transparent" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
            <span>Mod</span>
            <input className="w-12 text-center border border-[var(--hairline)] bg-transparent" type="number" value={mod} onChange={(e) => setMod(Number(e.target.value) || 0)} />
          </div>
          <div key={tumble} className={`die-face ${tumble ? "die-tumble" : ""}`} aria-hidden="true">
            {result}
          </div>
          <div
            className={`font-[family-name:var(--font-mono)] text-2xl text-center py-2 border-t border-[var(--hairline)] ${
              tone === "crit" ? "text-[var(--ok)]" : tone === "fumble" ? "text-[var(--danger)]" : "text-[var(--gold)]"
            }`}
          >
            {result}
          </div>
          <div className="max-h-[110px] overflow-y-auto text-[0.7rem] text-[var(--ink-dim)] mt-2">
            {history.map((h, i) => (
              <div key={`${h}-${i}`} className="py-1 border-b border-dotted border-[var(--hairline)]">
                {h}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn w-full mt-2 text-[0.6rem]"
            onClick={() => {
              setHistory([]);
              setResult("—");
              setTone("ok");
            }}
          >
            Clear History
          </button>
        </motion.div>
      ) : null}
    </>
  );
}

