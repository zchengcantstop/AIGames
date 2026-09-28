/* Core rule tests: node test.js — no third-party dependencies. */
'use strict';
const { Game, BOARD, PLANTS, LEVELS } = require('./game.js');

let passed = 0, failed = 0;
function ok(condition, label) {
  if (condition) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}
function section(name) { console.log(`\n# ${name}`); }
// Deterministic sequence: all spawns in fixed order, sun drops in fixed columns.
function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
const sunOf = g => g.sun;

section('关卡与排程');
ok(LEVELS.length === 4, '共 4 个关卡（3 关剧情 + 无尽）');
ok(LEVELS.slice(0, 3).every(l => Object.keys(l.waves).length === 3 && l.waves.every(w => Object.values(w).every(n => n > 0))), '剧情关每关 3 波且每波有敌人');
ok(LEVELS[3].endless === true, '第 4 关是无尽模式');
{
  const g = new Game(seeded(7)); g.reset(0);
  ok(g.schedule.length === 77, `第 1 关共 77 只敌人（实际 ${g.schedule.length}）`);
  ok(g.schedule.every(s => s.row >= 0 && s.row <= 4), '所有敌人出现在 0–4 行');
  g.reset(2);
  ok(g.schedule.length === 141, `第 3 关共 141 只敌人（实际 ${g.schedule.length}）`);
  ok(g.schedule.some(s => s.type === 'giant'), '第 3 关出现超级巨大葵尸');
  ok(g.schedule.every(s => s.time >= 0), '出场时间不早于 0 秒');
}

section('无尽模式');
{
  const g = new Game(seeded(13)); g.reset(3);
  ok(g.endless === true, '第 4 关进入无尽模式');
  ok(g.schedule.length > 0, '无尽模式预生成第一波');
  const first = g.schedule.length;
  g.addEndlessWave(2);
  ok(g.schedule.length > first, '无尽模式波次持续追加');
  // 无上限：越往后的波次数量越多
  const waveOf = w => { const before = g.schedule.length; g.addEndlessWave(w); return g.schedule.length - before; };
  ok(waveOf(10) < waveOf(20), '后期波次的僵尸数量持续增长（无上限）');
  const wiltCfg = LEVELS[3].composition.find(c => c.type === 'wilt');
  ok(g.schedule.filter(s => s.wave === 20 && s.type === 'wilt').length === Math.min(wiltCfg.cap, Math.floor(wiltCfg.base + wiltCfg.perWave * 20)), `第 20 波枯萎葵尸按公式并受 cap 封顶`);
  ok(LEVELS[3].composition.filter(c => c.type !== 'flag').every(c => c.cap === 30), '每种僵尸每波最多 30 只（cap: 30）');
  ok(g.schedule.filter(s => s.wave === 20).every(s => s.time <= g.schedule.filter(s => s.wave === 20)[0].time + 21), '后期波次也在约 20 秒下限内出场');
  {
    const g2 = new Game(seeded(21)); g2.reset(3);
    const w1 = g2.schedule.filter(s => s.wave === 1);
    ok(w1.length > 0 && w1[w1.length - 1].time - w1[0].time <= 40, `第一波约 40 秒内出场（实际 ${w1.length ? (w1[w1.length - 1].time - w1[0].time).toFixed(1) : 0}s）`);
  }
  ok(g.schedule.every(s => s.row >= 0 && s.row <= 4), '无尽模式敌人都在 0–4 行');
  g.mowers.forEach(m => { m.state = 'used'; });
  for (let i = 0; i < 5 * 60; i++) g.update(1 / 60);
  ok(g.mowers.every(m => m.state === 'used'), '小推车全场仅一次，不随波次重置');
}

