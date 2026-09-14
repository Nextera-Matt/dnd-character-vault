"use client";

import { useMemo, useState } from "react";
import { MotionPage } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { GLOSSARY } from "@/lib/glossary-data";

const ORDER = ["Ability", "Skill", "Condition", "Rule"] as const;

export default function GlossaryPage() {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [...GLOSSARY];
    return GLOSSARY.filter(
      (d) => d.term.toLowerCase().includes(needle) || d.desc.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <MotionPage>
      <TopBar backHref="/vault/" backLabel="My Vault" />
      <main className="max-w-[760px] mx-auto px-6 py-10 pb-16">
        <h1 className="font-[family-name:var(--font-cinzel)] text-center text-[var(--gold)] text-3xl mb-6">
          Rules Glossary
        </h1>
        <input
          className="w-full bg-[var(--bg-raised)] border border-[var(--hairline)] px-4 py-3 mb-8"
          placeholder="Search skills, abilities, conditions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {matches.length === 0 ? <p className="text-center italic text-[var(--ink-dim)]">Nothing matches that.</p> : null}
        {ORDER.map((group) => {
          const items = matches.filter((d) => d.cat.startsWith(group));
          if (!items.length) return null;
          const label =
            group === "Skill" ? "Skills" : group === "Ability" ? "Abilities" : group === "Condition" ? "Conditions" : "Rules";
          return (
            <section key={group}>
              <h2 className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-8 mb-4">
                {label}
              </h2>
              {items.map((d) => (
                <article key={d.term} className="mb-4 pl-4 border-l-2 border-[var(--veil)]">
                  <div className="font-[family-name:var(--font-mono)] text-[0.68rem] uppercase text-[var(--veil)]">{d.cat}</div>
                  <div className="font-[family-name:var(--font-cinzel)] text-[var(--gold)]">{d.term}</div>
                  <p className="m-0 mt-1 text-[0.95rem] text-[var(--ink-dim)]">{d.desc}</p>
                </article>
              ))}
            </section>
          );
        })}
      </main>
    </MotionPage>
  );
}
