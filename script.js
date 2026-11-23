const IMAGE_SRC = 'img/test1.jpg';
const N = 3;            // pieces per side (3 x 3)

// ===== Reward paper: edit the text and picture here =====
const REWARD = {
  title: '🎉 HAPPY 2 MONTHS ANNIVERSARY !',
  // one or more pictures; with more than one the paper shows a swipeable slider
  images: [
    'img/pic1.jpg',
    'img/pic2.jpg',
    'img/pic3.jpg',
    'img/pic4.jpg',
    'img/pic5.jpg',
  ],
  message: 'คุณต่อจิ๊กซอว์สำเร็จแล้ว\nนี่คือรางวัลของคุณ\nขอให้มีความสุขมากๆ นะ',
};
let ASPECT = 4 / 3;     // replaced by the real image ratio once loaded
const stage = document.getElementById('stage');
const board = document.getElementById('board');
const hint = document.getElementById('hint');
const countEl = document.getElementById('count');
const rewardEl = document.getElementById('reward');
const letterWrap = document.getElementById('letterWrap');
const hitCtx = document.createElement('canvas').getContext('2d');

let image = null;       // the loaded <img>
let n = N;
let pieces = [];
let geo = null;
let zTop = 10;
let moves = 0;
let drag = null;

// ---------- Piece shape ----------
function edge(ctx, x0, y0, x1, y1, sign, s) {
  if (!sign) { ctx.lineTo(x1, y1); return; }
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = uy, ny = -ux; // outward normal
  const P = (t, k) => [x0 + ux * L * t + nx * k * s * sign, y0 + uy * L * t + ny * k * s * sign];
  ctx.lineTo(...P(0.36, 0));
  ctx.bezierCurveTo(...P(0.42, 0), ...P(0.44, 0.05), ...P(0.40, 0.11));
  ctx.bezierCurveTo(...P(0.35, 0.20), ...P(0.42, 0.26), ...P(0.50, 0.26));
  ctx.bezierCurveTo(...P(0.58, 0.26), ...P(0.65, 0.20), ...P(0.60, 0.11));
  ctx.bezierCurveTo(...P(0.56, 0.05), ...P(0.58, 0), ...P(0.64, 0));
  ctx.lineTo(x1, y1);
}

function piecePath(ctx, p, w, h) {
  const s = Math.min(w, h);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  edge(ctx, 0, 0, w, 0, p.e[0], s);
  edge(ctx, w, 0, w, h, p.e[1], s);
  edge(ctx, w, h, 0, h, p.e[2], s);
  edge(ctx, 0, h, 0, 0, p.e[3], s);
  ctx.closePath();
}

// ---------- Layout ----------
function computeGeo() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const small = Math.min(W, H) < 500;   // phone-sized screen
  const m = small ? 8 : 16;             // outer margin
  let bw, bh, bx, by, sc, mode;
  if (W >= H * 1.1) {
    // landscape: board left, pieces right
    mode = 'land';
    // the tray needs at least as much room as the board, so cap the board near half the width
    bw = Math.min(W * (small ? 0.47 : 0.55), (H - m * 2 - 6) * ASPECT);
    bh = bw / ASPECT;
    bx = small ? m : Math.max(m, (W * 0.6 - bw) / 2);
    by = (H - bh) / 2;
    sc = { x: bx + bw + m * 1.5, y: m, w: W - (bx + bw + m * 1.5) - m, h: H - m * 2 };
  } else {
    // portrait: board on top, pieces below
    mode = 'port';
    bw = Math.min(W - m * 2 - 6, H * 0.5 * ASPECT);
    bh = bw / ASPECT;
    bx = (W - bw) / 2;
    by = m;
    sc = { x: m, y: by + bh + m * 2, w: W - m * 2, h: H - (by + bh + m * 2) - m };
  }
  const pw = bw / n, ph = bh / n;
  return { W, H, bw, bh, bx, by, pw, ph, pad: Math.ceil(Math.min(pw, ph) * 0.3), sc, mode, small };
}

