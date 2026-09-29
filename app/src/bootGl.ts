/**
 * The boot's WebGL renderer: one canvas, one full-screen triangle, one
 * program, two textures.
 *
 * Built for the TV family LG-XMB measured: no alpha, depth, stencil or
 * antialias, no `preserveDrawingBuffer`, shaders compiled at mount and polled
 * through `KHR_parallel_shader_compile` so the first draw never stalls on a
 * link, and a backing store capped by `BOOT_RENDER_SCALE`. WebGL2 first,
 * WebGL1 with the same shader rewritten if that fails, and a 2D drawing of the
 * settled lockup if neither exists.
 */

import { bootScene, type BootSceneFrame } from "./bootScene";
import { FRAGMENT_100, FRAGMENT_300, VERTEX_100, VERTEX_300 } from "./bootShader";
import type { BootTheme, Rgb } from "./bootTheme";

/**
 * The backing store as a fraction of the 1920x1080 frame. Two thirds is
 * 1280x720, the bumper asset's own size. UNVERIFIED on the TV: the shader's
 * cost there decides it, and 0.5 (960x540) is the next step down.
 */
export const BOOT_RENDER_SCALE = 2 / 3;

const FRAME_W = 1920;
const FRAME_H = 1080;

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

const COLOURS = {
  cGreyTop: (t: BootTheme) => t.field.greyTop,
  cGreyEdge: (t: BootTheme) => t.field.greyEdge,
  cPale: (t: BootTheme) => t.field.pale,
  cSetEdge: (t: BootTheme) => t.field.settledEdge,
  cSetMid: (t: BootTheme) => t.field.settledMid,
  cSetGlow: (t: BootTheme) => t.field.settledGlow,
  cBase: (t: BootTheme) => t.sphere.base,
  cShadow: (t: BootTheme) => t.sphere.shadow,
  cSpec: (t: BootTheme) => t.sphere.specular,
  cRim: (t: BootTheme) => t.sphere.rim,
  cWall: (t: BootTheme) => t.mark.wall,
  cCore: (t: BootTheme) => t.mark.core,
  cAccent: (t: BootTheme) => t.accent,
} as const satisfies Record<string, (theme: BootTheme) => Rgb>;

const VEC4S = [
  "sphere",
  "light",
  "halo",
  "mark",
  "star",
  "field",
  "ring",
  "ringB",
  "extra",
] as const satisfies readonly (keyof BootSceneFrame)[];

function css(c: Rgb): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

/** The mark's local frame in view space, as the columns of a 3x3 matrix. */
export function poleBasis(yaw: number, pitch: number, roll: number): Float32Array {
  const ez = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  let ex = [ez[2] as number, 0, -(ez[0] as number)];
  const len = Math.hypot(ex[0] as number, ex[2] as number) || 1;
  ex = ex.map((v) => v / len);
  const ey0 = [
    (ez[1] as number) * (ex[2] as number) - (ez[2] as number) * (ex[1] as number),
    (ez[2] as number) * (ex[0] as number) - (ez[0] as number) * (ex[2] as number),
    (ez[0] as number) * (ex[1] as number) - (ez[1] as number) * (ex[0] as number),
  ];
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const rx = ex.map((v, i) => c * v + s * (ey0[i] as number));
  const ry = ex.map((v, i) => -s * v + c * (ey0[i] as number));
  return new Float32Array([...rx, ...ry, ...ez]);
}

