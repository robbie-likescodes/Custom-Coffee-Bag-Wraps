// app.js — Coffee Bag Wrap Builder (mobile-first)
// Host on GitHub Pages. Requires:
// - three.js via importmap in index.html
// - JSZip via <script> tag (global window.JSZip)

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* =========================
   Mobile-first configuration
   ========================= */
const isSmallScreen = () => window.matchMedia('(max-width: 980px)').matches;
const DPR_CAP = isSmallScreen() ? 1.5 : 2; // keep performance snappy on phones

const CONFIG = {
  EMAIL: 'orders@yourdomain.com', // TODO: set your real email
  // Flat wrap (11" x 12" @ 300dpi) with panels (2.0 | 3.25 | 2.0 | 3.25 | 0.5)
  BASE_W: 3300,
  BASE_H: 3600,
  PANEL_X: [600, 1575, 2175, 3150],
  BLEED_PX: Math.round(0.125 * 300),
  BAG: { W: 3.25, H: 10.5, D: 2.0 }, // inches (ratios matter)
  LS_KEY: 'wrap-builder:v1'
};

/* =========
   Elements
   ========= */
const threeCanvas = document.getElementById('three');
const flatCanvas  = document.getElementById('flatCanvas');
const displayCtx  = flatCanvas.getContext('2d');

const toastEl = document.getElementById('toast');

const bgInput = document.getElementById('bgInput');
const bgColor = document.getElementById('bgColor');
const exampleBgBtn = document.getElementById('exampleBgBtn');
const clearBgBtn = document.getElementById('clearBgBtn');

const stickerInput = document.getElementById('stickerInput');
const stickerList  = document.getElementById('stickerList');
const sizeSlider   = document.getElementById('size');
const rotateSlider = document.getElementById('rotate');
const deleteStickerBtn = document.getElementById('deleteStickerBtn');
const clearAllBtn      = document.getElementById('clearAllBtn');
const dpiNote = document.getElementById('dpiNote');

const guidesToggle = document.getElementById('guidesToggle');
const paperTextureToggle = document.getElementById('paperTextureToggle');
const flatToggle   = document.getElementById('flatToggle');
const dpiSelect    = document.getElementById('dpiSelect');

const downloadPreviewBtn = document.getElementById('downloadPreviewBtn');
const downloadWrapBtn    = document.getElementById('downloadWrapBtn');
const downloadZipBtn     = document.getElementById('downloadZipBtn');
const mailtoLink  = document.getElementById('mailtoLink');
const mailtoLink2 = document.getElementById('mailtoLink2');

/* =========================
   State: wrap & stickers
   ========================= */
let WRAP_W = CONFIG.BASE_W;
let WRAP_H = CONFIG.BASE_H;

const wrapCanvas = document.createElement('canvas');
wrapCanvas.width = WRAP_W;
wrapCanvas.height = WRAP_H;
const wrapCtx = wrapCanvas.getContext('2d');

let stickers = []; // {id, img, src, w, h, u, v, s, r}
let activeStickerId = null;
let backgroundDataUrl = null; // snapshot of background for fast redraws

/* ================
   three.js setup
   ================ */
