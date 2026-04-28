// ════════════════════════════════════════════════════════════════
//  app.js  —  OMR Chấm Trắc Nghiệm  (OpenCV.js)
// ════════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────
let cvReady  = false;
let keys     = JSON.parse(localStorage.getItem('omr_keys')    || '[]');
let results  = JSON.parse(localStorage.getItem('omr_results') || '[]');
let camStream = null;

const OPTS = ['A','B','C','D'];

// ════════════════════════════════════════════════════════════════
//  OPENCVREADY
// ════════════════════════════════════════════════════════════════
function onOpenCvReady() {
  if (typeof cv === 'undefined') {
    return;
  }
  if (typeof cv.Mat === 'undefined' && typeof cv.onRuntimeInitialized !== 'undefined') {
    cv.onRuntimeInitialized = onOpenCvReady;
    return;
  }

  cvReady = true;
  const badge = document.getElementById('cvStatus');
  badge.textContent = '✅ OpenCV sẵn sàng';
  badge.className   = 'cv-badge ready';
}

// ════════════════════════════════════════════════════════════════
//  TABS
// ════════════════════════════════════════════════════════════════
function goTab(t) {
  ['key','scan','results','stats'].forEach((x, i) => {
    document.getElementById('pane-'+x).classList.toggle('on', x===t);
    document.querySelectorAll('.tab')[i].classList.toggle('active', x===t);
  });
  if (t === 'results') { populateExamFilter(); renderResults(); }
  if (t === 'stats')   { populateStatsSelect(); renderStats(); }
  if (t === 'scan')    { populateScanKeySelect(); }
  if (t !== 'scan')    stopCamera();
}

// ════════════════════════════════════════════════════════════════
//  TAB 1 — QUẢN LÝ ĐÁP ÁN
// ════════════════════════════════════════════════════════════════
function rebuildKeyGrid() {
  const n   = +document.getElementById('exam-n').value;
  const g   = document.getElementById('keyGrid');
  g.innerHTML = '';
  for (let i = 1; i <= n; i++) {
    const row = document.createElement('div');
    row.className = 'kg-row';
    row.innerHTML = `<span class="kg-num">${i}.</span>
      <div class="kg-bubbles">
        ${OPTS.map(o => `<div class="kb" data-q="${i}" data-opt="${o}"
          onclick="selectKey(this)">${o}</div>`).join('')}
      </div>`;
    g.appendChild(row);
  }
}
rebuildKeyGrid();

