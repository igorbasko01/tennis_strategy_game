import * as THREE from 'three';
import type { AttackAction, ServeAction } from '../engine/actions';
import type { Duel, Exchange, PlayerIndex } from '../engine/resolution';
import { Animator, easeInOut, easeOut } from './animator';
import {
  COURT,
  attackContact,
  attackLanding,
  pastSpot,
  receiverStart,
  recoverySpot,
  serveContact,
  serveLanding,
  serveReadSpot,
  serverStart,
  sideSign,
  type ServeSide,
  type Spot,
} from './layout';

export interface ZoneMarker {
  id: string;
  spot: Spot;
  kind: 'target' | 'read';
  label: string;
}

const COLORS = {
  surround: 0x1d5a3b,
  court: 0x2c7a52,
  line: 0xf4f7f2,
  ball: 0xd8f04a,
  players: [0xe9f5c8, 0xff7a59] as const,
  shorts: [0x274f7a, 0x2b2b38] as const,
  target: 0xffc93c,
  read: 0x59d8ff,
};

const BALL_RADIUS = 0.11;
const HIT_HEIGHT = 0.95;

const toV3 = (s: Spot, y = 0) => new THREE.Vector3(s.x, y, s.z);

const blobTexture = (() => {
  let tex: THREE.Texture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

const makeBlob = (size: number) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
};

const makeLabel = (text: string, color: number) => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8, 24, 16, 0.78)';
  g.beginPath();
  g.roundRect(4, 8, 248, 48, 24);
  g.fill();
  g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '600 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 10;
  return sprite;
};

/** A stylised low-poly player with a racket that can run and swing. */
class Figure {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly racketPivot = new THREE.Group();
  private readonly blob = makeBlob(1.3);
  spot: Spot = { x: 0, z: 0 };
  private running = 0;

  constructor(
    scene: THREE.Scene,
    readonly index: PlayerIndex,
  ) {
    const shirt = new THREE.MeshStandardMaterial({ color: COLORS.players[index], roughness: 0.6 });
    const shorts = new THREE.MeshStandardMaterial({ color: COLORS.shorts[index], roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), shirt);
    torso.position.y = 1.18;
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.3, 12), shorts);
    hips.position.y = 0.8;
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.55, 4, 8);
    const legL = new THREE.Mesh(legGeo, skin);
    legL.position.set(-0.12, 0.38, 0);
    const legR = legL.clone();
    legR.position.x = 0.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
    head.position.y = 1.72;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: COLORS.shorts[index] }),
    );
    cap.position.y = 1.75;

    const frame = new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.4, metalness: 0.3 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), frame);
    handle.position.set(0, 0, -0.15);
    handle.rotation.x = Math.PI / 2;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 20), frame);
    hoop.position.set(0, 0, -0.45);
    hoop.rotation.y = Math.PI / 2;
    const strings = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    strings.position.copy(hoop.position);
    strings.rotation.y = Math.PI / 2;
    const racket = new THREE.Group();
    racket.add(handle, hoop, strings);
    racket.rotation.y = -Math.PI / 2.4;
    this.racketPivot.position.set(0.34, 1.05, 0);
    this.racketPivot.add(racket);

    this.body.add(torso, hips, legL, legR, head, cap, this.racketPivot);
    this.group.add(this.body);
    // Player 0 faces -z (away from the camera); player 1 faces +z.
    this.group.rotation.y = index === 0 ? 0 : Math.PI;
    scene.add(this.group, this.blob);
  }

  setSpot(spot: Spot): void {
    this.spot = { ...spot };
    this.group.position.set(spot.x, 0, spot.z);
    this.blob.position.set(spot.x, 0.012, spot.z);
  }

  runTo(anim: Animator, to: Spot, duration: number): Promise<void> {
    const from = { ...this.spot };
    this.running++;
    return anim
      .tween(duration, (t) => {
        const e = easeInOut(t);
        this.setSpot({ x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e });
      })
      .then(() => {
        this.running--;
      });
  }

  swing(anim: Animator, forehand: boolean, overhead = false): Promise<void> {
    const dir = forehand ? 1 : -1;
    return anim.tween(0.28, (t) => {
      const k = Math.sin(t * Math.PI);
      if (overhead) {
        this.racketPivot.rotation.set(-k * 2.4, 0, 0);
      } else {
        this.racketPivot.rotation.set(0, dir * (k * 2.2 - 0.6) * (t < 1 ? 1 : 0), 0);
      }
      this.body.rotation.y = dir * k * 0.5;
    });
  }

  update(time: number): void {
    const bob = this.running > 0 ? Math.abs(Math.sin(time * 14)) * 0.07 : Math.sin(time * 3 + this.index) * 0.015;
    this.body.position.y = bob;
  }
}

