"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const ASSET_PATHS = {
  kart: "/models/go-kart.glb",
  tree: "/models/tree.glb",
  grass: "/textures/grass-seamless.jpg",
};

// Shared world floor. The road is a thin slab sitting on the grass, not a sunken plane.
const SURFACE_Y = 0.0;
const ROAD_THICKNESS = 0.018;
const ROAD_TOP_Y = SURFACE_Y + ROAD_THICKNESS;
const KART_Z = -1.05;
const KART_WIDTH = 4.35;
const TREE_LIFT = 0.08;
// The imported GLB front points toward the camera by default.
// Rotate the model 180° so the kart drives away from the camera and you see the back.
const KART_MODEL_Y_ROTATION = Math.PI;

export default function CuteKartGame() {
  const mountRef = useRef(null);
  const controlsRef = useRef({ left: false, right: false, turbo: false, drift: false });
  const [hearts, setHearts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let alive = true;
    let raf = 0;
    let last = performance.now();
    let heartCount = 0;
    let boostValue = 100;
    let turboTimer = 0;
    let trackScroll = 0;
    let playerOffset = 0;
    let playerVelocity = 0;

    THREE.Cache.enabled = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#98eaff");

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      160
    );
    camera.position.set(0, 5.9, 9.05);
    camera.lookAt(0, 1.18, -8.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#ffffff", "#ffd4ef", 2.8));

    const sun = new THREE.DirectionalLight("#ffffff", 1.25);
    sun.position.set(3.5, 8, 6);
    scene.add(sun);

    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    const loadGLB = (url) =>
      new Promise((resolve, reject) => {
        loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
      });

    const loadTexture = (url) =>
      new Promise((resolve, reject) => {
        textureLoader.load(url, resolve, undefined, reject);
      });

    const roadMat = new THREE.MeshBasicMaterial({ color: "#7d85ad" });
    const curbPinkMat = new THREE.MeshBasicMaterial({ color: "#ff7899" });
    const curbWhiteMat = new THREE.MeshBasicMaterial({ color: "#fff7fd" });
    const roadLineMat = new THREE.MeshBasicMaterial({ color: "#fff7fd" });
    const heartMat = makeHeartMaterial();
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });

    let kartRoot;
    let kartModel;
    let treeModel;
    let grassTexture;
    let ground;

    const roadSegments = [];
    const trees = [];
    const heartSprites = [];
    const speedLines = [];

    Promise.all([
      loadGLB(ASSET_PATHS.kart),
      loadGLB(ASSET_PATHS.tree),
      loadTexture(ASSET_PATHS.grass),
    ])
      .then(([kartScene, treeScene, grassMap]) => {
        if (!alive) return;

        grassTexture = grassMap;
        grassTexture.colorSpace = THREE.SRGBColorSpace;
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(42, 58);
        grassTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

        const grassMat = new THREE.MeshBasicMaterial({ map: grassTexture });

        // Grass is the floor. The road is now a tiny slab sitting directly on it,
        // so there is no visible gap between the road edge and the grass.
        ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 240), grassMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = SURFACE_Y;
        scene.add(ground);

        kartRoot = new THREE.Group();
        kartRoot.position.set(0, ROAD_TOP_Y, KART_Z);
        scene.add(kartRoot);

        kartModel = kartScene;
        prepareModel(kartModel);
        fitModel(kartModel, KART_WIDTH);
        kartModel.position.y += 0.035;
        kartModel.rotation.y = KART_MODEL_Y_ROTATION;
        kartRoot.add(kartModel);

        treeModel = treeScene;
        prepareModel(treeModel);
        fitModel(treeModel, 2.25);

        createRoad();
        createTrees();
        createHearts();
        createSpeedLines();
        resetGame();

        setLoading(false);
        raf = requestAnimationFrame(animate);
      })
      .catch((error) => {
        console.error(error);
        // Keep the screen clean: no visible error text, only console output.
        setLoading(false);
      });

    function prepareModel(model) {
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.frustumCulled = true;
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          child.material.depthWrite = true;
          child.material.needsUpdate = true;
        }
      });
    }

    function fitModel(model, targetWidth) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxSide = Math.max(size.x, size.y, size.z) || 1;
      const scale = targetWidth / maxSide;
      model.scale.setScalar(scale);

      const box2 = new THREE.Box3().setFromObject(model);
      const center = box2.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.y -= box2.min.y;
      model.position.z -= center.z;
    }

    function makeHeartMaterial() {
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 192;
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, 192, 192);
      ctx.fillStyle = "#ff64b7";
      ctx.strokeStyle = "#b23876";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(96, 160);
      ctx.bezierCurveTo(22, 105, 38, 36, 83, 58);
      ctx.bezierCurveTo(100, 24, 170, 42, 96, 160);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.beginPath();
      ctx.arc(76, 67, 12, 0, Math.PI * 2);
      ctx.fill();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    }

    function createRoad() {
      const segmentCount = 26;
      const length = 5.2;
      const roadWidth = 7.65;
      const total = segmentCount * length;

      for (let i = 0; i < segmentCount; i += 1) {
        const group = new THREE.Group();
        group.userData.baseZ = -i * length;
        group.userData.length = length;
        group.userData.total = total;
        group.position.y = SURFACE_Y;

        const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, ROAD_THICKNESS, length + 0.1), roadMat);
        road.position.y = ROAD_THICKNESS / 2;
        group.add(road);

        for (const side of [-1, 1]) {
          const curb = new THREE.Mesh(
            new THREE.BoxGeometry(0.54, 0.075, length + 0.08),
            i % 2 === 0 ? curbPinkMat : curbWhiteMat
          );
          curb.position.set(side * (roadWidth / 2 + 0.18), ROAD_TOP_Y + 0.024, 0);
          group.add(curb);
        }

        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.026, 1.65), roadLineMat);
        dash.position.set(0, ROAD_TOP_Y + 0.014, 0);
        group.add(dash);

        roadSegments.push(group);
        scene.add(group);
      }
    }

    function createTrees() {
      const total = 158;

      for (let i = 0; i < 20; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const tree = treeModel.clone(true);
        tree.userData.baseZ = -10 - i * 7.7;
        tree.userData.side = side;
        tree.userData.total = total;
        tree.userData.sideDistance = 6.7 + (i % 3) * 1.25;
        tree.userData.wobble = Math.random() * 10;
        tree.rotation.y = Math.random() * Math.PI * 2;
        tree.scale.multiplyScalar(0.8 + (i % 4) * 0.07);

        // Some GLB exports have their visible model offset from the root pivot.
        // Keep that original root offset, then lift the clone so the full tree sits above grass.
        tree.updateMatrixWorld(true);
        const treeBox = new THREE.Box3().setFromObject(tree);
        tree.userData.baseY = tree.position.y + (SURFACE_Y + TREE_LIFT - treeBox.min.y);

        trees.push(tree);
        scene.add(tree);
      }
    }

    function createHearts() {
      const lanes = [-2.2, -1.1, 0, 1.1, 2.2];
      for (let i = 0; i < 14; i += 1) {
        const sprite = new THREE.Sprite(heartMat);
        sprite.scale.setScalar(0.64);
        sprite.userData.baseZ = -13 - i * 7.8;
        sprite.userData.total = 150;
        sprite.userData.lane = lanes[i % lanes.length];
        heartSprites.push(sprite);
        scene.add(sprite);
      }
    }

    function createSpeedLines() {
      for (let i = 0; i < 18; i += 1) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 4.2), sparkleMat);
        line.userData.baseZ = -i * 6;
        line.userData.total = 120;
        line.userData.x = (Math.random() - 0.5) * 15;
        line.position.y = ROAD_TOP_Y + 0.045;
        speedLines.push(line);
        scene.add(line);
      }
    }

    function pathCurve(distance) {
      // Centered start, then soft racing curves after the opening stretch.
      const t = Math.max(0, distance - 82);
      return Math.sin(t * 0.043) * 2.05 + Math.sin(t * 0.018) * 1.15;
    }

    function wrapZ(baseZ, total) {
      let z = baseZ + (trackScroll % total);
      if (z > 9) z -= total;
      return z;
    }

    function centerForZ(z) {
      return pathCurve(trackScroll - z);
    }

    function resetGame() {
      heartCount = 0;
      boostValue = 100;
      turboTimer = 0;
      trackScroll = 0;
      playerOffset = 0;
      playerVelocity = 0;
      setHearts(0);

      if (kartRoot) {
        kartRoot.position.set(0, ROAD_TOP_Y, KART_Z);
        kartRoot.rotation.set(0, 0, 0);
      }

      for (const item of heartSprites) item.visible = true;
    }

    function updateRoad() {
      for (const seg of roadSegments) {
        const z = wrapZ(seg.userData.baseZ, seg.userData.total);
        const center = centerForZ(z);
        seg.position.z = z;
        seg.position.x = center - playerOffset;
      }
    }

    function updateTrees(now) {
      for (const tree of trees) {
        const z = wrapZ(tree.userData.baseZ, tree.userData.total);
        const center = centerForZ(z);
        tree.position.z = z;
        tree.position.x = center - playerOffset + tree.userData.side * tree.userData.sideDistance;
        tree.position.y = tree.userData.baseY;
        tree.rotation.y += 0.0008 + Math.sin(now * 0.001 + tree.userData.wobble) * 0.00055;
      }
    }

    function updateHearts(now) {
      const kartZ = KART_Z;

      for (const item of heartSprites) {
        const z = wrapZ(item.userData.baseZ, item.userData.total);
        const center = centerForZ(z);
        item.position.z = z;
        item.position.x = center - playerOffset + item.userData.lane;
        item.position.y = ROAD_TOP_Y + 1.08 + Math.sin(now * 0.006 + item.userData.baseZ) * 0.18;
        item.rotation.z += 0.05;

        if (item.visible && Math.abs(item.position.z - kartZ) < 0.85 && Math.abs(item.position.x) < 0.72) {
          item.visible = false;
          heartCount += 1;
          boostValue = clamp(boostValue + 7, 0, 100);
          setHearts(heartCount);

          window.setTimeout(() => {
            if (alive) item.visible = true;
          }, 430);
        }
      }
    }

    function updateSpeedLines() {
      for (const line of speedLines) {
        const z = wrapZ(line.userData.baseZ, line.userData.total);
        line.position.z = z;
        line.position.x = line.userData.x - playerOffset * 0.25;
      }
    }

    function onResize() {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    }

    function animate(now) {
      if (!alive) return;
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      if (kartRoot) {
        const controls = controlsRef.current;
        const steering = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
        const driftFactor = controls.drift ? 1.55 : 1;
        const wantsTurbo = controls.turbo || turboTimer > 0;

        if (controls.turbo && boostValue > 1) {
          turboTimer = 0.42;
          boostValue = Math.max(0, boostValue - dt * 34);
        } else if (turboTimer > 0) {
          turboTimer -= dt;
        } else {
          boostValue = Math.min(100, boostValue + dt * 6.0);
        }

        const turboMult = wantsTurbo && boostValue > 0 ? 1.82 : 1;
        const speed = 29 * turboMult;
        trackScroll += speed * dt;

        playerVelocity += steering * dt * 24 * driftFactor;
        playerVelocity *= controls.drift ? 0.943 : 0.9;
        playerOffset = clamp(playerOffset + playerVelocity * dt, -3.15, 3.15);

        // The kart remains locked in the center, 2D-racer style.
        kartRoot.position.x = 0;
        kartRoot.position.z = KART_Z;
        kartRoot.position.y = ROAD_TOP_Y + 0.025 + Math.sin(now * 0.018) * 0.03;
        kartRoot.rotation.y = lerp(kartRoot.rotation.y, -steering * 0.18, 0.12);
        kartRoot.rotation.z = lerp(kartRoot.rotation.z, -steering * 0.12, 0.14);
        kartRoot.rotation.x = lerp(kartRoot.rotation.x, wantsTurbo ? -0.06 : 0, 0.08);

        if (grassTexture) {
          grassTexture.offset.x = playerOffset * 0.012;
          grassTexture.offset.y = -(trackScroll * 0.018);
        }

        updateRoad();
        updateTrees(now);
        updateHearts(now);
        updateSpeedLines();
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }

    function setControl(name, value) {
      controlsRef.current[name] = value;
    }

    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") setControl("left", true);
      if (key === "arrowright" || key === "d") setControl("right", true);
      if (key === "shift") setControl("drift", true);
      if (key === " " || key === "w" || key === "arrowup") setControl("turbo", true);
      if (key === "r") resetGame();
    }

    function onKeyUp(event) {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") setControl("left", false);
      if (key === "arrowright" || key === "d") setControl("right", false);
      if (key === "shift") setControl("drift", false);
      if (key === " " || key === "w" || key === "arrowup") setControl("turbo", false);
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      renderer.dispose();
      roadMat.dispose();
      curbPinkMat.dispose();
      curbWhiteMat.dispose();
      roadLineMat.dispose();
      sparkleMat.dispose();
      heartMat.map?.dispose();
      heartMat.dispose();
      grassTexture?.dispose?.();

      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  function hold(name, value) {
    controlsRef.current[name] = value;
  }

  return (
    <main className="cuteKartPage">
      <div ref={mountRef} className="cuteKartCanvas" />

      <div className="heartCounter" aria-label="Hearts collected">
        <span aria-hidden="true">♡</span>
        <strong>{hearts}</strong>
      </div>

      <div className="touchControls">
        <div className="touchGroup">
          <button
            className="steerButton"
            aria-label="Steer left"
            onPointerDown={() => hold("left", true)}
            onPointerUp={() => hold("left", false)}
            onPointerCancel={() => hold("left", false)}
            onPointerLeave={() => hold("left", false)}
          >
            ◀
          </button>

          <button
            className="driftButton"
            aria-label="Drift"
            onPointerDown={() => hold("drift", true)}
            onPointerUp={() => hold("drift", false)}
            onPointerCancel={() => hold("drift", false)}
            onPointerLeave={() => hold("drift", false)}
          >
            ◆
          </button>
        </div>

        <div className="touchCenterGap" aria-hidden="true" />

        <div className="touchGroup rightGroup">
          <button
            className="turboButton"
            aria-label="Turbo"
            onPointerDown={() => hold("turbo", true)}
            onPointerUp={() => hold("turbo", false)}
            onPointerCancel={() => hold("turbo", false)}
            onPointerLeave={() => hold("turbo", false)}
          >
            TURBO
          </button>

          <button
            className="steerButton"
            aria-label="Steer right"
            onPointerDown={() => hold("right", true)}
            onPointerUp={() => hold("right", false)}
            onPointerCancel={() => hold("right", false)}
            onPointerLeave={() => hold("right", false)}
          >
            ▶
          </button>
        </div>
      </div>

      {loading && <div className="loadingDots" aria-hidden="true" />}
    </main>
  );
}
