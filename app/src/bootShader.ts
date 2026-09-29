/**
 * The boot's one fragment shader, GLSL ES 3.00 for WebGL2 and a 1.00 rewrite
 * of the same source for WebGL1.
 *
 * It draws in the 1920x1080 frame whatever the backing store is, so every
 * number `bootScene.ts` hands it is in frame pixels, y down.
 */

export const VERTEX_300 = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const BODY = `
uniform vec2 uRes;
uniform vec4 uSphere;
uniform mat3 uBasis;
uniform vec4 uLight;
uniform vec4 uHalo;
uniform vec4 uMark;
uniform vec4 uStar;
uniform vec4 uRing;
uniform vec4 uRingB;
uniform vec4 uExtra;
uniform vec4 uOrb;
uniform vec4 uOrbDisc;
uniform vec4 uMarkT;
uniform vec4 uMarkB;
uniform sampler2D tOrb;
uniform sampler2D tMark;
uniform vec4 uField;
uniform vec4 uShape;

uniform vec3 cGreyTop;
uniform vec3 cGreyEdge;
uniform vec3 cPale;
uniform vec3 cSetEdge;
uniform vec3 cSetMid;
uniform vec3 cSetGlow;
uniform vec3 cBase;
uniform vec3 cShadow;
uniform vec3 cSpec;
uniform vec3 cRim;
uniform vec3 cWall;
uniform vec3 cCore;
uniform vec3 cAccent;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 field(vec2 p) {
  float t = clamp(1.0 - length((p - vec2(760.0, -160.0)) / vec2(1350.0, 1250.0)), 0.0, 1.0);
  vec3 grey = mix(cGreyEdge, cGreyTop, t * t * (3.0 - 2.0 * t));
  vec3 c = grey * uField.x;
  c = mix(c, cPale, uField.y);
  float g = clamp(1.0 - length((p - vec2(960.0, 620.0)) / vec2(620.0, 820.0)), 0.0, 1.0);
  vec3 settled = mix(cSetEdge, cSetMid, smoothstep(0.0, 0.4, g));
  settled = mix(settled, cSetGlow, smoothstep(0.25, 1.0, g));
  c = mix(c, c * vec3(0.78, 1.0, 0.7) + cAccent * 0.08, uField.w);
  return mix(c, settled, uField.z);
}

vec3 shell(vec3 n, float px) {
  vec3 q = n * uBasis;
  float ca = cos(uShape.x);
  float sa = sin(uShape.x);
  float d1 = abs(dot(q, vec3(ca, -sa, 0.0)));
  float d2 = abs(dot(q, vec3(ca, sa, 0.0)));
  float theta = acos(clamp(q.z, -1.0, 1.0));
  float front = smoothstep(-0.35, -0.05, q.z);

  vec3 key = normalize(vec3(0.9, 0.25, 0.35));
  float diff = max(dot(n, key), 0.0);
  diff *= diff * diff;
  float rim = pow(1.0 - n.z, 12.0) * smoothstep(-0.2, 0.6, n.y);
  vec2 wq = q.xy + 0.004 * vec2(noise(q.yx * 40.0), noise(q.xy * 40.0));
  float grain = noise(vec2(wq.x * 20.0, wq.y * 700.0)) - 0.5;

  vec3 c = cBase * (uLight.z + diff * uLight.x) * (1.0 + uShape.w * grain);
  c += cRim * rim * uLight.y;
  vec3 h = normalize(key + vec3(0.0, 0.0, 1.0));
  c += cSpec * pow(max(dot(n, h), 0.0), 30.0) * uLight.x * 0.35;

  float taper = max(1.0 - theta / uStar.x, 0.0);
  float sw = uStar.y * sqrt(taper) + 1e-4;
  float star = max(exp(-d1 * d1 / (sw * sw)), exp(-d2 * d2 / (sw * sw))) * sqrt(taper);
  c += mix(cRim, cCore, 0.4) * star * uMark.x * front;

  float w = uShape.y * uMark.w + uShape.z * max(1.0 - q.z, 0.0) * min(uMark.w, 1.0);
  float dm = min(d1, d2);
  float gap = dm - w;
  float inGroove = (1.0 - smoothstep(-px, px, gap)) * front * step(0.001, uMark.w);
  float across = clamp(dm / max(w, 1e-4), 0.0, 1.0);
  float nearPole = exp(-theta * theta / 0.05);
  vec3 grooveC = mix(cCore, cWall, smoothstep(0.05, 0.7, across) * (1.0 - 0.7 * nearPole));
  grooveC = mix(grooveC, vec3(1.0), max(uMark.z, 0.75 * nearPole)) * uMark.y;
  float spill = exp(-max(gap, 0.0) / (0.01 + 0.03 * uMark.z)) * (0.3 + 0.7 * nearPole);
  c += mix(cCore, vec3(1.0), uMark.z) * spill * (uMark.y * 0.25 + uMark.z * 0.8) * front;
  c += mix(cCore, vec3(1.0), 0.6) * uMark.y * min(uMark.w, 1.0) * 0.9 * exp(-theta * theta / 0.05) * front;
  float lip =exp(-pow(gap / (0.005 + px), 2.0)) * step(0.0, gap);
  c += vec3(0.85, 0.95, 0.85) * lip * uMark.w * 0.7 * front;
  return mix(c, grooveC, inGroove);
}

float beam(vec2 p, vec2 at, vec2 dir) {
  vec2 v = p - at;
  dir *= sign(dir.x + 1e-4);
  float along = max(dot(v, dir), 0.0);
  float across = dot(v, vec2(-dir.y, dir.x));
  float width = 0.09 * uSphere.z + 0.1 * abs(along);
  return (1.0 - smoothstep(0.6 * width, width, abs(across))) * exp(-abs(along) / uStar.w);
}

float ring(vec2 p, float scale) {
  vec2 v = p - uRing.xy;
  float ca = cos(uRingB.x);
  float sa = sin(uRingB.x);
  v = vec2(ca * v.x + sa * v.y, -sa * v.x + ca * v.y);
  float e = length(v / (uRing.zw * scale));
  float dist = (e - 1.0) * min(uRing.z, uRing.w) * scale;
  float fill = 0.12 * smoothstep(1.0, 0.5, e);
  return exp(-dist * dist / (uRingB.y * uRingB.y)) + 0.25 * exp(-abs(dist) / (uRingB.y * 5.0)) + fill;
}

vec3 bokeh(vec2 p) {
  float b = 0.0;
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    vec2 at = vec2(fract(sin(k * 12.9898) * 43758.5453), fract(sin(k * 78.233) * 43758.5453));
    at = at * vec2(1920.0, 1080.0) + vec2(uExtra.w * (20.0 + 15.0 * k), 0.0);
    float r = 70.0 + 60.0 * fract(k * 0.618);
    b += 0.5 * smoothstep(r, r * 0.6, length(p - at));
  }
  return vec3(b);
}

vec3 scene(vec2 p) {
  vec3 c = field(p);
  c += bokeh(p) * uExtra.z * 0.25;
  vec2 d = (p - uSphere.xy) / uSphere.z;
  d.x /= uExtra.x;
  float rr = dot(d, d);
  float out1 = max(length(p - uSphere.xy) - uSphere.z, 0.0);
  float hx = (p.x - uHalo.x) / uHalo.y;
  c += cRim * uHalo.w * exp(-out1 / uHalo.z) * exp(-hx * hx);

  float px = 1.5 / uSphere.z;
  if (rr < 1.0) {
    vec3 n = vec3(d.x, -d.y, sqrt(1.0 - rr));
    float edge = smoothstep(1.0, 1.0 - 2.0 * px, sqrt(rr));
    vec3 s = mix(shell(n, px * 2.0), c, uExtra.y * (0.6 + 0.4 * n.z));
    c = mix(c, s, edge * uSphere.w);
  }
  if (uStar.z > 0.0) {
    vec3 ez = uBasis[2];
    vec2 at = uSphere.xy + vec2(ez.x, -ez.y) * uSphere.z;
    float ca = cos(uShape.x);
    float sa = sin(uShape.x);
    vec3 t1 = uBasis * vec3(sa, ca, 0.0);
    vec3 t2 = uBasis * vec3(-sa, ca, 0.0);
    vec2 s1 = normalize(vec2(t1.x, -t1.y) + 1e-5);
    vec2 s2 = normalize(vec2(t2.x, -t2.y) + 1e-5);
    float b = max(beam(p, at, s1), beam(p, at, s2)) * smoothstep(0.0, 60.0, out1);
    c += mix(cCore, vec3(1.0), 0.7) * b * uStar.z;
  }
  if (uRingB.z > 0.0) {
    float r = ring(p, 1.0) + 0.7 * ring(p, 1.0 + uRingB.w);
    c = mix(c, min(cAccent * 1.3, 1.0), clamp(r * uRingB.z, 0.0, 1.0));
  }
  if (uOrb.w > 0.0) {
    vec2 uv = (p - uOrb.xy) / uOrb.z;
    vec2 e = (uv - uOrbDisc.xy) / uOrbDisc.zw;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float mask = smoothstep(1.0, 0.985, length(e)) * inside;
    c = mix(c, TEX(tOrb, uv, 0.0).rgb, mask * uOrb.w);
  }
  if (uMarkT.w > 0.0) {
    vec2 uv = (p - uMarkT.xy) / vec2(uMarkT.z, uMarkT.z * uMarkB.y);
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec4 m = TEX(tMark, uv, uMarkB.x);
    c = mix(c, m.rgb, m.a * inside * uMarkT.w);
  }
  return c * uLight.w;
}
`;

const MAIN_300 = `
out vec4 outColor;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) * (1920.0 / uRes.x);
  outColor = vec4(clamp(scene(p), 0.0, 1.0), 1.0);
}
`;

const MAIN_100 = `
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) * (1920.0 / uRes.x);
  gl_FragColor = vec4(clamp(scene(p), 0.0, 1.0), 1.0);
}
`;

export const FRAGMENT_300 = `#version 300 es\nprecision highp float;\n#define TEX texture\n${BODY}${MAIN_300}`;

export const VERTEX_100 = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAGMENT_100 = `precision highp float;\n#define TEX texture2D\n${BODY}${MAIN_100}`;
