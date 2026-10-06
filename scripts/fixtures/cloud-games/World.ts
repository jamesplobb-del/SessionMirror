// Preview-only vendor copy: production never imports this fixture.
// @ts-ignore — the installed Three.js runtime is vendored without changing packages.
import * as THREE from './vendor/three.module.js';
// @ts-ignore — licensed Three.js addon, vendored only for this preview.
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export type WorldMode = 'hub' | 'staff' | 'balance' | 'learn';
export type WorldController = {
  setMode(mode: WorldMode): void; setProgress(progress: number): void; hop(): void;
  setTilt(cents: number): void; setPaused(paused: boolean): void; reset(): void; dispose(): void;
};

/** Procedural, lit geometry; the parent owns accessible controls and real notation. */
export function createWorld(host: HTMLElement, options: {
  mode: WorldMode; onSelect?: (mode: WorldMode) => void; onReady?: () => void;
}): WorldController {
  const noop = () => {};
  let disposed = false;
  let renderer: any;
  const fallback = document.createElement('div');
  fallback.className = 'world-fallback';
  fallback.textContent = 'The cloud world needs WebGL. The game controls and notation are still available.';
  Object.assign(fallback.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center',
    padding: '24px', textAlign: 'center', color: '#335967', fontSize: '14px', background: 'linear-gradient(#b9e2f5, #f7f0e6)' });
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); }
  catch {
    host.append(fallback); options.onReady?.();
    return { setMode: noop, setProgress: noop, hop: noop, setTilt: noop, setPaused: noop,
      reset: noop, dispose: () => { fallback.remove(); } };
  }
  const canvas = renderer.domElement as HTMLCanvasElement;
  canvas.setAttribute('aria-label', 'Interactive floating cloud islands');
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' });
  host.append(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .93;
  const scene = new THREE.Scene();
  // A procedural sky gradient keeps the horizon soft without a painted backdrop.
  const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
  const skyContext = sky.getContext('2d');
  let skyTexture: any;
  if (skyContext) {
    const gradient = skyContext.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#a5d6ef'); gradient.addColorStop(.55, '#c6e5f4'); gradient.addColorStop(1, '#e7f0ef');
    skyContext.fillStyle = gradient; skyContext.fillRect(0, 0, 2, 256);
    skyTexture = new THREE.CanvasTexture(sky); skyTexture.colorSpace = THREE.SRGBColorSpace; scene.background = skyTexture;
  } else scene.background = new THREE.Color('#b8dff3');
  scene.fog = new THREE.Fog('#d0e6ec', 25, 64);
  const camera = new THREE.OrthographicCamera(-7, 7, 7, -7, .1, 110);
  const root = new THREE.Group(); scene.add(root);
  const groups: Record<WorldMode, any> = { hub: new THREE.Group(), staff: new THREE.Group(), balance: new THREE.Group(), learn: new THREE.Group() };
  Object.values(groups).forEach(g => root.add(g));
  const colors = { cream: '#f5e7cd', edge: '#d8c5a5', teal: '#286f78', deepTeal: '#234f5d', rock: '#d4d1c1',
    gold: '#c99538', goldLight: '#edba51', blue: '#4caddc', lavender: '#a388cf', purple: '#8469b3', brown: '#946247', tan: '#d9ad7e', green: '#4f8064' };
  const mats: Record<string, any> = {};
  for (const [key, color] of Object.entries(colors)) {
    mats[key] = key.startsWith('gold')
      ? new THREE.MeshPhysicalMaterial({ color, roughness: .25, metalness: .75, clearcoat: .7, clearcoatRoughness: .2, envMapIntensity: 1.3 })
      : new THREE.MeshStandardMaterial({ color, roughness: key === 'teal' ? .45 : .73 });
  }
  mats.grout = new THREE.MeshStandardMaterial({ color: '#e7d6b9', roughness: .9 });
  mats.rock.flatShading = true;
  mats.greenLight = new THREE.MeshStandardMaterial({ color: '#608d65', roughness: .82 });
  mats.greenDark = new THREE.MeshStandardMaterial({ color: '#38634d', roughness: .86 });
  mats.roofLight = new THREE.MeshStandardMaterial({ color: '#c4b2e1', roughness: .57 });
  mats.lavender.roughness = .5;
  // Studio reflections provide coherent highlights on brass and glazed edges.
  const reflectionGenerator = new THREE.PMREMGenerator(renderer);
  const reflectionRoom = new RoomEnvironment();
  const reflectionTarget = reflectionGenerator.fromScene(reflectionRoom, .045);
  scene.environment = reflectionTarget.texture; scene.environmentIntensity = .4;
  reflectionRoom.dispose(); reflectionGenerator.dispose();
  // Feathered, procedural atmosphere. Clouds sit at real world depths, but
  // their silhouettes stay soft instead of looking like piles of lit rocks.
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = 128; cloudCanvas.height = 128;
  const cloudContext = cloudCanvas.getContext('2d'); let cloudTexture: any;
  if (cloudContext) {
    const mist = cloudContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    mist.addColorStop(0, 'rgba(255,255,255,.95)'); mist.addColorStop(.38, 'rgba(255,255,255,.8)');
    mist.addColorStop(.75, 'rgba(255,255,255,.28)'); mist.addColorStop(1, 'rgba(255,255,255,0)');
    cloudContext.fillStyle = mist; cloudContext.fillRect(0, 0, 128, 128);
    cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  }
  mats.cloud = new THREE.SpriteMaterial({ map: cloudTexture, color: '#fffaf3', transparent: true, opacity: .72, depthWrite: false, toneMapped: false });
  mats.black = new THREE.MeshStandardMaterial({ color: '#342c2c', roughness: .8 });
  mats.white = new THREE.MeshBasicMaterial({ color: '#fff8ee' });
  const contactCanvas = document.createElement('canvas'); contactCanvas.width = 128; contactCanvas.height = 128;
  const contactContext = contactCanvas.getContext('2d'); let contactTexture: any;
  if (contactContext) {
    const shade = contactContext.createRadialGradient(64, 64, 4, 64, 64, 64);
    shade.addColorStop(0, 'rgba(255,255,255,.9)'); shade.addColorStop(.35, 'rgba(255,255,255,.5)'); shade.addColorStop(1, 'rgba(255,255,255,0)');
    contactContext.fillStyle = shade; contactContext.fillRect(0, 0, 128, 128); contactTexture = new THREE.CanvasTexture(contactCanvas);
  }
  mats.shadow = new THREE.MeshBasicMaterial({ color: '#4b554e', map: contactTexture, transparent: true, opacity: .35, depthWrite: false });
  scene.add(new THREE.HemisphereLight('#eaf8ff', '#b6ada0', .7));
  const sun = new THREE.DirectionalLight('#fff0d5', 2.65); sun.position.set(-9, 14, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .025; scene.add(sun);
  const fill = new THREE.DirectionalLight('#c7e9ff', .55); fill.position.set(5, 7, -8); scene.add(fill);
  const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
  function mesh(geometry: any, material: any, parent: any, position = [0, 0, 0]) {
    const obj = new THREE.Mesh(geometry, material); obj.position.set(...position); obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
  }
  function ellipsoid(parent: any, material: any, pos: number[], scale: number[]) {
    const obj = mesh(sphereGeo, material, parent, pos); obj.scale.set(...scale); return obj;
  }
  function cylinder(parent: any, material: any, radius: number, height: number, pos: number[], topRadius = radius, segments = 32) {
    return mesh(new THREE.CylinderGeometry(topRadius, radius, height, segments), material, parent, pos);
  }
  function bar(parent: any, a: number[], b: number[], radius: number, material = mats.gold) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const line = mesh(new THREE.CylinderGeometry(radius, radius, av.distanceTo(bv), 12), material, parent);
    line.position.copy(av.clone().add(bv).multiplyScalar(.5));
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bv.sub(av).normalize()); return line;
  }
  function ring(parent: any, radius: number, y: number, material = mats.goldLight, thickness = .025) {
    const obj = mesh(new THREE.TorusGeometry(radius, thickness, 10, 72), material, parent, [0, y, 0]); obj.rotation.x = -Math.PI / 2; return obj;
  }
  function lathe(parent: any, material: any, profile: number[][], position = [0, 0, 0], segments = 64) {
    return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), material, parent, position);
  }
  function disc(parent: any, radius: number, height: number, y: number, material: any) {
    const bevel = Math.min(.06, height * .26);
    return lathe(parent, material, [[0, -height / 2], [radius - bevel, -height / 2],
      [radius - bevel * .24, -height / 2 + bevel * .24], [radius, -height / 2 + bevel],
      [radius, height / 2 - bevel], [radius - bevel * .24, height / 2 - bevel * .24],
      [radius - bevel, height / 2], [0, height / 2]], [0, y, 0]);
  }
  function contact(parent: any, x: number, z: number, radius: number, y = .075) {
    const a = mesh(new THREE.CircleGeometry(radius, 48), mats.shadow, parent, [x, y, z]);
    a.rotation.x = -Math.PI / 2; a.castShadow = false; a.renderOrder = 1; return a;
  }
  function post(parent: any, x: number, z: number, height = .56, base = .075) {
    const g = new THREE.Group(); g.position.set(x, base, z); parent.add(g);
    lathe(g, mats.gold, [[0, 0], [.075, 0], [.094, .02], [.094, .048], [.062, .07], [.045, .1],
      [.038, height - .09], [.057, height - .07], [.057, height - .03], [.043, height], [0, height]], [0, 0, 0], 32);
    ellipsoid(g, mats.goldLight, [0, height + .047, 0], [.081, .081, .081]);
    contact(parent, x, z, .095, base + .004); return g;
  }
  function curvedRail(parent: any, a: number[], b: number[], sag = .09) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const points = Array.from({ length: 12 }, (_, i) => {
      const t = i / 11; return av.clone().lerp(bv, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0));
    });
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, .024, 8, false), mats.gold, parent);
  }
  function island(parent: any, x: number, z: number, radius: number, withRail = true) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    // Soft ceramic bevels, an inset ivory deck and a sculpted petrol blue edge.
    disc(g, radius, .55, -.35, mats.teal);
    disc(g, radius * .987, .09, -.055, mats.edge);
    disc(g, radius * .982, .12, .004, mats.cream);
    ring(g, radius * .944, .065, mats.goldLight, .023);
    ring(g, radius * .965, -.104, mats.gold, .012);
    ring(g, radius * .937, -.615, mats.deepTeal, .026);
    const stoneHeight = radius * .91;
    const rock = mesh(new THREE.CylinderGeometry(radius * .86, radius * .31, stoneHeight, 10, 2), mats.rock, g, [0, -.64 - stoneHeight / 2, 0]);
    rock.rotation.y = .14;
    ring(g, radius * .853, -.658, mats.edge, .036);
    if (radius > 1.1) {
      // Fine paving joins add scale and craft without distracting from notation.
      for (const zLine of [-.72, 0, .72]) {
        if (Math.abs(zLine) > radius * .75) continue;
        const edge = Math.sqrt(Math.pow(radius * .9, 2) - zLine * zLine);
        bar(g, [-edge, .066, zLine], [edge, .066, zLine], .006, mats.grout);
      }
      for (const xLine of [-.72, .72]) {
        const edge = Math.sqrt(Math.pow(radius * .9, 2) - xLine * xLine);
        bar(g, [xLine, .066, -edge], [xLine, .066, edge], .006, mats.grout);
      }
    }
    if (withRail) {
      const angles = [1.06, 1.23, 1.42, 1.58, 1.77, 1.94].map(a => a * Math.PI);
      const positions = angles.map(a => [Math.cos(a) * radius * .86, .635, Math.sin(a) * radius * .86]);
      positions.forEach(([px, , pz]) => post(g, px, pz));
      for (let i = 0; i < positions.length - 1; i++) curvedRail(g, positions[i], positions[i + 1], .075);
    }
    return g;
  }
  function plant(parent: any, x: number, z: number, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, .077, z); g.scale.setScalar(scale); parent.add(g);
    contact(g, 0, 0, .29, .003);
    lathe(g, mats.cream, [[0, 0], [.15, 0], [.23, .04], [.275, .17], [.285, .3], [.27, .34], [.235, .335], [.23, .29], [0, .29]], [0, 0, 0], 40);
    ring(g, .271, .315, mats.goldLight, .019);
    cylinder(g, mats.greenDark, .225, .013, [0, .302, 0]);
    // Rounded, layered topiary replaces the sharp primitive foliage.
    ellipsoid(g, mats.greenDark, [0, .6, 0], [.25, .33, .25]);
    ellipsoid(g, mats.green, [0, .76, -.005], [.25, .33, .24]);
    ellipsoid(g, mats.greenLight, [-.035, .96, -.02], [.15, .23, .145]);
    for (let i = 0; i < 15; i++) {
      const a = i * 2.399, h = .44 + i % 5 * .105, r = .2 - Math.max(0, h - .78) * .45;
      const leaf = ellipsoid(g, i % 3 ? mats.green : mats.greenLight,
        [Math.cos(a) * r, h, Math.sin(a) * r], [.092, .11, .07]);
      leaf.rotation.z = Math.cos(a) * .45; leaf.rotation.x = Math.sin(a) * .45;
    }
    return g;
  }
  function flag(parent: any, x: number, z: number, color = mats.goldLight, size = 1) {
    const g = new THREE.Group(); g.position.set(x, .08, z); g.scale.setScalar(size); parent.add(g);
    cylinder(g, mats.gold, .029, .85, [0, .425, 0]); ellipsoid(g, mats.goldLight, [0, .87, 0], [.047, .047, .047]);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(.38, -.045); shape.lineTo(.38, -.3); shape.lineTo(0, -.255);
    const cloth = mesh(new THREE.ShapeGeometry(shape), color, g, [0, .79, 0]); cloth.material = color.clone(); cloth.material.side = THREE.DoubleSide; return g;
  }
  const characters: any[] = [];
  let ottoAspect = .8, ottoHeight = 1.8, ottoAnchorX = .54, ottoAnchorY = .068;
  const ottoTexture = new THREE.TextureLoader().load(new URL('./assets/otto-illustrated.png', import.meta.url).href, (texture: any) => {
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace;
    ottoAspect = texture.image.width / texture.image.height;
    // Anchor to the opaque artwork, so corrected/cropped assets keep their feet
    // on the deck and retain the same apparent size.
    try {
      const image = texture.image, measure = document.createElement('canvas');
      measure.width = image.width; measure.height = image.height;
      const ctx = measure.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(image, 0, 0); const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        let left = image.width, right = 0, top = image.height, bottom = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          if (pixels[(y * image.width + x) * 4 + 3] < 24) continue;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        if (bottom > top) {
          ottoAnchorX = (left + right) / (2 * image.width); ottoAnchorY = (image.height - 1 - bottom) / image.height;
          ottoHeight = 1.56 * image.height / (bottom - top + 1);
        }
      }
    } catch { /* The known local asset dimensions provide a stable fallback. */ }
    characters.forEach(g => { g.userData.sprite.scale.set(ottoHeight * ottoAspect, ottoHeight, 1); g.userData.sprite.center.set(ottoAnchorX, ottoAnchorY); g.userData.sprite.material.opacity = 1; });
    wake();
  });
  ottoTexture.colorSpace = THREE.SRGBColorSpace;
  function otter(parent: any, scale = .82) {
    const g = new THREE.Group(); parent.add(g); g.scale.setScalar(scale);
    const shadow = contact(g, 0, .04, .3, .013); shadow.scale.set(1.16, .76, 1);
    const body = new THREE.Group(); g.add(body);
    const material = new THREE.SpriteMaterial({ map: ottoTexture, transparent: true, opacity: 0, alphaTest: .035, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material); sprite.center.set(ottoAnchorX, ottoAnchorY); sprite.scale.set(ottoHeight * ottoAspect, ottoHeight, 1); body.add(sprite);
    g.userData.body = body; g.userData.shadow = shadow; g.userData.sprite = sprite; characters.push(g); return g;
  }
  function roundedBox(parent: any, w: number, h: number, depth: number, radius: number, material: any, pos: number[]) {
    const x = -w / 2, y = -h / 2, shape = new THREE.Shape();
    shape.moveTo(x + radius, y); shape.lineTo(x + w - radius, y); shape.quadraticCurveTo(x + w, y, x + w, y + radius);
    shape.lineTo(x + w, y + h - radius); shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    shape.lineTo(x + radius, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - radius);
    shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, bevelSize: .012, bevelThickness: .012, curveSegments: 8 });
    geometry.translate(0, 0, -depth / 2);
    const obj = mesh(geometry, material, parent, pos);
    return obj;
  }
  function pavilion(parent: any) {
    const g = new THREE.Group(); parent.add(g);
    disc(g, 1.025, .045, .084, mats.lavender); ring(g, 1.01, .115, mats.goldLight, .015); ring(g, .83, .113, mats.roofLight, .014);
    for (const x of [-1.05, 1.05]) for (const z of [-.55, .55]) {
      contact(g, x, z, .14);
      lathe(g, mats.cream, [[0, .11], [.12, .11], [.12, .17], [.093, .2], [.075, .26], [.071, 1.66], [.092, 1.72], [.105, 1.79], [0, 1.79]], [x, 0, z], 40);
      cylinder(g, mats.gold, .085, .08, [x, .36, z]); cylinder(g, mats.gold, .085, .06, [x, 1.38, z]);
      disc(g, .12, .055, 1.82, mats.goldLight).position.set(x, 1.82, z);
      ellipsoid(g, mats.goldLight, [x, 1.89, z], [.095, .095, .095]);
    }
    function roofProfile(lift = 0, thin = false) {
      const shape = new THREE.Shape(); shape.moveTo(-1.23, 1.81 + lift); shape.quadraticCurveTo(0, 3.07 + lift, 1.23, 1.81 + lift);
      shape.lineTo(1.23, 1.81 + lift - (thin ? .022 : .145));
      shape.quadraticCurveTo(0, 3.07 + lift - (thin ? .022 : .27), -1.23, 1.81 + lift - (thin ? .022 : .145)); shape.closePath(); return shape;
    }
    const roofShape = roofProfile();
    mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 1.5, bevelEnabled: true, bevelSegments: 5, bevelSize: .035, bevelThickness: .035, curveSegments: 36 }), mats.lavender, g, [0, 0, -.76]);
    for (const z of [-.63, -.24, .15, .54]) mesh(new THREE.ExtrudeGeometry(roofProfile(.07, true), { depth: .165, bevelEnabled: true, bevelSegments: 2, bevelSize: .006, bevelThickness: .006, curveSegments: 36 }), mats.roofLight, g, [0, 0, z]);
    const edge = mesh(new THREE.ShapeGeometry(roofShape, 36), mats.cream, g, [0, 0, .782]); edge.material = mats.cream.clone(); edge.material.side = THREE.DoubleSide;
    const frontCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.23, 1.81, .797), new THREE.Vector3(0, 3.07, .797), new THREE.Vector3(1.23, 1.81, .797));
    mesh(new THREE.TubeGeometry(frontCurve, 48, .018, 8, false), mats.goldLight, g);
    // A tailored banner and a little open music book make the pavilion musical.
    const bannerShape = new THREE.Shape(); bannerShape.moveTo(-.19, 0); bannerShape.lineTo(.19, 0); bannerShape.lineTo(.19, -.68); bannerShape.lineTo(0, -.59); bannerShape.lineTo(-.19, -.68); bannerShape.closePath();
    const banner = mesh(new THREE.ShapeGeometry(bannerShape), mats.purple, g, [.56, 1.86, -.7]); banner.material = mats.purple.clone(); banner.material.side = THREE.DoubleSide;
    bar(g, [-.47, .15, .06], [-.47, .97, .06], .025, mats.deepTeal);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; bar(g, [-.47, .14, .06], [-.47 + Math.cos(a) * .24, .1, .06 + Math.sin(a) * .24], .022, mats.deepTeal); }
    const board = roundedBox(g, .6, .44, .045, .025, mats.deepTeal, [-.47, 1.065, .09]); board.rotation.x = -.19;
    for (const side of [-1, 1]) {
      const page = roundedBox(g, .252, .351, .018, .012, mats.cream, [-.47 + side * .13, 1.067, .13]); page.rotation.y = side * -.13; page.rotation.x = -.19;
      for (let i = 0; i < 4; i++) bar(g, [-.47 + side * .13 - .09, 1.173 - i * .061, .18], [-.47 + side * .13 + .09, 1.173 - i * .061, .18], .0035, mats.grout);
    }
    plant(g, -1.2, .86, .82); plant(g, 1.2, .84, .82); return g;
  }
  const home = island(groups.hub, 0, 1.65, 2.05); ring(home, 1.05, .087, mats.goldLight, .024);
  plant(home, -1.25, .6, .8); plant(home, 1.25, .6, .8);
  const hubOtter = otter(home, .94); hubOtter.position.set(0, .09, .13);
  const staffHub = island(groups.hub, -3.85, -1.15, 1.62);
  const balanceHub = island(groups.hub, .05, -4.0, 1.68); balanceHub.position.y = .65;
  const learnHub = island(groups.hub, 3.9, -1.1, 1.6, false); learnHub.position.y = .25;
  const stations = [staffHub, balanceHub, learnHub];
  const stationModes: WorldMode[] = ['staff', 'balance', 'learn'];
  for (let i = 0; i < 4; i++) {
    const x = -.84 + i * .53, z = i % 2 ? -.23 : .23;
    const step = new THREE.Group(); step.position.set(x, 0, z); staffHub.add(step); disc(step, .25, .25, .21, mats.cream); disc(step, .37, .16, .415, mats.blue); ring(step, .345, .496, mats.goldLight, .012);
  }
  flag(staffHub, -1.04, -.48, mats.goldLight, .8); flag(staffHub, 1.03, -.45, mats.goldLight, .8);
  ring(balanceHub, 1.04, .075, mats.goldLight, .025); disc(balanceHub, .33, .085, .16, mats.gold); lathe(balanceHub, mats.gold, [[0, .2], [.19, .2], [.18, .29], [.13, .36], [.105, .71], [.16, .8], [0, .8]]);
  const beam = mesh(new THREE.CylinderGeometry(.095, .095, 2.35, 24), mats.gold, balanceHub, [0, .8, 0]); beam.rotation.z = Math.PI / 2; beam.rotation.x = .08; ellipsoid(balanceHub, mats.goldLight, [-1.14, .8, 0], [.12, .12, .12]); ellipsoid(balanceHub, mats.goldLight, [1.14, .8, 0], [.12, .12, .12]); ellipsoid(balanceHub, mats.goldLight, [0, .8, .14], [.14, .14, .054]);
  flag(balanceHub, -1.13, -.63, mats.cream, .8); flag(balanceHub, 1.13, -.63, mats.cream, .8);
  pavilion(learnHub).scale.setScalar(.88);
  function bridge(a: number[], b: number[]) {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const g = new THREE.Group(); g.position.set((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2);
    g.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]); groups.hub.add(g);
    const under = roundedBox(g, .89, .28, length, .04, mats.teal, [0, (a[1] + b[1]) / 2 - .15, 0]);
    under.rotation.x = -Math.atan2(b[1] - a[1], length);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, h = a[1] + (b[1] - a[1]) * t;
      roundedBox(g, .82, .105, length / n + .012, .016, mats.cream, [0, h + .019, -length / 2 + length * t]);
    }
    for (const side of [-1, 1]) {
      const start = [side * .4, a[1] + .075, -length / 2], end = [side * .4, b[1] + .075, length / 2];
      post(g, start[0], start[2], .55, start[1]); post(g, end[0], end[2], .55, end[1]);
      cylinder(g, mats.teal, .09, .17, [start[0], start[1] + .06, start[2]]); cylinder(g, mats.teal, .09, .17, [end[0], end[1] + .06, end[2]]);
      curvedRail(g, [start[0], start[1] + .55, start[2]], [end[0], end[1] + .55, end[2]], .055);
    }
  }
  bridge([-1.61, 0, .3], [-2.62, 0, -.28]); bridge([1.61, 0, .3], [2.66, .25, -.25]); bridge([.04, 0, -.36], [.04, .65, -2.36]);
  stations.forEach((g, i) => g.traverse((o: any) => { if (o.isMesh) o.userData.station = stationModes[i]; }));

  // All route platforms stay level: pitch belongs in the large notation panel.
  const staffPlatforms: any[] = [];
  for (let i = 0; i < 6; i++) {
    const p = island(groups.staff, -4.25 + i * 1.7, 0, .63, false);
    p.userData.stepCap = disc(p, .555, .12, .141, i === 0 ? mats.goldLight : mats.blue); ring(p, .535, .202, mats.goldLight, .012);
    if (i === 0 || i === 5) flag(p, .33, -.33, i === 5 ? mats.cream : mats.goldLight, .7);
    staffPlatforms.push(p);
  }
  const staffOtter = otter(groups.staff, 1.32); staffOtter.position.set(-4.25, .21, 0); staffOtter.rotation.y = .65;
  plant(staffPlatforms[5], -.25, -.29, .55);
  const balanceLeft = island(groups.balance, -3.1, 0, 1.35), balanceRight = island(groups.balance, 3.1, 0, 1.35);
  plant(balanceLeft, -.68, -.45, .8); plant(balanceRight, .7, -.4, .8);
  flag(balanceLeft, -.76, .65, mats.cream, .95); flag(balanceRight, .78, .65, mats.cream, .95);
  for (const x of [-2.35, 2.35]) {
    cylinder(groups.balance, mats.teal, .12, .22, [x, .2, 0]); cylinder(groups.balance, mats.gold, .052, .7, [x, .58, 0]);
    ellipsoid(groups.balance, mats.goldLight, [x, .96, 0], [.085, .085, .085]);
  }
  bar(groups.balance, [-2.35, .68, 0], [2.35, .68, 0], .034);
  const balanceOtter = otter(groups.balance, 1.02); balanceOtter.position.set(-2.12, .71, 0); balanceOtter.rotation.y = .28; balanceOtter.userData.shadow.visible = false;
  ring(balanceRight, .74, .09, mats.goldLight, .025);
  const learnIsland = island(groups.learn, 0, 0, 2.1, false); pavilion(learnIsland).position.z = -.36;
  const learnOtter = otter(learnIsland, 1.05); learnOtter.position.set(.51, .09, .78); learnOtter.rotation.y = -.15;
  const caseBox = roundedBox(learnIsland, .64, .33, .25, .065, mats.deepTeal, [1.03, .26, .1]); caseBox.rotation.y = -.2;
  bar(learnIsland, [.86, .46, .1], [1.12, .46, .1], .025, mats.gold); ring(learnIsland, 1.53, .089, mats.goldLight, .019);

  // Soft procedural cloud layers, with parallax and very slow drift.
  const clouds = new THREE.Group(); scene.add(clouds);
  let seed = 37;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  function cloud(x: number, y: number, z: number, size: number) {
    const c = new THREE.Group(); clouds.add(c); c.position.set(x, y, z); c.scale.setScalar(size);
    const lobes = [
      [0, .04, 0, 1.12, .29, .61], [-.91, .06, .03, .46, .29, .43],
      [-.51, .22, -.07, .53, .38, .5], [0, .36, -.06, .56, .45, .51],
      [.53, .23, .03, .52, .36, .47], [.96, .06, -.02, .44, .27, .41],
      [-.24, .1, .4, .48, .26, .38], [.37, .1, .35, .46, .25, .38],
    ];
    lobes.forEach(([px, py, pz, sx, sy, sz]) => {
      const puff = new THREE.Sprite(mats.cloud); puff.position.set(px, py, pz); puff.scale.set(sx * 2.4, sy * 3.8, 1); c.add(puff);
    });
    c.rotation.y = (random() - .5) * .8; c.userData.phase = random() * Math.PI * 2; c.userData.baseX = x;
  }
  for (let i = 0; i < 22; i++) cloud((random() - .5) * 36, -3.0 - random() * 4, (random() - .5) * 33, .5 + random() * .85);
  cloud(-4.8, -2.2, 2.2, 1.1); cloud(4.9, -2.1, 2.5, .95);
  cloud(-.5, -3.0, -4.6, .85);
  for (const [x, z, r] of [[-10, -11, .9], [11, -13, .8], [-12, 9, .7]]) {
    const far = island(scene, x, z, r, false); far.position.y = -2.8; plant(far, 0, 0, .65);
  }
  let mode = options.mode, progress = 0, targetProgress = 0, tilt = 0, targetTilt = 0, hopStart = -10, time = 0;
  let userPaused = false, visible = true, contextLost = false, raf = 0, previousTime = 0, yaw = 0, elevation = .86;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)'); let reducedMotion = media.matches;
  let aspect = 1, cameraSpan = mode === 'hub' ? 11.9 : mode === 'learn' ? 7.3 : mode === 'staff' ? 6.35 : 9.8, goalSpan = cameraSpan;
  const cameraFocus = new THREE.Vector3(), goalFocus = new THREE.Vector3(), goalCamera = new THREE.Vector3();
  const modeFocus: Record<WorldMode, number[]> = { hub: [0, -.25, -1.0], staff: [0, .2, 0], balance: [0, .2, 0], learn: [0, .8, 0] };
  const widths: Record<WorldMode, number> = { hub: 11.9, staff: 6.35, balance: 9.8, learn: 7.3 };
  function goals() {
    goalFocus.set(...modeFocus[mode]); goalSpan = widths[mode];
    if (mode === 'hub') goalCamera.set(Math.sin(yaw) * 13, 12 + (elevation - .86) * 6, Math.cos(yaw) * 15 - 1);
    else if (mode === 'staff') {
      const focusX = Math.max(-2.5, Math.min(2.5, -4.25 + progress * 8.5 + 1.3));
      goalFocus.x = focusX; goalCamera.set(focusX + 1.2, 5.8, 10);
    }
    else if (mode === 'balance') goalCamera.set(1.2, 6.2, 11);
    else goalCamera.set(4.6, 5.2, 8.4);
  }
  function projection() {
    const landscapeHub = mode === 'hub' && aspect > 1.2;
    const height = Math.max(cameraSpan / aspect, mode === 'hub' ? (landscapeHub ? 10 : 8) : mode === 'learn' ? 4.5 : 4.8), width = height * aspect;
    // Learn keeps the familiar lesson card above the world on phones, and to
    // its left in landscape. Shift the composition into that available area.
    const landscapeLesson = mode === 'learn' && aspect > 1.2;
    const cx = landscapeLesson ? .74 : landscapeHub ? .64 : .5;
    const cy = mode === 'learn' && !landscapeLesson ? .77 : landscapeHub ? .4 : .5;
    camera.left = -width * cx; camera.right = width * (1 - cx);
    camera.top = height * cy; camera.bottom = -height * (1 - cy); camera.updateProjectionMatrix();
  }
  function render() {
    if (!disposed && !contextLost) {
      characters.forEach(g => { g.userData.sprite.material.rotation = g.userData.body.rotation.z; });
      renderer.render(scene, camera);
    }
  }
  function wake() { if (!raf && !disposed && visible && !document.hidden && !contextLost) raf = requestAnimationFrame(frame); }
  function update(delta: number) {
    if (mode === 'staff') goals();
    time += userPaused ? 0 : delta; const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 7);
    camera.position.lerp(goalCamera, blend); cameraFocus.lerp(goalFocus, blend); cameraSpan += (goalSpan - cameraSpan) * blend; camera.lookAt(cameraFocus); projection();
    if (!userPaused) {
      progress += (targetProgress - progress) * (1 - Math.exp(-delta * 7)); tilt += (targetTilt - tilt) * (1 - Math.exp(-delta * 8));
      staffOtter.position.x = -4.25 + progress * 8.5;
      staffPlatforms.forEach((p, i) => { p.userData.stepCap.material = i === Math.round(targetProgress * 5) ? mats.goldLight : mats.blue; });
      const hopPhase = Math.min(1, Math.max(0, (time - hopStart) / .48)), hopHeight = reducedMotion ? 0 : Math.sin(hopPhase * Math.PI) * .8;
      staffOtter.position.y = .21 + hopHeight; staffOtter.userData.body.rotation.z = 0;
      staffOtter.userData.shadow.scale.setScalar(1 - hopHeight * .28); staffOtter.userData.shadow.position.y = .015 - hopHeight / 1.32;
      balanceOtter.position.x = -2.12 + progress * 4.24; balanceOtter.userData.body.rotation.z = Math.max(-.04, Math.min(.04, -tilt * .001));
      if (!reducedMotion) {
        hubOtter.userData.body.position.y = Math.sin(time * 1.5) * .018; learnOtter.userData.body.position.y = Math.sin(time * 1.6) * .018;
        clouds.children.forEach((c: any) => { c.position.x = c.userData.baseX + Math.sin(time * .08 + c.userData.phase) * .16; });
      }
    }
  }
  function frame(stamp: number) {
    raf = 0; if (disposed || !visible || document.hidden || contextLost) { previousTime = 0; return; }
    const delta = previousTime ? Math.min((stamp - previousTime) / 1000, .06) : 1 / 60; previousTime = stamp; update(delta); render();
    const unsettled = camera.position.distanceTo(goalCamera) > .01 || Math.abs(cameraSpan - goalSpan) > .01 || (!userPaused && (Math.abs(progress - targetProgress) > .001 || Math.abs(tilt - targetTilt) > .01));
    if ((!userPaused && !reducedMotion) || unsettled) wake();
  }
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight); aspect = width / height;
    renderer.setSize(width, height, false); projection(); render(); wake();
  }
  function setMode(nextMode: WorldMode) {
    if (disposed || !groups[nextMode]) return; mode = nextMode;
    Object.entries(groups).forEach(([key, g]) => { g.visible = key === mode; }); yaw = 0; elevation = .86; goals();
    canvas.style.cursor = mode === 'hub' ? 'grab' : 'default'; wake();
  }
  setMode(mode); camera.position.copy(goalCamera); cameraFocus.copy(goalFocus);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? true; if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
  }, { threshold: .01 }); intersectionObserver.observe(host);
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; } else wake(); };
  const onMotion = () => { reducedMotion = media.matches; wake(); };
  document.addEventListener('visibilitychange', onVisibility); media.addEventListener('change', onMotion);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let drag: { id: number; x: number; y: number; prevX: number; prevY: number; moved: boolean } | null = null;
  function hit(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const picked = raycaster.intersectObjects(groups.hub.children, true).find((r: any) => r.object.userData.station);
    return picked?.object.userData.station as WorldMode | undefined;
  }
  const onDown = (e: PointerEvent) => {
    if (mode !== 'hub') return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, prevX: e.clientX, prevY: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent) => {
    if (mode !== 'hub') return; if (!drag) { canvas.style.cursor = hit(e) ? 'pointer' : 'grab'; return; }
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
    yaw = Math.max(-.72, Math.min(.72, yaw - (e.clientX - drag.prevX) * .005));
    elevation = Math.max(.65, Math.min(1.15, elevation + (e.clientY - drag.prevY) * .002));
    drag.prevX = e.clientX; drag.prevY = e.clientY; goals(); wake();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return; const moved = drag.moved; drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = 'grab';
    if (!moved && mode === 'hub') { const selected = hit(e); if (selected) options.onSelect?.(selected); }
  };
  const onCancel = () => { drag = null; canvas.style.cursor = mode === 'hub' ? 'grab' : 'default'; };
  const onLost = (e: Event) => { e.preventDefault(); contextLost = true; cancelAnimationFrame(raf); raf = 0; host.append(fallback); };
  const onRestored = () => { contextLost = false; fallback.remove(); resize(); wake(); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored);
  resize(); update(1 / 60); render(); wake(); options.onReady?.();
  return {
    setMode,
    setProgress(value) { if (!disposed) { targetProgress = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); wake(); } },
    hop() { if (!disposed && !userPaused) { hopStart = time; wake(); } },
    setTilt(cents) { if (!disposed) { targetTilt = Math.max(-42, Math.min(42, Number.isFinite(cents) ? cents : 0)); wake(); } },
    setPaused(paused) { userPaused = paused; previousTime = 0; wake(); },
    reset() {
      progress = 0; targetProgress = 0; tilt = 0; targetTilt = 0; hopStart = -10; yaw = 0;
      staffOtter.position.set(-4.25, .21, 0); staffOtter.userData.body.rotation.z = 0;
      staffOtter.userData.shadow.scale.setScalar(1); staffOtter.userData.shadow.position.y = .015;
      balanceOtter.position.x = -2.12; balanceOtter.userData.body.rotation.z = 0;
      goals(); update(1 / 60); render(); wake();
    },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); resizeObserver.disconnect(); intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility); media.removeEventListener('change', onMotion);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      const geometries = new Set<any>(), materials = new Set<any>();
      scene.traverse((o: any) => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => materials.add(m)); });
      Object.values(mats).forEach(m => materials.add(m)); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      skyTexture?.dispose(); reflectionTarget.dispose(); cloudTexture?.dispose(); contactTexture?.dispose(); ottoTexture?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); fallback.remove();
    },
  };
}
