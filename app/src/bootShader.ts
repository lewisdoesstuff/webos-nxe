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
uniform mat3 uSettle;
uniform vec4 uDecal;
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
uniform vec4 uGroove;
uniform vec4 uGaps;
uniform vec4 uStreak;

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
uniform vec3 cFloor;
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
  float ca = cos(uShape.x + uGroove.w);
  float sa = sin(uShape.x + uGroove.w);
  vec3 m1 = vec3(ca, -sa, 0.0);
  vec3 m2 = vec3(ca, sa, 0.0);
  float e1 = dot(q, m1);
  float e2 = dot(q, m2);
  float d1 = abs(e1);
  float d2 = abs(e2);
  float theta = acos(clamp(q.z, -1.0, 1.0));
  float front = smoothstep(-0.35, -0.05, q.z);

  float open = uMark.w;
  float on = step(0.001, open);
  float base = uShape.y * open * (1.0 + uGroove.x * clamp(1.0 - q.z, 0.0, 1.0));
  float away = smoothstep(0.05, 0.7, theta);
  float w1 = base * mix(1.0, mix(uGaps.z, uGaps.x, smoothstep(-0.2, 0.2, q.x * sa + q.y * ca)), away);
  float w2 = base * mix(1.0, mix(uGaps.w, uGaps.y, smoothstep(-0.2, 0.2, q.y * ca - q.x * sa)), away);
  float g1 = d1 - w1;
  float g2 = d2 - w2;
  bool one = g1 < g2;
  float gap = one ? g1 : g2;
  float e = one ? e1 : e2;
  float w = one ? w1 : w2;
  vec3 m = one ? m1 : m2;

  float bw = 0.018 + 0.03 * min(open, 1.0);
  float bev = (1.0 - smoothstep(0.0, bw, gap)) * step(0.0, gap) * front * on;
  vec3 nb = normalize(n - bev * 1.3 * (uBasis * (m * (e < 0.0 ? -1.0 : 1.0))));

  vec3 key = normalize(vec3(0.9, 0.25, 0.35));
  float diff = max(dot(nb, key), 0.0);
  diff *= diff;
  vec3 r = vec3(2.0 * nb.z * nb.x, 2.0 * nb.z * nb.y, 2.0 * nb.z * nb.z - 1.0);
  float box1 = smoothstep(0.35, 0.95, dot(r, normalize(vec3(0.55, 0.75, 0.45))));
  float box2 = smoothstep(0.55, 1.0, dot(r, normalize(vec3(0.95, -0.1, 0.35))));
  float dark = mix(0.2, 1.0, smoothstep(-0.9, 0.6, nb.x + 0.35 * nb.y));
  float rim = pow(1.0 - n.z, 12.0) * smoothstep(-0.2, 0.6, n.y);
  vec2 wq = q.xy + 0.004 * vec2(noise(q.yx * 40.0), noise(q.xy * 40.0));
  float grain = noise(vec2(wq.x * 20.0, wq.y * 700.0)) - 0.5;

  float lit = uLight.z * (0.25 + 0.5 * dark) + uLight.x * (0.45 * diff + 0.55 * box1 * dark + 0.4 * box2);
  vec3 c = mix(cShadow, cBase, clamp(lit, 0.0, 1.0)) * (0.4 + 0.65 * lit) * (1.0 + uShape.w * 2.0 * grain);
  c += cRim * rim * uLight.y;
  vec3 h = normalize(key + vec3(0.0, 0.0, 1.0));
  c += cSpec * pow(max(dot(nb, h), 0.0), 30.0) * uLight.x * 0.3 * (1.0 + 3.0 * uShape.w * grain);

  float taper = max(1.0 - theta / uStar.x, 0.0);
  float sw = uStar.y * sqrt(taper) + 1e-4;
  float star = max(exp(-d1 * d1 / (sw * sw)), exp(-d2 * d2 / (sw * sw))) * sqrt(taper);
  c += mix(cRim, cCore, 0.4) * star * uMark.x * front;

  vec3 vq = vec3(uBasis[0].z, uBasis[1].z, uBasis[2].z);
  float s = dot(m, vq);
  float u = e * (s < 0.0 ? -1.0 : 1.0);
  float wallF = (u + w) / max(abs(s), 0.05) * max(n.z, 0.05) / max(uGroove.y, 1e-3);
  float inWall = 1.0 - smoothstep(0.9, 1.0, wallF);
  float along = one ? q.x * sa + q.y * ca : q.y * ca - q.x * sa;
  float hatch = noise(vec2(along * 240.0, wallF * 1.7));
  float nearPole = exp(-theta * theta / 0.25);

  vec3 wallC = cWall * 1.35 * (0.6 + 0.8 * hatch) * mix(0.7, 1.0, wallF);
  vec3 cream = cCore * vec3(0.97, 0.98, 0.75);
  float side = clamp((u + w) / (2.0 * w + 1e-4), 0.0, 1.0);
  vec3 floorC = mix(cFloor * 0.75, cFloor, smoothstep(0.0, 0.15, side));
  floorC = mix(floorC, cream, smoothstep(0.1, 0.55, side) * (1.0 - smoothstep(0.5, 1.2, theta)));
  vec3 grooveC = mix(floorC, wallC, inWall);
  float heat = max(uMark.z, (1.0 - smoothstep(0.28, 0.8, theta)) * min(open, 1.0) * uGroove.z);
  grooveC = mix(grooveC, vec3(1.0), clamp(heat, 0.0, 1.0) * (1.0 - 0.6 * inWall));
  grooveC *= uMark.y;

  float inGroove = (1.0 - smoothstep(-2.0 * px, 2.0 * px, gap)) * front * on;
  float spill = exp(-max(gap, 0.0) / (0.012 + 0.02 * uMark.z)) + 0.35 * exp(-max(gap, 0.0) / 0.1);
  spill *= (0.25 + 0.75 * nearPole * uGroove.z) * (1.0 - 0.75 * inGroove);
  c += mix(mix(cCore, cFloor, 0.6), vec3(1.0), uMark.z * 0.7 + 0.3 * nearPole) * spill * (uMark.y * 0.6 + uMark.z * 0.8) * front * min(open, 1.0);
  c += mix(cCore, vec3(1.0), 0.6) * uMark.y * min(open, 1.0) * 0.45 * nearPole * front * uGroove.z;
  c += vec3(1.0) * uMark.z * min(open, 1.0) * (0.8 * exp(-max(gap, 0.0) / 0.07)) * front;
  float lip = exp(-pow(gap / (0.004 + px), 2.0)) * step(0.0, gap);
  c += vec3(0.85, 0.95, 0.85) * lip * open * 0.35 * front;
  float halo = exp(-max(gap, 0.0) / 0.03) + 0.4 * exp(-max(gap, 0.0) / 0.09);
  c += cWall * halo * uMark.y * min(open, 1.0) * (0.55 + 0.45 * nearPole) * 0.8 * front;
  c = mix(c, grooveC, inGroove);
  if (uDecal.x > 0.0) {
    float da = uGroove.w - uDecal.y;
    float cd = cos(da);
    float sd = sin(da);
    vec3 sv = uSettle * vec3(cd * q.x + sd * q.y, cd * q.y - sd * q.x, q.z);
    vec2 uv = vec2(uOrbDisc.x + sv.x * uOrbDisc.z, uOrbDisc.y - sv.y * uOrbDisc.w);
    c = mix(c, TEX(tOrb, uv, 0.0).rgb, uDecal.x * smoothstep(-0.25, 0.1, sv.z));
  }
  return c;
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
  float fill = 0.04 * smoothstep(1.0, 0.5, e);
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
  if (uStreak.w > 0.0) {
    vec2 sd = vec2(cos(uStreak.z), -sin(uStreak.z));
    vec2 sv = p - uStreak.xy;
    float sl = max(dot(sv, sd), 0.0);
    float sx = dot(sv, vec2(-sd.y, sd.x));
    float sw = 20.0 + 0.11 * sl;
    float fade = exp(-sl / 3200.0) * smoothstep(0.0, 120.0, sl);
    float white = exp(-sx * sx / (sw * sw * 2.0));
    float green = exp(-pow((sx - 1.5 * sw) / (0.8 * sw), 2.0));
    c += vec3(0.5) * white * fade * uStreak.w + cAccent * 0.9 * green * fade * uStreak.w;
  }
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
    vec3 s = mix(shell(n, px * 2.0), c, uExtra.y * (1.0 - uDecal.x) * (0.6 + 0.4 * n.z));
    c = mix(c, s, edge * uSphere.w);
  }
  float bloom = uGroove.z * clamp((uMark.w - 1.0) / 3.0, 0.0, 1.0) * uSphere.w * (1.0 - uMark.z);
  if (bloom > 0.0) {
    vec3 ez = uBasis[2];
    vec2 at = uSphere.xy + vec2(ez.x, -ez.y) * uSphere.z;
    float dd = length(p - at) / uSphere.z;
    float bl = 0.6 * exp(-dd * dd / 0.05) + 0.3 * exp(-dd / 0.35);
    c += mix(cCore, vec3(1.0), 0.65) * bl * bloom * smoothstep(-0.1, 0.3, ez.z);
  }
  if (uStar.z > 0.0) {
    vec3 ez = uBasis[2];
    vec2 at = uSphere.xy + vec2(ez.x, -ez.y) * uSphere.z;
    float ca = cos(uShape.x + uGroove.w);
    float sa = sin(uShape.x + uGroove.w);
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
