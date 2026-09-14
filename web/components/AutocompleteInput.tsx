"use client";

import { useEffect, useRef, useState } from "react";

export function AutocompleteInput({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 8);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={wrap} className="relative flex-1">
      <input
        className={className || "ghost-input"}
        value={value}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(-1);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((v) => Math.min(v + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((v) => Math.max(v - 1, 0));
          } else if (e.key === "Enter" && hi >= 0) {
            e.preventDefault();
            onChange(matches[hi]);
            setOpen(false);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length ? (
        <div className="absolute z-50 left-0 right-0 bg-[var(--bg-raised)] border border-[var(--gold-dim)] max-h-[200px] overflow-y-auto">
          {matches.map((m, i) => (
            <button
              type="button"
              key={m}
              className={`block w-full text-left px-3 py-2 text-sm ${i === hi ? "text-[var(--gold)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)]" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(m);
                setOpen(false);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