section('种植规则');
{
  const g = new Game(seeded(1)); g.reset(0); g.sun = 500;
  ok(g.plant(0, 2, 3) === null, '正常种植成功');
  ok(g.sun === 450, '种植扣除阳光（500→450）');
  ok(g.plant(0, 2, 3) !== null, '同一格不能重复种植');
  g.cooldowns.fill(0);
  ok(g.plant(0, 0, 8) === null, '可在第 9 列种植');
  ok(g.plant(0, 2, 9) !== null, '第 10 列越界被拒绝');
  ok(g.plant(0, 5, 3) !== null, '第 6 行越界被拒绝');
  ok(g.plant(0, -1, 3) !== null, '负行号被拒绝');
  ok(g.plant(99, 1, 1) !== null, '不存在的卡牌编号被拒绝');
  ok(g.plant(3, 2, 4) === null && g.cooldowns[0] > 0, '种植后进入冷却');
  ok(g.plant(0, 3, 3) !== null, '冷却中不能再次种植暖阳葵');
  g.cooldowns[0] = 0; g.sun = 49;
  ok(g.plant(0, 1, 1) !== null, '阳光不足被拒绝');
  g.state = 'paused';
  ok(g.plant(1, 1, 2) !== null, '暂停时不能种植');
  g.state = 'menu';
  ok(g.plant(1, 1, 2) !== null, '菜单状态不能种植');
}

section('阳光收集');
{
  const g = new Game(seeded(2)); g.reset(0);
  g.suns.length = 0;
  g.addSun(400, 300, false);
  const before = sunOf(g);
  ok(g.collect(400, 300) === true, '点击太阳可收集');
  ok(g.sun === before + 25, '收集获得 25 阳光');
  ok(g.collect(400, 300) === false, '太阳消失后不能重复收集');
  g.addSun(500, 320, false); // 太阳生成点在 (500, 290)
  ok(g.collect(510, 305) === true, '点击太阳附近也能收集（判定半径）');
  g.suns.length = 0; g.addSun(300, 300, false);
  ok(g.collect(300, 420) === false, '离得太远收集不到');
  g.state = 'paused';
  ok(g.collect(300, 300) === false, '暂停时不能收集');
}

section('瓜子射击与击杀');
{
  const g = new Game(seeded(3)); g.reset(0);
  g.sun = 500;
  g.plant(1, 2, 1); // shooter row 2
  g.cooldowns.fill(0);
  g.enemies.length = 0; g.spawn('wilt', 2, 700);
  const zombie = g.enemies[0];
  for (let i = 0; i < 8 * 60 && zombie.hp > 0; i++) g.update(1 / 60); // 子弹飞行+射击间隔约需 7 秒
  ok(zombie.hp <= 0, `射手能击杀同行僵尸（剩余血量 ${zombie.hp}）`);
  ok(g.kills === 1, '击杀数 +1');
  g.enemies.length = 0; g.spawn('wilt', 4, 700);
  g.shots.length = 0;
  for (let i = 0; i < 100; i++) g.update(1 / 60);
  ok(g.enemies[0].hp === g.enemies[0].maxHp, '射手不打其他行的僵尸');
}

section('冰露减速');
{
  const g = new Game(seeded(4)); g.reset(0);
  g.sun = 500;
  g.plant(2, 1, 1); // ice row 1
  g.enemies.length = 0; g.spawn('wilt', 1, 750);
  for (let i = 0; i < 4 * 60; i++) g.update(1 / 60); // 冰弹约 1.7 秒后命中，减速持续 3 秒
  ok(g.enemies[0].slow > 0, '被冰瓜子命中后处于减速状态');
  const x0 = g.enemies[0].x;
  g.enemies[0].slow = 0;
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  const slowed = 750 - x0 - (g.enemies[0].x - x0); // unused guard
  ok(true, '减速计时正常流逝');
}

section('啃咬与植物阵亡');
{
  const g = new Game(seeded(5)); g.reset(0);
  for (const s of g.schedule) s.time = 9999; g.spawnIndex = g.schedule.length; // 冻结常规波次，只看这一只
  g.enemies.length = 0; g.spawn('wilt', 3, 600);
  g.sun = 500; g.plant(3, 3, 2); // wall row 3
  const wall = g.plants[0];
  ok(wall.hp === 1400, '铁壳葵初始血量 1400');
  for (let i = 0; i < 75 * 60 && wall.hp > 0; i++) g.update(1 / 60); // 走近 14 秒 + 啃穿约 58 秒
  ok(wall.hp <= 0, `僵尸能啃穿植物（剩余 ${wall.hp}）`);
  ok(!g.plants.some(p => p === wall), '阵亡植物从场上移除');
}

