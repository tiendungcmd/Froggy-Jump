const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const loadingOverlay = document.getElementById('loading-overlay');

const GROUND_Y = 380;
const FROG_R = 16;
const MAX_CHARGE = 800;
const MIN_JUMP = 70;
const MAX_JUMP = 260;

let bestScore = 0;
let state = 'menu';
let wellsPassed = 0;
let points = 0;
let cameraX = 0;
let charging = false;
let chargeStart = 0;
let frog = { worldX: 0, y: GROUND_Y, vy: 0, squash: 1, legAngle: 0 };
let wells = [];
let floatingTexts = [];
let leaderboard = null;
let isFbInstant = false;
const LEADERBOARD_NAME = 'frog_well_leaderboard';

async function loadBestScore() {
  if (isFbInstant) {
    try {
      const data = await FBInstant.player.getDataAsync(['bestScore']);
      bestScore = parseInt(data.bestScore) || 0;
    } catch (e) {
      bestScore = 0;
    }
  } else {
    bestScore = parseInt(localStorage.getItem('frog_well_best_score')) || 0;
  }
  bestEl.textContent = 'Kỷ lục: ' + bestScore;
}

async function saveBest(v) {
  if (isFbInstant) {
    try {
      await FBInstant.player.setDataAsync({ bestScore: v });
    } catch (e) {
      // ignore save error
    }
  } else {
    localStorage.setItem('frog_well_best_score', String(v));
  }
}

async function initLeaderboard() {
  if (!isFbInstant) return;
  try {
    leaderboard = await FBInstant.getLeaderboardAsync(LEADERBOARD_NAME);
  } catch (e) {
    console.warn('Leaderboard init failed', e);
  }
}

async function submitLeaderboardScore(score) {
  if (!leaderboard) return;
  try {
    await leaderboard.setScoreAsync(score, { score });
  } catch (e) {
    console.warn('Leaderboard submit failed', e);
  }
}

async function showLeaderboard() {
  if (!isFbInstant || !leaderboard) {
    alert('Xếp hạng chỉ hoạt động khi chạy trong Facebook Instant Games.');
    return;
  }

  loadingOverlay.style.display = 'flex';
  loadingOverlay.textContent = 'Đang tải bảng xếp hạng...';
  try {
    const entries = await leaderboard.getEntriesAsync(10, 0);
    let html = '<h1>Bảng xếp hạng</h1>';
    if (entries.length === 0) {
      html += '<p>Chưa có điểm nào.</p>';
    } else {
      html += '<div style="text-align:left; width: 320px; max-width: 90%; margin-top: 12px;">';
      entries.forEach((entry, index) => {
        const name = entry.getPlayer().getName();
        html += `<p style="margin: 6px 0; font-size: 18px;">${index + 1}. ${name} — ${entry.getScore()}</p>`;
      });
      html += '</div>';
    }
    html += '<p class="hint">Nhấn để đóng</p>';
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'auto';
    overlay.addEventListener('click', hideLeaderboardOverlay, { once: true });
  } catch (e) {
    console.error('Failed to load leaderboard', e);
    alert('Không thể tải bảng xếp hạng.');
  } finally {
    loadingOverlay.style.display = 'none';
    loadingOverlay.textContent = 'Đang khởi động...';
  }
}

function hideLeaderboardOverlay() {
  overlay.style.display = 'none';
  overlay.style.pointerEvents = 'none';
}

function wellRadiusForIndex(i) {
  const base = 55;
  const shrinkPerStep = 1.6;
  const minR = 15;
  const randomSpread = Math.min(20, 4 + i * 0.45);
  const noise = (Math.random() - 0.5) * 2 * randomSpread;
  return Math.max(minR, base - i * shrinkPerStep + noise);
}

function gapForIndex(i) {
  const baseGap = 90;
  const growth = Math.min(70, i * 2.2);
  const randomSpread = Math.min(65, 10 + i * 2);
  const rand = Math.random() * randomSpread;
  return baseGap + growth + rand;
}

function initWells() {
  wells = [];
  let x = 80;
  const r0 = wellRadiusForIndex(0);
  wells.push({ x: x, r: r0, idx: 0 });
  for (let i = 1; i < 6; i++) {
    x += wells[i - 1].r + gapForIndex(i) + wellRadiusForIndex(i);
    wells.push({ x: x, r: wellRadiusForIndex(i), idx: i });
  }
}

