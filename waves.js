/* 波次配置：每一关、每一波有哪些僵尸、各多少只。改这里即可调难度。 */
(function (root) {
  'use strict';
  const WAVE_CONFIG = Object.freeze({
    // 剧情关：waves 数组即三波，每波一个 { 僵尸类型: 数量 } 对象（顺序即出场顺序）。
    levels: Object.freeze([
      Object.freeze({
        name: '晨光小院', subtitle: '第一缕阳光，也是第一道防线。',
        times: [15, 38, 64], gap: 1.0,
        waves: Object.freeze([
          Object.freeze({ flag: 1, wilt: 16 }),
          Object.freeze({ flag: 1, wilt: 14, pot: 7, runner: 4 }),
          Object.freeze({ flag: 1, wilt: 16, pot: 8, runner: 5, bucket: 4 })
        ])
      }),
      Object.freeze({
        name: '午后葵田', subtitle: '葵盆头出现了，多准备一些瓜子。',
        times: [14, 34, 58], gap: 0.8,
        waves: Object.freeze([
          Object.freeze({ flag: 1, wilt: 14, pot: 7, runner: 4 }),
          Object.freeze({ flag: 1, wilt: 14, pot: 10, runner: 7, bucket: 5, balloon: 2 }),
          Object.freeze({ flag: 1, wilt: 16, pot: 10, runner: 8, bucket: 6, bruiser: 3, giant: 2, balloon: 3 })
        ])
      }),
      Object.freeze({
        name: '落日守望', subtitle: '守到最后，整片葵田都会记得你。',
        times: [13, 31, 54], gap: 0.6,
        waves: Object.freeze([
          Object.freeze({ flag: 1, wilt: 15, pot: 8, runner: 5, bucket: 3 }),
          Object.freeze({ flag: 1, wilt: 14, pot: 11, runner: 8, bucket: 6, bruiser: 4, giant: 2, balloon: 3 }),
          Object.freeze({ flag: 1, wilt: 15, pot: 13, runner: 9, bucket: 8, bruiser: 6, giant: 4, balloon: 4 })
        ])
      })
    ]),
    // 无尽模式：第 n 波每种僵尸的数量 = min(cap, floor(base + perWave × n))，fromWave 之后才登场。
    // 每种每波最多 30 只；cap 省略则无上限。
    endless: Object.freeze({
      name: '无尽葵田', subtitle: '僵尸源源不断，看你能守多少波。', endless: true,
      startDelay: 15, waveGap: 20, waveSpan: 40, waveSpanPerWave: 1, waveSpanFloor: 20, minGap: 0.03,
      composition: Object.freeze([
        Object.freeze({ type: 'flag', base: 0, perWave: 1, cap: 1, fromWave: 1 }),
        Object.freeze({ type: 'wilt', base: 8, perWave: 2, cap: 30, fromWave: 1 }),
        Object.freeze({ type: 'runner', base: 3, perWave: 1.5, cap: 30, fromWave: 1 }),
        Object.freeze({ type: 'pot', base: 2, perWave: 1.5, cap: 30, fromWave: 2 }),
        Object.freeze({ type: 'bucket', base: 1, perWave: 1, cap: 30, fromWave: 3 }),
        Object.freeze({ type: 'bruiser', base: 1, perWave: 1, cap: 30, fromWave: 4 }),
        Object.freeze({ type: 'balloon', base: 1, perWave: 1, cap: 30, fromWave: 5 }),
        Object.freeze({ type: 'giant', base: 0, perWave: 0.8, cap: 30, fromWave: 6 })
      ])
    }),
    // 无尽·肉鸽：植物卡顺着传送带从右往左免费滑来（beltInterval 秒一张，随波次加快），
    // 卡槽共 beltSlots 格，滑出最左边就消失；僵尸潮与无尽模式相同，但血量翻倍（hpMultiplier）。
    roguelike: Object.freeze({
      name: '无尽·肉鸽', subtitle: '传送带送来免费的伙伴，手快有，手慢无。', endless: true, conveyor: true,
      startDelay: 15, waveGap: 20, waveSpan: 40, waveSpanPerWave: 1, waveSpanFloor: 20, minGap: 0.03,
      hpMultiplier: 2,
      beltInterval: 7, beltIntervalPerWave: 0.15, beltIntervalFloor: 2.5, beltSlots: 7,
      composition: Object.freeze([
        Object.freeze({ type: 'flag', base: 0, perWave: 1, cap: 1, fromWave: 1 }),
        Object.freeze({ type: 'wilt', base: 8, perWave: 2, cap: 30, fromWave: 1 }),
        Object.freeze({ type: 'runner', base: 3, perWave: 1.5, cap: 30, fromWave: 1 }),
        Object.freeze({ type: 'pot', base: 2, perWave: 1.5, cap: 30, fromWave: 2 }),
        Object.freeze({ type: 'bucket', base: 1, perWave: 1, cap: 30, fromWave: 3 }),
        Object.freeze({ type: 'bruiser', base: 1, perWave: 1, cap: 30, fromWave: 4 }),
        Object.freeze({ type: 'balloon', base: 1, perWave: 1, cap: 30, fromWave: 5 }),
        Object.freeze({ type: 'giant', base: 0, perWave: 0.8, cap: 30, fromWave: 6 })
      ])
    })
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = WAVE_CONFIG;
  else root.WAVE_CONFIG = WAVE_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