const renderer = new THREE.WebGLRenderer({
  canvas: threeCanvas,
  antialias: true,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
renderer.setSize(threeCanvas.clientWidth, threeCanvas.clientHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0d0e);

const camera = new THREE.PerspectiveCamera(
  35,
  threeCanvas.clientWidth / threeCanvas.clientHeight,
  0.1,
  200
);
camera.position.set(0, CONFIG.BAG.H * 0.5, CONFIG.BAG.H * 1.35);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.zoomSpeed = 0.75;
controls.rotateSpeed = isSmallScreen ? 0.6 : 0.9;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(2, 6, 8);
scene.add(key);

// Bag geometry matches physical proportions
const geom = new RoundedBoxGeometry(
  CONFIG.BAG.W,
  CONFIG.BAG.H,
  CONFIG.BAG.D,
  6,
  0.18
);

// Texture from wrapCanvas
const wrapTexture = new THREE.CanvasTexture(wrapCanvas);
wrapTexture.anisotropy = 8;
wrapTexture.wrapS = wrapTexture.wrapT = THREE.ClampToEdgeWrapping;

const mat = new THREE.MeshPhysicalMaterial({
  map: wrapTexture,
  roughness: 0.72,
  metalness: 0.0,
  clearcoat: 0.25,
  clearcoatRoughness: 0.6
});

const bag = new THREE.Mesh(geom, mat);
scene.add(bag);

// Simple floor to ground the bag
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(CONFIG.BAG.W * 4, 64),
  new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -CONFIG.BAG.H * 0.52;
scene.add(floor);

// Picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;
let wasOrbitEnabled = true;

/* ======================
   Background & guides
   ====================== */
function fillBackgroundColor(hex) {
  wrapCtx.save();
  wrapCtx.fillStyle = hex;
  wrapCtx.fillRect(0, 0, WRAP_W, WRAP_H);
  wrapCtx.restore();
  backgroundDataUrl = wrapCanvas.toDataURL('image/png');
}

async function drawBackgroundFromDataUrl(url) {
  const img = await loadImageURL(url);
  wrapCtx.clearRect(0, 0, WRAP_W, WRAP_H);
  wrapCtx.drawImage(img, 0, 0, WRAP_W, WRAP_H);
}

function drawGuides() {
  if (!guidesToggle.checked) return;
  wrapCtx.save();
  wrapCtx.strokeStyle = 'rgba(0,0,0,0.18)';
  wrapCtx.lineWidth = 2;
  CONFIG.PANEL_X.forEach(xx => {
    wrapCtx.beginPath();
    wrapCtx.moveTo(xx, 0);
    wrapCtx.lineTo(xx, WRAP_H);
    wrapCtx.stroke();
  });
  // Bleed & safe
  wrapCtx.strokeStyle = 'rgba(255,0,0,0.28)';
  wrapCtx.strokeRect(0.5, 0.5, WRAP_W - 1, WRAP_H - 1);
  const b = CONFIG.BLEED_PX;
  wrapCtx.strokeStyle = 'rgba(0,200,120,0.28)';
  wrapCtx.strokeRect(b + 0.5, b + 0.5, WRAP_W - 2 * b - 1, WRAP_H - 2 * b - 1);
  wrapCtx.restore();
}

/* ================
   Stickers drawing
   ================ */
function redrawAll() {
  if (backgroundDataUrl) {
    const img = new Image();
    img.onload = () => {
      wrapCtx.clearRect(0, 0, WRAP_W, WRAP_H);
      wrapCtx.drawImage(img, 0, 0, WRAP_W, WRAP_H);
      drawAllStickers();
    };
    img.src = backgroundDataUrl;
  } else {
    fillBackgroundColor(bgColor.value);
    drawAllStickers();
  }
}

function drawAllStickers() {
  stickers.forEach(s => drawStickerUV(s));
  drawGuides();
  wrapTexture.needsUpdate = true;
  refreshFlatDisplay();
  saveState();
}

function drawStickerUV(s) {
  const W = WRAP_W, H = WRAP_H;
  const desiredW = W * s.s;
  const scale = desiredW / s.w;
  const w = s.w * scale;
  const h = s.h * scale;
  const cx = s.u * W;
  const cy = (1.0 - s.v) * H;

  wrapCtx.save();
  wrapCtx.translate(cx, cy);
  wrapCtx.rotate((s.r * Math.PI) / 180);
  wrapCtx.drawImage(s.img, -w / 2, -h / 2, w, h);
  wrapCtx.restore();
}

/* ==========================
   Image helpers & utilities
   ========================== */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function loadImageURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
function dataURL(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

function getActive() {
  return stickers.find(s => s.id === activeStickerId) || null;
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 1600);
}
function downloadURL(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // Revoke object URLs later
  setTimeout(() => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, 5000);
}

/* ==================
   Local persistence
   ================== */
function saveState() {
  const data = {
    stickers: stickers.map(s => ({
      id: s.id,
      src: s.src,
      u: s.u,
      v: s.v,
      s: s.s,
      r: s.r
    })),
    bg: backgroundDataUrl,
    bgColor: bgColor.value,
    dpi: dpiSelect.value,
    guides: guidesToggle.checked,
    paper: paperTextureToggle.checked,
    flat: flatToggle.checked
  };
  try {
    localStorage.setItem(CONFIG.LS_KEY, JSON.stringify(data));
  } catch (_e) {
    // silent (Safari private mode)
  }
}

async function restoreState() {
  try {
    const raw = localStorage.getItem(CONFIG.LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.bgColor) bgColor.value = data.bgColor;
    if (data.dpi) dpiSelect.value = data.dpi;
    if (typeof data.guides === 'boolean') guidesToggle.checked = data.guides;
    if (typeof data.paper === 'boolean') paperTextureToggle.checked = data.paper;
    if (typeof data.flat === 'boolean') {
      flatToggle.checked = data.flat;
      flatCanvas.style.display = data.flat ? 'block' : 'none';
    }
    if (data.bg) {
      backgroundDataUrl = data.bg;
      await drawBackgroundFromDataUrl(data.bg);
    } else {
      fillBackgroundColor(bgColor.value);
    }
    if (Array.isArray(data.stickers)) {
      stickers = await Promise.all(
        data.stickers.map(s => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({
            ...s, img, w: img.naturalWidth, h: img.naturalHeight
          });
          img.onerror = reject;
          img.src = s.src;
        }))
      );
      activeStickerId = stickers[0]?.id ?? null;
      refreshStickerList();
      redrawAll();
    } else {
      redrawAll();
    }
  } catch (e) {
    console.warn('Restore failed', e);
    fillBackgroundColor(bgColor.value);
    redrawAll();
  }
}