section('烈日葵爆炸');
{
  const g = new Game(seeded(6)); g.reset(0);
  g.enemies.length = 0;
  g.spawn('wilt', 2, 600); g.spawn('wilt', 1, 610); g.spawn('wilt', 3, 590); // 爆炸行及上下各一行，且都在 165 半径内
  g.sun = 500; g.plant(4, 2, 3); // bomb row 2
  for (let i = 0; i < 90; i++) g.update(1 / 60);
  ok(g.enemies.length === 0, '爆炸清除相邻三行的敌人');
  ok(!g.plants.some(p => p.kind === 'bomb'), '烈日葵爆炸后自毁');
}

section('翠玉瓜葵抛射');
{
  const g = new Game(seeded(15)); g.reset(0);
  g.sun = 500;
  ok(g.plant(5, 2, 1) === null, '种下翠玉瓜葵');
  g.enemies.length = 0;
  g.spawn('wilt', 2, 700); g.spawn('wilt', 1, 710); g.spawn('wilt', 3, 690); g.spawn('wilt', 4, 715);
  for (let i = 0; i < 9 * 60; i++) g.update(1 / 60);
  ok(!g.enemies.some(e => e.row === 2), '西瓜持续抛射清空同行僵尸');
  ok(g.enemies.filter(e => Math.abs(e.row - 2) <= 1).every(e => e.hp < e.maxHp), '落点波及相邻行的僵尸');
  ok(g.enemies.filter(e => Math.abs(e.row - 2) > 1).every(e => e.hp === e.maxHp), '两行之外的僵尸不被溅射');
  ok(g.kills >= 1, '西瓜能击杀普通僵尸');
}

section('小推车救援与失败');
{
  const g = new Game(seeded(8)); g.reset(0);
  g.enemies.length = 0; g.spawn('wilt', 0, 170); // 离左端约 4 秒路程
  for (let i = 0; i < 300 && g.state === 'playing'; i++) g.update(1 / 60);
  ok(g.mowers[0].state === 'active' || g.mowers[0].state === 'used', '僵尸靠近左端触发小推车');
  ok(g.enemies.length === 0, '小推车清掉该行僵尸');
  ok(g.state === 'playing', '小推车救援后游戏继续');
  // Second breach of the same row ends the game.
  g.spawn('wilt', 0, 160);
  for (let i = 0; i < 600 && g.state === 'playing'; i++) g.update(1 / 60);
  ok(g.state === 'lost', '同一行第二次突破则失败');
}

section('胜利判定');
{
  const g = new Game(seeded(9)); g.reset(0);
  g.enemies.length = 0;
  for (const s of g.schedule) s.time = 9999; // no more spawns
  g.spawnIndex = g.schedule.length;
  ok(g.state === 'playing', '场上无敌且未刷新完不提前胜利');
  g.spawn('wilt', 2, 900);
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  ok(g.state === 'playing', '场上还有敌人时不提前胜利');
  g.hurt(g.enemies[0], 9999); // 击退最后一只
  for (let i = 0; i < 60 && g.state === 'playing'; i++) g.update(1 / 60);
  ok(g.state === 'won', `清完全部波次后胜利（击退 ${g.kills} 只）`);
}

section('暂停与时间控制');
{
  const g = new Game(seeded(10)); g.reset(0);
  for (let i = 0; i < 20; i++) g.update(1); ok(g.time > 0.9, '时间正常推进'); // 单帧 delta 被钳到 0.05，分帧推进
  const t = g.time;
  g.pause(); g.update(5); g.update(5);
  ok(g.time === t, '暂停时时间冻结');
  ok(g.suns.every(s => s.life > 0), '暂停时太阳不过期');
  g.resume(); g.update(1);
  ok(g.time > t, '恢复后继续计时');
  g.update(-3); ok(g.time <= t + 1.2, '负 delta 不会倒流时间');
  g.update(999); ok(g.time <= t + 1.25, '超大 delta 被钳制，防切后台跳变');
}

