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
    auto: $('gemini-auto'), save: $('gemini-save'), analyze: $('gemini-analyze'),
    clear: $('learning-clear'), stats: $('learning-stats'), settings: $('ai-settings'),
    settingsToggle: $('ai-settings-toggle'), copy: $('copy-guidance'), toast: $('ai-toast'),
    score: $('ai-score'), scoreBar: $('ai-score-bar'), momentum: $('ai-momentum'),
    curiosity: $('ai-curiosity'), streak: $('ai-streak'), xp: $('ai-xp'), level: $('ai-level')
  };

  if (!els.status || typeof window.engine === 'undefined') return;
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
        analyzeWithAI(false);
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
  function hydrateSettings() { state.settings.workerUrl = WORKER_URL; if (els.workerUrl) els.workerUrl.value = WORKER_URL; if (els.auto) els.auto.checked = true; persist(); setStatus('AI sẵn sàng', 'ready'); }
  function bindUi() {
    if (els.save) els.save.addEventListener('click', saveSettings);
    els.analyze.addEventListener('click', () => analyzeWithAI(true));
    els.clear.addEventListener('click', clearLearning);
    if (els.settingsToggle && els.settings) els.settingsToggle.addEventListener('click', () => {
      const open = els.settings.classList.toggle('is-open');
      els.settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    els.copy.addEventListener('click', copyGuidance);
  }
  function saveSettings() {
    state.settings.workerUrl = WORKER_URL;
    state.settings.autoAnalyze = true;
    persist();
    setStatus('AI sẵn sàng', 'ready');
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
    els.stats.innerHTML = '<strong>' + total + '</strong> lượt · theo gợi ý <strong>' + rate + '%</strong> · chuỗi tốt nhất <strong>' + state.bestStreak + '</strong>';
  }
  function renderProgress() {
    const level = Math.floor(state.xp / 100) + 1;
    const within = state.xp % 100;
    els.streak.textContent = state.streak;
    els.xp.textContent = within + '/100 XP';
    els.level.textContent = 'Cấp ' + level;
  }
  function renderEngineGuidance(detail) {
    const isRed = Number(detail.side) === 0;
    els.move.textContent = detail.move ? formatMove(detail.move) : 'Đang tính…';
    els.headline.textContent = isRed ? 'Nước tiếp theo để gây khó cho Liu DaHua' : 'Liu DaHua đang chuẩn bị phản đòn';
    els.summary.textContent = isRed ? 'Wukong đã chọn một nước hợp lệ. Nhấn phân tích để biết vì sao nước này đáng đi.' : 'Hãy quan sát: phản ứng của bot sẽ hé lộ kế hoạch tiếp theo.';
    els.confidence.textContent = detail.source === 'book' ? 'Khai cuộc' : 'Wukong';
    els.curiosity.textContent = isRed ? 'Đi theo mũi tên, rồi AI sẽ chấm xem bạn có giữ được thế chủ động.' : 'Nước đáp trả sắp xuất hiện…';
    setStatus('Wukong · ' + (detail.phaseLabel || detail.phase || 'đang phân tích'), 'ready');
  }
  function formatMove(move) { return !move || move.length < 4 ? (move || '—') : move.slice(0,2) + ' → ' + move.slice(2,4); }

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

  async function analyzeWithAI(manual) {
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
      if (manual) toast('Phân tích mới đã sẵn sàng.');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[AI Coach]', error); setStatus('Không gọi được AI Worker', 'error');
      els.summary.textContent = 'Wukong vẫn hoạt động. Kiểm tra Worker URL, secret và CORS.';
      renderList(els.risks, [error.message], 'Kiểm tra cấu hình Worker.');
    } finally { setLoading(false); }
  }
  function buildPayload() {
    return {
      task:'Bình luận nước Wukong để người chơi Đỏ từng bước vượt qua bot Liu DaHua.',
      output_schema:{ headline:'tối đa 12 từ', explanation:'2-3 câu', strengths:['2-3 ý'], risks:['2-3 ý'], next_plan:['3 bước'], score:'integer 0-100 đánh giá chất lượng kế hoạch, không phải điểm engine', momentum:'bất lợi|cân bằng|chủ động', curiosity:'1 câu gợi tò mò hợp lý', confidence:'thấp|trung bình|cao' },
      rules:['Giữ nguyên best_move của Wukong','Không bịa độ sâu hoặc phần trăm thắng','Không hứa chắc chắn chiến thắng','Ngắn gọn, dễ làm theo trên điện thoại','Liu DaHua là bot profile trong repo'],
      position:{ board:boardSnapshot(), fen:latestCoach.fen || '', side_to_move:Number(latestCoach.side)===0?'red/user':'black/bot', phase:latestCoach.phase || '', best_move:latestCoach.move, pv:latestCoach.pv || '', engine_score:typeof latestCoach.score==='number'?latestCoach.score:null },
      player_learning:learningSummary()
    };
  }
  function renderAI(result) {
    els.headline.textContent = result.headline || 'Kế hoạch cho nước tiếp theo';
    els.summary.textContent = result.explanation || 'AI chưa cung cấp giải thích.';
    renderList(els.strengths, result.strengths, 'Phát triển quân và giữ an toàn cho Tướng.');
    renderList(els.risks, result.risks, 'Theo dõi phản đòn trực tiếp.');
    renderList(els.plan, result.next_plan, 'Đi theo mũi tên rồi chờ phản ứng của bot.');
    const score = Math.max(0, Math.min(100, Number(result.score) || 70));
    els.score.textContent = score + '/100'; els.scoreBar.style.width = score + '%';
    els.momentum.textContent = result.momentum || 'cân bằng';
    els.curiosity.textContent = result.curiosity || 'Nước đáp trả của Liu DaHua sẽ quyết định kế hoạch kế tiếp.';
    els.confidence.textContent = result.confidence || 'trung bình';
  }
  function renderList(element, values, fallback) { const items = Array.isArray(values) && values.length ? values : [fallback]; element.innerHTML = items.slice(0,4).map(x => '<li>' + escapeHtml(String(x)) + '</li>').join(''); }
  function setLoading(loading) { els.analyze.disabled = loading; els.analyze.textContent = loading ? 'AI đang suy nghĩ…' : 'AI phân tích nước này'; if (loading) setStatus('Đang hỏi Gemini qua Worker', 'loading'); }
  function setStatus(text, kind) { els.status.textContent = text; els.status.dataset.kind = kind || ''; }
  async function copyGuidance() {
    const text = [els.headline.textContent, 'Nước: '+els.move.textContent, 'Điểm kế hoạch: '+els.score.textContent, els.summary.textContent, 'Kế hoạch: '+Array.from(els.plan.querySelectorAll('li')).map(x=>x.textContent).join(' → ')].join('\n');
    try { await navigator.clipboard.writeText(text); toast('Đã sao chép hướng dẫn.'); } catch (_) { toast('Không thể sao chép.'); }
  }
  function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>els.toast.classList.remove('show'),2200); }
  function escapeHtml(value) { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
})();
