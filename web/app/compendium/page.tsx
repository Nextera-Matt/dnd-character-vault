"use client";

import { useEffect, useMemo, useState } from "react";
import { MotionPage } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import type { SrdItem, SrdSpell } from "@/lib/types";

function formatMarkdownish(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

export default function CompendiumPage() {
  const [spells, setSpells] = useState<SrdSpell[]>([]);
  const [items, setItems] = useState<SrdItem[]>([]);
  const [tab, setTab] = useState<"spells" | "items">("spells");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [cls, setCls] = useState("");
  const [rarity, setRarity] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/srd-spells.json").then((r) => r.json() as Promise<SrdSpell[]>),
      fetch("/data/srd-items.json").then((r) => r.json() as Promise<SrdItem[]>),
    ]).then(([s, i]) => {
      setSpells(s);
      setItems(i);
    });
  }, []);

  const levels = useMemo(() => [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b), [spells]);
  const classes = useMemo(() => [...new Set(spells.flatMap((s) => s.classes))].sort(), [spells]);
  const rarities = useMemo(() => {
    const order = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];
    return [...new Set(items.map((i) => i.rarity).filter(Boolean))].sort(
      (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
    );
  }, [items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (tab === "spells") {
      return spells.filter(
        (s) =>
          (!needle || s.name.toLowerCase().includes(needle)) &&
          (level === "" || s.level === Number(level)) &&
          (cls === "" || s.classes.includes(cls)),
      );
    }
    return items.filter(
      (i) => (!needle || i.name.toLowerCase().includes(needle)) && (rarity === "" || i.rarity === rarity),
    );
  }, [tab, spells, items, q, level, cls, rarity]);

  return (
    <MotionPage>
      <TopBar backHref="/vault/" backLabel="My Vault" />
      <main className="max-w-[820px] mx-auto px-6 py-8 pb-16">
        <h1 className="font-[family-name:var(--font-cinzel)] text-center text-[var(--gold)] text-3xl">Compendium</h1>
        <p className="text-center text-[var(--ink-dim)] text-sm mb-6">Spells and magic items from the SRD 5.2.1</p>
        <div className="flex gap-2 mb-4">
          <button type="button" className={`btn flex-1 ${tab === "spells" ? "btn-primary" : ""}`} onClick={() => { setTab("spells"); setQ(""); setOpen(null); }}>
            Spells
          </button>
          <button type="button" className={`btn flex-1 ${tab === "items" ? "btn-primary" : ""}`} onClick={() => { setTab("items"); setQ(""); setOpen(null); }}>
            Magic Items
          </button>
        </div>
        <input
          className="w-full bg-[var(--bg-raised)] border border-[var(--hairline)] px-4 py-3 mb-3"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tab === "spells" ? (
          <div className="flex gap-2 flex-wrap mb-4">
            <select className="bg-[var(--bg-raised)] border border-[var(--hairline)] px-2 py-1 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Any level</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l === 0 ? "Cantrip" : `Level ${l}`}
                </option>
              ))}
            </select>
            <select className="bg-[var(--bg-raised)] border border-[var(--hairline)] px-2 py-1 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">Any class</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex gap-2 mb-4">
            <select className="bg-[var(--bg-raised)] border border-[var(--hairline)] px-2 py-1 text-sm" value={rarity} onChange={(e) => setRarity(e.target.value)}>
              <option value="">Any rarity</option>
              {rarities.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="text-[var(--ink-dim)] text-sm mb-4">
          {list.length} result{list.length === 1 ? "" : "s"}
        </p>
        {list.length === 0 ? <p className="text-center italic text-[var(--ink-dim)] py-8">Nothing matches.</p> : null}
        {tab === "spells"
          ? (list as SrdSpell[]).map((s) => (
              <article key={s.name} className="surface mb-2">
                <button type="button" className="w-full text-left px-4 py-3 flex justify-between" onClick={() => setOpen(open === s.name ? null : s.name)}>
                  <span className="font-[family-name:var(--font-cinzel)] text-[var(--gold)]">{s.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[0.68rem] uppercase text-[var(--veil)]">
                    {s.level === 0 ? "Cantrip" : `Lvl ${s.level}`} · {s.school}
                  </span>
                </button>
                {open === s.name ? (
                  <div className="px-4 pb-4 border-t border-dotted border-[var(--hairline)] pt-3">
                    <p className="text-xs text-[var(--ink-dim)] mb-2">
                      <b className="text-[var(--gold-dim)]">Casting Time:</b> {s.castingTime} · <b className="text-[var(--gold-dim)]">Range:</b> {s.range}
                      <br />
                      <b className="text-[var(--gold-dim)]">Components:</b> {s.components} · <b className="text-[var(--gold-dim)]">Duration:</b> {s.duration}
                      <br />
                      <b className="text-[var(--gold-dim)]">Classes:</b> {s.classes.join(", ")}
                    </p>
                    <div className="text-[0.92rem]" dangerouslySetInnerHTML={{ __html: formatMarkdownish(s.description) }} />
                  </div>
                ) : null}
              </article>
            ))
          : (list as SrdItem[]).map((it) => (
              <article key={it.name} className="surface mb-2">
                <button type="button" className="w-full text-left px-4 py-3 flex justify-between" onClick={() => setOpen(open === it.name ? null : it.name)}>
                  <span className="font-[family-name:var(--font-cinzel)] text-[var(--gold)]">{it.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[0.68rem] uppercase text-[var(--veil)]">
                    {it.rarity}
                    {it.requiresAttunement ? " · Attunement" : ""}
                  </span>
                </button>
                {open === it.name ? (
                  <div className="px-4 pb-4 border-t border-dotted border-[var(--hairline)] pt-3">
                    <p className="text-xs text-[var(--ink-dim)] mb-2">
                      <b className="text-[var(--gold-dim)]">Type:</b> {it.type} · <b className="text-[var(--gold-dim)]">Rarity:</b> {it.rarity}
                      {it.requiresAttunement ? " (requires attunement)" : ""}
                    </p>
                    <div className="text-[0.92rem]" dangerouslySetInnerHTML={{ __html: formatMarkdownish(it.description) }} />
                  </div>
                ) : null}
              </article>
            ))}
        <p className="mt-12 pt-6 border-t border-[var(--hairline)] text-[0.72rem] text-[var(--ink-dim)] leading-relaxed">
          This work includes material from the System Reference Document 5.2.1 (&quot;SRD 5.2.1&quot;) by Wizards of the Coast LLC, available at{" "}
          <a className="text-[var(--veil)] underline" href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">
            dndbeyond.com/srd
          </a>
          . The SRD 5.2.1 is licensed under the{" "}
          <a className="text-[var(--veil)] underline" href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">
            Creative Commons Attribution 4.0 International License
          </a>
          .
        </p>
      </main>
    </MotionPage>
  );
}