function drawPieces() {
  const dpr = window.devicePixelRatio || 1;
  const { bw, bh, pw, ph, pad } = geo;
  for (const p of pieces) {
    const cw = pw + pad * 2, ch = ph + pad * 2;
    p.cw = cw; p.ch = ch;
    p.canvas.width = Math.ceil(cw * dpr);
    p.canvas.height = Math.ceil(ch * dpr);
    p.canvas.style.width = cw + 'px';
    p.canvas.style.height = ch + 'px';
    const ctx = p.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
    piecePath(ctx, p, pw, ph);
    ctx.save();
    ctx.clip();
    ctx.drawImage(image, -p.c * pw, -p.r * ph, bw, bh);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.stroke();
  }
}

function placeEl(p) {
  if (p.placed) {
    p.x = geo.bx + p.c * geo.pw;
    p.y = geo.by + p.r * geo.ph;
  }
  p.canvas.style.left = (p.x - geo.pad) + 'px';
  p.canvas.style.top = (p.y - geo.pad) + 'px';
  p.canvas.style.zIndex = p.placed ? 1 : p.z;
}

function applyLayout() {
  const old = geo;
  geo = computeGeo();
  board.style.left = (geo.bx - 3) + 'px';
  board.style.top = (geo.by - 3) + 'px';
  board.style.width = geo.bw + 'px';
  board.style.height = geo.bh + 'px';
  const dpr = window.devicePixelRatio || 1;
  hint.width = Math.round(geo.bw * dpr);
  hint.height = Math.round(geo.bh * dpr);
  hint.getContext('2d').drawImage(image, 0, 0, hint.width, hint.height);
  if (old && old.W > 0 && old.H > 0 && old.mode === geo.mode) {
    // keep loose pieces at the same relative spot after a resize
    for (const p of pieces) {
      if (p.placed) continue;
      p.x = clamp(p.x / old.W * geo.W, 0, Math.max(0, geo.W - geo.pw));
      p.y = clamp(p.y / old.H * geo.H, 0, Math.max(0, geo.H - geo.ph));
    }
  } else {
    scatter();
  }
  drawPieces();
  pieces.forEach(placeEl);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// lay loose pieces out in a loose grid over the tray (less piling up on small screens)
function scatter() {
  const { sc, pw, ph, W, H, pad } = geo;
  const loose = pieces.filter(p => !p.placed).sort(() => Math.random() - 0.5);
  if (!loose.length) return;
  // pick the column count that gives each piece the most breathing room
  let cols = 1, best = -1;
  for (let c = 1; c <= loose.length; c++) {
    const r = Math.ceil(loose.length / c);
    const fit = Math.min(sc.w / c / (pw + pad), sc.h / r / (ph + pad));
    if (fit > best) { best = fit; cols = c; }
  }
  const rows = Math.ceil(loose.length / cols);
  const cw = sc.w / cols, ch = sc.h / rows;
  loose.forEach((p, i) => {
    const cx = sc.x + (i % cols + 0.5) * cw, cy = sc.y + (Math.floor(i / cols) + 0.5) * ch;
    const jx = Math.max(0, cw - pw - pad) * (Math.random() - 0.5);
    const jy = Math.max(0, ch - ph - pad) * (Math.random() - 0.5);
    p.z = ++zTop;
    p.x = clamp(cx - pw / 2 + jx, 0, Math.max(0, W - pw));
    p.y = clamp(cy - ph / 2 + jy, 0, Math.max(0, H - ph));
  });
}

// ---------- Game ----------
function newGame() {
  pieces.forEach(p => p.canvas.remove());
  pieces = [];
  moves = 0;
  zTop = 10;
  hideReward();
  hint.classList.remove('done');

  const grid = [];
  for (let r = 0; r < n; r++) {
    grid.push([]);
    for (let c = 0; c < n; c++) {
      const e = [
        r === 0 ? 0 : -grid[r - 1][c].e[2],
        c === n - 1 ? 0 : (Math.random() < 0.5 ? 1 : -1),
        r === n - 1 ? 0 : (Math.random() < 0.5 ? 1 : -1),
        c === 0 ? 0 : -grid[r][c - 1].e[1],
      ];
      const canvas = document.createElement('canvas');
      canvas.className = 'piece';
      stage.appendChild(canvas);
      const p = { r, c, e, canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), placed: false, x: 0, y: 0, z: zTop++ };
      grid[r].push(p);
      pieces.push(p);
    }
  }

  geo = null;
  applyLayout(); // no previous geo -> scatters pieces
  updateCount();
}

