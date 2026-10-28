'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 컬러 스트룹: 화면·입력·소리. 규칙은 logic.js (LOGIC_STROOP)
(() => {
const L = LOGIC_STROOP;
const $ = (id) => document.getElementById(id);
const TUTORIAL = new URLSearchParams(location.search).has('tutorial');
const T = { next: 160, wrongShow: 750, banner: 1100, over: 600 };      // 시간(ms). 시험용으로 줄일 수 있다
const num = (n) => n.toLocaleString('ko-KR');

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let best = Number(store.get('stroopBest')) || 0;
let muted = store.get('stroopMuted') === '1';

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.09) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  ok: (combo) => tone(520 + Math.min(combo, 12) * 40, 0.08, 'triangle', 0.09),
  bad: () => tone(150, 0.25, 'sawtooth', 0.07),
  rule: () => seq([784, 988], 80),
  grow: () => seq([523, 659, 784], 70),
  end: () => seq([523, 440, 392, 330], 130, 'triangle', 0.09),
  record: () => seq([523, 659, 784, 1047], 100),
};
function toggleMute() { muted = !muted; store.set('stroopMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let phase = 'title';                // title · play · over
let run = null;                     // 이번 판 (logic.js newRun)
let qStart = 0, qEnd = 0, paused = 0;   // 문제가 열린 시각·끝나는 시각(performance.now), 일시정지로 멈춘 남은 시간(0 이면 안 멈춤)
let open = false;                   // 지금 답을 받는 중인가 (정답을 보여 주는 동안은 닫힘)
let tickTimer = 0, nextTimer = 0, overTimer = 0, bannerTimer = 0;
let lastRule = 'ink', lastColors = 0, shown = 0;
const limitFor = (n) => (TUTORIAL ? 600000 : L.limitMs(n));

// ---------- 그리기 ----------
function buildAnswers(count) {
  const box = $('answers');
  if (lastColors === count && box.children.length === count) return;
  lastColors = count;
  box.className = count > 4 ? 'c3' : '';
  box.innerHTML = L.COLORS.slice(0, count).map((c, i) => `<button class="ans" type="button" data-i="${i}" style="background:${c.hex}"><small>${i + 1}</small>${c.name}</button>`).join('');
}
function renderHud() {
  const lives = run ? run.lives : L.LIVES;
  $('lives').textContent = lives > 5 ? `❤️×${lives}` : '❤️'.repeat(Math.max(0, lives)) || '💔';
  $('score').textContent = num(run ? run.score : 0);
  $('best').textContent = num(best);
}
function renderQuestion() {
  const q = run && run.q;
  const rule = $('rule');
  if (!q) { return; }
  rule.className = q.rule === 'word' ? 'word' : '';
  rule.innerHTML = q.rule === 'word' ? '🔄 이번엔 <b>글자 뜻</b>을 골라요!' : '<b>글자 색</b>을 골라요 (읽는 게 아니에요!)';
  const w = $('word');
  w.textContent = L.COLORS[q.word].name;
  w.style.color = L.COLORS[q.ink].hex;
  const combo = $('combo');
  if (run.combo >= 2) { combo.textContent = `🔥 ${run.combo}콤보${L.comboMult(run.combo) > 1 ? ` x${L.comboMult(run.combo)}` : ''}`; combo.style.display = 'block'; } else combo.style.display = 'none';
}
function renderBar() {
  if (!run || !run.q || !open) return;
  const left = paused || Math.max(0, qEnd - performance.now());
  const frac = Math.min(1, left / run.q.limit);
  $('tfill').style.transform = `scaleX(${frac})`;
  $('tbar').classList.toggle('low', frac < 0.3 && !TUTORIAL);
}
function say(t) { $('msg').textContent = t; }
function banner(text, color) {
  const b = $('banner');
  b.textContent = text; b.style.color = color || '#fff'; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), T.banner);
}
function flashCard(cls) { const c = $('card'); c.classList.remove('good', 'bad'); void c.offsetWidth; c.classList.add(cls); setTimeout(() => c.classList.remove(cls), 450); }

// ---------- 창 ----------
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