export class BootRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: Gl | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private shaders: WebGLShader[] = [];
  private parallel: { COMPLETION_STATUS_KHR: number } | null = null;
  private locations = new Map<string, WebGLUniformLocation | null>();
  private readonly theme: BootTheme;
  private ready = false;
  /** Set when there is no GL at all and the settled lockup is drawn in 2D. */
  private flat = false;
  private orb: HTMLImageElement | null = null;
  private wordmark: HTMLImageElement | null = null;

  constructor(canvas: HTMLCanvasElement, theme: BootTheme) {
    this.canvas = canvas;
    this.theme = theme;
    canvas.width = Math.round(FRAME_W * BOOT_RENDER_SCALE);
    canvas.height = Math.round(FRAME_H * BOOT_RENDER_SCALE);
    const attributes: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    };
    const gl2 = canvas.getContext("webgl2", attributes);
    if (gl2 !== null && this.build(gl2, VERTEX_300, FRAGMENT_300)) return;
    const gl1 = gl2 === null ? canvas.getContext("webgl", attributes) : null;
    if (gl1 !== null && this.build(gl1, VERTEX_100, FRAGMENT_100)) return;
    this.flat = true;
    this.loadImages();
  }

  /** True when there is a context of either kind, compiled or not yet. */
  get accelerated(): boolean {
    return this.gl !== null;
  }

  private build(gl: Gl, vertex: string, fragment: string): boolean {
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (program === null || buffer === null) return false;
    this.gl = gl;
    this.program = program;
    this.buffer = buffer;
    this.parallel = gl.getExtension("KHR_parallel_shader_compile");
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type);
      if (shader === null) return false;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      this.shaders.push(shader);
    }
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    return true;
  }

  /**
   * Whether the program is linked and the first frame can be drawn without a
   * stall. Without the extension the first draw would block, so this answers
   * true and lets it.
   */
  poll(): boolean {
    if (this.ready || this.flat) return true;
    const gl = this.gl;
    const program = this.program;
    if (gl === null || program === null) return true;
    if (this.parallel !== null) {
      if (gl.getProgramParameter(program, this.parallel.COMPLETION_STATUS_KHR) !== true) {
        return false;
      }
    }
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      console.error("[xne] boot shader", gl.getProgramInfoLog(program), ...this.shaderLogs());
      this.release();
      this.flat = true;
      this.loadImages();
      return true;
    }
    this.finish(gl, program);
    this.ready = true;
    return true;
  }

  private shaderLogs(): string[] {
    const gl = this.gl;
    if (gl === null) return [];
    return this.shaders.map((shader) => gl.getShaderInfoLog(shader) ?? "");
  }

  /** A uniform's location, looked up once. `name` is a scene key or a full uniform name. */
  private location(gl: Gl, name: string): WebGLUniformLocation | null {
    const full = /^[uc][A-Z]/.test(name) ? name : `u${name[0]?.toUpperCase()}${name.slice(1)}`;
    let found = this.locations.get(full);
    if (found === undefined && this.program !== null) {
      found = gl.getUniformLocation(this.program, full);
      this.locations.set(full, found);
    }
    return found ?? null;
  }

  private finish(gl: Gl, program: WebGLProgram): void {
    gl.useProgram(program);
    for (const [name, pick] of Object.entries(COLOURS)) {
      const colour = pick(this.theme);
      gl.uniform3f(this.location(gl, name), colour[0], colour[1], colour[2]);
    }
    const mark = this.theme.mark;
    gl.uniform4f(
      this.location(gl, "uShape"),
      (mark.angle * Math.PI) / 180,
      mark.width,
      mark.flare,
      this.theme.sphere.grain,
    );
    gl.uniform2f(this.location(gl, "uRes"), this.canvas.width, this.canvas.height);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  /** Draw master frame `frame`. A no-op until `poll` has answered true. */
  draw(frame: number): void {
    if (this.flat) {
      this.drawFlat();
      return;
    }
    const gl = this.gl;
    if (gl === null || !this.ready) return;
    const scene: BootSceneFrame = bootScene(frame);
    for (const name of VEC4S) gl.uniform4fv(this.location(gl, name), scene[name]);
    gl.uniformMatrix3fv(
      this.location(gl, "uBasis"),
      false,
      poleBasis(scene.pole[0], scene.pole[1], scene.pole[2]),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private loadImages(): void {
    const orb = new Image();
    const wordmark = new Image();
    orb.src = this.theme.orb.url;
    wordmark.src = this.theme.wordmark.url;
    this.orb = orb;
    this.wordmark = wordmark;
  }

  /** The settled lockup on its field, for a device with no GL at all. */
  private drawFlat(): void {
    const context = this.canvas.getContext("2d");
    if (context === null) return;
    const scale = this.canvas.width / FRAME_W;
    const field = this.theme.field;
    const gradient = context.createRadialGradient(
      960 * scale,
      560 * scale,
      0,
      960 * scale,
      560 * scale,
      700 * scale,
    );
    gradient.addColorStop(0, css(field.settledGlow));
    gradient.addColorStop(0.6, css(field.settledMid));
    gradient.addColorStop(1, css(field.settledEdge));
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    void this.orb;
    void this.wordmark;
  }

  /** Give the context back. The canvas keeps its last frame until it is removed. */
  release(): void {
    const gl = this.gl;
    if (gl === null) return;
    for (const shader of this.shaders) gl.deleteShader(shader);
    if (this.program !== null) gl.deleteProgram(this.program);
    if (this.buffer !== null) gl.deleteBuffer(this.buffer);
    this.shaders = [];
    this.program = null;
    this.buffer = null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.ready = false;
  }
}
