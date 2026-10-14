// Lays out a note as image(s) using Canvas 2D — no third-party libraries
(function () {
  const THEMES = {
    paper:   { name: '宣纸', bg: '#F4EEE1', ink: '#2A2521', sub: '#8B8073', accent: '#A63A2B', rule: '#D8CDB9', wm: 'rgba(42,37,33,0.055)', frame: '#E6DCC8' },
    ink:     { name: '夜墨', bg: '#1C1D20', ink: '#ECE5D8', sub: '#9A9389', accent: '#D6A146', rule: '#37383D', wm: 'rgba(236,229,216,0.05)', frame: '#2A2B30' },
    celadon: { name: '青瓷', bg: '#E4ECE6', ink: '#1F2E28', sub: '#6B7F75', accent: '#2E6A56', rule: '#C1D1C7', wm: 'rgba(31,46,40,0.06)', frame: '#D3E0D7' },
  };

  const SERIF = '"Noto Serif SC","Noto Serif CJK SC","Songti SC","STSong","SimSun",serif';
  const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  const W = 1080, PAD = 104, CW = W - PAD * 2;
  const PAGE_H = 1440;           // 3:4
  const BODY_SIZE = 38, BODY_LH = 72, PARA_GAP = 30;
  const FOOT_H = 180;

  // Punctuation that must not start a line (allowed to hang past the right margin instead)
  const NO_START = '，。、；：？！）》」』】〕”’…—,.;:?!)]}%·～~';
  // Punctuation that must not end a line (carried over to the next line)
  const NO_END = '（《「『【〔“‘([{';

  const font = (w, size, fam) => `${w} ${size}px ${fam}`;

  async function ensureFonts(text) {
    if (!document.fonts || !document.fonts.load) return;
    const sample = text.slice(0, 4000) || '读';
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`400 ${BODY_SIZE}px "Noto Serif SC"`, sample),
          document.fonts.load(`700 72px "Noto Serif SC"`, sample),
        ]),
        new Promise(r => setTimeout(r, 6000)),
      ]);
    } catch (e) { /* fall back to system fonts if the web font fails to load */ }
  }

  function tokenize(s) {
    return s.match(/[A-Za-z0-9'’\-_.@#]+|\s+|[\s\S]/gu) || [];
  }

  // Wrap one paragraph into lines that fit maxW
  function wrap(ctx, text, maxW, firstIndent) {
    const lines = [];
    let line = '', lineW = firstIndent || 0, indent = firstIndent || 0;
    const tokens = tokenize(text);
    const push = () => { lines.push({ text: line, indent }); line = ''; lineW = 0; indent = 0; };
    for (let i = 0; i < tokens.length; i++) {
      let t = tokens[i];
      if (/^\s+$/.test(t)) { if (line === '') continue; t = ' '; }
      const w = ctx.measureText(t).width;
      if (lineW + w <= maxW || line === '') {
        // Word longer than a whole line: break it character by character
        if (line === '' && w > maxW - lineW && t.length > 1) {
          for (const ch of t) {
            const cw = ctx.measureText(ch).width;
            if (lineW + cw > maxW && line !== '') push();
            line += ch; lineW += cw;
          }
          continue;
        }
        line += t; lineW += w;
      } else if (t.length === 1 && NO_START.includes(t)) {
        line += t; lineW += w;          // hanging punctuation
      } else {
        // Line would end with an opening bracket/quote: move it to the next line
        let carry = '';
        const last = line.slice(-1);
        if (last && NO_END.includes(last) && line.length > 1) { carry = last; line = line.slice(0, -1); }
        line = line.replace(/\s+$/, '');
        push();
        if (/^\s+$/.test(t)) { line = carry; lineW = ctx.measureText(carry).width; continue; }
        line = carry + t; lineW = ctx.measureText(line).width;
      }
    }
    if (line !== '' || lines.length === 0) push();
    return lines;
  }

  function fmtDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function drawSpaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const total = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    let cx = align === 'right' ? x - total : x;
    const prev = ctx.textAlign; ctx.textAlign = 'left';
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + spacing; }
    ctx.textAlign = prev;
  }

  function drawWatermark(ctx, h, id, th) {
    if (!id) return;
    ctx.save();
    ctx.fillStyle = th.wm;
    ctx.font = font(500, 30, SANS);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(W / 2, h / 2);
    ctx.rotate(-Math.PI / 7);
    const diag = Math.hypot(W, h);
    const label = '@' + id;
    const stepX = Math.max(320, ctx.measureText(label).width + 160), stepY = 210;
    let row = 0;
    for (let y = -diag / 2; y < diag / 2; y += stepY, row++) {
      const off = (row % 2) * stepX / 2;
      for (let x = -diag / 2 - off; x < diag / 2; x += stepX) ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  function drawFrame(ctx, h, th) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, h);
    ctx.strokeStyle = th.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, h - 72);
  }

  // Compute header layout (no pagination here)
  function layoutHeader(ctx, note) {
    ctx.font = font(700, 70, SERIF);
    const titleLines = wrap(ctx, `《${note.title || '未命名'}》`, CW, 0);
    const metas = [];
    if (note.author) metas.push(['作者', note.author]);
    const pros = (note.protagonists || []).filter(Boolean);
    if (pros.length) metas.push(['主角', pros.join('  ·  ')]);
    // Must stay in sync with what drawHeader actually draws
    const h = 292 + titleLines.length * 96 + metas.length * 54;
    return { titleLines, metas, height: h };
  }

  function layoutBody(ctx, content, indent) {
    ctx.font = font(400, BODY_SIZE, SERIF);
    const ind = indent ? ctx.measureText('中中').width : 0;
    const items = [];   // {type:'line', text, indent} | {type:'gap'}
    const paras = (content || '').replace(/\r/g, '').split('\n');
    let lastBlank = false;
    paras.forEach((p, i) => {
      const trimmed = p.replace(/^[\s　]+/, '');
      if (!trimmed) { if (!lastBlank && items.length) items.push({ type: 'gap' }); lastBlank = true; return; }
      lastBlank = false;
      if (i > 0 && items.length && items[items.length - 1].type !== 'gap') items.push({ type: 'gap', small: true });
      wrap(ctx, trimmed, CW, ind).forEach(l => items.push({ type: 'line', text: l.text, indent: l.indent }));
    });
    while (items.length && items[items.length - 1].type === 'gap') items.pop();
    return items;
  }

  const itemH = (it) => it.type === 'line' ? BODY_LH : (it.small ? PARA_GAP : BODY_LH * 0.6);

  function drawHeader(ctx, note, hd, th) {
    let y = 120;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = th.sub;
    ctx.font = font(500, 22, SANS);
    drawSpaced(ctx, 'READING NOTE · 读后记', PAD, y, 4, 'left');
    drawSpaced(ctx, fmtDate(note.updated_at), W - PAD, y, 3, 'right');
    y += 28;
    ctx.fillStyle = th.rule; ctx.fillRect(PAD, y, CW, 2);
    y += 40;

    ctx.fillStyle = th.ink;
    ctx.font = font(700, 70, SERIF);
    hd.titleLines.forEach(l => { y += 86; ctx.fillText(l.text, PAD - 18, y); y += 10; });
    y += 24;

    hd.metas.forEach(([k, v]) => {
      y += 44;
      ctx.font = font(500, 26, SANS); ctx.fillStyle = th.accent;
      drawSpaced(ctx, k, PAD, y, 6, 'left');
      ctx.font = font(400, 32, SERIF); ctx.fillStyle = th.ink;
      ctx.fillText(v, PAD + 96, y + 1);
      y += 10;
    });
    y += 40;
    ctx.fillStyle = th.accent; ctx.fillRect(PAD, y, 56, 4);
    return y + 40;
  }

  function drawContHeader(ctx, note, th) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = th.sub;
    ctx.font = font(400, 28, SERIF);
    ctx.fillText(`《${note.title || '未命名'}》 · 续`, PAD, 130);
    ctx.fillStyle = th.rule; ctx.fillRect(PAD, 158, CW, 2);
    return 210;
  }

  function drawBody(ctx, items, y, th) {
    ctx.font = font(400, BODY_SIZE, SERIF);
    ctx.fillStyle = th.ink;
    ctx.textBaseline = 'middle';
    items.forEach(it => {
      if (it.type === 'line') ctx.fillText(it.text, PAD + it.indent, y + BODY_LH / 2 + 2);
      y += itemH(it);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function drawFooter(ctx, h, wmId, pageLabel, th) {
    const y = h - FOOT_H + 50;
    ctx.fillStyle = th.rule; ctx.fillRect(PAD, y, CW, 2);
    const ty = y + 70;
    if (wmId) {
      // Seal-style stamp with the watermark ID
      ctx.save();
      ctx.font = font(700, 26, SERIF);
      const label = wmId.length > 10 ? wmId.slice(0, 10) + '…' : wmId;
      const sw = Math.max(64, ctx.measureText(label).width + 36);
      ctx.strokeStyle = th.accent; ctx.lineWidth = 3;
      ctx.strokeRect(PAD, ty - 40, sw, 56);
      ctx.fillStyle = th.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, PAD + sw / 2, ty - 11);
      ctx.restore();
      ctx.fillStyle = th.sub; ctx.font = font(400, 24, SANS);
      ctx.fillText('的读书笔记', PAD + sw + 18, ty - 3);
    }
    ctx.fillStyle = th.sub; ctx.font = font(500, 22, SANS);
    if (pageLabel) drawSpaced(ctx, pageLabel, W - PAD, ty - 3, 3, 'right');
  }

  // Entry point: returns an array of canvases (one per page)
  async function renderNote(note, opts) {
    const th = THEMES[opts.theme] || THEMES.paper;
    const wmId = (opts.watermarkId || '').trim();
    await ensureFonts([note.title, note.author, (note.protagonists || []).join(''), note.content, wmId, '读后记作者主角的读书笔记续《》'].join(''));

    const m = document.createElement('canvas').getContext('2d');
    const hd = layoutHeader(m, note);
    const items = layoutBody(m, note.content, opts.indent !== false);

    const make = (h) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = h;
      const ctx = c.getContext('2d');
      drawFrame(ctx, h, th);
      return { c, ctx };
    };

    if (opts.mode === 'long') {
      const bodyH = items.reduce((s, it) => s + itemH(it), 0);
      const h = Math.max(PAGE_H, Math.ceil(hd.height + bodyH + 60 + FOOT_H));
      const { c, ctx } = make(h);
      drawWatermark(ctx, h, wmId, th);
      const y = drawHeader(ctx, note, hd, th);
      drawBody(ctx, items, y, th);
      drawFooter(ctx, h, wmId, fmtDate(note.updated_at), th);
      return [c];
    }

    // 3:4 portrait mode: paginate
    const pages = [];
    let cur = [], used = 0, first = true;
    const capOf = (isFirst) => PAGE_H - FOOT_H - 20 - (isFirst ? hd.height : 210);
    let cap = capOf(true);
    items.forEach(it => {
      const ih = itemH(it);
      if (used + ih > cap && cur.length) {
        pages.push({ items: cur, first }); cur = []; used = 0; first = false; cap = capOf(false);
        if (it.type === 'gap') return;   // no blank gap at the top of a page
      }
      cur.push(it); used += ih;
    });
    pages.push({ items: cur, first });

    return pages.map((p, i) => {
      const { c, ctx } = make(PAGE_H);
      drawWatermark(ctx, PAGE_H, wmId, th);
      const y = p.first ? drawHeader(ctx, note, hd, th) : drawContHeader(ctx, note, th);
      drawBody(ctx, p.items, y, th);
      drawFooter(ctx, PAGE_H, wmId, pages.length > 1 ? `${i + 1} / ${pages.length}` : fmtDate(note.updated_at), th);
      return c;
    });
  }

  window.NoteRender = { renderNote, THEMES };
})();