/* ==============
   Mailto links
   ============== */
function buildMailto() {
  const subject = encodeURIComponent('Custom Coffee Bag Wrap Order');
  const body = encodeURIComponent(
`Hi team,

I used the Wrap Builder and attached:
- coffee-bag-preview.png (3D preview)
- coffee-bag-wrap.png (flat wrap)

Notes:
- Bag size: 12 oz
- Quantity:
- Special instructions:

Thanks!`);
  return `mailto:${CONFIG.EMAIL}?subject=${subject}&body=${body}`;
}
function refreshMailto() {
  const href = buildMailto();
  if (mailtoLink)  mailtoLink.href  = href;
  if (mailtoLink2) mailtoLink2.href = href;
}

/* ==========================
   Flat (2D) view rendering
   ========================== */
function refreshFlatDisplay() {
  if (!flatToggle.checked) return;
  displayCtx.clearRect(0, 0, flatCanvas.width, flatCanvas.height);
  const r = Math.min(flatCanvas.width / WRAP_W, flatCanvas.height / WRAP_H);
  const w = WRAP_W * r;
  const h = WRAP_H * r;
  const x = (flatCanvas.width - w) / 2;
  const y = (flatCanvas.height - h) / 2;
  displayCtx.fillStyle = '#ffffff';
  displayCtx.fillRect(0, 0, flatCanvas.width, flatCanvas.height);
  displayCtx.drawImage(wrapCanvas, x, y, w, h);
}

/* ===================
   DPI helper message
   =================== */
function updateDPINote(s) {
  const dpi = parseInt(dpiSelect.value, 10);
  const printedW_in = (s.s * WRAP_W) / dpi;
  const requiredPx = printedW_in * 300;
  const ok = s.w >= requiredPx * 0.9;
  dpiNote.textContent =
    `Active sticker: source ${s.w}×${s.h}px → prints ~${printedW_in.toFixed(2)}" wide @ ${dpi} DPI ${ok ? '✓' : '(low resolution ⚠)'}`;
}

/* =======================
   Controls: Background
   ======================= */
bgInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = await loadImageFile(f);

  // cover strategy
  const scale = Math.max(WRAP_W / img.naturalWidth, WRAP_H / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (WRAP_W - w) / 2;
  const y = (WRAP_H - h) / 2;

  wrapCtx.clearRect(0, 0, WRAP_W, WRAP_H);
  wrapCtx.drawImage(img, x, y, w, h);
  backgroundDataUrl = wrapCanvas.toDataURL('image/png');
  drawAllStickers();
  toast('Background set ✓');
});

bgColor.addEventListener('input', () => {
  backgroundDataUrl = null;
  fillBackgroundColor(bgColor.value);
  drawAllStickers();
});

exampleBgBtn.addEventListener('click', () => {
  // subtle neutral gradient with micro dots
  const g = wrapCtx.createLinearGradient(0, 0, WRAP_W, WRAP_H);
  g.addColorStop(0, '#f8fafb');
  g.addColorStop(1, '#e6ecef');
  wrapCtx.fillStyle = g;
  wrapCtx.fillRect(0, 0, WRAP_W, WRAP_H);

  wrapCtx.fillStyle = '#d5dadd';
  for (let y = 0; y < WRAP_H; y += 60) {
    for (let x = (y / 60) % 2 ? 30 : 0; x < WRAP_W; x += 60) {
      wrapCtx.beginPath();
      wrapCtx.arc(x, y, 2, 0, Math.PI * 2);
      wrapCtx.fill();
    }
  }
  backgroundDataUrl = wrapCanvas.toDataURL('image/png');
  drawAllStickers();
  toast('Example background loaded');
});