function selectKey(el) {
  const q = el.dataset.q;
  el.closest('.kg-bubbles').querySelectorAll('.kb').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function fillRandom() {
  document.querySelectorAll('.kg-row').forEach(row => {
    const bs = row.querySelectorAll('.kb');
    bs.forEach(b => b.classList.remove('active'));
    bs[Math.floor(Math.random()*4)].classList.add('active');
  });
}

function clearKey() {
  document.querySelectorAll('.kb').forEach(b => b.classList.remove('active'));
}

function saveKey() {
  const name  = document.getElementById('exam-name').value.trim() || 'Bài kiểm tra';
  const code  = (document.getElementById('exam-code').value.trim() || '001').padStart(3, '0').slice(-3);
  const scale = +document.getElementById('exam-scale').value;
  const n     = +document.getElementById('exam-n').value;
  const a     = {};
  let missing = 0;
  for (let i = 1; i <= n; i++) {
    const active = document.querySelector(`.kb[data-q="${i}"].active`);
    if (active) a[i] = active.dataset.opt;
    else { a[i] = '?'; missing++; }
  }
  const key = { id: Date.now(), name, code, scale, n, a, ts: new Date().toLocaleString('vi-VN') };
  // Nếu trùng mã đề và tên thì cập nhật
  const idx = keys.findIndex(k => k.code === code && k.name === name);
  if (idx >= 0) keys[idx] = key; else keys.unshift(key);
  saveLocal();
  renderSavedKeys();
  populateScanKeySelect();
  setMsg('keyMsg', missing > 0
    ? `warn|Đã lưu! Còn ${missing} câu chưa chọn đáp án (đánh dấu '?').`
    : `ok|✅ Đã lưu đáp án · Mã đề ${code} · ${n} câu`);
}

function renderSavedKeys() {
  const el = document.getElementById('savedKeys');
  document.getElementById('keyCount').textContent = keys.length;
  if (!keys.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:.5rem 0">Chưa có đề nào</p>';
    return;
  }
  el.innerHTML = keys.map(k => `
    <div class="saved-key">
      <div class="sk-code">${k.code}</div>
      <div class="sk-info">
        <div class="sk-name">${k.name}</div>
        <div class="sk-meta">${k.n} câu · Thang ${k.scale} · ${k.ts}</div>
      </div>
      <button class="btn danger" style="padding:4px 8px;font-size:12px"
        onclick="deleteKey(${k.id})">🗑</button>
    </div>`).join('');
}

function deleteKey(id) {
  if (!confirm('Xóa đề này?')) return;
  keys = keys.filter(k => k.id !== id);
  saveLocal(); renderSavedKeys(); populateScanKeySelect();
}

// ════════════════════════════════════════════════════════════════
//  TAB 2 — CHẤM ẢNH
// ════════════════════════════════════════════════════════════════
function populateScanKeySelect() {
  const sel = document.getElementById('scan-keySelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Chưa chọn —</option>' +
    keys.map(k => `<option value="${k.id}">${k.code} · ${k.name} (${k.n} câu)</option>`).join('');
  if (cur) sel.value = cur;
  onKeySelected();
}

function onKeySelected() {
  const id  = +document.getElementById('scan-keySelect').value;
  const key = keys.find(k => k.id === id);
  const el  = document.getElementById('selectedKeyInfo');
  if (!key) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="msg ok" style="margin-top:.5rem">
    ✅ Đã chọn: <b>${key.name}</b> · Mã đề <b>${key.code}</b> · ${key.n} câu · Thang ${key.scale}
  </div>`;
}

// Drop zone
const dz = document.getElementById('dropzone');
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('over');
  handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
  if (!files || !files.length) return;
  const keyId = +document.getElementById('scan-keySelect').value;
  if (!keyId) { alert('Vui lòng chọn đề thi trước khi tải ảnh lên!'); return; }
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    await processImage(url, file.name, keyId);
    URL.revokeObjectURL(url);
  }
}

// ── Camera ──────────────────────────────────────────────────
async function toggleCamera() {
  if (camStream) { stopCamera(); return; }
  const btn = document.getElementById('camBtn');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }
    });
    const vid = document.getElementById('camVideo');
    vid.srcObject = camStream;
    document.getElementById('camWrap').style.display = 'block';
    document.getElementById('captureBtn').disabled   = false;
    btn.textContent = '🛑 Tắt camera';
    btn.classList.add('danger');
  } catch(e) {
    alert('Không mở được camera: ' + e.message);
  }
}

function stopCamera() {
  if (!camStream) return;
  camStream.getTracks().forEach(t => t.stop()); camStream = null;
  document.getElementById('camWrap').style.display    = 'none';
  document.getElementById('captureBtn').disabled       = true;
  const btn = document.getElementById('camBtn');
  btn.textContent = '📸 Mở camera'; btn.classList.remove('danger');
}

async function captureFrame() {
  const keyId = +document.getElementById('scan-keySelect').value;
  if (!keyId) { alert('Vui lòng chọn đề thi trước!'); return; }
  const vid = document.getElementById('camVideo');
  const c   = document.getElementById('camCanvas');
  c.width = vid.videoWidth; c.height = vid.videoHeight;
  c.getContext('2d').drawImage(vid, 0, 0);
  const url = c.toDataURL('image/png');
  await processImage(url, 'camera_' + Date.now() + '.png', keyId);
}

// ════════════════════════════════════════════════════════════════
//  CORE OMR PIPELINE (OpenCV.js)
// ════════════════════════════════════════════════════════════════
async function processImage(src, filename, keyId) {
  const key = keys.find(k => k.id === keyId);
  if (!key) return;

  document.getElementById('pipelineCard').style.display = 'block';
  document.getElementById('pipelineFile').textContent   = filename;
  document.getElementById('scanResult').innerHTML       = '';

  const steps    = ['Tải ảnh','Tiền xử lý','Tìm điểm neo','Kéo phẳng','Đọc SBD/Mã đề','Nhận dạng câu','Chấm điểm'];
  const stepsEl  = document.getElementById('pipelineSteps');
  const prevRow  = document.getElementById('previewRow');
  stepsEl.innerHTML = steps.map((s,i) => `<div class="ps" id="ps${i}">${s}</div>`).join('');
  prevRow.innerHTML = '';

  const setStep = (i, st) => {
    document.getElementById('ps'+i).className = 'ps ' + st;
  };

  const flags = [];

  // ── Bước 0: Tải ảnh ───────────────────────────────────────
  setStep(0,'active');
  const img = await loadImage(src);
  addPreview(prevRow, imageToCanvas(img), 'Ảnh gốc');
  setStep(0,'done');

  if (!cvReady) {
    setStep(1,'error');
    showScanMsg('err', '⚠ OpenCV chưa sẵn sàng, vui lòng chờ thêm.');
    return;
  }

  // ── Bước 1: Tiền xử lý — adaptive threshold thông minh ─
  setStep(1,'active');
  let src_mat, gray, blurred, binary;
  try {
    src_mat = cv.imread(imageToCanvas(img));
    gray    = new cv.Mat();
    blurred = new cv.Mat();
    binary  = new cv.Mat();

    cv.cvtColor(src_mat, gray, cv.COLOR_RGBA2GRAY);

    // Phân tích ảnh để chọn thông số threshold phù hợp
    const imgStats = analyzeImageStats(gray);
    const threshParams = getAdaptiveParams(imgStats);

    cv.GaussianBlur(gray, blurred, new cv.Size(5,5), 0);
    cv.adaptiveThreshold(blurred, binary, 255,
      threshParams.method, cv.THRESH_BINARY_INV,
      threshParams.blockSize, threshParams.C);

    addPreview(prevRow, matToCanvas(binary), 'Nhị phân hóa');
    setStep(1,'done');
  } catch(e) {
    setStep(1,'error');
    showScanMsg('err','Lỗi tiền xử lý: '+e); cleanup(src_mat,gray,blurred,binary); return;
  }

  // ── Bước 2: Tìm điểm neo (4 ô vuông đen ở góc) ───────────
  setStep(2,'active');
  let warpedMat = null, warpedColor = null;
  try {
    const anchors = findAnchorSquares(binary, src_mat);
    if (anchors) {
      addPreview(prevRow, drawAnchorDebug(src_mat, anchors), anchors.recovered ? 'Điểm neo (edge recovery)' : 'Điểm neo');
      setStep(2,'done');
      // ── Bước 3: Kéo phẳng ─────────────────────────────────
      setStep(3,'active');
      warpedMat   = perspectiveWarp(binary,   anchors, 800, 1100);
      warpedColor = perspectiveWarp(src_mat,  anchors, 800, 1100);
      addPreview(prevRow, matToCanvas(warpedColor), anchors.recovered ? 'Sau kéo phẳng (ước lượng)' : 'Sau kéo phẳng');
      setStep(3,'done');
      // Cảnh báo nếu dùng edge recovery
      if (anchors.recovered) {
        flags.push({ type:'warn', msg:'Không tìm đủ 4 ô neo, dùng cạnh phiếu để căn chỉnh — kết quả có thể kém chính xác hơn' });
      }
    } else {
      // Không tìm được neo → dùng toàn bộ ảnh, resize về chuẩn
      setStep(2,'warn');
      warpedMat   = resizeMat(binary,   800, 1100);
      warpedColor = resizeMat(src_mat,  800, 1100);
      addPreview(prevRow, matToCanvas(warpedColor), '⚠ Không tìm neo — dùng resize');
      setStep(3,'warn');
      flags.push({ type:'warn', msg:'Không tìm được điểm neo — kéo phẳng thủ công sẽ giảm độ chính xác' });
    }
  } catch(e) {
    setStep(2,'warn');
    warpedMat   = resizeMat(binary,   800, 1100);
    warpedColor = resizeMat(src_mat,  800, 1100);
    setStep(3,'warn');
    flags.push({ type:'warn', msg:'Lỗi tìm điểm neo: ' + e.message });
  }

  // ── Bước 4: Đọc SBD + Mã đề từ vùng bong bóng số ─────────
  setStep(4,'active');
  let detectedSBD  = '';
  let detectedCode = '';
  let detectedRegions = {
    SBD: { ...REGION.SBD, detected: false },
    CODE: { ...REGION.CODE, detected: false },
    ANSWERS: getAnswerRegions(key.n).map(region => ({ ...region, detected: false }))
  };
  try {
    detectedRegions = detectOmrRegions(warpedMat, key.n);
  } catch(e) {
    flags.push({ type:'warn', msg:'Không đọc được marker vùng — dùng tọa độ mặc định' });
  }
  try {
    detectedSBD  = readBubbleNumber(warpedMat, detectedRegions.SBD,  6);
    detectedCode = readBubbleNumber(warpedMat, detectedRegions.CODE, 3);
    setStep(4,'done');
  } catch(e) {
    setStep(4,'warn');
  }

  // ── Bước 5: Nhận dạng câu trả lời ─────────────────────────
  setStep(5,'active');
  let detected = {};
  try {
    const result = readAnswerBubbles(warpedMat, key.n, detectedRegions.ANSWERS);
    detected = result.answers;
    result.flags.forEach(f => flags.push(f));
    addPreview(prevRow, drawAnswerDebug(warpedColor, key.n, detectedRegions.ANSWERS), 'Vùng nhận dạng');
    setStep(5,'done');
  } catch(e) {
    setStep(5,'error');
    showScanMsg('err','Lỗi nhận dạng câu: '+e);
    cleanup(src_mat,gray,blurred,binary,warpedMat,warpedColor); return;
  }

  // ── Bước 6: Chấm điểm ─────────────────────────────────────
  setStep(6,'active');
  const scoreObj = gradeAnswers(detected, key);
  scoreObj.flags.push(...flags);
  // Bổ sung kiểm tra mã đề
  if (detectedCode && detectedCode !== key.code) {
    scoreObj.flags.push({ type:'warn', msg:`Mã đề nhận dạng được: ${detectedCode}, đề chọn: ${key.code}` });
  }
  if (!detectedSBD) scoreObj.flags.push({ type:'warn', msg:'Không đọc được SBD — phiếu tô chưa rõ' });

  const rec = {
    id: Date.now(), ts: new Date().toLocaleString('vi-VN'),
    keyId: key.id, keyName: key.name, keyCode: key.code,
    filename, sbd: detectedSBD, detectedCode,
    answers: detected, score: scoreObj.score, correct: scoreObj.correct,
    numQ: key.n, scale: key.scale,
    skipped: scoreObj.skipped, multi: scoreObj.multi,
    flags: scoreObj.flags,
    imgSrc: src
  };
  results.unshift(rec);
  saveLocal();
  setStep(6,'done');

  // Hiển thị kết quả
  renderScanResult(rec, key);
  cleanup(src_mat, gray, blurred, binary, warpedMat, warpedColor);
}

// ════════════════════════════════════════════════════════════════
//  ĐỊNH NGHĨA VÙNG (tọa độ %, chuẩn 800×1100)
// ════════════════════════════════════════════════════════════════
// Tọa độ vùng đọc khớp phieu_in.html, chuẩn ảnh đã kéo phẳng 800 x 1100.
// Chỉ dùng 4 ô neo góc; timing marks đã bị vô hiệu hóa để tránh nhiễu ô đen phụ.
const W = 800, H = 1100;

const REGION = {
  // Số báo danh: 6 cột x 10 hàng số 0-9.
  SBD: { name: 'SBD', x: 0.08, y: 0.18, w: 0.45, h: 0.25, cols: 6, rows: 10 },
  // Mã đề: 3 cột x 10 hàng số 0-9.
  CODE: { name: 'CODE', x: 0.62, y: 0.18, w: 0.25, h: 0.25, cols: 3, rows: 10 }
};

const ANSWER_REGIONS = [
  { name: 'ANS_1', from: 1,  to: 10, x: 0.08, y: 0.50, w: 0.39, h: 0.18 },
  { name: 'ANS_2', from: 11, to: 20, x: 0.53, y: 0.50, w: 0.39, h: 0.18 },
  { name: 'ANS_3', from: 21, to: 30, x: 0.08, y: 0.72, w: 0.39, h: 0.18 },
  { name: 'ANS_4', from: 31, to: 40, x: 0.53, y: 0.72, w: 0.39, h: 0.18 }
];

const REGION_MARKER = {
  searchPad: 28,
  innerGap: 9,
  minSize: 3,
  maxSize: 18
};

// ════════════════════════════════════════════════════════════════
//  TÌM 4 ĐIỂM NEO (ô vuông đen ở 4 góc)
// ════════════════════════════════════════════════════════════════
function findAnchorSquares(binMat, colorMat) {
  // ── Bước 1: Tìm contour như cũ ─────────────────────────────
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binMat.clone(), contours, hierarchy,
    cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const W = binMat.cols, H = binMat.rows;
  const candidates = [];

  for (let i = 0; i < contours.size(); i++) {
    const cnt  = contours.get(i);
    const area = cv.contourArea(cnt);
    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

    if (approx.rows === 4) {
      const minA = W * H * 0.0004;
      const maxA = W * H * 0.015;
      if (area > minA && area < maxA) {
        const rect = cv.boundingRect(cnt);
        const ratio = rect.width / rect.height;
        if (ratio > 0.6 && ratio < 1.6) {
          candidates.push({
            cx: rect.x + rect.width / 2,
            cy: rect.y + rect.height / 2,
            area, rect
          });
        }
      }
    }
    approx.delete(); cnt.delete();
  }
  contours.delete(); hierarchy.delete();

  // ── Bước 2: Đủ 4 anchors → chọn 4 góc ──────────────────────
  if (candidates.length >= 4) {
    const tl = candidates.sort((a,b) => (a.cx+a.cy)-(b.cx+b.cy))[0];
    const br = candidates.sort((a,b) => (b.cx+b.cy)-(a.cx+a.cy))[0];
    const tr = candidates.sort((a,b) => (b.cx-b.cy)-(a.cx-a.cy))[0];
    const bl = candidates.sort((a,b) => (a.cx-a.cy)-(b.cx-b.cy))[0];
    if (!tl || !br || !tr || !bl) return null;

    // Kiểm tra khoảng cách hợp lý (4 anchors phải cách nhau đủ xa)
    const minDist = Math.min(
      Math.hypot(br.cx - tl.cx, br.cy - tl.cy),
      Math.hypot(tl.cx - tr.cx, tr.cy - tl.cy),
      Math.hypot(br.cx - bl.cx, bl.cy - br.cy),
      Math.hypot(tr.cx - br.cx, tr.cy - br.cy)
    );
    if (minDist < W * 0.15) return null; // anchors quá gần nhau → có thể là nhiễu
    return { tl, tr, br, bl };
  }

  // ── Bước 3: Không đủ 4 → thử edge recovery ─────────────────
  if (candidates.length >= 2) {
    const recovered = tryEdgeRecovery(binMat, candidates);
    if (recovered) return recovered;
  }

  return null;
}

/**
 * Recovery bằng Canny + Hough Lines khi không tìm đủ 4 anchor squares
 */
function tryEdgeRecovery(binMat, existingAnchors) {
  const W = binMat.cols, H = binMat.rows;
  const edges = new cv.Mat();
  const lines = new cv.Mat();

  // Phát hiện cạnh mạnh
  cv.Canny(binMat.clone(), edges, 50, 150, 3, false);

  // Hough transform để tìm các đường thẳng (cạnh phiếu)
  cv.HoughLinesP(edges, lines, 1, Math.PI/180, 80, H*0.2, W*0.05);

  if (lines.rows < 4) { edges.delete(); lines.delete(); return null; }

  // Gom nhóm các đường thẳng → 4 cạnh biên của phiếu
  const verticals = [], horizontals = [];
  for (let i = 0; i < lines.rows; i++) {
    const p = lines.data32S.slice(i*4, i*4+4);
    const dx = p[2]-p[0], dy = p[3]-p[1];
    if (Math.abs(dx) < 10) {
      verticals.push({ x: (p[0]+p[2])/2, y1: Math.min(p[1],p[3]), y2: Math.max(p[1],p[3]) });
    } else if (Math.abs(dy) < 10) {
      horizontals.push({ y: (p[1]+p[3])/2, x1: Math.min(p[0],p[2]), x2: Math.max(p[0],p[2]) });
    }
  }
  edges.delete(); lines.delete();

  if (verticals.length < 2 || horizontals.length < 2) return null;

  // Lấy đường biên ngoài cùng (trái/phải/trên/dưới)
  const leftX   = Math.min(...verticals.map(v=>v.x));
  const rightX  = Math.max(...verticals.map(v=>v.x));
  const topY    = Math.min(...horizontals.map(h=>h.y));
  const bottomY = Math.max(...horizontals.map(h=>h.y));

  // Kiểm tra tỷ lệ hợp lý (A4 ~ 1:1.414)
  const width  = rightX - leftX;
  const height = bottomY - topY;
  const ratio  = height / width;
  if (ratio < 1.0 || ratio > 2.0) return null; // Phải gần A4

  // Gán tạm anchors = 4 góc từ edge, scale offset để lấy vùng trong của ô vuông
  const offset = Math.round(Math.min(width, height) * 0.03);
  const tl = { cx: leftX  + offset, cy: topY    + offset };
  const tr = { cx: rightX - offset, cy: topY    + offset };
  const br = { cx: rightX - offset, cy: bottomY - offset };
  const bl = { cx: leftX  + offset, cy: bottomY - offset };

  // Nếu có anchors cũ → blend với chúng để tăng độ chính xác
  if (existingAnchors.length > 0) {
    const blend = (a, b) => ({ cx: a.cx*0.6 + b.cx*0.4, cy: a.cy*0.6 + b.cy*0.4 });
    // Tìm anchor gần nhất cho mỗi góc
    const nearest = (corner) => existingAnchors.reduce((best, a) => {
      const d = Math.hypot(a.cx - corner.cx, a.cy - corner.cy);
      return d < best.dist ? { anchor: a, dist: d } : best;
    }, { anchor: null, dist: Infinity });

    const nTL = nearest(tl), nTR = nearest(tr), nBR = nearest(br), nBL = nearest(bl);
    if (nTL.anchor) return {
      tl: blend(nTL.anchor, tl),
      tr: nTR.anchor ? blend(nTR.anchor, tr) : tr,
      br: nBR.anchor ? blend(nBR.anchor, br) : br,
      bl: nBL.anchor ? blend(nBL.anchor, bl) : bl,
      recovered: true
    };
  }

  return { tl, tr, br, bl, recovered: true };
}

function perspectiveWarp(mat, anchors, dstW, dstH) {
  const {tl, tr, br, bl} = anchors;
  // Offset: lấy mép ngoài của ô vuông
  const margin = 5;
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.cx - margin, tl.cy - margin,
    tr.cx + margin, tr.cy - margin,
    br.cx + margin, br.cy + margin,
    bl.cx - margin, bl.cy + margin
  ]);
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, dstW, 0, dstW, dstH, 0, dstH
  ]);
  const M    = cv.getPerspectiveTransform(srcPts, dstPts);
  const warped = new cv.Mat();
  cv.warpPerspective(mat, warped, M, new cv.Size(dstW, dstH));
  srcPts.delete(); dstPts.delete(); M.delete();
  return warped;
}

function resizeMat(mat, dstW, dstH) {
  const out = new cv.Mat();
  cv.resize(mat, out, new cv.Size(dstW, dstH));
  return out;
}

/**
 * Phân tích ảnh grayscale — trả về brightness, contrast, stdDev
 */
function analyzeImageStats(grayMat) {
  const mean = new cv.Mat();
  const std  = new cv.Mat();
  cv.meanStdDev(grayMat, mean, std);
  const brightness = mean.data64F[0] / 255;
  const contrast   = std.data64F[0]  / 255;
  mean.delete(); std.delete();
  return { brightness, contrast };
}

/**
 * Chọn thông số adaptive threshold dựa trên đặc điểm ảnh
 */
function getAdaptiveParams(stats) {
  let blockSize, C, method;

  // Chọn method: Gaussian cho ảnh noise nhiều, Mean cho ảnh đơn giản
  method = stats.contrast > 0.15
    ? cv.ADAPTIVE_THRESH_GAUSSIAN_C
    : cv.ADAPTIVE_THRESH_MEAN_C;

  // Block size: ảnh lớn → block lớn hơn để bao phủ vùng sáng/tối
  if (stats.brightness < 0.3) {
    // Ảnh tối → block lớn, C nhỏ (nhạy hơn với vùng sáng)
    blockSize = 21; C = 5;
  } else if (stats.brightness > 0.7) {
    // Ảnh sáng → block lớn, C lớn (lọc nhiễu sáng)
    blockSize = 25; C = 12;
  } else if (stats.contrast < 0.1) {
    // Ảnh mờ (low contrast) → block nhỏ hơn, C nhỏ
    blockSize = 11; C = 4;
  } else {
    // Default: medium contrast/brightness
    blockSize = 15; C = 8;
  }

  // Luôn dùng số lẻ cho blockSize
  if (blockSize % 2 === 0) blockSize++;
  if (blockSize < 3) blockSize = 3;

  return { blockSize, C, method };
}

/**
 * Phân tích chất lượng binary — trả về điểm số (0-1)
 * Dùng để so sánh giữa các phương pháp threshold
 */
function scoreBinaryQuality(binaryMat) {
  const total = binaryMat.rows * binaryMat.cols;
  const white = cv.countNonZero(binaryMat);
  const blackRatio = (total - white) / total;

  // Ảnh tốt: khoảng 5-40% đen (vùng in + bubble), không quá nhiều noise
  const score = blackRatio > 0.02 && blackRatio < 0.6
    ? Math.min(blackRatio / 0.3, 1) * Math.min((0.5 - blackRatio) / 0.3, 1)
    : 0;
  return score;
}

// ════════════════════════════════════════════════════════════════
//  ĐỌC TIMING MARKS — legacy, không dùng với mẫu phiếu hiện tại.
//  Mẫu mới chỉ có 4 ô neo góc; mọi marker đen phụ bị loại bỏ để tránh nhiễu.
// ════════════════════════════════════════════════════════════════

/**
 * Quét 1 cột dọc theo cạnh (xStart..xEnd) từ y0 đến y1,
 * trả về mảng các {yCenter, height} của mỗi vạch đen tìm được.
 */
function scanTimingColumn(binMat, xStart, xEnd, y0, y1) {
  const marks = [];
  let inMark   = false;
  let markStart = 0;
  const xW = xEnd - xStart;

  for (let y = y0; y <= y1; y++) {
    // Lấy mật độ trung bình theo chiều ngang của dải này
    const density = sampleDark(binMat, xStart, y, xW, 1);
    if (density > 0.35) {
      if (!inMark) { inMark = true; markStart = y; }
    } else {
      if (inMark) {
        inMark = false;
        const h = y - markStart;
        if (h >= 3 && h <= 30) { // lọc nhiễu: vạch hợp lệ 3-30px
          marks.push({ yCenter: markStart + h / 2, height: h });
        }
      }
    }
  }
  // Đóng mark cuối nếu chạm đáy
  if (inMark) {
    const h = y1 - markStart;
    if (h >= 3 && h <= 30) marks.push({ yCenter: markStart + h / 2, height: h });
  }
  return marks;
}

/**
 * Lấy timing marks từ cạnh trái (x=0..TM_WIDTH) trong vùng Y cho trước.
 * Nếu tìm đủ `expectedCount` vạch → trả về mảng Y tâm.
 * Nếu không tìm được → trả về null (dùng fallback tọa độ %).
 */
const TM_WIDTH = Math.round(W * 0.07); // ~7% chiều rộng = vùng timing marks

function getTimingYs(binMat, y0, y1, expectedCount, side) {
  // Mẫu phiếu hiện tại không in timing marks; luôn dùng lưới tọa độ cố định.
  return null;
}

// ════════════════════════════════════════════════════════════════
//  ĐỌC BONG BÓNG SỐ (SBD / Mã đề) — có timing marks hỗ trợ
//  cols × 10 hàng, mỗi hàng là chữ số 0-9
// ════════════════════════════════════════════════════════════════
function getAnswerRegions(numQ) {
  const panelCount = Math.min(ANSWER_REGIONS.length, Math.ceil(numQ / 10));
  return ANSWER_REGIONS.slice(0, panelCount).map((region, index) => ({
    ...region,
    from: index * 10 + 1,
    to: Math.min((index + 1) * 10, numQ)
  }));
}

function regionToPx(region, pad = 0) {
  const x = Math.max(0, Math.round(region.x * W) - pad);
  const y = Math.max(0, Math.round(region.y * H) - pad);
  const r = Math.min(W, Math.round((region.x + region.w) * W) + pad);
  const b = Math.min(H, Math.round((region.y + region.h) * H) + pad);
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, b - y) };
}

function normalizeRegionRect(rect, fallback) {
  return {
    ...fallback,
    x: rect.x / W,
    y: rect.y / H,
    w: rect.w / W,
    h: rect.h / H,
    detected: true
  };
}

function findSmallSquareMarkers(binMat, expectedRegion) {
  const search = regionToPx(expectedRegion, REGION_MARKER.searchPad);
  const roi = binMat.roi(new cv.Rect(search.x, search.y, search.w, search.h));
  const work = roi.clone();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const markers = [];

  cv.findContours(work, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const rect = cv.boundingRect(cnt);
    const area = cv.contourArea(cnt);
    const ratio = rect.width / Math.max(1, rect.height);
    const sizeOk =
      rect.width >= REGION_MARKER.minSize &&
      rect.height >= REGION_MARKER.minSize &&
      rect.width <= REGION_MARKER.maxSize &&
      rect.height <= REGION_MARKER.maxSize;
    const squareOk = ratio >= 0.65 && ratio <= 1.55;

    if (sizeOk && squareOk && area >= 6) {
      const gx = search.x + rect.x;
      const gy = search.y + rect.y;
      const fill = sampleFillRatio(binMat, gx, gy, rect.width, rect.height);
      if (fill > 0.55) {
        markers.push({
          cx: gx + rect.width / 2,
          cy: gy + rect.height / 2,
          size: (rect.width + rect.height) / 2,
          rect: { x: gx, y: gy, w: rect.width, h: rect.height }
        });
      }
    }
    cnt.delete();
  }

  roi.delete();
  work.delete();
  contours.delete();
  hierarchy.delete();
  return markers;
}

function pickCornerMarkers(markers, fallback) {
  if (markers.length < 4) return null;

  const base = regionToPx(fallback, 0);
  const targets = {
    tl: { x: base.x, y: base.y },
    tr: { x: base.x + base.w, y: base.y },
    bl: { x: base.x, y: base.y + base.h },
    br: { x: base.x + base.w, y: base.y + base.h }
  };
  const picked = {};
  const used = new Set();

  for (const [corner, target] of Object.entries(targets)) {
    const ranked = markers
      .map((marker, idx) => ({ marker, idx, dist: Math.hypot(marker.cx - target.x, marker.cy - target.y) }))
      .filter(item => !used.has(item.idx))
      .sort((a, b) => a.dist - b.dist);
    if (!ranked.length || ranked[0].dist > REGION_MARKER.searchPad * 1.8) return null;
    picked[corner] = ranked[0].marker;
    used.add(ranked[0].idx);
  }

  return picked;
}

function detectRegionFromMarkers(binMat, fallback) {
  const markers = findSmallSquareMarkers(binMat, fallback);
  const corners = pickCornerMarkers(markers, fallback);
  if (!corners) return { ...fallback, detected: false };

  const left = (corners.tl.cx + corners.bl.cx) / 2 + REGION_MARKER.innerGap;
  const right = (corners.tr.cx + corners.br.cx) / 2 - REGION_MARKER.innerGap;
  const top = (corners.tl.cy + corners.tr.cy) / 2 + REGION_MARKER.innerGap;
  const bottom = (corners.bl.cy + corners.br.cy) / 2 - REGION_MARKER.innerGap;
  const rect = {
    x: Math.max(0, Math.round(left)),
    y: Math.max(0, Math.round(top)),
    w: Math.round(right - left),
    h: Math.round(bottom - top)
  };
  const expected = regionToPx(fallback, 0);
  const valid =
    rect.w > expected.w * 0.6 &&
    rect.h > expected.h * 0.6 &&
    rect.w < expected.w * 1.4 &&
    rect.h < expected.h * 1.4;

  return valid ? normalizeRegionRect(rect, fallback) : { ...fallback, detected: false };
}

function detectOmrRegions(binMat, numQ) {
  return {
    SBD: detectRegionFromMarkers(binMat, REGION.SBD),
    CODE: detectRegionFromMarkers(binMat, REGION.CODE),
    ANSWERS: getAnswerRegions(numQ).map(region => detectRegionFromMarkers(binMat, region))
  };
}

function readBubbleNumber(binMat, region, numCols) {
  const { x, y, w, h, cols, rows } = region;
  const X0 = Math.round(x * W), Y0 = Math.round(y * H);
  const RW  = Math.round(w * W), RH  = Math.round(h * H);
  const labelW = Math.round(RW * 0.18);
  const bubbleX0 = X0 + labelW;
  const bubbleW = RW - labelW;
  const cellW = bubbleW / cols;
  const cellH = RH / rows;

  // Không dùng timing marks; mẫu phiếu mới chỉ có 4 ô neo góc.
  const tmYs = null;

  let result = '';
  for (let c = 0; c < cols; c++) {
    let maxDark = -1, picked = -1;
    for (let r = 0; r < rows; r++) {
      const cx0 = bubbleX0 + Math.round(c * cellW + cellW * 0.1);
      // Dùng timing mark Y nếu có, ngược lại dùng tọa độ % như cũ
      const rowY = tmYs
        ? tmYs[r] - Math.round(cellH * 0.4)
        : Y0 + Math.round(r * cellH);
      const dark = sampleFillRatio(binMat, cx0, rowY,
        Math.round(cellW * 0.8), Math.round(cellH * 0.8));
      if (dark > maxDark) { maxDark = dark; picked = r; }
    }
    if (maxDark > 0.06) result += String(picked);
    else result += '?';
  }
  return result;
}

// ════════════════════════════════════════════════════════════════
//  ĐỌC CÂU TRẢ LỜI — có timing marks hỗ trợ
// ════════════════════════════════════════════════════════════════
function readAnswerBubbles(binMat, numQ, answerRegions = getAnswerRegions(numQ)) {
  const answers = {};
  const flags   = [];

  for (const panel of answerRegions) {
    const { x, y, w, h } = panel;
    const X0  = Math.round(x * W), Y0  = Math.round(y * H);
    const PW  = Math.round(w * W), PH  = Math.round(h * H);
    const nQ  = panel.to - panel.from + 1;
    const cellH = PH / nQ;
    const ansX0 = X0 + Math.round(PW * 0.28);
    const ansW  = Math.round(PW * 0.72);

    // Không dùng timing marks; đọc theo lưới cố định của REGION.
    const tmYs = null;

    for (let r = 0; r < nQ; r++) {
      const q = panel.from + r;

      // Y tâm của hàng: dùng timing mark nếu có
      let rowCenterY;
      if (tmYs) {
        rowCenterY = tmYs[r];
      } else {
        rowCenterY = Y0 + Math.round(r * cellH + cellH * 0.5);
      }
      const cy0  = rowCenterY - Math.round(cellH * 0.42);
      const cHgt = Math.round(cellH * 0.84);
      const cellW = ansW / 4;

      const darks = [];
      for (let col = 0; col < 4; col++) {
        const cx0 = ansX0 + Math.round(col * cellW + cellW * 0.1);
        const cwd = Math.round(cellW * 0.8);
        darks.push(sampleFillRatio(binMat, cx0, cy0, cwd, cHgt));
      }

      // Local threshold: so sánh với baseline của hàng này
      // baseline = trung vị của 4 options (giả định có 1-2 ô tô)
      const sortedDarks = [...darks].sort((a,b) => a - b);
      const median = sortedDarks[1]; // trung vị
      const threshold = Math.max(0.07, median * 1.8, 0.10);

      const filled = darks.map((d,i) => ({
        i, d,
        ok: d >= threshold,
        ratio: d // fill ratio đã chuẩn hóa
      })).filter(b => b.ok);

      if (filled.length === 0) {
        answers[q] = '?';
        flags.push({ type:'warn', msg:`Câu ${q}: bỏ trống` });
      } else if (filled.length > 1) {
        // Multi-select: ưu tiên ô có fill ratio cao nhất
        const best = filled.sort((a,b) => b.d - a.d)[0];
        const bestRatio = best.d;
        // Nếu ô tốt nhất vượt trội rõ ràng (>1.5x) → chọn nó
        const secondBest = filled.length > 1
          ? filled.sort((a,b) => b.d - a.d)[1].d
          : 0;
        if (bestRatio > secondBest * 1.5 && secondBest > 0) {
          answers[q] = OPTS[best.i];
          flags.push({ type:'warn', msg:`Câu ${q}: tô nhiều ô (chọn: ${OPTS[best.i]}, đen ${(bestRatio*100).toFixed(0)}%)` });
        } else {
          answers[q] = OPTS[best.i];
          flags.push({ type:'danger', msg:`Câu ${q}: tô ${filled.length} ô (chọn: ${OPTS[best.i]})` });
        }
      } else {
        answers[q] = OPTS[filled[0].i];
        if (filled[0].d < 0.12) {
          flags.push({ type:'warn', msg:`Câu ${q}: tô mờ (${(filled[0].d*100).toFixed(0)}% độ đen)` });
        }
      }
    }
  }
  return { answers, flags };
}

// ════════════════════════════════════════════════════════════════
//  CHẤM ĐIỂM
// ════════════════════════════════════════════════════════════════
function gradeAnswers(detected, key) {
  let correct = 0, skipped = 0, multi = 0;
  const flags = [];
  const n = key.n;

  for (let i = 1; i <= n; i++) {
    const got = detected[i] || '?';
    const exp = key.a[i];
    if (got === '?') skipped++;
    else if (got === exp) correct++;
  }

  const score = +(correct / n * key.scale).toFixed(1);
  return { score, correct, skipped, multi, flags };
}

// ════════════════════════════════════════════════════════════════
//  HIỂN THỊ KẾT QUẢ PHIẾU VỪA CHẤM
// ════════════════════════════════════════════════════════════════
function renderScanResult(rec, key) {
  const pct = rec.score / rec.scale;
  const scoreClass = pct >= 0.8 ? '' : pct >= 0.5 ? 'warn' : 'fail';
  const wrong = rec.numQ - rec.correct - rec.skipped;

  let bubblesHtml = '<div class="ans-sheet">';
  for (let i = 1; i <= rec.numQ; i++) {
    const got = rec.answers[i] || '?';
    const exp = key.a[i];
    bubblesHtml += `<div class="as-row">
      <span class="as-num">${i}.</span>
      <div class="as-bubbles">`;
    OPTS.forEach(o => {
      let cls = '';
      if (o === got && got === exp)  cls = 'filled-correct';
      else if (o === got && got !== exp) cls = 'filled-wrong';
      else if (o === exp && got !== exp) cls = 'key-missed';
      bubblesHtml += `<div class="ab ${cls} clickable"
        onclick="correctAnswer(${rec.id},${i},'${o}')"
        title="Sửa câu ${i} thành ${o}">${o}</div>`;
    });
    bubblesHtml += '</div></div>';
  }
  bubblesHtml += '</div>';

  const flagsHtml = rec.flags.length
    ? `<div class="flag-row">${rec.flags.map(f =>
        `<span class="flag ${f.type}">${f.msg}</span>`).join('')}</div>`
    : '';

  document.getElementById('scanResult').innerHTML = `
    <div class="result-card">
      <div class="rc-header">
        <div class="rc-score-box ${scoreClass}">
          <div class="rc-score-num">${rec.score}</div>
          <div class="rc-score-den">/ ${rec.scale}</div>
        </div>
        <div class="rc-info">
          <h3>${rec.keyName} · Mã đề ${rec.keyCode}</h3>
          <div class="rc-meta">
            SBD nhận dạng: <b>${rec.sbd || '—'}</b><br>
            Đúng: <span class="text-green"><b>${rec.correct}</b></span> ·
            Sai: <span class="text-red"><b>${wrong}</b></span> ·
            Bỏ trống: <span class="text-amber"><b>${rec.skipped}</b></span><br>
            ${rec.ts}
          </div>
        </div>
      </div>
      ${flagsHtml}
      <p class="card-title" style="margin-top:.75rem">
        Chi tiết từng câu <small style="font-weight:normal;color:var(--text3)">— click vào ô để sửa</small>
      </p>
      ${bubblesHtml}
      <div class="btn-row" style="margin-top:.75rem">
        <button class="btn" onclick="goTab('results')">📋 Xem tất cả kết quả</button>
        <button class="btn accent" onclick="document.getElementById('scanResult').innerHTML=''">✨ Chấm tiếp</button>
      </div>
    </div>`;
}

/**
 * Sửa đáp án trực tiếp trên UI — cập nhật kết quả và tính lại điểm
 */
function correctAnswer(recId, qNum, newOpt) {
  const rec = results.find(r => r.id === recId);
  if (!rec) return;
  const key = keys.find(k => k.id === rec.keyId);
  if (!key) return;

  rec.answers[qNum] = newOpt;

  let correct = 0, skipped = 0;
  for (let i = 1; i <= rec.numQ; i++) {
    const got = rec.answers[i] || '?';
    const exp = key.a[i];
    if (got === '?') skipped++;
    else if (got === exp) correct++;
  }
  rec.correct = correct;
  rec.skipped = skipped;
  rec.score = +(correct / rec.numQ * rec.scale).toFixed(1);

  saveLocal();
  renderCorrectedResult(rec, key);
}

/**
 * Render lại kết quả sau khi sửa
 */
function renderCorrectedResult(rec, key) {
  const pct = rec.score / rec.scale;
  const scoreClass = pct >= 0.8 ? '' : pct >= 0.5 ? 'warn' : 'fail';
  const wrong = rec.numQ - rec.correct - rec.skipped;

  let bubblesHtml = '<div class="ans-sheet">';
  for (let i = 1; i <= rec.numQ; i++) {
    const got = rec.answers[i] || '?';
    const exp = key.a[i];
    bubblesHtml += `<div class="as-row">
      <span class="as-num">${i}.</span>
      <div class="as-bubbles">`;
    OPTS.forEach(o => {
      let cls = '';
      if (o === got && got === exp)  cls = 'filled-correct';
      else if (o === got && got !== exp) cls = 'filled-wrong';
      else if (o === exp && got !== exp) cls = 'key-missed';
      bubblesHtml += `<div class="ab ${cls} clickable"
        onclick="correctAnswer(${rec.id},${i},'${o}')"
        title="Sửa câu ${i} thành ${o}">${o}</div>`;
    });
    bubblesHtml += '</div></div>';
  }
  bubblesHtml += '</div>';

  document.getElementById('scanResult').innerHTML = `
    <div class="result-card">
      <div class="rc-header">
        <div class="rc-score-box ${scoreClass}">
          <div class="rc-score-num">${rec.score}</div>
          <div class="rc-score-den">/ ${rec.scale}</div>
        </div>
        <div class="rc-info">
          <h3>${rec.keyName} · Mã đề ${rec.keyCode}</h3>
          <div class="rc-meta">
            SBD nhận dạng: <b>${rec.sbd || '—'}</b><br>
            Đúng: <span class="text-green"><b>${rec.correct}</b></span> ·
            Sai: <span class="text-red"><b>${wrong}</b></span> ·
            Bỏ trống: <span class="text-amber"><b>${rec.skipped}</b></span><br>
            ${rec.ts} <span style="color:var(--accent);font-size:11px">· Đã chỉnh sửa</span>
          </div>
        </div>
      </div>
      <p class="card-title" style="margin-top:.75rem">
        Chi tiết từng câu <small style="font-weight:normal;color:var(--text3)">— click vào ô để sửa</small>
      </p>
      ${bubblesHtml}
      <div class="btn-row" style="margin-top:.75rem">
        <button class="btn" onclick="goTab('results')">📋 Xem tất cả kết quả</button>
        <button class="btn accent" onclick="document.getElementById('scanResult').innerHTML=''">✨ Chấm tiếp</button>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  TAB 3 — KẾT QUẢ
// ════════════════════════════════════════════════════════════════
function populateExamFilter() {
  const sel = document.getElementById('filterExam');
  const cur = sel.value;
  const names = [...new Set(results.map(r => r.keyName))];
  sel.innerHTML = '<option value="">Tất cả đề</option>' +
    names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (cur) sel.value = cur;
}

function renderResults() {
  const q    = document.getElementById('filterName').value.toLowerCase();
  const exam = document.getElementById('filterExam').value;
  let data   = results;
  if (q)    data = data.filter(r => r.sbd.includes(q) || r.keyName.toLowerCase().includes(q));
  if (exam) data = data.filter(r => r.keyName === exam);

  document.getElementById('resultCount').textContent = data.length;

  if (!data.length) {
    document.getElementById('resultTable').innerHTML =
      '<p style="font-size:12px;color:var(--text3);padding:1rem 0;text-align:center">Chưa có kết quả</p>';
    return;
  }

  document.getElementById('resultTable').innerHTML = `
    <table class="rtable">
      <thead><tr>
        <th style="width:30px"><input type="checkbox" id="selAllChk" onchange="toggleSelectAll(this.checked)"></th>
        <th>SBD</th><th>Bài kiểm tra</th><th>Mã đề</th>
        <th>Kết quả</th><th>Điểm</th><th>Thời gian</th><th></th>
      </tr></thead>
      <tbody>${data.map(r => {
        const pct = r.score / r.scale;
        const sc  = pct>=.8?'good':pct>=.5?'mid':'low';
        const wr  = r.numQ - r.correct - r.skipped;
        return `<tr data-id="${r.id}">
          <td><input type="checkbox" class="row-chk" onchange="onRowCheckboxChange()"></td>
          <td><b>${r.sbd || '—'}</b></td>
          <td>${r.keyName}</td>
          <td>${r.keyCode}</td>
          <td style="font-size:11px">${r.correct}✓ ${wr}✗ ${r.skipped}○</td>
          <td><span class="score-chip ${sc}">${r.score}/${r.scale}</span></td>
          <td style="font-size:11px;color:var(--text3)">${r.ts}</td>
          <td><button class="btn danger" style="padding:3px 8px;font-size:11px"
            onclick="deleteResult(${r.id})">🗑</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  onRowCheckboxChange();
}

function onRowCheckboxChange() {
  const checked = document.querySelectorAll('.row-chk:checked').length;
  const total   = document.querySelectorAll('.row-chk').length;
  const btn     = document.getElementById('delSelectedBtn');
  if (btn) {
    btn.style.display = checked > 0 ? '' : 'none';
    document.getElementById('selectedCount').textContent = checked;
  }
  const selAll = document.getElementById('selAllChk');
  if (selAll) {
    selAll.checked = checked > 0 && checked === total;
    selAll.indeterminate = checked > 0 && checked < total;
  }
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.row-chk').forEach(c => c.checked = checked);
  onRowCheckboxChange();
}

function deleteSelectedResults() {
  const ids = [...document.querySelectorAll('.row-chk:checked')]
    .map(c => +c.closest('tr').dataset.id);
  if (!ids.length) return;
  if (!confirm(`Xóa ${ids.length} kết quả đã chọn?`)) return;
  results = results.filter(r => !ids.includes(r.id));
  saveLocal(); renderResults();
}

function deleteResult(id) {
  if (!confirm('Xóa kết quả này?')) return;
  results = results.filter(r => r.id !== id);
  saveLocal(); renderResults();
}

// ════════════════════════════════════════════════════════════════
//  TAB 4 — THỐNG KÊ
// ════════════════════════════════════════════════════════════════
function populateStatsSelect() {
  const sel = document.getElementById('statsExamSelect');
  const cur = sel.value;
  const names = [...new Set(results.map(r => r.keyName))];
  sel.innerHTML = '<option value="">— Tất cả —</option>' +
    names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (cur) sel.value = cur;
}

function renderStats() {
  const exam = document.getElementById('statsExamSelect').value;
  let data   = exam ? results.filter(r => r.keyName === exam) : results;
  const el   = document.getElementById('statsContent');

  if (!data.length) {
    el.innerHTML = '<div class="card"><p style="color:var(--text3);font-size:12px;text-align:center;padding:1rem">Chưa có dữ liệu</p></div>';
    return;
  }

  const scores  = data.map(r => r.score / r.scale * 10);
  const avg     = scores.reduce((s,v)=>s+v,0)/scores.length;
  const maxS    = Math.max(...scores);
  const minS    = Math.min(...scores);
  const passRate = (scores.filter(s=>s>=5).length / scores.length * 100).toFixed(0);

  // Phổ điểm (0-1, 1-2, …, 9-10)
  const dist = Array(10).fill(0);
  scores.forEach(s => { dist[Math.min(9, Math.floor(s))]++; });
  const maxD = Math.max(...dist, 1);

  // Tỷ lệ đúng từng câu
  const key = keys.find(k => data.some(r => r.keyId === k.id));
  let qStatsHtml = '';
  if (key) {
    qStatsHtml = `
      <div class="card">
        <p class="card-title">Tỷ lệ đúng từng câu</p>
        <table class="q-stat-table">
          <thead><tr><th>Câu</th><th>Đáp án</th><th>% đúng</th><th></th></tr></thead>
          <tbody>${Array.from({length:key.n},(_,i)=>i+1).map(q => {
            const total  = data.filter(r => r.answers[q] !== undefined).length;
            const cOk    = data.filter(r => r.answers[q] === key.a[q]).length;
            const pct    = total > 0 ? (cOk/total*100) : 0;
            const cls    = pct>=70?'':'pct<40?low:mid';
            return `<tr>
              <td>${q}</td>
              <td><b>${key.a[q]||'?'}</b></td>
              <td>${pct.toFixed(0)}%</td>
              <td><div class="bar-wrap"><div class="bar-fill ${pct<40?'low':pct<70?'mid':''}"
                style="width:${pct}%"></div></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  el.innerHTML = `
    <div class="card">
      <p class="card-title">Tổng quan · ${data.length} bài</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="sv">${avg.toFixed(1)}</div><div class="sl">Điểm trung bình</div></div>
        <div class="stat-box"><div class="sv">${passRate}%</div><div class="sl">Tỷ lệ đạt (≥5)</div></div>
        <div class="stat-box"><div class="sv">${maxS.toFixed(1)}</div><div class="sl">Điểm cao nhất</div></div>
        <div class="stat-box"><div class="sv">${minS.toFixed(1)}</div><div class="sl">Điểm thấp nhất</div></div>
      </div>
    </div>
    <div class="card">
      <p class="card-title">Phổ điểm</p>
      <div class="score-dist">
        ${dist.map((cnt,i) => `
          <div class="sd-col">
            <div class="sd-bar" style="height:${Math.round(cnt/maxD*64)+2}px"
              title="${cnt} bài"></div>
            <div class="sd-label">${i}-${i+1}</div>
          </div>`).join('')}
      </div>
    </div>
    ${qStatsHtml}`;
}

// ════════════════════════════════════════════════════════════════
//  XUẤT DỮ LIỆU
// ════════════════════════════════════════════════════════════════
function exportCSV() {
  if (!results.length) { alert('Chưa có dữ liệu.'); return; }
  const header = 'SBD,Tên bài,Mã đề,Đúng,Sai,Bỏ trống,Điểm,Thang,Thời gian';
  const rows   = results.map(r => {
    const wr = r.numQ - r.correct - r.skipped;
    return `"${r.sbd}","${r.keyName}","${r.keyCode}",${r.correct},${wr},${r.skipped},${r.score},${r.scale},"${r.ts}"`;
  });
  download('\uFEFF'+[header,...rows].join('\n'), 'ket-qua-cham-thi.csv', 'text/csv');
}

function exportExcel() {
  // Xuất HTML table mà Excel có thể mở
  if (!results.length) { alert('Chưa có dữ liệu.'); return; }
  const rows = results.map(r => {
    const wr = r.numQ - r.correct - r.skipped;
    return `<tr><td>${r.sbd}</td><td>${r.keyName}</td><td>${r.keyCode}</td>
      <td>${r.correct}</td><td>${wr}</td><td>${r.skipped}</td>
      <td>${r.score}</td><td>${r.scale}</td><td>${r.ts}</td></tr>`;
  }).join('');
  const html = `<table><thead><tr>
    <th>SBD</th><th>Tên bài</th><th>Mã đề</th>
    <th>Đúng</th><th>Sai</th><th>Bỏ trống</th>
    <th>Điểm</th><th>Thang</th><th>Thời gian</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
  download('\uFEFF'+html, 'ket-qua-cham-thi.xls', 'application/vnd.ms-excel');
}

function download(content, filename, mime) {
  const a = document.createElement('a');
  a.href  = URL.createObjectURL(new Blob([content], {type: mime}));
  a.download = filename; a.click();
}

// ════════════════════════════════════════════════════════════════
//  TIỆN ÍCH
// ════════════════════════════════════════════════════════════════

/** Đếm mật độ pixel đen (giá trị 255 trong ảnh nhị phân đã inv) */
function sampleDark(mat, x0, y0, w, h) {
  const x1 = Math.min(mat.cols-1, x0+w);
  const y1 = Math.min(mat.rows-1, y0+h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const roi  = mat.roi(new cv.Rect(x0, y0, x1-x0, y1-y0));
  const mn   = cv.mean(roi);
  roi.delete();
  // mean[0] là giá trị TB kênh grayscale (0-255), chia 255 → 0-1
  return mn[0] / 255;
}

/**
 * Đếm tỷ lệ pixel đen trong vùng ROI (fill ratio)
 * Chính xác hơn grayscale mean vì dùng countNonZero trên ảnh nhị phân
 */
function sampleFillRatio(binMat, x0, y0, w, h) {
  const x1 = Math.min(binMat.cols-1, Math.max(x0, x0+w));
  const y1 = Math.min(binMat.rows-1, Math.max(y0, y0+h));
  const rw = x1 - x0, rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return 0;
  const roi = binMat.roi(new cv.Rect(x0, y0, rw, rh));
  const total = rw * rh;
  const black = cv.countNonZero(roi);
  roi.delete();
  return black / total;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function matToCanvas(mat) {
  const c = document.createElement('canvas');
  c.width = mat.cols; c.height = mat.rows;
  cv.imshow(c, mat);
  return c;
}

function addPreview(container, canvas, label) {
  const scale = 140 / canvas.height;
  canvas.style.height = '140px';
  canvas.style.width  = Math.round(canvas.width * scale) + 'px';
  const div = document.createElement('div');
  div.className = 'pv-item';
  div.appendChild(canvas);
  div.innerHTML += `<p>${label}</p>`;
  container.appendChild(div);
}

function drawAnchorDebug(mat, anchors) {
  const debug = mat.clone();
  Object.values(anchors).filter(a => a && typeof a.cx === 'number').forEach(a => {
    cv.circle(debug, new cv.Point(a.cx, a.cy), 12, [0,255,0,255], 3);
  });
  return matToCanvas(debug);
}

function drawAnswerDebug(mat, numQ, answerRegions = getAnswerRegions(numQ)) {
  const debug = mat.clone();
  answerRegions.forEach(p => {
    const { x, y, w, h } = p;
    const nQ = p.to - p.from + 1;
    const X0 = Math.round(x*W), Y0 = Math.round(y*H);
    const PW = Math.round(w*W), PH = Math.round(h*H);
    const color = p.detected ? [0,200,0,255] : [240,160,0,255];
    cv.rectangle(debug, new cv.Point(X0,Y0), new cv.Point(X0+PW,Y0+PH), color, 2);
    const cellH = PH / nQ;
    const ansX0 = X0 + Math.round(PW*0.28);
    const ansW  = Math.round(PW*0.72);
    for (let r = 0; r < nQ; r++) {
      const cy0 = Y0 + Math.round(r*cellH+cellH*0.08);
      const cH  = Math.round(cellH*0.84);
      for (let col = 0; col < 4; col++) {
        const cx0 = ansX0 + Math.round(col * ansW/4 + ansW/4*0.1);
        const cW  = Math.round(ansW/4*0.8);
        cv.rectangle(debug, new cv.Point(cx0,cy0), new cv.Point(cx0+cW,cy0+cH), [200,0,0,255], 1);
      }
    }
  });
  const out = matToCanvas(debug);
  debug.delete();
  return out;
}

function cleanup(...mats) {
  mats.forEach(m => { try { if(m) m.delete(); } catch{} });
}

function setMsg(elId, spec) {
  const [type, ...rest] = spec.split('|');
  const el = document.getElementById(elId);
  if (el) el.innerHTML = `<div class="msg ${type}">${rest.join('|')}</div>`;
}

function showScanMsg(type, text) {
  document.getElementById('scanResult').innerHTML =
    `<div class="msg ${type}" style="margin-top:.5rem">${text}</div>`;
}

// ── PERSIST ──────────────────────────────────────────────────
function saveLocal() {
  try {
    localStorage.setItem('omr_keys',    JSON.stringify(keys));
    localStorage.setItem('omr_results', JSON.stringify(results.slice(0, 500)));
  } catch(e) { console.warn('localStorage full', e); }
}

// ── INIT ─────────────────────────────────────────────────────
renderSavedKeys();
populateScanKeySelect();
populateExamFilter();
populateStatsSelect();
