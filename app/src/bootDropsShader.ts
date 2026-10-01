/**
 * The fragment shader for "drops", the default theme's boot. Same frame and
 * conventions as `bootShader.ts`: every number is in 1920x1080 frame pixels,
 * y down, whatever the backing store is.
 */

import { fragments } from "./bootShader";

const BODY = `
uniform vec2 uRes;
uniform vec4 uDrops[6];
uniform vec4 uLight;
uniform vec4 uRing;
uniform vec4 uCentre;
uniform vec4 uOrb;
uniform vec4 uOrbDisc;
uniform vec4 uMarkT;
uniform vec4 uMarkB;
uniform vec4 uSheen;
uniform float uRelease;
uniform sampler2D tOrb;
uniform sampler2D tMark;

uniform vec3 cNight;
uniform vec3 cSetEdge;
uniform vec3 cSetMid;
uniform vec3 cSetGlow;
uniform vec3 cBase;
uniform vec3 cShadow;
uniform vec3 cSpec;
uniform vec3 cRim;
uniform vec3 cCore;
uniform vec3 cAccent;

vec3 field(vec2 p) {
  float g = clamp(1.0 - length((p - vec2(960.0, 620.0)) / vec2(620.0, 820.0)), 0.0, 1.0);
  vec3 c = mix(cSetEdge, cSetMid, smoothstep(0.0, 0.4, g));
  return mix(c, cSetGlow, smoothstep(0.25, 1.0, g));
}

vec3 night(vec2 p) {
  float v = clamp(1.0 - length((p - uCentre.xy) / vec2(1300.0, 950.0)), 0.0, 1.0);
  return cNight * (0.35 + 0.9 * v * v);
}

vec3 drop(vec3 n, float glow) {
  vec3 light = normalize(vec3(-0.15, 0.75, 0.6));
  float diff = max(dot(n, light), 0.0);
  float fres = pow(1.0 - n.z, 3.0);
  float through = smoothstep(-0.3, 0.9, -n.y) * n.z;
  vec3 c = mix(cShadow, cBase * 0.55, diff * 0.7);
  c += cAccent * (0.2 + 0.8 * through) * glow * 0.7;
  c += cRim * fres * 0.8;
  vec3 h = normalize(light + vec3(0.0, 0.0, 1.0));
  c += cSpec * (pow(max(dot(n, h), 0.0), 70.0) * 1.3 + 0.12 * smoothstep(0.75, 1.0, dot(n, h)));
  return c;
}

vec3 scene(vec2 p) {
  float px = 1920.0 / uRes.x;
  float dist = length(p - uCentre.xy);
  float reveal = max(uLight.w, uRing.w * smoothstep(uRing.x + uRing.y * 0.5, uRing.x - uRing.y * 2.0, dist));
  vec3 c = mix(night(p), field(p), reveal);

  float d = dist - uRing.x;
  float line = exp(-d * d / (uRing.y * uRing.y)) + 0.3 * exp(-abs(d) / (uRing.y * 3.0));
  float d2 = dist - uRing.x * 0.72;
  line += 0.4 * exp(-d2 * d2 / (uRing.y * uRing.y * 0.5));
  c += mix(cAccent, cCore, 0.5) * line * uRing.z * 0.55;

  float f = 0.0;
  float rw = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 v = p - uDrops[i].xy;
    float r2 = uDrops[i].z * uDrops[i].z;
    float q = dot(v, v) + 1e-3;
    float k = r2 / q;
    f += k;
    rw += k * r2;
    grad -= 2.0 * k * v / q;
  }
  float glow = uLight.y;
  float halo = min(f, 1.0);
  c += cAccent * glow * 0.3 * halo * halo * halo;
  float aa = length(grad) * px * 1.5 + 1e-4;
  float inside = smoothstep(1.0 - aa, 1.0 + aa, f);
  if (inside > 0.0) {
    vec2 nxy = -grad / (f * f) * sqrt(rw / f) * 0.5;
    float l = length(nxy);
    nxy /= max(l, 1.0);
    vec3 n = vec3(nxy.x, -nxy.y, sqrt(max(1.0 - dot(nxy, nxy), 0.0)));
    c = mix(c, drop(n, glow), inside);
  }

  c += mix(cCore, vec3(1.0), 0.5) * uLight.z * (0.9 * exp(-pow(dist / (uCentre.z * 1.1), 2.0)) + 0.15 * exp(-dist / 500.0));

  if (uOrb.w > 0.0) {
    vec2 uv = (p - uOrb.xy) / uOrb.z;
    vec2 e = (uv - uOrbDisc.xy) / uOrbDisc.zw;
    float box = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float mask = smoothstep(1.0, 0.985, length(e)) * box;
    c = mix(c, TEX(tOrb, uv, 0.0).rgb, mask * uOrb.w);
  }
  if (uMarkT.w > 0.0) {
    vec2 uv = (p - uMarkT.xy) / vec2(uMarkT.z, uMarkT.z * uMarkB.y);
    float box = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec4 m = TEX(tMark, uv, uMarkB.x);
    float band = uv.x - uSheen.x - (uv.y - 0.5) * 0.3;
    float sheen = exp(-band * band / 0.006) * uSheen.y;
    c = mix(c, mix(m.rgb, cAccent * 0.85, sheen * 0.7), m.a * box * uMarkT.w);
  }
  return c * uLight.x;
}
`;

export const DROPS = fragments(BODY);
