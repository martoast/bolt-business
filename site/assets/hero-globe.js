/* ==========================================================================
   Bolt Group - home hero globe

   A live WebGL rebuild of the hero photo (01-Banner-scaled.jpg): the night
   side of the Earth over the Americas, the red atmosphere rim, the arcs of
   light out of the Midwest, and the star field. The photo stays as the CSS
   background underneath and doubles as the fallback: the canvas only fades
   in once its textures are on the GPU, and never appears at all without
   WebGL.

   Framing
   Everything is laid out in the photo's own 2560x1040 pixel frame, then
   scaled the way `background-size: cover` scales the photo, so the globe sits
   exactly where the picture had it at every viewport size. The camera is
   orthographic because the photo is: seven cities in it fit an orthographic
   globe to within ~4px.

   Light
   The photo's light does not follow the planet. Its atmosphere is a larger,
   lower circle than the Earth (an artist's composite), and the sunlit haze,
   the red rim and the blue fall-off all hang off that circle. So the light is
   a lookup table measured off the photo in that circle's polar coordinates
   (globe/sky.png: x = distance from the rim, sqrt-warped; y = angle round it),
   with the city lights, arcs and stars filtered out - those are all live
   objects here. The planet reads the same table under its own texture, so its
   edge melts into the haze exactly as in the picture.

   Textures (assets/globe/) are NASA Black Marble 2016 / Blue Marble / cloud
   composites, cropped to 180W-0 and 90N-60S since nothing else is on screen:
     lights.jpg  city lights with the unlit land subtracted
     aux.jpg     R clouds, G land mask, B blurred lights (cheap bloom)
     (the -sm versions are what phones download)
     sky.png     the light table described above
   ========================================================================== */
import * as THREE from './vendor/three.module.min.js';

const FRAME = { w: 2560, h: 1040 };
// fitted against the photo (see the header)
const EARTH = { x: 1849.2, y: 1301.8, r: 957.2 };
const ATMOS = { x: 1869.4, y: 1573.5, r: 1309.2 };
// geographic unit vector -> view space, rows of a rotation matrix
const ORIENT = [
    [0.13385, -0.13679, 0.98151],
    [-0.32852, 0.92830, 0.17418],
    [-0.93496, -0.34577, 0.07931],
];
// texture crop: longitude 180W..0, latitude 90N..60S
const CROP = { lon0: -180, lonSpan: 180, lat0: 90, latSpan: 150 };
// sky.png radial range, frame px inside (-) / outside (+) the rim
const SKY = { inner: 1400, outer: 1250, rows: 361 };

/* ---- the network --------------------------------------------------------
   Hubs are real places; the routes reproduce the arcs in the photo, which
   mostly fan out of one point in the Ohio valley.  [lat, lon, glow size]  */
