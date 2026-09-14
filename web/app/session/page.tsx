"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MotionPage, Rise, Stagger } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { ApiError, api, utcStamp } from "@/lib/api";
import type { SessionCharacter, SessionDetail } from "@/lib/types";

function SessionInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("id");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [characters, setCharacters] = useState<SessionCharacter[]>([]);
  const [limit, setLimit] = useState(6);
  const [countForYou, setCountForYou] = useState(0);
  const [missing, setMissing] = useState(false);

  async function load() {
    if (!sessionId) return;
    try {
      await api("/api/me");
    } catch {
      router.replace("/");
      return;
    }
    try {
      const s = await api<SessionDetail>(`/api/sessions/${sessionId}`);
      setSession(s);
      const chars = await api<{
        characters: SessionCharacter[];
        limit: number;
        countForYou: number;
      }>(`/api/sessions/${sessionId}/characters`);
      setCharacters(chars.characters);
      setLimit(chars.limit);
      setCountForYou(chars.countForYou);
    } catch (err) {
      if (err instanceof ApiError) setMissing(true);
    }
  }

  useEffect(() => {
    void load();
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

  return (
    <MotionPage>
      <TopBar backHref="/vault/" backLabel="My Vault" />
      <main className="max-w-[760px] mx-auto px-6 pb-16">
        <h1 className="font-[family-name:var(--font-cinzel)] text-[1.9rem] text-center text-[var(--gold)] pt-10 mb-8">
          {session?.name || "Loading…"}
        </h1>
        <Stagger className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {characters.map((c) => (
            <Rise key={c.id}>
              <article className="surface p-5 min-h-[120px] flex flex-col gap-2">
                <h3 className="font-[family-name:var(--font-cinzel)] text-[var(--gold)]">{c.name}</h3>
                <div className="font-[family-name:var(--font-mono)] text-[0.7rem] text-[var(--veil)]">
                  {c.isOwner ? "Yours" : `by ${c.ownerName}`}
                </div>
                <div className="text-sm text-[var(--ink-dim)] mt-auto">Updated {utcStamp(c.updatedAt).toLocaleString()}</div>
                <div className="flex gap-2 mt-2">
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
          ))}
          {countForYou < limit ? (
            <>
              <Rise>
                <button type="button" className="surface min-h-[120px] w-full border-dashed uppercase tracking-wide text-[var(--ink-dim)] hover:text-[var(--gold)]" onClick={() => void createCharacter()}>
                  + New Character
                </button>
              </Rise>
              <Rise>
                <button
                  type="button"
                  className="surface min-h-[120px] w-full border-dashed uppercase tracking-wide text-[var(--ink-dim)] hover:text-[var(--gold)]"
                  onClick={() => router.push(`/import/?sessionId=${sessionId}`)}
                >
                  Import from PDF
                </button>
              </Rise>
            </>
          ) : null}
        </Stagger>
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
