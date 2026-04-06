// gen_omr_dynamic.js — Phiếu OMR vừa khít 1 trang A4
// Chiến lược: bảng ngoài dùng fixedRow (EXACT height), bảng con bên trong KHÔNG dùng fixed height
'use strict';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, HeightRule,
} = require('docx');
const fs = require('fs');

const NUM_Q = parseInt(process.argv[2] || '20', 10);
const OUT   = process.argv[3] || `phieu_omr_${NUM_Q}cau.docx`;
if (isNaN(NUM_Q) || NUM_Q < 2) { console.error('So cau khong hop le'); process.exit(1); }
const HALF = Math.ceil(NUM_Q / 2);

const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 600;
const CW = PAGE_W - 2 * MARGIN;  // 10706
const CH = PAGE_H - 2 * MARGIN;  // 15638

const R = {
  SBD:  { x:0.12, w:0.30, cols:6 },
  CODE: { x:0.55, w:0.15, cols:3 },
  ANS_LEFT:  { x:0.04, w:0.44 },
  ANS_RIGHT: { x:0.52, w:0.44 },
};

const ANCHOR_SZ = 300;

// ── Phân bổ chiều cao cho 9 "slot" bên ngoài ──────────────────────
// Slot 1: anchor top        = H_ANCH
// Slot 2: spacer title      = S1
// Slot 3: info row          = H_INFO
// Slot 4: spacer info→SBD   = S2
// Slot 5: SBD+CODE          = H_SBD
// Slot 6: spacer SBD→ANS    = S3
// Slot 7: ANS               = H_ANS
// Slot 8: spacer ANS→bottom = S4
// Slot 9: anchor bottom     = H_ANCH
// Tổng = CH

const H_ANCH = 360;
const H_INFO = 300;
const H_SBD  = Math.round(CH * 0.28);   // 4379
const H_ANS  = Math.round(CH * 0.42);   // phải đủ chứa NUM_Q rows

// Chia spacer cho phần còn lại
const used   = H_ANCH * 2 + H_INFO + H_SBD + H_ANS;
const spare  = CH - used;                // chia cho 4 spacer
const S1 = Math.max(Math.round(spare * 0.38), 40);
const S2 = Math.max(Math.round(spare * 0.30), 40);
const S3 = Math.max(Math.round(spare * 0.20), 40);
const S4 = Math.max(spare - S1 - S2 - S3, 40);

// ── Borders ────────────────────────────────────────────────────────
const bNone = { style: BorderStyle.NONE,   size: 0, color: 'auto' };
const bThin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const NONE = { top: bNone, bottom: bNone, left: bNone, right: bNone };
const THIN = { top: bThin, bottom: bThin, left: bThin, right: bThin };

// ── Para helpers ───────────────────────────────────────────────────
const minPara = () => new Paragraph({ spacing: { before:0, after:0, line:20, lineRule:'exact' }, children:[] });

function txt(text, sz=18, bold=false, color='000000', align=AlignmentType.LEFT) {
  return new Paragraph({
    alignment: align, spacing: { before:0, after:0 },
    children: [new TextRun({ text, font:'Arial', size:sz, bold, color })],
  });
}

// ── Cell helpers ───────────────────────────────────────────────────
function cell(children, w, { borders=NONE, fill, margins={ top:16,bottom:16,left:24,right:24 }, va=VerticalAlign.CENTER } = {}) {
  return new TableCell({
    children,
    borders,
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    width:   { size: w, type: WidthType.DXA },
    margins,
    verticalAlign: va,
  });
}

function blackCell(w) {
  return new TableCell({
    children: [minPara()],
    borders:  NONE,
    shading:  { fill: '000000', type: ShadingType.CLEAR },
    width:    { size: w, type: WidthType.DXA },
    margins:  { top:0, bottom:0, left:0, right:0 },
    verticalAlign: VerticalAlign.CENTER,
  });
}

function bubble(w, sz=17) {
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before:0, after:0 },
      children: [new TextRun({ text:'O', font:'Arial', size:sz })],
    })],
    borders:  THIN,
    width:    { size: w, type: WidthType.DXA },
    margins:  { top:8, bottom:8, left:4, right:4 },
    verticalAlign: VerticalAlign.CENTER,
  });
}

// Row KHÔNG có height cố định (dùng cho bảng con)
function row(...cells) {
  return new TableRow({ children: cells });
}

// Row có height EXACT (dùng cho bảng ngoài)
function fixedRow(h, ...cells) {
  return new TableRow({
    children: cells,
    height:   { value: h, rule: HeightRule.EXACT },
    cantSplit: true,
  });
}

// ── Bảng 1 cột, 1 row, chiều cao cố định ──────────────────────────
function slotTable(h, children, margins={ top:0,bottom:0,left:0,right:0 }) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [fixedRow(h, cell(children, CW, { margins }) )],
  });
}

// ── Anchor row ─────────────────────────────────────────────────────
function anchorTable(paras) {
  const inner = CW - 2 * ANCHOR_SZ;
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [ANCHOR_SZ, inner, ANCHOR_SZ],
    rows: [fixedRow(H_ANCH,
      blackCell(ANCHOR_SZ),
      cell(paras, inner, { margins: { top:0, bottom:0, left:50, right:50 } }),
      blackCell(ANCHOR_SZ),
    )],
  });
}