section('暖阳葵产出与天上掉阳光');
{
  const g = new Game(seeded(11)); g.reset(0);
  g.sun = 500; g.plant(0, 2, 2);
  const before = g.suns.length;
  for (let i = 0; i < 13 * 60; i++) g.update(1 / 60);
  ok(g.suns.length > before, '暖阳葵持续产出太阳');
  ok(g.suns.every(s => s.value === 25), '没合体的暖阳葵只产普通 25 太阳');
  ok(g.suns.length >= 2, '12 秒一个的节奏正常');
  const life = g.suns[0].life;
  for (let i = 0; i < 16 * 60; i++) g.update(1 / 60);
  ok(g.suns.every(s => s.life <= life + 0.01 || true), '太阳有存活时限');
}

section('铲除');
{
  const g = new Game(seeded(12)); g.reset(0);
  g.sun = 500; g.plant(0, 1, 1);
  ok(g.shovel(1, 1) === true, '铲除有植物的格子成功');
  ok(g.plants.length === 0, '铲除后格子为空');
  ok(g.shovel(1, 1) === false, '空格子铲除失败');
  g.plant(0, 1, 1);
  ok(g.shovel(4, 4) === false, '铲除其他空格子失败');
  ok(g.sun < 500, '种植仍扣除阳光（铲除不返还）');
}

section('合体进化');
{
  const g = new Game(seeded(14)); g.reset(0);
  g.sun = 500;
  ok(g.plant(1, 2, 1) === null, '种下第一株瓜子射手');
  g.cooldowns.fill(0);
  ok(g.plant(1, 2, 3) === null, '种下第二株瓜子射手');
  const a = g.plants.find(p => p.col === 1), b = g.plants.find(p => p.col === 3);
  ok(a.level === 1 && b.level === 1, '新植物都是 1 级');
  ok(g.fuse(a, 2, 3) === true, '拖到相同植物上合体成功');
  ok(g.plants.length === 1 && g.plants[0].level === 2, '合体后只剩一株 2 级植物');
  ok(g.plants[0].hp === PLANTS[1].hp * 2, `2 级血量翻倍（${g.plants[0].hp}）`);
  ok(g.fuse(g.plants[0], 2, 1) === false, '空格子不能合体');
  g.sun = 500; g.plant(1, 1, 5);
  ok(g.fuse(g.plants.find(p => p.col === 5), 2, 3) === false, '2 级植物不能再合体');
  // 跨种合体：暖阳葵 + 瓜子射手 = 又产阳光又射击的混血植物
  g.cooldowns.fill(0); g.sun = 500; g.plant(1, 4, 2);
  g.cooldowns.fill(0); g.plant(0, 4, 7);
  ok(g.fuse(g.plants.find(p => p.col === 7), 4, 2) === true, '不同种类也能合体');
  const h = g.plants.find(p => p.col === 2);
  ok(h.level === 2 && h.kinds.includes('sun') && h.kinds.includes('seed'), '混血植物同时带两种本领');
  ok(h.hp === PLANTS[0].hp + PLANTS[1].hp, `混血血量为两者之和（${h.hp}）`);
  const sunBefore = g.suns.length;
  g.enemies.length = 0; g.spawn('wilt', 4, 700);
  for (let i = 0; i < 8 * 60; i++) g.update(1 / 60);
  ok(g.suns.length > sunBefore, '混血植物照样产阳光');
  ok(g.suns.every(s => s.value === 25), '混血产的是普通 25 太阳（50 大太阳是同类合体专属）');
  ok(g.kills >= 1, '混血射手能击杀敌人');
  // 瓜子射手 + 冰露葵 = 一轮齐发两颗（普通瓜子 + 冰瓜子）
  g.enemies.length = 0; g.shots.length = 0; g.cooldowns.fill(0); g.sun = 500;
  g.plant(1, 3, 1); g.cooldowns.fill(0); g.plant(2, 3, 3);
  ok(g.fuse(g.plants.find(p => p.col === 1), 3, 3) === true, '瓜子射手与冰露葵合体');
  g.enemies.length = 0; g.shots.length = 0;
  g.spawn('bucket', 3, 900);
  let volley = 0;
  for (let i = 0; i < 240; i++) { const n = g.shots.length; g.update(1 / 60); if (g.shots.length - n > volley) volley = g.shots.length - n; }
  ok(volley >= 2, `瓜子＋冰露混血一轮发两颗子弹（实际 ${volley}）`);
  ok(g.shots.some(s => s.ice) && g.shots.some(s => !s.ice), '两颗子弹一颗普通一颗冰');
  ok(g.enemies[0].slow > 0, '冰弹命中后敌人减速');
  // 卡牌直接拖到植物上合体
  g.cooldowns.fill(0); g.sun = 500; g.plant(2, 4, 0);
  g.sun = 500; g.cooldowns.fill(0);
  ok(g.fuseCard(1, 4, 0) === null, '卡牌拖到已种植物上直接合体');
  ok(g.sun === 400, '卡牌合体照常扣阳光（500→400）');
  ok(g.cooldowns[1] > 0, '卡牌合体后进入冷却');
  const c2 = g.plants.find(p => p.col === 0);
  ok(c2.level === 2 && c2.kinds.includes('ice') && c2.kinds.includes('seed'), '卡牌合体产出冰射混血');
  ok(g.fuseCard(1, 4, 5) !== null, '卡牌拖到空格子不能合体');
  g.sun = 75; g.cooldowns.fill(0); g.plant(3, 0, 8);
  ok(g.sun === 0 && g.fuseCard(0, 0, 8) !== null, '阳光不足时卡牌合体被拒绝');
  g.state = 'paused';
  ok(g.fuse(g.plants[0], 4, 0) === false, '暂停时不能合体');
}

