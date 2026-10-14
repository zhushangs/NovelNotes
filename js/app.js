(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');

  const store = window.createStore();
  const S = { user: null, profile: Object.assign({}, window.DEFAULT_PROFILE), draft: null, editor: null };

  // ---------- Helpers ----------
  let toastTimer;
  function toast(msg, ms = 2400) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }
  function fmtTime(iso) {
    const d = new Date(iso), now = new Date();
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`;
  }
  const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);
  const prosText = (n) => (n.protagonists || []).filter(Boolean).join(' · ');

  // ---------- Routing ----------
  async function route() {
    await leaveEditor();
    const h = location.hash.replace(/^#/, '') || '/';
    if (!S.user) return renderAuth();
    let tab = 'new';
    if (h.startsWith('/note/')) { tab = 'shelf'; await renderEditor(decodeURIComponent(h.slice(6))); }
    else if (h === '/shelf') { tab = 'shelf'; await renderShelf(); }
    else if (h === '/settings') { tab = 'settings'; renderSettings(); }
    else renderWizard();
    $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    window.scrollTo(0, 0);
  }

  // ---------- Auth ----------
  function renderAuth() {
    $$('.tabs a').forEach(a => a.classList.remove('active'));
    let signup = false;
    const draw = () => {
      app.innerHTML = `
        <form class="auth card" id="authForm">
          <h1>${signup ? '注册账号' : '登录'}</h1>
          <p class="hint">手机和电脑用同一个账号登录，笔记就会自动同步。</p>
          <label class="field"><span>邮箱</span><input class="input" type="email" name="email" autocomplete="email" required></label>
          <label class="field"><span>密码</span><input class="input" type="password" name="pw" minlength="6"
            autocomplete="${signup ? 'new-password' : 'current-password'}" required></label>
          <p class="err" id="authErr"></p>
          <button class="btn primary" style="width:100%">${signup ? '注册' : '登录'}</button>
          <p class="hint" style="text-align:center;margin-top:14px">
            <button type="button" class="switch" id="authSwitch">${signup ? '已有账号？去登录' : '第一次用？注册一个'}</button>
          </p>
        </form>`;
      $('#authSwitch').onclick = () => { signup = !signup; draw(); };
      $('#authForm').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target, btn = f.querySelector('.btn');
        btn.disabled = true; $('#authErr').textContent = '';
        try {
          if (signup) {
            const r = await store.signUp(f.email.value.trim(), f.pw.value);
            if (r.needsConfirm) { $('#authErr').textContent = '已发送确认邮件，点邮件里的链接后再回来登录。'; btn.disabled = false; return; }
          } else {
            await store.signIn(f.email.value.trim(), f.pw.value);
          }
          await afterLogin();
        } catch (err) {
          const m = errMsg(err);
          $('#authErr').textContent = /Invalid login/i.test(m) ? '邮箱或密码不对' : /not confirmed/i.test(m) ? '邮箱还没确认，请先点确认邮件里的链接' : m;
          btn.disabled = false;
        }
      };
    };
    draw();
  }

  async function afterLogin() {
    S.user = await store.getUser();
    try { S.profile = await store.getProfile(); } catch (e) { console.warn(e); }
    route();
  }

  // ---------- Step-by-step new-note wizard ----------
  function renderWizard() {
    if (!S.draft) S.draft = { step: 0, title: '', author: '', p1: '', p2: '' };
    const d = S.draft;
    const steps = [
      { q: '这本小说叫什么？', sub: '先写下书名。', fields: [['title', '书名', true]] },
      { q: '作者是谁？', sub: '不记得也可以先空着。', fields: [['author', '作者名']] },
      { q: '主角是谁？', sub: '一到两个名字，第二个可以不填。', fields: [['p1', '主角 1'], ['p2', '主角 2（可选）']] },
    ];
    const s = steps[d.step];
    const recap = [];
    if (d.step > 0) recap.push(`《<b>${esc(d.title)}</b>》`);
    if (d.step > 1 && d.author) recap.push(`作者 <b>${esc(d.author)}</b>`);

    app.innerHTML = `
      <section class="wizard">
        <div class="steps">${[0, 1, 2, 3].map(i => `<i class="${i <= d.step ? 'on' : ''}"></i>`).join('')}</div>
        ${recap.length ? `<div class="recap">${recap.join('　')}</div>` : ''}
        <h1 class="q">${s.q}</h1>
        <p class="sub">${s.sub}</p>
        <form id="wzForm" autocomplete="off">
          ${s.fields.map(([k, ph]) => `<input class="big-input" name="${k}" placeholder="${ph}" value="${esc(d[k])}">`).join('')}
          <div class="wizard-actions">
            <button type="button" class="btn ghost" id="wzBack" ${d.step === 0 ? 'style="visibility:hidden"' : ''}>上一步</button>
            <button class="btn primary">${d.step === 2 ? '开始写感想' : '下一步'}</button>
          </div>
        </form>
      </section>`;

    const form = $('#wzForm');
    const inputs = $$('input', form);
    inputs.forEach(inp => {
      inp.addEventListener('input', () => { d[inp.name] = inp.value; });
      // Ignore Enter while an IME (e.g. Chinese input) is composing
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
    });
    // Enter in the 1st protagonist field moves to the 2nd; Enter in the 2nd submits
    if (inputs.length > 1) inputs[0].addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); inputs[1].focus(); }
    });
    inputs[0].focus();

    $('#wzBack').onclick = () => { d.step = Math.max(0, d.step - 1); renderWizard(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (d.step === 0 && !d.title.trim()) { inputs[0].focus(); toast('先写个书名吧'); return; }
      if (d.step < 2) { d.step++; renderWizard(); return; }
      const btn = form.querySelector('.btn.primary'); btn.disabled = true;
      try {
        const note = await store.createNote({
          title: d.title.trim(), author: d.author.trim(),
          protagonists: [d.p1.trim(), d.p2.trim()].filter(Boolean), content: '',
        });
        S.draft = null;
        location.hash = '#/note/' + encodeURIComponent(note.id);
      } catch (err) { toast('保存失败：' + errMsg(err), 4000); btn.disabled = false; }
    };
  }

  // ---------- Bookshelf ----------
  async function renderShelf() {
    app.innerHTML = `<div class="empty">加载中…</div>`;
    let notes = [];
    try { notes = await store.listNotes(); } catch (e) { app.innerHTML = `<div class="empty">加载失败：${esc(errMsg(e))}</div>`; return; }
    app.innerHTML = `
      <div class="shelf-head"><h1>书架</h1><a class="btn primary small" href="#/" style="text-decoration:none">＋ 新笔记</a></div>
      ${notes.length ? `<input class="input search" id="q" placeholder="搜索书名、作者、主角或内容">` : ''}
      <div class="note-list" id="list"></div>`;
    const list = $('#list');
    const draw = (q) => {
      const k = (q || '').trim().toLowerCase();
      const hit = !k ? notes : notes.filter(n => [n.title, n.author, prosText(n), n.content].join('\n').toLowerCase().includes(k));
      list.innerHTML = hit.length ? hit.map(n => `
        <a class="note-item card" href="#/note/${encodeURIComponent(n.id)}">
          <h3>《${esc(n.title)}》</h3>
          <div class="meta">${[n.author && '作者 ' + esc(n.author), prosText(n) && '主角 ' + esc(prosText(n)), fmtTime(n.updated_at)].filter(Boolean).join('　·　')}</div>
          ${n.content ? `<p class="snippet">${esc(n.content.slice(0, 160))}</p>` : '<p class="snippet">（还没写感想）</p>'}
        </a>`).join('') : `<div class="empty">${notes.length ? '没有找到' : '书架还是空的，去写第一篇吧'}</div>`;
    };
    draw('');
    const q = $('#q'); if (q) q.oninput = () => draw(q.value);
  }

  // ---------- Editor (autosave + multi-device sync) ----------
  async function renderEditor(id) {
    app.innerHTML = `<div class="empty">加载中…</div>`;
    let note;
    try { note = await store.getNote(id); } catch (e) { app.innerHTML = `<div class="empty">加载失败：${esc(errMsg(e))}</div>`; return; }
    if (!note) { app.innerHTML = `<div class="empty">找不到这篇笔记，可能已被删除。<br><a href="#/shelf">回书架</a></div>`; return; }

    app.innerHTML = `
      <div class="editor-head card">
        <div class="row">
          <div>
            <h1 class="title" id="edTitle"></h1>
            <div class="meta" id="edMeta"></div>
          </div>
          <button class="btn ghost small" id="edToggle">编辑信息</button>
        </div>
        <div class="meta-form" id="metaForm" hidden>
          <label class="field" style="margin:0"><span>书名</span><input class="input" name="title"></label>
          <label class="field" style="margin:0"><span>作者</span><input class="input" name="author"></label>
          <div class="two">
            <label class="field" style="margin:0"><span>主角 1</span><input class="input" name="p1"></label>
            <label class="field" style="margin:0"><span>主角 2</span><input class="input" name="p2"></label>
          </div>
        </div>
      </div>
      <textarea class="content-area" id="edContent" placeholder="随便写点什么……喜欢的情节、想吐槽的地方、某一句打动你的话。&#10;&#10;会自动保存，换到另一台设备可以接着写。"></textarea>
      <div class="editor-bar">
        <span><span class="status" id="edStatus">已同步</span>　<span class="count" id="edCount"></span></span>
        <div class="right">
          <button class="btn danger small" id="edDelete">删除</button>
          <button class="btn primary" id="edImage">生成图片</button>
        </div>
      </div>`;

    const ed = S.editor = { id, base: note.updated_at, dirty: false, saving: false, pending: false, timer: null, poll: null, note };
    const form = $('#metaForm'), ta = $('#edContent');
    const F = {}; ['title', 'author', 'p1', 'p2'].forEach(k => { F[k] = form.querySelector(`[name=${k}]`); });

    const fill = (n) => {
      F.title.value = n.title || ''; F.author.value = n.author || '';
      F.p1.value = (n.protagonists || [])[0] || ''; F.p2.value = (n.protagonists || [])[1] || '';
      const pos = ta.selectionStart, atEnd = pos === ta.value.length;
      ta.value = n.content || '';
      if (document.activeElement === ta) { const p = atEnd ? ta.value.length : Math.min(pos, ta.value.length); ta.setSelectionRange(p, p); }
      paintHead();
    };
    const collect = () => ({
      title: F.title.value.trim() || '未命名', author: F.author.value.trim(),
      protagonists: [F.p1.value.trim(), F.p2.value.trim()].filter(Boolean), content: ta.value,
    });
    const paintHead = () => {
      const c = collect();
      $('#edTitle').textContent = `《${c.title}》`;
      $('#edMeta').textContent = [c.author && '作者 ' + c.author, c.protagonists.length && '主角 ' + c.protagonists.join(' · ')].filter(Boolean).join('　·　') || '还没填作者和主角';
      $('#edCount').textContent = `${ta.value.replace(/\s/g, '').length} 字`;
    };
    const setStatus = (text, cls) => { const s = $('#edStatus'); if (!s) return; s.textContent = text; s.className = 'status ' + (cls || ''); };

    ed.save = async () => {
      clearTimeout(ed.timer);
      if (ed.saving) { ed.pending = true; return; }
      if (!ed.dirty) return;
      ed.saving = true; ed.dirty = false; setStatus('保存中…', 'dirty');
      const patch = collect();
      let retry = false;
      try {
        const r = await store.updateNote(ed.id, patch, ed.base);
        if (r.conflict) {
          if (!r.server) { setStatus('云端已删除这篇笔记', 'error'); return; }
          ed.dirty = true;
          const choice = await askConflict(r.server, { content: ta.value });
          if (choice === 'server') { ed.dirty = false; ed.base = r.server.updated_at; fill(r.server); setStatus('已载入云端版本'); }
          else {
            if (choice === 'append') {
              ta.value = (r.server.content || '').replace(/\s+$/, '') + '\n\n' + ta.value.replace(/^\s+/, '');
              paintHead();
            }
            ed.base = r.server.updated_at; ed.dirty = true; retry = true;
          }
        } else {
          ed.base = r.note.updated_at; ed.note = r.note;
          setStatus(ed.dirty ? '有未保存修改' : '已同步 ' + fmtTime(r.note.updated_at).replace('今天 ', ''), ed.dirty ? 'dirty' : '');
        }
      } catch (e) {
        ed.dirty = true; setStatus('保存失败，稍后自动重试', 'error');
        ed.timer = setTimeout(ed.save, 5000);
      } finally {
        ed.saving = false;
        if (retry || ed.pending) { ed.pending = false; ed.save(); }
      }
    };
    const markDirty = () => {
      ed.dirty = true; setStatus('有未保存修改', 'dirty'); paintHead();
      clearTimeout(ed.timer); ed.timer = setTimeout(ed.save, 1200);
    };
    // Pull changes made on other devices (only when there are no unsaved local edits)
    ed.pull = async () => {
      if (ed.dirty || ed.saving || document.hidden) return;
      try {
        const s = await store.getNote(ed.id);
        if (S.editor !== ed || ed.dirty || ed.saving) return;
        if (s && s.updated_at !== ed.base) {
          ed.base = s.updated_at; ed.note = s; fill(s);
          setStatus('已同步 ' + fmtTime(s.updated_at).replace('今天 ', ''));
          toast('已载入其他设备上的最新内容');
        }
      } catch (e) { /* ignore network errors */ }
    };

    fill(note);
    Object.values(F).forEach(el => el.addEventListener('input', markDirty));
    ta.addEventListener('input', markDirty);
    ta.addEventListener('blur', () => ed.save());
    $('#edToggle').onclick = () => { form.hidden = !form.hidden; $('#edToggle').textContent = form.hidden ? '编辑信息' : '收起'; };
    $('#edDelete').onclick = async () => {
      if (!confirm(`确定删除《${collect().title}》这篇笔记吗？删除后无法恢复。`)) return;
      try { clearTimeout(ed.timer); ed.dirty = false; await store.deleteNote(ed.id); S.editor = null; location.hash = '#/shelf'; }
      catch (e) { toast('删除失败：' + errMsg(e)); }
    };
    $('#edImage').onclick = async () => { await ed.save(); openImageModal(Object.assign({}, ed.note, collect())); };
    ed.poll = setInterval(ed.pull, 20000);
    if (!note.content) setTimeout(() => ta.focus(), 60);
  }

  async function leaveEditor() {
    const ed = S.editor;
    if (!ed) return;
    clearInterval(ed.poll);
    S.editor = null;
    if (ed.dirty) { try { await ed.save(); } catch (e) { /* ignore */ } }
  }

  document.addEventListener('visibilitychange', () => {
    const ed = S.editor; if (!ed) return;
    if (document.hidden) { if (ed.dirty) ed.save(); } else ed.pull();
  });
  window.addEventListener('focus', () => S.editor && S.editor.pull());
  window.addEventListener('pagehide', () => { if (S.editor && S.editor.dirty) S.editor.save(); });

  // ---------- Conflict resolution ----------
  function askConflict(server, local) {
    return new Promise(resolve => {
      const m = $('#conflictModal');
      $('#cfServer').textContent = server.content || '（空）';
      $('#cfLocal').textContent = local.content || '（空）';
      m.hidden = false;
      $$('[data-choice]', m).forEach(b => b.onclick = () => { m.hidden = true; resolve(b.dataset.choice); });
    });
  }

  // ---------- Settings ----------
  function renderSettings() {
    const p = S.profile;
    app.innerHTML = `
      <div class="settings">
        <h1>设置</h1>
        <section class="card">
          <h2>图片水印</h2>
          <label class="field"><span>水印 ID（会以「@ID」平铺在图片上，并作为落款印章）</span>
            <input class="input" id="wmId" maxlength="24" placeholder="例如：书虫小尚" value="${esc(p.watermark_id)}"></label>
          <p class="hint">预览：<span class="wm-preview" id="wmPrev"></span></p>
        </section>
        <section class="card">
          <h2>图片默认样式</h2>
          <div class="img-opts" style="margin:0">
            <div class="seg" id="setMode"><button data-v="portrait">3:4 竖版</button><button data-v="long">长图</button></div>
            <div class="seg" id="setTheme"><button data-v="paper">宣纸</button><button data-v="ink">夜墨</button><button data-v="celadon">青瓷</button></div>
            <label class="check"><input type="checkbox" id="setIndent" ${p.indent ? 'checked' : ''}> 段首缩进</label>
          </div>
        </section>
        <section class="card">
          <h2>账号</h2>
          <p class="hint">${store.mode === 'cloud' ? '已登录：' + esc(S.user.email) : '本地模式：数据只存在这个浏览器。填好 js/config.js 后即可登录同步。'}</p>
          ${store.mode === 'cloud' ? '<button class="btn ghost small" id="signOut">退出登录</button>' : ''}
        </section>
        <button class="btn primary" id="saveSettings" style="width:100%">保存设置</button>
      </div>`;
    const tmp = Object.assign({}, p);
    const paintPrev = () => { $('#wmPrev').textContent = tmp.watermark_id ? '@' + tmp.watermark_id : '（不加水印）'; };
    const bindSeg = (sel, key) => {
      const seg = $(sel);
      const paint = () => $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === tmp[key]));
      $$('button', seg).forEach(b => b.onclick = () => { tmp[key] = b.dataset.v; paint(); });
      paint();
    };
    bindSeg('#setMode', 'image_mode'); bindSeg('#setTheme', 'theme');
    $('#wmId').oninput = (e) => { tmp.watermark_id = e.target.value.trim(); paintPrev(); };
    $('#setIndent').onchange = (e) => { tmp.indent = e.target.checked; };
    paintPrev();
    $('#saveSettings').onclick = async (e) => {
      e.target.disabled = true;
      try { await store.saveProfile(tmp); S.profile = tmp; toast('设置已保存，其他设备刷新后生效'); }
      catch (err) { toast('保存失败：' + errMsg(err), 4000); }
      e.target.disabled = false;
    };
    const so = $('#signOut');
    if (so) so.onclick = async () => { await store.signOut(); S.user = null; route(); };
  }

  // ---------- Image export ----------
  let imgState = null;
  function openImageModal(note) {
    const m = $('#imgModal');
    imgState = { note, mode: S.profile.image_mode, theme: S.profile.theme, indent: S.profile.indent, blobs: [] };
    m.hidden = false;
    const paintSeg = (sel, key) => $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === imgState[key]));
    const bind = (sel, key) => $$(sel + ' button').forEach(b => b.onclick = () => { imgState[key] = b.dataset.v; paintSeg(sel, key); draw(); });
    bind('#optMode', 'mode'); bind('#optTheme', 'theme');
    paintSeg('#optMode', 'mode'); paintSeg('#optTheme', 'theme');
    $('#optIndent').checked = imgState.indent;
    $('#optIndent').onchange = (e) => { imgState.indent = e.target.checked; draw(); };
    $('#imgHint').textContent = S.profile.watermark_id ? `水印：@${S.profile.watermark_id}` : '还没设置水印 ID，可以在「设置」里填写。';
    draw();
  }

  let drawSeq = 0;
  async function draw() {
    const seq = ++drawSeq, st = imgState, box = $('#imgPreview');
    box.className = 'img-preview' + (st.mode === 'long' ? ' long' : '');
    box.innerHTML = '<div class="loading">排版中…</div>';
    $('#btnDownload').disabled = true;
    const canvases = await window.NoteRender.renderNote(st.note, {
      mode: st.mode, theme: st.theme, indent: st.indent, watermarkId: S.profile.watermark_id,
    });
    const blobs = await Promise.all(canvases.map(c => new Promise(r => c.toBlob(r, 'image/png'))));
    if (seq !== drawSeq) return;
    st.blobs.forEach(b => b.url && URL.revokeObjectURL(b.url));
    st.blobs = blobs.map((b, i) => ({ blob: b, url: URL.createObjectURL(b), name: fileName(st.note, i, blobs.length) }));
    box.innerHTML = '';
    st.blobs.forEach(b => { const img = new Image(); img.src = b.url; img.alt = b.name; box.appendChild(img); });
    $('#btnDownload').disabled = false;
    $('#btnDownload').textContent = st.blobs.length > 1 ? `下载全部 ${st.blobs.length} 张` : '下载图片';
    const files = st.blobs.map(b => new File([b.blob], b.name, { type: 'image/png' }));
    $('#btnShare').hidden = !(navigator.canShare && navigator.canShare({ files }));
  }
  function fileName(note, i, n) {
    const t = (note.title || '读后记').replace(/[\\/:*?"<>|]/g, '').slice(0, 30);
    return `${t}-读后记${n > 1 ? '-' + (i + 1) : ''}.png`;
  }
  $('#btnDownload').onclick = async () => {
    for (const b of imgState.blobs) {
      const a = document.createElement('a'); a.href = b.url; a.download = b.name;
      document.body.appendChild(a); a.click(); a.remove();
      await new Promise(r => setTimeout(r, 300));
    }
  };
  $('#btnShare').onclick = async () => {
    const files = imgState.blobs.map(b => new File([b.blob], b.name, { type: 'image/png' }));
    try { await navigator.share({ files, title: `《${imgState.note.title}》读后记` }); } catch (e) { /* user cancelled */ }
  };
  $$('#imgModal [data-close]').forEach(b => b.onclick = () => { $('#imgModal').hidden = true; });
  $('#imgModal').addEventListener('click', e => { if (e.target.id === 'imgModal') e.target.hidden = true; });

  // ---------- Boot ----------
  window.addEventListener('hashchange', route);
  (async function boot() {
    if (store.mode === 'local') {
      const c = window.NOVELNOTES_CONFIG || {};
      if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) $('#localBanner').textContent = '同步组件加载失败（可能是网络问题），现在是本地模式，写的内容不会同步。请检查网络后刷新页面。';
      $('#localBanner').hidden = false;
    }
    store.onAuthChange(u => {
      const was = !!S.user; S.user = u;
      if (was && !u) route();
    });
    S.user = await store.getUser();
    if (S.user) { try { S.profile = await store.getProfile(); } catch (e) { console.warn(e); } }
    route();
  })();
})();
