"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTheme } from "@/components/ThemeProvider";
import {
  FLOW_IMPULSE_EVENT,
  ROLL_IMPULSE_EVENT,
  impulseForRoll,
  moodForPath,
  paletteForTheme,
  type FlowImpulse,
  type RollImpulse,
  type WeaveMood,
  type WeavePalette,
} from "@/lib/weave";

type NodeDef = {
  base: THREE.Vector3;
  phase: number;
  speed: number;
  hot: boolean;
};

function buildNodes(count: number): NodeDef[] {
  const layers = [-4.5, -1.5, 1.5, 4.5];
  return Array.from({ length: count }, (_, i) => ({
    base: new THREE.Vector3(
      layers[i % layers.length] + (Math.random() - 0.5) * 2.2,
      (Math.random() - 0.5) * 5.2,
      (Math.random() - 0.5) * 3.0,
    ),
    phase: Math.random() * Math.PI * 2,
    speed: 0.25 + Math.random() * 0.5,
    hot: Math.random() < 0.18,
  }));
}

function buildEdges(nodes: NodeDef[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  nodes.forEach((n, i) => {
    const dists = nodes
      .map((m, j) => ({ j, d: j === i ? Infinity : n.base.distanceTo(m.base) }))
      .sort((a, b) => a.d - b.d);
    pairs.push([i, dists[0].j]);
    if (i % 3 === 0 && dists[1]) pairs.push([i, dists[1].j]);
  });
  return pairs;
}

function nodePos(nodes: NodeDef[], i: number, out: THREE.Vector3, time: number): THREE.Vector3 {
  const n = nodes[i];
  out.copy(n.base);
  out.y += Math.sin(time * n.speed + n.phase) * 0.18;
  out.x += Math.cos(time * n.speed * 0.7 + n.phase) * 0.12;
  return out;
}

function WeaveScene({
  palette,
  mood,
  reduced,
  coarse,
}: {
  palette: WeavePalette;
  mood: WeaveMood;
  reduced: boolean;
  coarse: boolean;
}) {
  const { camera, gl } = useThree();
  const nodes = useMemo(() => buildNodes(coarse ? 42 : 72), [coarse]);
  const edges = useMemo(() => buildEdges(nodes), [nodes]);
  const packetCount = coarse ? 22 : 40;

  const nodeGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nodes.length * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(nodes.length * 3), 3));
    return geo;
  }, [nodes]);

  const edgeGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3));
    return geo;
  }, [edges]);

  useEffect(() => () => {
    nodeGeo.dispose();
    edgeGeo.dispose();
  }, [nodeGeo, edgeGeo]);

  const packets = useMemo(
    () =>
      Array.from({ length: packetCount }, () => ({
        edge: Math.floor(Math.random() * edges.length),
        t: Math.random(),
        speed: 0.15 + Math.random() * 0.35,
      })),
    [edges.length, packetCount],
  );
  const alerts = useMemo(
    () =>
      Array.from({ length: 6 }, () => ({
        edge: Math.floor(Math.random() * edges.length),
        t: Math.random(),
        speed: 0.25 + Math.random() * 0.3,
      })),
    [edges.length],
  );

  const packetRef = useRef<THREE.InstancedMesh>(null);
  const alertRef = useRef<THREE.InstancedMesh>(null);
  const edgeMatRef = useRef<THREE.LineBasicMaterial>(null);
  const nodeMatRef = useRef<THREE.PointsMaterial>(null);

  const target = useRef<WeaveMood>({ ...mood });
  const current = useRef<WeaveMood>({ ...mood });
  const mouse = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);
  const impulse = useRef<{ mood: FlowImpulse; until: number } | null>(null);
  const colors = useMemo(
    () => ({
      node: new THREE.Color(palette.node),
      nodeHot: new THREE.Color(palette.nodeHot),
    }),
    [palette],
  );

  useEffect(() => {
    target.current = { ...mood };
    if (reduced) current.current = { ...mood };
  }, [mood, reduced]);

  useEffect(() => {
    if (reduced) return;
    const onPointer = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    };
    const onFlow = (e: Event) => {
      const detail = (e as CustomEvent<FlowImpulse>).detail ?? {};
      impulse.current = { mood: detail, until: performance.now() + 1200 };
    };
    const onRoll = (e: Event) => {
      const detail = (e as CustomEvent<RollImpulse>).detail;
      if (!detail) return;
      impulse.current = { mood: impulseForRoll(detail.kind), until: performance.now() + 1200 };
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(FLOW_IMPULSE_EVENT, onFlow);
    window.addEventListener(ROLL_IMPULSE_EVENT, onRoll);
    onScroll();
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(FLOW_IMPULSE_EVENT, onFlow);
      window.removeEventListener(ROLL_IMPULSE_EVENT, onRoll);
    };
  }, [reduced]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  const clock = useMemo(() => new THREE.Clock(), []);
  const perspective = camera as THREE.PerspectiveCamera;

  useFrame(() => {
    if (document.hidden) return;
    const time = clock.getElapsedTime();
    const t = reduced ? 0 : time;

    const k = reduced ? 1 : 0.04;
    const goal = target.current;
    const cur = current.current;
    const imp = impulse.current;
    const live = imp && performance.now() < imp.until ? imp.mood : null;
    if (imp && performance.now() >= imp.until) impulse.current = null;
    (Object.keys(cur) as Array<keyof WeaveMood>).forEach((key) => {
      const g = live?.[key] ?? goal[key];
      cur[key] += (Number(g) - Number(cur[key])) * k;
    });

    const dive = reduced ? 0 : scroll.current * 1.5;
    const camZ = cur.camZ + (typeof live?.camZ === "number" && live.camZ < 0 ? live.camZ : 0) - dive;
    perspective.position.x += ((reduced || coarse ? 0 : mouse.current.x * 0.7) - perspective.position.x) * 0.03;
    perspective.position.y += ((cur.camY - (reduced || coarse ? 0 : mouse.current.y * 0.5)) - perspective.position.y) * 0.03;
    perspective.position.z += (camZ - perspective.position.z) * 0.03;
    perspective.lookAt(0, 0, 0);
    perspective.rotation.z += (cur.rotY * 0.15 - perspective.rotation.z) * 0.03;

    if (edgeMatRef.current) edgeMatRef.current.opacity = cur.edge;
    gl.domElement.style.opacity = String(cur.dim);

    const p = nodeGeo.attributes.position as THREE.BufferAttribute;
    const c = nodeGeo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < nodes.length; i++) {
      nodePos(nodes, i, tmpA, t);
      p.setXYZ(i, tmpA.x, tmpA.y, tmpA.z);
      const col = nodes[i].hot ? colors.nodeHot : colors.node;
      c.setXYZ(i, col.r, col.g, col.b);
    }
    p.needsUpdate = true;
    c.needsUpdate = true;

    const ep = edgeGeo.attributes.position as THREE.BufferAttribute;
    edges.forEach(([a, b], idx) => {
      nodePos(nodes, a, tmpA, t);
      nodePos(nodes, b, tmpB, t);
      ep.setXYZ(idx * 2, tmpA.x, tmpA.y, tmpA.z);
      ep.setXYZ(idx * 2 + 1, tmpB.x, tmpB.y, tmpB.z);
    });
    ep.needsUpdate = true;

    const dt = reduced ? 0 : 0.016 * cur.flow;
    const packetMesh = packetRef.current;
    if (packetMesh) {
      packets.forEach((pkt, i) => {
        pkt.t += pkt.speed * dt;
        if (pkt.t > 1) {
          pkt.t = 0;
          pkt.edge = Math.floor(Math.random() * edges.length);
        }
        const [a, b] = edges[pkt.edge];
        nodePos(nodes, a, tmpA, t);
        nodePos(nodes, b, tmpB, t);
        dummy.position.lerpVectors(tmpA, tmpB, pkt.t);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        packetMesh.setMatrixAt(i, dummy.matrix);
      });
      packetMesh.instanceMatrix.needsUpdate = true;
    }
    const alertMesh = alertRef.current;
    if (alertMesh) {
      alerts.forEach((al, i) => {
        al.t += al.speed * dt;
        if (al.t > 1) {
          al.t = 0;
          al.edge = Math.floor(Math.random() * edges.length);
        }
        const [a, b] = edges[al.edge];
        nodePos(nodes, a, tmpA, t);
        nodePos(nodes, b, tmpB, t);
        dummy.position.lerpVectors(tmpA, tmpB, al.t);
        dummy.scale.setScalar(1.5);
        dummy.updateMatrix();
        alertMesh.setMatrixAt(i, dummy.matrix);
      });
      alertMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <points geometry={nodeGeo}>
        <pointsMaterial
          ref={nodeMatRef}
          size={0.11}
          vertexColors
          transparent
          opacity={0.95}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial ref={edgeMatRef} color={palette.edge} transparent opacity={0.22} depthWrite={false} />
      </lineSegments>
      <instancedMesh ref={packetRef} args={[undefined, undefined, packetCount]} frustumCulled={false}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={palette.packet} transparent opacity={0.9} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={alertRef} args={[undefined, undefined, 6]} frustumCulled={false}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={palette.alert} transparent opacity={0.95} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

export function Weavefield() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
      if (!window.WebGLRenderingContext) setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  const { mood } = moodForPath(pathname ?? "/");
  const palette = paletteForTheme(theme);

  if (!mounted || failed) return null;

  return (
    <div className="weavefield" aria-hidden="true">
      <Canvas
        dpr={[1, coarse ? 1.5 : 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [0, 0.6, 11], fov: 48, near: 0.1, far: 100 }}
        frameloop={reduced ? "demand" : "always"}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          document.body.classList.add("has-3d");
          document.body.dataset.mood = moodForPath(pathname ?? "/").key;
        }}
      >
        <WeaveScene palette={palette} mood={mood} reduced={reduced} coarse={coarse} />
      </Canvas>
    </div>
  );
}
