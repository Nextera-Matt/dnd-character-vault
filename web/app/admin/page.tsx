"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionPage } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { ApiError, api, utcStamp } from "@/lib/api";
import type { AdminOverview } from "@/lib/types";

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [denied, setDenied] = useState(false);

  async function load() {
    try {
      const me = await api<{ user: { isSiteAdmin: boolean } }>("/api/me");
      if (!me.user.isSiteAdmin) {
        setDenied(true);
        return;
      }
      setData(await api<AdminOverview>("/api/admin/overview"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/");
      else setDenied(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (denied) {
    return (
      <p className="p-16 text-center">
        Site admin only. <a className="underline" href="/vault/">Back to your Vault</a>.
      </p>
    );
  }

  if (!data) return <p className="p-16 text-center text-[var(--ink-dim)]">Loading…</p>;

  return (
    <MotionPage>
      <TopBar />
      <main className="max-w-[1000px] mx-auto px-6 pb-16">
        <h2 className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-10 mb-3">
          Users
        </h2>
        <AdminTable
          headers={["Name", "Joined", "", "Actions"]}
          rows={data.users.map((u) => [
            u.displayName,
            utcStamp(u.createdAt).toLocaleDateString(),
            u.role === "site_admin" ? "SITE ADMIN" : "",
            <span key={u.id} className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const name = window.prompt("New display name for " + u.displayName + ":", u.displayName);
                  if (!name || name === u.displayName) return;
                  try {
                    await api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ displayName: name }) });
                    await load();
                  } catch (err) {
                    window.alert(err instanceof ApiError ? err.message : "Failed");
                  }
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const pw = window.prompt("New password for " + u.displayName + " (at least 6 characters):");
                  if (!pw) return;
                  try {
                    await api(`/api/admin/users/${u.id}/reset-password`, {
                      method: "POST",
                      body: JSON.stringify({ newPassword: pw }),
                    });
                    window.alert("Password reset for " + u.displayName + ".");
                  } catch (err) {
                    window.alert(err instanceof ApiError ? err.message : "Failed");
                  }
                }}
              >
                Reset Password
              </button>
              {u.role === "site_admin" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!window.confirm(`Remove site admin from ${u.displayName}?`)) return;
                    try {
                      await api(`/api/admin/users/${u.id}/demote`, { method: "POST" });
                      await load();
                    } catch (err) {
                      window.alert(err instanceof ApiError ? err.message : "Failed");
                    }
                  }}
                >
                  Remove Admin
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Make ${u.displayName} a site admin? They'll be able to see and manage every user, session, and character on the server.`,
                      )
                    )
                      return;
                    try {
                      await api(`/api/admin/users/${u.id}/promote`, { method: "POST" });
                      await load();
                    } catch (err) {
                      window.alert(err instanceof ApiError ? err.message : "Failed");
                    }
                  }}
                >
                  Make Admin
                </button>
              )}
              {u.role === "site_admin" ? null : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete ${u.displayName}'s account entirely? This removes their session memberships and every character they own. Cannot be undone.`,
                      )
                    )
                      return;
                    try {
                      await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
                      await load();
                    } catch (err) {
                      window.alert(err instanceof ApiError ? err.message : "Failed");
                    }
                  }}
                >
                  Delete
                </button>
              )}
            </span>,
          ])}
        />

        <h2 className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-10 mb-3">
          Sessions
        </h2>
        <AdminTable
          headers={["Name", "Admin", "Members", "Characters", "Invite Code", "Actions"]}
          rows={data.sessions.map((s) => [
            s.name,
            s.adminName || "(none)",
            String(s.memberCount),
            String(s.characterCount),
            s.inviteCode,
            <button
              key={s.id}
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete session "${s.name}" entirely, including every member's characters in it? Cannot be undone.`,
                  )
                )
                  return;
                await api(`/api/admin/sessions/${s.id}`, { method: "DELETE" });
                await load();
              }}
            >
              Delete
            </button>,
          ])}
        />

        <h2 className="font-[family-name:var(--font-cinzel)] text-xs tracking-[0.12em] uppercase text-[var(--gold-dim)] mt-10 mb-3">
          Characters
        </h2>
        <AdminTable
          headers={["Name", "Owner", "Session", "Updated", "Actions"]}
          rows={data.characters.map((c) => [
            c.name,
            c.ownerName,
            c.sessionName,
            utcStamp(c.updatedAt).toLocaleString(),
            <span key={c.id} className="flex gap-2">
              <button type="button" className="btn" onClick={() => router.push(`/sheet/?id=${c.id}`)}>
                View
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  if (!window.confirm(`Delete "${c.name}"? Cannot be undone.`)) return;
                  await api(`/api/admin/characters/${c.id}`, { method: "DELETE" });
                  await load();
                }}
              >
                Delete
              </button>
            </span>,
          ])}
        />
      </main>
    </MotionPage>
  );
}

function AdminTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h || "empty"}
                className="text-left font-[family-name:var(--font-cinzel)] text-[0.68rem] tracking-[0.08em] uppercase text-[var(--gold-dim)] py-2 px-2 border-b border-[var(--hairline)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="text-center italic text-[var(--ink-dim)] py-6">
                None.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-dotted border-[var(--hairline)]">
                {row.map((cell, j) => (
                  <td key={j} className="py-2 px-2 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
