import * as THREE from "three";

export type SceneCallbacks = {
  onPhoto?: (dataUrl: string) => void;
  onDelivered?: (delivered: boolean) => void;
};

export type SceneHandle = {
  setMarket: (m: "OH" | "GA") => void;
  dispose: () => void;
};

const clamp = (v: number, a: number, b: number) =>
  Math.min(Math.max(v, a), b);

const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildScene(
  container: HTMLElement,
  callbacks: SceneCallbacks
): SceneHandle {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = matchMedia("(max-width:820px)").matches || "ontouchstart" in window;

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef3ef);
  scene.fog = new THREE.Fog(0xeef3ef, 28, 92);
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    220
  );

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe0d5, 0.95));
  const sun = new THREE.DirectionalLight(0xfff3df, 1.05);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {
    left: -55,
    right: 55,
    top: 55,
    bottom: -55,
  });
  scene.add(sun);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshLambertMaterial({ color: 0xdfe9e1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Route path
  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6, 0, 34),
    new THREE.Vector3(4, 0, 20),
    new THREE.Vector3(-5, 0, 4),
    new THREE.Vector3(6, 0, -12),
    new THREE.Vector3(-4, 0, -28),
    new THREE.Vector3(5, 0, -44),
  ]);

  // --- Road ---
  (function buildRoad() {
    const pts = route.getSpacedPoints(260);
    const w = 2.6;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = route.getTangent(i / (pts.length - 1));
      const n = new THREE.Vector3(-t.z, 0, t.x)
        .normalize()
        .multiplyScalar(w / 2);
      verts.push(p.x - n.x, 0.02, p.z - n.z, p.x + n.x, 0.02, p.z + n.z);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const road = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ color: 0xc4cfc6 })
    );
    road.receiveShadow = true;
    scene.add(road);

    const dashMat = new THREE.MeshLambertMaterial({ color: 0xf7faf7 });
    const curbMat = new THREE.MeshLambertMaterial({ color: 0xb2bfb5 });
    for (let i = 0; i < pts.length; i += 8) {
      const t = route.getTangent(i / (pts.length - 1));
      const yaw = Math.atan2(t.x, t.z);
      const d = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.012, 0.7),
        dashMat
      );
      d.position.copy(pts[i]).setY(0.035);
      d.rotation.y = yaw;
      scene.add(d);
      const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
      [1, -1].forEach((s) => {
        const c = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.07, 0.9),
          curbMat
        );
        c.position.set(
          pts[i].x + n.x * s * (w / 2 + 0.08),
          0.035,
          pts[i].z + n.z * s * (w / 2 + 0.08)
        );
        c.rotation.y = yaw;
        scene.add(c);
      });
    }
  })();

  // Painted pickup/dropoff zones
  function zone(t: number) {
    const p = route.getPointAt(t);
    const tan = route.getTangent(t);
    const z = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 3.2),
      new THREE.MeshLambertMaterial({
        color: 0x0e9f6e,
        transparent: true,
        opacity: 0.28,
      })
    );
    z.rotation.x = -Math.PI / 2;
    z.rotation.z = -Math.atan2(tan.x, tan.z);
    z.position.copy(p).setY(0.03);
    scene.add(z);
  }
  zone(0.004);
  zone(0.996);

  // --- City buildings ---
  const bMats = [0xffffff, 0xf3efe6, 0xe7efe9, 0xdce6df].map(
    (c) => new THREE.MeshLambertMaterial({ color: c })
  );
  const winMat = new THREE.MeshLambertMaterial({ color: 0xbcd8ca });
  const gMat = new THREE.MeshLambertMaterial({ color: 0x0e9f6e });
  const buildings: THREE.Mesh[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const buildingCount = isMobile ? 40 : 70;
  for (let i = 0; i < buildingCount; i++) {
    const z = rnd(-52, 40);
    const p = route.getPointAt(clamp((34 - z) / 78, 0, 1));
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = p.x + side * rnd(5.5, 16);
    const h = rnd(1.2, 6.5);
    const w = rnd(1.4, 3.2);
    const dpt = rnd(1.4, 3.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), bMats[i % 4]);
    b.position.set(x, h / 2, z);
    b.castShadow = b.receiveShadow = true;
    b.userData.h = h;
    if (h > 2.6 && !isMobile) {
      const rows = Math.floor(h / 1.1);
      for (let r = 0; r < rows; r++) {
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.8, 0.28, 0.02),
          winMat
        );
        win.position.set(0, -h / 2 + 0.9 + r * 1.1, dpt / 2 + 0.011);
        b.add(win);
      }
    }
    scene.add(b);
    buildings.push(b);
  }

  // Trees
  const treeCount = isMobile ? 24 : 50;
  for (let i = 0; i < treeCount; i++) {
    const z = rnd(-52, 40);
    const p = route.getPointAt(clamp((34 - z) / 78, 0, 1));
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = p.x + side * rnd(3.4, 5);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x9a7b5a })
    );
    trunk.position.set(x, 0.25, z);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(rnd(0.32, 0.55), 8, 8),
      gMat
    );
    crown.position.set(x, 0.78, z);
    crown.castShadow = true;
    scene.add(trunk, crown);
  }

  // Streetlights
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8fa096 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const p = route.getPointAt(t);
    const tan = route.getTangent(t);
    const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const s = i % 2 ? 1 : -1;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6),
      poleMat
    );
    pole.position.y = 1.3;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.7),
      poleMat
    );
    arm.position.set(0, 2.55, -s * 0.32);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      lampMat
    );
    lamp.position.set(0, 2.5, -s * 0.62);
    g.add(pole, arm, lamp);
    g.position.set(p.x + n.x * s * 2.1, 0, p.z + n.z * s * 2.1);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(g);
  }

  // Clouds
  const clouds: THREE.Group[] = [];
  const cloudCount = isMobile ? 5 : 9;
  for (let i = 0; i < cloudCount; i++) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < n; j++) {
      const s = rnd(1.2, 2.6);
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(s, 10, 10),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      puff.scale.y = 0.55;
      puff.position.set(j * s * 1.1, rnd(-0.2, 0.2), rnd(-0.4, 0.4));
      g.add(puff);
    }
    g.position.set(rnd(-40, 40), rnd(11, 17), rnd(-60, 40));
    g.userData.v = rnd(0.15, 0.4);
    scene.add(g);
    clouds.push(g);
  }

  // Route stop pins
  const pinStops = [0, 0.25, 0.5, 0.75, 1];
  const pins: THREE.Group[] = [];
  pinStops.forEach((t) => {
    const p = route.getPointAt(clamp(t, 0.003, 0.997));
    const tan = route.getTangent(clamp(t, 0.003, 0.997));
    const n = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const g = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 12),
      gMat
    );
    head.position.y = 1.05;
    head.castShadow = true;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.5, 10),
      gMat
    );
    tip.rotation.x = Math.PI;
    tip.position.y = 0.62;
    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    ring.position.y = 1.05;
    g.add(head, tip, ring);
    g.position.set(p.x + n.x * 2.0, 0, p.z + n.z * 2.0);
    g.userData.t = t;
    scene.add(g);
    pins.push(g);
  });

  // Pickup boxes
  const boxMat = new THREE.MeshLambertMaterial({ color: 0xdca55f });
  const tapeMat = new THREE.MeshLambertMaterial({ color: 0xc48a43 });
  function makeBox(s: number) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.8, s),
      boxMat
    );
    const t = new THREE.Mesh(
      new THREE.BoxGeometry(s * 1.01, s * 0.1, s * 0.34),
      tapeMat
    );
    t.position.y = s * 0.36;
    b.castShadow = true;
    g.add(b, t);
    return g;
  }
  const start = route.getPointAt(0);
  const pickupBoxes = [
    [-2.2, 0.4, 0.5, 1],
    [-2.1, 1.15, 0.6, 0.8],
    [-1.2, 0.35, 1.4, 0.85],
  ].map(([x, y, z, s], i) => {
    const g = makeBox(s);
    g.position.set(start.x + x, y as number, start.z + z);
    g.userData.load = [0.03 + i * 0.02, 0.09 + i * 0.02];
    scene.add(g);
    return g;
  });

  // Drop-off house
  const endP = route.getPointAt(1);
  (function house() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2, 2.8),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    base.position.y = 1;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.7, 1.4, 4),
      new THREE.MeshLambertMaterial({ color: 0x0e9f6e })
    );
    roof.position.y = 2.7;
    roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.1, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x8a6a48 })
    );
    door.position.set(0.6, 0.55, 1.42);
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xcdd7cf })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0.6, 0.025, 2.8);
    base.castShadow = roof.castShadow = true;
    g.add(base, roof, door, path);
    g.position.set(endP.x - 3.4, 0, endP.z - 1);
    scene.add(g);
  })();
  const doorBox = makeBox(0.7);
  doorBox.position.set(endP.x - 2.6, 0.3, endP.z + 1.2);
  doorBox.scale.setScalar(0.0001);
  scene.add(doorBox);

  // Cross-traffic cars
  const cars: THREE.Group[] = [];
  (
    [
      [0x5a7fae, 14, 0.055, 1],
      [0xffffff, -24, 0.045, -1],
      [0xe0b23e, 28, 0.03, 1],
    ] as [number, number, number, number][]
  ).forEach(([col, lane, sp, dir], i) => {
    const g = new THREE.Group();
    const long = i === 2 ? 2.6 : 1.5;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.55, long),
      new THREE.MeshLambertMaterial({ color: col })
    );
    b.position.y = 0.45;
    b.castShadow = true;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.32, long * 0.5),
      new THREE.MeshLambertMaterial({ color: 0xbfe3d4 })
    );
    top.position.y = 0.85;
    g.add(b, top);
    [
      [-0.42, long * 0.32],
      [0.42, long * 0.32],
      [-0.42, -long * 0.32],
      [0.42, -long * 0.32],
    ].forEach(([x, z]) => {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10),
        new THREE.MeshLambertMaterial({ color: 0x101613 })
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.16, z);
      g.add(w);
    });
    g.position.set(dir > 0 ? -45 : 45, 0, lane);
    g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.userData = { sp, dir };
    scene.add(g);
    cars.push(g);
  });

  // Birds
  const birds: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const wingM = new THREE.MeshLambertMaterial({ color: 0x36423b });
    const wL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.14), wingM);
    wL.position.x = -0.26;
    const wR = wL.clone();
    wR.position.x = 0.26;
    b.add(wL, wR);
    b.userData = {
      r: 9 + i * 2.5,
      sp: 0.25 + i * 0.06,
      ph: i * 1.7,
      cz: 8 - i * 10,
      wL,
      wR,
    };
    scene.add(b);
    birds.push(b);
  }

  // Exhaust puffs
  const puffMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
  });
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      puffMat.clone() as THREE.MeshLambertMaterial
    );
    p.visible = false;
    p.userData = { life: 0 };
    scene.add(p);
    puffs.push(p);
  }
  let puffTimer = 0;

  // Driver
  const driver = new THREE.Group();
  (function buildDriver() {
    const skin = new THREE.MeshLambertMaterial({ color: 0x7a4a2b });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x0e9f6e });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f2c });
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.2),
      shirt
    );
    torso.position.y = 0.78;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      skin
    );
    head.position.y = 1.12;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10),
      new THREE.MeshLambertMaterial({ color: 0x101613 })
    );
    cap.position.y = 1.22;
    const legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.5, 0.14),
      pants
    );
    legL.position.set(-0.09, 0.32, 0);
    const legR = legL.clone();
    legR.position.x = 0.09;
    const armL = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.38, 0.12),
      shirt
    );
    armL.position.set(-0.24, 0.82, 0);
    const armR = armL.clone();
    armR.position.x = 0.24;
    const carry = makeBox(0.34);
    carry.position.set(0, 0.72, 0.26);
    driver.add(torso, head, cap, legL, legR, armL, armR, carry);
    driver.userData = { legL, legR, armL, armR, carry };
    driver.traverse((o) => {
      if (o instanceof THREE.Mesh && "castShadow" in o) o.castShadow = true;
    });
    driver.visible = false;
    scene.add(driver);
  })();
  const doorstep = new THREE.Vector3(endP.x - 2.4, 0, endP.z + 1.1);

  // --- The VAN ---
  const van = new THREE.Group();
  const chassis = new THREE.Group();
  van.add(chassis);
  const vanGreen = new THREE.MeshLambertMaterial({ color: 0x0e9f6e });
  const vanDark = new THREE.MeshLambertMaterial({ color: 0x101613 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe3d4 });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.85, 2.05),
    vanGreen
  );
  body.position.y = 0.62;
  body.castShadow = true;
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.42, 1.55),
    glassMat
  );
  cab.position.set(0, 1.22, -0.02);
  const roofBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.09, 1.65),
    vanGreen
  );
  roofBox.position.set(0, 1.46, -0.02);
  roofBox.castShadow = true;
  const bumperF = new THREE.Mesh(
    new THREE.BoxGeometry(1.14, 0.16, 0.1),
    vanDark
  );
  bumperF.position.set(0, 0.3, 1.15);
  const bumperB = bumperF.clone();
  bumperB.position.z = -1.15;
  const mirrorL = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.14, 0.1),
    vanDark
  );
  mirrorL.position.set(-0.6, 1.12, 0.82);
  const mirrorR = mirrorL.clone();
  mirrorR.position.x = 0.6;
  // Lights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff4cf });
  const tl = new THREE.MeshBasicMaterial({ color: 0xe4573d });
  [-0.36, 0.36].forEach((x) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.03), hl);
    h.position.set(x, 0.62, 1.11);
    chassis.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.03), tl);
    t.position.set(x, 0.7, -1.11);
    chassis.add(t);
  });
  // Decal canvas texture
  const decalCanvas = document.createElement("canvas");
  decalCanvas.width = 512;
  decalCanvas.height = 128;
  const decalTex = new THREE.CanvasTexture(decalCanvas);
  const paintDecal = (cityLabel: string) => {
    const x = decalCanvas.getContext("2d")!;
    x.fillStyle = "#0e9f6e";
    x.fillRect(0, 0, 512, 128);
    x.fillStyle = "#ffffff";
    x.font = "800 92px Arial, sans-serif";
    x.textBaseline = "middle";
    x.fillText("gridd", 36, 70);
    x.fillStyle = "rgba(255,255,255,.85)";
    x.font = "700 26px Arial";
    x.fillText(cityLabel + " · SAME DAY", 36, 108);
    decalTex.needsUpdate = true;
  };
  paintDecal("DAYTON");
  (function decal() {
    const m = new THREE.MeshBasicMaterial({ map: decalTex });
    const pL = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), m);
    pL.position.set(-0.556, 0.66, -0.15);
    pL.rotation.y = -Math.PI / 2;
    const pR = pL.clone();
    pR.position.x = 0.556;
    pR.rotation.y = Math.PI / 2;
    chassis.add(pL, pR);
  })();
  chassis.add(body, cab, roofBox, bumperF, bumperB, mirrorL, mirrorR);
  const wheels: THREE.Mesh[] = [];
  [
    [-0.58, 0.66],
    [0.58, 0.66],
    [-0.58, -0.7],
    [0.58, -0.7],
  ].forEach(([x, z]) => {
    const w = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.18, 14),
      vanDark
    );
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.24, z);
    w.castShadow = true;
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.19, 10),
      new THREE.MeshLambertMaterial({ color: 0x8fa096 })
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.24, z);
    chassis.add(w, hub);
    wheels.push(w);
  });
  scene.add(van);

  // Scroll tracking
  let target = 0;
  let current = 0;
  let lastTime = performance.now();
  const measure = () =>
    clamp(
      window.scrollY /
        (document.documentElement.scrollHeight - window.innerHeight),
      0,
      1
    );
  const onScroll = () => {
    target = measure();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  target = current = measure();

  // Camera keyframes
  const camKeys = [
    {
      off: new THREE.Vector3(3.4, 2.2, 6.5),
      look: new THREE.Vector3(0, 0.8, 0),
    },
    {
      off: new THREE.Vector3(-5.5, 2.6, 3.5),
      look: new THREE.Vector3(0, 0.7, 0),
    },
    {
      off: new THREE.Vector3(2.5, 7.5, 4.5),
      look: new THREE.Vector3(0, 0.2, -1),
    },
    {
      off: new THREE.Vector3(4.8, 1.6, -4.2),
      look: new THREE.Vector3(0, 0.9, 1),
    },
    {
      off: new THREE.Vector3(-3.6, 2.4, 6.8),
      look: new THREE.Vector3(0, 0.8, -0.5),
    },
  ];
  const vOff = new THREE.Vector3();
  const vLook = new THREE.Vector3();

  let photoTaken = false;
  let confettiDone = false;
  let dist = 0;
  const lastPos = route.getPointAt(0).clone();
  let lastYaw = 0;
  let rafId = 0;

  function frame() {
    rafId = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    current += (target - current) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    const t = clamp(clamp(current, 0.0001, 0.9999) / 0.84, 0.0001, 0.9999);

    const p = route.getPointAt(t);
    const tan = route.getTangent(t);
    van.position.set(p.x, 0, p.z);
    const yaw = Math.atan2(tan.x, tan.z);
    van.rotation.y = yaw;

    const speed = p.distanceTo(lastPos);
    dist += speed;
    let dYaw = yaw - lastYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    lastYaw = yaw;
    lastPos.copy(p);
    const lean = clamp(-dYaw * 22, -0.13, 0.13);
    chassis.rotation.z += (lean - chassis.rotation.z) * 0.12;
    chassis.position.y =
      0.02 +
      (reduced
        ? 0
        : Math.sin(now * 0.008) * 0.015 + clamp(speed * 0.5, 0, 0.03));
    wheels.forEach((w) => {
      w.rotation.x = dist / 0.24;
    });

    // Pickup boxes shrink
    pickupBoxes.forEach((b) => {
      const [a, zLoad] = b.userData.load as number[];
      const k = 1 - smooth(a, zLoad, t);
      b.scale.setScalar(Math.max(k, 0.0001));
      b.position.y = 0.4 * k + 0.02;
    });
    // Dropoff box grows
    const dk = smooth(0.968, 0.978, t);
    doorBox.scale.setScalar(Math.max(dk, 0.0001));
    doorBox.rotation.y = (1 - dk) * 1.2;

    // Pins pulse
    pins.forEach((pin, i) => {
      const d = Math.abs((pin.userData.t as number) - t);
      const near = clamp(1 - d * 18, 0, 1);
      const s =
        1 +
        near * 0.35 +
        (reduced ? 0 : Math.sin(now * 0.006 + i) * 0.03);
      pin.scale.setScalar(s);
      pin.children[0].position.y =
        1.05 + (reduced ? 0 : Math.sin(now * 0.004 + i) * 0.05);
    });

    // Clouds
    if (!reduced)
      clouds.forEach((c) => {
        c.position.x += (c.userData.v as number) * 0.016;
        if (c.position.x > 46) c.position.x = -46;
      });

    // Camera blend
    const acts = camKeys.length - 1;
    const a = Math.min(Math.floor(t * acts), acts - 1);
    const f = t * acts - a;
    vOff.lerpVectors(camKeys[a].off, camKeys[a + 1].off, f);
    vLook.lerpVectors(camKeys[a].look, camKeys[a + 1].look, f);
    const ox = vOff.x * Math.cos(yaw) + vOff.z * Math.sin(yaw);
    const oz = -vOff.x * Math.sin(yaw) + vOff.z * Math.cos(yaw);
    camera.position.set(p.x + ox, vOff.y, p.z + oz);
    camera.lookAt(p.x + vLook.x, vLook.y + 0.6, p.z + vLook.z);

    // Buildings rise
    for (const b of buildings) {
      const d = Math.abs(b.position.z - p.z);
      const k = clamp((26 - d) / 14, 0.06, 1);
      b.scale.y += (k - b.scale.y) * 0.08;
      b.position.y = ((b.userData.h as number) * b.scale.y) / 2;
    }

    // Living world
    if (!reduced) {
      cars.forEach((c) => {
        c.position.x += (c.userData.sp as number) * (c.userData.dir as number);
        if ((c.userData.dir as number) > 0 && c.position.x > 45)
          c.position.x = -45;
        if ((c.userData.dir as number) < 0 && c.position.x < -45)
          c.position.x = 45;
      });
      birds.forEach((b) => {
        const u = b.userData as {
          r: number;
          sp: number;
          ph: number;
          cz: number;
          wL: THREE.Mesh;
          wR: THREE.Mesh;
        };
        const a2 = now * 0.0004 * u.sp + u.ph;
        b.position.set(
          Math.cos(a2) * u.r,
          8.5 + Math.sin(a2 * 2) * 0.6,
          u.cz + Math.sin(a2) * u.r * 0.5
        );
        b.rotation.y = -a2 + Math.PI / 2;
        const flap = Math.sin(now * 0.02 + u.ph) * 0.6;
        u.wL.rotation.z = flap;
        u.wR.rotation.z = -flap;
      });
      puffTimer -= 16;
      if (puffTimer <= 0 && speed < 0.004) {
        const free = puffs.find((pp) => !pp.visible);
        if (free) {
          const back = new THREE.Vector3(0, 0.35, -1.25).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            yaw
          );
          free.position.copy(van.position).add(back);
          free.scale.setScalar(0.6);
          (free.material as THREE.MeshLambertMaterial).opacity = 0.45;
          free.visible = true;
          free.userData.life = 1;
        }
        puffTimer = 420;
      }
      puffs.forEach((pp) => {
        if (!pp.visible) return;
        pp.userData.life -= 0.016;
        pp.position.y += 0.012;
        pp.scale.multiplyScalar(1.018);
        (pp.material as THREE.MeshLambertMaterial).opacity = (pp.userData.life as number) * 0.45;
        if ((pp.userData.life as number) <= 0) pp.visible = false;
      });
    }

    // Driver
    const D = driver.userData as {
      legL: THREE.Mesh;
      legR: THREE.Mesh;
      armL: THREE.Mesh;
      armR: THREE.Mesh;
      carry: THREE.Group;
    };
    if (t > 0.935) {
      driver.visible = true;
      const vanSide = new THREE.Vector3(-0.9, 0, 0.3)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .add(van.position);
      const walk = smooth(0.945, 0.968, t);
      const back = smooth(0.982, 0.996, t);
      const pos = new THREE.Vector3().lerpVectors(vanSide, doorstep, walk);
      if (back > 0) pos.lerpVectors(doorstep, vanSide, back);
      driver.position.copy(pos);
      driver.lookAt(
        back > 0 ? vanSide.x : doorstep.x,
        0,
        back > 0 ? vanSide.z : doorstep.z
      );
      const moving = (walk > 0 && walk < 1) || (back > 0 && back < 1);
      const step = moving ? Math.sin(now * 0.014) * 0.5 : 0;
      D.legL.rotation.x = step;
      D.legR.rotation.x = -step;
      D.carry.visible = t < 0.9695;
      if (D.carry.visible) {
        D.armL.rotation.x = -1.1;
        D.armR.rotation.x = -1.1;
      } else if (t > 0.972 && t < 0.995) {
        D.armL.rotation.x = 0;
        D.armR.rotation.x = Math.PI - 0.4;
        D.armR.rotation.z = Math.sin(now * 0.012) * 0.35;
      } else {
        D.armL.rotation.x = moving ? step * 0.6 : 0;
        D.armR.rotation.x = moving ? -step * 0.6 : 0;
        D.armR.rotation.z = 0;
      }
    } else {
      driver.visible = false;
    }

    // Finale one-shots
    if (t > 0.972 && !photoTaken) {
      photoTaken = true;
      try {
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL("image/jpeg", 0.7);
        callbacks.onPhoto?.(dataUrl);
      } catch {
        /* silent */
      }
    }
    // Reset one-shot flags when user scrolls back (t drops below 0.9)
    if (t < 0.9 && photoTaken) {
      photoTaken = false;
      confettiDone = false;
      callbacks.onDelivered?.(false);
    }
    // Card visibility: separate from confetti one-shot
    const finale = t > 0.975;
    if (finale) {
      callbacks.onDelivered?.(true);
    } else {
      callbacks.onDelivered?.(false);
    }

    renderer.render(scene, camera);
  }
  frame();

  // Resize
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  // Cleanup function
  const dispose = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    setMarket: (m: "OH" | "GA") => {
      paintDecal(m === "OH" ? "DAYTON" : "NORCROSS");
    },
    dispose,
  };
}