// ---------- 흐름 ----------
function clearTimers() { clearInterval(tickTimer); clearTimeout(nextTimer); clearTimeout(overTimer); }
function start() {
  clearTimers(); hideOverlay();
  run = L.newRun({ lives: TUTORIAL ? 5 : L.LIVES });
  phase = 'play'; paused = 0; lastRule = 'ink'; lastColors = 0; shown = 0;
  $('combo').style.display = 'none';
  say('색이 칠해진 글자를 보고, 그 "색"과 같은 버튼을 눌러요');
  renderHud();
  openQuestion();
}
function openQuestion() {
  if (phase !== 'play' || !run || run.over) return;
  const q = L.nextQuestion(run, Math.random, { limit: limitFor(run.n) });
  if (q.colors !== shown) { if (shown) { sfx.grow(); banner(`${q.colors}가지 색!`, '#ffd23f'); } shown = q.colors; }
  buildAnswers(q.colors);
  if (q.rule !== lastRule) { sfx.rule(); if (q.rule === 'word') banner('🔄 글자 뜻!', '#ffd23f'); else banner('글자 색!', '#fff'); lastRule = q.rule; }
  renderQuestion();
  document.querySelectorAll('.ans').forEach((b) => { b.disabled = false; b.classList.remove('right'); });
  open = true; paused = 0;
  qStart = performance.now(); qEnd = qStart + q.limit;
  renderBar(); renderHud();
  clearInterval(tickTimer); tickTimer = setInterval(tick, 40);
  tutorialSignal('question');
}
function tick() {
  if (phase !== 'play' || !open || paused) return;
  renderBar();
  if (performance.now() >= qEnd) onResult(L.timeUp(run), -1);
}
function choose(i) {
  if (phase !== 'play' || !open || paused || !run || !run.q) return;
  const remain = qEnd - performance.now();
  onResult(L.answer(run, i, remain), i);
}
// 한 문제의 결과: ok / wrong / timeout
function onResult(r, picked) {
  if (r.kind === 'ignored') return;
  open = false; clearInterval(tickTimer);
  const btns = document.querySelectorAll('.ans');
  btns.forEach((b) => { b.disabled = true; });
  if (r.kind === 'ok') {
    sfx.ok(run.combo);
    flashCard('good');
    say(`정답! +${r.points}점${L.comboMult(run.combo - 1) > 1 ? ` (콤보 x${L.comboMult(run.combo - 1)})` : ''}`);
    tutorialSignal('correct');
    renderHud();
    nextTimer = setTimeout(() => (run.over ? finish() : openQuestion()), T.next);
    return;
  }
  sfx.bad();
  flashCard('bad');
  const ans = btns[r.answer];
  if (ans) ans.classList.add('right');
  const ruleWord = lastRule === 'word';
  say(r.kind === 'timeout' ? `시간 초과! 정답은 ${L.COLORS[r.answer].name}` : `아쉬워요! ${ruleWord ? '글자 뜻' : '글자 색'}은 ${L.COLORS[r.answer].name}`);
  tutorialSignal('wrong');
  if (TUTORIAL && run.over) { run.lives = 5; run.over = false; }      // 연습에서는 많이 틀려도 끝나지 않는다
  renderHud();
  nextTimer = setTimeout(() => (run.over ? finish() : openQuestion()), T.wrongShow);
}
function finish() {
  phase = 'over'; clearTimers(); open = false;
  const record = !TUTORIAL && run.score > best;
  if (record) { best = run.score; store.set('stroopBest', String(best)); sfx.record(); } else sfx.end();
  renderHud();
  overTimer = setTimeout(() => showOverlay(`
    <h2>게임 끝!</h2>
    <div class="big">${num(run.score)}</div>
    ${record ? '<span class="tag">🎉 최고 기록!</span>' : ''}
    <dl class="stats card2"><dt>맞힌 문제</dt><dd>${run.correct}개</dd><dt>틀림 · 시간 초과</dt><dd>${run.wrong}번 · ${run.timeout}번</dd><dt>최고 콤보</dt><dd>${run.maxCombo}</dd><dt>최고 점수</dt><dd>${num(best)}점</dd></dl>
    <div class="col"><button data-act="again">다시 하기</button><button class="sub" data-act="home">처음으로</button></div>`), T.over);
}
function showTitle() {
  clearTimers();
  phase = 'title'; run = null; open = false; lastColors = 0; shown = 0;
  $('rule').className = ''; $('rule').innerHTML = '<b>글자 색</b>을 골라요'; $('word').textContent = '초록'; $('word').style.color = L.COLORS[0].hex; $('combo').style.display = 'none';
  $('tfill').style.transform = 'scaleX(1)';
  buildAnswers(4); document.querySelectorAll('.ans').forEach((b) => { b.disabled = true; });
  say(''); renderHud();
  showOverlay(`
    <h1>컬러 스트룹</h1>
    <p>글자를 <b>읽지 말고</b>, 칠해진 <b>색</b>을 골라요!</p>
    <div class="card2" style="font-size:13px">예: <b style="color:#ef4444">초록</b> 이라고 쓰인 글자가 빨강이면 → <b>빨강</b> 버튼<br>문제마다 <b>제한 시간</b>이 있고 점점 짧아져요 · 목숨 ❤️ 3개<br>틀리거나 시간이 지나면 ❤️ 하나를 잃고 콤보가 끊겨요<br>가끔 <b>"글자 뜻"</b>을 고르는 규칙으로 바뀌어요!<br>빨리 맞힐수록, 콤보가 쌓일수록 점수가 커져요${best ? `<br>내 최고 점수 <b>${num(best)}점</b>` : ''}</div>
    <div class="col"><button data-act="start">시작하기</button></div>`);
}

// ---------- 입력 ----------
$('answers').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.ans');
  if (!b) return;
  e.preventDefault();
  choose(Number(b.dataset.i));
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (overlayOpen()) return;
  const m = /^(Digit|Numpad)([1-6])$/.exec(e.code);
  if (m) choose(Number(m[2]) - 1);
});
$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  const act = btn.dataset.act;
  if (act === 'start' || act === 'again') start();
  else if (act === 'home') showTitle();
});
// 화면이 가려지면 시간이 흘러 목숨을 잃지 않게 멈췄다가 돌아오면 이어서
document.addEventListener('visibilitychange', () => {
  if (phase !== 'play' || !open) return;
  if (document.hidden) { paused = Math.max(1, qEnd - performance.now()); clearInterval(tickTimer); }
  else if (paused) { qEnd = performance.now() + paused; paused = 0; clearInterval(tickTimer); tickTimer = setInterval(tick, 40); }
});

showTitle();

/* @test-hooks:start */
window.__sp = { get run() { return run; }, get phase() { return phase; }, get open() { return open; }, T, start, choose, onResult, openQuestion, tick, renderBar, L };
/* @test-hooks:end */
})();
