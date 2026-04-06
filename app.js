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
  const code  = document.getElementById('exam-code').value.trim() || '001';
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

  // ── Bước 1: Tiền xử lý ────────────────────────────────────
  setStep(1,'active');
  let src_mat, gray, blurred, binary;
  try {
    src_mat = cv.imread(imageToCanvas(img));
    gray    = new cv.Mat();
    blurred = new cv.Mat();
    binary  = new cv.Mat();

    cv.cvtColor(src_mat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5,5), 0);
    // Adaptive threshold — chịu được ánh sáng không đều
    cv.adaptiveThreshold(blurred, binary, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 8);

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
      addPreview(prevRow, drawAnchorDebug(src_mat, anchors), 'Điểm neo');
      setStep(2,'done');
      // ── Bước 3: Kéo phẳng ─────────────────────────────────
      setStep(3,'active');
      warpedMat   = perspectiveWarp(binary,   anchors, 800, 1100);
      warpedColor = perspectiveWarp(src_mat,  anchors, 800, 1100);
      addPreview(prevRow, matToCanvas(warpedColor), 'Sau kéo phẳng');
      setStep(3,'done');
    } else {
      // Không tìm được neo → dùng toàn bộ ảnh, resize về chuẩn
      setStep(2,'warn');
      warpedMat   = resizeMat(binary,   800, 1100);
      warpedColor = resizeMat(src_mat,  800, 1100);
      addPreview(prevRow, matToCanvas(warpedColor), '⚠ Không tìm neo');
      setStep(3,'warn');
    }
  } catch(e) {
    setStep(2,'warn');
    warpedMat   = resizeMat(binary,   800, 1100);
    warpedColor = resizeMat(src_mat,  800, 1100);
    setStep(3,'warn');
  }

  // ── Bước 4: Đọc SBD + Mã đề từ vùng bong bóng số ─────────
  setStep(4,'active');
  let detectedSBD  = '';
  let detectedCode = '';
  try {
    detectedSBD  = readBubbleNumber(warpedMat, REGION.SBD,  6);
    detectedCode = readBubbleNumber(warpedMat, REGION.CODE, 3);
    setStep(4,'done');
  } catch(e) {
    setStep(4,'warn');
  }

  // ── Bước 5: Nhận dạng câu trả lời ─────────────────────────
  setStep(5,'active');
  let detected = {};
  const flags  = [];
  try {
    const result = readAnswerBubbles(warpedMat, key.n);
    detected = result.answers;
    result.flags.forEach(f => flags.push(f));
    addPreview(prevRow, drawAnswerDebug(warpedColor, key.n), 'Vùng nhận dạng');
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
// Dựa trên mẫu phiếu: SBD 6 cột số 0-9, CODE 3 cột, vùng 20 câu 2 panel
const W = 800, H = 1100;

const REGION = {
  // Số báo danh: ô vuông 6 cột × 10 hàng (số 0-9)
  // Ước lượng từ mẫu phiếu (~12–42% chiều rộng, ~22–50% chiều cao)
  SBD: {
    x: 0.12, y: 0.22, w: 0.30, h: 0.28,
    cols: 6, rows: 10
  },
  // Mã đề: 3 cột × 10 hàng (bên phải SBD)
  CODE: {
    x: 0.55, y: 0.22, w: 0.15, h: 0.28,
    cols: 3, rows: 10
  },
  // Vùng trả lời: 2 panel (trái Q1→half, phải Q(half+1)→n)
  ANS_LEFT: {
    x: 0.04, y: 0.54, w: 0.44, h: 0.44
  },
  ANS_RIGHT: {
    x: 0.52, y: 0.54, w: 0.44, h: 0.44
  }
};

// ════════════════════════════════════════════════════════════════
//  TÌM 4 ĐIỂM NEO (ô vuông đen ở 4 góc) — robust version
// ════════════════════════════════════════════════════════════════
function findAnchorSquares(binMat, colorMat) {
  const IW = binMat.cols, IH = binMat.rows;

  // Thử tìm anchor trên ảnh gốc, nếu không được thì dilate để nối nét đứt
  for (let pass = 0; pass < 2; pass++) {
    let workMat = binMat;
    let dilated = null;
    if (pass === 1) {
      dilated = new cv.Mat();
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3,3));
      cv.dilate(binMat, dilated, kernel);
      kernel.delete();
      workMat = dilated;
    }

    const contours  = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(workMat.clone(), contours, hierarchy,
      cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates = [];
    const minA = IW * IH * 0.0002; // nới rộng ngưỡng min (anchor nhỏ hơn)
    const maxA = IW * IH * 0.025;  // nới rộng ngưỡng max

    for (let i = 0; i < contours.size(); i++) {
      const cnt  = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < minA || area > maxA) { cnt.delete(); continue; }

      const peri   = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      // Chấp nhận 3–8 cạnh (anchor chụp thực tế thường không hoàn hảo)
      cv.approxPolyDP(cnt, approx, 0.035 * peri, true);
      const sides = approx.rows;

      if (sides >= 3 && sides <= 8) {
        const rect  = cv.boundingRect(cnt);
        const ratio = rect.width / rect.height;
        // Phải gần vuông (0.5 ~ 2.0) và nằm gần góc ảnh (25% từ mỗi góc)
        const nearEdge = rect.x < IW * 0.35 || rect.x + rect.width > IW * 0.65 ||
                         rect.y < IH * 0.35 || rect.y + rect.height > IH * 0.65;
        if (ratio > 0.5 && ratio < 2.0 && nearEdge) {
          candidates.push({
            cx: rect.x + rect.width  / 2,
            cy: rect.y + rect.height / 2,
            area, rect, sides
          });
        }
      }
      approx.delete(); cnt.delete();
    }
    contours.delete(); hierarchy.delete();
    if (dilated) dilated.delete();

    if (candidates.length < 4) continue;

    // Chọn candidate gần nhất với mỗi góc lý thuyết
    const corners = [
      { name:'tl', ex:0,   ey:0   },
      { name:'tr', ex:IW,  ey:0   },
      { name:'br', ex:IW,  ey:IH  },
      { name:'bl', ex:0,   ey:IH  }
    ];
    const chosen = {};
    const used   = new Set();
    let valid    = true;

    for (const corner of corners) {
      let best = null, bestDist = Infinity;
      for (let j = 0; j < candidates.length; j++) {
        if (used.has(j)) continue;
        const d = Math.hypot(candidates[j].cx - corner.ex, candidates[j].cy - corner.ey);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      if (best === null || bestDist > Math.min(IW, IH) * 0.4) { valid = false; break; }
      chosen[corner.name] = candidates[best];
      used.add(best);
    }

    if (!valid) continue;

    // Validate: 4 anchor phải trải rộng ít nhất 50% kích thước ảnh
    const xSpan = Math.max(chosen.tl.cx, chosen.tr.cx, chosen.br.cx, chosen.bl.cx)
                - Math.min(chosen.tl.cx, chosen.tr.cx, chosen.br.cx, chosen.bl.cx);
    const ySpan = Math.max(chosen.tl.cy, chosen.tr.cy, chosen.br.cy, chosen.bl.cy)
                - Math.min(chosen.tl.cy, chosen.tr.cy, chosen.br.cy, chosen.bl.cy);
    if (xSpan < IW * 0.4 || ySpan < IH * 0.4) continue;

    return chosen; // { tl, tr, br, bl }
  }
  return null; // Không tìm được
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

// ════════════════════════════════════════════════════════════════
//  ĐỌC BONG BÓNG SỐ (SBD / Mã đề)
//  cols × 10 hàng, mỗi hàng là chữ số 0-9
// ════════════════════════════════════════════════════════════════
function readBubbleNumber(binMat, region, numCols) {
  const { x, y, w, h, cols, rows } = region;
  const X0 = Math.round(x * W), Y0 = Math.round(y * H);
  const RW  = Math.round(w * W), RH  = Math.round(h * H);
  const cellW = RW / cols;
  const cellH = RH / rows;
  let result = '';

  for (let c = 0; c < cols; c++) {
    let maxDark = -1, picked = -1;
    for (let r = 0; r < rows; r++) {
      const cx0 = X0 + Math.round(c * cellW);
      const cy0 = Y0 + Math.round(r * cellH);
      const dark = sampleDark(binMat, cx0, cy0,
        Math.round(cellW * 0.8), Math.round(cellH * 0.8));
      if (dark > maxDark) { maxDark = dark; picked = r; }
    }
    if (maxDark > 0.07) result += String(picked);
    else result += '?';
  }
  return result;
}

// ════════════════════════════════════════════════════════════════
//  ĐỌC CÂU TRẢ LỜI (20 câu, 2 panel × 4 ô A/B/C/D)
// ════════════════════════════════════════════════════════════════
function readAnswerBubbles(binMat, numQ) {
  const answers = {};
  const flags   = [];
  const half    = Math.ceil(numQ / 2);

  const panels = [
    { region: REGION.ANS_LEFT,  qStart: 1,        qEnd: half   },
    { region: REGION.ANS_RIGHT, qStart: half + 1, qEnd: numQ   }
  ];

  for (const panel of panels) {
    const { x, y, w, h } = panel.region;
    const X0  = Math.round(x * W), Y0  = Math.round(y * H);
    const PW  = Math.round(w * W), PH  = Math.round(h * H);
    const nQ  = panel.qEnd - panel.qStart + 1;
    const cellH = PH / nQ;
    // Bỏ ~30% đầu hàng cho số thứ tự câu
    const ansX0 = X0 + Math.round(PW * 0.28);
    const ansW  = Math.round(PW * 0.72);

    for (let r = 0; r < nQ; r++) {
      const q    = panel.qStart + r;
      const cy0  = Y0 + Math.round(r * cellH + cellH * 0.08);
      const cHgt = Math.round(cellH * 0.84);
      const cellW = ansW / 4;

      const darks = [];
      for (let col = 0; col < 4; col++) {
        const cx0 = ansX0 + Math.round(col * cellW + cellW * 0.1);
        const cwd = Math.round(cellW * 0.8);
        darks.push(sampleDark(binMat, cx0, cy0, cwd, cHgt));
      }

      // Phát hiện: tô đậm > 0.08 ngưỡng và > 1.8× trung bình (nhạy hơn với ảnh mờ)
      const avg = darks.reduce((s,v) => s+v, 0) / 4;
      const filled = darks.map((d,i) => ({ i, d, ok: d > 0.08 && d > avg * 1.5 }));
      const chosen = filled.filter(f => f.ok);

      if (chosen.length === 0) {
        answers[q] = '?';
        flags.push({ type:'warn', msg:`Câu ${q}: bỏ trống` });
      } else if (chosen.length > 1) {
        // Tô nhiều ô → chọn cái tối nhất, đánh cờ
        const best = chosen.sort((a,b) => b.d - a.d)[0];
        answers[q] = OPTS[best.i];
        flags.push({ type:'danger', msg:`Câu ${q}: tô ${chosen.length} ô (chọn đậm nhất: ${OPTS[best.i]})` });
      } else {
        answers[q] = OPTS[chosen[0].i];
        // Kiểm tra tô quá mờ
        if (chosen[0].d < 0.12) {
          flags.push({ type:'warn', msg:`Câu ${q}: tô mờ (${(chosen[0].d*100).toFixed(0)}% độ đen)` });
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
      bubblesHtml += `<div class="ab ${cls}">${o}</div>`;
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
      <p class="card-title" style="margin-top:.75rem">Chi tiết từng câu</p>
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
        <th>SBD</th><th>Bài kiểm tra</th><th>Mã đề</th>
        <th>Kết quả</th><th>Điểm</th><th>Thời gian</th><th></th>
      </tr></thead>
      <tbody>${data.map(r => {
        const pct = r.score / r.scale;
        const sc  = pct>=.8?'good':pct>=.5?'mid':'low';
        const wr  = r.numQ - r.correct - r.skipped;
        return `<tr>
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
  Object.values(anchors).forEach(a => {
    cv.circle(debug, new cv.Point(a.cx, a.cy), 12, [0,255,0,255], 3);
  });
  return matToCanvas(debug);
}

function drawAnswerDebug(mat, numQ) {
  const debug = mat.clone();
  const half  = Math.ceil(numQ / 2);
  const panels = [
    { region: REGION.ANS_LEFT,  nQ: half },
    { region: REGION.ANS_RIGHT, nQ: numQ - half }
  ];
  panels.forEach(p => {
    const { x, y, w, h } = p.region;
    const X0 = Math.round(x*W), Y0 = Math.round(y*H);
    const PW = Math.round(w*W), PH = Math.round(h*H);
    cv.rectangle(debug, new cv.Point(X0,Y0), new cv.Point(X0+PW,Y0+PH), [0,200,0,255], 2);
    const cellH = PH / p.nQ;
    const ansX0 = X0 + Math.round(PW*0.28);
    const ansW  = Math.round(PW*0.72);
    for (let r = 0; r < p.nQ; r++) {
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
