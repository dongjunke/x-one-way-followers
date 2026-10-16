(() => {
  'use strict';

  const STORAGE_KEY = 'x-one-way-followers-state-v1';
  const RESERVED = new Set([
    'home', 'explore', 'notifications', 'messages', 'bookmarks', 'lists', 'communities',
    'settings', 'i', 'search', 'compose', 'intent', 'privacy', 'terms', 'help', 'login',
    'logout', 'signup', 'account', 'tos', 'about', 'jobs', 'download', 'premium'
  ]);
  const MAX_ROUNDS = 120;
  let host;
  let root;
  let panel;
  let localState;
  let runningForPage = false;
  let cancelled = false;
  let lastPage = '';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function make(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value);
    });
    children.forEach((child) => el.append(child));
    return el;
  }

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'x-one-way-followers-root';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel { position: fixed; z-index: 2147483647; top: 20px; right: 20px; width: min(378px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: hidden; color: #f5f3eb; background: #10120f; border: 1px solid rgba(245,243,235,.16); border-radius: 4px; box-shadow: 0 22px 70px rgba(0,0,0,.45), 0 0 0 1px rgba(216,255,85,.03); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .panel::before { content: ''; display: block; height: 3px; background: #d8ff55; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; padding: 19px 20px 13px; background: radial-gradient(circle at 90% 0%, rgba(216,255,85,.14), transparent 48%); }
        .eyebrow { color: #d8ff55; font-size: 9px; font-weight: 800; letter-spacing: .16em; }
        h2 { margin: 9px 0 0; font: 500 29px/.95 Georgia, 'Times New Roman', serif; letter-spacing: -.06em; }
        h2 em { color: #d8ff55; font-style: normal; }
        .close { width: 26px; height: 26px; border: 1px solid rgba(245,243,235,.16); border-radius: 50%; background: transparent; color: #9c9d95; cursor: pointer; font: 18px/1 ui-monospace, monospace; }
        .close:hover { border-color: #d8ff55; color: #d8ff55; }
        .body { padding: 0 20px 19px; }
        .intro { margin: 0 0 17px; color: #9c9d95; font-size: 10px; line-height: 1.6; }
        .action { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 13px 14px; border: 0; border-radius: 3px; background: #d8ff55; color: #11140d; cursor: pointer; font: 800 11px ui-monospace, monospace; text-align: left; }
        .action:hover { background: #ecff9d; }
        .action[disabled] { cursor: wait; opacity: .7; }
        .action .arrow { font-size: 18px; line-height: 10px; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 17px 0 15px; border: 1px solid rgba(245,243,235,.12); background: rgba(245,243,235,.12); }
        .stat { min-width: 0; padding: 11px 9px 10px; background: #151814; }
        .stat strong { display: block; color: #f5f3eb; font: 500 22px/1 Georgia, serif; letter-spacing: -.04em; }
        .stat span { display: block; overflow: hidden; margin-top: 5px; color: #9c9d95; font-size: 8px; letter-spacing: .04em; text-overflow: ellipsis; white-space: nowrap; }
        .progress { display: none; margin: 11px 0 15px; color: #d8ff55; font-size: 10px; line-height: 1.5; }
        .progress.visible { display: block; }
        .bar { height: 3px; margin-top: 8px; overflow: hidden; background: rgba(216,255,85,.16); }
        .bar i { display: block; width: 35%; height: 100%; background: #d8ff55; animation: crawl 1.2s ease-in-out infinite; }
        @keyframes crawl { 0% { transform: translateX(-130%); } 100% { transform: translateX(310%); } }
        .error { display: none; margin: 12px 0; padding: 10px 11px; border-left: 2px solid #ff8d76; background: rgba(255,141,118,.08); color: #ffb6a5; font-size: 10px; line-height: 1.5; }
        .error.visible { display: block; }
        .results { max-height: 44vh; overflow: auto; margin: 4px -7px 0 0; padding-right: 5px; }
        .results::-webkit-scrollbar { width: 4px; } .results::-webkit-scrollbar-thumb { background: rgba(216,255,85,.4); }
        .result { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-bottom: 1px solid rgba(245,243,235,.09); }
        .avatar { flex: 0 0 31px; width: 31px; height: 31px; border-radius: 50%; object-fit: cover; background: #272b25; }
        .avatar.fallback { display: grid; place-items: center; color: #d8ff55; font: 700 12px ui-monospace, monospace; }
        .person { min-width: 0; flex: 1; } .person strong, .person span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .person strong { color: #f5f3eb; font: 500 13px Georgia, serif; } .person span { margin-top: 3px; color: #9c9d95; font-size: 9px; }
        .visit { color: #d8ff55; font-size: 16px; text-decoration: none; }
        .empty { padding: 22px 8px; color: #9c9d95; font-size: 10px; line-height: 1.7; text-align: center; }
        .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 13px; padding-top: 13px; border-top: 1px solid rgba(245,243,235,.12); color: #777a72; font-size: 8px; line-height: 1.5; }
        .export { border: 0; border-bottom: 1px solid #d8ff55; background: transparent; color: #d8ff55; cursor: pointer; font: inherit; }
        .stop { border-color: rgba(255,141,118,.55); background: transparent; color: #ffb6a5; }
      </style>
      <section class="panel" aria-label="X 单向关注筛选器">
        <header class="head"><div><div class="eyebrow">X / FOLLOW AUDIT</div><h2>单向<em>关注</em></h2></div><button class="close" title="关闭面板" aria-label="关闭面板">×</button></header>
        <div class="body">
          <p class="intro">扫描你的 Following 与 Followers，找出没有回关你的账号。</p>
          <button class="action" type="button"><span>开始扫描</span><span class="arrow">↗</span></button>
          <div class="stats"><div class="stat"><strong data-stat="following">—</strong><span>FOLLOWING</span></div><div class="stat"><strong data-stat="followers">—</strong><span>FOLLOWERS</span></div><div class="stat"><strong data-stat="oneway">—</strong><span>单向关注</span></div></div>
          <div class="progress"><span class="progress-text">正在准备…</span><div class="bar"><i></i></div></div>
          <div class="error"></div>
          <div class="results"></div>
          <footer class="foot"><span>仅读取公开列表 · 不自动取消关注</span><button class="export" type="button">导出 CSV</button></footer>
        </div>
      </section>`;
    document.documentElement.append(host);
    panel = {
      root,
      panel: root.querySelector('.panel'),
      close: root.querySelector('.close'),
      action: root.querySelector('.action'),
      stats: {
        following: root.querySelector('[data-stat="following"]'),
        followers: root.querySelector('[data-stat="followers"]'),
        oneway: root.querySelector('[data-stat="oneway"]')
      },
      progress: root.querySelector('.progress'),
      progressText: root.querySelector('.progress-text'),
      error: root.querySelector('.error'),
      results: root.querySelector('.results'),
      export: root.querySelector('.export')
    };
    panel.close.addEventListener('click', () => { host.style.display = 'none'; });
    panel.action.addEventListener('click', () => startScan());
    panel.export.addEventListener('click', exportCsv);
  }

  function showPanel() {
    mount();
    host.style.display = 'block';
    render(localState);
  }

  function render(state = localState) {
    if (!panel) return;
    localState = state || { status: 'idle' };
    const following = localState.following?.length || 0;
    const followers = localState.followers?.length || 0;
    const results = localState.results || [];
    panel.stats.following.textContent = following || '—';
    panel.stats.followers.textContent = followers || '—';
    panel.stats.oneway.textContent = localState.status === 'done' ? results.length : '—';
    const running = localState.status === 'scanning';
    panel.action.disabled = running;
    panel.action.classList.toggle('stop', running);
    panel.action.querySelector('span:first-child').textContent = running ? '停止扫描' : (localState.status === 'done' ? '重新扫描' : '开始扫描');
    panel.action.querySelector('.arrow').textContent = running ? '×' : '↗';
    panel.progress.classList.toggle('visible', running);
    panel.progressText.textContent = running ? (localState.phase === 'following' ? `正在读取 Following · 已找到 ${following} 个` : `正在读取 Followers · 已找到 ${followers} 个`) : '';
    panel.error.classList.toggle('visible', Boolean(localState.error));
    panel.error.textContent = localState.error || '';
    if (localState.status === 'done') {
      panel.results.innerHTML = '';
      if (!results.length) panel.results.append(make('div', { className: 'empty', text: '没有发现单向关注，或者两个列表没有完整加载。' }));
      results.forEach((person) => panel.results.append(resultRow(person)));
    } else if (!running) {
      panel.results.innerHTML = '';
    }
  }

  function resultRow(person) {
    const row = make('div', { className: 'result' });
    if (person.avatar) row.append(make('img', { className: 'avatar', src: person.avatar, alt: '', loading: 'lazy' }));
    else row.append(make('div', { className: 'avatar fallback', text: (person.handle || '?')[0].toUpperCase() }));
    const info = make('div', { className: 'person' });
    info.append(make('strong', { text: person.name || `@${person.handle}` }));
    info.append(make('span', { text: `@${person.handle}` }));
    row.append(info);
    row.append(make('a', { className: 'visit', href: `https://x.com/${person.handle}`, target: '_blank', rel: 'noreferrer', text: '↗' }));
    return row;
  }

  async function getState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || { status: 'idle' };
  }

  async function setState(next) {
    localState = next;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    render(next);
  }

  function cleanHandle(value) {
    return String(value || '').replace(/^@/, '').trim().toLowerCase();
  }

  function pathHandle() {
    const parts = location.pathname.split('/').filter(Boolean);
    const candidate = cleanHandle(parts[0]);
    return candidate && !RESERVED.has(candidate) && /^[a-z0-9_]{1,15}$/i.test(candidate) ? candidate : '';
  }

  function pageKind() {
    const parts = location.pathname.split('/').filter(Boolean).map(cleanHandle);
    if (parts.length >= 2 && (parts[1] === 'following' || parts[1] === 'followers')) return parts[1];
    return 'profile';
  }

  function ownHandle() {
    const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"], a[aria-label="Profile"]');
    const href = profile?.getAttribute('href') || '';
    const match = href.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    return cleanHandle(match?.[1]);
  }

  function resolveIdentity() {
    return ownHandle() || (pageKind() === 'profile' ? pathHandle() : '');
  }

  function profileHrefFromCell(cell) {
    const links = [...cell.querySelectorAll('a[href]')];
    const link = links.find((candidate) => {
      try {
        const url = new URL(candidate.href);
        const parts = url.pathname.split('/').filter(Boolean);
        return url.hostname.endsWith('x.com') || url.hostname.endsWith('twitter.com')
          ? parts.length === 1 && !RESERVED.has(parts[0].toLowerCase()) && /^[A-Za-z0-9_]{1,15}$/.test(parts[0])
          : false;
      } catch { return false; }
    });
    if (!link) return null;
    const handle = cleanHandle(new URL(link.href).pathname.split('/').filter(Boolean)[0]);
    const nameNode = cell.querySelector('[dir="auto"]');
    const img = cell.querySelector('img');
    return { handle, name: (nameNode?.textContent || '').trim().replace(/\s+/g, ' '), avatar: img?.src || '' };
  }

  function collectUsers() {
    const cells = [...document.querySelectorAll('[data-testid="UserCell"]')];
    const found = [];
    const seen = new Set();
    cells.forEach((cell) => {
      const person = profileHrefFromCell(cell);
      if (person && person.handle && !seen.has(person.handle)) { seen.add(person.handle); found.push(person); }
    });
    return found;
  }

  async function scanList(phase, token) {
    const people = new Map();
    let noProgress = 0;
    let previousHeight = 0;
    let previousSize = 0;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (cancelled) break;
      collectUsers().forEach((person) => people.set(person.handle, person));
      if (people.size === previousSize && document.body.scrollHeight === previousHeight) noProgress += 1;
      else noProgress = 0;
      previousSize = people.size;
      previousHeight = document.body.scrollHeight;
      const next = { ...localState, [phase]: [...people.values()] };
      localState = next;
      render(next);
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
      if (noProgress >= 5 && atBottom) break;
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      await sleep(950);
      if (token !== localState.token) break;
    }
    return [...people.values()];
  }

  function navigateTo(username, section) {
    const target = `/${username}/${section}`;
    if (location.pathname.toLowerCase() !== target.toLowerCase()) location.href = target;
  }

  async function startScan() {
    if (localState?.status === 'scanning') {
      cancelled = true;
      await setState({ ...localState, status: 'stopped', error: '扫描已停止。' });
      return;
    }
    const username = resolveIdentity();
    if (!username) {
      await setState({ status: 'error', error: '无法识别当前登录账号。请先打开你自己的 X 个人主页，再点击开始扫描。' });
      showPanel();
      return;
    }
    cancelled = false;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const state = { status: 'scanning', phase: 'following', username, profileUrl: `https://x.com/${username}`, following: [], followers: [], results: [], token, startedAt: Date.now() };
    await setState(state);
    showPanel();
    navigateTo(username, 'following');
    await maybeRunPhase();
  }

  async function maybeRunPhase() {
    if (runningForPage) return;
    const state = await getState();
    localState = state;
    if (state.status !== 'scanning' || !state.username || !['following', 'followers'].includes(state.phase)) { render(state); return; }
    const kind = pageKind();
    if (kind !== state.phase || pathHandle() !== state.username) {
      navigateTo(state.username, state.phase);
      return;
    }
    runningForPage = true;
    mount();
    showPanel();
    await sleep(1000);
    const list = await scanList(state.phase, state.token);
    if (cancelled) { runningForPage = false; return; }
    const latest = await getState();
    if (latest.token !== state.token) { runningForPage = false; return; }
    if (state.phase === 'following') {
      const next = { ...latest, phase: 'followers', following: list };
      await setState(next);
      runningForPage = false;
      navigateTo(state.username, 'followers');
      return;
    }
    const following = latest.following || [];
    const followerSet = new Set(list.map((person) => person.handle));
    const results = following.filter((person) => !followerSet.has(person.handle));
    const done = { ...latest, status: 'done', phase: 'done', followers: list, results, finishedAt: Date.now(), error: '' };
    await setState(done);
    runningForPage = false;
    if (location.pathname.toLowerCase() !== `/${state.username}`) location.href = `/${state.username}`;
  }

  function exportCsv() {
    const results = localState?.results || [];
    if (!results.length) return;
    const rows = [['handle', 'name', 'profile_url'], ...results.map((person) => [`@${person.handle}`, person.name || '', `https://x.com/${person.handle}`])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `x-one-way-following-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  chrome.runtime.onMessage.addListener((message) => {
    mount();
    if (message.type === 'START_SCAN') startScan();
    if (message.type === 'SHOW_PANEL') showPanel();
  });

  async function boot() {
    mount();
    localState = await getState();
    render(localState);
    if (localState.status === 'scanning') maybeRunPhase();
    setInterval(() => {
      const page = `${location.pathname}${location.search}`;
      if (page !== lastPage) { lastPage = page; runningForPage = false; }
      if (localState?.status === 'scanning') maybeRunPhase();
    }, 1400);
  }

  boot();
})();