function updateCount() {
  const done = pieces.filter(p => p.placed).length;
  countEl.textContent = `${done}/${pieces.length}`;
  if (done === pieces.length && pieces.length) win();
}

function win() {
  hint.classList.add('done');                 // show the finished picture first
  rewardTimers.push(setTimeout(showReward, 1100));
}

// ---------- Reward sequence ----------
let rewardTimers = [];

// fill the scroll with the reward text and picture
letterWrap.querySelector('.r-title').textContent = REWARD.title;
const rTrack = letterWrap.querySelector('.r-track');
const PEEK = 3;         // how many next pictures peek out behind the current one
let slide = 0;          // index of the picture in front
setupGallery(REWARD.images || [REWARD.image]);
letterWrap.querySelector('.r-msg').textContent = REWARD.message;

// photo stack: the current picture in front, the next 3 peeking out behind it
function setupGallery(list) {
  const gallery = letterWrap.querySelector('.r-gallery');
  const dotsBox = letterWrap.querySelector('.r-dots');
  rTrack.innerHTML = '';
  dotsBox.innerHTML = '';
  list.forEach((src, i) => {
    const card = document.createElement('div');
    card.className = 'r-card';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    card.appendChild(img);
    rTrack.appendChild(card);
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', 'รูปที่ ' + (i + 1));
    dot.onclick = () => goSlide(i);
    dotsBox.appendChild(dot);
  });
  gallery.classList.toggle('single', list.length < 2);
  letterWrap.querySelector('.r-nav.prev').onclick = () => goSlide(slide - 1);
  letterWrap.querySelector('.r-nav.next').onclick = () => goSlide(slide + 1);
  setupSwipe();
  layoutStack();
}

function goSlide(i, dir) {
  const count = rTrack.children.length;
  if (dir === undefined) dir = i >= slide ? 1 : -1;
  slide = (i + count) % count;                 // wrap around at both ends
  layoutStack(dir);
}

// place each card by its distance from the current one
function layoutStack(dir = 1) {
  const cards = [...rTrack.children];
  const n = cards.length;
  cards.forEach((card, k) => {
    const d = (k - slide + n) % n;             // 0 = front, 1..PEEK = peeking behind
    let t, o = 1;
    if (d <= PEEK) {
      t = `translate(${d * 9}%, ${-d * 3}%) scale(${1 - d * 0.07}) rotate(${-2 + d * 4}deg)`;
    } else if (d === n - 1 && dir > 0) {
      t = 'translate(-115%, 4%) rotate(-14deg)'; // the card just flicked away
      o = 0;
    } else {
      t = `translate(${PEEK * 9}%, ${-PEEK * 3}%) scale(${1 - PEEK * 0.07}) rotate(${-2 + PEEK * 4}deg)`;
      o = 0;                                   // waiting at the back of the stack
    }
    card.style.transform = t;
    card.style.opacity = o;
    card.style.zIndex = n - d;
    card.classList.toggle('front', d === 0);
  });
  letterWrap.querySelectorAll('.r-dots button').forEach((b, k) => b.classList.toggle('active', k === slide));
}

