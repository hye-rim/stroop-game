'use strict';

// 컬러 스트룹 규칙 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

// 고정 난수 (확률이 걸린 시험은 항상 같은 결과가 나오게)
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('there are six distinct colors with names and hex values', () => {
  assert.strictEqual(L.COLORS.length, 6);
  assert.strictEqual(new Set(L.COLORS.map((c) => c.id)).size, 6);
  assert.strictEqual(new Set(L.COLORS.map((c) => c.hex)).size, 6);
  assert.strictEqual(new Set(L.COLORS.map((c) => c.name)).size, 6);
});

test('the number of colors grows with questions answered', () => {
  assert.deepStrictEqual([0, 7, 8, 19, 20, 99].map(L.colorsFor), [4, 4, 5, 5, 6, 6]);
});

test('the word rule comes for four questions every sixteen starting at the twelfth', () => {
  const rules = Array.from({ length: 40 }, (_, n) => L.ruleFor(n));
  assert.ok(rules.slice(0, 12).every((r) => r === 'ink'), 'first twelve are ink');
  assert.ok(rules.slice(12, 16).every((r) => r === 'word'), 'then four word');
  assert.ok(rules.slice(16, 28).every((r) => r === 'ink'));
  assert.ok(rules.slice(28, 32).every((r) => r === 'word'), 'and again sixteen later');
  assert.ok(rules.slice(32).every((r) => r === 'ink'));
});

test('the time limit shrinks and stops at the floor', () => {
  assert.strictEqual(L.limitMs(0), L.START_MS);
  assert.ok(L.limitMs(10) < L.limitMs(0));
  assert.strictEqual(L.limitMs(1000), L.FLOOR_MS);
  for (let n = 1; n < 80; n++) assert.ok(L.limitMs(n) <= L.limitMs(n - 1));
});

test('combo multiplier grows every five and stops at the cap', () => {
  assert.deepStrictEqual([0, 4, 5, 9, 10, 19, 20, 24, 25, 99].map(L.comboMult), [1, 1, 2, 2, 3, 4, 5, 5, 5, 5]);
});

test('questions stay in range, the answer follows the rule, and most words differ from their ink', () => {
  const rng = seeded(7);
  let same = 0, total = 0;
  for (let n = 0; n < 60; n++) {
    for (let k = 0; k < 40; k++) {
      const s = L.newRun(); s.n = n;
      const q = L.nextQuestion(s, rng);
      assert.ok(q.word >= 0 && q.word < L.colorsFor(n) && q.ink >= 0 && q.ink < L.colorsFor(n));
      assert.strictEqual(q.answer, q.rule === 'word' ? q.word : q.ink);
      assert.strictEqual(q.rule, L.ruleFor(n));
      assert.strictEqual(q.limit, L.limitMs(n));
      assert.strictEqual(s.q, q);
      total++; if (q.word === q.ink) same++;
    }
  }
  const rate = same / total;
  assert.ok(rate > 0.1 && rate < 0.3, `same-color rate ${rate}`);
});

test('a different-colored question never has the word equal to the ink unless it is the easy case', () => {
  const rng = seeded(3);
  const s = L.newRun();
  let diff = 0;
  for (let k = 0; k < 500; k++) { const q = L.nextQuestion(s, rng); if (q.word !== q.ink) diff++; }
  assert.ok(diff > 350, 'about 80 percent differ');
});

test('a right answer scores the base plus speed bonus times the combo multiplier', () => {
  const s = L.newRun(); L.nextQuestion(s, seeded(1));
  const lim = s.q.limit, ans = s.q.answer;
  const r = L.answer(s, ans, lim);                               // 시간이 하나도 안 줄었다: 속도 보너스 최대
  assert.deepStrictEqual([r.kind, r.points], ['ok', L.BASE_POINTS + L.SPEED_MAX]);
  assert.strictEqual(s.score, r.points);
  assert.strictEqual(s.combo, 1);
  assert.strictEqual(s.q, null, 'the question is used up');
  L.nextQuestion(s, seeded(2));
  const slow = L.answer(s, s.q.answer, 0);                       // 시간이 거의 끝나서 맞혔다: 기본 점수만
  assert.strictEqual(slow.points, L.BASE_POINTS);
});