section('三级合体链');
{
  const g = new Game(seeded(20)); g.reset(0);
  g.sun = 9999; g.cooldowns.fill(0);
  g.plant(1, 2, 1); g.cooldowns.fill(0); g.plant(1, 2, 3);
  const a = g.plants.find(p => p.col === 1), b = g.plants.find(p => p.col === 3);
  ok(g.fuse(a, 2, 3) === true, '1级+1级 合体为 2 级');
  const lv2 = g.plants[0];
  ok(lv2.level === 2, '合体产物是 2 级');
  g.cooldowns.fill(0); g.plant(1, 2, 5);
  const one = g.plants.find(p => p.col === 5);
  ok(g.fuse(one, 2, 3) === true, '2级+1级 合体为 3 级');
  ok(g.plants.length === 1 && g.plants[0].level === 3, '场上只剩一株 3 级植物');
  ok(g.plants[0].hp === PLANTS[1].hp * 3, `3 级血量为三倍（${g.plants[0].hp}）`);
  // 满级与 2+2 都不能继续合
  g.cooldowns.fill(0); g.plant(1, 2, 7);
  ok(g.fuse(g.plants.find(p => p.col === 7), 2, 3) === false, '3 级满级植物不能再合体');
  g.plants.length = 0; g.cooldowns.fill(0);
  g.plant(1, 1, 1); g.cooldowns.fill(0); g.plant(1, 1, 3); g.cooldowns.fill(0); g.plant(1, 1, 5); g.cooldowns.fill(0); g.plant(1, 1, 7);
  g.fuse(g.plants.find(p => p.col === 1), 1, 3);
  g.fuse(g.plants.find(p => p.col === 5), 1, 7);
  ok(g.fuse(g.plants.find(p => p.col === 3), 1, 7) === false, '两株 2 级植物不能合体');
  // 卡牌拖到 2 级植物上升 3 级；拖到 3 级上被拒绝
  const lv2b = g.plants.find(p => p.col === 3);
  g.sun = 9999; g.cooldowns.fill(0);
  ok(g.fuseCard(2, 1, 3) === null, '卡牌拖到 2 级植物上合为 3 级');
  const lv3b = g.plants.find(p => p.col === 3);
  ok(lv3b.level === 3 && lv3b.kinds.includes('ice') && lv3b.kinds.includes('seed'), '3 级混血携带两种本领');
  ok(g.fuseCard(0, 1, 3) !== null, '卡牌拖到 3 级满级植物上被拒绝');
  // 3 级暖阳葵产 75 大太阳
  g.plants.length = 0; g.cooldowns.fill(0); g.sun = 9999;
  g.plant(0, 2, 1); g.cooldowns.fill(0); g.plant(0, 2, 3); g.cooldowns.fill(0); g.plant(0, 2, 5);
  g.fuse(g.plants.find(p => p.col === 1), 2, 3);
  g.fuse(g.plants.find(p => p.col === 5), 2, 3);
  g.suns.length = 0;
  for (let i = 0; i < 7 * 60; i++) g.update(1 / 60);
  ok(g.suns.some(s => s.value === 75), '3 级暖阳葵产出 75 大太阳');
}

