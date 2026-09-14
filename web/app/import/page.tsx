"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MotionPage } from "@/components/Motion";
import { TopBar } from "@/components/TopBar";
import { ApiError, api } from "@/lib/api";
import type { CharacterData } from "@/lib/types";

type ParseOut = { data: CharacterData; warnings: string[] };

function ImportInner() {
  const router = useRouter();
  const sessionId = useSearchParams().get("sessionId");
  const [status, setStatus] = useState("");
  const [parsed, setParsed] = useState<ParseOut | null>(null);
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    api("/api/me").catch(() => router.replace("/"));
  }, [router]);

  async function parseText(text: string) {
    setStatus("Parsing…");
    const mod = await import("@/lib/import-parser.js");
    try {
      const out = mod.parseRoll20Sheet(text) as ParseOut;
      setParsed(out);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Parsing failed unexpectedly — this may not be a Roll20 2024 sheet export.");
    }
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      window.alert("That doesn't look like a PDF.");
      return;
    }
    setStatus("Reading PDF…");
    const pdfjs = await loadPdfJs();
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      let fullText = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        setStatus(`Reading page ${p} of ${pdf.numPages}…`);
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        fullText += content.items.map((it: { str?: string }) => it.str || "").join("\n") + "\n";
      }
      await parseText(fullText);
    } catch (e) {
      console.error(e);
      setStatus('Could not read that PDF — try the "paste text" option instead.');
    }
  }

  async function create() {
    if (!parsed) return;
    if (!sessionId) {
      window.alert("No session specified — go back to a session and use Import from there.");
      return;
    }
    try {
      const created = await api<{ id: number }>("/api/characters", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      try {
        await api(`/api/characters/${created.id}`, { method: "PUT", body: JSON.stringify(parsed.data) });
      } catch {
        window.alert("Character created, but the imported data failed to save. You can still edit it manually.");
      }
      router.push(`/sheet/?id=${created.id}`);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Could not create the character.");
    }
  }

  return (
    <MotionPage>
      <TopBar backHref="/vault/" backLabel="My Vault" />
      <main className="max-w-[640px] mx-auto px-6 py-10 pb-16">
        <h1 className="font-[family-name:var(--font-cinzel)] text-center text-[var(--gold)] text-3xl mb-3">Import a Character</h1>
        <p className="surface p-4 text-sm text-[var(--ink-dim)] mb-6">
          This reads <b className="text-[var(--gold)]">Roll20&apos;s 2024 character sheet PDF export</b> specifically. Other sources aren&apos;t supported yet.
        </p>
        {!parsed ? (
          <>
            <label
              className={`block border border-dashed p-12 text-center cursor-pointer text-[var(--ink-dim)] ${drag ? "border-[var(--gold-dim)] text-[var(--gold)]" : "border-[var(--hairline)]"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
            >
              Drop a PDF here, or click to choose one
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            <button type="button" className="block mx-auto mt-4 text-sm underline text-[var(--ink-dim)]" onClick={() => setPaste(!paste)}>
              Paste extracted text instead
            </button>
            {paste ? (
              <>
                <textarea
                  className="w-full min-h-[180px] bg-[var(--bg-raised)] border border-[var(--hairline)] p-3 mt-3 font-[family-name:var(--font-mono)] text-sm"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <button type="button" className="btn btn-primary w-full mt-3" onClick={() => void parseText(pasteText)}>
                  Parse pasted text
                </button>
              </>
            ) : null}
            {status ? <p className="text-center font-[family-name:var(--font-mono)] text-sm text-[var(--ink-dim)] mt-4">{status}</p> : null}
          </>
        ) : (
          <>
            {parsed.warnings.length ? (
              <div className="border border-[var(--danger)] p-4 mb-4">
                <h3 className="text-[var(--danger)] text-sm mb-2">Needs a look</h3>
                <ul className="text-sm text-[var(--ink-dim)] list-disc pl-5">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="surface p-4 text-sm">
              {[
                ["Name", parsed.data.charName],
                ["Class / Species", parsed.data.subtitle.replace(/&middot;/g, "·")],
                ["AC", parsed.data.vitals.ac],
                ["HP", `${parsed.data.vitals.hpCur} / ${parsed.data.vitals.hpMax}`],
                ["Abilities found", `${parsed.data.abilities.length} of 6`],
                ["Skills found", parsed.data.skills.length],
                ["Languages", parsed.data.languages.join(", ") || "(none found)"],
                ["Gear items", parsed.data.gear.length],
                ["Gold", `${parsed.data.vitals.gold} gp`],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between py-1 border-b border-dotted border-[var(--hairline)]">
                  <span>{k}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--veil)]">{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button type="button" className="btn flex-1" onClick={() => setParsed(null)}>
                Start over
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={() => void create()}>
                Create character from this
              </button>
            </div>
          </>
        )}
      </main>
    </MotionPage>
  );
}

async function loadPdfJs(): Promise<{
  getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> };
}> {
  const existing = (window as unknown as { pdfjsLib?: unknown }).pdfjsLib;
  if (existing) return existing as never;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("pdf.js failed to load"));
    document.body.appendChild(s);
  });
  const pdfjsLib = (window as unknown as { pdfjsLib: { GlobalWorkerOptions: { workerSrc: string } } }).pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return pdfjsLib as never;
}

export default function ImportPage() {
  return (
    <Suspense fallback={<p className="text-center py-20">Loading…</p>}>
      <ImportInner />
    </Suspense>
  );
}
