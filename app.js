/* Local-only Canvas artwork and browser interface. */
(() => {
  'use strict';
  const { Game, BOARD: B, PLANTS, LEVELS, center } = window.SunflowerGame;
  const $ = id => document.getElementById(id);
  const canvas = $('field'), ctx = canvas.getContext('2d');
  const game = new Game();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selected = null, hover = null, keyboardCell = { row: 2, col: 1 }, usingKeyboard = false;
  let unlocked = 0, chosenLevel = 0, soundOn = true, audio = null, lastFrame = 0, clock = 0, bestWave = 0;
  let banner = '', bannerUntil = 0, modal = 'menu', primaryAction = null, secondaryAction = null, statusUntil = 0;
  const storageKey = 'sunflower-defense-v1';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    unlocked = Math.max(0, Math.min(2, Math.floor(Number(saved.unlocked) || 0)));
    soundOn = saved.sound !== false;
    bestWave = Math.max(0, Math.floor(Number(saved.bestWave) || 0));
    const diff = Math.round(Number(saved.difficulty) || 100) / 100;
    if (diff >= 0.5 && diff <= 5) game.difficulty = diff;
  } catch (_) { /* Private browsing or a damaged save must not prevent playing. */ }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify({ unlocked, sound: soundOn, bestWave, difficulty: game.difficulty })); } catch (_) {} }
  function initAudio() {
    if (!soundOn) return;
    try {
      if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) audio = new Audio(); }
      if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { audio = null; }
  }
  function tone(freq, duration = 0.1, type = 'sine', volume = 0.035, end = freq) {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const t = audio.currentTime, oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, t); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(t); oscillator.stop(t + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function play(type) {
    if (type === 'collect') tone(680, 0.16, 'sine', 0.065, 1150);
    else if (type === 'plant') tone(240, 0.13, 'triangle', 0.07, 420);
    else if (type === 'shoot') tone(400, 0.045, 'triangle', 0.012, 260);
    else if (type === 'bomb') tone(110, 0.5, 'sawtooth', 0.045, 25);
    else if (type === 'wave' || type === 'mower') tone(160, 0.32, 'triangle', 0.07, 300);
    else if (type === 'fuse') tone(330, 0.35, 'triangle', 0.08, 990);
    else if (type === 'won') tone(420, 0.7, 'triangle', 0.07, 1000);
    else if (type === 'lost') tone(240, 0.8, 'triangle', 0.07, 60);
  }
  function message(text, seconds = 3) { $('status').textContent = text; statusUntil = clock + seconds; }
  function rounded(c, x, y, w, h, r, fill, stroke, line = 2) {
    c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = line; c.strokeStyle = stroke; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, color, rotation = 0, stroke = null) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  function line(c, points, color, width = 2) {
    c.beginPath(); c.moveTo(...points[0]); points.slice(1).forEach(p => c.lineTo(...p)); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function text(c, value, x, y, size = 14, color = '#284c35', align = 'left', weight = 'normal') {
    c.font = `${weight} ${size}px "Microsoft YaHei",sans-serif`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
  }
  function flower(c, x, y, radius, petals, core, wilt = false) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ellipse(c, x + Math.cos(a) * radius * 0.97, y + Math.sin(a) * radius * 0.97 + (wilt ? Math.max(0, Math.sin(a)) * 5 : 0), radius * 0.59, radius * 0.29, petals, a, '#593c2a35');
    }
    ellipse(c, x, y, radius * 0.76, radius * 0.76, core, 0, '#593c2a');
  }
  function drawPlant(c, kind, x, y, scale = 1, age = 0, hp = 1, hit = false, level = 1, kinds = null) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    ellipse(c, 0, 22, 29, 8, '#203c3227');
    const sway = reduceMotion ? 0 : Math.sin(age * 2.7) * 2;
    line(c, [[0, 21], [-2, 1], [sway, -24]], '#3c6c36', 7);
    ellipse(c, -13, 6, 16, 7, '#609c42', 0.5, '#416e37'); ellipse(c, 13, 11, 17, 7, '#75b34c', -0.55, '#416e37');
    c.translate(sway, 0);
    const color = kind === 'ice' ? '#a1e5ed' : kind === 'bomb' ? '#ff9650' : kind === 'melon' ? '#9be15d' : kind === 'wall' ? '#d6b57a' : '#ffd34f';
    const core = hit ? '#eec09a' : kind === 'ice' ? '#568e9b' : kind === 'bomb' ? '#a4472b' : '#81512f';
    if (kind === 'wall') {
      flower(c, 0, -13, 32, color, '#986c41');
      rounded(c, -21, -42, 42, 57, 18, hit ? '#caaa71' : '#b49259', '#674a30', 3);
      for (let i = -1; i <= 1; i++) line(c, [[i * 12, -33], [i * 11 - 2, 5]], '#d4ba7d', 3);
      ellipse(c, -8, -20, 3, 5, '#302f29'); ellipse(c, 8, -20, 3, 5, '#302f29');
      line(c, [[-6, -5], [6, -5]], '#493427', 2);
      if (hp < 0.65) line(c, [[-19, -30], [-7, -18], [-15, -5], [-3, 8]], '#68492c', 3);
    } else {
      flower(c, 0, -26, kind === 'bomb' ? 26 + Math.sin(age * 16) * 2 : 27 + (level - 1) * 4, color, core);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ellipse(c, Math.cos(a) * 15, -26 + Math.sin(a) * 15, 1.3, 1.3, '#ffffff23'); }
      if (kind === 'seed' || kind === 'ice') {
        ellipse(c, 21, -23, 15, 10, kind === 'ice' ? '#88cbd0' : '#cda554', 0, '#5e562e');
        ellipse(c, 31, -23, 5, 7, '#3e4434');
        for (let b = 1; b < level; b++) { // 升级后逐级加装炮筒
          ellipse(c, 21, -23 - b * 15, 15, 10, kind === 'ice' ? '#88cbd0' : '#cda554', 0, '#5e562e');
          ellipse(c, 31, -23 - b * 15, 5, 7, '#3e4434');
        }
        ellipse(c, -5, -32, 3, 4, '#282e22'); ellipse(c, 7, -32, 3, 4, '#282e22');
        line(c, [[-9, -40], [-2, -38]], '#3d352b', 2);
      } else {
        ellipse(c, -7, -29, 3, 4, '#302b21'); ellipse(c, 7, -29, 3, 4, '#302b21');
        ellipse(c, -8, -31, 1, 1, '#fff'); ellipse(c, 6, -31, 1, 1, '#fff');
        c.beginPath(); c.arc(0, -25, 8, 0.2, Math.PI - 0.2); c.strokeStyle = '#3d2c21'; c.lineWidth = 2; c.stroke();
        ellipse(c, -13, -23, 4, 2, '#ec986480'); ellipse(c, 13, -23, 4, 2, '#ec986480');
      }
      if (kind === 'melon') { // 侧边抱着一颗小西瓜
        ellipse(c, 22, -24, 12, 11, '#4e9b3f', 0, '#2f6b26');
        for (let i = -1; i <= 1; i++) line(c, [[22 + i * 5 - 2, -33], [22 + i * 5 + 2, -15]], '#2f6b26', 2.5);
        ellipse(c, 18, -28, 4, 3, '#b6e39a');
      }
      if (kind === 'ice') {
        line(c, [[-16, -54], [-16, -43]], '#e9ffff', 2); line(c, [[-21, -49], [-11, -49]], '#e9ffff', 2);
      }
      if (kind === 'bomb') { line(c, [[0, -49], [6, -64], [12, -65]], '#593c2a', 3); ellipse(c, 13, -65, 4, 4, '#ffdc64'); }
    }
    if (level >= 2 && kinds && kinds.length > 1) { // 混血徽记：左肩开出副本领的小花
      kinds.slice(1).forEach((k, i) => {
        const spot = { sun: [-24, -50], seed: [-24, -44], ice: [-24, -44], wall: [-24, -50], bomb: [-24, -54] }[k] || [-24, -46];
        flower(c, spot[0], spot[1] + i * -12, 8, PLANTS.find(s => s.id === k).color, '#81512f');
      });
    }
    if (level >= 2) { // 金星徽章：升到几级就挂几颗（level-1 颗）
      c.save(); c.translate(0, kind === 'wall' ? -62 : -76 - (level > 2 ? 4 : 0)); c.rotate(reduceMotion ? 0 : Math.sin(age * 2) * 0.1);
      for (let s = 0; s < level - 1; s++) {
        c.save(); c.translate((s - (level - 2) / 2) * 16, 0); c.scale(level > 2 ? 0.85 : 1, level > 2 ? 0.85 : 1);
        c.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 10, ang = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
        c.closePath(); c.fillStyle = '#ffd94f'; c.fill(); c.strokeStyle = '#9a6a1c'; c.lineWidth = 1.5; c.stroke();
        c.restore();
      }
      c.restore();
    }
    c.restore();
  }
  // Shared zombie flower-head; options tune the expression per type.
  function zombieHead(c, petal, hit, o = {}) {
    const size = o.size || 26, ey = -42 + (o.sleepy ? 3 : 0);
    c.save(); c.rotate(o.tilt || 0);
    ellipse(c, 4, -5, 5, 7, '#e5c350', -0.35); line(c, [[4, -10], [4, 0]], '#756333', 1);
    flower(c, -3, -40, size, petal, hit ? '#dcd5a2' : '#8fa174', true);
    ellipse(c, -11, ey, 7, o.sleepy ? 4 : 8, '#eaf0ca'); ellipse(c, 5, ey, 7, o.sleepy ? 4 : 7, '#eaf0ca');
    ellipse(c, -13, ey, 2.5, 3.5, '#28362e'); ellipse(c, 3, ey, 2.5, 3.5, '#28362e');
    if (o.angry) { line(c, [[-17, ey - 9], [-7, ey - 4]], '#3a2f24', 3); line(c, [[11, ey - 9], [1, ey - 4]], '#3a2f24', 3); }
    if (o.grin) line(c, [[-13, -27], [-6, -23], [1, -28], [8, -24]], '#435038', 3);
    else line(c, [[-14, -27], [-5, o.smile ? -25 : -30], [6, -26]], '#435038', 3);
    rounded(c, -9, -29, 5, 7, 1, '#f5edc9');
    c.restore();
  }
  // Every type gets its own silhouette, gait and posture so they read apart at a glance.
  function drawEnemy(c, e) {
    const t = e.type, a = e.age, frozen = e.slow > 0, still = reduceMotion || e.biting;
    const skin = e.hit ? '#e2cf9d' : { wilt: '#6f7a58', flag: '#74815a', pot: '#6a7455', runner: '#7c8a5f', bucket: '#5f6d52', bruiser: '#5c6a4c', giant: '#4e5a42', balloon: '#74815a' }[t];
    const petal = frozen ? '#b4dee5' : { wilt: '#a9a25a', flag: '#e8cd54', pot: '#cdb972', runner: '#d8b545', bucket: '#a8b598', bruiser: '#97a06b', giant: '#7d8a55', balloon: '#d8b545' }[t];
    const bar = { wilt: -84, flag: -88, pot: -102, runner: -80, bucket: -102, bruiser: -98, giant: -124, balloon: -150 }[t];
    c.save(); c.translate(e.x, e.y);
    ellipse(c, 0, 28, t === 'pot' || t === 'bruiser' ? 34 : t === 'giant' ? 44 : t === 'runner' ? 22 : 29, 8, '#23382132');
    const step = still ? 0 : Math.sin(a * { wilt: 3, flag: 8, pot: 3.2, runner: 16, bucket: 4, bruiser: 2.2, giant: 1.5, balloon: 2.4 }[t]) * { wilt: 4, flag: 10, pot: 9, runner: 8, bucket: 3, bruiser: 12, giant: 17, balloon: 5 }[t];
    const bob = still ? 0 : Math.abs(step) * 0.25;
    if (t === 'balloon') { // 气球葵尸：吊在气球下从植物头顶飘过，只有西瓜砸得到
      const sway = still ? 0 : Math.sin(a * 1.6) * 6;
      c.translate(sway, bob);
      ellipse(c, 0, -100, 33, 39, frozen ? '#9fd7e0' : e.hit ? '#f0917f' : '#e8635a', 0, '#a03328');
      ellipse(c, -12, -112, 9, 12, '#ffffff50');
      line(c, [[sway * 0.5, -62], [0, -44]], '#7c5a33', 2);
      line(c, [[-9, -38], [-4, -56]], '#8b9d66', 5); line(c, [[9, -38], [4, -56]], '#8b9d66', 5); // 双手抓着气球绳
      rounded(c, -13, -44, 26, 34, 8, skin, '#46553b');
      line(c, [[-6, -11], [-11 - step * 0.6, 8]], '#556548', 6); line(c, [[6, -11], [11 + step * 0.6, 8]], '#556548', 6); // 悬空的腿晃啊晃
      zombieHead(c, petal, e.hit, { size: 20, grin: true });
    } else if (t === 'wilt') { // 弓着背、拖着脚、眼皮耷拉的普通僵尸
      c.translate(0, bob); c.rotate(0.13);
      line(c, [[-8, 8], [-12 - step, 28]], '#556548', 9); line(c, [[8, 8], [13 + step, 28]], '#556548', 9);
      ellipse(c, -12 - step, 29, 12, 6, '#59493a'); ellipse(c, 13 + step, 29, 12, 6, '#59493a');
      rounded(c, -18, -23, 37, 36, 9, skin, '#46553b');
      line(c, [[-15, -12], [-28, -2], [-35, 6]], '#8b9d66', 7);
      line(c, [[12, -13], [24, -3], [30, 5]], '#8b9d66', 7);
      zombieHead(c, petal, e.hit, { tilt: 0.32, sleepy: true, size: 27 });
    } else if (t === 'flag') { // 抬头挺胸、正步向前的领队，扛着小旗
      c.translate(0, -bob); c.rotate(-0.05);
      line(c, [[-7, 8], [-10 - step, 30]], '#556548', 9); line(c, [[7, 8], [14 + step, 26]], '#556548', 9);
      ellipse(c, -10 - step, 31, 12, 6, '#59493a'); ellipse(c, 14 + step, 27, 12, 6, '#59493a');
      rounded(c, -17, -29, 36, 43, 9, skin, '#46553b');
      line(c, [[12, -18], [26, -24], [36, -20]], '#8b9d66', 7);
      line(c, [[-13, -16], [-25, -10], [-31, -6]], '#8b9d66', 6);
      zombieHead(c, petal, e.hit, { size: 26, smile: true });
      line(c, [[-15, -53], [9, -56]], '#e45c3a', 4);
      const flap = still ? 0 : Math.sin(a * 7) * 6;
      line(c, [[-29, -6], [-29, -118]], '#7c5a33', 4);
      c.beginPath(); c.moveTo(-29, -118); c.quadraticCurveTo(-6 + flap, -112, 15, -105); c.lineTo(-29, -93); c.closePath();
      c.fillStyle = frozen ? '#7fa9b0' : '#e45c3a'; c.fill(); c.strokeStyle = '#8c3a22'; c.lineWidth = 2; c.stroke();
    } else if (t === 'pot') { // 横向宽大的摇摆重甲，顶着花盆一步一晃
      c.rotate(still ? 0 : Math.sin(a * 3.2) * 0.09);
      line(c, [[-10, 8], [-15 - step, 30]], '#556548', 11); line(c, [[10, 8], [17 + step, 30]], '#556548', 11);
      ellipse(c, -15 - step, 31, 15, 7, '#59493a'); ellipse(c, 17 + step, 31, 15, 7, '#59493a');
      rounded(c, -25, -27, 50, 42, 13, skin, '#46553b');
      line(c, [[-21, -12], [-36, -2], [-44, 6]], '#8b9d66', 9);
      line(c, [[21, -12], [36, -2], [44, 6]], '#8b9d66', 9);
      zombieHead(c, petal, e.hit, { size: 23, sleepy: true });
      c.beginPath(); c.moveTo(-24, -60); c.lineTo(-17, -88); c.lineTo(15, -88); c.lineTo(22, -60); c.closePath();
      c.fillStyle = '#c77b4b'; c.fill(); c.strokeStyle = '#75492e'; c.lineWidth = 3; c.stroke();
      rounded(c, -28, -64, 53, 8, 3, '#e2a172', '#75492e'); ellipse(c, -1, -76, 5, 5, '#f4d776');
    } else if (t === 'runner') { // 迷你个头、前倾狂奔，跑起来扬起尘土
      c.scale(0.68, 0.68); c.rotate(0.34); c.translate(0, bob);
      line(c, [[-7, 8], [-16 - step, 27]], '#556548', 8); line(c, [[7, 8], [16 + step, 25]], '#556548', 8);
      rounded(c, -17, -25, 36, 38, 9, skin, '#46553b');
      line(c, [[10, -14], [26, -8], [38, -14]], '#8b9d66', 6);
      line(c, [[-12, -15], [-28, -6], [-40, -12]], '#8b9d66', 6);
      zombieHead(c, petal, e.hit, { tilt: -0.15, grin: true, size: 27 });
      if (!still) { ellipse(c, -34, 20, 14, 6, '#d9cb9855'); ellipse(c, -48, 14, 10, 5, '#d9cb9835'); }
    } else if (t === 'bucket') { // 瘦高僵直，双臂平举，小碎步挪动
      c.scale(0.95, 1.15);
      line(c, [[-8, 8], [-11 - step, 28]], '#556548', 9); line(c, [[8, 8], [11 + step, 28]], '#556548', 9);
      rounded(c, -16, -28, 34, 44, 8, skin, '#46553b');
      line(c, [[-14, -16], [-28, -18], [-42, -16]], '#8b9d66', 7);
      line(c, [[14, -16], [28, -18], [42, -16]], '#8b9d66', 7);
      c.save(); c.rotate(still ? 0 : Math.sin(a * 9) * 0.05); zombieHead(c, petal, e.hit, { size: 25, sleepy: true }); c.restore();
      rounded(c, -25, -84, 47, 29, [7, 7, 2, 2], '#9daea0', '#4f6259', 3);
      line(c, [[-24, -80], [19, -80]], '#dce2be', 3); line(c, [[-24, -54], [23, -54]], '#4f6259', 4);
      ellipse(c, -2, -68, 6, 10, '#48563c', 0.3); line(c, [[-4, -73], [0, -62]], '#dddda0', 1);
    } else if (t === 'bruiser') { // 巨型壮汉，阔步碾压，双拳如锤
      c.scale(1.5, 1.32); c.translate(0, bob); c.rotate(still ? 0 : Math.sin(a * 2.2) * 0.07);
      line(c, [[-11, 8], [-18 - step, 28]], '#556548', 13); line(c, [[11, 8], [20 + step, 28]], '#556548', 13);
      ellipse(c, -18 - step, 29, 16, 7, '#59493a'); ellipse(c, 20 + step, 29, 16, 7, '#59493a');
      rounded(c, -27, -30, 56, 42, 12, skin, '#46553b', 3);
      line(c, [[-24, -16], [-38, -6], [-48, 10]], '#8b9d66', 11);
      line(c, [[24, -16], [38, -6], [48, 10]], '#8b9d66', 11);
      ellipse(c, -48, 12, 13, 11, '#8b9d66', -0.3, '#46553b'); ellipse(c, 48, 12, 13, 11, '#8b9d66', 0.3, '#46553b');
      zombieHead(c, petal, e.hit, { size: 20, angry: true, grin: true });
      if (!still && Math.abs(step) > 10) ellipse(c, 0, 30, 42, 8, '#d9cb9840');
    } else if (t === 'giant') { // 超级巨大葵尸：比大块头还高一倍，双头缓行，一步一震
      c.scale(2.1, 1.85); c.translate(0, bob); c.rotate(still ? 0 : Math.sin(a * 1.5) * 0.05);
      line(c, [[-14, 10], [-22 - step, 26]], '#4a5840', 16); line(c, [[14, 10], [24 + step, 26]], '#4a5840', 16);
      ellipse(c, -22 - step, 27, 19, 8, '#544636'); ellipse(c, 24 + step, 27, 19, 8, '#544636');
      rounded(c, -32, -34, 66, 50, 14, skin, '#3f4c37', 4);
      line(c, [[-28, -20], [-44, -8], [-56, 12]], '#7f9259', 14); line(c, [[28, -20], [44, -8], [56, 12]], '#7f9259', 14);
      ellipse(c, -56, 14, 15, 13, '#7f9259', -0.3, '#3f4c37'); ellipse(c, 56, 14, 15, 13, '#7f9259', 0.3, '#3f4c37');
      zombieHead(c, petal, e.hit, { size: 24, angry: true, grin: true });
      c.save(); c.translate(26, -48); c.scale(0.55, 0.55); zombieHead(c, petal, e.hit, { size: 22, sleepy: true }); c.restore(); // 肩上还扛着一颗瞌睡小脑袋
      if (!still && Math.abs(step) > 12) { ellipse(c, -32, 30, 22, 6, '#d9cb9855'); ellipse(c, 32, 30, 22, 6, '#d9cb9855'); } // 落脚震起尘土
    }
    if (frozen) { c.globalAlpha = 0.5; ellipse(c, 0, 23, 30, 7, '#b4f2ff'); c.globalAlpha = 1; }
    if (e.hp < e.maxHp) { rounded(c, -22, bar, 44, 5, 2, '#314c3c'); rounded(c, -21, bar + 1, Math.max(0, 42 * e.hp / e.maxHp), 3, 1, '#edbb60'); }
    c.restore();
  }
  function drawSun(c, x, y, radius = 21, age = 0) {
    c.save(); c.translate(x, y); c.rotate(reduceMotion ? 0 : age * 0.2);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; ellipse(c, Math.cos(a) * radius, Math.sin(a) * radius, radius * 0.45, radius * 0.18, '#ffe88a', a); }
    ellipse(c, 0, 0, radius * 0.77, radius * 0.77, '#ffdc51', 0, '#df9c2e');
    ellipse(c, -4, -5, 5, 3, '#fff2aa', -0.6); c.restore();
  }
  function drawMower(c, m) {
    if (m.state === 'used') return;
    const y = center(m.row, 0).y;
    c.save(); c.translate(m.x, y + 11);
    ellipse(c, 0, 11, 27, 7, '#35563730');
    line(c, [[-12, 0], [-27, -31], [-39, -31]], '#5d6347', 4);
    rounded(c, -25, -9, 50, 20, 5, '#cf9141', '#765331', 3);
    ellipse(c, -14, 13, 8, 8, '#47523c'); ellipse(c, 16, 13, 8, 8, '#47523c');
    flower(c, 1, -15, 11, '#ffde57', '#81512f'); c.restore();
  }
  function background(c) {
    const sky = c.createLinearGradient(0, 0, 0, 135); sky.addColorStop(0, '#a9dcec'); sky.addColorStop(1, '#d0eacb');
    c.fillStyle = sky; c.fillRect(0, 0, 1100, 650);
    ellipse(c, 188, 34, 65, 16, '#f4f9e5a0'); ellipse(c, 227, 22, 33, 19, '#f4f9e5a0');
    ellipse(c, 760, 34, 59, 14, '#f4f9e58a');
    c.beginPath(); c.moveTo(0, 100); c.bezierCurveTo(200, -7, 340, 105, 530, 71); c.bezierCurveTo(730, 0, 920, 98, 1100, 52); c.lineTo(1100, 140); c.lineTo(0, 140); c.closePath(); c.fillStyle = '#95be78'; c.fill();
    for (let i = 0; i < 33; i++) { const x = i * 35 + 10, y = 102 + Math.sin(i * 2) * 8; line(c, [[x, 125], [x, y - 9]], '#71914e', 3); flower(c, x, y - 15, 8, '#e2c34d', '#8e7142'); }
    c.fillStyle = '#738d50'; c.fillRect(0, 115, 1100, 20);
    for (let i = 0; i < 33; i++) rounded(c, i * 35 + 5, 107, 9, 31, [4, 4, 0, 0], '#d9cb98', '#9e9c6a', 1);
    c.fillStyle = '#ddce9a'; c.fillRect(0, 119, 1100, 6);
    c.fillStyle = '#b7c17f'; c.fillRect(0, 132, 1100, 518);
    // A narrow garden path keeps the rescue carts visually separate from the grid.
    c.fillStyle = '#cabb8c'; c.fillRect(50, 132, 68, 481);
    for (let i = 0; i < 17; i++) rounded(c, 57 + i % 2 * 9, 141 + i * 28, 49, 20, 6, '#d8c99c', '#b5a97c', 1);
    c.fillStyle = '#566f3a'; c.fillRect(B.x - 5, B.y - 4, B.cols * B.w + 10, B.rows * B.h + 10);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) {
      const x = B.x + col * B.w, y = B.y + row * B.h;
      c.fillStyle = (row + col) % 2 ? '#80b24e' : '#8cbd58'; c.fillRect(x, y, B.w, B.h);
      c.fillStyle = '#ffffff08'; c.fillRect(x, y, B.w, 4);
      for (let i = 0; i < 4; i++) {
        const dx = 14 + (i * 29 + col * 17 + row * 11) % 73, dy = 16 + (i * 37 + row * 19) % 67;
        line(c, [[x + dx - 3, y + dy], [x + dx - 5, y + dy - 4], [x + dx, y + dy], [x + dx + 2, y + dy - 5]], '#497e342d', 1);
      }
    }
    c.fillStyle = '#a99d77'; c.fillRect(1015, 135, 85, 478);
    for (let i = 0; i < 25; i++) ellipse(c, 1030 + i % 3 * 25, 147 + i * 19, 8, 3, '#8c846530');
    rounded(c, 28, 17, 231, 57, 12, '#fff5d6eF', '#748e5b', 2);
    text(c, game.endless ? `无尽　${LEVELS[game.level].name}` : `${game.level + 1} / 3　${LEVELS[game.level].name}`, 44, 36, 18, '#365439', 'left', 'bold');
    text(c, game.endless ? `第 ${Math.max(1, game.wave)} 波 · 击退 ${game.kills} 只` : game.wave ? `第 ${game.wave} 波 / 共 3 波` : `准备时间 · ${Math.max(0, Math.ceil(LEVELS[game.level].times[0] - game.time))} 秒`, 44, 59, 12, '#69805a');
    rounded(c, 813, 19, 260, 51, 12, '#355a3de8');
    for (let i = 0; i < 3; i++) { flower(c, 840 + i * 35, 43, 9, game.wave > i ? '#ffd34f' : '#859763', game.wave > i ? '#916037' : '#49633e'); }
    text(c, `击退 ${game.kills} 只`, 982, 44, 15, '#fff6cc', 'center', 'bold');
    text(c, '葵 田 小 院', 566, 637, 12, '#597444', 'center');
    for (let i = 0; i < 5; i++) { flower(c, 26, 185 + i * 96, 12, '#f8d467', '#866941'); line(c, [[26, 200 + i * 96], [24, 225 + i * 96]], '#709549', 3); }
  }
  function render() {
    ctx.clearRect(0, 0, 1100, 650); background(ctx);
    const cell = usingKeyboard ? keyboardCell : hover;
    if (cell && game.state === 'playing') {
      const p = center(cell.row, cell.col);
      rounded(ctx, p.x - B.w / 2 + 2, p.y - B.h / 2 + 2, B.w - 4, B.h - 4, 8, selected === 'shovel' ? '#ffeab542' : '#fff9c52d', '#fff4a5', 2);
      const preview = drag ? drag.index : selected;
    if (typeof preview === 'number' && !game.plants.some(v => v.row === cell.row && v.col === cell.col)) { ctx.globalAlpha = 0.42; drawPlant(ctx, PLANTS[preview].id, p.x, p.y, 1, 0); ctx.globalAlpha = 1; }
    }
    if (game.state === 'menu') {
      for (let row = 0; row < 5; row++) { drawPlant(ctx, 'sun', center(row, 0).x, center(row, 0).y, 1, clock + row); drawPlant(ctx, 'seed', center(row, 1).x, center(row, 1).y, 1, clock + row); }
      drawPlant(ctx, 'ice', 468, 468, 1, clock); drawPlant(ctx, 'wall', 764, 371, 1, clock);
      ['wilt', 'pot', 'bucket', 'runner', 'bruiser', 'giant', 'flag', 'balloon'].forEach((type, i) => drawEnemy(ctx, { type, x: 930 + i % 2 * 80, y: 160 + i * 62, age: clock + i, hp: 100, maxHp: 100 }));
    }
    for (let row = 0; row < 5; row++) {
      const entities = [...game.plants.filter(p => p.row === row).map(p => ({ p, x: p.x })), ...game.enemies.filter(e => e.row === row).map(e => ({ e, x: e.x }))].sort((a, b) => a.x - b.x);
      for (const item of entities) {
        if (item.p) {
          const p = item.p;
          if (plantDrag && plantDrag.moved && p === plantDrag.plant) continue;
          drawPlant(ctx, p.kind, p.x, p.y, Math.min(1, 0.65 + p.age * 3) * (1 + (p.level - 1) * 0.15), p.age, p.hp / p.maxHp, p.hit > 0, p.level, p.kinds);
          if (p.hp < p.maxHp) { rounded(ctx, p.x - 23, p.y + 33, 46, 5, 2, '#3e653b'); rounded(ctx, p.x - 22, p.y + 34, Math.max(0, p.hp / p.maxHp * 44), 3, 1, '#ffe39b'); }
        } else drawEnemy(ctx, item.e);
      }
      drawMower(ctx, game.mowers[row]);
    }
    if (plantDrag && plantDrag.moved) {
      // Glow every plant that can fuse with the plant in hand — levels must add up to 3 or less.
      for (const p of game.plants) if (p !== plantDrag.plant && p.level + plantDrag.plant.level <= 3) {
        const spot = center(p.row, p.col);
        rounded(ctx, spot.x - B.w / 2 + 2, spot.y - B.h / 2 + 2, B.w - 4, B.h - 4, 8, '#ffe27a45', '#ffd94f', 3);
      }
      drawPlant(ctx, plantDrag.plant.kind, plantDrag.x, plantDrag.y, 1.15, plantDrag.plant.age, 1, false, plantDrag.plant.level, plantDrag.plant.kinds);
    }
    for (const s of game.shots) {
      if (s.lob) { // 西瓜走抛物线，落点先画个瞄准圈
        const t = Math.min(1, s.t), x = s.sx + (s.tx - s.sx) * t, y = s.sy + (s.ty - s.sy) * t - Math.sin(Math.PI * t) * 110;
        ellipse(ctx, s.tx, s.ty, s.splash * (0.6 + 0.4 * Math.sin(clock * 6)), 7, '#ffffff22', 0, '#d9f2c0aa');
        ellipse(ctx, x, y, 13, 12, '#4e9b3f', 0, '#2f6b26');
        for (let i = -1; i <= 1; i++) line(ctx, [[x + i * 6 - 2, y - 10], [x + i * 6 + 2, y + 10]], '#2f6b26', 3);
        ellipse(ctx, x - 4, y - 5, 4, 3, '#b6e39a');
      }
      else if (s.ice) { ellipse(ctx, s.x - 9, s.y, 12, 4, '#dafaff55'); ellipse(ctx, s.x, s.y, 8, 6, '#bdf6fb', 0, '#719aa5'); }
      else { ellipse(ctx, s.x, s.y, 10, 5, '#453e2a', -0.15, '#f2df9c'); line(ctx, [[s.x - 5, s.y], [s.x + 5, s.y - 1]], '#b4a478', 1); }
    }
    for (const e of game.effects) {
      const progress = 1 - e.life / e.maxLife;
      ctx.save(); ctx.globalAlpha = Math.min(1, e.life * 3);
      if (e.type === 'blast') { ellipse(ctx, e.x, e.y, 25 + progress * 153, 20 + progress * 128, '#ffe89780'); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; drawSun(ctx, e.x + Math.cos(a) * progress * 130, e.y + Math.sin(a) * progress * 110, 15 * (1 - progress)); } }
      if (e.type === 'petals') for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ellipse(ctx, e.x + Math.cos(a) * progress * 50, e.y + Math.sin(a) * progress * 40 + progress * 20, 8, 4, e.color, a + progress); }
      if (e.type === 'splash') { // 西瓜落地的绿瓤飞溅
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + progress; ellipse(ctx, e.x + Math.cos(a) * progress * 55, e.y + Math.sin(a) * progress * 34 - progress * 12, 7 * (1 - progress), 4 * (1 - progress), i % 2 ? '#e84f5f' : '#9be15d', a); }
        ellipse(ctx, e.x, e.y, 30 * (1 - progress * 0.5), 9, '#ffffff30');
      }
      if (e.type === 'text') text(ctx, e.text, e.x, e.y - progress * 40, 24, e.color, 'center', 'bold');
      ctx.restore();
    }
    for (const s of game.suns) { ctx.globalAlpha = s.life < 3 ? 0.45 + Math.sin(clock * 9) * 0.35 : 1; drawSun(ctx, s.x, s.y, s === game.dragged ? 31 : s.value >= 50 ? 28 : 23, s.age); ctx.globalAlpha = 1; }
    if (banner && clock < bannerUntil && game.state === 'playing') {
      rounded(ctx, 303, 83, 494, 46, 12, '#67432aeb', '#ffe3a0', 2); text(ctx, banner, 550, 106, 19, '#fff0b6', 'center', 'bold');
    }
  }
  const cardButtons = PLANTS.map((p, index) => {
    const button = document.createElement('button'); button.className = 'plant-card'; button.title = `${index + 1} · ${p.description}`;
    button.setAttribute('aria-label', `${p.name}，${p.cost} 阳光，${p.description}`);
    button.innerHTML = `<canvas width="130" height="116" aria-hidden="true"></canvas><b>${p.name}</b><small>${p.description}</small><span class="price">☀ ${p.cost}</span><div class="cooldown"></div>`;
    const icon = button.querySelector('canvas').getContext('2d'); drawPlant(icon, p.id, 65, 83, 1.2);
    // Drag a card onto the lawn to plant it at the release point; a plain click still selects.
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || game.state !== 'playing' || modal) return;
      drag = { index, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ghost: null, moved: false };
      try { button.setPointerCapture(event.pointerId); } catch (_) { /* capture is a convenience, not a requirement */ }
    });
    button.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      if (!drag.ghost) {
        drag.ghost = document.createElement('div'); drag.ghost.className = 'drag-ghost';
        const face = document.createElement('canvas'); face.width = 130; face.height = 116; drag.ghost.appendChild(face);
        drawPlant(face.getContext('2d'), PLANTS[index].id, 65, 83, 1.2);
        document.body.appendChild(drag.ghost);
      }
      drag.ghost.style.left = `${event.clientX}px`; drag.ghost.style.top = `${event.clientY}px`;
      const p = toField(event); hover = game.cell(p.x, p.y); usingKeyboard = false;
    });
    const finish = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const { index: i, moved, ghost } = drag; drag = null;
      if (ghost) ghost.remove();
      if (!moved) return; // cards plant by dragging only — a plain click selects nothing
      const cell = game.cell(toField(event).x, toField(event).y);
      if (cell) {
        const dest = game.plants.find(v => v.row === cell.row && v.col === cell.col);
        if (dest && dest.level < 3) {
          // Dropping a card straight onto a plant fuses them (1级+1级=2级，卡牌+2级=3级).
          const error = game.fuseCard(i, cell.row, cell.col);
          if (error) message(error);
          else { const fused = game.plants.find(v => v.row === cell.row && v.col === cell.col); message(`${PLANTS[i].name}与${PLANTS.find(s => s.id === dest.kind).name}合体，进化到 ${fused.level} 级！`); }
        } else {
          keyboardCell = cell;
          message(game.plant(i, cell.row, cell.col) || `${PLANTS[i].name}已种下。`);
        }
      }
      else message('要种在草坪格子里哦。');
      updateUI();
    };
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', event => { if (drag && drag.pointerId === event.pointerId) { if (drag.ghost) drag.ghost.remove(); drag = null; } });
    $('cards').appendChild(button); return button;
  });
  let drag = null;
  function select(value) {
    initAudio();
    if (game.state !== 'playing') return;
    selected = selected === value ? null : value;
    if (typeof selected === 'number') message(`${PLANTS[selected].name}：${PLANTS[selected].description}。方向键选格，回车种植。`);
    else if (selected === 'shovel') message('点击一株植物将它铲除（一铲一除）。');
    else message('已取消选择。');
    updateUI();
  }
  let lastSun = -1;
  function updateUI() {
    const sunShown = game.cheat ? '∞' : game.sun;
    if (sunShown !== lastSun) { $('sun').textContent = sunShown; lastSun = sunShown; }
    cardButtons.forEach((button, i) => {
      button.classList.toggle('selected', selected === i); button.classList.toggle('unavailable', !game.cheat && (game.sun < PLANTS[i].cost || game.cooldowns[i] > 0));
      button.setAttribute('aria-pressed', String(selected === i));
      button.querySelector('.cooldown').style.height = `${game.cooldowns[i] / PLANTS[i].cooldown * 100}%`;
      button.querySelector('.price').textContent = game.cooldowns[i] > 0 ? `${Math.ceil(game.cooldowns[i])} 秒` : `☀ ${PLANTS[i].cost}`;
    });
    $('shovel').classList.toggle('selected', selected === 'shovel'); $('shovel').setAttribute('aria-pressed', String(selected === 'shovel'));
    $('pause').textContent = game.state === 'paused' ? '继续' : '暂停';
    $('pause').disabled = game.state !== 'playing' && game.state !== 'paused';
    $('sound').textContent = `音效：${soundOn ? '开' : '关'}`;
    $('restart').disabled = game.state === 'menu';
  }
  function showModal(kind, title, body, actionText, action, secondaryText = '', secondary = null) {
    modal = kind; $('overlay').hidden = false; $('dialog-title').textContent = title; $('dialog-text').textContent = body;
    $('eyebrow').textContent = kind === 'menu' ? '一场发生在葵田里的小小战役' : '向日葵保卫战';
    $('primary').textContent = actionText; primaryAction = action; secondaryAction = secondary;
    $('secondary').hidden = !secondaryText; $('secondary').textContent = secondaryText;
    $('level-buttons').hidden = kind !== 'menu';
    $('primary').focus({ preventScroll: true }); updateUI();
  }
  function hideModal() { $('overlay').hidden = true; modal = null; canvas.focus({ preventScroll: true }); }
  function menu() {
    game.state = 'menu'; chosenLevel = Math.min(chosenLevel, 3);
    $('level-buttons').replaceChildren();
    LEVELS.forEach((level, i) => {
      const open = level.endless || i <= unlocked;
      const label = !open ? `${i + 1} · 未解锁` : level.endless ? `4 · ${level.name}${bestWave ? `（最佳 第 ${bestWave} 波）` : ''}` : `${i + 1} · ${level.name}`;
      const b = document.createElement('button'); b.className = `level-button${i === chosenLevel ? ' chosen' : ''}`;
      b.textContent = label; b.disabled = !open;
      b.addEventListener('click', () => { chosenLevel = i; menu(); }); $('level-buttons').appendChild(b);
    });
    showModal('menu', '阳光，由我们守护。', '枯萎的向日葵变成了小僵尸，正朝小院走来。\n种下向日葵伙伴，收集阳光，守住三波来袭！', '开始守护', () => start(chosenLevel));
  }
  function start(level) {
    initAudio(); game.reset(level); selected = null; hover = null; usingKeyboard = false;
    banner = LEVELS[game.level].subtitle; bannerUntil = clock + 4; lastFrame = performance.now();
    hideModal(); message('把暖阳葵卡牌拖到草坪上种植，点击太阳收集阳光。', 7); updateUI();
  }
  function pauseGame() {
    if (game.state !== 'playing') return;
    game.pause();
    showModal('pause', '让阳光歇一会儿。', '花园已暂停，植物和僵尸都会等你回来。', '继续守护', resumeGame, '返回选关', menu);
  }
  function resumeGame() { game.resume(); lastFrame = performance.now(); hideModal(); updateUI(); }
  function togglePause() {
    if (game.state === 'playing') pauseGame();
    else if (game.state === 'paused' && modal === 'pause') resumeGame();
  }
  $('primary').addEventListener('click', () => { initAudio(); if (primaryAction) primaryAction(); });
  $('secondary').addEventListener('click', () => { if (secondaryAction) secondaryAction(); });
  $('pause').addEventListener('click', togglePause);
  $('shovel').addEventListener('click', () => select('shovel'));
  $('sound').addEventListener('click', () => { soundOn = !soundOn; if (soundOn) { initAudio(); tone(640, 0.1); } save(); updateUI(); });
  // 无敌模式：密码开关，开启后阳光无限、卡牌无冷却、植物不受伤害。
  function tryCheat() {
    if ($('cheat-password').value === 'zcheng') {
      game.cheat = true; $('cheat-dialog').hidden = true;
      $('cheat').classList.add('active'); $('cheat').textContent = '无敌：开';
      message('无敌模式开启：阳光无限、卡牌无冷却、植物不受伤害。', 5); updateUI();
    } else { $('cheat-error').textContent = '密码不对，再想想？'; $('cheat-password').select(); }
  }
  $('cheat').addEventListener('click', () => {
    if (game.cheat) {
      game.cheat = false; $('cheat').classList.remove('active'); $('cheat').textContent = '无敌模式';
      message('无敌模式已关闭。'); updateUI(); return;
    }
    $('cheat-dialog').hidden = false; $('cheat-password').value = ''; $('cheat-error').textContent = '';
    $('cheat-password').focus();
  });
  $('cheat-ok').addEventListener('click', tryCheat);
  $('cheat-cancel').addEventListener('click', () => { $('cheat-dialog').hidden = true; });
  $('cheat-password').addEventListener('keydown', event => {
    event.stopPropagation(); // 输密码时不触发游戏快捷键
    if (event.key === 'Enter') tryCheat();
    if (event.key === 'Escape') $('cheat-dialog').hidden = true;
  });
  // 难度滑动条：只放大/缩小此后出场的僵尸血量。
  const diffInput = $('difficulty');
  function diffLabel() { return `×${String(game.difficulty).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`; }
  diffInput.value = String(Math.round(game.difficulty * 100));
  $('diff-value').textContent = diffLabel();
  diffInput.addEventListener('input', () => {
    game.difficulty = diffInput.value / 100; $('diff-value').textContent = diffLabel();
    message(`僵尸强度调整为 ${diffLabel()}（对之后出场的僵尸生效）。`); save();
  });
  $('restart').addEventListener('click', () => {
    if (game.state === 'menu') return;
    const oldState = game.state; game.pause();
    showModal('restart', '重新播种这一关？', '本关的植物、阳光和战斗进度会重新开始。', '重开本关', () => start(game.level), '取消', () => {
      if (oldState === 'playing') resumeGame();
      else if (oldState === 'paused') { game.state = 'playing'; pauseGame(); }
      else showResult(oldState);
    });
  });
  $('help').addEventListener('click', () => {
    if (modal === 'help') return;
    const oldState = game.state; game.pause();
    showModal('help', '葵田生存小手册', '① 把植物卡牌拖到草坪上种下。点击太阳可获得 25 阳光。\n② 暖阳葵产阳光；瓜子射手攻击；冰露葵减速；翠玉瓜葵抛西瓜砸一片——空中飘着的气球葵尸也只有它能砸下来。\n③ 铁壳葵挡在前面；烈日葵种下后立刻蓄力爆炸。\n④ 合体进化：任意两株植物都能合体——拖一株到另一株上，或把卡牌直接拖到已种下的植物上！1级+1级=2级（相同种类进化出更强形态，不同种类合出同时拥有两种本领的混血大植物）；2级+1级=3级（本领更强，挂两颗金星）。\n⑤ 铲子一铲一除；每行小推车全场只能救援一次，之后别让僵尸到最左边！\n数字 1–5 选卡 · S 铲除 · Esc 取消 · 空格暂停\n方向键选格 + 回车种植；C 收集一个太阳。', '知道了', () => {
      if (oldState === 'playing') resumeGame();
      else if (oldState === 'menu') menu();
      else if (oldState === 'paused') { game.state = 'playing'; pauseGame(); }
      else showResult(oldState);
    });
  });
  function showResult(result) {
    game.state = result;
    if (result === 'won') {
      unlocked = Math.max(unlocked, Math.min(2, game.level + 1)); save();
      showModal('won', game.level === 2 ? '整片葵田，为你盛开！' : '这片阳光，守住了！', `你守住了三波来袭，击退 ${game.kills} 只葵花僵尸。\n${game.level === 2 ? '三关全部完成。无尽葵田在等你——看你能守多少波！' : '下一片葵田需要你，准备好继续出发了吗？'}`, game.level === 2 ? '挑战无尽葵田' : '前往下一关', () => start(game.level === 2 ? 3 : game.level + 1), '返回选关', menu);
    } else if (game.endless) {
      const record = game.wave > bestWave;
      if (record) { bestWave = game.wave; save(); }
      showModal('lost', `守到了第 ${game.wave} 波。`, `僵尸潮一浪接一浪，你共击退 ${game.kills} 只葵花僵尸。\n${record ? '这是你的新纪录，再试一次，也许还能守得更久！' : `当前最佳纪录是第 ${bestWave} 波，继续加油！`}`, '再守一次', () => start(game.level), '返回选关', menu);
    } else showModal('lost', '小院被葵尸闯进来了。', '别灰心，阳光还会升起。\n试试早点种暖阳葵，用铁壳葵保护后排射手。', '再试一次', () => start(game.level), '返回选关', menu);
  }
  function interact(x, y, keyboard = false) {
    if (game.state !== 'playing' || modal) return;
    initAudio();
    if (game.collect(x, y)) { updateUI(); return; }
    const cell = game.cell(x, y);
    if (!cell) return;
    keyboardCell = cell;
    if (selected === 'shovel') {
      const done = game.shovel(cell.row, cell.col);
      message(done ? '已铲除。铲子已放回，需要时再拿起。' : '这里没有需要铲除的植物。');
      if (done) selected = null; // one dig per pick-up
    } else if (typeof selected === 'number') {
      if (!keyboard) { message('把上方的植物卡牌拖到草坪上种植。'); return; }
      const error = game.plant(selected, cell.row, cell.col);
      if (error) message(error); else message(`${PLANTS[selected].name}已种下。`);
    } else message('拖动植物卡牌到草坪种植；点击掉落的太阳收集阳光。');
    updateUI();
  }
  function toField(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 1100, y: (event.clientY - rect.top) / rect.height * 650 }; }
  const pointer = toField;
  let plantDrag = null;
  canvas.addEventListener('pointermove', event => {
    const p = pointer(event);
    if (plantDrag) {
      if (plantDrag.pointerId === event.pointerId) {
        if (!plantDrag.moved && Math.hypot(event.clientX - plantDrag.startX, event.clientY - plantDrag.startY) >= 6) plantDrag.moved = true;
        plantDrag.x = p.x; plantDrag.y = p.y;
      }
      hover = game.cell(p.x, p.y); usingKeyboard = false; return;
    }
    if (game.dragged) { game.dragSun(p.x, p.y); return; }
    hover = game.cell(p.x, p.y); usingKeyboard = false;
  });
  canvas.addEventListener('pointerleave', () => { if (!game.dragged && !plantDrag) hover = null; });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; event.preventDefault(); canvas.focus({ preventScroll: true });
    const p = pointer(event); usingKeyboard = false;
    if (game.pickSun(p.x, p.y)) { try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* capture is a convenience, not a requirement */ } return; }
    const cell = game.cell(p.x, p.y);
    const plant = cell && game.plants.find(v => v.row === cell.row && v.col === cell.col);
    // Grab a planted flower to drag it onto a twin and fuse them into the evolved form.
    if (plant && game.state === 'playing' && !modal && selected !== 'shovel') {
      plantDrag = { plant, pointerId: event.pointerId, moved: false, startX: event.clientX, startY: event.clientY, x: p.x, y: p.y };
      try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* capture is a convenience, not a requirement */ }
      return;
    }
    interact(p.x, p.y);
  });
  canvas.addEventListener('pointerup', event => {
    if (plantDrag && plantDrag.pointerId === event.pointerId) {
      const d = plantDrag; plantDrag = null;
      if (!d.moved) return;
      const cell = game.cell(pointer(event).x, pointer(event).y);
      if (cell && (cell.row !== d.plant.row || cell.col !== d.plant.col)) {
        const dest = game.plants.find(v => v.row === cell.row && v.col === cell.col);
        if (game.fuse(d.plant, cell.row, cell.col)) {
          const fused = game.plants.find(v => v.row === cell.row && v.col === cell.col);
          const a = PLANTS.find(s => s.id === d.plant.kind).name, b = PLANTS.find(s => s.id === dest.kind).name;
          message(a === b ? `两株${a}合体，进化到 ${fused.level} 级！` : `${a}与${b}合体，进化到 ${fused.level} 级，本领更多了！`);
        }
        else if (dest) message(dest.level >= 3 ? '那株植物已经 3 级满级了。' : '两株 2 级植物不能合体，拖一株 1 级植物（或卡牌）来升级吧。');
        else message('松手的位置没有可以合体的植物。');
        updateUI();
      }
      return;
    }
    if (!game.dropSun()) return;
    message('收下了一份阳光。'); updateUI();
  });
  canvas.addEventListener('pointercancel', event => {
    if (plantDrag && plantDrag.pointerId === event.pointerId) plantDrag = null;
    game.dropSun();
  });
  canvas.addEventListener('contextmenu', event => { event.preventDefault(); selected = null; updateUI(); });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.key === 'Escape') {
      if (game.state === 'playing') { selected = null; message('已取消选择。'); }
      else if (modal === 'pause') resumeGame();
      updateUI(); return;
    }
    if (event.code === 'Space' && (game.state === 'playing' || modal === 'pause')) { event.preventDefault(); togglePause(); return; }
    if (game.state !== 'playing' || modal) return;
    if (/^[1-9]$/.test(event.key) && Number(event.key) <= PLANTS.length) { event.preventDefault(); select(Number(event.key) - 1); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); select('shovel'); }
    if (event.key.toLowerCase() === 'c') { const sun = game.suns[0]; if (sun) interact(sun.x, sun.y); }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault(); usingKeyboard = true; canvas.focus({ preventScroll: true });
      if (event.key === 'ArrowLeft') keyboardCell.col = Math.max(0, keyboardCell.col - 1);
      if (event.key === 'ArrowRight') keyboardCell.col = Math.min(8, keyboardCell.col + 1);
      if (event.key === 'ArrowUp') keyboardCell.row = Math.max(0, keyboardCell.row - 1);
      if (event.key === 'ArrowDown') keyboardCell.row = Math.min(4, keyboardCell.row + 1);
    }
    if (event.key === 'Enter' && document.activeElement === canvas) { event.preventDefault(); usingKeyboard = true; const p = center(keyboardCell.row, keyboardCell.col); interact(p.x, p.y, true); }
  });
  // No auto-pause on blur: the game only stops when the player pauses it. dt is clamped in frame() so a background tab can't fast-forward time.
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - (lastFrame || now)) / 1000)); lastFrame = now; clock += dt;
    game.update(dt);
    for (const event of game.events.splice(0)) {
      play(event.type);
      if (event.type === 'wave') {
        banner = game.endless ? `第 ${event.wave} 波僵尸潮涌来！` : event.wave === LEVELS[game.level].waves.length ? '最后一波！守住我们的阳光！' : `第 ${event.wave} 波葵花僵尸来啦！`;
        bannerUntil = clock + 4; message(banner, 5);
      }
      if (event.type === 'mower') message(`第 ${event.row + 1} 行的葵花小推车出动！这行不再有备用防线。`, 5);
      if (event.type === 'won' || event.type === 'lost') showResult(event.type);
    }
    if (clock > statusUntil && game.state === 'playing') {
      $('status').textContent = selected === 'shovel' ? '铲除模式：点击植物移除，一铲一除。' : typeof selected === 'number' ? `已选 ${PLANTS[selected].name} · 方向键选格，回车种植` : '拖动植物卡牌到草坪种植，点击太阳收集阳光。';
    }
    updateUI(); render(); requestAnimationFrame(frame);
  }
  menu(); requestAnimationFrame(frame);
})();