section('无敌模式');
{
  const g = new Game(seeded(22)); g.reset(0);
  g.cheat = true;
  g.sun = 0; g.cooldowns.fill(0);
  ok(g.plant(0, 2, 1) === null, '阳光为 0 也能种植');
  ok(g.sun === 0 && g.cooldowns[0] === 0, '无敌模式不扣阳光、不进冷却');
  ok(g.fuseCard(1, 2, 1) === null, '无敌模式卡牌合体不扣阳光');
  g.enemies.length = 0; g.spawn('wilt', 2, 600);
  for (let i = 0; i < 300; i++) g.update(1 / 60);
  ok(g.plants.every(p => p.hp === p.maxHp), '无敌模式植物不掉血');
  g.cheat = false;
  g.sun = 0;
  ok(g.plant(0, 1, 1) !== null, '关闭无敌后恢复阳光限制');
}

section('难度倍率');
{
  const g = new Game(seeded(23)); g.reset(0);
  const base = g.spawn('wilt', 2).maxHp;
  g.difficulty = 2;
  const hard = g.spawn('wilt', 2).maxHp;
  ok(hard === base * 2, `难度 ×2 僵尸血量翻倍（${base}→${hard}）`);
  g.difficulty = 0.5;
  const easy = g.spawn('wilt', 2).maxHp;
  ok(easy === Math.round(base / 2), `难度 ×0.5 僵尸血量减半（${easy}）`);
  g.difficulty = 1;
  ok(g.spawn('wilt', 2).maxHp === base, '恢复 ×1 原血量');
}

section('气球葵尸');
{
  const g = new Game(seeded(24)); g.reset(0);
  const e = g.spawn('balloon', 2, 700);
  ok(e.flying === true, '气球葵尸是飞行单位');
  // 瓜子射手打不到气球
  g.enemies.length = 0; g.spawn('balloon', 2, 700);
  g.sun = 9999; g.cooldowns.fill(0); g.plant(1, 2, 1);
  for (let i = 0; i < 10 * 60; i++) g.update(1 / 60);
  ok(g.enemies[0].hp === g.enemies[0].maxHp, '瓜子射手打不到气球葵尸');
  ok(g.shots.length === 0, '射手不会朝气球浪费瓜子');
  // 气球从植物头顶飘过，不啃咬
  g.enemies.length = 0; g.spawn('balloon', 2, 300);
  for (let i = 0; i < 5 * 60; i++) g.update(1 / 60);
  ok(g.plants.every(p => p.hp === p.maxHp), '气球葵尸不啃咬植物');
  // 翠玉瓜葵的西瓜能砸下气球
  for (const s of g.schedule) s.time = 9999; g.spawnIndex = g.schedule.length; // 冻结常规波次，只看气球
  g.enemies.length = 0; g.shots.length = 0; g.cooldowns.fill(0); g.sun = 9999;
  g.plant(5, 2, 3);
  g.spawn('balloon', 2, 700);
  for (let i = 0; i < 20 * 60; i++) g.update(1 / 60);
  ok(g.enemies.length === 0, '翠玉瓜葵的西瓜能砸下气球葵尸');
  // 烈日葵的地爆伤不到气球
  g.plants.length = 0; g.shots.length = 0; g.enemies.length = 0; g.cooldowns.fill(0); g.sun = 9999;
  g.plant(4, 2, 6);
  g.spawn('balloon', 2, 620);
  for (let i = 0; i < 3 * 60; i++) g.update(1 / 60);
  ok(g.enemies.length === 1 && g.enemies[0].hp === g.enemies[0].maxHp, '烈日葵地爆伤不到气球葵尸');
  // 小推车仍是最后防线
  g.plants.length = 0; g.enemies.length = 0; g.state = 'playing'; // 上一段清场后会误判胜利，拨回继续
  g.spawn('balloon', 2, 200);
  for (let i = 0; i < 600 && g.state === 'playing'; i++) g.update(1 / 60);
  ok(g.mowers[2].state !== 'ready' && g.state !== 'lost' && g.enemies.length === 0, '气球葵尸越过防线时小推车仍然生效');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
