// 灵基演算 规则内核（测试版）。纯逻辑，不碰界面；浏览器里挂在 window.ChessCore，node 里 require。
// 同一个种子、同样的操作，结果完全一样。棋子能力在 cards-impl.js。
(function (root) {
  const DATA = typeof module !== 'undefined' ? require('./data.js') : root.CHESS_DATA;
  const IMPL = typeof module !== 'undefined' ? require('./cards-impl.js') : root.ChessImpl;

  // ===== 常量 =====
  const TOTAL = [8, 12, 16, 22, 30, 40];
  const COPIES = [14, 13, 12, 10, 9, 7]; // 6 人共用
  const OPEN_TRIBES = 5;
  const SHOP_SIZE = [3, 4, 5, 5, 6, 6];
  const UP_COST = [5, 7, 8, 9, 11];
  const ODDS = [[100], [70, 30], [35, 45, 20], [20, 30, 35, 15], [15, 20, 25, 30, 10], [10, 15, 20, 25, 20, 10]];
  const BASE = ['Saber', 'Archer', 'Lancer', 'Rider', 'Caster', 'Assassin', 'Berserker'];
  const NEUTRAL_DRAW = [1, 2, 1, 2, 2, 2];
  const CURVE = Object.fromEntries(Object.entries(DATA.tribes).map(([k, v]) => [k, v.curve]));
  const CARD = Object.fromEntries(DATA.cards.map(c => [c.n, c]));
  // 概念礼装（法术）：数据在 tools/ces.cjs
  const CES = DATA.ces || [];
  const CE = Object.fromEntries(CES.map(c => [c.n, c]));
  const CE_SLOTS = tier => (tier >= 4 ? 2 : 1);
  // 手牌：买下的从者和礼装共用 10 格（原来的备战席和礼装栏合在一起）
  const HAND = 10;
  const handFree = P => HAND - P.bench.length - P.ceHand.length;
  // 电表倒转的上限
  const ABILITY_MANA_CAP = 6; // 每回合靠能力多拿的魔力
  const SELL_CAP = 3; // 送还最多返还
  const NEXT_MANA_CAP = 5; // 「下回合额外魔力」本局累计
  // 对手 AI 的失误率：按这个概率不挑最优的从者、圣杯和站位；召唤阵也晚两回合升级
  const AI_EASE = 0.45;
  const isClass = (c, name) => !!c && c.toLowerCase() === name.toLowerCase();
  const hasKw = (key, kw) => !!CARD[key] && CARD[key].ab.includes(`【${kw}】`);
  const SKILLS = [
    { n: '应急手当', suit: '迦勒底制服', cost: 1, target: true, fx: '一名从者永久 +0/+3' },
    { n: '强化', suit: '魔术协会制服', cost: 2, target: true, fx: '一名从者永久 +2/+0' },
    { n: '灵子转移', suit: '极地用迦勒底制服', cost: 0, target: false, fx: '免费刷新一次商店' },
    { n: '充能', suit: '阿特拉斯院制服', cost: 1, target: true, fx: '一名从者这一场宝具效果 +50%' },
    { n: 'Gandr', suit: '迦勒底战斗服', cost: 0, target: false, passive: true, fx: '被动：开战时对敌方攻击最高的从者造成 3 点伤害' },
  ];

  // ===== 随机数 =====
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = n => Math.floor(next() * n);
    next.pick = arr => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined);
    next.shuffle = arr => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
    return next;
  }

  // ===== 卡池 =====
  function chooseTribes(rng) {
    const names = Object.keys(DATA.tribes);
    for (let i = 0; i < 100; i++) {
      const open = rng.shuffle(names).slice(0, OPEN_TRIBES);
      const count = {};
      open.forEach(t => { count[CURVE[t]] = (count[CURVE[t]] || 0) + 1; });
      if (Object.values(count).every(v => v <= 2)) return open;
    }
    return names.slice(0, OPEN_TRIBES);
  }
  function buildPool(G, contracts) {
    const rng = G.rng;
    const open = G.open;
    const keys = new Set(DATA.cards.filter(c => c.r.some(t => open.includes(t))).map(c => c.n));
    // 中立：按阶抽，保证防御、成长或经济、辅助各至少一张；关系搭档成对出现
    const neutral = DATA.cards.filter(c => !c.r.length);
    let picked;
    for (let tries = 0; tries < 50; tries++) {
      picked = [];
      NEUTRAL_DRAW.forEach((n, i) => picked.push(...rng.shuffle(neutral.filter(c => c.t === i + 1)).slice(0, n)));
      const groups = new Set(picked.map(c => c.g));
      if (groups.has('防御') && (groups.has('成长') || groups.has('经济')) && groups.has('辅助')) break;
    }
    for (const rel of DATA.relations) {
      const a = CARD[rel.a], b = CARD[rel.b];
      if (a.r.length || b.r.length) continue;
      const hasA = picked.includes(a), hasB = picked.includes(b);
      if (hasA === hasB) continue;
      const add = hasA ? b : a;
      const keep = hasA ? a : b;
      const sameTier = picked.filter(c => c.t === add.t && c !== keep && !DATA.relations.some(r => r.a === c.n || r.b === c.n));
      if (sameTier.length) picked.splice(picked.indexOf(rng.pick(sameTier)), 1);
      picked.push(add);
    }
    picked.forEach(c => keys.add(c.n));
    // 种族卡的关系搭档（不连锁）
    const before = new Set(keys);
    for (const rel of DATA.relations) {
      if (before.has(rel.a) && !keys.has(rel.b)) keys.add(rel.b);
      if (before.has(rel.b) && !keys.has(rel.a)) keys.add(rel.a);
    }
    (contracts || []).forEach(k => { if (CARD[k]) keys.add(k); });
    G.pool = {};
    keys.forEach(k => { G.pool[k] = COPIES[CARD[k].t - 1]; });
  }
  function drawFromPool(G, tier) {
    for (let t = tier; t >= 1; t--) {
      const cands = Object.entries(G.pool).filter(([k, n]) => n > 0 && CARD[k].t === t);
      const total = cands.reduce((s, [, n]) => s + n, 0);
      if (!total) continue;
      let r = G.rng() * total;
      for (const [k, n] of cands) { r -= n; if (r < 0) { G.pool[k]--; return k; } }
    }
    return null;
  }
  const returnToPool = (G, key, n = 1) => { if (G.pool[key] !== undefined) G.pool[key] += n; };

  // ===== 单位 =====
  let uidSeq = 1;
  function makeUnit(G, key, P) {
    const c = CARD[key];
    // mats：这张卡在卡池里占的份（三合一、同貌、灵基融合时累加，送还和出局时逐份放回）
    const u = { uid: uidSeq++, key, t: c.t, c: c.c, gold: false, permAtk: 0, permHp: 0, caps: {}, extraTribes: [], firstDeployed: false, npUnlock: false, ascend: null, contract: false, mats: [key], fusions: 0 };
    if (P && P.contracts && P.contracts.includes(key)) {
      u.contract = true;
      u.permAtk += 1; u.permHp += 1;
      if (P.affection === true || (Array.isArray(P.affection) && P.affection.includes(key))) u.npUnlock = true;
    }
    return u;
  }
  const baseAtk = u => CARD[u.key].atk * (u.gold ? 2 : 1);
  const baseHp = u => CARD[u.key].hp * (u.gold ? 2 : 1);
  const unitAtk = u => Math.max(1, baseAtk(u) + u.permAtk);
  const unitHp = u => Math.max(1, baseHp(u) + u.permHp);
  const tribesOf = (G, u) => [...new Set([...CARD[u.key].r, ...u.extraTribes])];
  // 永久成长：不设累计上限（不会造成死循环，只受回合数限制）
  function permBuff(u, a, h) {
    u.permAtk += a; u.permHp += h;
    return a || h;
  }
  const npUnlocked = u => u.t >= 4 || u.gold || u.npUnlock || u.ascend === 'np';

  // ===== 金卡 =====
  // 金卡的固有能力效果翻倍：准备阶段和交战中的触发都结算两次；攻击加成按增量翻倍、第一次攻击的倍率按增量翻倍。
  // 卡面写了金卡效果的、实现里自己按金卡算的，以及献祭类（只能献祭一次），不再翻倍
  const GOLD_HOOKS = new Set(['deploy', 'prepEnd', 'sell', 'allyBuy', 'allyCE', 'allyDevour', 'fused', 'afterWin',
    'start', 'death', 'kill', 'allyDeath', 'hurt', 'afterAttack', 'allyKill', 'allySummon', 'allyShield', 'allyShieldLost', 'allyNP', 'allyAttack', 'guts', 'dodge', 'absorbed']);
  const GOLD_ONCE = new Set(['UDK－巴格斯特', '陈宫', '芦屋道满']);
  const SELF_GOLD = Object.fromEntries(DATA.cards.map(c => {
    const a = IMPL.ab[c.n] || {};
    const own = GOLD_ONCE.has(c.n) || /金卡/.test(c.ab) || Object.values(a).some(f => typeof f === 'function' && /\.gold\b|g2\(/.test(String(f)));
    return [c.n, own];
  }));
  const goldDoubles = u => !!u.gold && !u.summon && !SELF_GOLD[u.key];
  const goldTimes = (u, hook) => (goldDoubles(u) && GOLD_HOOKS.has(hook) ? 2 : 1);

  // ===== 对局 =====
  // 对手池：第 1 席从职员里挑，其余席位从另外 5 个风格池里各挑一人，风格不重复（测试版只用卡表里有头像的人物）
  const STAFF_OPP = [{ name: '格林', style: '稳健' }, { name: '芊芊', style: '赌徒' }, { name: '藤丸立香', style: '羁绊' }];
  const OPP_POOLS = {
    军师: ['诸葛孔明〔埃尔梅罗Ⅱ世〕', '陈宫', '梅林'],
    王道: ['吉尔伽美什（Archer）', '尼禄·克劳狄乌斯（Caster）'],
    赌徒: ['爱德华·蒂奇', 'BB（泳装）', '莱昂纳多·达·芬奇（Caster）'],
    速攻: ['织田信长（Archer）', '斯巴达克斯', '土方岁三'],
    羁绊: ['玛修·基列莱特', '冲田总司'],
  };
  // 不在任何池里的契约英灵按职阶归入默认风格
  const CLASS_STYLE = { Caster: '军师', Ruler: '军师', Saber: '王道', Archer: '王道', Rider: '赌徒', MoonCancer: '赌徒', Berserker: '速攻', Avenger: '速攻', Assassin: '速攻' };
  const styleOf = key => Object.keys(OPP_POOLS).find(st => OPP_POOLS[st].includes(key)) || CLASS_STYLE[(CARD[key] || {}).c] || '羁绊';
  // opts.rivals：契约英灵（卡表里的唯一名，好感高的在前），优先坐进对应风格的席位；opts.staff：可当第 1 席的职员
  function newGame(opts = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    const rng = makeRng(seed);
    const G = { seed, rng, round: 0, log: [], over: false, ghost: null, lastPair: {} };
    G.open = opts.open || chooseTribes(rng);
    const human = { id: 0, name: opts.name || '御主', human: !opts.allAi, style: opts.allAi ? rng.pick(['稳健', '赌徒', '羁绊', '军师', '王道', '速攻']) : null };
    const seats = Math.max(2, Math.min(6, opts.players || 6)) - 1;
    const staff = STAFF_OPP.filter(o => !opts.staff || opts.staff.includes(o.name));
    const rivals = (opts.rivals || []).filter(k => CARD[k]);
    const used = new Set();
    const seatOf = style => {
      const mine = rivals.filter(k => styleOf(k) === style && !used.has(k));
      if (mine.length) { const k = mine[0]; used.add(k); return { name: k, style, rival: true }; }
      return { name: rng.pick(OPP_POOLS[style]), style };
    };
    const chosen = [rng.pick(staff.length ? staff : STAFF_OPP), ...rng.shuffle(Object.keys(OPP_POOLS)).map(seatOf)].slice(0, seats);
    G.players = [human, ...chosen.map((o, i) => ({ id: i + 1, name: o.name, human: false, style: o.style, rival: !!o.rival }))].map(p => ({
      ...p, hp: 30, alive: true, place: 0, mana: 0, tier: 1, upCost: UP_COST[0], board: [], bench: [], shop: [], ceShop: [], ceHand: [], frozen: false,
      abilityMana: 0, nextManaTotal: 0, gilds: 0, pendingSame: null, discountBuys: 0, shinsenBonus: 0, ceUsedRound: 0, refreshes: 0, triples: 0,
      ease: p.id === 0 ? 0 : (opts.aiEase ?? (opts.allAi ? 0 : AI_EASE)),
      seals: 3, skill: p.human ? (opts.skill || '应急手当') : rng.pick(SKILLS).n, skillUsed: false, extraSlots: 0, freeRefresh: 0, scout: false,
      contracts: p.id === 0 ? (opts.contracts || []).slice(0, 3) : [], affection: p.id === 0 ? (Array.isArray(opts.affection) ? opts.affection : !!opts.affection) : false, absolute: false,
      boughtThisRound: [], soldRomanThisRound: false, romeTriggers: 0, lastResult: null, history: [], pendingDiscover: null, nextBuyBonus: 0,
    }));
    buildPool(G, G.players[0].contracts);
    startRound(G);
    return G;
  }

  function rollShop(G, P) {
    if (!P.frozen) {
      P.shop.forEach(k => k && returnToPool(G, k));
      P.shop = [];
      const n = SHOP_SIZE[P.tier - 1] + P.extraSlots;
      for (let i = 0; i < n; i++) {
        const r = G.rng() * 100;
        const odds = ODDS[P.tier - 1];
        let acc = 0, tier = 1;
        for (let t = 0; t < odds.length; t++) { acc += odds[t]; if (r < acc) { tier = t + 1; break; } }
        P.shop.push(drawFromPool(G, tier));
      }
      P.ceShop = rollCE(G, P, CE_SLOTS(P.tier));
    }
    P.frozen = false;
  }
  // 礼装格：先按召唤阵的概率表定阶，再在这一阶（没有就往下找）里随机挑
  function rollCE(G, P, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = G.rng() * 100, odds = ODDS[P.tier - 1];
      let acc = 0, tier = 1;
      for (let t = 0; t < odds.length; t++) { acc += odds[t]; if (r < acc) { tier = t + 1; break; } }
      let list = [];
      for (let t = tier; t >= 1 && !list.length; t--) list = CES.filter(c => c.t === t && !out.includes(c.n));
      const pick = G.rng.pick(list);
      if (pick) out.push(pick.n);
    }
    return out;
  }
  function randomCE(G, maxTier) { return (G.rng.pick(CES.filter(c => c.t <= maxTier)) || CES[0]).n; }

  function startRound(G) {
    G.round++;
    for (const P of G.players) {
      if (!P.alive) continue;
      P.mana = Math.min(10, 2 + G.round) + (P.manaBonusNext || 0);
      P.manaBonusNext = 0;
      // 平行世界 4 名：每回合第一张礼装便宜 1 魔力
      const pw = G.open.includes('平行世界') ? countTribe(G, P.board, '平行世界') : 0;
      P.ceDiscount = (P.ceDiscountNext || 0) + (pw >= 6 ? 99 : pw >= 4 ? 1 : 0); P.ceDiscountNext = 0;
      if (G.round > 1 && P.tier < 6) P.upCost = Math.max(0, P.upCost - 1);
      P.skillUsed = false; P.extraSlots = 0; P.freeRefresh = 0; P.scout = false; P.absolute = false;
      P.boughtThisRound = []; P.soldRomanThisRound = false; P.romeTriggers = 0;
      P.abilityMana = 0; P.discountBuys = 0; P.shinsenBonus = 0; P.ceUsedRound = 0; P.devoured = 0; P.flags = {};
      if (P.board.some(u => u.key === '莱昂纳多·达·芬奇（Caster）')) P.freeRefresh += 1;
      rollShop(G, P);
    }
    G.pairs = makePairs(G);
  }

  function makePairs(G) {
    const alive = G.players.filter(p => p.alive);
    let best = null;
    for (let i = 0; i < 20; i++) {
      const order = G.rng.shuffle(alive);
      const pairs = [];
      for (let j = 0; j + 1 < order.length; j += 2) pairs.push([order[j].id, order[j + 1].id]);
      if (order.length % 2) pairs.push([order[order.length - 1].id, 'ghost']);
      const repeat = pairs.filter(([a, b]) => G.lastPair[a] === b).length;
      if (!best || repeat < best.repeat) best = { pairs, repeat };
      if (!repeat) break;
    }
    return best.pairs;
  }
  const opponentOf = (G, id) => { for (const [a, b] of G.pairs) { if (a === id) return b; if (b === id) return a; } return null; };

  // ===== 准备阶段的操作 =====
  const err = msg => ({ ok: false, msg });
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const callPrep = (G, P, u, hook, ...args) => {
    const f = IMPL.ab[u.key] && IMPL.ab[u.key][hook];
    if (!f) return undefined;
    let r;
    for (let k = goldTimes(u, hook); k > 0; k--) r = f(api(G, P), u, ...args);
    return r;
  };
  const callNpPrep = (G, P, u, trig) => {
    const np = IMPL.np[u.key];
    if (np && np.on === trig && npUnlocked(u)) np.run(api(G, P), u);
  };
  // 放大器：战线上有这张卡时，对应时机的效果多触发（金卡再多一次）；同一种有多张时取最高
  const ampOf = (list, key) => list.reduce((m, u) => (u.key === key ? Math.max(m, u.gold ? 3 : 2) : m), 1);
  const AMP = { 现界: '威廉·莎士比亚', 整备: '玉藻前（Caster）', 归座: '埃列什基伽勒（Lancer）', 召唤: '阿维斯布隆' };

  // 能力给的魔力：每回合最多 +6，当回合可以超过 10
  function gainMana(P, n) {
    const k = Math.max(0, Math.min(n, ABILITY_MANA_CAP - P.abilityMana));
    P.abilityMana += k; P.mana += k;
    return k;
  }
  // 「下回合额外魔力」：本局累计最多 +5
  function gainNextMana(P, n) {
    const k = Math.max(0, Math.min(n, NEXT_MANA_CAP - P.nextManaTotal));
    P.nextManaTotal += k; P.manaBonusNext = (P.manaBonusNext || 0) + k;
    return k;
  }
  // 中华 4 名：中华在准备阶段获得永久加成时，相邻的中华也获得一半（只传一格）
  function prepPerm(G, P, u, a, h) {
    const before = { a: u.permAtk, h: u.permHp };
    permBuff(u, a, h);
    const da = u.permAtk - before.a, dh = u.permHp - before.h;
    if ((da > 0 || dh > 0) && G.open.includes('中华') && tribesOf(G, u).includes('中华') && countTribe(G, P.board, '中华') >= 4 && P.board.includes(u)) {
      const i = P.board.indexOf(u);
      [P.board[i - 1], P.board[i + 1]].filter(x => x && tribesOf(G, x).includes('中华')).forEach(x => permBuff(x, Math.ceil(da / 2), Math.ceil(dh / 2)));
    }
    return da || dh;
  }
  // 【吞噬】：把商店里的从者移出（放回卡池），永久获得它基础攻体的一半；每名最多 +10/+10
  // which：'left' 最左边，'max' 阶数最高；to：吞噬所得交给谁（默认自己）
  function devour(G, P, u, { count = 1, which = 'max', to = null } = {}) {
    const eaten = [];
    for (let k = 0; k < count; k++) {
      const slots = P.shop.map((key, i) => (key ? i : -1)).filter(i => i >= 0);
      if (!slots.length) break;
      const i = which === 'left' ? slots[0] : slots.sort((x, y) => CARD[P.shop[y]].t - CARD[P.shop[x]].t)[0];
      const key = P.shop[i];
      P.shop[i] = null;
      returnToPool(G, key);
      const c = CARD[key];
      const ga = Math.ceil(c.atk / 2), gh = Math.ceil(c.hp / 2);
      const tgt = to || u;
      let bonus = 0;
      const oni = G.open.includes('鬼') ? countTribe(G, P.board, '鬼') : 0;
      if (oni >= 2) bonus = oni >= 6 ? 2 : 1;
      prepPerm(G, P, tgt, ga + bonus, gh + bonus);
      eaten.push(key);
      P.devoured = (P.devoured || 0) + 1;
      G.log.push(`[${P.name}] ${u.key} 吞噬了 ${key}`);
      // 友方吞噬时触发的能力（巴御前、鬼女红叶、源赖光／丑御前、大江山）
      P.board.forEach(x => { if (x !== u) callPrep(G, P, x, 'allyDevour', u, ga, gh); });
      // 鬼 4 名：每回合第一次吞噬后补满商店空格
      if (P.devoured === 1 && G.open.includes('鬼') && countTribe(G, P.board, '鬼') >= 4) {
        P.shop = P.shop.map(k2 => k2 || drawFromPool(G, Math.min(P.tier, 6)));
      }
    }
    return eaten;
  }
  // 手牌：放得下才给
  const giveCE = (P, name) => { if (handFree(P) <= 0) return false; P.ceHand.push(name); return true; };
  // 天之衣：把一名非金卡友方变成金卡（不给圣杯，不重复计算永久成长，不重新触发现界）
  function gild(G, P, u) {
    if (!u || u.gold || P.gilds >= 4) return false;
    u.gold = true; P.gilds++;
    G.log.push(`[${P.name}] ${u.key} 被变成了金卡`);
    return true;
  }
  // 准备阶段给能力用的工具
  function api(G, P) {
    return {
      G, P, rng: G.rng,
      units: () => P.board.concat(P.bench),
      board: () => P.board,
      perm: (u, a, h) => prepPerm(G, P, u, a, h),
      tribe: (u, t) => tribesOf(G, u).includes(t),
      open: t => G.open.includes(t),
      bond: t => countTribe(G, P.board, t),
      log: msg => G.log.push(`[${P.name}] ${msg}`),
      refresh: () => { rollShop(G, P); },
      refreshWith: test => { // 免费刷新，刷出的从者里至少有一名满足条件（卡池里还有的话）
        rollShop(G, P);
        if (P.shop.some(k => k && test(CARD[k]))) return;
        const cands = Object.entries(G.pool).filter(([k, n]) => n > 0 && test(CARD[k]) && CARD[k].t <= P.tier);
        if (!cands.length || !P.shop.length) return;
        const [k] = G.rng.pick(cands);
        const j = P.shop.length - 1;
        if (P.shop[j]) returnToPool(G, P.shop[j]);
        G.pool[k]--; P.shop[j] = k;
      },
      npOn: u => npUnlocked(u),
      addMana: n => gainMana(P, n),
      addNextMana: n => gainNextMana(P, n),
      devour: (u, opts) => devour(G, P, u, opts),
      giveCE: name => giveCE(P, name),
      randomCE: maxTier => randomCE(G, maxTier || P.tier),
      gild: u => gild(G, P, u),
      sacrifice: u => { // 准备阶段献祭：直接移出，不触发归座
        P.board = P.board.filter(x => x !== u); P.bench = P.bench.filter(x => x !== u);
        u.mats.forEach(k => returnToPool(G, k));
      },
      adjacent: u => { const i = P.board.indexOf(u); return [P.board[i - 1], P.board[i + 1]].filter(Boolean); },
      left: u => { const i = P.board.indexOf(u); return i > 0 ? P.board[i - 1] : null; },
      right: u => { const i = P.board.indexOf(u); return i >= 0 ? P.board[i + 1] || null : null; },
      atkOf: u => unitAtk(u),
      hpOf: u => unitHp(u),
      card: k => CARD[k],
    };
  }
  // 羁绊人数：同名的只算一名
  const countTribe = (G, list, t) => new Set(list.filter(u => G.open.includes(t) && tribesOf(G, u).includes(t)).map(u => u.key)).size;

  function checkTriple(G, P) {
    const all = P.board.concat(P.bench);
    const groups = {};
    all.forEach(u => { if (!u.gold) (groups[u.key] = groups[u.key] || []).push(u); });
    for (const [key, list] of Object.entries(groups)) {
      if (list.length < 3) continue;
      const [a, b, c] = list;
      const gold = makeUnit(G, key, null);
      gold.gold = true;
      gold.permAtk = a.permAtk + b.permAtk + c.permAtk;
      gold.permHp = a.permHp + b.permHp + c.permHp;
      gold.extraTribes = [...new Set([...a.extraTribes, ...b.extraTribes, ...c.extraTribes])];
      gold.contract = a.contract || b.contract || c.contract;
      gold.npUnlock = a.npUnlock || b.npUnlock || c.npUnlock;
      gold.ascend = [a, b, c].map(x => x.ascend).find(Boolean) || null;
      gold.tripleReward = true; // 放上战线时拿圣杯
      mergeInto(G, P, gold, [a, b, c]);
      P.triples++;
      G.log.push(`[${P.name}] 三合一：${key} 成为金卡`);
      return gold;
    }
    // 【同貌】：三名同阶、不全同名的同貌从者也能合成，由玩家选做成哪一名（没有圣杯）
    if (!P.pendingSame) {
      const faces = all.filter(u => !u.gold && hasKw(u.key, '同貌'));
      for (let t = 6; t >= 1; t--) {
        const same = faces.filter(u => u.t === t);
        if (same.length >= 3 && new Set(same.map(u => u.key)).size >= 2) { P.pendingSame = same.slice(0, 3).map(u => u.uid); break; }
      }
    }
    return null;
  }
  // 圣杯：从比召唤阵等级高一阶的从者里选一张；手上已经有一份待选时排队
  function grantDiscover(G, P) {
    if (P.pendingDiscover) { P.discoverQueue = (P.discoverQueue || 0) + 1; return; }
    const tier = Math.min(6, P.tier + 1);
    const choices = [];
    for (let i = 0; i < 3; i++) { const k = drawFromPool(G, tier); if (k) choices.push(k); }
    if (choices.length) P.pendingDiscover = choices;
  }
  // 合成后的金卡回到备战席（像新买的一样，放上战线时触发【现界】和三合一奖励）；备战席满了才留在战线上材料原来的位置。
  // 永久成长相加，卡池份数累加
  function mergeInto(G, P, gold, mats) {
    gold.permAtk = mats.reduce((s, x) => s + x.permAtk, 0);
    gold.permHp = mats.reduce((s, x) => s + x.permHp, 0);
    gold.extraTribes = [...new Set(mats.flatMap(x => x.extraTribes))];
    gold.contract = mats.some(x => x.contract);
    gold.npUnlock = mats.some(x => x.npUnlock);
    gold.mats = mats.flatMap(x => x.mats);
    gold.fusions = mats.reduce((s, x) => s + (x.fusions || 0), 0);
    gold.permTaunt = mats.some(x => x.permTaunt);
    const idx = P.board.findIndex(x => mats.includes(x));
    P.board = P.board.filter(x => !mats.includes(x));
    P.bench = P.bench.filter(x => !mats.includes(x));
    if (handFree(P) > 0 || idx < 0) { P.bench.push(gold); return; }
    P.board.splice(idx, 0, gold);
    gold.firstDeployed = true;
    if (gold.tripleReward) { gold.tripleReward = false; grantDiscover(G, P); }
  }
  function pickSame(G, P, i) {
    if (!P.pendingSame) return err('没有待选的同貌合成');
    const mats = P.pendingSame.map(uid => findUnit(P, uid)).filter(Boolean);
    P.pendingSame = null;
    if (mats.length < 3) return err('材料不全，合成取消');
    const chosen = mats[i] || mats[0];
    const gold = makeUnit(G, chosen.key, null);
    gold.gold = true;
    gold.ascend = chosen.ascend;
    mergeInto(G, P, gold, mats);
    P.triples++;
    G.log.push(`[${P.name}] 同貌合成：${chosen.key} 成为金卡`);
    checkTriple(G, P);
    return ok({ unit: gold });
  }
  function pickDiscover(G, P, i) {
    if (!P.pendingDiscover) return err('没有可选的圣杯');
    const choices = P.pendingDiscover;
    const key = choices[i];
    choices.forEach((k, j) => { if (j !== i) returnToPool(G, k); });
    P.pendingDiscover = null;
    if (P.discoverQueue > 0) { P.discoverQueue--; grantDiscover(G, P); }
    if (handFree(P) <= 0) { returnToPool(G, key); return err('手牌满了，这张放回了卡池'); }
    const u = makeUnit(G, key, P);
    P.bench.push(u);
    checkTriple(G, P);
    return ok({ unit: u });
  }

  function buy(G, P, i, free = false) {
    const key = P.shop[i];
    if (!key) return err('这一格是空的');
    const cost = free ? 0 : buyCost(P);
    if (P.mana < cost) return err('魔力不够');
    if (handFree(P) <= 0) return err('手牌满了');
    P.mana -= cost;
    if (!free && P.discountBuys > 0) P.discountBuys--;
    P.shop[i] = null;
    const u = makeUnit(G, key, P);
    P.bench.push(u);
    P.boughtThisRound.push(key);
    // 购买时：本卡、场上其他卡（尼禄等）、罗马羁绊
    callPrep(G, P, u, 'buy');
    callNpPrep(G, P, u, '购买时');
    P.board.forEach(x => callPrep(G, P, x, 'allyBuy', u));
    romeOnBuy(G, P, u);
    const gold = checkTriple(G, P);
    return ok({ unit: gold || u, gold: !!gold });
  }
  function romeOnBuy(G, P, u) {
    if (!G.open.includes('罗马') || !tribesOf(G, u).includes('罗马')) return;
    const n = countTribe(G, P.board, '罗马');
    if (n < 2) return;
    const max = n >= 6 ? 6 : n >= 4 ? 4 : 2;
    if (P.romeTriggers >= max) return;
    const romans = P.board.filter(x => tribesOf(G, x).includes('罗马'));
    const t = G.rng.pick(romans);
    if (!t) return;
    P.romeTriggers++;
    permBuff(t, n >= 6 ? 2 : 1, n >= 4 ? 2 : 1);
  }
  const buyCost = P => Math.max(0, 3 - (P.discountBuys > 0 ? 1 : 0));
  function sell(G, P, uid) {
    const u = findUnit(P, uid);
    if (!u) return err('找不到这名从者');
    const wasBoard = P.board.includes(u);
    P.board = P.board.filter(x => x !== u);
    P.bench = P.bench.filter(x => x !== u);
    u.mats.forEach(k => returnToPool(G, k));
    // 送还：默认返还 1；能力可以改成更多，罗马 4 名第一次再 +1，合计最多 3
    let refund = 1;
    const r = callPrep(G, P, u, 'sell', wasBoard);
    if (r && r.refund) refund = Math.max(refund, r.refund);
    if (G.open.includes('罗马') && tribesOf(G, u).includes('罗马') && countTribe(G, P.board, '罗马') + 1 >= 4 && !P.soldRomanThisRound) { refund += 1; P.soldRomanThisRound = true; }
    P.mana += Math.min(SELL_CAP, refund);
    return ok({ refund: Math.min(SELL_CAP, refund) });
  }
  const findUnit = (P, uid) => P.board.concat(P.bench).find(u => u.uid === uid);
  // 【现界】：放上战线时触发，战线上有莎士比亚时触发两次（金卡三次）
  function fireDeploy(G, P, u) {
    if (P.shinsenBonus > 0 && tribesOf(G, u).includes('新选组')) { P.shinsenBonus--; prepPerm(G, P, u, 1, 2); }
    const times = ampOf(P.board, AMP.现界);
    for (let k = 0; k < times; k++) callPrep(G, P, u, 'deploy');
  }
  function deploy(G, P, uid, pos) {
    const u = P.bench.find(x => x.uid === uid);
    if (!u) return err('只能把备战席上的从者放上战线');
    if (P.board.length >= 7) return err('战线满了');
    P.bench = P.bench.filter(x => x !== u);
    P.board.splice(pos === undefined ? P.board.length : Math.max(0, Math.min(pos, P.board.length)), 0, u);
    if (!u.firstDeployed) { u.firstDeployed = true; fireDeploy(G, P, u); }
    if (u.tripleReward) { u.tripleReward = false; grantDiscover(G, P); }
    return ok();
  }
  // 【灵基融合】：带这个词条的机械（备战席或商店里的）拖到战线上的另一名机械身上，合并攻体和目标集中；每名机械最多接受 3 次
  function fuse(G, P, src, targetUid) {
    const t = P.board.find(x => x.uid === targetUid);
    if (!t) return err('只能融合到战线上的从者身上');
    if (!tribesOf(G, t).includes('机械')) return err('融合目标必须是机械');
    let u;
    if (src.shop !== undefined) {
      const key = P.shop[src.shop];
      if (!key) return err('这一格是空的');
      if (!hasKw(key, '灵基融合')) return err('这名从者不能灵基融合');
      const cost = buyCost(P);
      if (P.mana < cost) return err('魔力不够');
      P.mana -= cost;
      if (P.discountBuys > 0) P.discountBuys--;
      P.shop[src.shop] = null;
      u = makeUnit(G, key, P);
    } else {
      u = P.bench.find(x => x.uid === src.uid);
      if (!u) return err('只能用备战席上的从者融合');
      if (!hasKw(u.key, '灵基融合')) return err('这名从者不能灵基融合');
      P.bench = P.bench.filter(x => x !== u);
    }
    if (u === t) return err('不能融合到自己身上');
    permBuff(t, unitAtk(u), unitHp(u));
    if (/目标集中/.test(CARD[u.key].ab)) t.permTaunt = true;
    t.fusions = (t.fusions || 0) + 1;
    t.mats = t.mats.concat(u.mats);
    callPrep(G, P, t, 'fused', u);
    G.log.push(`[${P.name}] ${u.key} 灵基融合到 ${t.key}`);
    return ok({ target: t });
  }
  function move(G, P, uid, dir) {
    const i = P.board.findIndex(x => x.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= P.board.length) return err('不能再移了');
    [P.board[i], P.board[j]] = [P.board[j], P.board[i]];
    return ok();
  }
  // 拖动排序：把战线上的从者移到第 index 格
  function moveTo(G, P, uid, index) {
    const i = P.board.findIndex(x => x.uid === uid);
    if (i < 0) return err('不在战线上');
    const [u] = P.board.splice(i, 1);
    P.board.splice(Math.max(0, Math.min(index, P.board.length)), 0, u);
    return ok();
  }
  function refresh(G, P) {
    if (P.freeRefresh > 0) P.freeRefresh--;
    else { if (P.mana < 1) return err('魔力不够'); P.mana -= 1; }
    P.frozen = false;
    P.refreshes++;
    rollShop(G, P);
    return ok();
  }
  function toggleFreeze(G, P) { P.frozen = !P.frozen; return ok({ frozen: P.frozen }); }
  function upgrade(G, P) {
    if (P.tier >= 6) return err('召唤阵已经是最高级');
    if (P.mana < P.upCost) return err('魔力不够');
    P.mana -= P.upCost;
    P.tier++;
    P.upCost = P.tier < 6 ? UP_COST[P.tier - 1] : 0;
    return ok();
  }
  // ===== 概念礼装 =====
  const ceCost = (P, name) => Math.max(0, CE[name].cost - (P.ceDiscount || 0));
  function checkCETarget(P, ce, u) {
    if (!ce.target) return null;
    if (!u) return '请把礼装拖到一名从者身上';
    if (ce.n === '虚数魔术' && u.t > 3) return '虚数魔术只能用在 1–3 阶从者身上';
    if (ce.n === '魔性菩萨' && !P.board.includes(u)) return '魔性菩萨只能用在战线上的从者身上';
    return null;
  }
  // 从商店的礼装格买下并当场使用
  function buyCE(G, P, slot, uid) {
    const name = P.ceShop[slot];
    if (!name) return err('这一格没有礼装');
    const ce = CE[name], cost = ceCost(P, name);
    if (P.mana < cost) return err('魔力不够');
    const u = uid ? findUnit(P, uid) : null;
    const bad = checkCETarget(P, ce, u);
    if (bad) return err(bad);
    P.mana -= cost; P.ceDiscount = 0;
    P.ceShop.splice(slot, 1);
    applyCE(G, P, name, u);
    return ok();
  }
  // 买下放进手牌，之后再拖到目标身上用（玩家只能这样买；AI 用 buyCE 买下当场用）
  function storeCE(G, P, slot) {
    const name = P.ceShop[slot];
    if (!name) return err('这一格没有礼装');
    if (handFree(P) <= 0) return err('手牌满了');
    const cost = ceCost(P, name);
    if (P.mana < cost) return err('魔力不够');
    P.mana -= cost; P.ceDiscount = 0;
    P.ceShop.splice(slot, 1);
    P.ceHand.push(name);
    return ok();
  }
  function castCE(G, P, idx, uid) {
    const name = P.ceHand[idx];
    if (!name) return err('手牌里没有这张礼装');
    const u = uid ? findUnit(P, uid) : null;
    const bad = checkCETarget(P, CE[name], u);
    if (bad) return err(bad);
    P.ceHand.splice(idx, 1);
    applyCE(G, P, name, u);
    return ok();
  }
  // 礼装效果：数值型的效果受平行世界加成（相加：4 名 +50%，静希草十郎 +100%）
  function ceScale(G, P, u) {
    let m = 1;
    if (!u) return { m };
    const pw = G.open.includes('平行世界') && tribesOf(G, u).includes('平行世界') ? countTribe(G, P.board, '平行世界') : 0;
    if (pw >= 4) m += pw >= 6 ? 1 : 0.5;
    if (u.key === '静希草十郎') m += 1;
    return { m };
  }
  function applyNumeric(G, P, name, u) {
    const { m } = ceScale(G, P, u);
    const k = x => Math.round(x * m);
    if (name === '钢之锻炼') prepPerm(G, P, u, 0, k(3));
    if (name === '绿之破音') prepPerm(G, P, u, k(1), k(1));
    if (name === '唠唠叨叨看板娘') { u.permTaunt = true; prepPerm(G, P, u, k(2), 0); }
    if (name === '黑之圣杯') { prepPerm(G, P, u, k(4), 0); u.permHp -= Math.min(2, unitHp(u) - 1); }
    if (name === '骑士的矜持') prepPerm(G, P, u, k(3), k(1));
  }
  function applyCE(G, P, name, u) {
    const ce = CE[name];
    if (ce.target && ce.num) applyNumeric(G, P, name, u);
    if (name === '先制') u.nextFirst = true;
    if (name === '龙脉') u.nextNpBonus = (u.nextNpBonus || 0) + 0.5;
    if (name === '死灵魔术') u.nextGuts = (u.nextGuts || 0) + 1;
    if (name === '虚数魔术') u.tempUnlock = true;
    if (name === '万华镜') { if (npUnlocked(u) || u.tempUnlock) u.nextNpBonus = (u.nextNpBonus || 0) + 0.5; else u.tempUnlock = true; }
    if (name === '月灵髓液') u.nextInvul = (u.nextInvul || 0) + 2;
    if (name === '宝石剑泽尔里奇') { P.frozen = false; rollShop(G, P); P.freeRefresh += 1; }
    if (name === '2030年的碎片') { P.freeRefresh += 1; P.scout = true; }
    if (name === '黄金捕鲤图' && P.board.length) [...new Set([P.board[0], P.board[P.board.length - 1]])].forEach(x => { const s = ceScale(G, P, x); prepPerm(G, P, x, Math.round(1 * s.m), Math.round(2 * s.m)); });
    if (name === '圣夜晚餐') P.board.forEach(x => { x.nextNpBonus = (x.nextNpBonus || 0) + 0.25; });
    if (name === '九首牛魔罗王') {
      const cnt = {};
      P.board.forEach(x => tribesOf(G, x).filter(t => G.open.includes(t)).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (top) P.board.filter(x => tribesOf(G, x).includes(top[0])).forEach(x => { const s = ceScale(G, P, x); prepPerm(G, P, x, Math.round(s.m), Math.round(s.m)); });
    }
    if (name === '魔性菩萨') fireDeploy(G, P, u);
    if (name === '苍玉之魔法少女') {
      const choices = [];
      for (let i = 0; i < 3; i++) { const k2 = drawFromPool(G, P.tier); if (k2) choices.push(k2); }
      if (choices.length) P.pendingDiscover = choices;
    }
    // 久远寺有珠：指定目标的数值型礼装，同时作用于目标相邻的一名平行世界
    if (ce.target && ce.num && P.board.includes(u) && P.board.some(x => x.key === '久远寺有珠')) {
      const i = P.board.indexOf(u);
      const n2 = [P.board[i - 1], P.board[i + 1]].find(x => x && tribesOf(G, x).includes('平行世界'));
      if (n2) applyNumeric(G, P, name, n2);
    }
    P.ceUsedRound++;
    // 平行世界 2 名：每回合第一次使用礼装后，随机一名平行世界永久 +1/+1
    if (P.ceUsedRound === 1 && G.open.includes('平行世界') && countTribe(G, P.board, '平行世界') >= 2) {
      const t = G.rng.pick(P.board.filter(x => tribesOf(G, x).includes('平行世界')));
      if (t) prepPerm(G, P, t, 1, 1);
    }
    P.board.forEach(x => callPrep(G, P, x, 'allyCE', name, u));
    G.log.push(`[${P.name}] 使用概念礼装「${name}」${u ? '：' + u.key : ''}`);
  }
  function useSkill(G, P, uid) {
    const sk = SKILLS.find(s => s.n === P.skill);
    if (sk.passive) return err('这是被动技能');
    if (P.skillUsed) return err('这回合已经用过了');
    if (P.mana < sk.cost) return err('魔力不够');
    const u = uid ? findUnit(P, uid) : null;
    if (sk.target && !u) return err('请先选一名从者');
    P.mana -= sk.cost; P.skillUsed = true;
    if (sk.n === '应急手当') permBuff(u, 0, 3);
    if (sk.n === '强化') permBuff(u, 2, 0);
    if (sk.n === '灵子转移') { P.frozen = false; rollShop(G, P); }
    if (sk.n === '充能') u.nextNpBonus = (u.nextNpBonus || 0) + 0.5;
    return ok();
  }
  function useSeal(G, P, kind, arg) {
    if (P.seals <= 0) return err('令咒用完了');
    if (kind === '立刻召唤') {
      if (P.shop[arg] === undefined || P.shop[arg] === null) return err('请先选商店里的一名从者');
      const r = buy(G, P, arg, true);
      if (!r.ok) return r;
    } else if (kind === '灵基升华') {
      if (G.round < 4) return err('第 4 回合起才能升华');
      const u = findUnit(P, arg.uid);
      if (!u) return err('请先选一名从者');
      if (u.ascend) return err('这名从者已经升华过了');
      u.ascend = arg.route; // 'np' 宝具路线 / 'body' 灵基路线
    } else if (kind === '绝对命令') {
      P.absolute = true;
    } else return err('未知的令咒');
    P.seals--;
    return ok();
  }

  // ===== 交战 =====
  const isExtra = c => c && !BASE.includes(c);
  const NP_BONUS_CAP = 1;
  const npMultOf = f => 1 + Math.min(NP_BONUS_CAP, f.npBonus || 0);
  function makeFighter(G, u, side, P) {
    const c = CARD[u.key];
    const f = {
      uid: u.uid, key: u.key, name: u.key, img: c.img, c: c.c, t: c.t, ref: u, side, gold: u.gold,
      tribes: new Set(tribesOf(G, u).filter(t => G.open.includes(t))), traits: new Set(c.traits || []),
      atk: unitAtk(u), hp: unitHp(u), maxHp: unitHp(u), shield: 0, dodge: 0, invul: 0, guts: 0, taunt: false, stealth: false, stun: 0,
      npOn: npUnlocked(u) || !!u.tempUnlock, npUsed: 0, npMax: 1, npBonus: (u.nextNpBonus || 0) + (u.ascend === 'np' && (u.t >= 4 || u.gold || u.npUnlock) ? 0.5 : 0),
      summon: false, sealed: false, npSealed: false, firstAttackDone: false, hurtCount: 0, counters: {}, dead: false,
    };
    f.npMult = npMultOf(f); f.atk0 = f.atk;
    if (u.ascend === 'body') { f.maxHp = f.hp = Math.ceil(f.hp * 1.5); f.guts++; }
    if (c.c === 'Shielder' || u.permTaunt) f.taunt = true;
    // 礼装留到下一场的效果
    if (u.nextFirst) f.first = true;
    if (u.nextGuts) f.guts += u.nextGuts;
    if (u.nextInvul) f.invul += u.nextInvul;
    return f;
  }
  function makeSummon(b, side, spec) {
    return {
      uid: uidSeq++, key: spec.name, name: spec.name, img: null, from: spec.from || (CARD[spec.name] ? spec.name : null), c: null, t: 1, ref: null, side, gold: false,
      tribes: new Set((spec.tribes || []).filter(t => b.G.open.includes(t))), traits: new Set(spec.traits || []),
      atk: Math.max(1, spec.atk), atk0: Math.max(1, spec.atk), hp: Math.max(1, spec.hp), maxHp: Math.max(1, spec.hp), shield: 0, dodge: 0, invul: 0, guts: 0, taunt: !!spec.taunt, stealth: false, stun: 0,
      npOn: false, npUsed: 0, npMax: 0, npBonus: 0, npMult: 1, summon: true, sealed: false, npSealed: false, firstAttackDone: false, hurtCount: 0, counters: {}, dead: false,
    };
  }
  const snap = f => ({ uid: f.uid, key: f.key, name: f.name, img: f.img, from: f.from || null, c: f.c, t: f.t, atk: f.atk, hp: Math.max(0, f.hp), maxHp: f.maxHp, shield: f.shield, dodge: f.dodge, invul: f.invul, guts: f.guts, taunt: f.taunt, stealth: f.stealth, stun: f.stun, gold: f.gold, summon: f.summon, npOn: f.npOn && !f.npSealed, npUsed: f.npUsed, tribes: [...f.tribes] });

  function fight(G, A, B, opts = {}) {
    const rng = makeRng(Math.floor(G.rng() * 1e9));
    const b = { G, rng, sides: [], frames: [], actions: 0, events: 0, aborted: '', pending: [], extra: [], extraUsed: 0 };
    const sides = [A, B].map((P, i) => ({ i, P, units: P.board.map(u => makeFighter(G, u, i, P)), ptr: 0, bonds: {}, flags: {} }));
    b.sides = sides;
    const frame = (msg, hl) => { if (b.frames.length < 600) b.frames.push({ msg, hl: hl || null, sides: sides.map(s => s.units.filter(u => !u.dead).map(snap)) }); };
    b.frame = frame;
    const alive = s => s.units.filter(u => !u.dead && u.hp > 0);
    const foesOf = f => alive(sides[1 - f.side]);
    const matesOf = (f, self) => alive(sides[f.side]).filter(u => self || u !== f);
    const ab = (f, hook, ...args) => {
      if (f.sealed || f.summon) return undefined;
      const h = IMPL.ab[f.key] && IMPL.ab[f.key][hook];
      if (!h) return undefined;
      if (goldDoubles(f) && hook === 'attackMod') { const n = args[1], m = h(b, f, ...args); return typeof m === 'number' ? n + 2 * (m - n) : m; }
      if (goldDoubles(f) && hook === 'firstAttack') { const r = h(b, f, ...args); return r && r.mult ? { ...r, mult: 1 + 2 * (r.mult - 1) } : r; }
      let r;
      for (let k = goldTimes(f, hook); k > 0; k--) r = h(b, f, ...args);
      return r;
    };
    // ---- 给能力用的工具 ----
    Object.assign(b, {
      foes: foesOf, mates: matesOf, alive,
      side: f => sides[f.side],
      adj: f => { const list = sides[f.side].units.filter(u => !u.dead); const i = list.indexOf(f); return [list[i - 1], list[i + 1]].filter(u => u && u.hp > 0); },
      left: f => { const list = sides[f.side].units.filter(u => !u.dead); return list[list.indexOf(f) - 1]; },
      right: f => { const list = sides[f.side].units.filter(u => !u.dead); return list[list.indexOf(f) + 1]; },
      maxAtk: list => list.reduce((m, u) => (!m || u.atk > m.atk ? u : m), null),
      minHp: list => list.reduce((m, u) => (!m || u.hp < m.hp ? u : m), null),
      maxHpOf: list => list.reduce((m, u) => (!m || u.hp > m.hp ? u : m), null),
      pick: list => rng.pick(list),
      tribe: (f, t) => f.tribes.has(t),
      trait: (f, t) => f.traits.has(t),
      bond: (f, key) => sides[f.side].bonds[key] || 0,
      // 宝具效果的通用加成相加，合计最多 +100%（Caster 6 名的辅助加成也算在里面）
      n: (f, x) => Math.ceil(x * (1 + Math.min(NP_BONUS_CAP, (f.npBonus || 0) + (f.counters.support ? 0.5 : 0)))),
      npAdd: (f, x) => { f.npBonus = (f.npBonus || 0) + x; f.npMult = npMultOf(f); },
      buff: (f, a, h) => { f.atk = Math.max(1, f.atk + a); if (h) { f.maxHp = Math.max(1, f.maxHp + h); f.hp = Math.min(f.maxHp, Math.max(1, f.hp + h)); } },
      // 攻击保底：不低于本场开战时攻击的一半
      debuff: (f, a, h = 0) => { const floor = Math.max(1, Math.ceil((f.atk0 || f.atk) / 2)); f.atk = Math.max(Math.min(f.atk, floor), f.atk - a); if (h) { f.maxHp = Math.max(1, f.maxHp - h); f.hp = Math.min(f.hp, f.maxHp); if (f.hp <= 0) f.hp = 1; } },
      perm: (f, a, h) => {
        if (!f.ref) { b.buff(f, a, h); return; }
        const before = { a: f.ref.permAtk, h: f.ref.permHp };
        permBuff(f.ref, a, h);
        b.buff(f, f.ref.permAtk - before.a, f.ref.permHp - before.h);
      },
      heal: (f, n) => { if (f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + n); },
      shield: (f, n) => { if (n <= 0 || f.hp <= 0) return; f.shield += n; matesOf(f, true).forEach(m => ab(m, 'allyShield', f)); },
      hit, attack: doAttack, summon, stun: f => { f.stun = Math.min(2, f.stun + 1); },
      extraAttack: f => b.extra.push(f),
      fireNP: (f, trig, ctx) => fireNP(f, trig, ctx),
      log: msg => frame(msg),
      // 交战中献祭：默认不触发归座（陈宫献祭阿拉什是写明的特例）
      sacrifice: (f, rattle = false) => { f.hp = 0; f.killer = null; f.noRattle = !rattle; },
      isClass,
      cardOf: f => CARD[f.key],
    });

    function fireNP(f, trig, ctx) {
      const np = IMPL.np[f.key];
      if (!np || f.summon || f.sealed || f.npSealed || !f.npOn) return null;
      if (np.on !== trig) return null;
      const max = (typeof np.uses === 'function' ? np.uses(b, f) : np.uses || 1) + f.npMax - 1;
      if (f.npUsed >= max) return null;
      f.npUsed++;
      frame(`${f.name} 发动宝具『${CARD[f.key] ? CARD[f.key].npName || '宝具' : '宝具'}』`, { np: f.uid });
      const r = np.run(b, f, ctx) || {};
      matesOf(f).forEach(m => ab(m, 'allyNP', f));
      return r;
    }

    // ---- 伤害 ----
    function hit(src, tgt, n, opts2 = {}) {
      if (!tgt || tgt.dead || tgt.hp <= 0 || n <= 0) return 0;
      if (src && !opts2.raw) {
        const m1 = ab(src, 'attackMod', tgt, n, opts2); if (typeof m1 === 'number') n = m1;
      }
      const m2 = ab(tgt, 'defendMod', src, n, opts2); if (typeof m2 === 'number') n = m2;
      if (tgt.counters.dmgReduce && opts2.attack) n -= tgt.counters.dmgReduce; // 秦良玉：相邻中华受到的攻击伤害 −1
      n = Math.max(0, Math.ceil(n));
      // 希腊 4 名：相邻的希腊替试炼英雄承受第一次伤害
      if (tgt.counters.hero && !tgt.counters.heroGuarded && b.bond(tgt, '希腊') >= 4) {
        const guard = b.adj(tgt).find(x => x.tribes.has('希腊'));
        if (guard) { tgt.counters.heroGuarded = true; frame(`${guard.name} 替试炼英雄挡下伤害`); return hit(src, guard, n, { ...opts2, raw: true }); }
      }
      if (tgt.invul > 0 && !opts2.pierce) { tgt.invul--; frame(`${tgt.name} 的无敌抵消了伤害`, { t: tgt.uid }); b.pending.push({ type: 'shieldBroken', u: tgt }); return 0; }
      let rest = n;
      if (tgt.shield > 0 && !opts2.pierce) {
        const used = Math.min(tgt.shield, rest);
        tgt.shield -= used; rest -= used;
        if (tgt.shield === 0) b.pending.push({ type: 'shieldBroken', u: tgt });
      }
      if (rest <= 0) return 0;
      // Saber 6 名：友方第一次受到致命伤害时，由体力最高的 Saber 代为承受
      const S = sides[tgt.side];
      if (tgt.hp - rest <= 0 && !tgt.guts && S.bonds.Saber >= 6 && !S.flags.saberGuard) {
        const sab = b.maxHpOf(alive(S).filter(x => x !== tgt && x.c === 'Saber' && !x.summon));
        if (sab) { S.flags.saberGuard = true; frame(`${sab.name} 替 ${tgt.name} 承受了致命伤`); return hit(src, sab, rest, { ...opts2, raw: true }); }
      }
      tgt.hp -= rest;
      tgt.lastHit = src;
      if (tgt.hp <= 0 && tgt.guts > 0) {
        tgt.guts--; tgt.hp = 1;
        frame(`${tgt.name} 发动毅力`, { t: tgt.uid });
        b.pending.push({ type: 'guts', u: tgt, src });
      }
      if (tgt.hp > 0) b.pending.push({ type: 'hurt', u: tgt, src, n: rest });
      else { tgt.killer = src; }
      return rest;
    }

    function pickTarget(f) {
      let list = foesOf(f);
      if (!list.length) return null;
      const visible = list.filter(u => !u.stealth);
      if (visible.length) list = visible;
      const taunts = list.filter(u => u.taunt);
      if (taunts.length) list = taunts;
      const pref = ab(f, 'pickTarget', list);
      return pref || rng.pick(list);
    }

    function doAttack(f, forced, opts2 = {}) {
      if (!f || f.dead || f.hp <= 0) return;
      const tgt = forced && !forced.dead && forced.hp > 0 ? forced : pickTarget(f);
      if (!tgt) return;
      f.stealth = false;
      let mult = 1, aoe = 0, noCounter = !!opts2.noCounter, skip = false;
      if (!f.firstAttackDone) {
        f.firstAttackDone = true;
        const r = fireNP(f, '第一次攻击时', { target: tgt });
        if (r) { mult *= r.mult || 1; aoe = r.aoe || 0; noCounter = noCounter || !!r.noCounter; skip = !!r.skip; }
        const r2 = ab(f, 'firstAttack', tgt);
        if (r2) { mult *= r2.mult || 1; noCounter = noCounter || !!r2.noCounter; }
        const S = sides[f.side];
        if (f.c === 'Assassin' && !f.summon && S.bonds.Assassin >= 4) mult *= 2;
        if (f.c === 'Rider' && !f.summon && S.bonds.Rider >= 4) b.extra.push(f);
      }
      if (skip) return;
      const atkBase = f.atk * (f.c === 'Berserker' && !f.summon ? 1.5 : 1) + (opts2.bonus || 0);
      if (aoe) {
        frame(`${f.name} 对敌方全体攻击`, { a: f.uid });
        foesOf(f).forEach(u => hit(f, u, Math.ceil(atkBase * aoe * mult), { aoe: true }));
      } else {
        frame(`${f.name} 攻击 ${tgt.name}`, { a: f.uid, t: tgt.uid });
        ab(f, 'beforeAttack', tgt);
        if (tgt.dodge > 0) {
          tgt.dodge--;
          frame(`${tgt.name} 回避了攻击`, { t: tgt.uid });
          b.pending.push({ type: 'dodge', u: tgt, src: f });
        } else {
          const counter = noCounter ? 0 : tgt.atk;
          hit(f, tgt, Math.ceil(atkBase * mult), { attack: true });
          if (counter > 0) hit(tgt, f, counter, { counter: true });
        }
      }
      ab(f, 'afterAttack', tgt);
      matesOf(f).forEach(m => ab(m, 'allyAttack', f, tgt));
      if (f.tribes.has('妖精') && b.bond(f, '妖精') >= 4 && tgt.hp > 0) b.debuff(tgt, b.bond(f, '妖精') >= 6 ? 2 : 1);
    }

    function summon(side, pos, spec) {
      const S = sides[side];
      const living = S.units.filter(u => !u.dead);
      if (living.length >= 7) return null;
      const s = makeSummon(b, side, spec);
      // 放在 pos 位置（按活着的单位计）；在行动指针左边的，下一轮才行动
      const anchor = living[pos];
      const idx = anchor ? S.units.indexOf(anchor) : S.units.length;
      S.units.splice(idx, 0, s);
      if (idx < S.ptr) S.ptr++;
      frame(`召唤了 ${s.name}`, { s: s.uid });
      matesOf(s).forEach(m => ab(m, 'allySummon', s));
      // 阿维斯布隆：同一次召唤多召唤一个（金卡两个），多出来的不会再放大
      if (!spec.extra) {
        const amp = ampOf(alive(S).filter(u => !u.sealed), AMP.召唤);
        for (let k = 1; k < amp; k++) summon(side, pos, { ...spec, extra: true });
      }
      return s;
    }

    function processDeaths() {
      let any = false;
      for (const S of sides) {
        for (const d of S.units.slice()) {
          if (d.dead || d.hp > 0) continue;
          any = true;
          d.dead = true;
          const living = S.units.filter(u => !u.dead);
          const pos = S.units.indexOf(d) - S.units.slice(0, S.units.indexOf(d)).filter(u => u.dead).length;
          const idx = S.units.indexOf(d);
          S.units.splice(idx, 1);
          if (idx < S.ptr) S.ptr--;
          frame(`${d.name} 阵亡`, { dead: d.uid });
          const killer = d.killer && !d.killer.dead && d.killer.hp > 0 ? d.killer : null;
          let suppressed = false;
          if (killer) {
            const r = ab(killer, 'kill', d);
            if (r && r.suppress) suppressed = true;
            const r2 = fireNP(killer, '击杀时', { victim: d });
            if (r2 && r2.suppress) suppressed = true;
            const KS = sides[killer.side];
            if (killer.c === 'Assassin' && !killer.summon && KS.bonds.Assassin >= 6) killer.stealth = true;
            if (killer.c === 'Rider' && !killer.summon && KS.bonds.Rider >= 6 && (KS.flags.riderX || 0) < 3) { KS.flags.riderX = (KS.flags.riderX || 0) + 1; b.extra.push(killer); }
            if (killer.tribes.has('新选组')) {
              const lvl = b.bond(killer, '新选组');
              if ((lvl >= 2 && !KS.flags.shinFirst) || (lvl >= 4 && (KS.flags.shinX || 0) < (lvl >= 6 ? 6 : 3))) {
                KS.flags.shinFirst = true; KS.flags.shinX = (KS.flags.shinX || 0) + 1;
                b.extra.push(killer); killer.counters.shinBonus = lvl >= 6 ? 4 : lvl >= 4 ? 2 : 0;
              }
            }
            alive(KS).filter(m => m !== killer).forEach(m => ab(m, 'allyKill', killer, d));
            if (killer.tribes.has('鬼') && !killer.summon && b.bond(killer, '鬼') >= 4 && (killer.counters.oniKill || 0) < 2) {
              killer.counters.oniKill = (killer.counters.oniKill || 0) + 1;
              b.perm(killer, 1, b.bond(killer, '鬼') >= 6 ? 1 : 0);
            }
            // 【吸收】：击杀非召唤物后永久获得它（不含本场增益的）攻体的 1/absorb（一般是四分之一），每场 1 次（樱系列 4 名、姐妹相邻各多 1 次）；击杀召唤物固定 +1/+1，不占次数
            const absorb = !killer.sealed && IMPL.ab[killer.key] && IMPL.ab[killer.key].absorb;
            if (absorb) {
              const sis = { Meltryllis: 'Passionlip（Alterego）', 'Passionlip（Alterego）': 'Meltryllis' }[killer.key];
              const uses = 1 + (b.bond(killer, '樱系列') >= 4 ? 1 : 0) + (sis && b.adj(killer).some(u => u.key === sis) ? 1 : 0);
              let ga = 0, gh = 0;
              if (d.summon) { ga = 1; gh = 1; }
              else if ((killer.counters.absorbed || 0) < uses) {
                killer.counters.absorbed = (killer.counters.absorbed || 0) + 1;
                const ba = d.ref ? unitAtk(d.ref) : d.atk0, bh = d.ref ? unitHp(d.ref) : d.maxHp;
                const div = b.bond(killer, '樱系列') >= 6 ? Math.min(absorb, 2) : absorb;
                ga = Math.ceil(ba / div); gh = Math.ceil(bh / div);
                frame(`${killer.name} 吸收了 ${d.name}`, { a: killer.uid });
              }
              if (ga || gh) { b.perm(killer, ga, gh); ab(killer, 'absorbed', ga, gh); }
            }
            // 樱系列 2 名：击杀后本场获得目标一半的攻击
            if (killer.tribes.has('樱系列') && b.bond(killer, '樱系列') >= 2) b.buff(killer, Math.ceil((d.atk0 || d.atk) / 2), 0);
            if (killer.counters.hero) {
              b.buff(killer, 2, 0);
              if (b.bond(killer, '希腊') >= 4 && (killer.counters.heroGrow || 0) < 2) { killer.counters.heroGrow = (killer.counters.heroGrow || 0) + 1; b.perm(killer, 1, 1); }
            }
          }
          if (!suppressed && !d.sealed && !d.noRattle) {
            // 【归座】：埃列什基伽勒在场时这名从者自己的归座能力多结算（只重复它自己的，不重复羁绊召唤和其他从者的友方阵亡）
            const times = ampOf(alive(S).filter(u => !u.sealed), AMP.归座);
            for (let k = 0; k < times; k++) {
              ab(d, 'death', killer, pos);
              const np = IMPL.np[d.key];
              if (k === 0) fireNP(d, '阵亡时', { killer, pos });
              else if (np && np.on === '阵亡时' && d.npOn && !d.npSealed && d.npUsed > 0) np.run(b, d, { killer, pos });
            }
            if (!d.summon) {
              if (isClass(d.c, 'AlterEgo')) summon(d.side, pos, { name: '残影', from: d.key, atk: Math.ceil(d.atk / 3), hp: Math.ceil(d.maxHp / 3) });
              if (d.c === 'Foreigner') summon(d.side, pos, { name: '眷属', atk: d.t, hp: d.t * 2, tribes: ['领域外之存在'] });
              if (d.c === 'Berserker' && S.bonds.Berserker >= 4) { const t2 = rng.pick(foesOf(d)); if (t2) hit(null, t2, d.atk, { raw: true }); }
              if (d.tribes.has('龙') && b.bond(d, '龙') >= 2) { const k = b.bond(d, '龙') >= 6 ? 2 : 1; summon(d.side, pos, { name: '龙牙兵', atk: d.t * k, hp: d.t * 2 * k, tribes: ['龙'] }); }
              if (d.tribes.has('领域外之存在') && b.bond(d, '领域外之存在') >= 2) summon(d.side, pos, { name: '眷属', atk: 2, hp: 2, tribes: ['领域外之存在'] });
            }
          }
          if (d.tribes.has('机械') && b.bond(d, '机械') >= 2) {
            const lvl = b.bond(d, '机械');
            const near = alive(S).filter(u => u.tribes.has('机械'));
            const t2 = near[Math.min(pos, near.length - 1)];
            const k = lvl >= 6 ? 6 : lvl >= 4 ? 4 : 2;
            if (t2) { b.buff(t2, k, k); b.shield(t2, k); }
            S.flags.mechDeaths = (S.flags.mechDeaths || 0) + 1;
            if (lvl >= 4 && S.flags.mechDeaths === (lvl >= 6 ? 2 : 3)) summon(d.side, pos, lvl >= 6 ? { name: '机神装甲', atk: 15, hp: 20, taunt: true, tribes: ['机械'] } : { name: '机神装甲', atk: 10, hp: 15, taunt: true, tribes: ['机械'] });
          }
          alive(S).forEach(m => {
            ab(m, 'allyDeath', d);
            fireNP(m, '友方阵亡时', { dead: d });
            if (m.c === 'Avenger' && !m.summon && (m.counters.avenger || 0) < 8) { m.counters.avenger = (m.counters.avenger || 0) + 1; b.buff(m, 1, 0); }
          });
          if (d.tribes.has('圆桌骑士') && b.bond(d, '圆桌骑士') >= 4) roundTableRally(S, d);
        }
      }
      return any;
    }
    function roundTableRally(S, src) {
      alive(S).filter(u => u !== src && u.tribes.has('圆桌骑士')).forEach(u => {
        if ((u.counters.rally || 0) < 3) { u.counters.rally = (u.counters.rally || 0) + 1; b.buff(u, 2, 0); }
      });
    }

    function resolve() {
      let guard = 0;
      while (guard++ < 500) {
        if (++b.events > 4000) { b.aborted = '事件数超过上限'; return; }
        if (b.pending.length) {
          const e = b.pending.shift();
          const u = e.u;
          if (e.type === 'hurt' && u.hp > 0 && !u.dead) {
            u.hurtCount++;
            if (sides[u.side].flags.merlinHeal) b.heal(u, sides[u.side].flags.merlinHeal);
            ab(u, 'hurt', e.src, e.n);
            fireNP(u, '受伤时', { src: e.src });
            if (u.hurtCount === 1) fireNP(u, '第一次受伤时', { src: e.src });
            if (u.c === 'Berserker' && !u.summon && b.bond(u, 'Berserker') >= 2) {
              const cap = b.bond(u, 'Berserker') >= 6 ? 20 : 10;
              if ((u.counters.rage || 0) < cap) { u.counters.rage = (u.counters.rage || 0) + 2; b.buff(u, 2, 0); }
            }
          } else if (e.type === 'guts' && u.hp > 0) {
            ab(u, 'guts', e.src);
            fireNP(u, '毅力触发时', { src: e.src });
            const S = sides[u.side];
            if (u.c === 'Lancer' && !u.summon && S.bonds.Lancer >= 4) b.buff(u, u.atk, 0);
            if (u.c === 'Lancer' && !u.summon && S.bonds.Lancer >= 6 && e.src && e.src.hp > 0) hit(u, e.src, u.atk, { counter: true });
            if (u.counters.hero) {
              if (b.bond(u, '希腊') >= 4 && (u.counters.heroGrow || 0) < 2) { u.counters.heroGrow = (u.counters.heroGrow || 0) + 1; b.perm(u, 1, 1); }
            }
          } else if (e.type === 'dodge' && u.hp > 0) {
            ab(u, 'dodge', e.src);
            fireNP(u, '回避触发时', { src: e.src });
          } else if (e.type === 'shieldBroken' && u.hp > 0) {
            if (u.tribes.has('圆桌骑士') && b.bond(u, '圆桌骑士') >= 4) roundTableRally(sides[u.side], u);
            sides[u.side].units.filter(m => !m.dead && m.hp > 0).forEach(m => ab(m, 'allyShieldLost', u));
          }
          continue;
        }
        if (processDeaths()) continue;
        if (b.extra.length && b.extraUsed < 30 && alive(sides[0]).length && alive(sides[1]).length) {
          const f = b.extra.shift();
          b.extraUsed++;
          if (f && !f.dead && f.hp > 0) {
            const bonus = f.counters.shinBonus || 0;
            frame(`${f.name} 追加攻击`, { a: f.uid });
            doAttack(f, null, { bonus });
          }
          continue;
        }
        b.extra = [];
        return;
      }
      b.aborted = '连锁深度超过上限';
    }

    // ---- 羁绊 ----
    for (const S of sides) {
      const cls = {};
      // 同名的从者只算一名
      S.units.forEach(u => { if (BASE.includes(u.c)) (cls[u.c] = cls[u.c] || new Set()).add(u.key); });
      const extraKinds = new Set(S.units.filter(u => isExtra(u.c)).map(u => u.c)).size;
      BASE.forEach(c => { S.bonds[c] = cls[c] ? cls[c].size : 0; });
      S.bonds.extra = extraKinds;
      G.open.forEach(t => { S.bonds[t] = new Set(S.units.filter(u => u.tribes.has(t)).map(u => u.key)).size; });
    }
    const first = (() => {
      const r = sides.map(S => S.bonds.Rider >= 2);
      if (r[0] !== r[1]) return r[0] ? 0 : 1;
      const n = sides.map(S => S.units.length);
      if (n[0] !== n[1]) return n[0] > n[1] ? 0 : 1;
      return rng.int(2);
    })();
    const order = [sides[first], sides[1 - first]];
    frame(`交战开始：${A.name} 对 ${B.name}`);
    // 防御类羁绊
    for (const S of order) {
      const L = S.bonds, us = alive(S);
      const lv = (n, steps) => steps.filter(s => n >= s).length;
      us.forEach(u => {
        if (u.summon) return;
        if (u.c === 'Saber' && L.Saber >= 2) { b.buff(u, 1, 3); if (L.Saber >= 4) u.guts++; }
        if (u.c === 'Lancer' && L.Lancer >= 2) u.guts++;
        if (u.c === 'Assassin' && L.Assassin >= 2) u.stealth = true;
        if (u.c === 'Berserker' && L.Berserker >= 6) u.guts++;
        if (isExtra(u.c) && L.extra >= 3) { b.buff(u, 2, 4); if (L.extra >= 5) u.npOn = true; }
      });
      if (L.Caster >= 2) us.forEach(u => b.shield(u, L.Caster));
      if (L.Caster >= 4) { const c = us.find(u => u.c === 'Caster' && !u.npOn); if (c) c.npOn = true; }
      if (L.Caster >= 6) us.filter(u => u.c === 'Caster').forEach(u => { u.counters.support = true; });
      if (L['圆桌骑士'] >= 2) {
        const rt = us.filter(u => u.tribes.has('圆桌骑士'));
        const list = L['圆桌骑士'] >= 4 ? rt : [rt[0], rt[rt.length - 1]].filter((x, i, a) => x && a.indexOf(x) === i);
        list.forEach(u => { b.shield(u, u.t * (L['圆桌骑士'] >= 6 ? 2 : 1)); if (L['圆桌骑士'] >= 6) u.guts++; });
      }
      if (L['希腊'] >= 2) {
        const hero = b.maxAtk(us.filter(u => u.tribes.has('希腊')));
        if (hero) {
          hero.counters.hero = true; hero.guts++; frame(`${hero.name} 成为试炼英雄`);
          if (L['希腊'] >= 6) b.buff(hero, hero.atk, hero.maxHp);
        }
      }
      void lv;
    }
    // 进攻类羁绊
    for (const S of order) {
      const L = S.bonds, us = alive(S);
      if (L.Archer >= 2) us.filter(u => u.c === 'Archer').forEach(u => {
        const shots = L.Archer >= 6 ? 2 : 1;
        for (let k = 0; k < shots; k++) { const t2 = rng.pick(foesOf(u)); if (t2) hit(null, t2, L.Archer >= 4 ? 4 : 2, { raw: true }); }
      });
      if (L['妖精'] >= 2) {
        const t2 = b.maxAtk(alive(sides[1 - S.i])); if (t2) b.debuff(t2, 3);
        if (L['妖精'] >= 4) { const k = L['妖精'] >= 6 ? 2 : 1; alive(sides[1 - S.i]).forEach(u => b.debuff(u, k, k)); }
      }
      if (L['领域外之存在'] >= 4) {
        const outer = us.filter(u => u.tribes.has('领域外之存在'));
        const list = L['领域外之存在'] >= 6 ? outer : [b.maxAtk(outer)].filter(Boolean);
        list.forEach(t2 => { b.buff(t2, Math.ceil(t2.atk * 0.5), Math.ceil(t2.maxHp * 0.5)); frame(`${t2.name} 降临`); });
      }
      if (S.P.skill === 'Gandr') { const t2 = b.maxAtk(alive(sides[1 - S.i])); if (t2) hit(null, t2, 3, { raw: true }); }
      // Saber脸 4 名：全体 Saber脸 的攻击变成其中最高那名的攻击
      if (L['Saber脸'] >= 4) {
        const faces = us.filter(u => u.tribes.has('Saber脸'));
        const top = Math.max(...faces.map(u => u.atk));
        faces.forEach(u => { if (u.atk < top) b.buff(u, top - u.atk, 0); });
        if (L['Saber脸'] >= 6) faces.forEach(u => { u.invul = Math.max(u.invul, 1); });
      }
    }
    frame('羁绊生效');
    // 开战能力：先手方从左到右，再后手方
    for (const S of order) {
      for (const u of alive(S).slice()) {
        if (u.dead || u.hp <= 0) continue;
        if (u.c === 'Ruler' && !u.summon) { const m = rng.pick(b.adj(u)); if (m) m.invul = Math.max(m.invul, 1); }
        if (u.c === 'Pretender' && !u.summon) {
          const l = b.left(u);
          if (l && l.atk > u.atk) u.atk = l.atk;
          if (l) { u.shield += l.shield; u.dodge = Math.max(u.dodge, l.dodge); u.invul = Math.max(u.invul, l.invul); u.guts = Math.max(u.guts, l.guts); u.taunt = u.taunt || l.taunt; }
        }
        ab(u, 'start');
        fireNP(u, '开战时', {});
      }
    }
    resolve();
    for (const S of order) for (const u of alive(S).slice()) {
      if (!u.first || u.dead || u.hp <= 0 || !alive(sides[1 - S.i]).length) continue;
      frame(`${u.name} 先手出击`, { a: u.uid });
      doAttack(u); resolve();
    }
    frame('开始交战');

    // ---- 主循环 ----
    let turn = first;
    let idle = 0;
    while (alive(sides[0]).length && alive(sides[1]).length && !b.aborted) {
      if (++b.actions > 300) { b.aborted = '行动次数超过上限'; break; }
      const S = sides[turn];
      const list = S.units;
      let f = null;
      for (let k = 0; k < list.length; k++) {
        const i = (S.ptr + k) % list.length;
        if (!list[i].dead && list[i].hp > 0) { f = list[i]; S.ptr = i + 1; break; }
      }
      if (!f) { if (++idle > 2) break; turn = 1 - turn; continue; }
      idle = 0;
      if (f.stun > 0) { f.stun--; frame(`${f.name} 眩晕，跳过行动`, { a: f.uid }); }
      else doAttack(f);
      resolve();
      turn = 1 - turn;
    }
    const left = sides.map(S => alive(S));
    let winner = null;
    if (b.aborted) frame(`战斗中止：${b.aborted}，判为平局`);
    else if (left[0].length && !left[1].length) winner = 0;
    else if (left[1].length && !left[0].length) winner = 1;
    frame(winner === null ? '平局' : `${sides[winner].P.name} 获胜`);
    const survivors = winner === null ? [] : left[winner];
    return { winner, survivors: survivors.map(snap), frames: b.frames, aborted: b.aborted, first };
  }

  // ===== 结束准备 → 交战 → 结算 =====
  const damageCap = round => (round <= 4 ? 5 : round <= 7 ? 10 : 15);
  function prepEnd(G, P) {
    // 【整备】：玉藻前在场时卡上的整备效果触发两次（金卡三次）；羁绊和职阶的整备不放大
    const times = ampOf(P.board, AMP.整备);
    for (let k = 0; k < times; k++) P.board.slice().forEach(u => { const i = P.board.indexOf(u); if (i < 0) return; callPrep(G, P, u, 'prepEnd', i, k); callNpPrep(G, P, u, '回合结束时'); });
    const has = t => G.open.includes(t) && countTribe(G, P.board, t);
    // 中华 2 名：左右两边都是中华的中华永久 +1/+1
    if (has('中华') >= 2) P.board.forEach((u, i) => {
      const zh = x => x && tribesOf(G, x).includes('中华');
      if (zh(u) && zh(P.board[i - 1]) && zh(P.board[i + 1])) prepPerm(G, P, u, 1, 1);
    });
    // Saber脸 2 名：攻击最低的一名 Saber脸 永久 +1/+1
    if (has('Saber脸') >= 2) {
      const t = P.board.filter(u => tribesOf(G, u).includes('Saber脸')).sort((x, y) => unitAtk(x) - unitAtk(y))[0];
      if (t) prepPerm(G, P, t, 1, 1);
    }
    // 中华 6 名：全体中华永久 +1/+1
    if (has('中华') >= 6) P.board.filter(u => tribesOf(G, u).includes('中华')).forEach(u => prepPerm(G, P, u, 1, 1));
    // 樱系列 4 名：全体樱系列永久 +1/+1
    if (has('樱系列') >= 4) P.board.filter(u => tribesOf(G, u).includes('樱系列')).forEach(u => prepPerm(G, P, u, 1, 1));
    // MoonCancer：每回合结束，相邻从者永久 +0/+1
    P.board.forEach((u, i) => {
      if (u.c !== 'MoonCancer') return;
      [P.board[i - 1], P.board[i + 1]].filter(Boolean).forEach(x => permBuff(x, 0, 1));
    });
    // 龙 4 名：每回合结束，战线上的龙永久 +1/+1
    if (has('龙') >= 4) { const k = has('龙') >= 6 ? 2 : 1; P.board.filter(u => tribesOf(G, u).includes('龙')).forEach(u => permBuff(u, k, k)); }
  }
  function endRound(G) {
    if (G.over) return null;
    const results = [];
    for (const P of G.players) if (P.alive) { if (!P.human) aiPrep(G, P); prepEnd(G, P); }
    for (const [aId, bId] of G.pairs) {
      const A = G.players[aId];
      const B = bId === 'ghost' ? ghostPlayer(G) : G.players[bId];
      if (!B) { results.push({ a: aId, b: null, bye: true }); continue; }
      const r = fight(G, A, B);
      const loser = r.winner === null ? null : r.winner === 0 ? B : A;
      const winnerP = r.winner === null ? null : r.winner === 0 ? A : B;
      let dmg = 0;
      if (loser) {
        dmg = r.survivors.reduce((s, u) => s + (u.summon ? 1 : u.t), 0) + winnerP.tier + (G.round >= 8 ? 2 : 0);
        dmg = Math.min(dmg, damageCap(G.round));
        if (loser.absolute) dmg = 0;
        if (!loser.ghost) loser.hp -= dmg;
      }
      if (winnerP && !winnerP.ghost) winnerP.board.forEach(u => callPrep(G, winnerP, u, 'afterWin'));
      [A, B].forEach((P, i) => { if (!P.ghost) P.lastResult = { opp: (i ? A : B).name, win: r.winner === i, draw: r.winner === null, dmg: loser === P ? dmg : 0 }; });
      G.lastPair[aId] = bId; if (bId !== 'ghost') G.lastPair[bId] = aId;
      results.push({ a: aId, b: bId, winner: r.winner, dmg, frames: r.frames, aborted: r.aborted });
    }
    // 清理一次性效果
    for (const P of G.players) P.board.concat(P.bench).forEach(u => { u.nextNpBonus = 0; u.tempUnlock = false; u.nextFirst = false; u.nextGuts = 0; u.nextInvul = 0; });
    // 淘汰
    const dead = G.players.filter(p => p.alive && p.hp <= 0).sort((x, y) => x.hp - y.hp);
    const aliveCount = G.players.filter(p => p.alive).length;
    dead.forEach((p, i) => {
      p.alive = false; p.place = aliveCount - i;
      G.ghost = { name: `${p.name}的残影`, board: p.board.map(u => ({ ...u })), tier: p.tier, ghost: true, skill: null, players: null };
      p.board.concat(p.bench).forEach(u => u.mats.forEach(k => returnToPool(G, k)));
    });
    const left = G.players.filter(p => p.alive);
    if (left.length === 1) left[0].place = 1;
    if (left.length <= 1 || (G.players[0].human && !G.players[0].alive)) {
      G.over = true;
      left.sort((x, y) => y.hp - x.hp).forEach((p, i) => { if (!p.place) p.place = i + 1; });
    }
    G.lastResults = results;
    if (!G.over) startRound(G);
    return results;
  }
  function ghostPlayer(G) { return G.ghost ? { ...G.ghost, name: G.ghost.name, board: G.ghost.board, tier: G.ghost.tier, ghost: true } : null; }

  // ===== 对手 AI =====
  const STYLE = {
    稳健: { up: [3, 5, 7, 9, 11], roll: 0.2, low: 0, tauntBias: 8 },
    赌徒: { up: [4, 7, 9, 11, 13], roll: 0.7, low: 0, tauntBias: 0 },
    羁绊: { up: [3, 5, 7, 9, 12], roll: 0.4, low: 0, tauntBias: 2, tribe: 10 },
    军师: { up: [2, 4, 6, 8, 10], roll: 0.2, low: 0, tauntBias: 2 },
    王道: { up: [2, 4, 5, 7, 9], roll: 0.3, low: -2, tauntBias: 0 },
    速攻: { up: [5, 8, 11, 13, 15], roll: 0.3, low: 4, tauntBias: 0 },
  };
  function unitValue(G, P, u) {
    const v = unitAtk(u) * 2 + unitHp(u) + (u.gold ? 15 : 0) + u.t * 3;
    const tribes = tribesOf(G, u).filter(t => G.open.includes(t));
    const syn = tribes.reduce((s, t) => s + P.board.filter(x => x !== u && tribesOf(G, x).includes(t)).length * 3, 0);
    const cls = P.board.filter(x => x !== u && x.c === u.c).length * 2;
    return v + syn + cls;
  }
  function shopScore(G, P, key) {
    const st = STYLE[P.style] || STYLE['稳健'];
    const c = CARD[key];
    let s = c.t * 10 + (st.low && c.t <= 2 && G.round <= 5 ? st.low * 3 : 0);
    const copies = P.board.concat(P.bench).filter(u => u.key === key && !u.gold).length;
    s += copies * 22;
    const tribes = c.r.filter(t => G.open.includes(t));
    s += tribes.reduce((a, t) => a + P.board.filter(u => tribesOf(G, u).includes(t)).length * (st.tribe || 5), 0);
    s += P.board.filter(u => u.c === c.c).length * 3;
    return s;
  }
  // AI 用礼装时挑的目标
  function aiCETarget(G, P, name) {
    const ce = CE[name];
    if (!ce.target) return null;
    let list = P.board.slice();
    if (name === '虚数魔术') list = list.filter(u => u.t <= 3 && !npUnlocked(u));
    if (name === '魔性菩萨') list = list.filter(u => IMPL.ab[u.key] && IMPL.ab[u.key].deploy);
    if (name === '先制' || name === '死灵魔术' || name === '月灵髓液') list = list.filter(u => !u.nextFirst || name !== '先制');
    return list.sort((a, b) => unitValue(G, P, b) - unitValue(G, P, a))[0] || null;
  }
  const slip = (G, P) => P.ease > 0 && G.rng() < P.ease;
  // AI 上阵：只把备战席的从者放进空位；战线满了而备战席有明显更好的，先送还战线上最弱的再放
  function aiDeploy(G, P) {
    const st = STYLE[P.style] || STYLE['稳健'];
    for (let g = 0; g < 10 && P.bench.length; g++) {
      const best = P.bench.slice().sort((a, b) => unitValue(G, P, b) - unitValue(G, P, a))[0];
      if (P.board.length < 7) { deploy(G, P, best.uid); continue; }
      const worst = P.board.slice().sort((a, b) => unitValue(G, P, a) - unitValue(G, P, b))[0];
      if (unitValue(G, P, best) > unitValue(G, P, worst) + 8) { sell(G, P, worst.uid); deploy(G, P, best.uid); continue; }
      break;
    }
    // 站位：目标集中放左边，其余按价值（失误时保持原样）
    if (slip(G, P)) return;
    const order = P.board.slice().sort((a, b) => (tauntOf(b) - tauntOf(a)) * (st.tauntBias + 1) || unitValue(G, P, b) - unitValue(G, P, a));
    P.board = order;
  }
  function aiPrep(G, P) {
    const st = STYLE[P.style] || STYLE['稳健'];
    for (let step = 0; step < 40; step++) {
      if (P.pendingDiscover && slip(G, P)) { pickDiscover(G, P, Math.floor(G.rng() * P.pendingDiscover.length)); continue; }
      if (P.pendingDiscover) { pickDiscover(G, P, P.pendingDiscover.reduce((bi, k, i, a) => (shopScore(G, P, k) > shopScore(G, P, a[bi]) ? i : bi), 0)); continue; }
      if (P.pendingSame) { const mats = P.pendingSame.map(uid => findUnit(P, uid)); pickSame(G, P, mats.reduce((bi, u, i) => (u && CARD[u.key].atk + CARD[u.key].hp > CARD[mats[bi].key].atk + CARD[mats[bi].key].hp ? i : bi), 0)); continue; }
      if (P.tier < 6 && G.round >= st.up[P.tier - 1] + (P.ease > 0 ? 2 : 0) && P.mana >= P.upCost) { upgrade(G, P); continue; }
      // 灵基融合：有能融合的机械就融合进战线上价值最高的机械
      const mechT = P.board.filter(u => tribesOf(G, u).includes('机械')).sort((a, b) => unitValue(G, P, b) - unitValue(G, P, a))[0];
      if (mechT) {
        const fb = P.bench.find(u => hasKw(u.key, '灵基融合') && u !== mechT);
        if (fb) { fuse(G, P, { uid: fb.uid }, mechT.uid); continue; }
        const fs = P.shop.findIndex(k => k && hasKw(k, '灵基融合'));
        if (fs >= 0 && P.mana >= buyCost(P)) { fuse(G, P, { shop: fs }, mechT.uid); continue; }
      }
      // 手牌里的礼装先用掉
      if (P.ceHand.length && P.board.length) {
        const idx = P.ceHand.findIndex(n => !CE[n].target || aiCETarget(G, P, n));
        if (idx >= 0) { const n = P.ceHand[idx]; const t = aiCETarget(G, P, n); if (castCE(G, P, idx, t && t.uid).ok) continue; }
      }
      const cands = P.shop.map((k, i) => (k ? { i, s: shopScore(G, P, k) } : null)).filter(Boolean).sort((a, b) => b.s - a.s);
      const best = cands.length && slip(G, P) ? G.rng.pick(cands) : cands[0];
      if (best && P.mana >= buyCost(P)) {
        if (handFree(P) <= 0) {
          const worst = P.bench.slice().sort((a, b) => unitValue(G, P, a) - unitValue(G, P, b))[0];
          if (worst && unitValue(G, P, worst) < best.s) sell(G, P, worst.uid); else break;
        }
        buy(G, P, best.i);
        if (P.board.length < 7) aiDeploy(G, P);
        continue;
      }
      // 剩下的魔力买礼装当场用
      const ceSlot = P.ceShop.findIndex(n => P.mana >= ceCost(P, n) && (!CE[n].target || aiCETarget(G, P, n)));
      if (ceSlot >= 0 && P.board.length) { const n = P.ceShop[ceSlot]; const t = aiCETarget(G, P, n); if (buyCE(G, P, ceSlot, t && t.uid).ok) continue; }
      if (P.mana >= 1 && (G.rng() < st.roll || P.mana >= 3)) { refresh(G, P); continue; }
      break;
    }
    // 令咒
    if (P.seals > 0 && G.round >= 5 && P.board.length) {
      const best = P.board.slice().sort((a, b) => unitValue(G, P, b) - unitValue(G, P, a)).find(u => !u.ascend);
      if (best && (G.round === 5 || G.round === 8)) useSeal(G, P, '灵基升华', { uid: best.uid, route: npUnlocked(best) ? 'np' : 'body' });
    }
    if (P.seals > 0 && P.hp <= 8) useSeal(G, P, '绝对命令');
    aiDeploy(G, P);
    if (P.skill === '应急手当' && P.mana >= 1 && P.board[0]) useSkill(G, P, P.board[0].uid);
  }
  const tauntOf = u => (/目标集中/.test(CARD[u.key].ab) || u.c === 'Shielder' || u.permTaunt ? 1 : 0);

  const api_ = {
    DATA, CARD, CES, CE, HAND, handFree, SKILLS, TOTAL, COPIES, BASE,
    newGame, buy, sell, deploy, fuse, move, moveTo, refresh, toggleFreeze, upgrade, buyCE, storeCE, castCE, useSkill, useSeal, pickDiscover, pickSame, endRound, fight,
    opponentOf, unitAtk, unitHp, tribesOf, npUnlocked, countTribe, goldDoubles, aiPrep, makeRng, hasKw, buyCost, ceCost,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api_;
  else root.ChessCore = api_;
})(typeof window !== 'undefined' ? window : globalThis);
