"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

export default function CuteKartGame() {
  const mountRef = useRef(null);
  const controlsRef = useRef({ left: false, right: false, drift: false, turbo: false });
  const restartRef = useRef(null);
  const pausedRef = useRef(false);

  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(0);
  const [status, setStatus] = useState("Collect hearts and ride through happy clouds");
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let alive = true;
    let crashed = false;
    let scoreValue = 0;
    let boostValue = 0;
    let driftCharge = 0;
    let boostTimer = 0;
    let lastUi = 0;
    let trackScroll = 0;
    let playerOffset = 0;
    let playerVelocity = 0;
    let last = performance.now();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#98e9ff");
    scene.fog = new THREE.Fog("#98e9ff", 24, 86);

    const camera = new THREE.PerspectiveCamera(56, mount.clientWidth / mount.clientHeight, 0.1, 180);
    camera.position.set(0, 6.4, 10.5);
    camera.lookAt(0, 1.25, -8.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const pastel = {
      ink: "#4d2438",
      road: "#7f86ad",
      grass: "#a7ef9d",
      pink: "#ff98d6",
      hotPink: "#ff5dac",
      softPink: "#ffd8f0",
      blue: "#a9efff",
      lavender: "#ddc9ff",
      yellow: "#ffe36e",
      white: "#fff7fd",
      red: "#ff7d90"
    };

    const mat = {
      road: new THREE.MeshStandardMaterial({ color: pastel.road, roughness: 0.85 }),
      grass: new THREE.MeshStandardMaterial({ color: pastel.grass, roughness: 1 }),
      pink: new THREE.MeshStandardMaterial({ color: pastel.pink, roughness: 0.42, metalness: 0.03 }),
      hotPink: new THREE.MeshStandardMaterial({ color: pastel.hotPink, roughness: 0.4 }),
      softPink: new THREE.MeshStandardMaterial({ color: pastel.softPink, roughness: 0.48 }),
      blue: new THREE.MeshStandardMaterial({ color: pastel.blue, roughness: 0.4 }),
      lavender: new THREE.MeshStandardMaterial({ color: pastel.lavender, roughness: 0.45 }),
      yellow: new THREE.MeshStandardMaterial({ color: pastel.yellow, roughness: 0.35, metalness: 0.12 }),
      white: new THREE.MeshStandardMaterial({ color: pastel.white, roughness: 0.35 }),
      red: new THREE.MeshStandardMaterial({ color: pastel.red, roughness: 0.55 }),
      black: new THREE.MeshStandardMaterial({ color: "#2b2530", roughness: 0.45 }),
      tire: new THREE.MeshStandardMaterial({ color: "#2a2530", roughness: 0.82 }),
      gem: new THREE.MeshStandardMaterial({ color: "#ff5bd6", roughness: 0.12, metalness: 0.12, emissive: "#ff7be2", emissiveIntensity: 0.5 }),
      boost: new THREE.MeshBasicMaterial({ color: "#fff1a6", transparent: true, opacity: 0.85 }),
      visor: new THREE.MeshPhysicalMaterial({ color: "#ffc4f1", transparent: true, opacity: 0.55, roughness: 0.08, transmission: 0.16 })
    };

    const hemi = new THREE.HemisphereLight("#ffffff", "#ffc3eb", 2.3);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight("#ffffff", 2.4);
    sun.position.set(4, 9, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 42;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 190), mat.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    function drawRoundRect(ctx, x, y, w, h, r) {
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, r);
        return;
      }
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }

    function makeFaceSprite({ blush = true } = {}) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 256, 128);

      ctx.fillStyle = pastel.ink;
      ctx.beginPath();
      ctx.arc(78, 48, 13, 0, Math.PI * 2);
      ctx.arc(178, 48, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = pastel.ink;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(128, 55, 32, 0.18, Math.PI - 0.18, false);
      ctx.stroke();

      if (blush) {
        ctx.fillStyle = "rgba(255, 110, 150, 0.68)";
        ctx.beginPath();
        ctx.arc(48, 76, 20, 0, Math.PI * 2);
        ctx.arc(208, 76, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    }

    function makeHeartSprite(size = 256) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#ff6fb5";
      ctx.strokeStyle = "#a93672";
      ctx.lineWidth = size * 0.04;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.83);
      ctx.bezierCurveTo(size * 0.12, size * 0.55, size * 0.18, size * 0.18, size * 0.44, size * 0.3);
      ctx.bezierCurveTo(size * 0.52, size * 0.12, size * 0.88, size * 0.18, size * 0.5, size * 0.83);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(size * 0.41, size * 0.36, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    }

    function makeCloudSprite({ face = true, color = "#ffffff" } = {}) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 256);
      ctx.fillStyle = color;
      ctx.strokeStyle = "#dfabd0";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(160, 130, 62, 0, Math.PI * 2);
      ctx.arc(230, 90, 76, 0, Math.PI * 2);
      ctx.arc(318, 130, 58, 0, Math.PI * 2);
      drawRoundRect(ctx, 120, 120, 250, 70, 35);
      ctx.fill();
      ctx.stroke();

      if (face) {
        ctx.fillStyle = pastel.ink;
        ctx.beginPath();
        ctx.arc(220, 130, 8, 0, Math.PI * 2);
        ctx.arc(288, 130, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pastel.ink;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(254, 138, 18, 0.14, Math.PI - 0.14, false);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 120, 160, 0.7)";
        ctx.beginPath();
        ctx.arc(194, 150, 14, 0, Math.PI * 2);
        ctx.arc(316, 150, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    }

    function makeStarSprite() {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 160, 160);
      ctx.fillStyle = "#fff3a6";
      ctx.strokeStyle = "#ffd45a";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(80, 12);
      ctx.quadraticCurveTo(96, 66, 148, 80);
      ctx.quadraticCurveTo(96, 94, 80, 148);
      ctx.quadraticCurveTo(64, 94, 12, 80);
      ctx.quadraticCurveTo(64, 66, 80, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    }

    function makeRoundedBox(width, height, depth, material, radius = 0.25) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      core.castShadow = true;
      core.receiveShadow = true;
      group.add(core);

      const sphereGeo = new THREE.SphereGeometry(radius, 16, 12);
      for (const x of [-width / 2 + radius, width / 2 - radius]) {
        for (const y of [-height / 2 + radius, height / 2 - radius]) {
          for (const z of [-depth / 2 + radius, depth / 2 - radius]) {
            const s = new THREE.Mesh(sphereGeo, material);
            s.position.set(x, y, z);
            s.castShadow = true;
            s.receiveShadow = true;
            group.add(s);
          }
        }
      }
      return group;
    }

    function makeCrown() {
      const crown = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.18, 5), mat.yellow);
      base.castShadow = true;
      crown.add(base);

      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 4), mat.yellow);
        spike.position.set(Math.cos(angle) * 0.39, 0.32, Math.sin(angle) * 0.39);
        spike.rotation.y = angle;
        spike.castShadow = true;
        crown.add(spike);
      }

      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 18), mat.gem);
      gem.position.set(0, 0.18, 0.58);
      crown.add(gem);
      return crown;
    }

    function makeKart() {
      const kart = new THREE.Group();
      kart.name = "Air Horse 1 Kart";

      const body = makeRoundedBox(2.15, 0.5, 2.7, mat.pink, 0.18);
      body.position.y = 0.47;
      kart.add(body);

      const nose = makeRoundedBox(1.55, 0.36, 0.92, mat.hotPink, 0.17);
      nose.position.set(0, 0.72, 1.08);
      kart.add(nose);

      const bumper = makeRoundedBox(2.5, 0.2, 0.26, mat.white, 0.1);
      bumper.position.set(0, 0.66, 1.66);
      kart.add(bumper);

      const seat = makeRoundedBox(1.1, 0.42, 0.85, mat.softPink, 0.16);
      seat.position.set(0, 0.95, -0.33);
      kart.add(seat);

      const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.46, 28);
      const wheelPositions = [
        [-1.25, 0.38, -0.92],
        [1.25, 0.38, -0.92],
        [-1.25, 0.38, 1.04],
        [1.25, 0.38, 1.04]
      ];

      for (const [x, y, z] of wheelPositions) {
        const wheel = new THREE.Mesh(wheelGeo, mat.tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, y, z);
        wheel.castShadow = true;
        kart.add(wheel);
        kart.userData.wheels = [...(kart.userData.wheels || []), wheel];

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 20), mat.lavender);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, y, z);
        hub.castShadow = true;
        kart.add(hub);
      }

      const axleGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.24, 18);
      for (const z of [-0.92, 1.04]) {
        const axle = new THREE.Mesh(axleGeo, mat.white);
        axle.rotation.z = Math.PI / 2;
        axle.position.set(0, 0.38, z);
        kart.add(axle);
      }

      const driver = new THREE.Group();
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.72, 42, 32), mat.pink);
      helmet.scale.set(1, 1.08, 1);
      helmet.position.set(0, 1.5, -0.22);
      helmet.castShadow = true;
      driver.add(helmet);

      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 22), mat.visor);
      visor.scale.set(1.05, 0.58, 0.34);
      visor.position.set(0, 1.49, 0.23);
      visor.castShadow = true;
      driver.add(visor);

      const face = makeFaceSprite();
      face.position.set(0, 1.49, 0.78);
      face.scale.set(0.82, 0.42, 1);
      driver.add(face);

      const crown = makeCrown();
      crown.position.set(0, 2.2, -0.1);
      crown.scale.set(0.78, 0.78, 0.78);
      driver.add(crown);

      const armGeo = new THREE.CapsuleGeometry(0.11, 0.45, 8, 16);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(armGeo, mat.blue);
        arm.position.set(side * 0.52, 1.12, 0.12);
        arm.rotation.z = side * 0.75;
        arm.rotation.x = 0.8;
        arm.castShadow = true;
        driver.add(arm);
      }

      kart.add(driver);

      const frontFace = makeFaceSprite({ blush: true });
      frontFace.position.set(0, 0.82, 1.88);
      frontFace.scale.set(0.55, 0.27, 1);
      kart.add(frontFace);

      const exhaustGeo = new THREE.ConeGeometry(0.12, 0.65, 18);
      for (const x of [-0.42, 0.42]) {
        const exhaust = new THREE.Mesh(exhaustGeo, mat.boost);
        exhaust.position.set(x, 0.43, -1.48);
        exhaust.rotation.x = -Math.PI / 2;
        exhaust.scale.set(1, 1, 0.01);
        exhaust.visible = false;
        kart.add(exhaust);
        kart.userData.exhausts = [...(kart.userData.exhausts || []), exhaust];
      }

      kart.position.set(0, 0, 2.15);
      return kart;
    }

    const kart = makeKart();
    scene.add(kart);

    function rawTrackCurve(t) {
      return Math.sin(t * 0.052) * 2.35 + Math.sin(t * 0.018 + 1.7) * 2.1 + Math.sin(t * 0.109) * 0.32;
    }

    function trackCurve(t) {
      // Start the race in the exact center, then slowly bloom into cute curves.
      // This keeps the first road pieces and the kart lined up in the middle.
      const startCenter = rawTrackCurve(0);
      const normalizedCurve = rawTrackCurve(t) - startCenter;
      const curveFade = THREE.MathUtils.smoothstep(t, 14, 42);
      return normalizedCurve * curveFade;
    }

    function trackAngle(t) {
      const a = trackCurve(t);
      const b = trackCurve(t + 3);
      return Math.atan2(b - a, 3);
    }

    const roadSegments = [];
    const segmentCount = 34;
    const segmentLength = 4.1;
    const roadWidth = 7.8;

    for (let i = 0; i < segmentCount; i += 1) {
      const group = new THREE.Group();
      group.userData.index = i;

      const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, segmentLength + 0.2), mat.road);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      group.add(road);

      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(0.66, 0.12, segmentLength + 0.18),
          i % 2 === 0 ? mat.red : mat.white
        );
        curb.position.set(side * (roadWidth / 2 + 0.34), 0.06, 0);
        curb.castShadow = true;
        curb.receiveShadow = true;
        group.add(curb);
      }

      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 1.2), mat.white);
      dash.position.set(0, 0.08, 0);
      group.add(dash);

      scene.add(group);
      roadSegments.push(group);
    }

    const scenery = [];
    function makeTree() {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.7, 10), mat.hotPink);
      trunk.position.y = 0.34;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let i = 0; i < 3; i += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), i % 2 ? mat.lavender : mat.softPink);
        puff.position.set((i - 1) * 0.22, 0.84 + i * 0.03, Math.sin(i) * 0.12);
        puff.castShadow = true;
        tree.add(puff);
      }
      return tree;
    }

    for (let i = 0; i < 42; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const tree = makeTree();
      tree.userData.distance = 8 + Math.random() * 125;
      tree.userData.side = side;
      tree.userData.offset = 7.5 + Math.random() * 5.5;
      tree.scale.setScalar(0.72 + Math.random() * 0.7);
      scene.add(tree);
      scenery.push(tree);
    }

    const clouds = [];
    for (let i = 0; i < 18; i += 1) {
      const cloud = makeCloudSprite({ face: true });
      cloud.userData.distance = 8 + Math.random() * 95;
      cloud.userData.side = Math.random() < 0.5 ? -1 : 1;
      cloud.userData.offset = 7 + Math.random() * 13;
      cloud.position.y = 5.5 + Math.random() * 7;
      cloud.scale.setScalar(2.1 + Math.random() * 1.9);
      scene.add(cloud);
      clouds.push(cloud);
    }

    const floatingStars = [];
    for (let i = 0; i < 12; i += 1) {
      const star = makeStarSprite();
      star.userData.distance = 10 + Math.random() * 95;
      star.userData.side = Math.random() < 0.5 ? -1 : 1;
      star.userData.offset = 2 + Math.random() * 8;
      star.position.y = 2.2 + Math.random() * 4.5;
      star.scale.setScalar(0.45 + Math.random() * 0.35);
      scene.add(star);
      floatingStars.push(star);
    }

    const items = [];
    const lanes = [-2.5, -1.25, 0, 1.25, 2.5];

    function spawnTrackItem(item, minDistance = 34, maxDistance = 115) {
      item.userData.distance = minDistance + Math.random() * (maxDistance - minDistance);
      item.userData.lane = lanes[Math.floor(Math.random() * lanes.length)];
      item.visible = true;
    }

    for (let i = 0; i < 16; i += 1) {
      const heart = makeHeartSprite();
      heart.scale.set(0.75, 0.75, 1);
      heart.userData.kind = "heart";
      spawnTrackItem(heart, 18, 120);
      scene.add(heart);
      items.push(heart);
    }

    for (let i = 0; i < 9; i += 1) {
      const cloudPuff = makeCloudSprite({ face: true, color: "#fff7fe" });
      cloudPuff.scale.set(1.05, 0.62, 1);
      cloudPuff.userData.kind = "cloud";
      spawnTrackItem(cloudPuff, 35, 130);
      scene.add(cloudPuff);
      items.push(cloudPuff);
    }

    const sparkles = [];
    for (let i = 0; i < 28; i += 1) {
      const sparkle = makeStarSprite();
      sparkle.visible = false;
      sparkle.scale.setScalar(0.18 + Math.random() * 0.14);
      scene.add(sparkle);
      sparkles.push(sparkle);
    }

    function updateUi(now, force = false) {
      if (!force && now - lastUi < 90) return;
      lastUi = now;
      setScore(scoreValue);
      setBoost(Math.round(boostValue));
    }

    function startTurbo(amount = 1.25) {
      if (boostValue <= 0 && amount <= 1.25) return;
      boostTimer = Math.max(boostTimer, amount);
      boostValue = clamp(boostValue - 35, 0, 100);
      setStatus("Turbo hearts! ✦");
      setTimeout(() => {
        if (!crashed) setStatus("Collect hearts and ride through happy clouds");
      }, 950);
    }

    function restart() {
      crashed = false;
      scoreValue = 0;
      boostValue = 0;
      driftCharge = 0;
      boostTimer = 0;
      trackScroll = 0;
      playerOffset = 0;
      playerVelocity = 0;
      kart.position.set(0, 0, 2.15);
      kart.rotation.set(0, 0, 0);
      items.forEach((item) => spawnTrackItem(item, 20, 125));
      setGameOver(false);
      setStatus("Collect hearts and ride through happy clouds");
      updateUi(performance.now(), true);
    }

    restartRef.current = restart;

    function crash() {
      if (crashed) return;
      crashed = true;
      setGameOver(true);
      setStatus("Soft sparkle pause");
    }

    const keys = { left: false, right: false, drift: false, turbo: false };
    function onKeyDown(e) {
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") keys.left = true;
      if (key === "arrowright" || key === "d") keys.right = true;
      if (key === " " || key === "shift") keys.drift = true;
      if (key === "w" || key === "arrowup") keys.turbo = true;
      if (key === "r" && crashed) restart();
    }

    function onKeyUp(e) {
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") keys.left = false;
      if (key === "arrowright" || key === "d") keys.right = false;
      if (key === " " || key === "shift") keys.drift = false;
      if (key === "w" || key === "arrowup") keys.turbo = false;
    }

    function onResize() {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    function updateRoad() {
      const modulo = ((trackScroll % segmentLength) + segmentLength) % segmentLength;
      for (let i = 0; i < roadSegments.length; i += 1) {
        const dist = i * segmentLength - modulo;
        const worldT = trackScroll + dist;
        const center = trackCurve(worldT);
        const angle = trackAngle(worldT);
        const segment = roadSegments[i];
        segment.position.set(center, 0, 5.1 - dist);
        segment.rotation.y = angle;
      }
    }

    function updateSceneryObject(obj, dt, speed, yFallback = 0) {
      obj.userData.distance -= speed * dt;
      if (obj.userData.distance < -5) {
        obj.userData.distance += 132 + Math.random() * 32;
        obj.userData.side = Math.random() < 0.5 ? -1 : 1;
      }
      const d = obj.userData.distance;
      const center = trackCurve(trackScroll + d);
      obj.position.x = center + obj.userData.side * obj.userData.offset;
      obj.position.z = kart.position.z - d;
      if (yFallback) obj.position.y = yFallback;
    }

    function updateItems(dt, speed, now) {
      for (const item of items) {
        item.userData.distance -= speed * dt;
        if (item.userData.distance < -5) spawnTrackItem(item, 80, 145);

        const d = item.userData.distance;
        const center = trackCurve(trackScroll + d);
        item.position.x = center + item.userData.lane;
        item.position.z = kart.position.z - d;

        if (item.userData.kind === "heart") {
          item.position.y = 1.35 + Math.sin(now * 0.004 + d) * 0.16;
          item.rotation.z += dt * 2.1;
        } else {
          item.position.y = 0.85 + Math.sin(now * 0.003 + d) * 0.08;
          item.rotation.z = Math.sin(now * 0.002 + d) * 0.05;
        }

        const closeZ = Math.abs(item.position.z - kart.position.z);
        const closeX = Math.abs(item.position.x - kart.position.x);

        if (item.visible && closeZ < 0.85 && closeX < 0.82) {
          if (item.userData.kind === "heart") {
            item.visible = false;
            scoreValue += 10;
            boostValue = clamp(boostValue + 12, 0, 100);
            setStatus("Sweet heart collected ♡");
            setTimeout(() => {
              if (!crashed) setStatus("Collect hearts and ride through happy clouds");
            }, 650);
            spawnTrackItem(item, 90, 150);
          } else if (item.userData.kind === "cloud") {
            item.visible = false;
            scoreValue += 5;
            boostValue = clamp(boostValue + 5, 0, 100);
            setStatus("Soft cloud sparkle +5 ☁");
            setTimeout(() => {
              if (!crashed) setStatus("Collect hearts and ride through happy clouds");
            }, 650);
            spawnTrackItem(item, 90, 150);
          }
        }
      }
    }

    function updateSparkles(now, drifting) {
      for (let i = 0; i < sparkles.length; i += 1) {
        const sparkle = sparkles[i];
        const active = boostTimer > 0 || drifting;
        sparkle.visible = active;
        if (!active) continue;
        const side = i % 2 === 0 ? -1 : 1;
        const spread = drifting ? 0.65 : 0.38;
        sparkle.position.set(
          kart.position.x + side * (0.7 + Math.random() * spread),
          0.42 + Math.random() * 0.55,
          kart.position.z - 1.35 - Math.random() * (boostTimer > 0 ? 2.4 : 0.75)
        );
        const s = (boostTimer > 0 ? 0.25 : 0.16) + Math.sin(now * 0.012 + i) * 0.04;
        sparkle.scale.setScalar(Math.max(0.08, s));
      }

      for (const exhaust of kart.userData.exhausts || []) {
        exhaust.visible = boostTimer > 0;
        const flameScale = 1 + Math.sin(now * 0.04) * 0.25;
        exhaust.scale.set(flameScale, flameScale, 1.4 + flameScale);
      }
    }

    function animate(now) {
      if (!alive) return;
      requestAnimationFrame(animate);

      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      if (pausedRef.current) {
        renderer.render(scene, camera);
        return;
      }

      const controls = controlsRef.current;
      const steer = (keys.left || controls.left ? -1 : 0) + (keys.right || controls.right ? 1 : 0);
      const drifting = (keys.drift || controls.drift) && Math.abs(steer) > 0;
      const turboPressed = keys.turbo || controls.turbo;

      if (!crashed) {
        if (turboPressed && boostValue >= 35) startTurbo(1.25);

        const baseSpeed = 12.8;
        const turboSpeed = boostTimer > 0 ? 7.6 : 0;
        const driftPenalty = drifting ? -1.5 : 0;
        const speed = baseSpeed + turboSpeed + driftPenalty + Math.min(scoreValue * 0.006, 2.2);

        trackScroll += speed * dt;
        boostTimer = Math.max(0, boostTimer - dt);

        if (drifting) {
          driftCharge = clamp(driftCharge + dt * 26, 0, 100);
          boostValue = clamp(boostValue + dt * 4.5, 0, 100);
          setStatus("Drift sparks charging ✦");
        } else if (driftCharge > 22) {
          boostValue = clamp(boostValue + driftCharge * 0.18, 0, 100);
          driftCharge = 0;
          if (boostValue >= 35) setStatus("Turbo ready! Hold W or TURBO");
        } else {
          driftCharge = Math.max(0, driftCharge - dt * 55);
        }

        const steerPower = drifting ? 7.7 : 6.0;
        playerVelocity += steer * steerPower * dt;
        playerVelocity *= drifting ? 0.95 : 0.88;
        playerOffset += playerVelocity * dt;
        playerOffset = clamp(playerOffset, -3.05, 3.05);

        const roadCenterAtKart = trackCurve(trackScroll + 2.9);
        kart.position.x = lerp(kart.position.x, roadCenterAtKart + playerOffset, 0.22);
        kart.position.y = Math.sin(now * 0.012) * 0.035;
        kart.rotation.z = lerp(kart.rotation.z, -steer * (drifting ? 0.26 : 0.12), 0.13);
        kart.rotation.y = lerp(kart.rotation.y, -steer * (drifting ? 0.42 : 0.22), 0.12);

        for (const wheel of kart.userData.wheels || []) {
          wheel.rotation.x += speed * dt * 3.2;
        }

        updateRoad();
        updateItems(dt, speed, now);

        for (const tree of scenery) updateSceneryObject(tree, dt, speed, 0);
        for (const cloud of clouds) {
          updateSceneryObject(cloud, dt, speed * 0.18, 0);
          cloud.position.y += Math.sin(now * 0.001 + cloud.userData.distance) * 0.004;
        }
        for (const star of floatingStars) {
          updateSceneryObject(star, dt, speed * 0.36, 0);
          star.rotation.z += dt * 0.9;
        }

        updateSparkles(now, drifting);
        updateUi(now);
      } else {
        kart.rotation.z = Math.sin(now * 0.018) * 0.25;
        kart.rotation.y = Math.sin(now * 0.017) * 0.22;
        updateSparkles(now, false);
      }

      renderer.render(scene, camera);
    }

    updateRoad();
    updateUi(performance.now(), true);
    requestAnimationFrame(animate);

    return () => {
      alive = false;
      restartRef.current = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);

      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (material.map) material.map.dispose();
            material.dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  function setControl(name, value) {
    controlsRef.current[name] = value;
  }

  function touchButton(name, label, className = "") {
    return (
      <button
        type="button"
        className={className}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setControl(name, true);
        }}
        onPointerUp={() => setControl(name, false)}
        onPointerCancel={() => setControl(name, false)}
        onPointerLeave={() => setControl(name, false)}
      >
        {label}
      </button>
    );
  }

  return (
    <main className="cuteKartPage">
      <div ref={mountRef} className="cuteKartCanvas" />

      <div className="cuteKartHud">
        <div className="cuteKartBadge">
          <span className="miniLabel">AH-1</span>
          <strong>Air Horse Kart</strong>
        </div>

        <button type="button" className="cutePause" onClick={() => setPaused((value) => !value)}>
          {paused ? "▶" : "Ⅱ"}
        </button>
      </div>

      <div className="cuteKartStats">
        <div className="pill">♡ {score}</div>
        <div className="boostPill">
          <span>BOOST</span>
          <div className="boostTrack">
            <div className="boostFill" style={{ width: `${boost}%` }} />
          </div>
        </div>
      </div>

      <div className="cuteKartStatus">{paused ? "Paused in the cotton candy pit stop" : status}</div>

      {gameOver && (
        <div className="cuteKartGameOver">
          <div className="cuteKartGameOverCard">
            <div className="gameOverIcon">☁️</div>
            <div className="cuteKartGameOverTitle">Soft Sparkle!</div>
            <div className="cuteKartGameOverText">Hearts collected: {score}</div>
            <button type="button" className="cuteKartRestart" onClick={() => restartRef.current?.()}>
              Restart race
            </button>
          </div>
        </div>
      )}

      <div className="cuteKartTouch">
        <div className="steerCluster">
          {touchButton("left", "◀", "steerButton")}
          {touchButton("right", "▶", "steerButton")}
        </div>
        <div className="actionCluster">
          {touchButton("drift", "DRIFT", "actionButton driftButton")}
          {touchButton("turbo", "TURBO", "actionButton turboButton")}
        </div>
      </div>

      <div className="keyboardHelp">Keyboard: A/D or arrows, Space/Shift drift, W turbo, R restart</div>
    </main>
  );
}