const HUBS = {
    hub: [38.94, -83.16, 3.4],
    la: [34.05, -118.24, 0.9],   sea: [47.6, -122.3, 0.6],   van: [52.6, -127.2, 0.45],
    den: [39.74, -104.99, 0.55], dal: [32.78, -96.8, 0.6],   hou: [29.76, -95.37, 0.5],
    mex: [19.43, -99.13, 0.9],   gdl: [20.67, -103.35, 0.4], mia: [25.76, -80.19, 0.8],
    sju: [18.47, -66.1, 0.65],   ccs: [10.48, -66.9, 0.65],  bog: [4.71, -74.07, 0.75],
    pty: [8.98, -79.52, 0.65],   hav: [23.11, -82.37, 0.4],  yyz: [43.65, -79.38, 0.5],
    nyc: [40.71, -74.0, 0.6],    hfx: [44.65, -63.57, 0.55], bda: [32.3, -64.8, 0.5],
    atl1: [40.24, -57.28, 0.5],  atl2: [45.15, -39.52, 0.5], azo: [33.1, -34.55, 0.65],
    bel: [-1.45, -48.5, 0.65],   for: [-3.73, -38.52, 0.5],  lim: [-12.05, -77.04, 0.5],
    hnl: [21.31, -157.86, 0.5],  anc: [61.22, -149.9, 0.4],  yyc: [51.05, -114.07, 0.4],
    rek: [64.15, -21.94, 0.4],   lon: [51.5, -0.12, 0.4],    gth: [64.18, -51.72, 0.35],
    dkr: [14.72, -17.47, 0.4],   rec: [-8.05, -34.9, 0.4],
    nfl: [47.56, -52.71, 0.5],   lab: [53.3, -60.4, 0.4],
};
const ROUTES = [
    // out of the hub
    ['hub', 'la'], ['hub', 'sea'], ['hub', 'van'], ['hub', 'den'], ['hub', 'dal'],
    ['hub', 'hou'], ['hub', 'mex'], ['hub', 'mia'], ['hub', 'sju'], ['hub', 'ccs'],
    ['hub', 'bog'], ['hub', 'hfx'], ['hub', 'atl1'], ['hub', 'atl2'], ['hub', 'azo'],
    ['hub', 'nfl'], ['hub', 'anc'], ['hub', 'yyc'], ['hub', 'lab'],
    ['hub', 'bel'],
    // the rest of the web
    ['hnl', 'la'], ['la', 'mex'], ['gdl', 'la'],
    ['mex', 'pty'], ['mex', 'bog'], ['mex', 'mia'], ['dal', 'mex'],
    ['mia', 'sju'], ['mia', 'ccs'], ['mia', 'pty'], ['sju', 'azo'], ['sju', 'bel'],
    ['ccs', 'bel'], ['bog', 'bel'], ['bog', 'lim'], ['pty', 'lim'], ['bel', 'for'],
    ['for', 'rec'], ['hfx', 'atl1'], ['atl1', 'atl2'], ['atl2', 'azo'], ['azo', 'dkr'],
    ['bda', 'sju'], ['nfl', 'atl2'], ['lab', 'gth'], ['gth', 'rek'], ['rek', 'lon'],
];

const DEG = Math.PI / 180;
function geo(lat, lon, r = 1) {
    const la = lat * DEG, lo = lon * DEG;
    return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)).multiplyScalar(r);
}

/* ---- shaders ------------------------------------------------------------ */

// shared: look up the photo's light at a device pixel
const SKY_GLSL = /* glsl */`
uniform sampler2D tSky;
uniform vec3 uAtm;        // rim circle: centre (device px, y up), radius (device px)
uniform float uFramePx;   // device px per frame px
// t: frame px outside (+) / inside (-) the rim;  th: degrees round it, 90 = top
vec3 skyAt(vec2 frag, out float t, out float th) {
    vec2 v = frag - uAtm.xy;
    t = (length(v) - uAtm.z) / uFramePx;
    th = degrees(atan(v.y, v.x));
    float s = t < 0.0 ? -sqrt(clamp(-t / ${SKY.inner.toFixed(1)}, 0.0, 1.0))
                      :  sqrt(clamp( t / ${SKY.outer.toFixed(1)}, 0.0, 1.0));
    float row = clamp(th, 0.0, 180.0) / 0.5;
    return texture2D(tSky, vec2(s * 0.5 + 0.5, 1.0 - (row + 0.5) / ${SKY.rows.toFixed(1)})).rgb;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
}
// the living part of the haze: cloud streaks lying along the horizon,
// drifting slowly, strongest in the sunlit band
vec3 animateSky(vec3 c, float t, float th, float time) {
    float d = -t;
    float band = smoothstep(0.0, 10.0, d) * (1.0 - smoothstep(60.0, 190.0, d));
    float lum = dot(c, vec3(0.333));
    float n = fbm(vec2(th * 0.3 - time * 0.06, d * 0.12 + time * 0.02));
    c *= 1.0 + (n - 0.5) * 0.3 * band * smoothstep(0.08, 0.5, lum);
    // the rim breathes a little
    float rim = exp(-pow((t + 1.0) / 6.0, 2.0));
    c += c * rim * 0.22 * sin(time * 0.6 + th * 0.09);
    return c;
}
`;

