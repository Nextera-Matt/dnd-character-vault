"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionPage, Rise, Stagger } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { ApiError, api, utcStamp } from "@/lib/api";
import type { MeUser, SessionSummary, VaultCharacter } from "@/lib/types";

export default function VaultPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [characters, setCharacters] = useState<VaultCharacter[]>([]);
  const [invite, setInvite] = useState("");
  const [joinError, setJoinError] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const meData = await api<{ user: MeUser }>("/api/me");
      setMe(meData.user);
      const [sess, vault] = await Promise.all([
        api<{ sessions: SessionSummary[] }>("/api/sessions"),
        api<{ characters: VaultCharacter[] }>("/api/vault"),
      ]);
      setSessions(sess.sessions);
      setCharacters(vault.characters);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSession() {
    const name = sessionName.trim();
    if (!name) return;
    const data = await api<{ id: number; inviteCode: string }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    setSessionName("");
    window.alert(`Session created. Invite code: ${data.inviteCode}\n\nShare this with your players.`);
    router.push(`/session/?id=${data.id}`);
  }

  async function joinSession() {
    setJoinError("");
    const inviteCode = invite.trim();
    if (!inviteCode) return;
    try {
      const data = await api<{ session: { id: number } }>("/api/join-session", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      router.push(`/session/?id=${data.session.id}`);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function deleteCharacter(c: VaultCharacter) {
    if (!window.confirm(`Delete "${c.name}" from ${c.sessionName}? This cannot be undone.`)) return;
    await api(`/api/characters/${c.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <MotionPage>
      <TopBar name={me?.displayName} isSiteAdmin={me?.isSiteAdmin} />
      <main className="max-w-[760px] mx-auto px-6 pb-16">
        <p className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-10 mb-4">
          Your sessions
        </p>
        {sessions.length === 0 ? (
          <p className="italic text-[var(--ink-dim)] text-center py-6">
            You&apos;re not in any sessions yet. Ask your DM for their invite code and enter it below, or start your own.
          </p>
        ) : null}
        <Stagger className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {sessions.map((s) => (
            <Rise key={s.id}>
              <article className="surface p-5 min-h-[120px] flex flex-col gap-2">
                <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] text-[1.05rem]">{s.name}</h3>
                <div className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase text-[var(--gold-dim)]">
                  {s.isAdmin ? "Admin" : "Player"}
                </div>
                <div className="text-sm text-[var(--ink-dim)] mt-auto">
                  {s.memberCount} member{s.memberCount === 1 ? "" : "s"} · {s.characterCount} character
                  {s.characterCount === 1 ? "" : "s"}
                </div>
                <button type="button" className="btn mt-2" onClick={() => router.push(`/session/?id=${s.id}`)}>
                  Open
                </button>
              </article>
            </Rise>
          ))}
          <Rise>
            <button
              type="button"
              className="surface min-h-[120px] w-full border-dashed text-[var(--ink-dim)] font-[family-name:var(--font-cinzel)] text-sm tracking-[0.06em] uppercase hover:text-[var(--gold)] hover:border-[var(--gold-dim)]"
              onClick={() => setCreating(true)}
            >
              + New Session
            </button>
          </Rise>
        </Stagger>

        {creating ? (
          <div className="surface mt-4 p-4 flex gap-3 flex-wrap">
            <input
              className="field-input flex-1"
              placeholder='e.g. "Curse of Strahd — Tuesdays"'
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={() => void createSession()}>
              Create
            </button>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        ) : null}

        <div className="flex gap-3 mt-6">
          <input
            className="flex-1 bg-[var(--bg-raised)] border border-[var(--hairline)] px-3 py-2"
            placeholder="Have another invite code? Enter it here"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
          <button type="button" className="btn" onClick={() => void joinSession()}>
            Join
          </button>
        </div>
        <p className="text-[var(--danger)] text-sm mt-2">{joinError}</p>

        <p className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-12 mb-4">
          My characters (across all sessions)
        </p>
        {characters.length === 0 ? (
          <p className="italic text-[var(--ink-dim)] text-center py-8">No characters yet — open a session above to start one.</p>
        ) : (
          <Stagger className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {characters.map((c) => (
              <Rise key={c.id}>
                <article className="surface p-5 min-h-[120px] flex flex-col gap-2">
                  <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)] text-[1.05rem]">{c.name}</h3>
                  <div className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase text-[var(--gold-dim)]">
                    {c.sessionName}
                  </div>
                  <div className="text-sm text-[var(--ink-dim)] mt-auto">Updated {utcStamp(c.updatedAt).toLocaleString()}</div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="btn flex-1" onClick={() => router.push(`/sheet/?id=${c.id}`)}>
                      Open
                    </button>
                    <button type="button" className="btn btn-danger flex-1" onClick={() => void deleteCharacter(c)}>
                      Delete
                    </button>
                  </div>
                </article>
              </Rise>
            ))}
          </Stagger>
        )}
      </main>
    </MotionPage>
  );
}
