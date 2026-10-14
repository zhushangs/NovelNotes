// Data layer: uses Supabase when configured, otherwise falls back to browser localStorage
(function () {
  const DEFAULT_PROFILE = { watermark_id: '', image_mode: 'portrait', theme: 'paper', indent: true };
  const NOTE_FIELDS = 'id,title,author,protagonists,content,created_at,updated_at';

  function cleanPatch(p) {
    const out = {};
    ['title', 'author', 'protagonists', 'content'].forEach(k => { if (k in p) out[k] = p[k]; });
    return out;
  }

  // ---------------- Supabase ----------------
  function SupabaseStore(url, key) {
    const sb = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    this.mode = 'cloud';

    this.getUser = async () => {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    };
    this.onAuthChange = (cb) => sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null));
    this.signIn = async (email, password) => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    };
    this.signUp = async (email, password) => {
      const opts = location.protocol.startsWith('http') ? { emailRedirectTo: location.origin + location.pathname } : {};
      const { data, error } = await sb.auth.signUp({ email, password, options: opts });
      if (error) throw error;
      return { needsConfirm: !data.session };
    };
    this.signOut = async () => { await sb.auth.signOut(); };

    this.listNotes = async () => {
      const { data, error } = await sb.from('notes').select(NOTE_FIELDS).order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    };
    this.getNote = async (id) => {
      const { data, error } = await sb.from('notes').select(NOTE_FIELDS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    };
    this.createNote = async (note) => {
      const { data, error } = await sb.from('notes').insert(cleanPatch(note)).select(NOTE_FIELDS).single();
      if (error) throw error;
      return data;
    };
    // base = the updated_at we last read; if another device changed the row since, return a conflict
    this.updateNote = async (id, patch, base) => {
      let q = sb.from('notes').update(cleanPatch(patch)).eq('id', id);
      if (base) q = q.eq('updated_at', base);
      const { data, error } = await q.select(NOTE_FIELDS).maybeSingle();
      if (error) throw error;
      if (!data) return { conflict: true, server: await this.getNote(id) };
      return { ok: true, note: data };
    };
    this.deleteNote = async (id) => {
      const { error } = await sb.from('notes').delete().eq('id', id);
      if (error) throw error;
    };
    this.getProfile = async () => {
      const { data, error } = await sb.from('profiles').select('watermark_id,image_mode,theme,indent').maybeSingle();
      if (error) throw error;
      return Object.assign({}, DEFAULT_PROFILE, data || {});
    };
    this.saveProfile = async (p) => {
      const user = await this.getUser();
      const row = {
        user_id: user.id, watermark_id: p.watermark_id, image_mode: p.image_mode, theme: p.theme, indent: !!p.indent,
      };
      const { error } = await sb.from('profiles').upsert(row, { onConflict: 'user_id' });
      if (error) throw error;
    };
  }

  // ---------------- Local mode ----------------
  function LocalStore() {
    this.mode = 'local';
    const K_NOTES = 'novelnotes.notes', K_PROFILE = 'novelnotes.profile';
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
    const now = () => new Date().toISOString();
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    const user = { id: 'local', email: '本地模式' };

    this.getUser = async () => user;
    this.onAuthChange = () => {};
    this.signIn = async () => {};
    this.signUp = async () => ({ needsConfirm: false });
    this.signOut = async () => {};

    this.listNotes = async () => read(K_NOTES, []).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    this.getNote = async (id) => read(K_NOTES, []).find(n => n.id === id) || null;
    this.createNote = async (note) => {
      const n = Object.assign({ author: '', protagonists: [], content: '' }, cleanPatch(note),
        { id: uid(), created_at: now(), updated_at: now() });
      const all = read(K_NOTES, []); all.push(n); write(K_NOTES, all);
      return n;
    };
    this.updateNote = async (id, patch, base) => {
      const all = read(K_NOTES, []);
      const i = all.findIndex(n => n.id === id);
      if (i < 0) throw new Error('笔记不存在');
      if (base && all[i].updated_at !== base) return { conflict: true, server: all[i] };
      all[i] = Object.assign({}, all[i], cleanPatch(patch), { updated_at: now() });
      write(K_NOTES, all);
      return { ok: true, note: all[i] };
    };
    this.deleteNote = async (id) => write(K_NOTES, read(K_NOTES, []).filter(n => n.id !== id));
    this.getProfile = async () => Object.assign({}, DEFAULT_PROFILE, read(K_PROFILE, {}));
    this.saveProfile = async (p) => write(K_PROFILE, p);
  }

  window.createStore = function () {
    const c = window.NOVELNOTES_CONFIG || {};
    if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase) {
      return new SupabaseStore(c.SUPABASE_URL.trim(), c.SUPABASE_ANON_KEY.trim());
    }
    return new LocalStore();
  };
  window.DEFAULT_PROFILE = DEFAULT_PROFILE;
})();
