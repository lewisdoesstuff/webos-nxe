import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { fetchBytes } from "../sound/engine";
import { AVATAR_VIEW, frameAvatar } from "./framing";
import { firstIdle, nextIdle, planIdle, type IdlePlan, type IdleStep } from "./idle";

/**
 * The avatar: one glTF model, skinned and animated, in one small canvas.
 *
 * The canvas is a fixed box promoted by its element, so the hub moves it by
 * transform like a pane and its texture is allocated once. Drawing is the
 * only per-frame cost: the mixer steps, the scene draws, and the compositor
 * takes the new frame. `stop()` ends that entirely and the canvas keeps its
 * last frame, which is how the hub freezes the avatar for a transition, and
 * how it parks it off channel.
 *
 * The model is a 360sona export: the console's rig, baked textures and its own
 * idle clips (`idle.ts`).
 */

export interface AvatarOptions {
  /** The canvas's CSS size, which is its layer's size. */
  readonly width: number;
  readonly height: number;
  /** Backing store over CSS size. Below 1 trades sharpness for fill. */
  readonly renderScale?: number;
  /** Draws a second. The mixer still steps by real time. */
  readonly fps?: number;
  /** Told each time a clip starts. */
  readonly onClip?: (clip: string) => void;
}

/** A held prop's mesh. Retail's hub avatar stands empty-handed. */
const CARRYABLE = /^carryable:/;

/** Seconds a clip takes to blend into the next. */
const BLEND_S = 0.35;

/** Retail's hub light: a bright sky, a grey floor bounce, a key from the upper left. */
const SKY = 0xffffff;
const GROUND = 0x6a7076;

function shadowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.25)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/**
 * glTF defaults `metallicFactor` to 1, and with no environment to reflect a
 * metal surface draws black. Nothing on an avatar is metal except where a map
 * says so.
 */
function unmetal(material: Material): void {
  if (material instanceof MeshStandardMaterial && material.metalnessMap === null) {
    material.metalness = 0;
  }
}

export class AvatarRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly timer = new Timer();
  private readonly interval: number;
  private readonly random: () => number;
  private readonly onClip: ((clip: string) => void) | undefined;
  private mixer: AnimationMixer | null = null;
  private actions = new Map<string, AnimationAction>();
  private plan: IdlePlan | null = null;
  private step: IdleStep | null = null;
  private lastIdle: string | undefined;
  private frame = 0;
  private drawnAt = 0;
  private released = false;

  constructor(canvas: HTMLCanvasElement, options: AvatarOptions, random = Math.random) {
    const scale = options.renderScale ?? 1;
    this.interval = 1000 / (options.fps ?? 30);
    this.random = random;
    this.onClip = options.onClip;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      Math.round(options.width * scale),
      Math.round(options.height * scale),
      false,
    );
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.camera = new PerspectiveCamera(AVATAR_VIEW.fov, options.width / options.height, 0.05, 50);
    this.scene.add(new HemisphereLight(SKY, GROUND, 2.2));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-1.2, 2.4, 2);
    this.scene.add(key);
  }

  /**
   * Load the model, frame it and pose it on its first frame. Draws once. Read
   * over XMLHttpRequest, because `fetch` cannot read the TV's `file://`.
   */
  async load(url: string): Promise<void> {
    const bytes = await fetchBytes(url);
    if (this.released) return;
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    if (this.released) return;
    const model = gltf.scene;
    const props: Object3D[] = [];
    model.traverse((node) => {
      if (CARRYABLE.test(node.name)) props.push(node);
      if (!(node instanceof Mesh)) return;
      node.frustumCulled = false;
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(unmetal);
    });
    for (const prop of props) prop.removeFromParent();
    this.scene.add(model);

    this.mixer = new AnimationMixer(model);
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.set(clip.name, action);
    }
    this.mixer.addEventListener("finished", () => this.advance());
    this.plan = planIdle([...this.actions.keys()]);
    if (this.plan !== null) {
      this.step = firstIdle(this.plan, this.random);
      this.actions.get(this.step.clip)?.play();
      this.mixer.update(0);
      this.onClip?.(this.step.clip);
    }

    this.place(model);
    this.draw();
  }

  /** Frame the model as it stands on its first posed frame, and put its shadow under it. */
  private place(model: Object3D): void {
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const place = frameAvatar(box.min.y, size.y, AVATAR_VIEW);
    this.camera.position.set(centre.x, place.height, centre.z + place.distance);
    this.camera.lookAt(centre.x, place.height, centre.z);

    const width = Math.max(size.x, size.z) * 0.8;
    const shadow = new Mesh(
      new PlaneGeometry(width, width * 0.45),
      new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(centre.x, box.min.y + 0.001, centre.z);
    this.scene.add(shadow);
  }

  private advance(): void {
    const plan = this.plan;
    const mixer = this.mixer;
    if (plan === null || mixer === null || this.step === null) return;
    const from = this.actions.get(this.step.clip);
    const next = nextIdle(plan, this.step, this.random, this.lastIdle);
    if (next.clip !== plan.rest) this.lastIdle = next.clip;
    this.step = next;
    const to = this.actions.get(next.clip);
    if (to === undefined) return;
    to.reset();
    if (from !== undefined && from !== to) {
      to.play();
      to.crossFadeFrom(from, BLEND_S, false);
    } else {
      to.play();
    }
    this.onClip?.(next.clip);
  }

  private draw(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private tick = (now: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    if (now - this.drawnAt < this.interval - 1) return;
    this.drawnAt = now;
    this.timer.update(now);
    this.mixer?.update(Math.max(0, this.timer.getDelta()));
    this.draw();
  };

  /** Animate. Time resumes where `stop()` left it, so nothing jumps. */
  start(): void {
    if (this.frame !== 0 || this.released) return;
    this.timer.reset();
    this.drawnAt = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Freeze on the frame last drawn. The canvas keeps it; nothing is drawn until `start()`. */
  stop(): void {
    if (this.frame === 0) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  get running(): boolean {
    return this.frame !== 0;
  }

  /** The clip playing now, for the harness and tests. */
  get clip(): string | null {
    return this.step?.clip ?? null;
  }

  /** Give the context back. The canvas keeps its last frame until it is removed. */
  release(): void {
    this.stop();
    this.released = true;
    this.mixer?.stopAllAction();
    this.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value !== null && typeof value === "object" && "isTexture" in value) {
            (value as { dispose(): void }).dispose();
          }
        }
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.mixer = null;
  }
}