clearBgBtn.addEventListener('click', () => {
  backgroundDataUrl = null;
  fillBackgroundColor('#ffffff');
  drawAllStickers();
  toast('Background cleared');
});

/* ====================
   Controls: Stickers
   ==================== */
stickerInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = await loadImageFile(f);
  const id = crypto.randomUUID();
  const src = dataURL(img);
  const s = {
    id, img, src,
    w: img.naturalWidth, h: img.naturalHeight,
    u: 0.5, v: 0.5,
    s: parseFloat(sizeSlider.value),
    r: parseFloat(rotateSlider.value)
  };
  stickers.push(s);
  activeStickerId = id;
  refreshStickerList();
  drawAllStickers();
  updateDPINote(s);
});

sizeSlider.addEventListener('input', () => {
  const s = getActive(); if (!s) return;
  s.s = parseFloat(sizeSlider.value);
  drawAllStickers();
  updateDPINote(s);
});

rotateSlider.addEventListener('input', () => {
  const s = getActive(); if (!s) return;
  s.r = parseFloat(rotateSlider.value);
  drawAllStickers();
});

deleteStickerBtn.addEventListener('click', () => {
  const i = stickers.findIndex(x => x.id === activeStickerId);
  if (i >= 0) stickers.splice(i, 1);
  activeStickerId = stickers[0]?.id ?? null;
  refreshStickerList();
  drawAllStickers();
  dpiNote.textContent = '';
});

clearAllBtn.addEventListener('click', () => {
  stickers = [];
  activeStickerId = null;
  refreshStickerList();
  drawAllStickers();
  dpiNote.textContent = '';
});

/* ======================
   Sticker list (thumbs)
   ====================== */
function refreshStickerList() {
  stickerList.innerHTML = '';
  stickers.forEach(s => {
    const btn = document.createElement('button');
    btn.className = (s.id === activeStickerId) ? 'active' : '';
    const img = document.createElement('img');
    img.src = s.src;
    btn.appendChild(img);
    btn.onclick = () => {
      activeStickerId = s.id;
      sizeSlider.value = s.s;
      rotateSlider.value = s.r;
      updateDPINote(s);
      refreshStickerList();
    };
    stickerList.appendChild(btn);
  });
}

/* ==========================
   3D <-> Flat view toggling
   ========================== */
flatToggle.addEventListener('change', () => {
  flatCanvas.style.display = flatToggle.checked ? 'block' : 'none';
  refreshFlatDisplay();
});

/* ===========
   Downloads
   =========== */
downloadPreviewBtn.addEventListener('click', () => {
  const url = renderer.domElement.toDataURL('image/png');
  downloadURL(url, 'coffee-bag-preview.png');
  toast('3D preview downloaded ✓');
});

downloadWrapBtn.addEventListener('click', () => {
  const url = wrapCanvas.toDataURL('image/png');
  downloadURL(url, 'coffee-bag-wrap.png');
  toast('Flat wrap downloaded ✓');
});

downloadZipBtn.addEventListener('click', async () => {
  const JSZip = window.JSZip;
  if (!JSZip) {
    // Fallback: download both separately
    downloadPreviewBtn.click();
    setTimeout(() => downloadWrapBtn.click(), 350);
    toast('Downloaded preview & wrap ✓');
    return;
  }
  const zip = new JSZip();
  const preview = renderer.domElement.toDataURL('image/png').split(',')[1];
  const wrap = wrapCanvas.toDataURL('image/png').split(',')[1];
  zip.file('coffee-bag-preview.png', preview, { base64: true });
  zip.file('coffee-bag-wrap.png', wrap, { base64: true });
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  downloadURL(url, 'wrap-assets.zip');
  toast('ZIP downloaded ✓');
});

/* ======================
   Guides & Paper toggle
   ====================== */
let paperTex = null;
async function ensurePaperTexture() {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  const imgData = ctx.createImageData(512, 512);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = 235 + Math.random() * 20;
    imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = n;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 6);
  paperTex = tex;
  return tex;
}

