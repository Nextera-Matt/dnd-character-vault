"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ROLL_IMPULSE_EVENT, moodForPath, type RollImpulse } from "@/lib/weave";

const BOOT_KEY = "vault-booted";

export function AttuneBoot() {
  const [lines, setLines] = useState<Array<{ k: string; v: string }>>([]);
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || sessionStorage.getItem(BOOT_KEY) === "1") {
        setDone(true);
        return;
      }
    } catch {
      setDone(true);
      return;
    }
    setShow(true);
    const rows = [
      { k: "$ vault --attune", v: "" },
      {
        k: "weave",
        v: document.body.classList.contains("has-3d") ? "webgl" : "css fallback",
      },
      {
        k: "motion",
        v: window.matchMedia("(pointer: fine)").matches ? "tilt + scroll" : "touch mode",
      },
      { k: "dice", v: "ready" },
    ];
    // The weave lands async; re-check at print time like the portfolio HUD.
    const start = window.setTimeout(() => {
      rows[1].v = document.body.classList.contains("has-3d") ? "webgl" : "css fallback";
      rows.forEach((row, i) => {
        window.setTimeout(() => setLines((prev) => [...prev, row]), 120 * (i + 1));
      });
      window.setTimeout(() => finish(), 120 * (rows.length + 1) + 250);
    }, 350);
    function finish() {
      setDone(true);
      window.setTimeout(() => setShow(false), 600);
      try {
        sessionStorage.setItem(BOOT_KEY, "1");
      } catch {
        /* private mode */
      }
    }
    const dismiss = () => finish();
    window.addEventListener("keydown", dismiss, { once: true });
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("keydown", dismiss);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done && !show) return null;
  if (!show) return null;

  return (
    <div className={`attune-boot${done ? " done" : ""}`} role="status" aria-label="Attuning" onClick={() => setDone(true)}>
      <div className="attune-box">
        <div className="attune-title">vault — attuning…</div>
        <div className="attune-log">
          {lines.map((row, i) => (
            <div key={`${row.k}-${i}`} className="attune-line">
              {row.v ? `${row.k}: ${row.v}` : row.k}
              <span className="attune-ok"> ok</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `up ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

export function SessionHud() {
  const pathname = usePathname();
  const [uptime, setUptime] = useState("up 00:00:00");
  const [flow, setFlow] = useState("flow: …");
  const [lastRoll, setLastRoll] = useState("");
  const { key: rite } = moodForPath(pathname ?? "/");

  useEffect(() => {
    const start = performance.now();
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    const tick = window.setInterval(() => {
      setUptime(formatUptime(performance.now() - start));
      const has3d = document.body.classList.contains("has-3d");
      setFlow(!has3d ? "flow: off" : reduced ? "flow: static" : "flow: live");
    }, 1000);
    const onRoll = (e: Event) => {
      const detail = (e as CustomEvent<RollImpulse>).detail;
      if (detail) setLastRoll(`${detail.label || "roll"} ${detail.total}`);
    };
    window.addEventListener(ROLL_IMPULSE_EVENT, onRoll);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener(ROLL_IMPULSE_EVENT, onRoll);
    };
  }, []);

  useEffect(() => {
    try {
      document.body.dataset.mood = rite;
    } catch {
      /* noop */
    }
  }, [rite]);

  return (
    <div className="session-hud" aria-hidden="true">
      <span>{uptime}</span>
      <span className="hud-sep">·</span>
      <span>{flow}</span>
      <span className="hud-sep">·</span>
      <span>rite: {rite}</span>
      {lastRoll ? (
        <>
          <span className="hud-sep">·</span>
          <span>last: {lastRoll}</span>
        </>
      ) : null}
    </div>
  );
}