// ── Number grid (SBD / CODE) — bảng con, KHÔNG fixed height ───────
function numberGrid(cols, totalW) {
  const labelW = 220;
  const bubW   = Math.floor((totalW - labelW) / cols);
  const colWidths = [labelW, ...Array(cols).fill(bubW)];

  const hRow = row(
    cell([txt('', 11)], labelW, { borders: THIN }),
    ...Array.from({ length: cols }, (_, c) =>
      cell([txt(`C${c+1}`, 11, false, '000000', AlignmentType.CENTER)], bubW, { borders: THIN })
    )
  );
  const dRows = Array.from({ length: 10 }, (_, d) =>
    row(
      cell([txt(String(d), 14, true, '000000', AlignmentType.CENTER)], labelW, { borders: THIN }),
      ...Array(cols).fill(null).map(() => bubble(bubW, 16))
    )
  );

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [hRow, ...dRows],
  });
}

// ── SBD+CODE slot ──────────────────────────────────────────────────
function sbdCodeTable() {
  const sbdX  = Math.round(R.SBD.x * CW);
  const sbdW  = Math.round(R.SBD.w * CW);
  const codeX = Math.round(R.CODE.x * CW);
  const codeW = Math.round(R.CODE.w * CW);
  const gap   = Math.max(codeX - sbdX - sbdW, 60);
  const padR  = Math.max(CW - codeX - codeW, 60);

  const m0 = { top:0, bottom:0, left:0, right:0 };
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [sbdX, sbdW, gap, codeW, padR],
    rows: [fixedRow(H_SBD,
      cell([minPara()], sbdX,  { margins: m0 }),
      cell([numberGrid(R.SBD.cols, sbdW)],  sbdW,  { margins: m0, va: VerticalAlign.TOP }),
      cell([minPara()], gap,   { margins: m0 }),
      cell([numberGrid(R.CODE.cols, codeW)], codeW, { margins: m0, va: VerticalAlign.TOP }),
      cell([minPara()], padR,  { margins: m0 }),
    )],
  });
}

// ── Answer panel — bảng con, KHÔNG fixed height ────────────────────
function answerPanel(qStart, qEnd, totalW) {
  const numW = Math.round(totalW * 0.26);
  const optW = Math.floor((totalW - numW) / 4);
  const cols = [numW, optW, optW, optW, optW];

  const hRow = row(
    cell([txt('Câu', 13, true, '000000', AlignmentType.CENTER)], numW, { borders: THIN }),
    ...['A','B','C','D'].map(o =>
      cell([txt(o, 13, true, '000000', AlignmentType.CENTER)], optW, { borders: THIN })
    )
  );
  const qRows = Array.from({ length: qEnd - qStart + 1 }, (_, i) => {
    const q = qStart + i;
    return row(
      cell([txt(String(q), 14, true, '000000', AlignmentType.CENTER)], numW, { borders: THIN }),
      bubble(optW, 17), bubble(optW, 17), bubble(optW, 17), bubble(optW, 17),
    );
  });

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: cols,
    rows: [hRow, ...qRows],
  });
}

// ── Answer slot ────────────────────────────────────────────────────
function answerTable() {
  const lX  = Math.round(R.ANS_LEFT.x  * CW);
  const lW  = Math.round(R.ANS_LEFT.w  * CW);
  const rX  = Math.round(R.ANS_RIGHT.x * CW);
  const rW  = Math.round(R.ANS_RIGHT.w * CW);
  const gap = Math.max(rX - lX - lW, 60);
  const padR= Math.max(CW - rX - rW, 60);

  const m0 = { top:0, bottom:0, left:0, right:0 };
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [lX, lW, gap, rW, padR],
    rows: [fixedRow(H_ANS,
      cell([minPara()], lX,  { margins: m0 }),
      cell([answerPanel(1,      HALF,   lW)], lW,  { margins: m0, va: VerticalAlign.TOP }),
      cell([minPara()], gap, { margins: m0 }),
      cell([answerPanel(HALF+1, NUM_Q,  rW)], rW,  { margins: m0, va: VerticalAlign.TOP }),
      cell([minPara()], padR,{ margins: m0 }),
    )],
  });
}

// ════════════════════════════════════════════════════════════════
const doc = new Document({
  sections: [{
    properties: {
      page: {
        size:   { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    children: [
      anchorTable([
        txt('PHIẾU TRẢ LỜI TRẮC NGHIỆM', 24, true, '000000', AlignmentType.CENTER),
        txt(`${NUM_Q} câu · Mã đề: _______`, 15, false, '555555', AlignmentType.CENTER),
      ]),
      slotTable(S1, [minPara()]),
      slotTable(H_INFO, [
        txt('Họ và tên: ______________________________   Lớp: _________   Ngày: _________', 15, false, '000000'),
      ], { top:10, bottom:10, left: ANCHOR_SZ+30, right: ANCHOR_SZ+30 }),
      slotTable(S2, [minPara()]),
      sbdCodeTable(),
      slotTable(S3, [minPara()]),
      answerTable(),
      slotTable(S4, [minPara()]),
      anchorTable([
        txt('Dùng bút chì đen tô kín vòng tròn  ·  Xóa sạch nếu muốn sửa  ·  Không bôi bẩn phiếu',
          12, false, '666666', AlignmentType.CENTER),
      ]),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  const total = H_ANCH*2 + S1 + H_INFO + S2 + H_SBD + S3 + H_ANS + S4;
  console.log(`OK: ${OUT}  (${NUM_Q} cau)  total=${total}/${CH} DXA`);
}).catch(e => { console.error('Loi:', e); process.exit(1); });