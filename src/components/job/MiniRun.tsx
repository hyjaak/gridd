"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { RoadStripSUV } from "@/components/dispatch/RoadStripSUV";

export type RunStage = "booked" | "rolling" | "arrived" | "delivered" | "done";

const GREEN = 0x0e9f6e;
const MIST = 0xeef3ef;
const HOUSE = 0xd9a441;

function canWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    return true;
  } catch {
    return false;
  }
}

/** Purpose-built tiny tracker scene — SUV along a curved road. Built once; stage changes animate in-place. */
export default function MiniRun({ stage }: { stage: RunStage }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(true);
  const rafRef = useRef<number>(0);
  const sceneRef = useRef<any>(null);
  const stageRef = useRef<RunStage>(stage);

  useEffect(() => {
    if (!canWebGL()) { setSupported(false); return; }
    setSupported(true);
  }, []);

  const init = useCallback(() => {
    const el = containerRef.current;
    if (!el || !supported) return;

    const isMobile = window.innerWidth < 640;
    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(MIST, 18, 42);
    const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(8, 7, 14);
    camera.lookAt(4, 0, -2);

    const hemi = new THREE.HemisphereLight(MIST, GREEN, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(6, 10, 4);
    scene.add(dir);

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0xd9e4d2 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);

    // Curved road (3 segments)
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const segs: [number, number, number, number][] = [
      [0, -0.45, 3, 1.4], [3.2, -0.15, 3.4, 1.4], [6.6, 0, 6, 1.4],
    ];
    for (const [x, z, len, w] of segs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, w), roadMat);
      m.position.set(x, 0.02, z);
      m.rotation.y = -0.08;
      scene.add(m);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(len - 0.6, 0.03, 0.1), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      dash.position.set(x, 0.06, z);
      dash.rotation.y = -0.08;
      scene.add(dash);
    }

    // Pickup marker
    const start = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0x555555 }));
    start.position.set(0.4, 0.08, -0.3);
    scene.add(start);

    // House at far end
    const house = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), new THREE.MeshLambertMaterial({ color: HOUSE }));
    hb.position.y = 0.8;
    house.add(hb);
    const hroof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.1, 4), new THREE.MeshLambertMaterial({ color: 0x8c6116 }));
    hroof.position.y = 2.1;
    hroof.rotation.y = Math.PI / 4;
    house.add(hroof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.1), new THREE.MeshLambertMaterial({ color: 0x5c3d0e }));
    door.position.set(0, 0.55, 1.12);
    house.add(door);
    house.position.set(14.5, 0, 2.2);
    scene.add(house);

    // 3 trees
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x0a7a54 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    for (const [tx, tz, s] of [[2.5, 2, 0.5], [5, -2.2, 0.7], [10, 2.4, 0.45]] as const) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.4 * s, 6), trunkMat);
      trunk.position.y = 0.7 * s;
      tree.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 2.2 * s, 6), treeMat);
      leaves.position.y = 1.9 * s;
      tree.add(leaves);
      tree.position.set(tx, 0, tz);
      scene.add(tree);
    }

    // GRIDD SUV
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: GREEN });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a3a2e });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1), bodyMat);
    body.position.y = 0.6;
    car.add(body);
    const carRoof = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.95), bodyMat);
    carRoof.position.set(-0.1, 1.15, 0);
    car.add(carRoof);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.92), glassMat);
    glass.position.set(-0.1, 1.15, 0);
    glass.scale.z = 0.9;
    car.add(glass);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.05), glassMat);
    rail.position.set(-0.2, 1.5, 0);
    car.add(rail);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.22), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    decal.position.set(-0.95, 0.6, 0.51);
    decal.rotation.y = Math.PI / 2;
    car.add(decal);
    const wheels: THREE.Mesh[] = [];
    for (const [wx, wz] of [[-0.6, 0.55], [-0.6, -0.55], [0.6, 0.55], [0.6, -0.55]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 8), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.32, wz);
      car.add(wheel);
      wheels.push(wheel);
    }
    const blob = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.01;
    car.add(blob);
    car.position.set(0.4, 0, -0.3);
    scene.add(car);

    // 2 drifting clouds
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const clouds: THREE.Group[] = [];
    for (const [cx, cy, cz, cs] of [[6, 4.5, -6, 1], [10, 5.5, -3, 1.4]] as const) {
      const cloud = new THREE.Group();
      for (const [ox, oy, os] of [[0, 0, cs], [0.7, 0.2, cs * 0.7], [-0.7, 0.15, cs * 0.6]] as const) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(os, 8, 6), cloudMat);
        puff.position.set(ox, oy, 0);
        cloud.add(puff);
      }
      cloud.position.set(cx, cy, cz);
      scene.add(cloud);
      clouds.push(cloud);
    }

    // Exhaust puffs (booked idle)
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0 });
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), puffMat);
      puff.position.set(-1.0, 0.4, 0);
      puff.visible = false;
      scene.add(puff);
      puffs.push(puff);
    }

    // Driver + box
    const driver = new THREE.Group();
    const db = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), new THREE.MeshLambertMaterial({ color: 0x101613 }));
    db.position.y = 0.35;
    driver.add(db);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial({ color: 0xb5761a }));
    head.position.y = 0.85;
    driver.add(head);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: 0xb5761a }));
    box.position.set(0.35, 0.2, 0);
    driver.add(box);
    driver.visible = false;
    driver.position.set(13.4, 0, 2.2);
    scene.add(driver);
    const doorstepBox = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: 0xb5761a }));
    doorstepBox.position.set(13.4, 0.18, 2.5);
    doorstepBox.visible = false;
    scene.add(doorstepBox);

    const state = { car, wheels, clouds, driver, box, doorstepBox, puffs, puffClock: 0, deliveredDone: false };
    sceneRef.current = state;

    let elapsed = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;
      const st = stageRef.current;

      // Gentle camera idle drift
      camera.position.x = 8 + Math.sin(elapsed * 0.4) * 0.4;
      camera.position.y = 7 + Math.sin(elapsed * 0.25) * 0.2;
      camera.lookAt(4, 0, -2);

      // Clouds drift
      for (const c of state.clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 18) c.position.x = 0;
      }

      if (st === "booked") {
        car.position.x = THREE.MathUtils.lerp(car.position.x, 0.4, dt * 1.2);
        car.position.z = THREE.MathUtils.lerp(car.position.z, -0.3, dt * 1.2);
        for (const w of state.wheels) w.rotation.x = 0;
        state.puffClock += dt;
        for (let i = 0; i < state.puffs.length; i++) {
          const p = state.puffs[i];
          p.visible = true;
          const ph = (state.puffClock + i * 0.7) % 2;
          p.position.set(-1.0 - ph * 0.4, 0.4 - ph * 0.1, 0);
          (p.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.35 - ph * 0.2);
        }
      } else if (st === "rolling" || st === "arrived") {
        for (const p of state.puffs) p.visible = false;
        const t = st === "arrived" ? 1 : (elapsed * 0.12) % 1;
        const targetX = 0.4 + t * 13.2;
        const targetZ = -0.3 + Math.sin(t * Math.PI * 0.8) * 0.6;
        car.position.x = targetX;
        car.position.z = targetZ;
        if (st === "arrived") {
          car.position.x = THREE.MathUtils.lerp(car.position.x, 13.6, dt * 1.5);
          car.position.z = THREE.MathUtils.lerp(car.position.z, 2.2, dt * 1.5);
        }
        for (const w of state.wheels) w.rotation.x += dt * (st === "arrived" ? 1 : 6);
      } else {
        for (const p of state.puffs) p.visible = false;
      }

      // Delivered: driver carries box once; done = box on doorstep
      if (st === "delivered") {
        state.driver.visible = true;
        const t = Math.min(elapsed / 5, 1);
        state.driver.position.x = 13.4 - (1 - t) * 0.4;
        state.driver.position.z = 2.2 + t * 0.35;
        state.driver.rotation.y = t > 0.5 ? -1.1 : 0.8;
        if (t > 0.7 && !state.deliveredDone) {
          state.deliveredDone = true;
          state.driver.remove(state.box);
          state.doorstepBox.visible = true;
        }
      } else if (st === "done") {
        state.driver.visible = false;
        state.doorstepBox.visible = true;
      } else {
        state.driver.visible = false;
        state.doorstepBox.visible = false;
        state.deliveredDone = false;
      }

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [supported]);

  useEffect(() => init(), [init]);

  useEffect(() => { stageRef.current = stage; }, [stage]);

  if (!supported) return <RoadStripSUV position={stage === "rolling" ? 50 : stage === "arrived" || stage === "delivered" || stage === "done" ? 90 : 8} />;

  return <div ref={containerRef} className="w-full h-[260px] rounded-2xl overflow-hidden bg-[#eef3ef]" aria-hidden="true" />;
}