// drag the front card left/right to change picture
function setupSwipe() {
  let startX = null, dx = 0, card = null;
  rTrack.onpointerdown = e => {
    if (rTrack.children.length < 2) return;
    card = rTrack.children[slide];
    startX = e.clientX;
    dx = 0;
    card.classList.add('dragging');
    rTrack.setPointerCapture(e.pointerId);
  };
  rTrack.onpointermove = e => {
    if (startX === null) return;
    dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${-2 + dx / 20}deg)`;
  };
  rTrack.onpointerup = rTrack.onpointercancel = () => {
    if (startX === null) return;
    startX = null;
    card.classList.remove('dragging');
    if (dx < -40) goSlide(slide + 1, 1);
    else if (dx > 40) goSlide(slide - 1, -1);
    else layoutStack();
  };
}

function showReward() {
  rewardEl.classList.add('show');
  rewardEl.offsetWidth;                       // apply display:block before fading in
  rewardEl.classList.add('visible');
  // gift drops + shakes, then pops open
  rewardTimers.push(setTimeout(() => {
    rewardEl.classList.add('open');
    const r = document.getElementById('gift').getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height * 0.3, 170);
  }, 1950));
}

function hideReward() {
  rewardTimers.forEach(clearTimeout);
  rewardTimers = [];
  rewardEl.classList.remove('show', 'visible', 'open', 'unfolded');
  confetti.length = 0;
  slide = 0;                                  // next time start from the first picture
  layoutStack(-1);
}

letterWrap.addEventListener('click', e => {
  if (e.target.closest('.again')) { newGame(); return; }
  if (!rewardEl.classList.contains('open') || rewardEl.classList.contains('unfolded')) return;
  rewardEl.classList.add('unfolded');
  rewardTimers.push(setTimeout(() => {
    burst(innerWidth * 0.2, innerHeight * 0.3, 70);
    burst(innerWidth * 0.8, innerHeight * 0.3, 70);
  }, 1900));
});

// ---------- Confetti ----------
const cCanvas = document.getElementById('confetti');
const cCtx = cCanvas.getContext('2d');
const confetti = [];
const C_COLORS = ['#ff2d55', '#ff5a7a', '#ff8fab', '#ffb3c6', '#ffffff', '#e0115f', '#ff6f91'];
let cRunning = false;

// background hearts: created once, they only move while the reward is open
(function makeHearts() {
  const box = document.getElementById('hearts');
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = '♥';
    s.style.left = (Math.random() * 100) + '%';
    s.style.fontSize = (18 + Math.random() * 34) + 'px';
    s.style.color = C_COLORS[i % 6];
    s.style.setProperty('--sway', ((Math.random() - 0.5) * 80) + 'px');
    s.style.animationDuration = (6 + Math.random() * 6) + 's';
    s.style.animationDelay = (-Math.random() * 12) + 's';
    box.appendChild(s);
  }
})();

function heartPath(ctx, size) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.7);
  ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.2, -s * 0.1, 0, s * 0.7);
  ctx.closePath();
}

function burst(x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const v = 6 + Math.random() * 10;
    confetti.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      size: 12 + Math.random() * 14,
      rot: (Math.random() - 0.5) * 0.8, vr: (Math.random() - 0.5) * 0.06,
      color: C_COLORS[(Math.random() * C_COLORS.length) | 0],
      life: 0,
    });
  }
  if (!cRunning) { cRunning = true; requestAnimationFrame(tickConfetti); }
}

function tickConfetti() {
  const dpr = window.devicePixelRatio || 1;
  const W = innerWidth, H = innerHeight;
  if (cCanvas.width !== Math.round(W * dpr) || cCanvas.height !== Math.round(H * dpr)) {
    cCanvas.width = Math.round(W * dpr);
    cCanvas.height = Math.round(H * dpr);
  }
  cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cCtx.clearRect(0, 0, W, H);
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.vy += 0.28;                 // gravity
    p.vx *= 0.985; p.vy *= 0.985; // air drag
    p.x += p.vx + Math.sin(p.life / 9) * 0.6;
    p.y += p.vy;
    p.rot += p.vr;
    p.life++;
    if (p.y > H + 30) { confetti.splice(i, 1); continue; }
    cCtx.save();
    cCtx.translate(p.x, p.y);
    cCtx.rotate(p.rot);
    cCtx.scale(Math.cos(p.life / 10), 1);  // gentle flip while falling
    cCtx.fillStyle = p.color;
    heartPath(cCtx, p.size);
    cCtx.fill();
    cCtx.restore();
  }
  if (confetti.length) requestAnimationFrame(tickConfetti);
  else { cRunning = false; cCtx.clearRect(0, 0, W, H); }
}

// ---------- Dragging ----------
// shape-based hit test (works even when the page is opened as a local file)
function hitTest(px, py) {
  const loose = pieces.filter(p => !p.placed).sort((a, b) => b.z - a.z);
  for (const p of loose) {
    piecePath(hitCtx, p, geo.pw, geo.ph);
    if (hitCtx.isPointInPath(px - p.x, py - p.y)) return p;
  }
  // fingers are imprecise: fall back to the top piece whose box is near the touch
  const tol = geo.small ? geo.pad : 0;
  if (tol) {
    for (const p of loose) {
      if (px >= p.x - tol && px <= p.x + geo.pw + tol && py >= p.y - tol && py <= p.y + geo.ph + tol) return p;
    }
  }
  return null;
}

stage.addEventListener('pointerdown', e => {
  const rect = stage.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const p = hitTest(px, py);
  if (!p) return;
  e.preventDefault();
  drag = { p, dx: px - p.x, dy: py - p.y };
  p.z = ++zTop;
  p.canvas.classList.add('dragging');
  placeEl(p);
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const rect = stage.getBoundingClientRect();
  const p = drag.p;
  p.x = clamp(e.clientX - rect.left - drag.dx, -geo.pw / 2, geo.W - geo.pw / 2);
  p.y = clamp(e.clientY - rect.top - drag.dy, -geo.ph / 2, geo.H - geo.ph / 2);
  placeEl(p);
});

function endDrag() {
  if (!drag) return;
  const p = drag.p;
  drag = null;
  moves++;
  p.canvas.classList.remove('dragging');
  const tx = geo.bx + p.c * geo.pw, ty = geo.by + p.r * geo.ph;
  const snap = Math.min(geo.pw, geo.ph) * (geo.small ? 0.42 : 0.3);
  if (Math.hypot(p.x - tx, p.y - ty) < snap) {
    p.placed = true;
    p.canvas.classList.add('placed');
    placeEl(p);
    updateCount();
  }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

// ---------- Controls ----------
document.getElementById('shuffle').onclick = newGame;

let resizeT;
// fires on window resize, phone rotation and the mobile address bar showing/hiding
new ResizeObserver(() => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (pieces.length && geo && (stage.clientWidth !== geo.W || stage.clientHeight !== geo.H)) applyLayout();
  }, 120);
}).observe(stage);

image = new Image();
image.onload = () => {
  ASPECT = image.naturalWidth / image.naturalHeight;
  newGame();
};
image.onerror = () => alert('โหลดรูป ' + IMAGE_SRC + ' ไม่ได้');
image.src = IMAGE_SRC;

// ---------- Background hearts rising from the bottom ----------
const bgHearts = document.getElementById('bgHearts');
function spawnBgHeart() {
  if (document.hidden || bgHearts.childElementCount > 30) return;
  const h = document.createElement('span');
  const size = 12 + Math.random() * 22;
  const dur = 7 + Math.random() * 6;
  h.textContent = '♥';
  h.style.left = Math.random() * 100 + '%';
  h.style.fontSize = size + 'px';
  h.style.animationDuration = dur + 's';
  h.style.setProperty('--sway', (Math.random() * 60 - 30) + 'px');
  h.style.setProperty('--o', (0.35 + Math.random() * 0.45).toFixed(2));
  h.addEventListener('animationend', () => h.remove());
  setTimeout(() => h.remove(), dur * 1000 + 500);   // backup if animationend never fires
  bgHearts.appendChild(h);
}
for (let i = 0; i < 6; i++) setTimeout(spawnBgHeart, i * 400);
setInterval(spawnBgHeart, 600);
