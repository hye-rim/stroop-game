'use strict';
// 컬러 스트룹: 규칙. 화면 없이 Node 에서 시험한다 (브라우저에서는 전역 LOGIC_STROOP).
// 색 이름 글자가 다른 색으로 칠해져 나온다. 기본 규칙은 '글자 색(칠해진 색)'을 고르는 것이고,
// 가끔 '글자 뜻(글자가 말하는 색)'을 고르라고 규칙이 바뀐다. 문제마다 제한 시간이 있고 점점 짧아진다.
const LOGIC_STROOP = (() => {
  const COLORS = [
    { id: 'red', name: '빨강', hex: '#ef4444' },
    { id: 'blue', name: '파랑', hex: '#3b82f6' },
    { id: 'green', name: '초록', hex: '#22c55e' },
    { id: 'yellow', name: '노랑', hex: '#facc15' },
    { id: 'purple', name: '보라', hex: '#a855f7' },
    { id: 'orange', name: '주황', hex: '#f97316' },
  ];
  const LIVES = 3;
  const BASE_POINTS = 10, SPEED_MAX = 10;          // 한 문제 10점 + 빨리 맞힐수록 최대 10점
  const COMBO_STEP = 5, COMBO_MAX = 5;             // 콤보 5개마다 배수 +1, 최대 x5
  const SAME_RATE = 0.2;                            // 글자와 색이 같은 쉬운 문제가 나올 확률
  const START_MS = 3200, FLOOR_MS = 1200, SHRINK_MS = 50;   // 문제 제한 시간: 처음 3.2초, 문제마다 50ms 씩 줄어 1.2초까지
  const WORD_FROM = 12, WORD_LEN = 4, WORD_EVERY = 16;       // 12번째 문제부터 4문제 동안 '글자 뜻' 규칙, 그 뒤 16문제 주기로 되풀이

  // 지금까지 푼 문제 수 n 에 따라 쓰는 색 개수: 처음 4색, 8문제 뒤 5색, 20문제 뒤 6색
  const colorsFor = (n) => (n < 8 ? 4 : n < 20 ? 5 : 6);
  const ruleFor = (n) => (n >= WORD_FROM && (n - WORD_FROM) % WORD_EVERY < WORD_LEN ? 'word' : 'ink');
  const limitMs = (n) => Math.max(FLOOR_MS, START_MS - SHRINK_MS * n);
  const comboMult = (combo) => Math.min(COMBO_MAX, 1 + Math.floor(combo / COMBO_STEP));   // combo = 지금까지 이어서 맞힌 수

  function newRun(opts = {}) {
    return { n: 0, lives: opts.lives || LIVES, combo: 0, maxCombo: 0, score: 0, correct: 0, wrong: 0, timeout: 0, over: false, q: null };
  }

  // 다음 문제를 만들어 s.q 에 둔다: { word, ink, rule, answer, limit, colors }  (word·ink·answer 는 색 번호)
  function nextQuestion(s, rng = Math.random, opts = {}) {
    const colors = colorsFor(s.n), rule = ruleFor(s.n);
    const word = Math.floor(rng() * colors);
    let ink = word;
    if (rng() >= SAME_RATE) { ink = Math.floor(rng() * (colors - 1)); if (ink >= word) ink++; }   // word 와 다른 색
    s.q = { word, ink, rule, answer: rule === 'word' ? word : ink, limit: opts.limit || limitMs(s.n), colors };
    return s.q;
  }

  // 색 choice 를 골랐다. remainMs = 남은 시간. 돌려주는 값: { kind: 'ok'|'wrong'|'ignored', points?, answer? }
  function answer(s, choice, remainMs) {
    if (s.over || !s.q || !Number.isInteger(choice) || choice < 0 || choice >= s.q.colors) return { kind: 'ignored' };
    const q = s.q;
    s.n++;
    if (choice === q.answer) {
      const speed = Math.max(0, Math.min(1, remainMs / q.limit));
      const points = (BASE_POINTS + Math.round(SPEED_MAX * speed)) * comboMult(s.combo);   // 이 문제를 맞히기 직전의 콤보로 배수를 정한다
      s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo); s.correct++; s.score += points;
      s.q = null;
      return { kind: 'ok', points };
    }
    s.wrong++; s.combo = 0; s.lives--;
    if (s.lives <= 0) s.over = true;
    s.q = null;
    return { kind: 'wrong', answer: q.answer };
  }

  // 시간이 다 됐다: 틀린 것과 같지만 따로 센다
  function timeUp(s) {
    if (s.over || !s.q) return { kind: 'ignored' };
    const q = s.q;
    s.n++; s.timeout++; s.combo = 0; s.lives--;
    if (s.lives <= 0) s.over = true;
    s.q = null;
    return { kind: 'timeout', answer: q.answer };
  }

  return { COLORS, LIVES, BASE_POINTS, SPEED_MAX, COMBO_STEP, COMBO_MAX, SAME_RATE, START_MS, FLOOR_MS, SHRINK_MS, WORD_FROM, WORD_LEN, WORD_EVERY, colorsFor, ruleFor, limitMs, comboMult, newRun, nextQuestion, answer, timeUp };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_STROOP;