const FULL_VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PLATE_FRAG = /* glsl */`
uniform float uTime;
${SKY_GLSL}
void main() {
    float t, th;
    vec3 c = skyAt(gl_FragCoord.xy, t, th);
    gl_FragColor = vec4(animateSky(c, t, th, uTime), 1.0);
}`;

const EARTH_VERT = /* glsl */`
varying vec3 vObj;
varying vec3 vN;
void main() {
    vObj = position;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const EARTH_FRAG = /* glsl */`
uniform sampler2D tLights;
uniform sampler2D tAux;
uniform float uTime;
uniform float uCloudShift;
varying vec3 vObj;
varying vec3 vN;
${SKY_GLSL}

vec2 geoUV(vec3 p, float shift) {
    p = normalize(p);
    float lat = degrees(asin(clamp(p.y, -1.0, 1.0)));
    float lon = degrees(atan(p.x, p.z)) + shift;
    return vec2((lon - ${CROP.lon0.toFixed(1)}) / ${CROP.lonSpan.toFixed(1)},
                1.0 - (${CROP.lat0.toFixed(1)} - lat) / ${CROP.latSpan.toFixed(1)});
}
float inCrop(vec2 uv) {
    vec2 e = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    return e.x * e.y;
}

void main() {
    float t, th;
    vec3 sky = skyAt(gl_FragCoord.xy, t, th);
    vec3 col = animateSky(sky, t, th, uTime);
    float lum = dot(sky, vec3(0.333));

    vec2 uv = geoUV(vObj, 0.0);
    float inside = inCrop(uv);
    vec3 aux = texture2D(tAux, uv).rgb * inside;
    float lights = texture2D(tLights, uv).r * inside;
    vec2 cuv = geoUV(vObj, uCloudShift);
    float clouds = texture2D(tAux, cuv).r * inCrop(cuv);
    float land = aux.g;

    // land a shade darker than sea where the light is on it
    col *= mix(1.03, 0.92, land * smoothstep(0.04, 0.3, lum));
    // clouds catch the light only where there is light to catch
    float lit = smoothstep(0.06, 0.55, lum);
    col = mix(col, max(col, vec3(0.93, 0.9, 0.92) * (0.3 + lum * 0.8)), clamp(clouds * clouds * lit * 0.3, 0.0, 0.25));
    col += vec3(0.05, 0.07, 0.1) * clouds * clouds * (1.0 - lit) * 0.3;

    // city lights: sodium orange, white-hot at the cores; lost in the haze
    float tw = 0.88 + 0.12 * sin(uTime * 2.3 + hash(floor(uv * 900.0)) * 6.283);
    float l = pow(lights, 1.05) * tw;
    vec3 lc = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.9, 0.66), smoothstep(0.45, 1.0, lights));
    float veil = 1.0 - smoothstep(0.25, 0.7, lum);
    col += (lc * l * 2.2 + vec3(1.0, 0.58, 0.2) * aux.b * 0.34) * veil * (1.0 - clouds * 0.35);

    // fade the planet's own edge: under it is the same light, so it vanishes
    float a = smoothstep(0.0, 0.3, clamp(normalize(vN).z, 0.0, 1.0));
    gl_FragColor = vec4(col, a);
}`;

const ARC_VERT = /* glsl */`
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
attribute float aSeed;
uniform vec2 uRes;
uniform float uWidth;
varying float vT;
varying float vSide;
varying float vSeed;
vec2 toPx(vec3 p) {
    vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    return c.xy / c.w * 0.5 * uRes;
}
void main() {
    vT = aT; vSide = aSide; vSeed = aSeed;
    vec4 cur = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 dir = normalize(toPx(aNext) - toPx(aPrev) + 1e-5);
    vec2 n = vec2(-dir.y, dir.x);
    cur.xy += n * aSide * uWidth * 0.5 / (0.5 * uRes) * cur.w;
    gl_Position = cur;
}`;

const ARC_FRAG = /* glsl */`
uniform float uTime;
uniform float uReveal;
varying float vT;
varying float vSide;
varying float vSeed;
void main() {
    // lines draw themselves out of the hubs on load, staggered
    float grow = clamp(uReveal * 1.6 - vSeed * 0.6, 0.0, 1.0);
    if (vT > grow) discard;
    // a thin hot core inside a soft glow (the ribbon is ~3x the core)
    float across = 1.0 - abs(vSide);
    float core = smoothstep(0.6, 0.92, across) * 0.9 + across * across * 0.16;
    // endpoints fade in from the surface
    float ends = smoothstep(0.0, 0.035, vT) * smoothstep(1.0, 0.965, vT);
    float base = 0.62 * ends;
    // a pulse of light running each route, out of the hub
    float speed = 0.14 + fract(vSeed * 7.13) * 0.1;
    float head = fract(uTime * speed + vSeed * 3.1);
    float d = head - vT;
    float tail = d >= 0.0 ? exp(-d * 7.0) : exp(d * 160.0);
    float pulse = tail * smoothstep(0.0, 0.06, head) * smoothstep(1.0, 0.92, head) * ends;
    // the growing tip glows while drawing in
    float tip = exp(-abs(grow - vT) * 60.0) * step(grow, 0.999);
    float a = core * (base + pulse * 1.4 + tip);
    vec3 col = mix(vec3(0.93, 0.95, 1.0), vec3(1.0, 0.93, 0.82), clamp(pulse, 0.0, 1.0));
    gl_FragColor = vec4(col * a, a);
}`;

const GLOW_VERT = /* glsl */`
attribute float aSize;
attribute float aSeed;
uniform float uScale;
uniform float uTime;
uniform float uReveal;
varying float vA;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // hide the hubs rolling round the back
    vec3 n = normalize(mat3(modelViewMatrix) * normalize(position));
    vA = smoothstep(0.02, 0.2, n.z) * smoothstep(aSeed * 0.5, aSeed * 0.5 + 0.3, uReveal);
    float beat = 0.82 + 0.18 * sin(uTime * 1.7 + aSeed * 40.0);
    gl_PointSize = aSize * uScale * beat;
    gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */`
varying float vA;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 55.0);
    float halo = exp(-r2 * 12.0) * 0.55 + exp(-r2 * 3.5) * 0.14;
    // four-point glint, like the lens flare on the photo's hubs
    float glint = (exp(-abs(p.x) * 45.0) * exp(-abs(p.y) * 4.0) + exp(-abs(p.y) * 45.0) * exp(-abs(p.x) * 4.0)) * 0.3;
    float a = (core * 1.2 + halo + glint) * vA * (1.0 - r2);
    vec3 col = mix(vec3(1.0, 0.74, 0.4), vec3(1.0, 0.98, 0.94), clamp(core * 1.5, 0.0, 1.0));
    gl_FragColor = vec4(col * a, a);
}`;

