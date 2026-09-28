"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MotionPage, Rise, Stagger } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { ApiError, api, utcStamp } from "@/lib/api";
import type { MeUser, SessionCharacter, SessionDetail, SessionRoll } from "@/lib/types";

function SessionInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("id");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [characters, setCharacters] = useState<SessionCharacter[]>([]);
  const [rolls, setRolls] = useState<SessionRoll[]>([]);
  const [limit, setLimit] = useState(6);
  const [countForYou, setCountForYou] = useState(0);
  const [missing, setMissing] = useState(false);
  const [tableError, setTableError] = useState("");
  const meIdRef = useRef<number | null>(null);
  const charactersRef = useRef<SessionCharacter[]>([]);
  const hpInflight = useRef(new Set<number>());
  const hpChain = useRef(new Map<number, Promise<void>>());

  function rememberCharacters(next: SessionCharacter[]) {
    charactersRef.current = next;
    setCharacters(next);
  }

  async function load() {
    if (!sessionId) return;
    try {
      const meData = await api<{ user: MeUser }>("/api/me");
      meIdRef.current = meData.user.id;
    } catch {
      router.replace("/");
      return;
    }
    try {
      const s = await api<SessionDetail>(`/api/sessions/${sessionId}`);
      setSession(s);
      const [chars, log] = await Promise.all([
        api<{ characters: SessionCharacter[]; limit: number; countForYou: number }>(
          `/api/sessions/${sessionId}/characters`,
        ),
        api<{ rolls: SessionRoll[] }>(`/api/sessions/${sessionId}/rolls`),
      ]);
      setLimit(chars.limit);
      setCountForYou(chars.countForYou);
      const next = chars.characters.map((c) =>
        hpInflight.current.has(c.id)
          ? { ...c, hpCur: charactersRef.current.find((local) => local.id === c.id)?.hpCur ?? c.hpCur }
          : c,
      );
      rememberCharacters(next);
      setRolls(log.rolls);
      setMissing(false);
    } catch (err) {
      if (err instanceof ApiError) setMissing(true);
    }
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/api/sessions/${sessionId}/events`);

    function onRoll(ev: Event) {
      let message: { roll?: SessionRoll };
      try {
        message = JSON.parse((ev as MessageEvent).data) as { roll?: SessionRoll };
      } catch (err) {
        console.error("Could not read a shared roll", err);
        return;
      }
      const roll = message.roll;
      if (!roll) return;
      setRolls((prev) => (prev.some((r) => r.id === roll.id) ? prev : [roll, ...prev].slice(0, 40)));
    }

    function onCharacter(ev: Event) {
      let message: { character?: Omit<SessionCharacter, "isOwner"> };
      try {
        message = JSON.parse((ev as MessageEvent).data) as { character?: Omit<SessionCharacter, "isOwner"> };
      } catch (err) {
        console.error("Could not read a table update", err);
        return;
      }
      const character = message.character;
      if (!character) return;
      const existing = charactersRef.current.find((c) => c.id === character.id);
      const isOwner =
        meIdRef.current != null ? character.ownerId === meIdRef.current : (existing?.isOwner ?? false);
      const nextCharacter: SessionCharacter = { ...character, isOwner, conditions: character.conditions || "" };
      const prev = charactersRef.current;
      const exists = prev.some((c) => c.id === nextCharacter.id);
      const next = exists
        ? prev.map((c) => (c.id === nextCharacter.id ? { ...c, ...nextCharacter } : c))
        : [nextCharacter, ...prev];
      rememberCharacters(next);
    }

    function onRemoved(ev: Event) {
      let message: { characterId?: number };
      try {
        message = JSON.parse((ev as MessageEvent).data) as { characterId?: number };
      } catch (err) {
        console.error("Could not read a table update", err);
        return;
      }
      if (message.characterId == null) return;
      rememberCharacters(charactersRef.current.filter((c) => c.id !== message.characterId));
    }

    source.addEventListener("roll", onRoll);
    source.addEventListener("character", onCharacter);
    source.addEventListener("character-removed", onRemoved);
    const poll = window.setInterval(() => {
      void load();
    }, 4000);
    return () => {
      window.clearInterval(poll);
      source.close();
    };
  }, [sessionId]);

  if (!sessionId) {
    return <p className="text-center italic text-[var(--ink-dim)] py-20">No session selected.</p>;
  }
  if (missing) {
    return <p className="text-center text-[var(--danger)] py-20">Session not found.</p>;
  }

  async function createCharacter() {
    const res = await api<{ id: number; error?: string }>("/api/characters", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).catch((err: unknown) => {
      window.alert(err instanceof ApiError ? err.message : "Could not create.");
      return null;
    });
    if (res) router.push(`/sheet/?id=${res.id}`);
  }

  async function deleteCharacter(c: SessionCharacter) {
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    await api(`/api/characters/${c.id}`, { method: "DELETE" });
    await load();
  }

  async function removeMember(id: number, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from this session? Their characters here will be deleted (their account and other sessions are unaffected).`,
      )
    )
      return;
    try {
      await api(`/api/sessions/${sessionId}/members/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not remove.");
    }
  }

  async function regen() {
    if (!window.confirm("Regenerate the invite code? The old code will stop working immediately.")) return;
    const data = await api<{ inviteCode: string }>(`/api/sessions/${sessionId}/regenerate-code`, { method: "POST" });
    setSession((prev) => (prev ? { ...prev, inviteCode: data.inviteCode } : prev));
  }

  async function deleteSession() {
    if (!window.confirm("Delete this entire session, including every member's characters in it? This cannot be undone."))
      return;
    await api(`/api/sessions/${sessionId}`, { method: "DELETE" });
    router.push("/vault/");
  }

  function changeHp(id: number, delta: number) {
    const prev = hpChain.current.get(id) ?? Promise.resolve();
    const next = prev.then(() => adjustHp(id, delta));
    hpChain.current.set(
      id,
      next.catch((err: unknown) => {
        console.error("HP update failed", err);
      }),
    );
  }

  async function adjustHp(id: number, delta: number) {
    const current = charactersRef.current.find((c) => c.id === id);
    if (!current?.isOwner) return;
    const hpCur = Math.min(9999, Math.max(-999, current.hpCur + delta));
    rememberCharacters(charactersRef.current.map((c) => (c.id === id ? { ...c, hpCur } : c)));
    hpInflight.current.add(id);
    try {
      const saved = await api<{ updatedAt: string; hpCur: number; hpMax: number; ac: number; conditions: string }>(
        `/api/characters/${id}/vitals`,
        {
          method: "PATCH",
          headers: { "If-Match": current.updatedAt },
          body: JSON.stringify({ hpCur }),
        },
      );
      rememberCharacters(
        charactersRef.current.map((c) =>
          c.id === id
            ? { ...c, hpCur: saved.hpCur, hpMax: saved.hpMax, ac: saved.ac, conditions: saved.conditions, updatedAt: saved.updatedAt }
            : c,
        ),
      );
      setTableError("");
    } catch (err) {
      hpInflight.current.delete(id);
      setTableError(err instanceof ApiError ? err.message : "Could not update HP.");
      await load();
    } finally {
      hpInflight.current.delete(id);
    }
  }

  return (
    <MotionPage>
      <TopBar backHref="/vault/" backLabel="My Vault" />
      <main className="max-w-[1080px] mx-auto px-6 pb-16">
        <h1 className="font-[family-name:var(--font-cinzel)] text-[1.9rem] text-center text-[var(--gold)] pt-10 mb-2">
          {session?.name || "Loading…"}
        </h1>
        <p className="text-center text-sm text-[var(--ink-dim)] mb-8">The table — HP and dice update for everyone in this session.</p>
        {tableError ? <p className="text-center text-[var(--danger)] text-sm mb-4">{tableError}</p> : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
          <Stagger className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {characters.map((c) => {
              const ratio = c.hpMax > 0 ? Math.min(1, Math.max(0, c.hpCur / c.hpMax)) : 0;
              return (
                <Rise key={c.id}>
                  <article className="surface p-5 min-h-[180px] flex flex-col gap-2">
                    <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)]">{c.name}</h3>
                    <div className="font-[family-name:var(--font-mono)] text-[0.7rem] text-[var(--veil)]">
                      {c.isOwner ? "Yours" : `by ${c.ownerName}`}
                    </div>
                    <div className="flex items-end justify-between gap-3 mt-1">
                      <div className="min-w-0">
                        <div className="font-[family-name:var(--font-mono)] text-2xl leading-none">
                          {c.hpCur}
                          <span className="text-sm text-[var(--ink-dim)]"> / {c.hpMax}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-28 bg-[var(--hairline)]">
                          <div
                            className={`h-full ${ratio < 0.3 ? "bg-[var(--danger)]" : "bg-[var(--gold)]"}`}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                        <div className="font-[family-name:var(--font-cinzel)] text-[0.6rem] tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-1">
                          HP
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-[family-name:var(--font-mono)] text-2xl leading-none">{c.ac}</div>
                        <div className="font-[family-name:var(--font-cinzel)] text-[0.6rem] tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-1">
                          AC
                        </div>
                      </div>
                    </div>
                    {c.isOwner ? (
                      <div className="flex gap-2">
                        <button type="button" className="btn flex-1" onClick={() => changeHp(c.id, -1)} aria-label={`Damage ${c.name}`}>
                          −1 HP
                        </button>
                        <button type="button" className="btn flex-1" onClick={() => changeHp(c.id, 1)} aria-label={`Heal ${c.name}`}>
                          +1 HP
                        </button>
                      </div>
                    ) : null}
                    {c.conditions ? <p className="text-sm italic text-[var(--ink-dim)]">{c.conditions}</p> : null}
                    <div className="flex gap-2 mt-auto">
                      <button type="button" className="btn flex-1" onClick={() => router.push(`/sheet/?id=${c.id}`)}>
                        {c.isOwner ? "Open" : "View"}
                      </button>
                      {c.isOwner || session?.isAdmin ? (
                        <button type="button" className="btn btn-danger flex-1" onClick={() => void deleteCharacter(c)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                </Rise>
              );
            })}
            {countForYou < limit ? (
              <>
                <Rise>
                  <button type="button" className="surface min-h-[180px] w-full border-dashed uppercase tracking-wide text-[var(--ink-dim)] hover:text-[var(--gold)]" onClick={() => void createCharacter()}>
                    + New Character
                  </button>
                </Rise>
                <Rise>
                  <button
                    type="button"
                    className="surface min-h-[180px] w-full border-dashed uppercase tracking-wide text-[var(--ink-dim)] hover:text-[var(--gold)]"
                    onClick={() => router.push(`/import/?sessionId=${sessionId}`)}
                  >
                    Import from PDF
                  </button>
                </Rise>
              </>
            ) : null}
          </Stagger>
          <aside className="surface p-4 lg:sticky lg:top-4">
            <h2 className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.08em] uppercase text-[var(--gold-dim)] mb-3">
              Dice log
            </h2>
            {rolls.length === 0 ? (
              <p className="text-sm italic text-[var(--ink-dim)]">Rolls from open character sheets land here.</p>
            ) : (
              <ol className="max-h-[480px] overflow-y-auto">
                {rolls.map((roll) => (
                  <li key={roll.id} className="py-2 border-b border-dotted border-[var(--hairline)] text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--gold)]">{roll.displayName}</span>
                      <span className="font-[family-name:var(--font-mono)] text-[var(--ink)]">{roll.total}</span>
                    </div>
                    <div className="text-[var(--ink-dim)]">
                      {roll.characterName ? `${roll.characterName} — ` : ""}
                      {roll.label}
                    </div>
                    <div className="font-[family-name:var(--font-mono)] text-[0.7rem] text-[var(--veil)]">{roll.detail}</div>
                    <div className="text-[0.7rem] text-[var(--ink-dim)]">{utcStamp(roll.createdAt).toLocaleTimeString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
        {countForYou >= limit ? (
          <p className="text-center text-[var(--ink-dim)] text-sm mt-3">You&apos;ve reached the limit of {limit} characters in this session.</p>
        ) : null}

        {session?.isAdmin ? (
          <section className="surface mt-10 p-5 border-[var(--gold-dim)]">
            <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] mb-3">Session Admin</h3>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span>Invite code:</span>
              <span className="font-[family-name:var(--font-mono)] text-[var(--gold)] text-lg">{session.inviteCode}</span>
              <button type="button" className="btn" onClick={() => void regen()}>
                Regenerate
              </button>
            </div>
            {(session.members || []).map((m) => (
              <div key={m.id} className="flex justify-between items-center py-2 border-b border-dotted border-[var(--hairline)]">
                <span>{m.displayName}</span>
                <button type="button" className="btn btn-danger text-[0.6rem]" onClick={() => void removeMember(m.id, m.displayName)}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-danger mt-4" onClick={() => void deleteSession()}>
              Delete this session
            </button>
          </section>
        ) : null}
      </main>
    </MotionPage>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<p className="text-center py-20 text-[var(--ink-dim)]">Loading…</p>}>
      <SessionInner />
    </Suspense>
  );
}