function ensureWellsAhead() {
  while (wells.length < wellsPassed + 8) {
    const last = wells[wells.length - 1];
    const i = last.idx + 1;
    const r = wellRadiusForIndex(i);
    const x = last.x + last.r + gapForIndex(i) + r;
    wells.push({ x: x, r: r, idx: i });
  }
}

function resetGame() {
  wellsPassed = 0;
  points = 0;
  initWells();
  frog.worldX = wells[0].x;
  frog.y = GROUND_Y;
  frog.vy = 0;
  frog.squash = 1;
  cameraX = 0;
  charging = false;
  floatingTexts = [];
  state = 'ready';
  scoreEl.textContent = 'Điểm: 0';
  overlay.style.display = 'none';
}

function currentWellIndex() {
  return wellsPassed;
}

function startCharge() {
  if (state !== 'ready') return;
  charging = true;
  chargeStart = performance.now();
  state = 'charging';
}

function releaseCharge() {
  if (state !== 'charging') return;
  charging = false;
  const held = performance.now() - chargeStart;
  const power = Math.min(1, held / MAX_CHARGE);
  const jumpDist = MIN_JUMP + power * (MAX_JUMP - MIN_JUMP);
  doJump(jumpDist);
}

function doJump(dist) {
  state = 'jumping';
  frog.squash = 1.4;
  const startX = frog.worldX;
  const targetX = startX + dist;
  const duration = 420 + dist * 1.1;
  const jumpHeight = 60 + dist * 0.35;
  const t0 = performance.now();

  function animate(now) {
    const t = Math.min(1, (now - t0) / duration);
    frog.worldX = startX + (targetX - startX) * t;
    frog.y = GROUND_Y - Math.sin(Math.PI * t) * jumpHeight;
    frog.legAngle = Math.sin(t * Math.PI * 2) * 0.6;

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      landFrog(targetX);
    }
  }
  requestAnimationFrame(animate);
}

function landFrog(landX) {
  ensureWellsAhead();
  const nextIdx = currentWellIndex() + 1;
  const target = wells[nextIdx];
  const dist = Math.abs(landX - target.x);
  const tolerance = target.r * 0.92;

  if (dist <= tolerance) {
    wellsPassed++;
    frog.worldX = landX;
    frog.y = GROUND_Y;
    frog.squash = 1.35;
    state = 'ready';
    ensureWellsAhead();

    const ratio = dist / tolerance;
    let pts, label, color;
    if (ratio <= 0.22) { pts = 3; label = 'Tuyệt vời! +3'; color = '#ffd700'; }
    else if (ratio <= 0.55) { pts = 2; label = 'Tốt! +2'; color = '#7fff6b'; }
    else { pts = 1; label = 'Sát mép! +1'; color = '#ffffff'; }

    points += pts;
    scoreEl.textContent = 'Điểm: ' + points;
    floatingTexts.push({ x: landX, y: GROUND_Y - 30, text: label, color: color, life: 1 });
  } else {
    frog.worldX = landX;
    fallIntoWell();
  }
}

function fallIntoWell() {
  state = 'falling';
  const startY = frog.y;
  const t0 = performance.now();
  const duration = 550;
  function anim(now) {
    const t = Math.min(1, (now - t0) / duration);
    frog.y = startY + t * 220;
    frog.squash = Math.max(0.3, 1 - t * 0.7);
    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      gameOver();
    }
  }
  requestAnimationFrame(anim);
}

