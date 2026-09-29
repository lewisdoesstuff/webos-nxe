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

import { bootScene, SETTLE_FRAME, type BootSceneFrame, type Vec4 } from "./bootScene";
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
  cFloor: (t: BootTheme) => t.mark.floor,
  cAccent: (t: BootTheme) => t.accent,
} as const satisfies Record<string, (theme: BootTheme) => Rgb>;

const VEC4S = [
  "sphere",
  "light",
  "halo",
  "mark",
  "groove",
  "gaps",
  "streak",
  "star",
  "field",
  "ring",
  "ringB",
  "extra",
  "decal",
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

const SETTLE_POLE = bootScene(SETTLE_FRAME).pole;

/** The pose the settled orb image is projected from onto the turning sphere. */
const SETTLE_BASIS = poleBasis(SETTLE_POLE[0], SETTLE_POLE[1], SETTLE_POLE[2]);

/** Where the settled orb and the wordmark are drawn on a frame, in frame pixels. */
export function lockupPlacement(
  theme: BootTheme,
  scene: BootSceneFrame,
): { orb: Vec4; orbDisc: Vec4; markT: Vec4; markB: Vec4 } {
  const { orb, wordmark, lockup } = theme;
  const [dx, dy, orbScale, orbAlpha] = scene.orb;
  const k = (lockup.orbRy / orb.ry) * orbScale;
  const [markScale, markAlpha, markBlur] = scene.wordmark;
  const aspect = wordmark.height / wordmark.width;
  const width = lockup.markWidth * markScale;
  const centreX = lockup.markX + lockup.markWidth / 2;
  const centreY = lockup.markY + (lockup.markWidth * aspect) / 2;
  return {
    orb: [lockup.orbX + dx - orb.cx * k, lockup.orbY + dy - orb.cy * k, orb.width * k, orbAlpha],
    orbDisc: [orb.cx / orb.width, orb.cy / orb.height, orb.rx / orb.width, orb.ry / orb.height],
    markT: [centreX - width / 2, centreY - (width * aspect) / 2, width, markAlpha],
    markB: [markBlur, aspect, 0, 0],
  };
}

export class BootRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: Gl | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private shaders: WebGLShader[] = [];
  private textures: WebGLTexture[] = [];
  private parallel: { COMPLETION_STATUS_KHR: number } | null = null;
  private locations = new Map<string, WebGLUniformLocation | null>();
  private readonly theme: BootTheme;
  private ready = false;
  /** Set when there is no GL at all and the settled lockup is drawn in 2D. */
  private flat = false;
  private readonly images: readonly [HTMLImageElement, HTMLImageElement];

  constructor(canvas: HTMLCanvasElement, theme: BootTheme) {
    this.canvas = canvas;
    this.theme = theme;
    canvas.width = Math.round(FRAME_W * BOOT_RENDER_SCALE);
    canvas.height = Math.round(FRAME_H * BOOT_RENDER_SCALE);
    this.images = [new Image(), new Image()];
    const attributes: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    };
    const gl2 = canvas.getContext("webgl2", attributes);
    if (gl2 === null || !this.build(gl2, VERTEX_300, FRAGMENT_300)) {
      const gl1 = gl2 === null ? canvas.getContext("webgl", attributes) : null;
      if (gl1 === null || !this.build(gl1, VERTEX_100, FRAGMENT_100)) this.flat = gl2 === null;
    }
    this.images.forEach((image, unit) => {
      image.addEventListener("load", () => this.upload(unit, image), { once: true });
      image.src = unit === 0 ? theme.orb.url : theme.wordmark.url;
    });
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
    for (let unit = 0; unit < 2; unit++) {
      const texture = gl.createTexture();
      if (texture === null) return false;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(4),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textures.push(texture);
    }
    return true;
  }

  /**
   * Put a decoded image into its texture. The images are inlined data URLs, so
   * this lands within a few frames of mount, long before the lockup is drawn.
   * WebGL2 gets mipmaps, which is what blurs the wordmark in; WebGL1 cannot
   * mipmap these sizes and draws it sharp.
   */
  private upload(unit: number, image: HTMLImageElement): void {
    const gl = this.gl;
    const texture = this.textures[unit];
    if (gl === null || texture === undefined || gl.isContextLost()) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    if (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
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
      this.program = null;
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
    const full = /^[uct][A-Z]/.test(name) ? name : `u${name[0]?.toUpperCase()}${name.slice(1)}`;
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
      0,
      this.theme.sphere.grain,
    );
    gl.uniform2f(this.location(gl, "uRes"), this.canvas.width, this.canvas.height);
    gl.uniform1i(this.location(gl, "tOrb"), 0);
    gl.uniform1i(this.location(gl, "tMark"), 1);
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
    if (gl === null) return;
    if (!this.ready) {
      const c = this.theme.field.settledMid;
      gl.clearColor(c[0], c[1], c[2], 1);
      if (this.program === null) gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const scene: BootSceneFrame = bootScene(frame);
    for (const name of VEC4S) gl.uniform4fv(this.location(gl, name), scene[name]);
    const placed = lockupPlacement(this.theme, scene);
    gl.uniform4fv(this.location(gl, "uOrb"), placed.orb);
    gl.uniform4fv(this.location(gl, "uOrbDisc"), placed.orbDisc);
    gl.uniform4fv(this.location(gl, "uMarkT"), placed.markT);
    gl.uniform4fv(this.location(gl, "uMarkB"), placed.markB);
    gl.uniformMatrix3fv(
      this.location(gl, "uBasis"),
      false,
      poleBasis(scene.pole[0], scene.pole[1], scene.pole[2]),
    );
    gl.uniformMatrix3fv(this.location(gl, "uSettle"), false, SETTLE_BASIS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The settled lockup on its field, for a device with no GL at all. */
  private drawFlat(): void {
    const context = this.canvas.getContext("2d");
    if (context === null) return;
    const s = this.canvas.width / FRAME_W;
    const field = this.theme.field;
    const gradient = context.createRadialGradient(960 * s, 560 * s, 0, 960 * s, 560 * s, 700 * s);
    gradient.addColorStop(0, css(field.settledGlow));
    gradient.addColorStop(0.6, css(field.settledMid));
    gradient.addColorStop(1, css(field.settledEdge));
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const placed = lockupPlacement(this.theme, bootScene(Number.POSITIVE_INFINITY));
    const [orb, wordmark] = this.images;
    const { orb: o, markT: m, markB: b } = placed;
    if (orb.complete) {
      const disc = this.theme.orb;
      context.save();
      context.beginPath();
      context.ellipse(
        (o[0] + disc.cx * (o[2] / disc.width)) * s,
        (o[1] + disc.cy * (o[2] / disc.width)) * s,
        disc.rx * (o[2] / disc.width) * s,
        disc.ry * (o[2] / disc.width) * s,
        0,
        0,
        Math.PI * 2,
      );
      context.clip();
      context.drawImage(orb, o[0] * s, o[1] * s, o[2] * s, o[2] * s);
      context.restore();
    }
    if (wordmark.complete) {
      context.drawImage(wordmark, m[0] * s, m[1] * s, m[2] * s, m[2] * b[1] * s);
    }
  }

  /** Give the context back. The canvas keeps its last frame until it is removed. */
  release(): void {
    const gl = this.gl;
    if (gl === null) return;
    for (const shader of this.shaders) gl.deleteShader(shader);
    for (const texture of this.textures) gl.deleteTexture(texture);
    if (this.program !== null) gl.deleteProgram(this.program);
    if (this.buffer !== null) gl.deleteBuffer(this.buffer);
    this.shaders = [];
    this.textures = [];
    this.program = null;
    this.buffer = null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.ready = false;
  }
}
