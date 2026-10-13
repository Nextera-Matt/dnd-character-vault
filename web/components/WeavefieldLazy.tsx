"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Weavefield = dynamic(() => import("@/components/Weavefield").then((m) => m.Weavefield), {
  ssr: false,
});

/** Idle-deferred weave: first paint stays instant, the 3D enhances after. */
export function WeavefieldLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setReady(true);
        return;
      }
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(() => setReady(true), { timeout: 1200 });
        return () => window.cancelIdleCallback(id);
      }
    } catch {
      /* fall through to timer */
    }
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;
  return <Weavefield />;
}