function gameOver() {
  state = 'gameover';
  if (points > bestScore) {
    bestScore = points;
    bestEl.textContent = 'Kỷ lục: ' + bestScore;
    saveBest(bestScore);
  }
  if (isFbInstant) {
    submitLeaderboardScore(points);
  }
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <h1>💦 Ếch rơi xuống giếng!</h1>
    <p>Điểm của bạn: ${points}</p>
    <p>Kỷ lục: ${bestScore}</p>
    <p class="hint">Nhấn hoặc chạm để chơi lại</p>
  `;
}

function handleDown(e) {
  e.preventDefault();
  if (state === 'menu' || state === 'gameover') {
    resetGame();
    return;
  }
  startCharge();
}

function handleUp(e) {
  e.preventDefault();
  releaseCharge();
}

canvas.addEventListener('mousedown', handleDown);
window.addEventListener('mouseup', handleUp);
canvas.addEventListener('touchstart', handleDown, { passive: false });
window.addEventListener('touchend', handleUp, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (state === 'menu' || state === 'gameover') { resetGame(); return; }
    if (!charging) startCharge();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') releaseCharge();
});

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#bfe9ff');
  g.addColorStop(1, '#7ec8e3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 260) - (cameraX * 0.15) % 1560 + 1560) % (canvas.width + 400) - 200;
    const cy = 60 + (i % 3) * 40;
    drawCloud(cx, cy);
  }

  ctx.fillStyle = '#c9a876';
  ctx.fillRect(0, GROUND_Y + FROG_R, canvas.width, canvas.height - GROUND_Y - FROG_R);
  ctx.fillStyle = '#8fbf5e';
  ctx.fillRect(0, GROUND_Y + FROG_R, canvas.width, 10);
}

function drawCloud(x, y) {
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 22, y + 4, 22, 13, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 22, y + 6, 20, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWell(w) {
  const sx = w.x - cameraX;
  if (sx < -100 || sx > canvas.width + 100) return;

  ctx.beginPath();
  ctx.ellipse(sx, GROUND_Y + FROG_R, w.r + 8, (w.r + 8) * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8a6a4a';
  ctx.fill();

  const holeGrad = ctx.createRadialGradient(sx, GROUND_Y + FROG_R, 2, sx, GROUND_Y + FROG_R, w.r);
  holeGrad.addColorStop(0, '#173049');
  holeGrad.addColorStop(1, '#03080d');
  ctx.beginPath();
  ctx.ellipse(sx, GROUND_Y + FROG_R, w.r, w.r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = holeGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(sx, GROUND_Y + FROG_R, w.r, w.r * 0.45, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawFrog() {
  const sx = frog.worldX - cameraX;
  const sy = frog.y;
  const squashY = frog.squash;
  const squashX = 1 + (1 - squashY) * 0.5;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(squashX, squashY);

  ctx.fillStyle = '#3f8f3f';
  const legOffset = frog.legAngle * 10;
  ctx.beginPath();
  ctx.ellipse(-14, 8 - legOffset, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(14, 8 + legOffset, 8, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, FROG_R, FROG_R * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4caf50';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-7, -14, 6, 0, Math.PI * 2);
  ctx.arc(7, -14, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-7, -14, 2.6, 0, Math.PI * 2);
  ctx.arc(7, -14, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function updateFroggySquash() {
  if (state === 'charging') {
    const held = performance.now() - chargeStart;
    const power = Math.min(1, held / MAX_CHARGE);
    const targetSquat = 1 - power * 0.4;
    frog.squash += (targetSquat - frog.squash) * 0.35;
  } else if (state === 'ready') {
    frog.squash += (1 - frog.squash) * 0.2;
  } else if (state === 'jumping') {
    frog.squash += (1 - frog.squash) * 0.12;
  }
}

function updateFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i];
    f.y -= 0.6;
    f.life -= 0.018;
    if (f.life <= 0) floatingTexts.splice(i, 1);
  }
}

function drawFloatingTexts() {
  ctx.font = 'bold 22px Trebuchet MS';
  ctx.textAlign = 'center';
  for (const f of floatingTexts) {
    const sx = f.x - cameraX;
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, sx, f.y);
    ctx.fillText(f.text, sx, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function updateCamera() {
  const targetCam = frog.worldX - 180;
  cameraX += (targetCam - cameraX) * 0.12;
}

function loop() {
  updateCamera();
  drawBackground();
  ensureWellsAhead();
  for (const w of wells) drawWell(w);
  updateFroggySquash();
  drawFrog();
  updateFloatingTexts();
  drawFloatingTexts();
  requestAnimationFrame(loop);
}

async function initializeApp() {
  isFbInstant = typeof FBInstant !== 'undefined';
  if (isFbInstant) {
    loadingOverlay.textContent = 'Khởi động Facebook Instant Games...';
    await FBInstant.initializeAsync();
    await FBInstant.startGameAsync();
    loadingOverlay.style.display = 'none';
  } else {
    loadingOverlay.textContent = 'Chạy với chế độ web. Để dùng Instant Games, upload lên Facebook Developer.';
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 800);
  }

  await loadBestScore();
  await initLeaderboard();
  initWells();
  frog.worldX = wells[0].x;
  requestAnimationFrame(loop);
}

const leaderboardBtn = document.getElementById('leaderboardBtn');
if (leaderboardBtn) {
  leaderboardBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showLeaderboard();
  });
}

initializeApp().catch((error) => {
  console.error('Lỗi khởi tạo:', error);
  loadingOverlay.textContent = 'Không thể khởi động game. Kiểm tra kết nối và cấu hình Facebook Instant Games.';
});