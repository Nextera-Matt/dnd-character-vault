"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CharacterSheet from "@/components/CharacterSheet";

function SheetInner() {
  const id = useSearchParams().get("id");
  if (!id) return <p className="text-center text-[var(--danger)] py-20">No character selected.</p>;
  return <CharacterSheet charId={id} />;
}

export default function SheetPage() {
  return (
    <Suspense fallback={<p className="text-center py-20 text-[var(--ink-dim)]">Loading…</p>}>
      <SheetInner />
    </Suspense>
  );
}
