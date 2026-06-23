
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const ASSET_PATHS = {
  kart: "/models/go-kart.glb",
  tree: "/models/tree.glb",
  grass: "/textures/grass-seamless.jpg"
};

export default function CuteKartGame() {
  const mountRef = useRef(null);
  const controlsRef = useRef({ left: false, right: false, turbo: false, drift: false });
  const pausedRef = useRef(false);
  const restartRef = useRef(null);
  const [score, setScore] = useState(0);
  const [boost, setBoost] = useState(100);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading GLB kart, GLB trees, and seamless grass JPG...");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let alive = true;
    let raf = 0;
    let last = performance.now();
    let scoreValue = 0;
    let boostValue = 100;
    let trackScroll = 0;
    let playerOffset = 0;
    let playerVelocity = 0;
    let turboTimer = 0;
    let lastUi = 0;

    THREE.Cache.enabled = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#94e7ff");

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 150);
    camera.position.set(0, 6.15, 9.65);
    camera.lookAt(0, 1.1, -9.0);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance"
    });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight("#ffffff", "#ffd0ef", 2.75);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight("#ffffff", 1.25);
    sun.position.set(3.5, 8, 6);
    scene.add(sun);

    const roadMat = new THREE.MeshBasicMaterial({ color: "#7d85ad" });
    const roadEdgeMatA = new THREE.MeshBasicMaterial({ color: "#ff7899" });
    const roadEdgeMatB = new THREE.MeshBasicMaterial({ color: "#fff5fb" });
    const roadLineMat = new THREE.MeshBasicMaterial({ color: "#fff7fd" });
    const heartMat = makeHeartMaterial();
    const starMat = makeStarMaterial();

    const gltfLoader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    const loadGLB = (url) => new Promise((resolve, reject) => {
      gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
    });

    const loadTexture = (url) => new Promise((resolve, reject) => {
      textureLoader.load(url, resolve, undefined, reject);
    });

    let kartRoot;
    let kartModel;
    let treeModel;
    let ground;
    const roadSegments = [];
    const trees = [];
    const hearts = [];
    const stars = [];
    const speedLines = [];

    Promise.all([
      loadGLB(ASSET_PATHS.kart),
      loadGLB(ASSET_PATHS.tree),
      loadTexture(ASSET_PATHS.grass)
    ]).then(([kartScene, treeScene, grassTexture]) => {
      if (!alive) return;

      setLoading(false);
      setStatus("GLB kart + GLB trees loaded. Grass JPG is seamless and repeating.");

      grassTexture.colorSpace = THREE.SRGBColorSpace;
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      grassTexture.repeat.set(38, 54);
      grassTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

      const grassMat = new THREE.MeshBasicMaterial({ map: grassTexture });
      ground = new THREE.Mesh(new THREE.PlaneGeometry(170, 230), grassMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.06;
      scene.add(ground);

      kartRoot = new THREE.Group();
      kartRoot.position.set(0, 0, 2.35);
      scene.add(kartRoot);

      kartModel = kartScene;
      prepareModel(kartModel);
      fitModel(kartModel, 2.6);
      kartModel.position.y += 0.08;
      kartModel.rotation.y = 0;
      kartRoot.add(kartModel);

      treeModel = treeScene;
      prepareModel(treeModel);
      fitModel(treeModel, 2.15);

      createRoad();
      createTrees();
      createCollectibles();
      createSpeedLines();
      restartGame();
      raf = requestAnimationFrame(animate);
    }).catch((error) => {
      console.error(error);
      setLoading(true);
      setStatus("Missing asset. Make sure /public/models/go-kart.glb, /public/models/tree.glb, and /public/textures/grass-seamless.jpg exist.");
    });

    function prepareModel(model) {
      model.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = true;
          child.castShadow = false;
          child.receiveShadow = false;
          if (child.material) {
            child.material.depthWrite = true;
            child.material.needsUpdate = true;
          }
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
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(76, 67, 12, 0, Math.PI * 2);
      ctx.fill();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    }

    function makeStarMaterial() {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 160, 160);
      ctx.fillStyle = "#fff09a";
      ctx.strokeStyle = "#ffcf4d";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(80, 10);
      ctx.quadraticCurveTo(96, 64, 150, 80);
      ctx.quadraticCurveTo(96, 96, 80, 150);
      ctx.quadraticCurveTo(64, 96, 10, 80);
      ctx.quadraticCurveTo(64, 64, 80, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    }

    function createRoad() {
      const segmentCount = 24;
      const length = 5.2;
      const roadWidth = 7.6;
      const total = segmentCount * length;

      for (let i = 0; i < segmentCount; i += 1) {
        const group = new THREE.Group();
        group.userData.baseZ = -i * length;
        group.userData.length = length;
        group.userData.total = total;

        const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, length + 0.08), roadMat);
        road.rotation.x = -Math.PI / 2;
        group.add(road);

        for (const side of [-1, 1]) {
          const curb = new THREE.Mesh(
            new THREE.BoxGeometry(0.54, 0.07, length + 0.08),
            i % 2 === 0 ? roadEdgeMatA : roadEdgeMatB
          );
          curb.position.set(side * (roadWidth / 2 + 0.25), 0.045, 0);
          group.add(curb);
        }

        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 1.7), roadLineMat);
        dash.position.set(0, 0.065, 0);
        group.add(dash);

        roadSegments.push(group);
        scene.add(group);
      }
    }

    function createTrees() {
      const total = 150;
      for (let i = 0; i < 18; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const tree = treeModel.clone(true);
        tree.userData.baseZ = -9 - i * 7.8;
        tree.userData.side = side;
        tree.userData.total = total;
        tree.userData.sideDistance = 6.4 + (i % 3) * 1.25;
        tree.userData.wobble = Math.random() * 10;
        tree.rotation.y = Math.random() * Math.PI * 2;
        tree.scale.multiplyScalar(0.82 + (i % 4) * 0.07);
        trees.push(tree);
        scene.add(tree);
      }
    }

    function createCollectibles() {
      for (let i = 0; i < 12; i += 1) {
        const sprite = new THREE.Sprite(i % 4 === 0 ? starMat : heartMat);
        sprite.scale.setScalar(i % 4 === 0 ? 0.72 : 0.62);
        sprite.userData.baseZ = -14 - i * 8.5;
        sprite.userData.total = 150;
        sprite.userData.lane = [-2.2, -1.1, 0, 1.1, 2.2][i % 5];
        sprite.userData.points = i % 4 === 0 ? 25 : 10;
        hearts.push(sprite);
        scene.add(sprite);
      }
    }

    function createSpeedLines() {
      const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, depthWrite: false });
      for (let i = 0; i < 18; i += 1) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 4.0), mat);
        line.userData.baseZ = -i * 6;
        line.userData.total = 120;
        line.userData.x = (Math.random() - 0.5) * 15;
        line.position.y = 0.04;
        speedLines.push(line);
        scene.add(line);
      }
    }

    function pathCurve(s) {
      // The first visible stretch starts centered. Curves arrive after the opening straight.
      const t = Math.max(0, s - 78);
      return Math.sin(t * 0.042) * 2.05 + Math.sin(t * 0.018) * 1.15;
    }

    function wrapZ(baseZ, total) {
      let z = baseZ + (trackScroll % total);
      if (z > 9) z -= total;
      return z;
    }

    function centerForZ(z) {
      const pathDistance = trackScroll - z;
      return pathCurve(pathDistance);
    }

    function restartGame() {
      scoreValue = 0;
      boostValue = 100;
      turboTimer = 0;
      trackScroll = 0;
      playerOffset = 0;
      playerVelocity = 0;
      setScore(0);
      setBoost(100);
      setStatus("Kart is locked center. Road, GLB trees, and JPG grass move fast underneath.");
      if (kartRoot) {
        kartRoot.position.set(0, 0, 2.35);
        kartRoot.rotation.set(0, 0, 0);
      }
      for (const item of hearts) item.visible = true;
    }

    restartRef.current = restartGame;

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
        tree.position.y = 0;
        tree.rotation.y += 0.0008 + Math.sin(now * 0.001 + tree.userData.wobble) * 0.0006;
      }
    }

    function updateCollectibles(now) {
      const kartZ = 2.35;
      for (const item of hearts) {
        const z = wrapZ(item.userData.baseZ, item.userData.total);
        const center = centerForZ(z);
        item.position.z = z;
        item.position.x = center - playerOffset + item.userData.lane;
        item.position.y = 1.1 + Math.sin(now * 0.006 + item.userData.baseZ) * 0.18;
        item.rotation.z += 0.05;

        if (item.visible && Math.abs(item.position.z - kartZ) < 0.85 && Math.abs(item.position.x) < 0.72) {
          item.visible = false;
          scoreValue += item.userData.points;
          boostValue = clamp(boostValue + 8, 0, 100);
          setScore(scoreValue);
          setBoost(Math.round(boostValue));
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

      if (!pausedRef.current && kartRoot) {
        const controls = controlsRef.current;
        const steering = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
        const driftFactor = controls.drift ? 1.55 : 1;
        const wantsTurbo = controls.turbo || turboTimer > 0;

        if (controls.turbo && boostValue > 1) {
          turboTimer = 0.42;
          boostValue = Math.max(0, boostValue - dt * 32);
        } else if (turboTimer > 0) {
          turboTimer -= dt;
        } else {
          boostValue = Math.min(100, boostValue + dt * 5.5);
        }

        const turboMult = wantsTurbo && boostValue > 0 ? 1.78 : 1;
        const speed = 28 * turboMult;
        trackScroll += speed * dt;

        playerVelocity += steering * dt * 24 * driftFactor;
        playerVelocity *= controls.drift ? 0.943 : 0.90;
        playerOffset = clamp(playerOffset + playerVelocity * dt, -3.15, 3.15);

        // Absolute 2D-racer lock: kart stays centered on screen. The world moves under it.
        kartRoot.position.x = 0;
        kartRoot.position.z = 2.35;
        kartRoot.position.y = 0.02 + Math.sin(now * 0.018) * 0.035;
        kartRoot.rotation.y = lerp(kartRoot.rotation.y, -steering * 0.18, 0.12);
        kartRoot.rotation.z = lerp(kartRoot.rotation.z, -steering * 0.12, 0.14);
        kartRoot.rotation.x = lerp(kartRoot.rotation.x, wantsTurbo ? -0.06 : 0, 0.08);

        if (ground) {
          ground.position.x = -playerOffset * 0.36;
          ground.position.z = (trackScroll % 8) * 0.16;
        }

        updateRoad();
        updateTrees(now);
        updateCollectibles(now);
        updateSpeedLines();

        if (now - lastUi > 140) {
          lastUi = now;
          setBoost(Math.round(boostValue));
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }

    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") controlsRef.current.left = true;
      if (key === "arrowright" || key === "d") controlsRef.current.right = true;
      if (key === "shift") controlsRef.current.drift = true;
      if (key === " " || key === "w" || key === "arrowup") controlsRef.current.turbo = true;
      if (key === "r") restartRef.current?.();
      if (key === "p") setPaused((value) => !value);
    };

    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") controlsRef.current.left = false;
      if (key === "arrowright" || key === "d") controlsRef.current.right = false;
      if (key === "shift") controlsRef.current.drift = false;
      if (key === " " || key === "w" || key === "arrowup") controlsRef.current.turbo = false;
    };

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
      roadEdgeMatA.dispose();
      roadEdgeMatB.dispose();
      roadLineMat.dispose();
      heartMat.map?.dispose();
      heartMat.dispose();
      starMat.map?.dispose();
      starMat.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  function hold(name, value) {
    controlsRef.current[name] = value;
  }

  function restart() {
    restartRef.current?.();
  }

  return (
    <main className="cuteKartPage">
      <div ref={mountRef} className="cuteKartCanvas" />

      <div className="cuteKartHud">
        <div className="cuteKartPill">AIR HORSE KART</div>
        <div className="cuteKartPill cuteKartScore">♡ {score} · ⚡ {boost}%</div>
      </div>

      <div className="cuteKartStatus">{paused ? "Paused" : status}</div>

      <div className="cuteKartMiniBar">
        <button className="cuteKartMiniButton" onClick={() => setPaused((value) => !value)}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="cuteKartMiniButton" onClick={restart}>Restart</button>
      </div>

      <div className="cuteKartTouch">
        <div className="cuteKartTouchSide">
          <button
            aria-label="Steer left"
            onPointerDown={() => hold("left", true)}
            onPointerUp={() => hold("left", false)}
            onPointerCancel={() => hold("left", false)}
            onPointerLeave={() => hold("left", false)}
          >
            ◀
          </button>
          <button
            aria-label="Drift"
            onPointerDown={() => hold("drift", true)}
            onPointerUp={() => hold("drift", false)}
            onPointerCancel={() => hold("drift", false)}
            onPointerLeave={() => hold("drift", false)}
          >
            ◆
          </button>
        </div>

        <div className="cuteKartTouchCenter">
          <button
            className="cuteKartTurbo"
            aria-label="Turbo"
            onPointerDown={() => hold("turbo", true)}
            onPointerUp={() => hold("turbo", false)}
            onPointerCancel={() => hold("turbo", false)}
            onPointerLeave={() => hold("turbo", false)}
          >
            ⚡
          </button>
        </div>

        <div className="cuteKartTouchSide">
          <button
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

      {loading && (
        <div className="cuteKartLoading">
          <div className="cuteKartLoadingCard">
            Loading cute GLB assets...
            <small>
              The game uses /models/go-kart.glb for the kart, /models/tree.glb for trees,
              and /textures/grass-seamless.jpg for the grass. No cloud sprites, no avoid objects.
            </small>
          </div>
        </div>
      )}
    </main>
  );
}