test('the combo raises the multiplier after five right answers in a row', () => {
  const s = L.newRun(); const rng = seeded(5);
  const pts = [];
  for (let i = 0; i < 7; i++) { L.nextQuestion(s, rng); pts.push(L.answer(s, s.q.answer, 0).points); }
  assert.deepStrictEqual(pts, [10, 10, 10, 10, 10, 20, 20]);
  assert.strictEqual(s.combo, 7);
  assert.strictEqual(s.maxCombo, 7);
});

test('a wrong answer costs a life and breaks the combo but keeps the best combo', () => {
  const s = L.newRun(); const rng = seeded(9);
  for (let i = 0; i < 3; i++) { L.nextQuestion(s, rng); L.answer(s, s.q.answer, 100); }
  L.nextQuestion(s, rng);
  const right = s.q.answer, bad = (right + 1) % s.q.colors;
  const r = L.answer(s, bad, 500);
  assert.deepStrictEqual([r.kind, r.answer], ['wrong', right]);
  assert.strictEqual(s.lives, L.LIVES - 1);
  assert.strictEqual(s.combo, 0);
  assert.strictEqual(s.maxCombo, 3);
  assert.strictEqual(s.wrong, 1);
  assert.strictEqual(s.n, 4, 'a wrong answer still moves on to the next question');
});

test('the wrong answer result names the right answer so the screen can show it', () => {
  const s = L.newRun(); L.nextQuestion(s, seeded(11));
  const right = s.q.answer;
  const r = L.answer(s, (right + 1) % s.q.colors, 1000);
  assert.strictEqual(r.answer, right);
});

test('running out of time costs a life, breaks the combo and is counted separately', () => {
  const s = L.newRun(); const rng = seeded(4);
  L.nextQuestion(s, rng); L.answer(s, s.q.answer, 100);
  L.nextQuestion(s, rng);
  const ans = s.q.answer;
  const r = L.timeUp(s);
  assert.deepStrictEqual([r.kind, r.answer], ['timeout', ans]);
  assert.strictEqual(s.lives, L.LIVES - 1);
  assert.strictEqual(s.combo, 0);
  assert.strictEqual(s.timeout, 1);
  assert.strictEqual(s.wrong, 0);
  assert.strictEqual(L.timeUp(s).kind, 'ignored', 'no question is open any more');
});

test('three misses end the run and then nothing more counts', () => {
  const s = L.newRun(); const rng = seeded(6);
  for (let i = 0; i < 3; i++) {
    assert.ok(!s.over);
    L.nextQuestion(s, rng);
    if (i % 2) L.timeUp(s); else L.answer(s, (s.q.answer + 1) % s.q.colors, 0);
  }
  assert.ok(s.over);
  assert.strictEqual(s.lives, 0);
  L.nextQuestion(s, rng);
  assert.strictEqual(L.answer(s, s.q.answer, 100).kind, 'ignored', 'finished run takes no more answers');
  assert.strictEqual(L.timeUp(s).kind, 'ignored');
});

test('garbage answers are ignored without any change', () => {
  const s = L.newRun(); L.nextQuestion(s, seeded(2));
  const before = JSON.stringify(s);
  for (const c of [-1, 4, 99, 1.5, NaN, '1', null, undefined, {}, [0]]) assert.strictEqual(L.answer(s, c, 100).kind, 'ignored');
  assert.strictEqual(JSON.stringify(s), before);
  assert.strictEqual(L.answer(L.newRun(), 0, 100).kind, 'ignored', 'no open question');
});

test('the practice run can start with extra lives', () => {
  const s = L.newRun({ lives: 9 });
  assert.strictEqual(s.lives, 9);
});

test('a simulated perfect player and a sloppy player compare sensibly', () => {
  const play = (accuracy, seed) => {
    const rng = seeded(seed), s = L.newRun();
    let guard = 0;
    while (!s.over && guard++ < 400) {
      L.nextQuestion(s, rng);
      const ok = rng() < accuracy;
      L.answer(s, ok ? s.q.answer : (s.q.answer + 1) % s.q.colors, s.q.limit * 0.5);
    }
    return s;
  };
  const perfect = play(1, 1);
  assert.strictEqual(perfect.n, 400, 'a perfect player never dies');
  assert.ok(perfect.score > 400 * 10);
  const sloppy = play(0.6, 1);
  assert.ok(sloppy.over && sloppy.score < perfect.score);
});
