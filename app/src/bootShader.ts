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
  float g = clamp(1.0 - length((p - vec2(960.0, 560.0)) / vec2(620.0, 520.0)), 0.0, 1.0);
  vec3 settled = mix(cSetEdge, cSetMid, smoothstep(0.0, 0.4, g));
  settled = mix(settled, cSetGlow, smoothstep(0.25, 1.0, g));
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

  float w = (uShape.y + uShape.z * (1.0 - q.z)) * uMark.w;
  float gap = min(d1, d2) - w;
  float groove = (1.0 - smoothstep(-px, px, gap)) * front * step(0.001, uMark.w);
  float core = exp(-max(gap + w, 0.0) * 18.0);
  vec3 light = mix(cWall, cCore, core);
  float glow = uMark.y * front;
  vec3 floorC = mix(cShadow, light, glow);
  c += light * glow * exp(-max(gap, 0.0) * 14.0) * 0.6;
  return mix(c, floorC, groove);
}

vec3 scene(vec2 p) {
  vec3 c = field(p);
  vec2 d = (p - uSphere.xy) / uSphere.z;
  float rr = dot(d, d);
  float out1 = max(length(p - uSphere.xy) - uSphere.z, 0.0);
  float hx = (p.x - uHalo.x) / uHalo.y;
  c += cRim * uHalo.w * exp(-out1 / uHalo.z) * exp(-hx * hx);

  float px = 1.5 / uSphere.z;
  if (rr < 1.0) {
    vec3 n = vec3(d.x, -d.y, sqrt(1.0 - rr));
    float edge = smoothstep(1.0, 1.0 - 2.0 * px, sqrt(rr));
    c = mix(c, shell(n, px * 2.0), edge * uSphere.w);
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

export const FRAGMENT_300 = `#version 300 es\nprecision highp float;\n${BODY}${MAIN_300}`;

export const VERTEX_100 = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAGMENT_100 = `precision highp float;\n${BODY}${MAIN_100}`;
