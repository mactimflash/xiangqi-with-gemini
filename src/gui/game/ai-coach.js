/* AI Coach: Wukong chooses the move; Cloudflare Worker asks Gemini to explain it. */
(function () {
  'use strict';

  const STORAGE_KEY = 'xiangqi_ai_worker_coach_v2';
  const MAX_HISTORY = 80;
  const WORKER_URL = 'https://cotuong.starlinksatellitewifi.workers.dev';
  const state = loadState();
  let latestCoach = null;
  let lastCommentedPosition = '';
  let requestController = null;

  const $ = (id) => document.getElementById(id);
  const els = {
    status: $('ai-status'), headline: $('ai-headline'), summary: $('ai-summary'),
    strengths: $('ai-strengths'), risks: $('ai-risks'), plan: $('ai-plan'),
    move: $('ai-best-move'), confidence: $('ai-confidence'), workerUrl: $('worker-url'),
    auto: $('gemini-auto'), save: $('gemini-save'),
    clear: $('learning-clear'), stats: $('learning-stats'), settings: $('ai-settings'),
    settingsToggle: $('ai-settings-toggle'), copy: $('copy-guidance'), toast: $('ai-toast'),
    score: $('ai-score'), scoreBar: $('ai-score-bar'), momentum: $('ai-momentum'),
    curiosity: $('ai-curiosity'), streak: $('ai-streak'), xp: $('ai-xp'), level: $('ai-level')
  };


  const setText = (el, value) => { if (el) el.textContent = value; };
  const setHtml = (el, value) => { if (el) el.innerHTML = value; };
  const required = ['status','headline','summary','strengths','risks','plan','move','confidence','score','scoreBar','momentum','curiosity','streak','xp','level'];
  const missing = required.filter((key) => !els[key]);
  if (typeof window.engine === 'undefined' || missing.length) {
    console.warn('[AI Coach] Disabled because required UI is missing:', missing);
    return;
  }
  hydrateSettings(); renderLearningStats(); bindUi(); renderProgress();

  window.addEventListener('xiangqi:coach-result', (event) => {
    latestCoach = event.detail || null;
    if (!latestCoach) return;
    renderEngineGuidance(latestCoach);
    recordSuggestion(latestCoach);
    if (Number(latestCoach.side) === 0 && state.settings.autoAnalyze && state.settings.workerUrl) {
      const key = latestCoach.positionKey || latestCoach.fen || latestCoach.move;
      if (key && key !== lastCommentedPosition) {
        lastCommentedPosition = key;
        window.setTimeout(() => analyzeWithAI(), 180);
      }
    }
  });

  const originalUpdatePgn = window.updatePgn;
  if (typeof originalUpdatePgn === 'function') {
    window.updatePgn = function () {
      const before = state.lastMoveCount || 0;
      const result = originalUpdatePgn.apply(this, arguments);
      try {
        const moves = window.engine.getMoves ? window.engine.getMoves() : [];
        if (moves.length > before) recordPlayedMove(moves[moves.length - 1], ((moves.length - 1) % 2 === 0));
        state.lastMoveCount = moves.length; persist();
      } catch (_) {}
      return result;
    };
  }

  function defaults() {
    return { settings: { workerUrl: WORKER_URL, autoAnalyze: true }, suggestions: [], followed: 0, deviated: 0, streak: 0, bestStreak: 0, xp: 0, lastMoveCount: 0 };
  }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return Object.assign(defaults(), saved || {}, { settings: Object.assign(defaults().settings, saved && saved.settings || {}) });
    } catch (_) { return defaults(); }
  }
  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} }
  function hydrateSettings() { state.settings.workerUrl = WORKER_URL; state.settings.autoAnalyze = true; if (els.workerUrl) els.workerUrl.value = WORKER_URL; if (els.auto) els.auto.checked = true; persist(); setStatus('Bình luận tự động đã sẵn sàng', 'ready'); }
  function bindUi() {
    if (els.save) els.save.addEventListener('click', saveSettings);
    if (els.clear) els.clear.addEventListener('click', clearLearning);
    if (els.settingsToggle && els.settings) els.settingsToggle.addEventListener('click', () => {
      const open = els.settings.classList.toggle('is-open');
      els.settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (els.copy) els.copy.addEventListener('click', copyGuidance);
  }
  function saveSettings() {
    state.settings.workerUrl = WORKER_URL;
    state.settings.autoAnalyze = true;
    persist();
    setStatus('Bình luận tự động đã sẵn sàng', 'ready');
  }
  function clearLearning() {
    state.suggestions = []; state.followed = 0; state.deviated = 0; state.streak = 0; state.bestStreak = 0; state.xp = 0; state.lastMoveCount = 0;
    persist(); renderLearningStats(); renderProgress(); toast('Đã đặt lại hành trình luyện tập.');
  }
  function normalizeUrl(url) { return String(url || '').trim().replace(/\/+$/, ''); }
  function recordSuggestion(detail) {
    const duplicate = state.suggestions[state.suggestions.length - 1];
    if (duplicate && duplicate.fen === (detail.fen || detail.positionKey || '') && duplicate.move === detail.move) return;
    state.suggestions.push({ at: Date.now(), fen: detail.fen || detail.positionKey || '', move: detail.move || '', phase: detail.phase || '', side: detail.side, followed: null });
    if (state.suggestions.length > MAX_HISTORY) state.suggestions.splice(0, state.suggestions.length - MAX_HISTORY);
    persist();
  }
  function recordPlayedMove(move, wasHumanMove) {
    if (!wasHumanMove) return;
    const pending = [...state.suggestions].reverse().find(x => x.followed === null && Number(x.side) === 0);
    if (!pending) return;
    pending.played = move; pending.followed = String(move) === String(pending.move);
    if (pending.followed) { state.followed++; state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak); state.xp += 15 + Math.min(state.streak, 5) * 2; toast('Chuỗi chính xác +' + state.streak + ' · nhận XP'); }
    else { state.deviated++; state.streak = 0; state.xp += 3; }
    persist(); renderLearningStats(); renderProgress();
  }
  function renderLearningStats() {
    const total = state.followed + state.deviated;
    const rate = total ? Math.round(state.followed / total * 100) : 0;
    if (els.stats) els.stats.innerHTML = '<strong>' + total + '</strong> lượt · theo gợi ý <strong>' + rate + '%</strong> · chuỗi tốt nhất <strong>' + state.bestStreak + '</strong>';
  }
  function renderProgress() {
    const level = Math.floor(state.xp / 100) + 1;
    const within = state.xp % 100;
    setText(els.streak, state.streak);
    setText(els.xp, within + '/100 XP');
    setText(els.level, 'Cấp ' + level);
  }
  function renderEngineGuidance(detail) {
    const isRed = Number(detail.side) === 0;
    setText(els.move, detail.move ? describeMove(detail.move) : 'Đang tìm nước phù hợp…');
    setText(els.headline, isRed ? 'Đây là lúc gây khó cho Liu DaHua' : 'Liu DaHua đang chuẩn bị phản đòn');
    setText(els.summary, isRed ? 'AI đang đọc thế cờ và sẽ bình luận ngay sau đây. Hãy nhìn quân được khoanh và hướng mũi tên.' : 'Hãy quan sát: phản ứng của bot sẽ hé lộ kế hoạch tiếp theo.');
    setText(els.confidence, detail.source === 'book' ? 'Khai cuộc' : 'Wukong');
    setText(els.curiosity, isRed ? 'Đi theo mũi tên, rồi AI sẽ chấm xem bạn có giữ được thế chủ động.' : 'Nước đáp trả sắp xuất hiện…');
    setStatus('Wukong · ' + (detail.phaseLabel || detail.phase || 'đang phân tích'), 'ready');
  }
  function describeMove(move) {
    if (!move || move.length < 4) return 'Hãy chờ AI hướng dẫn';
    try {
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      const sourceSquare = findSquare(from);
      const piece = sourceSquare === null ? 0 : window.engine.getPiece(sourceSquare);
      const names = { 1:'Tốt', 2:'Sĩ', 3:'Tượng', 4:'Mã', 5:'Pháo', 6:'Xe', 7:'Tướng', 9:'Tốt', 10:'Sĩ', 11:'Tượng', 12:'Mã', 13:'Pháo', 14:'Xe', 15:'Tướng' };
      const pieceName = names[piece] || 'quân được đánh dấu';
      const ff = from.charCodeAt(0) - 97, tf = to.charCodeAt(0) - 97;
      const fr = Number(from[1]), tr = Number(to[1]);
      const horizontal = ff !== tf && fr === tr;
      const vertical = ff === tf && fr !== tr;
      const distance = Math.max(Math.abs(tf - ff), Math.abs(tr - fr));
      let action = 'di chuyển theo mũi tên';
      if (horizontal) {
        const towardCenter = Math.abs(tf - 4) < Math.abs(ff - 4);
        action = towardCenter ? 'đưa vào gần trung tâm' : 'chuyển sang cánh bên';
      } else if (vertical) {
        const isRedPiece = piece > 0 && piece < 8;
        const forward = isRedPiece ? tr > fr : tr < fr;
        action = forward ? 'tiến lên' : 'lùi về';
        if (distance > 1) action += ' ' + distance + ' bước';
      } else {
        action = 'đi theo đường chéo được đánh dấu';
      }
      const sideHint = (pieceName === 'Pháo' || pieceName === 'Xe' || pieceName === 'Mã')
        ? (ff <= 3 ? ' bên trái' : ff >= 5 ? ' bên phải' : '') : '';
      return pieceName + sideHint + ' ' + action;
    } catch (_) {
      return 'Đi quân đang được khoanh theo mũi tên';
    }
  }
  function findSquare(coord) {
    for (let sq = 0; sq < 154; sq++) if (window.engine.squareToString(sq) === coord) return sq;
    return null;
  }

  function boardSnapshot() {
    const pieceChars = ['.', 'P', 'A', 'B', 'N', 'C', 'R', 'K', 'p', 'a', 'b', 'n', 'c', 'r', 'k'];
    const rows = [];
    for (let rank = 9; rank >= 0; rank--) {
      let row = '';
      for (let file = 0; file < 9; file++) {
        const coord = String.fromCharCode(97 + file) + String(rank); let square = null;
        for (let sq = 0; sq < 154; sq++) if (window.engine.squareToString(sq) === coord) { square = sq; break; }
        row += square === null ? '.' : (pieceChars[window.engine.getPiece(square)] || '.');
      }
      rows.push(row);
    }
    return rows.join('/');
  }
  function learningSummary() {
    return { followed: state.followed, deviated: state.deviated, streak: state.streak, recent: state.suggestions.filter(x => x.followed !== null).slice(-10).map(x => ({ suggested:x.move, played:x.played, followed:x.followed, phase:x.phase })) };
  }

  async function analyzeWithAI() {
    state.settings.workerUrl = WORKER_URL;
    if (!latestCoach || !latestCoach.move) { toast('Wukong chưa có nước để phân tích.'); return; }
    if (requestController) requestController.abort();
    requestController = new AbortController(); setLoading(true);
    try {
      const response = await fetch(WORKER_URL + '/api/analyze', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(buildPayload()), signal:requestController.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
      renderAI(data.result || {}); setStatus('AI đã chấm và mở khóa kế hoạch', 'ready');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[AI Coach]', error); setStatus('Không gọi được AI Worker', 'error');
      setText(els.summary, 'Wukong vẫn hoạt động. Kiểm tra Worker URL, secret và CORS.');
      renderList(els.risks, [error.message], 'Kiểm tra cấu hình Worker.');
    } finally { setLoading(false); }
  }
  function buildPayload() {
    return {
      task:'Bình luận tự động diễn biến hiện tại để người chơi Đỏ hiểu ngay nước nên đi và từng bước gây khó cho bot Liu DaHua.',
      output_schema:{ headline:'tối đa 12 từ', explanation:'2-3 câu', strengths:['2-3 ý'], risks:['2-3 ý'], next_plan:['3 bước'], score:'integer 0-100 đánh giá chất lượng kế hoạch, không phải điểm engine', momentum:'bất lợi|cân bằng|chủ động', curiosity:'1 câu gợi tò mò hợp lý', confidence:'thấp|trung bình|cao' },
      rules:['Giữ nguyên best_move của Wukong','Bình luận như một bình luận viên cờ tướng YouTube vui vẻ, gần gũi, có nhịp điệu và tạo tò mò; không bắt chước nguyên văn bất kỳ cá nhân cụ thể nào','Tuyệt đối không hiển thị hoặc nhắc lại tọa độ kiểu h2, e2, h2-e2 hay ký hiệu UCCI','Chỉ dùng lời nói gần gũi như Pháo phải bình vào giữa, Mã trái tiến lên, đi quân được khoanh theo mũi tên','Không bịa độ sâu hoặc phần trăm thắng','Không hứa chắc chắn chiến thắng','Ngắn gọn, dễ làm theo trên điện thoại','Liu DaHua là bot profile trong repo'],
      position:{ board:boardSnapshot(), fen:latestCoach.fen || '', side_to_move:Number(latestCoach.side)===0?'red/user':'black/bot', phase:latestCoach.phase || '', best_move:latestCoach.move, pv:latestCoach.pv || '', engine_score:typeof latestCoach.score==='number'?latestCoach.score:null },
      player_learning:learningSummary()
    };
  }
  function renderAI(result) {
    setText(els.headline, result.headline || 'Kế hoạch cho nước tiếp theo');
    setText(els.summary, result.explanation || 'AI chưa cung cấp giải thích.');
    renderList(els.strengths, result.strengths, 'Phát triển quân và giữ an toàn cho Tướng.');
    renderList(els.risks, result.risks, 'Theo dõi phản đòn trực tiếp.');
    renderList(els.plan, result.next_plan, 'Đi theo mũi tên rồi chờ phản ứng của bot.');
    const score = Math.max(0, Math.min(100, Number(result.score) || 70));
    setText(els.score, score + '/100'); if (els.scoreBar) els.scoreBar.style.width = score + '%';
    setText(els.momentum, result.momentum || 'cân bằng');
    setText(els.curiosity, result.curiosity || 'Nước đáp trả của Liu DaHua sẽ quyết định kế hoạch kế tiếp.');
    setText(els.confidence, result.confidence || 'trung bình');
  }
  function renderList(element, values, fallback) { const items = Array.isArray(values) && values.length ? values : [fallback]; if (element) element.innerHTML = items.slice(0,4).map(x => '<li>' + escapeHtml(String(x)) + '</li>').join(''); }
  function setLoading(loading) { if (loading) { setStatus('AI đang đọc thế cờ…', 'loading'); setText(els.summary, 'Khoan vội đi — AI đang xem Liu DaHua đang giăng ý đồ gì.'); } }
  function setStatus(text, kind) { if (!els.status) return; setText(els.status, text); els.status.dataset.kind = kind || ''; }
  async function copyGuidance() {
    const text = [els.headline.textContent, 'Gợi ý: '+els.move.textContent, 'Điểm kế hoạch: '+els.score.textContent, els.summary.textContent, 'Kế hoạch: '+Array.from(els.plan.querySelectorAll('li')).map(x=>x.textContent).join(' → ')].join('\n');
    try { await navigator.clipboard.writeText(text); toast('Đã sao chép hướng dẫn.'); } catch (_) { toast('Không thể sao chép.'); }
  }
  function toast(message) { if (!els.toast) return; setText(els.toast, message); els.toast.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>els.toast && els.toast.classList.remove('show'),2200); }
  function escapeHtml(value) { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
})();