paperTextureToggle.addEventListener('change', async () => {
  if (paperTextureToggle.checked) {
    const t = await ensurePaperTexture();
    mat.map = wrapTexture;
    mat.normalMap = t;
    mat.needsUpdate = true;
  } else {
    mat.normalMap = null;
    mat.needsUpdate = true;
  }
});

guidesToggle.addEventListener('change', () => {
  drawAllStickers();
});

/* ============================
   Drag on bag (mobile-friendly)
   ============================ */
function pickUVFromPointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
  const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
  if (clientX == null || clientY == null) return null;
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(bag, false)[0];
  if (!hit || !hit.uv) return null;
  return hit.uv;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  const s = getActive(); if (!s) return;
  const uv = pickUVFromPointer(e); if (!uv) return;
  s.u = uv.x; s.v = uv.y;
  drawAllStickers();
  isDragging = true;
  // Temporarily disable orbit to avoid conflict while dragging
  wasOrbitEnabled = controls.enabled;
  controls.enabled = false;
}, { passive: true });

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const s = getActive(); if (!s) return;
  const uv = pickUVFromPointer(e); if (!uv) return;
  s.u = uv.x; s.v = uv.y;
  drawAllStickers();
}, { passive: true });

window.addEventListener('pointerup', () => {
  isDragging = false;
  controls.enabled = wasOrbitEnabled;
}, { passive: true });

/* ======================
   Export DPI selection
   ====================== */
dpiSelect.addEventListener('change', () => {
  // We keep the canvas at 300dpi base for fidelity;
  // dpiSelect mainly informs DPI warnings and downstream print info.
  saveState();
  const s = getActive();
  if (s) updateDPINote(s);
});

/* ==========================
   Keyboard shortcuts (desk)
   ========================== */
window.addEventListener('keydown', (e) => {
  const s = getActive();
  if (e.key === 'Delete') { deleteStickerBtn.click(); }
  if (e.key.toLowerCase() === 'g') { guidesToggle.checked = !guidesToggle.checked; drawAllStickers(); }
  if (e.key.toLowerCase() === 'v') { flatToggle.checked = !flatToggle.checked; flatToggle.dispatchEvent(new Event('change')); }
  if (!s) return;
  if (e.key === '=' || e.key === '+') {
    s.s = Math.min(1.5, s.s + 0.02); sizeSlider.value = s.s; drawAllStickers(); updateDPINote(s);
  }
  if (e.key === '-' || e.key === '_') {
    s.s = Math.max(0.05, s.s - 0.02); sizeSlider.value = s.s; drawAllStickers(); updateDPINote(s);
  }
  if (e.key.toLowerCase() === 'r') {
    s.r = (s.r + 15) % 360; rotateSlider.value = s.r; drawAllStickers();
  }
});

/* ==========================
   Collapsible sections UI
   ========================== */
document.querySelectorAll('.section > header').forEach(h => {
  const box = h.parentElement;
  h.addEventListener('click', () => {
    const open = box.hasAttribute('data-open');
    // On mobile, keep only one open to reduce scrolling
    document.querySelectorAll('.section').forEach(s => s.removeAttribute('data-open'));
    if (!open) box.setAttribute('data-open', '');
  }, { passive: true });
});

/* ==========================
   Responsive resize handler
   ========================== */
function resizeRenderer() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  const w = threeCanvas.clientWidth;
  const h = threeCanvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // Scale the flat canvas with device pixel ratio for crispness
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  flatCanvas.width = Math.floor(w * dpr);
  flatCanvas.height = Math.floor(h * dpr);
  flatCanvas.style.width = w + 'px';
  flatCanvas.style.height = h + 'px';

  refreshFlatDisplay();
}
const onResize = debounce(() => {
  // Re-evaluate DPR cap on layout change
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen() ? 1.5 : 2));
  resizeRenderer();
}, 120);
window.addEventListener('resize', onResize, { passive: true });
window.addEventListener('orientationchange', onResize, { passive: true });

/* =============
   Init + loop
   ============= */
function initBackground() {
  if (!backgroundDataUrl) {
    fillBackgroundColor('#ffffff');
    drawAllStickers();
  }
}

function renderLoop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

await restoreState();
refreshMailto();
resizeRenderer();
initBackground();
renderLoop();

/* ==================
   Small utilities
   ================== */
function debounce(fn, wait = 100) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