const STAR_VERT = /* glsl */`
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform float uDpr;
uniform vec2 uRes;
varying float vA;
varying vec3 vCol;
${SKY_GLSL}
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float t, th;
    skyAt((gl_Position.xy * 0.5 + 0.5) * uRes, t, th);
    float tw = 0.6 + 0.4 * sin(uTime * (0.5 + aSeed * 2.0) + aSeed * 90.0);
    // none in front of the planet, fewer down the dark left
    vA = (0.25 + 0.95 * aSeed * aSeed) * tw * smoothstep(8.0, 40.0, t);
    vCol = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.94, 0.88), fract(aSeed * 13.7));
    gl_PointSize = aSize * uDpr;
}`;

const STAR_FRAG = /* glsl */`
varying float vA;
varying vec3 vCol;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a = min(1.0, exp(-dot(p, p) * 3.0) * vA * 1.5);
    gl_FragColor = vec4(vCol * a, a);
}`;

/* ---- geometry ----------------------------------------------------------- */
function arcGeometry() {
    const pos = [], prev = [], next = [], side = [], ts = [], seeds = [], index = [];
    const SEG = 96;
    let base = 0;
    ROUTES.forEach(([a, b], i) => {
        const A = geo(HUBS[a][0], HUBS[a][1]), B = geo(HUBS[b][0], HUBS[b][1]);
        const ang = A.angleTo(B), so = Math.sin(ang);
        const lift = 0.02 + ang * 0.26;
        const pts = [];
        for (let s = 0; s <= SEG; s++) {
            const t = s / SEG;
            // along the great circle, raised into a loop
            const p = A.clone().multiplyScalar(Math.sin((1 - t) * ang) / so).addScaledVector(B, Math.sin(t * ang) / so);
            p.normalize().multiplyScalar(1.002 + lift * Math.sin(Math.PI * t));
            pts.push(p);
        }
        const seed = (i * 0.618034) % 1;
        pts.forEach((p, s) => {
            const pv = pts[Math.max(0, s - 1)], nx = pts[Math.min(SEG, s + 1)];
            for (const sd of [-1, 1]) {
                pos.push(p.x, p.y, p.z); prev.push(pv.x, pv.y, pv.z); next.push(nx.x, nx.y, nx.z);
                side.push(sd); ts.push(s / SEG); seeds.push(seed);
            }
            if (s < SEG) {
                const k = base + s * 2;
                index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
            }
        });
        base += (SEG + 1) * 2;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
    g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    g.setIndex(index);
    return g;
}

function glowGeometry() {
    const pos = [], size = [], seed = [];
    Object.values(HUBS).forEach(([lat, lon, w], i) => {
        const p = geo(lat, lon, 1.004);
        pos.push(p.x, p.y, p.z);
        size.push(w);
        seed.push((i * 0.381966) % 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return g;
}

// stars in frame pixels, thinning out toward the dark left like the photo
function starGeometry(rand) {
    const pos = [], size = [], seed = [];
    for (let i = 0; i < 30000; i++) {
        const x = rand() * FRAME.w, y = rand() * FRAME.h;
        if (rand() > 0.015 + 0.985 * Math.pow(x / FRAME.w, 2.8)) continue;
        pos.push(x, y, 0);
        const r = rand();
        size.push(r > 0.997 ? 3.6 : r > 0.975 ? 2.6 : r > 0.85 ? 1.9 : 1.4);
        seed.push(rand());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return g;
}

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function loadTexture(loader, url) {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

const easeOut = (x) => 1 - Math.pow(1 - x, 3);

/* ---- mount -------------------------------------------------------------- */
export async function mountHeroGlobe(host, opts = {}) {
    const base = opts.base || new URL('./', import.meta.url).href;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const still = !!opts.still;

    const canvas = document.createElement('canvas');
    canvas.className = 'bolt-globe';
    canvas.setAttribute('aria-hidden', 'true');

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    } catch (e) {
        return null; // no WebGL: the photo stays
    }
    renderer.setClearColor(0x030304, 1);

    const loader = new THREE.TextureLoader();
    const [tLights, tAux, tSky] = await Promise.all([
        loadTexture(loader, base + (small ? 'globe/lights-sm.jpg' : 'globe/lights.jpg')),
        loadTexture(loader, base + (small ? 'globe/aux-sm.jpg' : 'globe/aux.jpg')),
        loadTexture(loader, base + 'globe/sky.png'),
    ]);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const t of [tLights, tAux, tSky]) {
        t.colorSpace = THREE.NoColorSpace;   // shaders write display values as-is
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    tLights.anisotropy = tAux.anisotropy = aniso;
    tSky.generateMipmaps = false;
    tSky.minFilter = THREE.LinearFilter;

    // shared by every shader that reads the light table
    const skyUniforms = {
        tSky: { value: tSky },
        uAtm: { value: new THREE.Vector3() },
        uFramePx: { value: 1 },
    };

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -20000, 20000);
    camera.position.z = 10;

    const premultiplied = {
        transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    };

    // 1. the light plate: space, rim, haze - fills the canvas
    const plateMat = new THREE.ShaderMaterial({
        vertexShader: FULL_VERT, fragmentShader: PLATE_FRAG,
        uniforms: { ...skyUniforms, uTime: { value: 0 } },
        depthTest: false, depthWrite: false,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plateMat);
    plate.frustumCulled = false;
    plate.renderOrder = 0;
    scene.add(plate);

    // 2. stars, laid out in frame pixels
    const starField = new THREE.Group();
    const starMat = new THREE.ShaderMaterial({
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
        uniforms: { ...skyUniforms, uTime: { value: 0 }, uDpr: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } },
        depthTest: false, ...premultiplied,
    });
    const stars = new THREE.Points(starGeometry(mulberry32(7)), starMat);
    stars.frustumCulled = false;
    stars.renderOrder = 1;
    starField.add(stars);
    scene.add(starField);

    // 3. the planet: place (position + scale) -> tilt (pointer, view space)
    //    -> fit (the photo's orientation) -> spin (about the pole)
    const place = new THREE.Group();
    const tilt = new THREE.Group();
    const fit = new THREE.Group();
    const spin = new THREE.Group();
    fit.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
        ORIENT[0][0], ORIENT[0][1], ORIENT[0][2], 0,
        ORIENT[1][0], ORIENT[1][1], ORIENT[1][2], 0,
        ORIENT[2][0], ORIENT[2][1], ORIENT[2][2], 0,
        0, 0, 0, 1));
    place.add(tilt); tilt.add(fit); fit.add(spin);
    scene.add(place);

    const earthMat = new THREE.ShaderMaterial({
        vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
        uniforms: {
            ...skyUniforms,
            tLights: { value: tLights }, tAux: { value: tAux },
            uTime: { value: 0 }, uCloudShift: { value: 0 },
        },
        transparent: true, depthWrite: true, depthTest: true,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, small ? 96 : 160, small ? 72 : 120), earthMat);
    earth.renderOrder = 2;
    spin.add(earth);

    // 4. the arcs - ribbons a few pixels wide, hidden behind the planet
    const arcMat = new THREE.ShaderMaterial({
        vertexShader: ARC_VERT, fragmentShader: ARC_FRAG,
        uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 2 }, uReveal: { value: 0 } },
        depthTest: true, side: THREE.DoubleSide, ...premultiplied,
    });
    const arcs = new THREE.Mesh(arcGeometry(), arcMat);
    arcs.renderOrder = 3;
    arcs.frustumCulled = false;
    spin.add(arcs);
    // on phones the text stacks over the globe and the arcs run through it
    const phone = window.matchMedia('(max-width: 767px)');
    const syncArcs = () => { arcs.visible = !phone.matches; };
    syncArcs();
    phone.addEventListener?.('change', () => { syncArcs(); if (!running) render(); });

    // 5. hub glows
    const glowMat = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
        uniforms: { uScale: { value: 30 }, uTime: { value: 0 }, uReveal: { value: 0 } },
        depthTest: false, ...premultiplied,
    });
    const glows = new THREE.Points(glowGeometry(), glowMat);
    glows.renderOrder = 4;
    glows.frustumCulled = false;
    spin.add(glows);

    host.prepend(canvas);

    /* ---- layout: `background-size: cover`, in 3D -------------------------- */
    let S = 1, OX = 0, OY = 0, DPR = 1, Hc = 1;
    const focusX = opts.focusX ?? 0.5;
    function layout() {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        DPR = Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2);
        renderer.setPixelRatio(DPR);
        renderer.setSize(w, h, false);
        Hc = h;
        S = Math.max(w / FRAME.w, h / FRAME.h);
        OX = (w - FRAME.w * S) * focusX;
        OY = (h - FRAME.h * S) * 0.5;
        // camera in CSS pixels: x right, y up, origin at the top-left corner
        camera.left = 0; camera.right = w; camera.top = 0; camera.bottom = -h;
        camera.updateProjectionMatrix();

        place.position.set(OX + EARTH.x * S, -(OY + EARTH.y * S), 0);
        place.scale.setScalar(EARTH.r * S);
        skyUniforms.uAtm.value.set((OX + ATMOS.x * S) * DPR, (h - (OY + ATMOS.y * S)) * DPR, ATMOS.r * S * DPR);
        skyUniforms.uFramePx.value = S * DPR;

        starField.scale.set(S, -S, 1);
        starMat.uniforms.uDpr.value = DPR * Math.max(0.75, S * 1.1);
        starMat.uniforms.uRes.value.set(w * DPR, h * DPR);

        arcMat.uniforms.uRes.value.set(w * DPR, h * DPR);
        arcMat.uniforms.uWidth.value = Math.max(3.6, 6.4 * S) * DPR;
        glowMat.uniforms.uScale.value = 70 * S * DPR;
    }
    layout();
    const ro = new ResizeObserver(() => { layout(); if (!running) render(); });
    ro.observe(host);

    /* ---- motion ----------------------------------------------------------- */
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let px = 0, py = 0, tx = 0, ty = 0;
    if (!still) {
        window.addEventListener('pointermove', (e) => {
            tx = (e.clientX / window.innerWidth) * 2 - 1;
            ty = (e.clientY / window.innerHeight) * 2 - 1;
        }, { passive: true });
    }

    let visible = true, running = false, raf = 0, last = 0, clock = opts.time ?? 0;
    let reveal = still || reduce.matches ? 1 : 0;

    function render() {
        const t = clock;
        // a slow swing about the pole, and a hint of tilt toward the pointer
        spin.rotation.y = Math.sin(t * 0.05) * 0.05;
        tilt.rotation.x = py * 0.02;
        tilt.rotation.y = px * 0.03;
        starField.position.set(OX - px * 10 * S, -OY + py * 6 * S, 0);

        const rv = easeOut(reveal);
        earthMat.uniforms.uTime.value = t;
        earthMat.uniforms.uCloudShift.value = -t * 0.1;
        plateMat.uniforms.uTime.value = t;
        arcMat.uniforms.uTime.value = t;
        arcMat.uniforms.uReveal.value = rv;
        glowMat.uniforms.uTime.value = t;
        glowMat.uniforms.uReveal.value = rv;
        starMat.uniforms.uTime.value = t;
        renderer.render(scene, camera);
    }

    function frame(now) {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        if (!reduce.matches) clock += dt;
        reveal = Math.min(1, reveal + dt * 0.45);
        px += (tx - px) * Math.min(1, dt * 2.5);
        py += (ty - py) * Math.min(1, dt * 2.5);
        render();
        if (running) raf = requestAnimationFrame(frame);
    }

    function start() {
        if (running || still || reduce.matches) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !document.hidden) start(); else stop();
    }).observe(host);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else if (visible) start();
    });
    reduce.addEventListener?.('change', () => { if (reduce.matches) { stop(); reveal = 1; render(); } else start(); });

    render();
    // let a frame reach the screen before the fade, so it never flashes black
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('bolt-globe-ready')));
    start();

    return { render, renderer, setTime(v) { clock = v; render(); } };
}
