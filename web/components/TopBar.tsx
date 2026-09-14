"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeSwitcher } from "@/components/ThemeProvider";
import { api } from "@/lib/api";

type Props = {
  name?: string;
  isSiteAdmin?: boolean;
  backHref?: string;
  backLabel?: string;
};

export function TopBar({ name, isSiteAdmin, backHref, backLabel }: Props) {
  const router = useRouter();

  async function logout() {
    await api("/api/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-5 py-3 backdrop-blur-md">
      <Link href="/vault/" className="font-[family-name:var(--font-cinzel)] text-sm tracking-[0.08em] uppercase text-[var(--gold)]">
        Character Vault
      </Link>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--ink-dim)]">
        {name ? <span>{name}</span> : null}
        <ThemeSwitcher />
        {backHref ? (
          <Link href={backHref} className="btn">
            {backLabel || "Back"}
          </Link>
        ) : null}
        <Link href="/compendium/" className="btn">
          Compendium
        </Link>
        <Link href="/glossary/" className="btn">
          Glossary
        </Link>
        {isSiteAdmin ? (
          <Link href="/admin/" className="btn">
            Site Admin
          </Link>
        ) : null}
        <button type="button" className="btn" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
