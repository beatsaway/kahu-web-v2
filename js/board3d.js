import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { destPoint, fromSq, parseKfen, sqOf, sqToFileRank } from "./kuba.js";

const COLORS = {
  board: 0xb08958,
  groove: 0x7a5a32,
  rim: 0x5c4024,
  W: 0xf2efe8,
  B: 0x1a1816,
  R: 0xc4453a,
  legal: 0xe8a04a,
  sel: 0xffd27a,
  last: 0x8fd18f,
};

/**
 * Three.js Kuba board.
 * Local space: file → X, rank → −Z, Y up. Flip rotates the whole board 180°.
 */
export function createBoard3d(canvas, { onPick } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14100c);
  scene.fog = new THREE.Fog(0x14100c, 14, 28);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  camera.position.set(0, 11.5, 11.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 8;
  controls.maxDistance = 22;
  controls.target.set(0, 0, 0);
  controls.enablePan = false;

  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x2a1c12, 1.05));
  const key = new THREE.DirectionalLight(0xffe6c4, 1.35);
  key.position.set(6, 12, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const shadow = key.shadow.camera;
  shadow.near = 1;
  shadow.far = 30;
  shadow.left = -10;
  shadow.right = 10;
  shadow.top = 10;
  shadow.bottom = -10;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88a0ff, 0.25);
  fill.position.set(-5, 4, -6);
  scene.add(fill);

  const boardRoot = new THREE.Group();
  scene.add(boardRoot);

  const marbleRoot = new THREE.Group();
  const markerRoot = new THREE.Group();
  boardRoot.add(makeBoard());
  boardRoot.add(marbleRoot);
  boardRoot.add(markerRoot);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pickPlane.rotation.x = -Math.PI / 2;
  pickPlane.position.y = 0.05;
  boardRoot.add(pickPlane);

  let selected = -1;
  let legal = [];
  let lastMove = "";
  let hintMove = "";
  let cells = Array(49).fill(".");
  let animating = false;
  let anim = null;

  const marbleGeo = new THREE.SphereGeometry(0.38, 32, 24);
  const mats = {
    W: new THREE.MeshStandardMaterial({ color: COLORS.W, roughness: 0.28, metalness: 0.08 }),
    B: new THREE.MeshStandardMaterial({ color: COLORS.B, roughness: 0.35, metalness: 0.15 }),
    R: new THREE.MeshStandardMaterial({ color: COLORS.R, roughness: 0.3, metalness: 0.12 }),
  };

  function worldOf(file, rank, y = 0.42) {
    const x = (file - 4) * 1.15;
    const z = (4 - rank) * 1.15;
    return new THREE.Vector3(x, y, z);
  }

  function worldOfSq(sq, y) {
    const { file, rank } = sqToFileRank(sq);
    return worldOf(file, rank, y);
  }

  function makeBoard() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(9.2, 0.45, 9.2),
      new THREE.MeshStandardMaterial({ color: COLORS.rim, roughness: 0.75, metalness: 0.05 })
    );
    base.position.y = -0.22;
    base.receiveShadow = true;
    g.add(base);

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.18, 8.2),
      new THREE.MeshStandardMaterial({ color: COLORS.board, roughness: 0.65, metalness: 0.04 })
    );
    top.position.y = 0.02;
    top.receiveShadow = true;
    g.add(top);

    const grooveMat = new THREE.MeshStandardMaterial({
      color: COLORS.groove,
      roughness: 0.85,
      metalness: 0.02,
    });
    for (let r = 1; r <= 7; r++) {
      for (let f = 1; f <= 7; f++) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 28), grooveMat);
        const p = worldOf(f, r, 0.08);
        hole.position.copy(p);
        hole.receiveShadow = true;
        g.add(hole);
      }
    }
    return g;
  }

  function clearGroup(group) {
    while (group.children.length) {
      const c = group.children.pop();
      group.remove(c);
    }
  }

  function rebuildMarbles() {
    clearGroup(marbleRoot);
    for (let sq = 0; sq < 49; sq++) {
      const piece = cells[sq];
      if (piece === ".") continue;
      const mesh = new THREE.Mesh(marbleGeo, mats[piece]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.sq = sq;
      mesh.position.copy(worldOfSq(sq));
      marbleRoot.add(mesh);
    }
  }

  function rebuildMarkers() {
    clearGroup(markerRoot);
    const ringGeo = new THREE.RingGeometry(0.22, 0.34, 28);
    ringGeo.rotateX(-Math.PI / 2);

    if (selected >= 0) {
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: COLORS.sel,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
        })
      );
      const p = worldOfSq(selected, 0.12);
      ring.position.copy(p);
      markerRoot.add(ring);
    }

    if (lastMove) {
      const d = destPoint(lastMove);
      const squares = [fromSq(lastMove)];
      if (!d.off) squares.push(sqOf(d.f, d.r));
      for (const sq of squares) {
        const ring = new THREE.Mesh(
          ringGeo.clone(),
          new THREE.MeshBasicMaterial({
            color: COLORS.last,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
          })
        );
        ring.position.copy(worldOfSq(sq, 0.11));
        markerRoot.add(ring);
      }
    }

    const legalFrom = selected >= 0 ? legal.filter((m) => fromSq(m) === selected) : [];
    for (const m of legalFrom) {
      const d = destPoint(m);
      let pos;
      if (d.off) {
        const edgeF = Math.max(1, Math.min(7, d.f === 0 ? 1 : d.f === 8 ? 7 : d.f));
        const edgeR = Math.max(1, Math.min(7, d.r === 0 ? 1 : d.r === 8 ? 7 : d.r));
        const edge = worldOf(edgeF, edgeR, 0.14);
        const df = d.f < 1 ? -1 : d.f > 7 ? 1 : 0;
        const dr = d.r < 1 ? -1 : d.r > 7 ? 1 : 0;
        pos = edge.clone().add(new THREE.Vector3(df * 0.75, 0, -dr * 0.75));
      } else {
        pos = worldOf(d.f, d.r, 0.14);
      }
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 12),
        new THREE.MeshBasicMaterial({ color: COLORS.legal })
      );
      dot.position.copy(pos);
      dot.userData.move = m;
      markerRoot.add(dot);

      if (hintMove === m) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.42, 28).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
          })
        );
        halo.position.set(pos.x, 0.13, pos.z);
        markerRoot.add(halo);
      }
    }
  }

  function setPosition(kfen, opts = {}) {
    const pos = parseKfen(kfen);
    cells = pos.cells;
    if (opts.legal) legal = opts.legal;
    if (opts.selected !== undefined) selected = opts.selected;
    if (opts.lastMove !== undefined) lastMove = opts.lastMove;
    if (opts.hintMove !== undefined) hintMove = opts.hintMove;
    if (!animating) {
      rebuildMarbles();
      rebuildMarkers();
    }
    return pos;
  }

  function setSelection(sq, legalMoves, hint) {
    selected = sq;
    if (legalMoves) legal = legalMoves;
    if (hint !== undefined) hintMove = hint;
    rebuildMarkers();
  }

  function setFlipped(v) {
    boardRoot.rotation.y = v ? Math.PI : 0;
  }

  function animatePush(move, afterKfen, done) {
    const from = fromSq(move);
    const d = destPoint(move);
    const start = worldOfSq(from);
    let end;
    if (d.off) {
      end = worldOf(d.f, d.r, -0.9);
    } else {
      end = worldOf(d.f, d.r);
    }

    const mesh = marbleRoot.children.find((c) => c.userData.sq === from);
    if (!mesh) {
      setPosition(afterKfen, { lastMove: move, selected: -1, hintMove: "" });
      done && done();
      return;
    }

    animating = true;
    selected = -1;
    hintMove = "";
    rebuildMarkers();
    anim = {
      mesh,
      start: start.clone(),
      end: end.clone(),
      t0: performance.now(),
      dur: 340,
      afterKfen,
      move,
      done,
    };
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const marks = raycaster.intersectObjects(markerRoot.children, false);
    for (const hit of marks) {
      if (hit.object.userData.move) return { type: "move", move: hit.object.userData.move };
    }

    const marbles = raycaster.intersectObjects(marbleRoot.children, false);
    if (marbles.length) return { type: "sq", sq: marbles[0].object.userData.sq };

    const planeHits = raycaster.intersectObject(pickPlane);
    if (planeHits.length) {
      const p = planeHits[0].point;
      const local = boardRoot.worldToLocal(p.clone());
      const file = Math.round(local.x / 1.15 + 4);
      const rank = Math.round(4 - local.z / 1.15);
      if (file >= 1 && file <= 7 && rank >= 1 && rank <= 7) {
        return { type: "sq", sq: sqOf(file, rank) };
      }
    }
    return null;
  }

  function onPointerDown(e) {
    if (animating) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    try {
      canvas.setPointerCapture(pointerId);
    } catch (_) { /* ignore */ }

    function up(ev) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch (_) { /* ignore */ }
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy > 36) return;
      const hit = pick(ev.clientX, ev.clientY);
      onPick && onPick(hit);
    }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  canvas.addEventListener("pointerdown", onPointerDown);

  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth || 640;
    const h = parent.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  const resizeObs = new ResizeObserver(resize);
  resizeObs.observe(canvas.parentElement);

  let raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (anim) {
      const u = Math.min(1, (now - anim.t0) / anim.dur);
      const e = 1 - Math.pow(1 - u, 3);
      anim.mesh.position.lerpVectors(anim.start, anim.end, e);
      if (u >= 1) {
        const { afterKfen, move, done } = anim;
        anim = null;
        animating = false;
        setPosition(afterKfen, { lastMove: move, selected: -1, hintMove: "" });
        done && done();
      }
    }
    const pulse = 1 + Math.sin(now * 0.006) * 0.18;
    for (const c of markerRoot.children) {
      if (c.userData.move) c.scale.setScalar(pulse);
    }
    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  function dispose() {
    cancelAnimationFrame(raf);
    resizeObs.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    renderer.dispose();
  }

  return {
    setPosition,
    setSelection,
    setFlipped,
    animatePush,
    dispose,
    get selected() {
      return selected;
    },
    get animating() {
      return animating;
    },
  };
}
