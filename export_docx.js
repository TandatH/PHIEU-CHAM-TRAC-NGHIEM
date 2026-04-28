/**
 * export_docx.js - Generate OMR answer sheets as DOCX.
 * Layout matches app.js regions and includes small region markers.
 */
(function(global) {
  'use strict';

  const PAGE_W = 11906;
  const PAGE_H = 16838;
  const MARGIN = 600;
  const CW = PAGE_W - MARGIN * 2;
  const CH = PAGE_H - MARGIN * 2;

  const R = {
    SBD:  { name: 'SBD',  x: 0.08, y: 0.18, w: 0.45, h: 0.25, cols: 6, rows: 10 },
    CODE: { name: 'CODE', x: 0.62, y: 0.18, w: 0.25, h: 0.25, cols: 3, rows: 10 }
  };

  const ANSWER_REGIONS = [
    { name: 'ANS_1', from: 1,  to: 10, x: 0.08, y: 0.50, w: 0.39, h: 0.18 },
    { name: 'ANS_2', from: 11, to: 20, x: 0.53, y: 0.50, w: 0.39, h: 0.18 },
    { name: 'ANS_3', from: 21, to: 30, x: 0.08, y: 0.72, w: 0.39, h: 0.18 },
    { name: 'ANS_4', from: 31, to: 40, x: 0.53, y: 0.72, w: 0.39, h: 0.18 }
  ];

  const ANCHOR_SZ = 320;
  const MARKER_SZ = 100;
  const MARKER_GAP = 90;
  const MARKER_OUT = MARKER_SZ + MARKER_GAP;

  const pw = f => Math.round(f * CW);
  const ph = f => Math.round(f * CH);

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tag(name, attrs, ...children) {
    const attrText = Object.entries(attrs || {})
      .map(([key, value]) => ` ${key}="${xmlEscape(value)}"`)
      .join('');
    const body = children.flat().join('');
    return body ? `<${name}${attrText}>${body}</${name}>` : `<${name}${attrText}/>`;
  }

  const w = (name, attrs, ...children) => tag(`w:${name}`, attrs, ...children);
  const W = (name, ...children) => tag(`w:${name}`, {}, ...children);

  function run(text, opts = {}) {
    const props = [
      w('rFonts', { 'w:ascii': 'Arial', 'w:hAnsi': 'Arial', 'w:cs': 'Arial' }),
      opts.bold ? '<w:b/>' : '',
      w('sz', { 'w:val': opts.size || 18 }),
      w('szCs', { 'w:val': opts.size || 18 }),
      opts.color ? w('color', { 'w:val': opts.color }) : ''
    ].join('');
    return W('r', W('rPr', props), w('t', { 'xml:space': 'preserve' }, text));
  }

  function para(text, opts = {}) {
    const align = opts.align ? w('jc', { 'w:val': opts.align }) : '';
    return W('p',
      W('pPr', '<w:spacing w:before="0" w:after="0"/>', align),
      run(text, opts)
    );
  }

  function spacer(heightDxa) {
    return W('p',
      W('pPr',
        `<w:spacing w:before="0" w:after="0" w:line="${Math.max(20, heightDxa)}" w:lineRule="exact"/>`
      )
    );
  }

  function borders(kind) {
    if (kind !== 'thin') {
      return W('tcBorders',
        w('top', { 'w:val': 'none' }),
        w('left', { 'w:val': 'none' }),
        w('bottom', { 'w:val': 'none' }),
        w('right', { 'w:val': 'none' })
      );
    }
    const side = () => ({ 'w:val': 'single', 'w:sz': '4', 'w:space': '0', 'w:color': '000000' });
    return W('tcBorders',
      w('top', side()),
      w('left', side()),
      w('bottom', side()),
      w('right', side())
    );
  }

  function cell(width, content = '', opts = {}) {
    const fill = opts.fill ? w('shd', { 'w:val': 'clear', 'w:fill': opts.fill }) : '';
    const margins = opts.noMargin
      ? W('tcMar',
          w('top', { 'w:w': '0', 'w:type': 'dxa' }),
          w('left', { 'w:w': '0', 'w:type': 'dxa' }),
          w('bottom', { 'w:w': '0', 'w:type': 'dxa' }),
          w('right', { 'w:w': '0', 'w:type': 'dxa' })
        )
      : '';
    return W('tc',
      W('tcPr',
        w('tcW', { 'w:w': width, 'w:type': 'dxa' }),
        fill,
        borders(opts.borders),
        margins,
        w('vAlign', { 'w:val': 'center' })
      ),
      content || para('')
    );
  }

  function tr(cells, height) {
    const trPr = height ? W('trPr', w('trHeight', { 'w:val': height, 'w:hRule': 'exact' })) : '';
    return W('tr', trPr, cells);
  }

  function tbl(widths, rows, totalW = widths.reduce((sum, value) => sum + value, 0)) {
    return W('tbl',
      W('tblPr',
        w('tblW', { 'w:w': totalW, 'w:type': 'dxa' }),
        W('tblBorders',
          w('top', { 'w:val': 'none' }),
          w('left', { 'w:val': 'none' }),
          w('bottom', { 'w:val': 'none' }),
          w('right', { 'w:val': 'none' }),
          w('insideH', { 'w:val': 'none' }),
          w('insideV', { 'w:val': 'none' })
        )
      ),
      W('tblGrid', ...widths.map(width => w('gridCol', { 'w:w': width }))),
      rows
    );
  }

  function blackCell(width) {
    return cell(width, para(''), { fill: '000000', noMargin: true });
  }

  function blankCell(width) {
    return cell(width, para(''), { noMargin: true });
  }

  function bubbleCell(width) {
    return cell(width, para('○', { size: 20, align: 'center' }), { borders: 'thin' });
  }

  function markedBox(innerXml, innerW) {
    const widths = [MARKER_SZ, MARKER_GAP, innerW, MARKER_GAP, MARKER_SZ];
    return tbl(widths, [
      tr([blackCell(MARKER_SZ), blankCell(MARKER_GAP), blankCell(innerW), blankCell(MARKER_GAP), blackCell(MARKER_SZ)].join(''), MARKER_SZ),
      tr(widths.map(blankCell).join(''), MARKER_GAP),
      tr([blankCell(MARKER_SZ), blankCell(MARKER_GAP), cell(innerW, innerXml, { noMargin: true }), blankCell(MARKER_GAP), blankCell(MARKER_SZ)].join('')),
      tr(widths.map(blankCell).join(''), MARKER_GAP),
      tr([blackCell(MARKER_SZ), blankCell(MARKER_GAP), blankCell(innerW), blankCell(MARKER_GAP), blackCell(MARKER_SZ)].join(''), MARKER_SZ)
    ].join(''));
  }

  function buildAnchorRow(contentParas) {
    const innerW = CW - 2 * ANCHOR_SZ;
    return tbl([ANCHOR_SZ, innerW, ANCHOR_SZ], tr([
      blackCell(ANCHOR_SZ),
      cell(innerW, contentParas.join('')),
      blackCell(ANCHOR_SZ)
    ].join('')));
  }

  function buildNumberGrid(region) {
    const totalW = pw(region.w);
    const labelW = Math.round(totalW * 0.18);
    const bubbleW = Math.floor((totalW - labelW) / region.cols);
    const widths = [labelW, ...Array(region.cols).fill(bubbleW)];
    const rows = Array.from({ length: 10 }, (_, digit) => tr([
      cell(labelW, para(String(digit), { bold: true, size: 17, align: 'center' }), { borders: 'thin' }),
      ...Array.from({ length: region.cols }, () => bubbleCell(bubbleW))
    ].join(''))).join('');
    return markedBox(tbl(widths, rows, totalW), totalW);
  }

  function buildAnswerPanel(region) {
    const panelW = pw(region.w);
    const numW = Math.round(panelW * 0.28);
    const optW = Math.floor((panelW - numW) / 4);
    const widths = [numW, optW, optW, optW, optW];
    const rows = Array.from({ length: region.to - region.from + 1 }, (_, i) => {
      const q = region.from + i;
      return tr([
        cell(numW, para(String(q), { bold: true, size: 16, align: 'center' }), { borders: 'thin' }),
        bubbleCell(optW),
        bubbleCell(optW),
        bubbleCell(optW),
        bubbleCell(optW)
      ].join(''));
    }).join('');
    return markedBox(tbl(widths, rows, panelW), panelW);
  }

  function positionedRow(items) {
    const sorted = items.slice().sort((a, b) => a.x - b.x);
    const cells = [];
    const widths = [];
    let cursor = 0;
    for (const item of sorted) {
      const left = Math.max(0, pw(item.x) - MARKER_OUT);
      const width = pw(item.w) + MARKER_OUT * 2;
      if (left > cursor) {
        widths.push(left - cursor);
        cells.push(blankCell(left - cursor));
      }
      widths.push(width);
      cells.push(cell(width, item.xml, { noMargin: true }));
      cursor = left + width;
    }
    if (cursor < CW) {
      widths.push(CW - cursor);
      cells.push(blankCell(CW - cursor));
    }
    return tbl(widths, tr(cells.join('')), CW);
  }

  function getAnswerRegions(numQ) {
    return ANSWER_REGIONS.slice(0, Math.ceil(numQ / 10)).map((region, index) => ({
      ...region,
      from: index * 10 + 1,
      to: Math.min((index + 1) * 10, numQ)
    }));
  }

  function buildSbdCodeRow() {
    return positionedRow([
      { ...R.SBD, xml: buildNumberGrid(R.SBD) },
      { ...R.CODE, xml: buildNumberGrid(R.CODE) }
    ]);
  }

  function buildAnswerRows(numQ) {
    const regions = getAnswerRegions(numQ).map(region => ({ ...region, xml: buildAnswerPanel(region) }));
    const firstRow = positionedRow(regions.filter(region => region.name === 'ANS_1' || region.name === 'ANS_2'));
    const second = regions.filter(region => region.name === 'ANS_3' || region.name === 'ANS_4');
    return firstRow + (second.length ? spacer(240) + positionedRow(second) : '');
  }

  function buildDocumentXml(numQ) {
    const body = [
      buildAnchorRow([
        para(`PHIẾU TRẢ LỜI TRẮC NGHIỆM - ${numQ} CÂU`, { bold: true, size: 26, align: 'center' }),
        para('OMR Answer Sheet', { size: 15, align: 'center', color: '666666' })
      ]),
      spacer(ph(0.08)),
      tbl([CW], tr(cell(CW, para('Họ và tên: ____________________________   Lớp: __________   Ngày: __________', { size: 16 })))),
      spacer(ph(0.05)),
      buildSbdCodeRow(),
      spacer(ph(0.11)),
      buildAnswerRows(numQ),
      spacer(220),
      buildAnchorRow([
        para('Dùng bút chì tô đậm kín một ô tròn. Xóa sạch nếu muốn sửa. Không bôi bẩn hoặc gấp phiếu.',
          { size: 13, align: 'center', color: '666666' })
      ]),
      W('p')
    ].join('\n');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body}
<w:sectPr>
  <w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}" w:orient="portrait"/>
  <w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;
  }

  async function generateOMRSheet(numQ) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip chưa được load. Hãy import JSZip trước export_docx.js');
    }

    const safeNumQ = [10, 20, 30, 40].includes(Number(numQ)) ? Number(numQ) : 20;
    const zip = new JSZip();

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

    zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

    zip.file('word/document.xml', buildDocumentXml(safeNumQ));
    zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`);

    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  async function downloadOMRSheet(numQ) {
    const blob = await generateOMRSheet(numQ);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phieu_omr_${numQ}cau.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  global.OMRExport = {
    generateSheet: generateOMRSheet,
    downloadSheet: downloadOMRSheet,
    VERSION: '2.0.0'
  };
})(window);
