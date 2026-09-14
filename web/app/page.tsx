"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionPage } from "@/components/Motion";
import { ThemeSwitcher } from "@/components/ThemeProvider";
import { ApiError, api } from "@/lib/api";
import type { MeUser } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"signup" | "login">("signup");
  const [error, setError] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    api<{ user: MeUser }>("/api/me")
      .then(() => router.replace("/vault/"))
      .catch(() => undefined);
  }, [router]);

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!signupCode.trim()) return setError("Enter your signup code.");
    if (!displayName.trim()) return setError("Choose a display name.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    try {
      await api("/api/signup", {
        method: "POST",
        body: JSON.stringify({ signupCode, displayName, password }),
      });
      router.push("/vault/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!loginName.trim() || !loginPassword) return setError("Enter your name and password.");
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ displayName: loginName, password: loginPassword }),
      });
      router.push("/vault/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <MotionPage>
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
        <div className="absolute top-5 right-5">
          <ThemeSwitcher />
        </div>
        <div className="surface w-full max-w-[420px] p-10">
          <h1 className="font-[family-name:var(--font-cinzel)] text-3xl text-center text-[var(--gold)] mb-2">
            <span className="gold-flow">Character Vault</span>
          </h1>
          <p className="text-center italic text-[var(--ink-dim)] mb-8 text-[0.95rem]">
            {tab === "signup"
              ? "New account? You need a signup code to get in."
              : "Welcome back — sign in with your name and password."}
          </p>
          <div className="flex border border-[var(--hairline)] mb-8">
            <button
              type="button"
              className={`flex-1 py-2 font-[family-name:var(--font-cinzel)] text-xs tracking-[0.08em] uppercase ${tab === "signup" ? "bg-[var(--gold-dim)] text-[var(--bg)]" : "text-[var(--ink-dim)]"}`}
              onClick={() => setTab("signup")}
            >
              Sign Up
            </button>
            <button
              type="button"
              className={`flex-1 py-2 font-[family-name:var(--font-cinzel)] text-xs tracking-[0.08em] uppercase ${tab === "login" ? "bg-[var(--gold-dim)] text-[var(--bg)]" : "text-[var(--ink-dim)]"}`}
              onClick={() => setTab("login")}
            >
              Log In
            </button>
          </div>

          {tab === "signup" ? (
            <form onSubmit={(e) => void onSignup(e)}>
              <label className="block font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.1em] uppercase text-[var(--gold-dim)] mb-1">
                Signup code
              </label>
              <input className="field-input mb-5" value={signupCode} onChange={(e) => setSignupCode(e.target.value)} placeholder="What is the music of life?" />
              <label className="block font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.1em] uppercase text-[var(--gold-dim)] mb-1">
                Your name
              </label>
              <input className="field-input mb-5" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="This is also your login" />
              <label className="block font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.1em] uppercase text-[var(--gold-dim)] mb-1">
                Password
              </label>
              <input className="field-input mb-6" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
              <button className="btn btn-primary w-full py-3" type="submit">
                Create account
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void onLogin(e)}>
              <label className="block font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.1em] uppercase text-[var(--gold-dim)] mb-1">
                Name
              </label>
              <input className="field-input mb-5" value={loginName} onChange={(e) => setLoginName(e.target.value)} />
              <label className="block font-[family-name:var(--font-cinzel)] text-[0.65rem] tracking-[0.1em] uppercase text-[var(--gold-dim)] mb-1">
                Password
              </label>
              <input className="field-input mb-6" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              <button className="btn btn-primary w-full py-3" type="submit">
                Sign in
              </button>
            </form>
          )}
          <p className="text-[var(--danger)] text-sm mt-4 min-h-[1.2em]">{error}</p>
        </div>
      </div>
    </MotionPage>
  );
}
