/* Standalone rules: no DOM, timers, engine, or network dependencies. */
(function (root) {
  'use strict';
  const WAVE_CONFIG = root.WAVE_CONFIG || (typeof require === 'function' ? require('./waves.js') : null);
  const BOARD = Object.freeze({ x: 124, y: 132, cols: 9, rows: 5, w: 98, h: 96 });
  const PLANTS = Object.freeze([
    { id: 'sun', name: '暖阳葵', cost: 50, cooldown: 5, hp: 180, description: '每 12 秒产出阳光', color: '#ffd34f' },
    { id: 'seed', name: '瓜子射手', cost: 100, cooldown: 6, hp: 200, description: '发射瓜子守住一行', color: '#f8bc35' },
    { id: 'ice', name: '冰露葵', cost: 150, cooldown: 9, hp: 180, description: '冰瓜子减缓敌人', color: '#a1e5ed' },
    { id: 'wall', name: '铁壳葵', cost: 75, cooldown: 12, hp: 1400, description: '厚实葵壳抵挡啃咬', color: '#d4ad67' },
    { id: 'bomb', name: '烈日葵', cost: 125, cooldown: 25, hp: 200, description: '炸开附近三行敌人', color: '#ff8b43' },
    { id: 'melon', name: '翠玉瓜葵', cost: 150, cooldown: 10, hp: 200, description: '抛出西瓜砸伤一片', color: '#9be15d' }
  ]);
  const ENEMIES = Object.freeze({
    wilt: { name: '枯萎葵尸', hp: 130, speed: 14, damage: 24 },
    flag: { name: '领队葵尸', hp: 220, speed: 17, damage: 26 },
    pot: { name: '葵盆头', hp: 320, speed: 12, damage: 28 },
    runner: { name: '疾跑小葵尸', hp: 100, speed: 28, damage: 20 },
    bucket: { name: '瓜子桶', hp: 500, speed: 11, damage: 30 },
    bruiser: { name: '大块头葵尸', hp: 700, speed: 9.5, damage: 42 },
    giant: { name: '超级巨大葵尸', hp: 1600, speed: 7, damage: 90 },
    balloon: { name: '气球葵尸', hp: 300, speed: 13, damage: 0, flying: true }
  });
  const LEVELS = Object.freeze(WAVE_CONFIG.levels.concat([WAVE_CONFIG.endless]));
  const center = (row, col) => ({ x: BOARD.x + (col + 0.5) * BOARD.w, y: BOARD.y + (row + 0.5) * BOARD.h });
  class Game {
    constructor(random = Math.random) { this.random = random; this.cheat = false; this.difficulty = 1; this.reset(0); this.state = 'menu'; }
    reset(level = 0) {
      this.level = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(Number(level) || 0)));
      this.endless = !!LEVELS[this.level].endless;
      this.state = 'playing'; this.time = 0; this.sun = 200; this.wave = 0; this.kills = 0;
      this.plants = []; this.enemies = []; this.shots = []; this.suns = []; this.effects = []; this.events = [];
      this.cooldowns = PLANTS.map(() => 0); this.mowers = Array.from({ length: 5 }, (_, row) => ({ row, x: 91, state: 'ready' }));
      this.dragged = null;
      this.nextSun = 4; this.nextId = 1; this.schedule = []; this.spawnIndex = 0;
      if (this.endless) this.addEndlessWave(1);
      else {
        const config = LEVELS[this.level];
        config.waves.forEach((composition, wave) => {
          let i = 0;
          for (const type in composition) {
            for (let n = 0; n < composition[type]; n++) {
              this.schedule.push({ time: config.times[wave] + i * config.gap, row: (i + wave * 2) % 5, type, wave: wave + 1 });
              i++;
            }
          }
        });
      }
    }
    // Endless mode: keep appending bigger, faster waves as the player survives.
    addEndlessWave(wave) {
      const config = LEVELS[3];
      const start = this.schedule.length ? this.schedule[this.schedule.length - 1].time + config.waveGap : config.startDelay;
      // Each wave deploys inside a time budget that starts near waveSpan seconds, shrinks
      // with every wave, and never drops below waveSpanFloor — zombies keep coming at a
      // readable pace even in deep waves.
      const budget = Math.max(config.waveSpanFloor || 3, config.waveSpan - wave * (config.waveSpanPerWave || 1));
      const entries = [];
      for (const c of config.composition) {
        if (wave < c.fromWave) continue;
        const count = c.cap != null ? Math.min(c.cap, Math.floor(c.base + c.perWave * wave)) : Math.floor(c.base + c.perWave * wave);
        for (let n = 0; n < count; n++) entries.push(c.type);
      }
      const gap = Math.max(config.minGap, budget / Math.max(1, entries.length));
      entries.forEach((type, i) => this.schedule.push({ time: start + i * gap, row: Math.floor(this.random() * 5), type, wave }));
    }
    emit(type, data = {}) { this.events.push({ type, ...data }); }
    pause() { if (this.state === 'playing') this.state = 'paused'; }
    resume() { if (this.state === 'paused') this.state = 'playing'; }
    cell(x, y) {
      const col = Math.floor((x - BOARD.x) / BOARD.w), row = Math.floor((y - BOARD.y) / BOARD.h);
      return row >= 0 && row < 5 && col >= 0 && col < 9 ? { row, col } : null;
    }
    plant(index, row, col) {
      if (this.state !== 'playing') return '请先开始或继续游戏';
      const spec = PLANTS[index];
      if (!spec || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 5 || col < 0 || col >= 9) return '请种在草坪格子里';
      if (this.plants.some(p => p.row === row && p.col === col)) return '这里已经有一株向日葵了';
      if (!this.cheat) { // 无敌模式：不扣阳光、不进冷却
        if (this.cooldowns[index] > 0) return '种子还在准备中，请稍等';
        if (this.sun < spec.cost) return '阳光不够，点击太阳收集阳光';
        this.sun -= spec.cost;
      }
      this.cooldowns[index] = this.cheat ? 0 : spec.cooldown;
      const p = { ...center(row, col), id: this.nextId++, kind: spec.id, kinds: [spec.id], row, col, level: 1, hp: spec.hp, maxHp: spec.hp, timer: spec.id === 'bomb' ? 1.1 : 0.5, sunTimer: 7, age: 0, hit: 0, burst: 0, burstT: 0 };
      this.plants.push(p); this.emit('plant', { x: p.x, y: p.y }); return null;
    }
    // Build the fused plant that results from combining two plants:
    // 1级+1级 → 2级（同种进化 / 异种混血），2级+1级 → 3级。
    // HP adds up: the fused plant carries the combined HP of everything that went into it.
    evolve(kinds, row, col, level = 2, hp = null) {
      const unique = [...new Set(kinds)];
      const total = hp != null ? hp : kinds.reduce((sum, k) => sum + PLANTS.find(s => s.id === k).hp, 0);
      const p = { ...center(row, col), id: this.nextId++, kind: unique[0], kinds: unique, row, col, level, hp: total, maxHp: total, timer: unique.includes('bomb') ? 1.1 : 0.5, sunTimer: unique.length === 1 ? 6 : 12, age: 0, hit: 0, burst: 0, burstT: 0 };
      this.plants.push(p);
      this.effects.push({ type: 'blast', x: p.x, y: p.y - 16, life: 0.7, maxLife: 0.7 });
      this.emit('fuse');
      return p;
    }
    // Drag one plant onto another to fuse: 1+1 → 2级，2+1 → 3级；两株 2 级不能合体。
    fuse(source, row, col) {
      if (this.state !== 'playing' || !this.plants.includes(source)) return false;
      const dest = this.plants.find(p => p.row === row && p.col === col);
      if (!dest || dest === source || source.level >= 3 || dest.level >= 3 || source.level + dest.level > 3) return false;
      const level = Math.max(source.level, dest.level) + 1;
      this.plants = this.plants.filter(p => p !== source && p !== dest);
      this.evolve([...source.kinds, ...dest.kinds], row, col, level, source.maxHp + dest.maxHp);
      return true;
    }
    // Drag a card straight onto a planted flower to fuse without pre-planting a twin.
    fuseCard(index, row, col) {
      if (this.state !== 'playing') return '请先开始或继续游戏';
      const spec = PLANTS[index];
      const dest = this.plants.find(p => p.row === row && p.col === col);
      if (!dest || dest.level >= 3) return '只能拖到 3 级以下的植物上合体';
      if (!this.cheat) { // 无敌模式：不扣阳光、不进冷却
        if (this.cooldowns[index] > 0) return '种子还在准备中，请稍等';
        if (this.sun < spec.cost) return '阳光不够，点击太阳收集阳光';
        this.sun -= spec.cost;
      }
      this.cooldowns[index] = this.cheat ? 0 : spec.cooldown;
      this.plants = this.plants.filter(p => p !== dest);
      this.evolve([spec.id, ...dest.kinds], row, col, dest.level + 1, dest.maxHp + spec.hp);
      return null;
    }
    shovel(row, col) {
      if (this.state !== 'playing') return false;
      const p = this.plants.find(p => p.row === row && p.col === col);
      if (!p) return false;
      this.plants = this.plants.filter(other => other !== p); this.emit('shovel'); return true;
    }
    addSun(x, y, sky = false, value = 25) {
      this.suns.push({ id: this.nextId++, x, y: sky ? 90 : y - 30, targetY: y, age: 0, life: 15, value });
    }
    gainSun(s) {
      this.sun += s.value; this.suns.splice(this.suns.indexOf(s), 1);
      this.effects.push({ type: 'text', x: s.x, y: s.y, life: 0.9, maxLife: 0.9, text: `+${s.value}`, color: '#fff7a4' });
      this.emit('collect');
    }
    collect(x, y) {
      if (this.state !== 'playing') return false;
      const s = this.suns.find(s => Math.hypot(s.x - x, s.y - y) < 33);
      if (s) { this.gainSun(s); return true; }
      return false;
    }
    pickSun(x, y) {
      if (this.state !== 'playing') return null;
      const s = this.suns.find(s => Math.hypot(s.x - x, s.y - y) < 33);
      if (s) this.dragged = s;
      return s || null;
    }
    dragSun(x, y) {
      const s = this.dragged;
      if (!s) return;
      s.x = Math.max(18, Math.min(1082, x)); s.y = Math.max(18, Math.min(632, y));
      s.targetY = Math.max(s.targetY, s.y);
    }
    dropSun() {
      const s = this.dragged;
      this.dragged = null;
      if (!s || this.state !== 'playing' || !this.suns.includes(s)) return false;
      this.gainSun(s); return true;
    }
    spawn(type, row, x = 1064) {
      const spec = ENEMIES[type];
      if (!spec || row < 0 || row > 4) return;
      // Later levels and deeper endless waves field tougher zombies; the difficulty slider scales HP further.
      const boost = (this.endless ? 1 + this.wave * 0.07 : 1 + this.level * 0.12) * (this.difficulty || 1);
      const hp = Math.round(spec.hp * boost);
      const e = { ...spec, type, row, x, y: center(row, 0).y, id: this.nextId++, hp, maxHp: hp, slow: 0, hit: 0, biting: false, age: 0 };
      this.enemies.push(e); return e;
    }
    hurt(enemy, damage, freeze = false) {
      if (enemy.hp <= 0) return;
      enemy.hp -= damage; enemy.hit = 0.13;
      if (freeze) enemy.slow = 3;
      if (enemy.hp <= 0) {
        this.kills++; this.effects.push({ type: 'petals', x: enemy.x, y: enemy.y - 24, life: 0.65, maxLife: 0.65, color: '#d9b947' }); this.emit('kill');
      }
    }
    fire(p) {
      const ice = p.kinds.includes('ice'), seed = p.kinds.includes('seed');
      if (ice && seed) { // a seed+ice hybrid fires one of each
        this.shots.push({ x: p.x + 27, y: p.y - 31, row: p.row, damage: 27, ice: false });
        this.shots.push({ x: p.x + 27, y: p.y - 18, row: p.row, damage: 20, ice: true });
      } else this.shots.push({ x: p.x + 27, y: p.y - 23, row: p.row, damage: ice ? 20 : 27, ice });
      this.emit('shoot');
    }
    // Lob a watermelon on a parabola; it splashes everything near where it lands.
    lob(p, target) {
      const power = p.level >= 3 ? 3 : (p.level === 2 && p.kinds.length === 1 ? 2 : 1);
      this.shots.push({
        lob: true, sx: p.x + 20, sy: p.y - 34, tx: target.x, ty: target.y, t: 0,
        dur: Math.max(0.45, Math.min(1.1, Math.abs(target.x - p.x) / 420)),
        damage: power === 3 ? 130 : power === 2 ? 90 : 55, splash: power === 3 ? 150 : power === 2 ? 120 : 85
      });
      this.emit('shoot');
    }
    update(delta) {
      if (this.state !== 'playing') return;
      const dt = Math.max(0, Math.min(0.05, Number(delta) || 0));
      this.time += dt;
      this.cooldowns = this.cooldowns.map(value => Math.max(0, value - dt));
      this.nextSun -= dt;
      if (this.nextSun <= 0) { this.addSun(BOARD.x + 40 + this.random() * 800, 195 + this.random() * 365, true); this.nextSun = 7; }
      if (this.endless && this.spawnIndex >= this.schedule.length - 2) this.addEndlessWave(this.wave + 1);
      while (this.spawnIndex < this.schedule.length && this.schedule[this.spawnIndex].time <= this.time) {
        const next = this.schedule[this.spawnIndex++];
        if (this.wave !== next.wave) { this.wave = next.wave; this.emit('wave', { wave: next.wave }); }
        this.spawn(next.type, next.row);
      }
      for (const p of this.plants) {
        if (p.hp <= 0) continue;
        // 强化档位：1=基础，2=纯种 2 级，3=3 级（纯种与混血同享）。
        const power = p.level >= 3 ? 3 : (p.level === 2 && p.kinds.length === 1 ? 2 : 1);
        p.age += dt; p.hit = Math.max(0, p.hit - dt); p.timer -= dt;
        // Every ability the plant carries (hybrids have several) runs independently.
        if (p.kinds.includes('sun')) {
          p.sunTimer -= dt;
          if (p.sunTimer <= 0) { this.addSun(p.x + 18, p.y + 4, false, power === 3 ? 75 : power === 2 ? 50 : 25); p.sunTimer = power === 3 ? 4.5 : power === 2 ? 6 : 12; }
        }
        if ((p.kinds.includes('seed') || p.kinds.includes('ice')) && p.timer <= 0) {
          if (this.enemies.some(e => e.hp > 0 && !e.flying && e.row === p.row && e.x > p.x - 12 && e.x < 1090)) {
            this.fire(p); p.timer = power === 3 ? (p.kinds.includes('ice') ? 1.0 : 0.75) : power === 2 ? (p.kinds.includes('ice') ? 1.3 : 1.0) : (p.kinds.includes('ice') ? 1.7 : 1.35);
            if (power > 1) { p.burst = power - 1; p.burstT = 0.13; } // 升级射手紧接着再补发瓜子
          } else p.timer = 0;
        }
        if (p.burst > 0) { p.burstT -= dt; if (p.burstT <= 0) { this.fire(p); p.burst--; p.burstT += 0.13; } }
        if (p.kinds.includes('melon') && p.timer <= 0) {
          const target = this.enemies.filter(e => e.hp > 0 && e.row === p.row && e.x > p.x - 12 && e.x < 1090).sort((a, b) => a.x - b.x)[0];
          if (target) { this.lob(p, target); p.timer = power === 3 ? 1.4 : power === 2 ? 1.8 : 2.6; } else p.timer = 0;
        }
        if (p.kinds.includes('bomb') && p.timer <= 0) {
          for (const e of this.enemies) if (!e.flying && Math.abs(e.row - p.row) <= 1 && Math.abs(e.x - p.x) < (power === 3 ? 340 : power === 2 ? 260 : 165)) this.hurt(e, power === 3 ? 2000 : power === 2 ? 1200 : 700);
          this.effects.push({ type: 'blast', x: p.x, y: p.y - 16, life: 0.7, maxLife: 0.7, color: '#ffd34f' });
          p.hp = 0; this.emit('bomb');
        }
      }
      for (const s of this.shots) {
        if (s.lob) { // watermelon arcs through the air, then splashes on impact
          s.t += dt / s.dur;
          if (s.t >= 1) {
            for (const e of this.enemies) if (e.hp > 0 && Math.abs(e.x - s.tx) < s.splash && Math.abs(e.y - s.ty) < 150) this.hurt(e, s.damage);
            this.effects.push({ type: 'splash', x: s.tx, y: s.ty, life: 0.5, maxLife: 0.5 });
            s.dead = true;
          }
          continue;
        }
        const previous = s.x; s.x += 370 * dt;
        const target = this.enemies.filter(e => e.hp > 0 && !e.flying && e.row === s.row && e.x + 24 >= previous && e.x - 24 <= s.x).sort((a, b) => a.x - b.x)[0];
        if (target) { this.hurt(target, s.damage, s.ice); s.dead = true; }
      }
      this.shots = this.shots.filter(s => !s.dead && (s.lob || s.x < 1120));
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        e.age += dt; e.hit = Math.max(0, e.hit - dt); e.slow = Math.max(0, e.slow - dt);
        // 气球葵尸从植物头顶飘过：不啃咬，只有西瓜砸得到；小推车是最后防线。
        const victim = e.flying ? null : this.plants.filter(p => p.hp > 0 && p.row === e.row && e.x <= p.x + 40 && e.x >= p.x - 30).sort((a, b) => b.x - a.x)[0];
        e.biting = !!victim;
        if (victim) { victim.hit = 0.08; if (!this.cheat) victim.hp -= e.damage * dt * (e.slow > 0 ? 0.7 : 1); } // 无敌模式下植物不掉血
        else e.x -= e.speed * dt * (e.slow > 0 ? 0.48 : 1);
        const mower = this.mowers[e.row];
        if (e.x < 113 && mower.state === 'ready') { mower.state = 'active'; this.emit('mower', { row: e.row }); }
        if (e.x < 66 && mower.state !== 'active') { this.state = 'lost'; this.emit('lost'); return; }
      }
      for (const m of this.mowers) {
        if (m.state !== 'active') continue;
        const previous = m.x; m.x += 510 * dt;
        for (const e of this.enemies) if (e.row === m.row && e.x >= previous - 45 && e.x <= m.x + 35) this.hurt(e, 9999);
        if (m.x > 1140) m.state = 'used';
      }
      this.plants = this.plants.filter(p => p.hp > 0);
      this.enemies = this.enemies.filter(e => e.hp > 0);
      for (const s of this.suns) { if (s === this.dragged) continue; s.age += dt; s.life -= dt; s.y = Math.min(s.targetY, s.y + 58 * dt); }
      this.suns = this.suns.filter(s => s.life > 0);
      for (const e of this.effects) e.life -= dt;
      this.effects = this.effects.filter(e => e.life > 0);
      if (!this.endless && this.spawnIndex === this.schedule.length && this.enemies.length === 0) { this.state = 'won'; this.emit('won', { level: this.level }); }
    }
  }
  const api = { Game, BOARD, PLANTS, ENEMIES, LEVELS, center };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunflowerGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
