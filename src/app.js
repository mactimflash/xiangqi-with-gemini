(() => {
  'use strict';

  const WORKER_BASE = 'https://cotuong.starlinksatellitewifi.workers.dev';
  const SETTINGS_KEY = 'liu-dahua-coach-settings-v3';
  const PROFILE_KEY = 'liu-dahua-coach-profile-v1';
  const PIECE_CHARS = ['', 'P', 'A', 'B', 'N', 'C', 'R', 'K', 'p', 'a', 'b', 'n', 'c', 'r', 'k'];
  const PIECE_MAP = {
    1: 'red-pawn', 2: 'red-advisor', 3: 'red-elephant', 4: 'red-knight', 5: 'red-cannon', 6: 'red-rook', 7: 'red-king',
    8: 'black-pawn', 9: 'black-advisor', 10: 'black-elephant', 11: 'black-knight', 12: 'black-cannon', 13: 'black-rook', 14: 'black-king'
  };
  const PIECE_NAME = {
    1: 'Tốt đỏ', 2: 'Sĩ đỏ', 3: 'Tượng đỏ', 4: 'Mã đỏ', 5: 'Pháo đỏ', 6: 'Xe đỏ', 7: 'Tướng đỏ',
    8: 'Tốt đen', 9: 'Sĩ đen', 10: 'Tượng đen', 11: 'Mã đen', 12: 'Pháo đen', 13: 'Xe đen', 14: 'Tướng đen'
  };
  const QUALITY = {
    best: { label: 'Tốt nhất', className: 'quality-best' },
    good: { label: 'Tốt', className: 'quality-good' },
    inaccuracy: { label: 'Thiếu chính xác', className: 'quality-inaccuracy' },
    mistake: { label: 'Sai lầm', className: 'quality-mistake' },
    blunder: { label: 'Sai lầm nặng', className: 'quality-blunder' },
    bot: { label: 'Liễu Đại Hoa', className: 'quality-bot' }
  };
  const DIFFICULTY = {
    quick: { botMs: 170, reviewMs: 100, label: 'Nhanh' },
    standard: { botMs: 430, reviewMs: 180, label: 'Thực chiến' },
    deep: { botMs: 850, reviewMs: 300, label: 'Sâu' }
  };

  const engine = new Engine();
  engine.setBoard(engine.START_FEN);

  const $ = selector => document.querySelector(selector);
  const els = {
    pieces: $('#piecesLayer'), selection: $('#selectionLayer'), turn: $('#turnLabel'), state: $('#engineState'),
    title: $('#suggestionTitle'), text: $('#suggestionText'), feed: $('#decisionFeed'), count: $('#moveCount'),
    toast: $('#toast'), setup: $('#setupDialog'), history: $('#historyDialog'), review: $('#reviewDialog'),
    userSide: $('#userSideSelect'), difficulty: $('#difficultySelect'), botToggle: $('#botToggle'),
    exerciseBar: $('#exerciseBar'), exerciseTitle: $('#exerciseTitle'), exerciseText: $('#exerciseText'),
    nextExercise: $('#nextExerciseBtn'), exitExercise: $('#exitExerciseBtn'), exerciseBadge: $('#exerciseBadge'),
    mistakeCount: $('#mistakeCount'), dueCount: $('#dueCount')
  };

  const profileId = getOrCreateProfileId();
  const settings = loadSettings();
  let userSide = settings.userSide;
  let botEnabled = settings.botEnabled;
  let difficulty = settings.difficulty;
  let selected = null;
  let recommendedTarget = null;
  let flip = userSide === 'black';
  let searching = false;
  let lastSuggestion = null;
  let botTimer = null;
  let sessionId = crypto.randomUUID();
  let startedAt = new Date().toISOString();
  let initialFen = engine.START_FEN;
  let decisionLog = [];
  let mistakes = [];
  let remoteDueCount = 0;
  let setupMode = false;
  let setupPiece = 1;
  let setupBoard = new Map();
  let setupSnapshot = null;
  let exerciseMode = false;
  let exerciseResolved = false;
  let activeExercise = null;
  let suspendedGame = null;
  let excludedExerciseIds = new Set();

  const coordMap = new Map();
  for (let sq = 0; sq < 154; sq++) {
    const coord = engine.squareToString(sq);
    if (coord && coord !== 'xx') coordMap.set(coord, sq);
  }

  applySettingsToUi();

  function getOrCreateProfileId() {
    let value = localStorage.getItem(PROFILE_KEY);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(PROFILE_KEY, value);
    }
    return value;
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        userSide: saved.userSide === 'black' ? 'black' : 'red',
        botEnabled: saved.botEnabled !== false,
        difficulty: DIFFICULTY[saved.difficulty] ? saved.difficulty : 'standard'
      };
    } catch {
      return { userSide: 'red', botEnabled: true, difficulty: 'standard' };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ userSide, botEnabled, difficulty }));
  }

  function applySettingsToUi() {
    els.userSide.value = userSide;
    els.difficulty.value = difficulty;
    els.botToggle.checked = botEnabled;
  }

  function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('x-profile-id', profileId);
    return fetch(`${WORKER_BASE}${path}`, { ...options, headers });
  }

  function pieceColor(piece) {
    return piece >= 8 ? 'black' : piece > 0 ? 'red' : null;
  }

  function currentColor() {
    return engine.getSide() === engine.COLOR.RED ? 'red' : 'black';
  }

  function isHumanTurn() {
    if (exerciseMode) return !exerciseResolved;
    return !botEnabled || currentColor() === userSide;
  }

  function squareToPoint(square) {
    const coord = engine.squareToString(Number(square));
    if (!coord || coord === 'xx') return null;
    let file = coord.charCodeAt(0) - 97;
    let rank = Number(coord[1]);
    if (flip) {
      file = 8 - file;
      rank = 9 - rank;
    }
    return { x: 10 + file * 10, y: 92.78 - rank * 9.44 };
  }

  function currentFen() {
    const rows = [];
    for (let rank = 9; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 9; file++) {
        const square = coordMap.get(String.fromCharCode(97 + file) + rank);
        const piece = engine.getPiece(square) || 0;
        if (!piece) {
          empty++;
          continue;
        }
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += PIECE_CHARS[piece];
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join('/')} ${currentColor() === 'red' ? 'w' : 'b'} - - ${engine.getSixty() || 0} 1`;
  }

  function renderBoard() {
    const fragment = document.createDocumentFragment();
    for (let rank = 0; rank < 10; rank++) {
      for (let file = 0; file < 9; file++) {
        const square = coordMap.get(String.fromCharCode(97 + file) + rank);
        const piece = engine.getPiece(square);
        if (!piece) continue;
        const point = squareToPoint(square);
        const button = document.createElement('button');
        button.className = `piece${selected === square ? ' selected' : ''}`;
        button.style.left = `${point.x}%`;
        button.style.top = `${point.y}%`;
        button.dataset.square = String(square);
        button.setAttribute('aria-label', PIECE_NAME[piece]);
        const image = document.createElement('img');
        image.src = `/assets/pieces/${PIECE_MAP[piece]}.svg?v=2`;
        image.alt = PIECE_NAME[piece];
        image.width = 100;
        image.height = 100;
        image.decoding = 'async';
        image.draggable = false;
        image.addEventListener('error', () => {
          image.hidden = true;
          button.classList.add('piece-fallback');
          button.dataset.label = PIECE_NAME[piece].split(' ')[0];
        }, { once: true });
        button.appendChild(image);
        button.addEventListener('click', () => tapSquare(square));
        fragment.appendChild(button);
      }
    }
    els.pieces.replaceChildren(fragment);
    renderTargets();
    updateTurnLabel();
  }

  function updateTurnLabel() {
    if (exerciseMode) {
      els.turn.textContent = exerciseResolved ? 'Đã chấm bài' : 'Đến lượt bạn giải';
      return;
    }
    const sideName = currentColor() === 'red' ? 'Đỏ' : 'Đen';
    const actor = botEnabled && currentColor() !== userSide ? ' · Liễu Đại Hoa' : ' · Bạn';
    els.turn.textContent = `${sideName} đang đi${actor}`;
  }

  function legalMovesFrom(square) {
    return engine.generateLegalMoves().filter(item => engine.getSourceSquare(item.move) === Number(square));
  }

  function renderTargets() {
    els.selection.replaceChildren();
    if (selected == null) return;
    const fragment = document.createDocumentFragment();
    for (const item of legalMovesFrom(selected)) {
      const target = engine.getTargetSquare(item.move);
      const point = squareToPoint(target);
      const dot = document.createElement('button');
      dot.className = `target-dot${recommendedTarget === target ? ' recommended' : ''}`;
      dot.style.left = `${point.x}%`;
      dot.style.top = `${point.y}%`;
      dot.ariaLabel = recommendedTarget === target ? 'Nước được đề xuất' : 'Đi đến đây';
      dot.addEventListener('click', () => tapSquare(target));
      fragment.appendChild(dot);
    }
    els.selection.appendChild(fragment);
  }

  function tapSquare(square) {
    if (setupMode) {
      if (setupBoard.has(Number(square))) setupBoard.delete(Number(square));
      else setupBoard.set(Number(square), setupPiece);
      renderSetupBoard();
      return;
    }
    if (searching || exerciseResolved) return;
    if (!isHumanTurn()) {
      toast('Đang đến lượt Liễu Đại Hoa');
      return;
    }

    const piece = engine.getPiece(Number(square));
    if (selected == null) {
      if (!piece || pieceColor(piece) !== currentColor()) {
        toast('Hãy chọn quân của bên đang đi');
        return;
      }
      selected = Number(square);
      recommendedTarget = null;
      renderBoard();
      return;
    }

    if (piece && pieceColor(piece) === currentColor()) {
      selected = Number(square);
      recommendedTarget = null;
      renderBoard();
      return;
    }

    const moveString = engine.squareToString(selected) + engine.squareToString(Number(square));
    if (!engine.moveFromString(moveString)) {
      toast('Nước này không hợp lệ');
      selected = null;
      recommendedTarget = null;
      renderBoard();
      return;
    }

    if (exerciseMode) {
      handleExerciseMove(moveString);
      return;
    }
    playUserMove(moveString);
  }

  function configureSearch(milliseconds) {
    engine.resetTimeControl();
    const timing = engine.getTimeControl();
    const now = Date.now();
    timing.timeSet = 1;
    timing.time = milliseconds;
    timing.stopTime = now + milliseconds;
    engine.setTimeControl(timing);
  }

  function searchBest(milliseconds) {
    configureSearch(milliseconds);
    const move = engine.search(32);
    if (!move) return null;
    const moveString = engine.moveToString(move);
    if (!/^[a-i][0-9][a-i][0-9]$/.test(moveString)) return null;
    return {
      encoded: move,
      move: moveString,
      from: engine.getSourceSquare(move),
      to: engine.getTargetSquare(move)
    };
  }

  function assessUserMove(moveString) {
    const beforeFen = currentFen();
    const best = searchBest(DIFFICULTY[difficulty].reviewMs);
    let bestOutcome = Number(engine.evaluate?.() || 0);
    if (best?.move) {
      engine.loadMoves(best.move);
      bestOutcome = -Number(engine.evaluate?.() || 0);
      engine.takeBack();
    }

    engine.loadMoves(moveString);
    const playedOutcome = -Number(engine.evaluate?.() || 0);
    engine.takeBack();

    const sameMove = best?.move === moveString;
    let loss = sameMove ? 0 : Math.max(40, Math.round(bestOutcome - playedOutcome));
    if (!Number.isFinite(loss)) loss = sameMove ? 0 : 40;
    const quality = classifyLoss(loss, sameMove);
    return { beforeFen, bestMove: best?.move || moveString, loss, quality };
  }

  function classifyLoss(loss, sameMove) {
    if (sameMove) return 'best';
    if (loss <= 30) return 'good';
    if (loss <= 85) return 'inaccuracy';
    if (loss <= 180) return 'mistake';
    return 'blunder';
  }

  function playUserMove(moveString) {
    searching = true;
    els.state.textContent = 'Đang đối chiếu…';
    els.title.textContent = 'Đang kiểm tra quyết định của bạn';
    els.text.textContent = 'Wukong so sánh nước vừa chọn với phương án tốt hơn trước khi Liễu Đại Hoa đáp lại.';
    selected = null;
    recommendedTarget = null;
    renderBoard();

    setTimeout(() => {
      try {
        const assessment = assessUserMove(moveString);
        const entry = applyMove(moveString, 'user', assessment);
        if (['inaccuracy', 'mistake', 'blunder'].includes(assessment.quality)) {
          const mistake = createMistake(entry, assessment);
          entry.mistake_id = mistake.id;
        }
        updateCoachAfterUser(entry, assessment);
      } catch (error) {
        console.error(error);
        toast('Không thể đánh giá nước đi này');
      } finally {
        searching = false;
        els.state.textContent = 'Sẵn sàng';
        renderBoard();
        renderFeed();
        updateLearningCounters();
      }

      if (isGameOver()) {
        showGameOver();
      } else if (botEnabled) {
        scheduleBotMove();
      } else {
        scheduleHint();
      }
    }, 24);
  }

  function applyMove(moveString, actor, assessment = {}) {
    const move = engine.moveFromString(moveString);
    if (!move) throw new Error(`Illegal move: ${moveString}`);
    const from = engine.getSourceSquare(move);
    const to = engine.getTargetSquare(move);
    const movingPiece = engine.getPiece(from);
    const capturedPiece = engine.getPiece(to);
    const fenBefore = assessment.beforeFen || currentFen();
    engine.loadMoves(moveString);
    const entry = {
      ply: engine.getMoves().length,
      side: pieceColor(movingPiece),
      actor,
      move: moveString,
      piece: PIECE_NAME[movingPiece],
      capture: capturedPiece ? PIECE_NAME[capturedPiece] : null,
      fen_before: fenBefore,
      best_move: assessment.bestMove || moveString,
      loss_cp: Number(assessment.loss || 0),
      quality: actor === 'liu_bot' ? 'bot' : (assessment.quality || 'good'),
      played_at: new Date().toISOString()
    };
    decisionLog.push(entry);
    selected = null;
    recommendedTarget = null;
    lastSuggestion = null;
    return entry;
  }

  function createMistake(entry, assessment) {
    const duplicate = mistakes.find(item => item.fen === entry.fen_before && item.played_move === entry.move);
    if (duplicate) return duplicate;
    const severity = assessment.quality;
    const mistake = {
      id: crypto.randomUUID(),
      ply: entry.ply,
      fen: entry.fen_before,
      side: entry.side,
      played_move: entry.move,
      best_move: assessment.bestMove,
      loss_cp: assessment.loss,
      severity,
      piece: entry.piece,
      title: severity === 'blunder' ? 'Tránh sai lầm nặng' : severity === 'mistake' ? 'Tìm phương án chắc hơn' : 'Chỉnh lại độ chính xác',
      explanation: buildMistakeExplanation(entry, assessment),
      created_at: new Date().toISOString(),
      practiced: false
    };
    mistakes.push(mistake);
    return mistake;
  }

  function buildMistakeExplanation(entry, assessment) {
    const bestText = formatCoordinateMove(assessment.bestMove);
    const captureText = entry.capture ? ` Nước đã đi có bắt ${entry.capture.toLowerCase()}, nhưng vẫn bỏ lỡ thế tốt hơn.` : '';
    return `${entry.piece} đã đi chưa tối ưu.${captureText} Hãy quay lại vị trí này và tìm nước ${bestText}.`;
  }

  function updateCoachAfterUser(entry, assessment) {
    const quality = QUALITY[assessment.quality];
    if (assessment.quality === 'best') {
      els.title.textContent = 'Bạn đã tìm đúng nước tốt nhất';
      els.text.textContent = 'Quyết định này giữ được thế chủ động. Liễu Đại Hoa sẽ tự tìm phương án phản công.';
      return;
    }
    if (assessment.quality === 'good') {
      els.title.textContent = 'Nước đi hợp lý, vẫn còn phương án sắc hơn';
      els.text.textContent = `Mức chênh ước tính ${assessment.loss}. Hệ thống chưa xếp đây là lỗi cần ôn.`;
      return;
    }
    els.title.textContent = `${quality.label}: đã tạo một bài tập mới`;
    els.text.textContent = `Lần sau bạn sẽ được đưa trở lại đúng vị trí trước nước ${entry.move} để tự tìm phương án tốt hơn.`;
  }

  function scheduleBotMove() {
    clearTimeout(botTimer);
    if (!botEnabled || exerciseMode || currentColor() === userSide || isGameOver()) return;
    els.state.textContent = 'Liễu đang suy nghĩ…';
    els.title.textContent = 'Liễu Đại Hoa đang tìm thế phản công';
    els.text.textContent = 'Bot ưu tiên nước thực dụng, giữ quân chắc và khai thác sai lầm vừa xuất hiện.';
    botTimer = setTimeout(playBotMove, 360);
  }

  function playBotMove() {
    if (!botEnabled || exerciseMode || currentColor() === userSide || isGameOver()) return;
    searching = true;
    setTimeout(() => {
      try {
        const fenBefore = currentFen();
        const best = searchBest(DIFFICULTY[difficulty].botMs);
        if (!best?.move) throw new Error('No legal bot move');
        const entry = applyMove(best.move, 'liu_bot', { beforeFen: fenBefore, bestMove: best.move, loss: 0, quality: 'bot' });
        els.title.textContent = formatMoveTitle(entry.move, entry.piece);
        els.text.textContent = heuristicReason(entry);
      } catch (error) {
        console.error(error);
        els.title.textContent = 'Ván cờ đã dừng';
        els.text.textContent = 'Bot không tìm thấy nước hợp lệ tiếp theo.';
      } finally {
        searching = false;
        els.state.textContent = 'Sẵn sàng';
        renderBoard();
        renderFeed();
      }

      if (isGameOver()) showGameOver();
      else scheduleHint();
    }, 30);
  }

  function scheduleHint() {
    if (exerciseMode || searching || !isHumanTurn() || isGameOver()) return;
    const run = () => requestHint(false);
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 650 });
    else setTimeout(run, 180);
  }

  function requestHint(force = true) {
    if (searching || exerciseMode || !isHumanTurn() || isGameOver()) return;
    if (!force && selected !== null) return;
    searching = true;
    els.state.textContent = 'Đang tính…';
    els.title.textContent = 'Liễu Đại Hoa đang gợi ý cho bạn';
    els.text.textContent = 'Đang tìm một nước chắc chắn, giữ áp lực và hạn chế phản công.';
    setTimeout(() => {
      try {
        const best = searchBest(force ? DIFFICULTY[difficulty].reviewMs + 120 : DIFFICULTY[difficulty].reviewMs);
        if (!best) throw new Error('No hint');
        lastSuggestion = best.move;
        selected = best.from;
        recommendedTarget = best.to;
        els.title.textContent = formatMoveTitle(best.move, PIECE_NAME[engine.getPiece(best.from)]);
        els.text.textContent = `Gợi ý: ${formatCoordinateMove(best.move)}. Đây là phương án tham khảo từ engine cục bộ.`;
      } catch (error) {
        console.error(error);
        els.title.textContent = 'Chưa tìm được phương án';
        els.text.textContent = 'Thế cờ có thể đã kết thúc hoặc cần kiểm tra lại cách xếp quân.';
      } finally {
        searching = false;
        els.state.textContent = 'Sẵn sàng';
        renderBoard();
      }
    }, 20);
  }

  function formatMoveTitle(moveString, pieceName) {
    const from = moveString.slice(0, 2);
    const to = moveString.slice(2, 4);
    const df = to.charCodeAt(0) - from.charCodeAt(0);
    const dr = Number(to[1]) - Number(from[1]);
    let action = 'di chuyển';
    if (df === 0) action = dr > 0 ? 'tiến' : 'thoái';
    else if (dr === 0) action = 'bình';
    else action = 'đi chéo';
    return `${pieceName || 'Quân'} ${action}: ${from} → ${to}`;
  }

  function formatCoordinateMove(moveString) {
    return moveString && moveString.length >= 4 ? `${moveString.slice(0, 2)} → ${moveString.slice(2, 4)}` : 'chưa xác định';
  }

  function heuristicReason(entry) {
    const reasons = [];
    if (entry.capture) reasons.push(`bắt ${entry.capture.toLowerCase()} để thay đổi cán cân`);
    if (/Xe|Pháo/.test(entry.piece)) reasons.push('phát huy quân chủ lực trên đường thông thoáng');
    if (/Mã/.test(entry.piece)) reasons.push('đưa Mã đến điểm linh hoạt hơn');
    if (/Tốt/.test(entry.piece)) reasons.push('mở không gian và giữ điểm quan trọng');
    if (!reasons.length) reasons.push('củng cố đội hình trước khi phản công');
    return `Góc nhìn mô phỏng: ${reasons.join(', ')}.`;
  }

  function renderFeed() {
    els.count.textContent = `${decisionLog.length} nước`;
    if (!decisionLog.length) {
      els.feed.innerHTML = '<div class="empty-state">Các quyết định sẽ xuất hiện tại đây sau khi bạn bắt đầu di chuyển quân.</div>';
      return;
    }
    els.feed.innerHTML = decisionLog.slice().reverse().map(entry => {
      const quality = QUALITY[entry.quality] || QUALITY.good;
      const owner = entry.actor === 'liu_bot' ? 'LIỄU ĐẠI HOA' : 'BẠN';
      const detail = entry.actor === 'liu_bot'
        ? heuristicReason(entry)
        : entry.quality === 'best'
          ? 'Bạn đã trùng với phương án tốt nhất của engine.'
          : entry.mistake_id
            ? `Đã lưu vị trí trước nước này thành bài tập. Nước tốt hơn: ${formatCoordinateMove(entry.best_move)}.`
            : 'Nước hợp lý và chưa đủ chênh lệch để tạo bài tập.';
      return `<article class="decision-item">
        <div class="decision-meta"><span class="move-no">NƯỚC ${entry.ply} · ${owner}</span><span class="quality-chip ${quality.className}">${quality.label}</span></div>
        <strong>${escapeHtml(entry.piece)}: ${escapeHtml(formatCoordinateMove(entry.move))}</strong>
        <p>${escapeHtml(detail)}</p>
      </article>`;
    }).join('');
  }

  function updateLearningCounters() {
    const localDue = mistakes.filter(item => !item.practiced && !item.persisted).length;
    els.mistakeCount.textContent = String(mistakes.length);
    els.dueCount.textContent = String(localDue + remoteDueCount);
    els.exerciseBadge.textContent = String(localDue + remoteDueCount);
  }

  function isGameOver() {
    try {
      return engine.generateLegalMoves().length === 0;
    } catch {
      return true;
    }
  }

  function detectResult() {
    if (!isGameOver()) return 'unfinished';
    return currentColor() === 'red' ? 'black_win' : 'red_win';
  }

  function showGameOver() {
    clearTimeout(botTimer);
    const result = detectResult();
    els.title.textContent = result === 'red_win' ? 'Đỏ thắng ván cờ' : 'Đen thắng ván cờ';
    els.text.textContent = mistakes.length
      ? `Ván đã kết thúc. Bạn có ${mistakes.length} vị trí đáng ôn lại trước ván tiếp theo.`
      : 'Ván đã kết thúc. Hãy lưu ván để Gemini tổng kết toàn bộ mạch quyết định.';
    els.state.textContent = 'Kết thúc';
  }

  function undo() {
    if (exerciseMode) {
      exitExerciseMode();
      return;
    }
    clearTimeout(botTimer);
    if (!decisionLog.length) {
      toast('Không còn nước để đi lại');
      return;
    }
    const removeCount = botEnabled && decisionLog.at(-1)?.actor === 'liu_bot' ? Math.min(2, decisionLog.length) : 1;
    try {
      for (let i = 0; i < removeCount; i++) {
        engine.takeBack();
        const removed = decisionLog.pop();
        if (removed?.mistake_id) mistakes = mistakes.filter(item => item.id !== removed.mistake_id);
      }
      selected = null;
      recommendedTarget = null;
      lastSuggestion = null;
      renderBoard();
      renderFeed();
      updateLearningCounters();
      if (botEnabled && currentColor() !== userSide) scheduleBotMove();
      else scheduleHint();
    } catch (error) {
      console.error(error);
      toast('Không thể đi lại nước này');
    }
  }

  function resetGame(ask = true) {
    if (ask && decisionLog.length && !confirm('Bắt đầu ván mới và bỏ lịch sử hiện tại?')) return;
    clearTimeout(botTimer);
    if (exerciseMode) exitExerciseMode(false);
    engine.setBoard(engine.START_FEN);
    initialFen = engine.START_FEN;
    decisionLog = [];
    mistakes = [];
    sessionId = crypto.randomUUID();
    startedAt = new Date().toISOString();
    selected = null;
    recommendedTarget = null;
    lastSuggestion = null;
    flip = userSide === 'black';
    renderBoard();
    renderFeed();
    updateLearningCounters();
    els.state.textContent = 'Sẵn sàng';
    els.title.textContent = userSide === 'red' ? 'Bạn cầm Đỏ, hãy đi nước đầu tiên' : 'Bạn cầm Đen, Liễu Đại Hoa sẽ khai cuộc';
    els.text.textContent = 'Mỗi quyết định của bạn sẽ được đối chiếu và biến thành bài tập khi cần.';
    if (botEnabled && userSide === 'black') scheduleBotMove();
    else scheduleHint();
  }

  function openSetup() {
    if (exerciseMode) exitExerciseMode();
    clearTimeout(botTimer);
    setupSnapshot = snapshotGame();
    setupMode = true;
    setupBoard.clear();
    for (let sq = 0; sq < 154; sq++) {
      const piece = engine.getPiece(sq);
      if (piece) setupBoard.set(sq, piece);
    }
    $('#setupSide').value = currentColor();
    buildPalette();
    els.setup.showModal();
  }

  function buildPalette() {
    const palette = $('#palette');
    palette.innerHTML = '';
    for (const [piece, asset] of Object.entries(PIECE_MAP)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `palette-piece${Number(piece) === setupPiece ? ' active' : ''}`;
      button.innerHTML = `<img src="/assets/pieces/${asset}.svg" alt="${PIECE_NAME[piece]}">`;
      button.onclick = () => {
        setupPiece = Number(piece);
        buildPalette();
      };
      palette.appendChild(button);
    }
  }

  function fenFromSetup() {
    const rows = [];
    for (let rank = 9; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 9; file++) {
        const square = coordMap.get(String.fromCharCode(97 + file) + rank);
        const piece = setupBoard.get(square) || 0;
        if (!piece) {
          empty++;
          continue;
        }
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += PIECE_CHARS[piece];
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join('/')} ${$('#setupSide').value === 'red' ? 'w' : 'b'} - - 0 1`;
  }

  function renderSetupBoard() {
    try {
      engine.setBoard(fenFromSetup());
      renderBoard();
    } catch (error) {
      console.error(error);
    } finally {
      setupMode = true;
    }
  }

  function applySetup() {
    try {
      const fen = fenFromSetup();
      engine.setBoard(fen);
      initialFen = fen;
      decisionLog = [];
      mistakes = [];
      sessionId = crypto.randomUUID();
      startedAt = new Date().toISOString();
      selected = null;
      recommendedTarget = null;
      setupMode = false;
      setupSnapshot = null;
      els.setup.close();
      renderBoard();
      renderFeed();
      updateLearningCounters();
      if (botEnabled && currentColor() !== userSide) scheduleBotMove();
      else scheduleHint();
    } catch (error) {
      console.error(error);
      toast('Thế cờ chưa hợp lệ');
    }
  }

  function snapshotGame() {
    return {
      initialFen,
      moveText: engine.getMoves().join(' '),
      decisionLog: structuredClone(decisionLog),
      mistakes: structuredClone(mistakes),
      sessionId,
      startedAt,
      flip
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    engine.setBoard(snapshot.initialFen);
    if (snapshot.moveText) engine.loadMoves(snapshot.moveText);
    initialFen = snapshot.initialFen;
    decisionLog = structuredClone(snapshot.decisionLog);
    mistakes = structuredClone(snapshot.mistakes);
    sessionId = snapshot.sessionId;
    startedAt = snapshot.startedAt;
    flip = snapshot.flip;
    selected = null;
    recommendedTarget = null;
    renderBoard();
    renderFeed();
    updateLearningCounters();
  }

  async function saveGame() {
    if (!decisionLog.length) {
      toast('Hãy đi ít nhất một nước trước khi lưu');
      return;
    }
    const button = $('#saveBtn');
    button.disabled = true;
    button.textContent = 'Đang lưu…';
    try {
      const payload = {
        profile_id: profileId,
        session_id: sessionId,
        title: `Ván đấu Liễu Đại Hoa ${new Date().toLocaleDateString('vi-VN')}`,
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        initial_fen: initialFen,
        final_fen: currentFen(),
        user_side: userSide,
        mode: botEnabled ? 'vs_liu_bot' : 'analysis_board',
        difficulty,
        moves: decisionLog,
        move_text: engine.getMoves(),
        mistakes,
        result: detectResult(),
        device: 'mobile-web'
      };
      const response = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      mistakes.forEach(item => { item.persisted = true; });
      await refreshExerciseStats();
      toast(`Đã lưu ván và tạo ${data.exercises_created || 0} bài ôn`);
    } catch (error) {
      console.error(error);
      toast('Chưa thể lưu ván. Kiểm tra Worker và D1.');
    } finally {
      button.disabled = false;
      button.textContent = 'Lưu ván';
    }
  }

  async function refreshExerciseStats() {
    try {
      const response = await apiFetch('/api/stats');
      if (!response.ok) return;
      const data = await response.json();
      remoteDueCount = Number(data.due_exercises || 0);
      updateLearningCounters();
    } catch {
      // Offline/local mode remains usable.
    }
  }

  function nextLocalExercise() {
    return mistakes.find(item => !item.practiced && !excludedExerciseIds.has(item.id)) || null;
  }

  async function fetchRemoteExercise() {
    const response = await apiFetch('/api/exercises?limit=10');
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return (data.items || []).find(item => !excludedExerciseIds.has(item.id)) || null;
  }

  async function startExerciseMode() {
    if (searching || setupMode) return;
    if (!exerciseMode) suspendedGame = snapshotGame();
    let exercise = nextLocalExercise();
    if (exercise) exercise = { ...exercise, persisted: Boolean(exercise.persisted) };
    if (!exercise) {
      try {
        exercise = await fetchRemoteExercise();
        if (exercise) exercise.persisted = true;
      } catch (error) {
        console.error(error);
      }
    }
    if (!exercise) {
      toast('Chưa có sai lầm nào đến hạn ôn');
      if (exerciseMode) exitExerciseMode();
      return;
    }
    enterExercise(exercise);
  }

  function enterExercise(exercise) {
    clearTimeout(botTimer);
    activeExercise = exercise;
    exerciseMode = true;
    exerciseResolved = false;
    selected = null;
    recommendedTarget = null;
    engine.setBoard(exercise.fen);
    flip = exercise.side === 'black';
    els.exerciseBar.hidden = false;
    els.exerciseTitle.textContent = exercise.title || 'Tìm nước tốt hơn';
    els.exerciseText.textContent = exercise.explanation || 'Hãy tìm phương án tốt nhất trong vị trí mà bạn từng mắc lỗi.';
    els.nextExercise.hidden = true;
    els.userSide.disabled = true;
    els.difficulty.disabled = true;
    els.botToggle.disabled = true;
    els.state.textContent = 'Chế độ bài tập';
    els.title.textContent = 'Đây là vị trí trước sai lầm của bạn';
    els.text.textContent = 'Đi đúng một nước. Hệ thống sẽ so với phương án bạn đã bỏ lỡ.';
    renderBoard();
  }

  function handleExerciseMove(moveString) {
    if (!activeExercise || exerciseResolved) return;
    const correct = moveString === activeExercise.best_move;
    exerciseResolved = true;
    excludedExerciseIds.add(activeExercise.id);
    if (correct) {
      applyMoveForExercise(moveString);
      els.exerciseTitle.textContent = 'Chính xác — bạn đã sửa được sai lầm';
      els.exerciseText.textContent = `Nước ${formatCoordinateMove(moveString)} là phương án cần ghi nhớ. Bài sẽ được giãn lịch ôn.`;
      els.title.textContent = 'Bạn đã tìm đúng nước tốt hơn';
      els.text.textContent = 'Một lần trả lời đúng chưa đủ; hệ thống sẽ đưa lại bài này theo chu kỳ 1–3–7–14 ngày.';
      if (!activeExercise.persisted) {
        const local = mistakes.find(item => item.id === activeExercise.id);
        if (local) local.practiced = true;
      }
    } else {
      selected = coordMap.get(activeExercise.best_move.slice(0, 2));
      recommendedTarget = coordMap.get(activeExercise.best_move.slice(2, 4));
      els.exerciseTitle.textContent = 'Chưa đúng — hãy nhìn nước bạn đã bỏ lỡ';
      els.exerciseText.textContent = `Phương án cần nhớ là ${formatCoordinateMove(activeExercise.best_move)}. Bài này sẽ quay lại sớm hơn.`;
      els.title.textContent = 'Sai lầm này vẫn cần luyện lại';
      els.text.textContent = 'Nguồn và đích của nước đúng đang được đánh dấu trên bàn.';
      renderBoard();
    }
    els.nextExercise.hidden = false;
    updateLearningCounters();
    submitExerciseAttempt(activeExercise, moveString, correct);
  }

  function applyMoveForExercise(moveString) {
    const move = engine.moveFromString(moveString);
    if (move) engine.loadMoves(moveString);
    selected = null;
    recommendedTarget = null;
    renderBoard();
  }

  async function submitExerciseAttempt(exercise, move, correct) {
    if (!exercise.persisted) return;
    try {
      await apiFetch(`/api/exercises/${encodeURIComponent(exercise.id)}/attempt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ move, correct })
      });
      await refreshExerciseStats();
    } catch (error) {
      console.error(error);
    }
  }

  function exitExerciseMode(restore = true) {
    exerciseMode = false;
    exerciseResolved = false;
    activeExercise = null;
    els.exerciseBar.hidden = true;
    els.nextExercise.hidden = true;
    els.userSide.disabled = false;
    els.difficulty.disabled = false;
    els.botToggle.disabled = false;
    if (restore && suspendedGame) restoreSnapshot(suspendedGame);
    suspendedGame = null;
    els.state.textContent = 'Sẵn sàng';
    if (restore && botEnabled && currentColor() !== userSide) scheduleBotMove();
    else if (restore) scheduleHint();
  }

  async function openHistory() {
    els.history.showModal();
    const list = $('#historyList');
    list.innerHTML = '<div class="empty-state">Đang tải lịch sử…</div>';
    try {
      const response = await apiFetch('/api/sessions?limit=30');
      const data = await response.json();
      if (!data.items?.length) {
        list.innerHTML = '<div class="empty-state">Bạn chưa lưu ván nào.</div>';
        return;
      }
      list.innerHTML = data.items.map(item => `<article class="history-item">
        <div><strong>${escapeHtml(item.title)}</strong><p>${item.move_count} nước · ${item.mistake_count || 0} lỗi · ${new Date(item.created_at).toLocaleString('vi-VN')} · ${statusLabel(item.analysis_status)}</p></div>
        <button data-id="${escapeHtml(item.id)}">Xem lại</button>
      </article>`).join('');
      list.querySelectorAll('button').forEach(button => {
        button.onclick = () => openReview(button.dataset.id);
      });
    } catch (error) {
      console.error(error);
      list.innerHTML = '<div class="empty-state">Không tải được lịch sử. Hãy kiểm tra Worker.</div>';
    }
  }

  async function openReview(id) {
    els.history.close();
    els.review.showModal();
    $('#reviewContent').innerHTML = '<div class="empty-state">Đang mở bản phân tích…</div>';
    try {
      const response = await apiFetch(`/api/sessions/${encodeURIComponent(id)}`);
      const data = await response.json();
      $('#reviewTitle').textContent = data.title || 'Ván cờ của bạn';
      const analysis = data.analysis || {};
      const storedMistakes = data.mistakes || [];
      $('#reviewContent').innerHTML = `
        <section class="review-section"><h3>Tóm tắt ván cờ</h3><p>${escapeHtml(analysis.summary || 'Gemini đang hoàn thiện bản phân tích. Hãy quay lại sau.')}</p></section>
        <section class="review-section"><h3>Điểm làm tốt</h3>${listHtml(analysis.strengths)}</section>
        <section class="review-section"><h3>Điểm nên cải thiện</h3>${listHtml(analysis.improvements)}</section>
        <section class="review-section"><h3>Góc nhìn mô phỏng Liễu Đại Hoa</h3><p>${escapeHtml(analysis.liu_dahua_lens || 'Chưa có dữ liệu.')}</p></section>
        <section class="review-section"><h3>Ba bài học cần nhớ</h3>${listHtml(analysis.lessons)}</section>
        <section class="review-section"><h3>Bài tập được tạo (${storedMistakes.length})</h3>${mistakesHtml(storedMistakes)}</section>`;
    } catch (error) {
      console.error(error);
      $('#reviewContent').innerHTML = '<div class="empty-state">Không tải được bản phân tích.</div>';
    }
  }

  function mistakesHtml(items) {
    if (!Array.isArray(items) || !items.length) return '<p>Ván này chưa phát hiện lỗi đủ lớn để tạo bài tập.</p>';
    return `<div class="mistake-list">${items.map(item => `<div class="mistake-row"><strong>Nước ${item.ply}: ${escapeHtml(item.title || 'Sai lầm')}</strong><span>${escapeHtml(formatCoordinateMove(item.played_move))} → nên đi ${escapeHtml(formatCoordinateMove(item.best_move))}</span></div>`).join('')}</div>`;
  }

  function statusLabel(status) {
    return status === 'complete' ? 'Đã phân tích' : status === 'processing' ? 'Đang phân tích' : status === 'failed' ? 'Phân tích lỗi' : 'Đang chờ';
  }

  function listHtml(value) {
    return Array.isArray(value) && value.length
      ? `<ul>${value.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<p>Chưa có dữ liệu.</p>';
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  $('#undoBtn').onclick = undo;
  $('#hintBtn').onclick = () => requestHint(true);
  $('#saveBtn').onclick = saveGame;
  $('#newBtn').onclick = () => resetGame(true);
  $('#setupBtn').onclick = openSetup;
  $('#flipBtn').onclick = () => {
    flip = !flip;
    renderBoard();
  };
  $('#practiceBtn').onclick = startExerciseMode;
  $('#exerciseBtn').onclick = startExerciseMode;
  els.nextExercise.onclick = startExerciseMode;
  els.exitExercise.onclick = () => exitExerciseMode();
  $('#historyBtn').onclick = openHistory;
  $('#closeHistory').onclick = () => els.history.close();
  $('#closeReview').onclick = () => els.review.close();
  $('#applySetup').onclick = event => {
    event.preventDefault();
    applySetup();
  };
  $('#clearSetup').onclick = () => {
    setupBoard.clear();
    renderSetupBoard();
    toast('Đã xóa bàn. Chạm vào bàn để đặt quân.');
  };

  els.userSide.onchange = () => {
    userSide = els.userSide.value === 'black' ? 'black' : 'red';
    saveSettings();
    resetGame(false);
  };
  els.difficulty.onchange = () => {
    difficulty = DIFFICULTY[els.difficulty.value] ? els.difficulty.value : 'standard';
    saveSettings();
    toast(`Độ sâu: ${DIFFICULTY[difficulty].label}`);
  };
  els.botToggle.onchange = () => {
    botEnabled = els.botToggle.checked;
    saveSettings();
    toast(botEnabled ? 'Liễu Đại Hoa sẽ tự động đi' : 'Đã tắt tự động đi');
    if (!botEnabled) {
      clearTimeout(botTimer);
      els.state.textContent = 'Sẵn sàng';
      scheduleHint();
    } else if (currentColor() !== userSide) scheduleBotMove();
  };

  $('#boardWrap').addEventListener('click', event => {
    if (!setupMode || event.target.closest('.piece,.target-dot')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    let file = Math.round((x - 0.10) / 0.10);
    let visualRank = Math.round((y - 0.0722) / 0.0944);
    file = Math.max(0, Math.min(8, file));
    visualRank = Math.max(0, Math.min(9, visualRank));
    let rank = 9 - visualRank;
    if (flip) {
      file = 8 - file;
      rank = 9 - rank;
    }
    const square = coordMap.get(String.fromCharCode(97 + file) + rank);
    if (setupBoard.has(square)) setupBoard.delete(square);
    else setupBoard.set(square, setupPiece);
    renderSetupBoard();
  });

  els.setup.addEventListener('close', () => {
    if (setupMode && setupSnapshot) {
      setupMode = false;
      restoreSnapshot(setupSnapshot);
      setupSnapshot = null;
      if (botEnabled && currentColor() !== userSide) scheduleBotMove();
      else scheduleHint();
    }
  });

  renderBoard();
  renderFeed();
  updateLearningCounters();
  refreshExerciseStats();
  els.state.textContent = 'Sẵn sàng';
  if (botEnabled && userSide === 'black') scheduleBotMove();
  else scheduleHint();
})();