export class CourtScene {
  readonly animator = new Animator();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private readonly players: [Figure, Figure];
  private readonly ball: THREE.Mesh;
  private readonly ballBlob = makeBlob(0.5);
  private readonly markerGroup = new THREE.Group();
  private markerMeshes = new Map<string, { disc: THREE.Mesh; ring: THREE.Mesh; label: THREE.Sprite; kind: ZoneMarker['kind'] }>();
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private side: ServeSide = 'deuce';
  private width = 1;
  private height = 1;

  onMarkerTap: ((id: string) => void) | null = null;
  onHit: ((power: number) => void) | null = null;
  onBounce: (() => void) | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x29452f, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
    sun.position.set(6, 14, 9);
    this.scene.add(sun);

    this.buildCourt();
    this.players = [new Figure(this.scene, 0), new Figure(this.scene, 1)];

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 16, 12),
      new THREE.MeshStandardMaterial({ color: COLORS.ball, emissive: 0x4a5a00, roughness: 0.5 }),
    );
    this.scene.add(this.ball, this.ballBlob, this.markerGroup);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
    this.renderer.domElement.addEventListener('pointerup', (e) => this.handleTap(e));
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildCourt(): void {
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 60),
      new THREE.MeshStandardMaterial({ color: COLORS.surround, roughness: 0.95 }),
    );
    surround.rotation.x = -Math.PI / 2;
    this.scene.add(surround);

    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.doublesHalfWidth * 2, COURT.halfLength * 2),
      new THREE.MeshStandardMaterial({ color: COLORS.court, roughness: 0.85 }),
    );
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.002;
    this.scene.add(court);

    const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.line });
    const W = 0.07;
    const line = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1) + W;
      const horizontal = Math.abs(z2 - z1) < 1e-6;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? len : W, horizontal ? W : len), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
      this.scene.add(m);
    };
    const L = COURT.halfLength;
    const S = COURT.singlesHalfWidth;
    const D = COURT.doublesHalfWidth;
    const SL = COURT.serviceLine;
    for (const z of [L, -L]) line(-D, z, D, z);
    for (const x of [D, -D, S, -S]) line(x, -L, x, L);
    for (const z of [SL, -SL]) line(-S, z, S, z);
    line(0, -SL, 0, SL);
    for (const z of [L, -L]) line(0, z, 0, z - Math.sign(z) * 0.3);

    // Net
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 32;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(20, 24, 28, 0.85)';
    g.lineWidth = 1.5;
    for (let x = 0; x <= 256; x += 6) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 32);
      g.stroke();
    }
    for (let y = 0; y <= 32; y += 6) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
    const netTex = new THREE.CanvasTexture(c);
    netTex.wrapS = THREE.RepeatWrapping;
    netTex.repeat.set(4, 1);
    const netWidth = (D + 0.9) * 2;
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(netWidth, COURT.netHeightCenter),
      new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    net.position.y = COURT.netHeightCenter / 2;
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(netWidth, 0.07, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    tape.position.y = COURT.netHeightCenter;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: 0.4, roughness: 0.5 });
    for (const x of [netWidth / 2, -netWidth / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, COURT.netHeightPost, 10), postMat);
      post.position.set(x, COURT.netHeightPost / 2, 0);
      this.scene.add(post);
    }
    this.scene.add(net, tape);

    // Low back and side walls to frame the court.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f3324, roughness: 0.9 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc6e03a });
    const wall = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wallMat);
      m.position.set(x, 0.55, z);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.08, d + 0.01), stripeMat);
      stripe.position.set(x, 1.05, z);
      this.scene.add(m, stripe);
    };
    wall(18, 0.3, 0, -L - 6.5);
    wall(18, 0.3, 0, L + 6.5);
    wall(0.3, 2 * L + 13, 9, 0);
    wall(0.3, 2 * L + 13, -9, 0);
  }

  private resize(): void {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.fitCamera();
  }

  /** Places the camera behind the near baseline as close as possible while keeping the whole court in view. */
  private fitCamera(): void {
    const aspect = this.camera.aspect;
    const elevation = THREE.MathUtils.degToRad(aspect < 0.8 ? 60 : aspect < 1.3 ? 46 : 36);
    this.camera.fov = aspect < 0.8 ? 50 : 40;
    const target = new THREE.Vector3(0, 0, aspect < 0.8 ? -0.3 : -0.8);
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const pts: THREE.Vector3[] = [];
    for (const x of [-COURT.doublesHalfWidth - 0.4, COURT.doublesHalfWidth + 0.4]) {
      for (const z of [-COURT.halfLength - 1.5, COURT.halfLength + 2.3]) {
        pts.push(new THREE.Vector3(x, 0, z));
        pts.push(new THREE.Vector3(x * 0.8, 1.9, z));
      }
    }
    const fits = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d);
      this.camera.lookAt(target);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      return pts.every((p) => {
        const v = p.clone().project(this.camera);
        return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.95 && v.z < 1;
      });
    };
    let lo = 5;
    let hi = 120;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.animator.update(dt);
    const time = this.clock.elapsedTime;
    for (const p of this.players) p.update(time);
    const pulse = 1 + Math.sin(time * 5) * 0.06;
    for (const m of this.markerMeshes.values()) {
      if ((m.disc.material as THREE.MeshBasicMaterial).opacity > 0.5) m.ring.scale.setScalar(pulse);
      else m.ring.scale.setScalar(1);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private setBall(pos: THREE.Vector3, visible = true): void {
    this.ball.visible = visible;
    this.ballBlob.visible = visible;
    this.ball.position.copy(pos);
    this.ballBlob.position.set(pos.x, 0.013, pos.z);
    const s = Math.max(0.35, 1 - pos.y * 0.15);
    this.ballBlob.scale.setScalar(s);
  }

  private flyBall(from: THREE.Vector3, to: THREE.Vector3, apex: number, duration: number): Promise<void> {
    const base = Math.max(from.y, to.y);
    return this.animator.tween(duration, (t) => {
      const p = from.clone().lerp(to, t);
      p.y = from.y + (to.y - from.y) * t + 4 * Math.max(0, apex - base * 0.5) * t * (1 - t);
      this.setBall(p);
    });
  }

  private handPosition(p: PlayerIndex, height = HIT_HEIGHT): THREE.Vector3 {
    const f = this.players[p];
    return new THREE.Vector3(f.spot.x + sideSign(p) * 0.45, height, f.spot.z - sideSign(p) * 0.2);
  }

  playerSpot(p: PlayerIndex): Spot {
    return { ...this.players[p].spot };
  }

  get serveSide(): ServeSide {
    return this.side;
  }

  /** Walks both players to their positions for the next point. */
  async resetPoint(server: PlayerIndex, side: ServeSide, animate: boolean): Promise<void> {
    this.side = side;
    const receiver: PlayerIndex = server === 0 ? 1 : 0;
    const sSpot = serverStart(server, side);
    const rSpot = receiverStart(receiver, side);
    if (animate) {
      this.setBall(new THREE.Vector3(), false);
      await Promise.all([
        this.players[server].runTo(this.animator, sSpot, 0.7),
        this.players[receiver].runTo(this.animator, rSpot, 0.7),
      ]);
    } else {
      this.players[server].setSpot(sSpot);
      this.players[receiver].setSpot(rSpot);
    }
    this.setBall(this.handPosition(server, 1.0));
  }

  showMarkers(markers: ZoneMarker[]): void {
    this.clearMarkers();
    for (const m of markers) {
      const color = m.kind === 'target' ? COLORS.target : COLORS.read;
      const radius = m.kind === 'target' ? 0.75 : 0.55;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(m.spot.x, 0.02, m.spot.z);
      disc.userData.markerId = m.id;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.08, radius, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(m.spot.x, 0.025, m.spot.z);
      const label = makeLabel(m.label, color);
      label.position.set(m.spot.x, 0.75, m.spot.z);
      label.scale.set(2.8, 0.7, 1);
      label.visible = false;
      this.markerGroup.add(disc, ring, label);
      this.markerMeshes.set(m.id, { disc, ring, label, kind: m.kind });
    }
  }

  /** Highlights the given marker ids and dims the rest. */
  highlightMarkers(selected: ReadonlySet<string>): void {
    for (const [id, m] of this.markerMeshes) {
      const on = selected.has(id);
      (m.disc.material as THREE.MeshBasicMaterial).opacity = on ? 0.62 : 0.18;
      (m.ring.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.5;
      // Unselected labels overlap on the far half, so only the picks are labelled.
      m.label.visible = on;
    }
  }

  clearMarkers(): void {
    for (const m of this.markerMeshes.values()) {
      for (const obj of [m.disc, m.ring]) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
      m.label.material.map?.dispose();
      m.label.material.dispose();
    }
    this.markerGroup.clear();
    this.markerMeshes.clear();
  }

  private handleTap(e: PointerEvent): void {
    if (!this.onMarkerTap || this.markerMeshes.size === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const discs = [...this.markerMeshes.values()].map((m) => m.disc);
    const hit = this.raycaster.intersectObjects(discs)[0];
    if (hit) {
      this.onMarkerTap(hit.object.userData.markerId as string);
      return;
    }
    // Generous fallback for fingers: pick the nearest marker on the ground plane.
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(ground, point)) return;
    let best: string | null = null;
    let bestDist = 1.4;
    for (const [id, m] of this.markerMeshes) {
      const d = Math.hypot(m.disc.position.x - point.x, m.disc.position.z - point.z);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    if (best) this.onMarkerTap(best);
  }

  /** Animates every shot of an exchange. Resolves once the ball is dead or held by the next striker. */
  async playExchange(exchange: Exchange): Promise<void> {
    for (const duel of exchange.duels) await this.playDuel(duel);
  }

  private async playDuel(duel: Duel): Promise<void> {
    const anim = this.animator;
    const hitter = this.players[duel.hitter];
    const defender = this.players[duel.defender];
    const from = hitter.spot;
    const isServe = duel.kind === 'serve';

    let landing: Spot;
    let contact: Spot;
    let readSpot: Spot;
    if (isServe) {
      const serve = duel.shot as ServeAction;
      landing = serveLanding(duel.hitter, this.side, serve);
      contact = serveContact(duel.hitter, this.side, serve);
      readSpot = serveReadSpot(duel.defender, this.side, duel.read as 'wide' | 'neutral' | 'tLine');
    } else {
      const attack = duel.shot as AttackAction;
      landing = attackLanding(duel.hitter, from, attack);
      contact = attackContact(duel.hitter, from, attack);
      readSpot = attackContact(duel.hitter, from, duel.read as AttackAction);
    }

    const forehand = sideSign(duel.hitter) * (landing.x - from.x) <= 0.5 || sideSign(duel.hitter) * from.x > 0;
    let start: THREE.Vector3;
    if (isServe) {
      const hand = this.handPosition(duel.hitter, 1.0);
      const top = hand.clone().setY(3.0);
      await anim.tween(0.45, (t) => this.setBall(hand.clone().lerp(top, easeOut(t))));
      start = top.clone().setY(2.75);
      await hitter.swing(anim, true, true);
    } else {
      start = this.ball.position.clone();
      await hitter.swing(anim, forehand);
    }
    this.onHit?.(isServe ? 1 : duel.shot === 'dropShot' ? 0.4 : 0.8);

    const drop = duel.shot === 'dropShot';
    const flight = isServe ? 0.55 : drop ? 0.95 : 0.85;
    const apex = isServe ? 0 : drop ? 1.9 : 2.6;
    const land = toV3(landing, BALL_RADIUS);
    const readDuration = flight * (duel.readCalc.modifier > 0 ? 0.75 : 0.9);
    await Promise.all([
      this.flyBall(start, land, apex, flight),
      defender.runTo(anim, readSpot, readDuration),
      isServe ? Promise.resolve() : hitter.runTo(anim, recoverySpot(duel.hitter, from), flight * 1.1),
    ]);
    this.onBounce?.();

    const after = drop ? 0.55 : 0.42;
    const afterApex = drop ? 0.7 : 1.2;
    if (!duel.hitterWins) {
      await Promise.all([
        this.flyBall(land, toV3(contact, HIT_HEIGHT), afterApex, after),
        defender.runTo(anim, contact, after),
      ]);
      // The defender now holds the ball at the contact point; the next duel starts from here.
      this.setBall(this.handPosition(duel.defender));
      return;
    }

    const past = pastSpot(landing, contact, 6);
    const lunge: Spot = {
      x: readSpot.x + (contact.x - readSpot.x) * 0.35,
      z: readSpot.z + (contact.z - readSpot.z) * 0.35,
    };
    await Promise.all([
      this.flyBall(land, toV3(past, BALL_RADIUS), afterApex, after * 1.8),
      defender.runTo(anim, lunge, after * 1.2),
    ]);
    await anim.wait(0.15);
    this.setBall(this.ball.position, false);
  }

  /** Hit target markers from player p's current position. */
  targetMarkersFor(p: PlayerIndex, phase: 'serve' | 'rally', labels: Record<string, string>): ZoneMarker[] {
    if (phase === 'serve') {
      return (['wide', 'body', 'tLine'] as const).map((s) => ({
        id: `target:${s}`,
        kind: 'target',
        label: labels[s],
        spot: serveLanding(p, this.side, s),
      }));
    }
    const from = this.players[p].spot;
    return (['crossCourt', 'downTheLine', 'centerDeep', 'dropShot'] as const).map((a) => ({
      id: `target:${a}`,
      kind: 'target',
      label: labels[a],
      spot: attackLanding(p, from, a),
    }));
  }

  /** Read/cover markers for player p against the opponent's next shot. */
  readMarkersFor(p: PlayerIndex, against: 'serve' | 'attack', labels: Record<string, string>): ZoneMarker[] {
    const opp: PlayerIndex = p === 0 ? 1 : 0;
    if (against === 'serve') {
      return (['wide', 'neutral', 'tLine'] as const).map((r) => ({
        id: `read:${r}`,
        kind: 'read',
        label: labels[r],
        spot: serveReadSpot(p, this.side, r),
      }));
    }
    const from = this.players[opp].spot;
    return (['crossCourt', 'downTheLine', 'centerDeep', 'dropShot'] as const).map((a) => ({
      id: `read:${a}`,
      kind: 'read',
      label: labels[a],
      spot: attackContact(opp, from, a),
    }));
  }
}
