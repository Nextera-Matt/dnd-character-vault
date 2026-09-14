"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { DiceTray, type DiceHandle } from "@/components/DiceTray";
import { MotionPage } from "@/components/Motion";
import { ThemeSwitcher } from "@/components/ThemeProvider";
import { ApiError, api } from "@/lib/api";
import {
  LANGUAGE_LIST,
  SKILL_LIST,
  WEAPON_LIST,
  derivedInit,
  derivedSkillVal,
  fmtMod,
  initIsAuto,
  mod,
  normalizeSlots,
  ordinal,
  parseModifier,
  skillIsAuto,
} from "@/lib/sheet";
import type { Attack, CharacterData, CharacterPayload, SessionSummary, SpellCard } from "@/lib/types";

export default function CharacterSheet({ charId }: { charId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<CharacterPayload | null>(null);
  const [state, setState] = useState<CharacterData | null>(null);
  const [saveLabel, setSaveLabel] = useState("loading…");
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<{ id: number; savedAt: string }[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [moveTo, setMoveTo] = useState("");
  const [mode, setMode] = useState<"chronicle" | "table">("chronicle");
  const [page, setPage] = useState("vitals");
  const dice = useRef<DiceHandle | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const stateRef = useRef<CharacterData | null>(null);
  const ownerRef = useRef(true);
  const updatedAtRef = useRef("");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function scheduleSave(next: CharacterData) {
    if (!ownerRef.current) return;
    setSaveLabel("saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(next), 500);
  }

  function patch(mutator: (draft: CharacterData) => void) {
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mutator(next);
      scheduleSave(next);
      return next;
    });
  }

  async function doSave(data: CharacterData) {
    if (inFlight.current) {
      saveTimer.current = setTimeout(() => void doSave(stateRef.current || data), 300);
      return;
    }
    inFlight.current = true;
    try {
      const saved = await api<{ ok: boolean; updatedAt: string }>(`/api/characters/${charId}`, {
        method: "PUT",
        headers: updatedAtRef.current ? { "If-Match": updatedAtRef.current } : undefined,
        body: JSON.stringify(data),
      });
      if (saved.updatedAt) updatedAtRef.current = saved.updatedAt;
      setSaveLabel("saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveLabel("saved elsewhere — reloading");
        try {
          const p = await api<CharacterPayload>(`/api/characters/${charId}`);
          updatedAtRef.current = p.updatedAt;
          setPayload(p);
          setState({ ...p.data, attacks: p.data.attacks || [], slots: normalizeSlots(p.data.slots) });
          setSaveLabel("reloaded");
        } catch {
          setSaveLabel("conflict — reload the page");
        }
        return;
      }
      setSaveLabel("save failed — retrying");
      saveTimer.current = setTimeout(() => void doSave(stateRef.current || data), 2000);
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api("/api/me");
      } catch {
        router.replace("/");
        return;
      }
      try {
        const p = await api<CharacterPayload>(`/api/characters/${charId}`);
        if (cancelled) return;
        const data = { ...p.data, attacks: p.data.attacks || [], slots: normalizeSlots(p.data.slots) };
        ownerRef.current = p.isOwner;
        updatedAtRef.current = p.updatedAt;
        setPayload(p);
        setState(data);
        setSaveLabel(p.isOwner ? "saved" : "");
        if (p.isOwner) {
          const sess = await api<{ sessions: SessionSummary[] }>("/api/sessions");
          setSessions(sess.sessions.filter((s) => s.id !== p.sessionId));
        }
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 404
            ? "Character not found, or you don't have access to it."
            : "Could not load this character.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [charId, router]);

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (["vitals", "attacks", "spells", "gear", "story"].includes(fromHash)) setPage(fromHash);
  }, []);

  if (error) return <p className="text-center text-[var(--danger)] py-20">{error}</p>;
  if (!state || !payload) return <p className="text-center text-[var(--ink-dim)] py-20">Loading…</p>;

  const isOwner = payload.isOwner;
  const slots = Array.isArray(state.slots) ? state.slots : normalizeSlots(state.slots);

  return (
    <MotionPage>
      <nav className="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-2 border-b border-[var(--hairline)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-3 backdrop-blur-md">
        <Link href={`/session/?id=${payload.sessionId}`} className="btn">
          ← {payload.sessionName}
        </Link>
        <Link href="/compendium/" className="btn">
          Compendium
        </Link>
        <Link href="/glossary/" className="btn">
          Glossary
        </Link>
        <ThemeSwitcher />
        <button
          type="button"
          className="btn"
          onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = (state.charName || "character").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export JSON
        </button>
        {isOwner ? (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const opening = !historyOpen;
              setHistoryOpen(opening);
              if (!opening) return;
              const v = await api<{ versions: { id: number; savedAt: string }[] }>(`/api/characters/${charId}/versions`);
              setVersions(v.versions);
            }}
          >
            History
          </button>
        ) : null}
        {isOwner && sessions.length ? (
          <span className="inline-flex items-center gap-2">
            <select
              className="bg-[var(--bg-raised)] border border-[var(--hairline)] text-xs px-2 py-1"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              <option value="">Move to…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!moveTo) return;
                const name = sessions.find((s) => String(s.id) === moveTo)?.name || "";
                if (!window.confirm(`Move this character to "${name}"? Members of its current session will no longer be able to see it.`))
                  return;
                try {
                  await api(`/api/characters/${charId}/move`, {
                    method: "PUT",
                    body: JSON.stringify({ targetSessionId: moveTo }),
                  });
                  router.push(`/session/?id=${moveTo}`);
                } catch (err) {
                  window.alert(err instanceof ApiError ? err.message : "Could not move.");
                }
              }}
            >
              Move
            </button>
          </span>
        ) : null}
        <span className="font-[family-name:var(--font-mono)] text-[0.68rem] text-[var(--ink-dim)]">{saveLabel}</span>
        <button
          type="button"
          className={`btn ${mode === "table" ? "btn-primary" : ""}`}
          onClick={() => setMode(mode === "table" ? "chronicle" : "table")}
        >
          {mode === "table" ? "Chronicle" : "At the table"}
        </button>
      </nav>

      {!isOwner ? (
        <div className="text-center py-2 border-b border-[var(--veil)] text-sm text-[var(--veil)] bg-[var(--bg-raised)]">
          Viewing {payload.ownerName}&apos;s character — read only
        </div>
      ) : null}

      {historyOpen ? (
        <div className="max-w-[760px] mx-auto px-6 py-4 border-b border-[var(--hairline)] bg-[var(--bg-raised)]">
          <div className="font-[family-name:var(--font-cinzel)] text-xs uppercase tracking-[0.1em] text-[var(--gold-dim)] mb-2">
            Version History
          </div>
          {versions.length === 0 ? (
            <p className="italic text-[var(--ink-dim)] text-sm">
              No earlier checkpoints yet — one gets saved automatically the first time you make an edit, and roughly every 10 minutes of active editing after that.
            </p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex justify-between items-center py-2 border-b border-dotted border-[var(--hairline)] text-sm">
                <span>{new Date(v.savedAt + "Z").toLocaleString()}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Restore the character to this earlier version? Your current state will itself be saved as a checkpoint first, so this can be undone.",
                      )
                    )
                      return;
                    const restored = await api<{ data: CharacterData }>(
                      `/api/characters/${charId}/versions/${v.id}/restore`,
                      { method: "POST" },
                    );
                    const data = {
                      ...restored.data,
                      attacks: restored.data.attacks || [],
                      slots: normalizeSlots(restored.data.slots),
                    };
                    setState(data);
                    try {
                      const fresh = await api<CharacterPayload>(`/api/characters/${charId}`);
                      updatedAtRef.current = fresh.updatedAt;
                    } catch {
                      updatedAtRef.current = "";
                    }
                    setHistoryOpen(false);
                    setSaveLabel("saved");
                  }}
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      <header className={`text-center pt-14 pb-8 px-6 relative overflow-hidden ${mode === "table" ? "pt-8 pb-4" : ""}`}>
        <h1 className="font-[family-name:var(--font-cinzel)] text-[clamp(2rem,6vw,3rem)] text-[var(--gold)]">
          <span
            className="inline-block min-w-[200px] outline-none"
            contentEditable={isOwner}
            suppressContentEditableWarning
            aria-label="Character name"
            onInput={(e) => patch((d) => { d.charName = e.currentTarget.textContent || ""; })}
          >
            {state.charName}
          </span>
        </h1>
        {mode === "chronicle" ? (
        <div
          className="mt-2 italic text-[var(--ink-dim)] text-[1.1rem] outline-none"
          contentEditable={isOwner}
          suppressContentEditableWarning
          aria-label="Character subtitle"
          dangerouslySetInnerHTML={{ __html: state.subtitle }}
          onInput={(e) => patch((d) => { d.subtitle = e.currentTarget.innerHTML; })}
        />
        ) : null}
        <div className={`flex justify-center flex-wrap max-w-[640px] mx-auto mt-8 border border-[var(--hairline)] bg-[var(--bg-raised)] ${mode === "table" ? "max-w-[920px] mt-4" : ""}`}>
          <Vital label="AC" disabled={!isOwner} value={state.vitals.ac} onChange={(n) => patch((d) => { d.vitals.ac = n; })} huge={mode === "table"} />
          <div className={`flex-1 min-w-[90px] text-center py-4 border-r border-[var(--hairline)] ${mode === "table" ? "min-w-[160px] py-6" : ""}`}>
            <div className={`font-[family-name:var(--font-mono)] flex justify-center gap-1 ${mode === "table" ? "text-5xl" : "text-[1.6rem]"}`}>
              <input className={`${mode === "table" ? "w-20" : "w-10"} text-center ghost-input`} type="number" disabled={!isOwner} aria-label="Current HP" value={state.vitals.hpCur} onChange={(e) => patch((d) => { d.vitals.hpCur = Number(e.target.value) || 0; })} />
              /
              <input className={`${mode === "table" ? "w-20" : "w-10"} text-center ghost-input`} type="number" disabled={!isOwner} aria-label="Max HP" value={state.vitals.hpMax} onChange={(e) => patch((d) => { d.vitals.hpMax = Number(e.target.value) || 0; })} />
            </div>
            <div className="font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.12em] uppercase text-[var(--gold-dim)]">HP</div>
          </div>
          <Vital label="Speed" disabled={!isOwner} value={state.vitals.speed} onChange={(n) => patch((d) => { d.vitals.speed = n; })} huge={mode === "table"} />
          <div className={`flex-1 min-w-[90px] text-center py-4 border-r border-[var(--hairline)] ${mode === "table" ? "min-w-[140px] py-6" : ""}`}>
            <input
              className={`font-[family-name:var(--font-mono)] text-center ghost-input ${mode === "table" ? "text-4xl" : "text-[1.6rem]"}`}
              disabled={!isOwner || initIsAuto(state.vitals)}
              aria-label="Initiative"
              value={initIsAuto(state.vitals) ? derivedInit(state.abilities) : state.vitals.init}
              onChange={(e) => patch((d) => { d.vitals.init = e.target.value; })}
            />
            <div className="font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.12em] uppercase text-[var(--gold-dim)]">Init</div>
            {isOwner ? (
              <label className="block text-[0.62rem] text-[var(--ink-dim)] mt-1">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={initIsAuto(state.vitals)}
                  onChange={(e) =>
                    patch((d) => {
                      d.vitals.initOverride = !e.target.checked;
                      if (e.target.checked) d.vitals.init = derivedInit(d.abilities);
                    })
                  }
                />
                Auto
              </label>
            ) : null}
          </div>
          <Vital last label="Prof" disabled={!isOwner} value={state.vitals.prof} onChange={(n) => patch((d) => { d.vitals.prof = n; })} huge={mode === "table"} />
        </div>
      </header>

      <main className={`max-w-[760px] mx-auto px-6 pb-24 ${mode === "table" ? "max-w-[920px] table-hud" : "book-stage"}`}>
        {mode === "chronicle" ? (
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {[
              ["vitals", "I. Vitals"],
              ["attacks", "II. Combat"],
              ["spells", "III. Spells"],
              ["gear", "IV. Gear"],
              ["story", "V. Journal"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={`btn ${page === id ? "btn-primary" : ""}`}
                onClick={() => setPage(id)}
              >
                {label}
              </a>
            ))}
          </div>
        ) : null}
        <section id="vitals" className={`py-12 border-b border-[var(--hairline)] book-page ${mode === "chronicle" && page !== "vitals" ? "book-page-hidden" : ""}`}>
          <Eyebrow>I. Vitals & Traits</Eyebrow>
          <h2 className="font-[family-name:var(--font-cinzel)] text-[1.6rem] text-[var(--gold)] mb-6">Body & Bearing</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(90px,1fr))] gap-3 mb-8">
            {state.abilities.map((a, i) => {
              const m = mod(a.score);
              const saveVal = m + (a.save ? Number(state.vitals.prof) : 0);
              return (
                <div key={a.key} className="surface text-center p-4">
                  <div className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.1em] text-[var(--gold-dim)]">{a.key}</div>
                  <input
                    className="font-[family-name:var(--font-mono)] text-[1.5rem] text-center ghost-input"
                    type="number"
                    disabled={!isOwner}
                    value={a.score}
                    onChange={(e) => patch((d) => { d.abilities[i].score = Number(e.target.value) || 0; })}
                  />
                  <div className="font-[family-name:var(--font-mono)] text-sm text-[var(--veil)]">{fmtMod(m)}</div>
                  <button type="button" className="btn text-[0.68rem] mt-1 px-1 py-0.5" onClick={() => dice.current?.rollD20(m, a.key)}>
                    Roll
                  </button>
                  {isOwner ? (
                    <button
                      type="button"
                      className={`btn text-[0.55rem] mt-1 ${a.save ? "border-[var(--danger)] text-[var(--danger)]" : ""}`}
                      onClick={() => patch((d) => { d.abilities[i].save = !d.abilities[i].save; })}
                    >
                      {a.save ? "Save" : "Save?"}
                    </button>
                  ) : null}
                  {a.save ? (
                    <>
                      <div className="font-[family-name:var(--font-mono)] text-xs text-[var(--danger)] mt-1">Save {fmtMod(saveVal)}</div>
                      <button type="button" className="btn text-[0.68rem] mt-1 px-1 py-0.5" onClick={() => dice.current?.rollD20(saveVal, a.key + " Save")}>
                        Save roll
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] mb-2">Skills</h3>
              {state.skills.map((sk, i) => {
                const auto = skillIsAuto(sk);
                const shown = auto ? derivedSkillVal(state.abilities, state.vitals.prof, sk) : sk.val;
                return (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-dotted border-[var(--hairline)]">
                  <AutocompleteInput
                    value={sk.name}
                    options={SKILL_LIST}
                    className="ghost-input flex-1"
                    onChange={(v) => patch((d) => { d.skills[i].name = v; })}
                  />
                  <label className="text-[0.62rem] text-[var(--ink-dim)] whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="mr-1"
                      disabled={!isOwner}
                      checked={!!sk.proficient}
                      onChange={(e) => patch((d) => { d.skills[i].proficient = e.target.checked; })}
                    />
                    Prof
                  </label>
                  <input
                    className="w-12 text-right font-[family-name:var(--font-mono)] ghost-input"
                    disabled={!isOwner || auto}
                    aria-label={`${sk.name} bonus`}
                    value={shown}
                    onChange={(e) => patch((d) => { d.skills[i].val = e.target.value; })}
                  />
                  <label className="text-[0.62rem] text-[var(--ink-dim)] whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="mr-1"
                      disabled={!isOwner}
                      checked={auto}
                      onChange={(e) =>
                        patch((d) => {
                          d.skills[i].override = !e.target.checked;
                          if (e.target.checked) d.skills[i].val = derivedSkillVal(d.abilities, d.vitals.prof, d.skills[i]);
                        })
                      }
                    />
                    Auto
                  </label>
                  <button type="button" className="btn text-[0.68rem] px-1 py-0.5" onClick={() => dice.current?.rollD20(parseModifier(shown), sk.name)}>
                    Roll
                  </button>
                  {isOwner ? (
                    <button type="button" className="text-[var(--hairline)] hover:text-[var(--danger)]" onClick={() => patch((d) => { d.skills.splice(i, 1); })}>
                      ×
                    </button>
                  ) : null}
                </div>
                );
              })}
              {isOwner ? (
                <button type="button" className="btn w-full mt-2 border-dashed" onClick={() => patch((d) => { d.skills.push({ name: "New Skill", val: "+0", proficient: false, override: false }); })}>
                  + Add skill
                </button>
              ) : null}
            </div>
            <div>
              <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] mb-2">Languages</h3>
              {state.languages.map((lang, i) => (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-dotted border-[var(--hairline)]">
                  <AutocompleteInput
                    value={lang}
                    options={LANGUAGE_LIST}
                    onChange={(v) => patch((d) => { d.languages[i] = v; })}
                  />
                  {isOwner ? (
                    <button type="button" className="text-[var(--hairline)] hover:text-[var(--danger)]" onClick={() => patch((d) => { d.languages.splice(i, 1); })}>
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {isOwner ? (
                <button type="button" className="btn w-full mt-2 border-dashed" onClick={() => patch((d) => { d.languages.push("New Language"); })}>
                  + Add language
                </button>
              ) : null}
            </div>
          </div>
          <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] mt-8 mb-3">Traits & Features</h3>
          {state.traits.map((t, i) => (
            <div key={i} className="mb-4 pl-4 border-l-2 border-[var(--veil)] relative">
              {isOwner ? (
                <button type="button" className="absolute top-0 right-0 text-[var(--hairline)]" onClick={() => patch((d) => { d.traits.splice(i, 1); })}>
                  ×
                </button>
              ) : null}
              <div
                className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] outline-none"
                contentEditable={isOwner}
                suppressContentEditableWarning
                onInput={(e) => patch((d) => { d.traits[i].title = e.currentTarget.textContent || ""; })}
              >
                {t.title}
              </div>
              <p
                className="m-0 mt-1 text-[var(--ink-dim)] outline-none"
                contentEditable={isOwner}
                suppressContentEditableWarning
                onInput={(e) => patch((d) => { d.traits[i].body = e.currentTarget.textContent || ""; })}
              >
                {t.body}
              </p>
            </div>
          ))}
          {isOwner ? (
            <button type="button" className="btn w-full border-dashed" onClick={() => patch((d) => { d.traits.push({ title: "New Trait", body: "" }); })}>
              + Add trait
            </button>
          ) : null}
        </section>

        <section id="attacks" className={`py-12 border-b border-[var(--hairline)] book-page ${mode === "chronicle" && page !== "attacks" ? "book-page-hidden" : ""}`}>
          <h2 className="font-[family-name:var(--font-cinzel)] text-[1.6rem] text-[var(--gold)] mb-6">Attacks</h2>
          {(state.attacks || []).map((a, i) => (
            <AttackRow
              key={i}
              attack={a}
              isOwner={isOwner}
              onChange={(next) => patch((d) => { d.attacks![i] = next; })}
              onRemove={() => patch((d) => { d.attacks!.splice(i, 1); })}
              onHit={() => dice.current?.rollD20(parseModifier(a.bonus), a.name + " — to hit")}
              onDmg={() => dice.current?.rollDamage(a.damage, a.name + " — damage")}
            />
          ))}
          {isOwner ? (
            <button type="button" className="btn w-full border-dashed" onClick={() => patch((d) => { d.attacks = d.attacks || []; d.attacks.push({ name: "New Attack", bonus: "+0", damage: "1d6", range: "" }); })}>
              + Add attack
            </button>
          ) : null}
        </section>

        <section id="spells" className={`py-12 border-b border-[var(--hairline)] book-page ${mode === "chronicle" && page !== "spells" ? "book-page-hidden" : ""}`}>
          <h2 className="font-[family-name:var(--font-cinzel)] text-[1.6rem] text-[var(--gold)] mb-6">Spells & Slots</h2>
          {slots.map((tier, tierIdx) => (
            <div key={tier.level} className="flex flex-wrap items-center gap-2 mb-2 font-[family-name:var(--font-cinzel)] text-xs uppercase tracking-[0.08em] text-[var(--gold-dim)]">
              <span>{ordinal(tier.level)} Level</span>
              {Array.from({ length: tier.total }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!isOwner}
                  className={`w-3.5 h-3.5 border-[1.5px] border-[var(--gold)] ${i < tier.used ? "bg-[var(--gold)]" : "bg-transparent"}`}
                  style={{ clipPath: "polygon(50% 0%, 100% 35%, 78% 100%, 22% 100%, 0% 35%)" }}
                  aria-label={`${ordinal(tier.level)} level slot ${i + 1} ${i < tier.used ? "used" : "available"}`}
                  onClick={() =>
                    patch((d) => {
                      const t = (d.slots as typeof slots)[tierIdx];
                      t.used = i < t.used ? i : i + 1;
                    })
                  }
                />
              ))}
              {isOwner ? (
                <>
                  <button type="button" className="btn text-[0.6rem] py-0.5" onClick={() => patch((d) => { const t = (d.slots as typeof slots)[tierIdx]; if (t.total > 0) { t.total--; t.used = Math.min(t.used, t.total); } })}>
                    −slot
                  </button>
                  <button type="button" className="btn text-[0.6rem] py-0.5" onClick={() => patch((d) => { (d.slots as typeof slots)[tierIdx].total++; })}>
                    +slot
                  </button>
                  {slots.length > 1 ? (
                    <button type="button" className="btn text-[0.6rem] py-0.5" onClick={() => patch((d) => { (d.slots as typeof slots).splice(tierIdx, 1); })}>
                      remove tier
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
          {isOwner ? (
            <button
              type="button"
              className="btn w-full border-dashed mt-2"
              onClick={() =>
                patch((d) => {
                  const current = d.slots as typeof slots;
                  const nextLevel = current.length ? Math.max(...current.map((t) => t.level)) + 1 : 1;
                  current.push({ level: nextLevel, total: 0, used: 0 });
                })
              }
            >
              + Add spell level tier
            </button>
          ) : null}
          <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] mt-6 mb-3">Cantrips</h3>
          <SpellGrid
            items={state.cantrips}
            isOwner={isOwner}
            onChange={(i, field, value) => patch((d) => { d.cantrips[i][field] = value; })}
            onRemove={(i) => patch((d) => { d.cantrips.splice(i, 1); })}
          />
          {isOwner ? (
            <button type="button" className="btn w-full border-dashed" onClick={() => patch((d) => { d.cantrips.push({ name: "New Cantrip", tag: "Custom" }); })}>
              + Add cantrip
            </button>
          ) : null}
          <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] mt-8 mb-3">Prepared / Known Spells</h3>
          <SpellGrid
            items={state.prepared}
            isOwner={isOwner}
            onChange={(i, field, value) => patch((d) => { d.prepared[i][field] = value; })}
            onRemove={(i) => patch((d) => { d.prepared.splice(i, 1); })}
          />
          {isOwner ? (
            <button type="button" className="btn w-full border-dashed" onClick={() => patch((d) => { d.prepared.push({ name: "New Spell", tag: "Custom" }); })}>
              + Add spell
            </button>
          ) : null}
        </section>

        <section id="gear" className={`py-12 border-b border-[var(--hairline)] book-page ${mode === "table" || (mode === "chronicle" && page !== "gear") ? "book-page-hidden" : ""}`}>
          <h2 className="font-[family-name:var(--font-cinzel)] text-[1.6rem] text-[var(--gold)] mb-6">What I Carry</h2>
          {state.gear.map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-2 border-b border-dotted border-[var(--hairline)]">
              <span
                className="flex-1 outline-none"
                contentEditable={isOwner}
                suppressContentEditableWarning
                onInput={(e) => patch((d) => { d.gear[i] = e.currentTarget.textContent || ""; })}
              >
                {item}
              </span>
              {isOwner ? (
                <button type="button" onClick={() => patch((d) => { d.gear.splice(i, 1); })}>
                  ×
                </button>
              ) : null}
            </div>
          ))}
          {isOwner ? (
            <button type="button" className="btn w-full border-dashed mt-2" onClick={() => patch((d) => { d.gear.push("New Item"); })}>
              + Add item
            </button>
          ) : null}
          <div className="mt-4 inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-[var(--gold)] border border-[var(--gold-dim)] px-3 py-1">
            GP
            <input className="w-16 text-right ghost-input" type="number" disabled={!isOwner} value={state.vitals.gold} onChange={(e) => patch((d) => { d.vitals.gold = Number(e.target.value) || 0; })} />
          </div>
        </section>

        <section id="story" className={`py-12 book-page ${mode === "table" || (mode === "chronicle" && page !== "story") ? "book-page-hidden" : ""}`}>
          <h2 className="font-[family-name:var(--font-cinzel)] text-[1.6rem] text-[var(--gold)] mb-6">Notes from the Journal</h2>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 mb-8">
            {(["trait", "ideal", "bond", "flaw"] as const).map((k) => (
              <div key={k}>
                <div className="font-[family-name:var(--font-cinzel)] text-[0.66rem] tracking-[0.1em] uppercase text-[var(--gold-dim)] mb-1">
                  {k}
                </div>
                <p
                  className="m-0 text-[var(--ink-dim)] outline-none"
                  contentEditable={isOwner}
                  suppressContentEditableWarning
                  onInput={(e) => patch((d) => { d.quad[k] = e.currentTarget.textContent || ""; })}
                >
                  {state.quad[k]}
                </p>
              </div>
            ))}
          </div>
          <div
            className="text-[1.05rem] outline-none first-letter:font-[family-name:var(--font-cinzel)] first-letter:text-5xl first-letter:float-left first-letter:pr-2 first-letter:text-[var(--gold)]"
            contentEditable={isOwner}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: state.backstoryHTML }}
            onInput={(e) => patch((d) => { d.backstoryHTML = e.currentTarget.innerHTML; })}
          />
        </section>
      </main>
      <footer className="text-center py-10 text-[var(--hairline)] font-[family-name:var(--font-mono)] text-xs tracking-[0.08em]">
        Character Vault
      </footer>
      <DiceTray handleRef={dice} />
    </MotionPage>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-[family-name:var(--font-cinzel)] text-[0.7rem] tracking-[0.18em] uppercase text-[var(--gold-dim)] flex items-center gap-3 mb-2">
      {children}
      <span className="flex-1 h-px bg-[var(--hairline)]" />
    </div>
  );
}

function Vital({
  label,
  value,
  onChange,
  disabled,
  last,
  huge,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
  last?: boolean;
  huge?: boolean;
}) {
  return (
    <div className={`flex-1 min-w-[90px] text-center py-4 ${last ? "" : "border-r border-[var(--hairline)]"} ${huge ? "min-w-[140px] py-6" : ""}`}>
      <input
        className={`font-[family-name:var(--font-mono)] text-center ghost-input ${huge ? "text-4xl" : "text-[1.6rem]"}`}
        type="number"
        disabled={disabled}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <div className="font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.12em] uppercase text-[var(--gold-dim)]">{label}</div>
    </div>
  );
}

function AttackRow({
  attack,
  isOwner,
  onChange,
  onRemove,
  onHit,
  onDmg,
}: {
  attack: Attack;
  isOwner: boolean;
  onChange: (a: Attack) => void;
  onRemove: () => void;
  onHit: () => void;
  onDmg: () => void;
}) {
  return (
    <div className="surface p-4 mb-3 relative">
      {isOwner ? (
        <button type="button" className="absolute top-1 right-2" onClick={onRemove}>
          ×
        </button>
      ) : null}
      <AutocompleteInput
        value={attack.name}
        options={WEAPON_LIST}
        className="ghost-input border-b border-dotted border-[var(--hairline)] w-[calc(100%-1.5rem)]"
        onChange={(v) => onChange({ ...attack, name: v })}
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <input className="w-12 text-center font-[family-name:var(--font-mono)] ghost-input" disabled={!isOwner} value={attack.bonus} onChange={(e) => onChange({ ...attack, bonus: e.target.value })} title="To-hit bonus" />
        <input className="w-20 text-center font-[family-name:var(--font-mono)] ghost-input" disabled={!isOwner} value={attack.damage} onChange={(e) => onChange({ ...attack, damage: e.target.value })} title="Damage dice" />
        <input className="flex-1 min-w-[7rem] ghost-input border-b border-dotted border-[var(--hairline)] text-sm text-[var(--ink-dim)]" disabled={!isOwner} placeholder="Range / properties" value={attack.range || ""} onChange={(e) => onChange({ ...attack, range: e.target.value })} />
        <button type="button" className="btn text-[0.68rem] py-0.5" onClick={onHit}>
          Hit
        </button>
        <button type="button" className="btn text-[0.68rem] py-0.5" onClick={onDmg}>
          Dmg
        </button>
      </div>
    </div>
  );
}

function SpellGrid({
  items,
  isOwner,
  onChange,
  onRemove,
}: {
  items: SpellCard[];
  isOwner: boolean;
  onChange: (i: number, field: keyof SpellCard, value: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 mb-3">
      {items.map((s, i) => (
        <div key={i} className="surface p-3 relative">
          {isOwner ? (
            <button type="button" className="absolute top-1 right-2" onClick={() => onRemove(i)}>
              ×
            </button>
          ) : null}
          <div className="font-[family-name:var(--font-cinzel)] outline-none" contentEditable={isOwner} suppressContentEditableWarning onInput={(e) => onChange(i, "name", e.currentTarget.textContent || "")}>
            {s.name}
          </div>
          <div className="font-[family-name:var(--font-mono)] text-[0.66rem] uppercase text-[var(--veil)] outline-none" contentEditable={isOwner} suppressContentEditableWarning onInput={(e) => onChange(i, "tag", e.currentTarget.textContent || "")}>
            {s.tag}
          </div>
          <div className="text-sm text-[var(--ink-dim)] mt-1 min-h-[1.1em] outline-none" contentEditable={isOwner} suppressContentEditableWarning onInput={(e) => onChange(i, "info", e.currentTarget.textContent || "")}>
            {s.info || ""}
          </div>
        </div>
      ))}
    </div>
  );
}
