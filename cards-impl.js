// 全部棋子的能力实现（测试版）。ab：固有能力的钩子；np：宝具（on 是触发条件，uses 是每场次数）。
// 交战钩子的第一个参数 b 是战斗工具（见 core.js 的 fight），准备阶段钩子的第一个参数是准备工具（见 core.js 的 api）。
// 和卡面文字不完全一致的简化写在 SIMPLIFIED 里。
(function (root) {
  const ab = {}, np = {};
  const has = (b, me, name) => b.mates(me).find(u => u.key === name);
  const firstSide = (b, me, list) => list.filter(u => u.side === me.side);
  // 对目标和相邻敌人（金卡：全体）造成攻击伤害，不受反击
  const sweep = (b, me, tgt, all) => {
    const list = all ? b.foes(me) : [tgt, ...b.adj(tgt)].filter(Boolean);
    list.forEach(u => b.hit(me, u, b.n(me, me.atk), { np: true }));
    return { skip: true };
  };

  // ---------- 圆桌骑士 ----------
  ab['加雷斯（Lancer）'] = { start: (b, me) => { me.taunt = true; }, deploy: (a, u) => { const n = a.adjacent(u).filter(x => a.tribe(x, '圆桌骑士')).length; if (n) a.perm(u, 0, 2 * n * (u.gold ? 2 : 1)); } };
  np['加雷斯（Lancer）'] = { on: '受伤时', uses: 2, run: (b, me) => b.shield(me, b.n(me, me.t * 2)) };
  ab['贝德维尔'] = { deploy: (a, u) => { const l = a.left(u); if (l) { const k = (a.tribe(l, '圆桌骑士') ? 2 : 1) * (u.gold ? 2 : 1); a.perm(l, k, k); } } };
  np['贝德维尔'] = { on: '阵亡时', run: (b, me, ctx) => { const l = b.alive(b.side(me))[ctx.pos - 1]; if (l && b.tribe(l, '圆桌骑士')) b.perm(l, Math.ceil(me.atk / 2), 0); } };
  ab['崔斯坦'] = {
    pickTarget: (b, me, list) => b.minHp(list),
    kill: (b, me) => b.buff(me, 2, 0),
    start: (b, me) => { const bed = b.adj(me).find(u => u.key === '贝德维尔'); if (bed) { b.buff(me, 2, 4); b.buff(bed, 2, 4); } },
  };
  np['崔斯坦'] = { on: '开战时', run: (b, me) => { for (let i = 0; i < 3; i++) { const t = b.minHp(b.foes(me)); if (t) b.hit(me, t, b.n(me, 2), { raw: true }); } } };
  const hasDeath = u => u.summon || u.c === 'Foreigner' || (u.c || '').toLowerCase() === 'alterego' || (ab[u.key] && ab[u.key].death) || (np[u.key] && np[u.key].on === '阵亡时');
  ab['格蕾'] = { attackMod: (b, me, tgt, n) => (hasDeath(tgt) ? n + 3 : n) };
  np['格蕾'] = { on: '击杀时', run: () => ({ suppress: true }) };
  ab['珀西瓦尔'] = {
    start: (b, me) => { me.taunt = true; },
    allyShield: (b, me) => { if ((me.counters.p || 0) < 2) { me.counters.p = (me.counters.p || 0) + 1; b.perm(me, 0, 1); } },
  };
  np['珀西瓦尔'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.shield(u, b.n(me, 3))) };
  ab['兰斯洛特（Saber）'] = { attackMod: (b, me, tgt, n, o) => (!o.attack ? n : tgt.taunt ? n * 2 : n + 2) };
  np['兰斯洛特（Saber）'] = { on: '第一次攻击时', run: (b, me) => { b.extraAttack(me); } };
  ab['高文'] = { prepEnd: (a, u, i) => { if (i === 0) a.perm(u, (u.gold ? 2 : 1), 2 * (u.gold ? 2 : 1)); } };
  np['高文'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, me.gold) };
  ab['莫德雷德（Rider）'] = {
    attackMod: (b, me, tgt, n) => (b.trait(tgt, '王') ? Math.ceil(n * 1.5) : n),
    firstAttack: (b, me) => { const a = has(b, me, '阿尔托莉雅·潘德拉贡（Saber）'); if (a) b.buff(a, 4, 0); },
  };
  np['莫德雷德（Rider）'] = { on: '击杀时', uses: (b, me) => (me.gold ? 2 : 1), run: (b, me) => { b.extraAttack(me); } };
  ab['阿尔托莉雅·潘德拉贡（Saber）'] = { start: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '圆桌骑士')).forEach(u => { b.buff(u, 3, 3); b.shield(u, 3); }) };
  np['阿尔托莉雅·潘德拉贡（Saber）'] = { on: '第一次攻击时', run: (b, me) => { const m = has(b, me, '莫德雷德（Rider）'); if (m) b.extraAttack(m); return { aoe: (me.gold ? 1.5 : 1) * me.npMult }; } };

  // ---------- 罗马 ----------
  ab['斯巴达克斯'] = { hurt: (b, me) => b.perm(me, 0, 1) };
  np['斯巴达克斯'] = { on: '受伤时', run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, me.maxHp - me.hp), { raw: true }); } };
  ab['卡利古拉'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.debuff(t, 2); } };
  np['卡利古拉'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, 2))) };
  ab['盖乌斯·尤利乌斯·恺撒'] = { sell: (a, u) => { const rs = a.board().filter(x => a.tribe(x, '罗马')); a.rng.shuffle(rs).slice(0, 2).forEach(x => a.perm(x, 1, 1)); } };
  np['盖乌斯·尤利乌斯·恺撒'] = { on: '第一次攻击时', run: (b, me, ctx) => {
    for (let i = 0; i < 3; i++) { const t = ctx.target.hp > 0 ? ctx.target : b.pick(b.foes(me)); if (t) b.hit(me, t, b.n(me, Math.ceil(me.atk / 2)), { np: true }); }
    return { skip: true };
  } };
  ab['罗穆路斯'] = { deploy: (a, u) => { const m = a.adjacent(u)[0]; if (m) { a.perm(m, 1, 1); if (!a.tribe(m, '罗马')) m.extraTribes.push('罗马'); } } };
  np['罗穆路斯'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '罗马')).forEach(u => b.buff(u, b.n(me, 2), b.n(me, 2))) };
  ab['洛库斯塔'] = { prepEnd: a => { a.P.ceDiscountNext = 1; } };
  np['洛库斯塔'] = { on: '第一次攻击时', run: (b, me, ctx) => { b.debuff(ctx.target, b.n(me, 3)); } };
  ab['尼禄·克劳狄乌斯（Caster）'] = {
    start: (b, me) => { me.guts++; },
    allyBuy: (a, u, nu) => { if (a.tribe(nu, '罗马')) a.perm(u, 1, 1); },
    guts: (b, me) => { if (has(b, me, '罗穆路斯·奎里努斯')) b.heal(me, Math.ceil(me.maxHp / 2)); },
  };
  np['尼禄·克劳狄乌斯（Caster）'] = { on: '开战时', run: (b, me) => { b.foes(me).forEach(u => b.debuff(u, b.n(me, 2))); b.buff(me, b.n(me, 4), 0); } };
  ab['阿斯特赖亚'] = { attackMod: (b, me, tgt, n) => (tgt.atk > me.atk ? n + 3 : n) };
  np['阿斯特赖亚'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.shield = 0; ctx.target.invul = 0; return { mult: 2 * me.npMult }; } };
  ab['君士坦丁十一世'] = { start: (b, me) => { me.taunt = true; }, deploy: (a, u) => a.board().filter(x => x !== u && a.tribe(x, '罗马')).forEach(x => a.perm(x, 0, 2 * (u.gold ? 2 : 1))) };
  np['君士坦丁十一世'] = { on: '阵亡时', run: (b, me) => b.mates(me).filter(u => b.tribe(u, '罗马')).forEach(u => { u.invul = Math.max(u.invul, 1); b.buff(u, b.n(me, me.gold ? 6 : 3), 0); }) };
  ab['罗穆路斯·奎里努斯'] = {
    prepEnd: (a, u) => { const m = a.adjacent(u).find(x => !a.tribe(x, '罗马')); if (m) m.extraTribes.push('罗马'); },
    start: (b, me) => {
      const n = b.mates(me, true).filter(u => b.tribe(u, '罗马')).length;
      b.buff(me, 3 * n, 3 * n);
      if (has(b, me, '尼禄·克劳狄乌斯（Caster）')) b.mates(me, true).filter(u => b.tribe(u, '罗马')).forEach(u => b.buff(u, 2, 2));
    },
  };
  np['罗穆路斯·奎里努斯'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '罗马')).forEach(u => { const k = me.gold ? 4 : 2; b.buff(u, b.n(me, k), b.n(me, k)); b.shield(u, b.n(me, me.gold ? 6 : 3)); }) };

  // ---------- 希腊 ----------
  ab['伊阿宋'] = {
    start: (b, me) => {
      me.stealth = true;
      const h = has(b, me, '赫拉克勒斯'); if (h) h.guts++;
    },
    deploy: (a, u) => {
      const gs = a.board().filter(x => x !== u && a.tribe(x, '希腊'));
      const t = gs.slice().sort((x, y) => a.atkOf(y) - a.atkOf(x))[0];
      if (t) { const k = Math.min(3, gs.length) * (u.gold ? 2 : 1); a.perm(t, k, k); }
    },
    defendMod: (b, me, src, n) => {
      const h = has(b, me, '赫拉克勒斯');
      if (h && !me.counters.saved && n >= me.hp + me.shield && !me.guts) { me.counters.saved = true; b.log('赫拉克勒斯替伊阿宋挡下致命伤'); b.hit(src, h, n, { raw: true }); return 0; }
      return n;
    },
  };
  np['伊阿宋'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '希腊')).forEach(u => b.buff(u, b.n(me, 2), b.n(me, 2))) };
  ab['亚历山大'] = { start: (b, me) => { me.first = true; if (b.mates(me).some(u => b.tribe(u, '希腊'))) b.buff(me, 1, 2); } };
  np['亚历山大'] = { on: '第一次攻击时', run: (b, me) => { b.extraAttack(me); } };
  const strip = u => { u.shield = 0; u.dodge = 0; u.invul = 0; };
  ab['美狄亚'] = { start: (b, me) => { if (!me.npOn) { const t = b.foes(me)[0]; if (t) strip(t); } } };
  np['美狄亚'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(strip) };
  ab['阿斯克勒庇俄斯'] = { start: (b, me) => { const r = b.right(me); if (r && b.tribe(r, '希腊')) r.guts++; } };
  np['阿斯克勒庇俄斯'] = { on: '友方阵亡时', run: (b, me, ctx) => { const d = ctx.dead; if (d.summon) return; b.summon(me.side, b.alive(b.side(me)).length, { name: d.name, atk: d.atk, hp: 1, tribes: [...d.tribes] }); } };
  ab['阿塔兰忒'] = { allyAttack: (b, me, f, tgt) => { if (f.counters.hero && tgt.hp > 0) b.hit(me, tgt, 2, { raw: true }); } };
  np['阿塔兰忒'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, 3), { raw: true })) };
  ab['喀戎'] = { prepEnd: (a, u) => { const m = a.adjacent(u).find(x => a.tribe(x, '希腊')); if (m) a.perm(m, 1, 1); } };
  np['喀戎'] = { on: '阵亡时', run: (b, me) => { const t = b.maxAtk(b.mates(me).filter(u => b.tribe(u, '希腊'))); if (t) b.perm(t, Math.ceil(me.atk / 2), Math.ceil(me.maxHp / 2)); } };
  ab['赫拉克勒斯'] = { start: (b, me) => { me.guts += 2; } };
  np['赫拉克勒斯'] = { on: '毅力触发时', uses: 2, run: (b, me, ctx) => {
    const list = me.gold ? b.foes(me) : [ctx.src].filter(u => u && u.hp > 0);
    list.forEach(u => b.hit(me, u, b.n(me, me.atk), { raw: true }));
  } };
  ab['阿喀琉斯'] = { start: (b, me) => { me.first = true; me.invul = Math.max(me.invul, 1); } };
  np['阿喀琉斯'] = { on: '第一次攻击时', run: (b, me) => { if (me.gold) b.extraAttack(me); return { mult: 2 * me.npMult, noCounter: true }; } };
  ab['超人俄里翁'] = {
    afterAttack: (b, me) => b.buff(me, 3, 0),
    attackMod: (b, me, tgt, n, o) => (o.attack && me.counters.orion ? Math.ceil(n * 1.5) : n),
  };
  np['超人俄里翁'] = { on: '第一次攻击时', run: (b, me) => { if (me.gold) me.counters.orion = true; return { mult: 2.5 * me.npMult }; } };

  // ---------- 机械 ----------
  const MECH = ['机械'];
  ab['查尔斯·巴贝奇'] = { start: (b, me) => { me.taunt = true; }, death: (b, me) => b.summon(me.side, 0, { name: '蒸汽齿轮', atk: 2, hp: 2, tribes: MECH }) };
  np['查尔斯·巴贝奇'] = { on: '开战时', run: (b, me) => b.summon(me.side, b.alive(b.side(me)).indexOf(me) + 1, { name: '蒸汽机兵', atk: b.n(me, 4), hp: b.n(me, 8), taunt: true, tribes: MECH }) };
  ab['弗兰肯斯坦（Berserker）'] = { afterAttack: (b, me) => { if (me.hp <= 0) return; b.buff(me, 2, 0); me.hp = Math.max(1, me.hp - 1); } };
  np['弗兰肯斯坦（Berserker）'] = { on: '阵亡时', run: (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, Math.ceil(me.atk / 2)), { raw: true })) };
  ab['加藤段藏'] = { start: (b, me) => b.adj(me).filter(u => b.tribe(u, '机械')).forEach(u => { u.dodge = Math.max(u.dodge, 1); }) };
  np['加藤段藏'] = { on: '受伤时', run: (b, me) => { me.stealth = true; b.extraAttack(me); } };
  ab['代达罗斯'] = { prepEnd: (a, u) => a.adjacent(u).filter(x => a.tribe(x, '机械')).forEach(x => a.perm(x, (u.gold ? 2 : 1), (u.gold ? 2 : 1))) };
  np['代达罗斯'] = { on: '开战时', run: (b, me) => { for (let i = 0; i < 2; i++) b.summon(me.side, b.alive(b.side(me)).indexOf(me) + 1, { name: '青铜人偶', atk: b.n(me, 3), hp: b.n(me, 3), tribes: MECH }); } };
  ab['哪吒'] = {
    start: (b, me) => { me.guts++; },
    allyDeath: (b, me, d) => { if (d.tribes.has('机械')) { b.shield(me, 2); const t = b.pick(b.foes(me)); if (t) b.hit(me, t, 3, { raw: true }); } },
  };
  np['哪吒'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, me.gold) };
  ab['果心居士'] = { allyShield: (b, me, f) => { if (f.tribes.has('机械') && (me.counters.k || 0) < 5) { me.counters.k = (me.counters.k || 0) + 1; b.buff(me, 2, 0); } } };
  np['果心居士'] = { on: '开战时', run: (b, me) => { for (let i = 0; i < (me.gold ? 2 : 1); i++) b.summon(me.side, b.alive(b.side(me)).indexOf(me) + 1, { name: '傀儡', atk: b.n(me, 5), hp: b.n(me, 5), tribes: MECH }); } };
  const charge = (b, me) => {
    me.counters.charge = (me.counters.charge || 0) + 1;
    if (me.counters.charge >= 3 && (me.counters.shots || 0) < 3) {
      me.counters.charge = 0; me.counters.shots = (me.counters.shots || 0) + 1;
      const t = b.pick(b.foes(me)); if (t) { b.log(`${me.name} 蓄力炮击`); b.hit(me, t, me.atk, { raw: true }); }
    }
  };
  ab['源为朝'] = {
    allyAttack: (b, me, f) => { if (f.tribes.has('机械')) charge(b, me); },
    allyDeath: (b, me, d) => { if (d.tribes.has('机械')) charge(b, me); },
  };
  np['源为朝'] = { on: '开战时', run: (b, me) => {
    const t = b.maxAtk(b.foes(me)); if (!t) return;
    const dmg = b.n(me, me.gold ? Math.ceil(me.atk * 1.5) : me.atk);
    const over = dmg - (t.hp + t.shield);
    b.hit(me, t, dmg, { raw: true });
    if (me.gold && over > 0) b.adj(t).forEach(u => b.hit(me, u, over, { raw: true }));
  } };
  ab['项羽'] = {
    start: (b, me) => { me.dodge = Math.max(me.dodge, 1); b.shield(me, me.t); },
    // 霸王别姬：虞美人在旁边时，第一次致命伤由她代为承受
    defendMod: (b, me, src, n) => {
      const yu = b.adj(me).find(u => u.key === '虞美人（Assassin）');
      if (yu && !me.counters.yu && n >= me.hp + me.shield && !me.guts && !me.invul) { me.counters.yu = 1; b.log('虞美人替项羽挡下致命伤'); b.hit(src, yu, n, { raw: true }); return 0; }
      return n;
    },
  };
  np['项羽'] = { on: '击杀时', uses: (b, me) => (me.gold ? 3 : 2), run: (b, me) => { b.extraAttack(me); } };
  ab['伽拉忒亚'] = { allyDeath: (b, me, d) => { if (d.tribes.has('机械')) b.buff(me, 3, 3); } };
  np['伽拉忒亚'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: (me.gold ? 1 : 0.5) * me.npMult }) };

  // ---------- 妖精 ----------
  ab['哈贝特洛特（Rider）'] = { deploy: (a, u) => { const r = a.right(u); if (r) a.perm(r, 0, 3 * (u.gold ? 2 : 1)); } };
  np['哈贝特洛特（Rider）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.shield(u, b.n(me, 3))) };
  ab['凯特·库·米可科尔'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.debuff(t, 2); } };
  np['凯特·库·米可科尔'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, 1))) };
  ab['妖精骑士崔斯坦'] = { afterAttack: (b, me, tgt) => { if (tgt.hp > 0) b.debuff(tgt, 1); } };
  np['妖精骑士崔斯坦'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.sealed = true; ctx.target.npSealed = true; b.log(`${ctx.target.name} 的能力被封锁`); } };
  ab['诺克娜蕾·雅兰杜'] = { hurt: (b, me, src) => { if (src && src.hp > 0) b.debuff(src, 2); } };
  np['诺克娜蕾·雅兰杜'] = { on: '阵亡时', run: (b, me, ctx) => b.summon(me.side, ctx.pos, { name: '妖精', atk: b.n(me, 3), hp: b.n(me, 3), tribes: ['妖精'] }) };
  ab['妖精骑士高文'] = {
    start: (b, me) => { me.taunt = true; },
    hurt: (b, me) => { if ((me.counters.g || 0) < 3) { me.counters.g = (me.counters.g || 0) + 1; b.buff(me, 2, 0); } },
  };
  np['妖精骑士高文'] = { on: '受伤时', run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, me.maxHp - me.hp), { raw: true }); } };
  ab['布里托玛特'] = { beforeAttack: (b, me, tgt) => { tgt.dodge = 0; tgt.invul = 0; } };
  np['布里托玛特'] = { on: '第一次攻击时', run: (b, me) => ({ mult: 2 * me.npMult }) };
  ab['雨之魔女梣'] = { prepEnd: (a, u) => { const t = a.board().filter(x => a.tribe(x, '妖精')).sort((x, y) => a.hpOf(x) - a.hpOf(y))[0]; if (t) a.perm(t, 0, 2 * (u.gold ? 2 : 1)); } };
  np['雨之魔女梣'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, me.gold ? 2 : 1))) };
  ab['妖精骑士兰斯洛特'] = { start: (b, me) => { me.first = true; } };
  np['妖精骑士兰斯洛特'] = { on: '第一次攻击时', run: (b, me) => { for (let i = 0; i < (me.gold ? 3 : 2); i++) b.extraAttack(me); } };
  ab['摩根'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.debuff(t, Math.floor(t.atk / 2)); } };
  np['摩根'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => { b.hit(me, u, b.n(me, me.gold ? me.atk : Math.ceil(me.atk / 2)), { raw: true }); b.debuff(u, 2); }) };

  // ---------- 新选组 ----------
  ab['藤堂平助'] = { allyDeath: (b, me, d) => { if (d.tribes.has('新选组')) b.buff(me, 2, 0); } };
  np['藤堂平助'] = { on: '阵亡时', run: (b, me, ctx) => { if (ctx.killer && ctx.killer.hp > 0) b.hit(me, ctx.killer, b.n(me, me.atk), { raw: true }); } };
  ab['原田左之助'] = { start: (b, me) => { me.taunt = true; }, allyKill: (b, me, k) => { if (k.tribes.has('新选组')) b.shield(me, 2); } };
  np['原田左之助'] = { on: '击杀时', run: (b, me) => { b.extraAttack(me); } };
  ab['永仓新八'] = { kill: (b, me) => { if (!me.counters.ng) { me.counters.ng = 1; b.perm(me, 1, 1); } } };
  np['永仓新八'] = { on: '第一次攻击时', run: (b, me) => ({ mult: 2 * me.npMult }) };
  ab['山南敬助'] = { deploy: a => { a.P.shinsenBonus = (a.P.shinsenBonus || 0) + 1; } };
  np['山南敬助'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '新选组')).forEach(u => b.buff(u, b.n(me, 2), 0)) };
  ab['斋藤一'] = {
    start: (b, me) => { me.dodge = Math.max(me.dodge, 1); },
    afterAttack: (b, me) => { if (me.hp > 0 && !me.dodge && (me.counters.sd || 0) < 2) { me.counters.sd = (me.counters.sd || 0) + 1; me.dodge = 1; } },
  };
  np['斋藤一'] = { on: '回避触发时', run: (b, me, ctx) => { for (let i = 0; i < 2; i++) if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, me.atk), { counter: true }); } };
  ab['冲田总司'] = {
    start: (b, me) => { me.first = true; if (!has(b, me, '土方岁三')) b.debuff(me, 0, 3); },
    // 缩地：第一次攻击无视目标集中，打攻击最高的（潜伏的仍然打不到）
    pickTarget: (b, me) => (me.firstAttackDone ? null : b.maxAtk(b.foes(me).filter(u => !u.stealth))),
  };
  np['冲田总司'] = { on: '第一次攻击时', run: (b, me, ctx) => {
    for (let i = 0; i < 3; i++) { const t = ctx.target.hp > 0 ? ctx.target : b.pick(b.foes(me)); if (t) b.hit(me, t, b.n(me, me.atk), { attack: true }); }
    return { skip: true };
  } };
  ab['冲田·J·总司'] = { start: (b, me) => { me.stealth = true; me.counters.ambush = true; }, firstAttack: (b, me) => (me.counters.ambush ? { mult: 2 } : null) };
  np['冲田·J·总司'] = { on: '击杀时', run: (b, me) => { me.stealth = true; b.extraAttack(me); } };
  ab['近藤勇'] = { prepEnd: (a, u) => a.board().filter(x => a.tribe(x, '新选组')).forEach(x => a.perm(x, (u.gold ? 2 : 1), 0)) };
  np['近藤勇'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '新选组')).forEach(u => { u.guts++; if (me.gold) b.buff(u, b.n(me, 2), 0); }) };
  ab['土方岁三'] = {
    start: (b, me) => { me.guts += 2; },
    guts: (b, me) => { b.buff(me, 3, 0); const o = has(b, me, '冲田总司'); if (o) b.extraAttack(o); },
  };
  np['土方岁三'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '新选组')).forEach(u => b.buff(u, b.n(me, me.gold ? 5 : 3), 0)) };

  // ---------- 龙 ----------
  ab['伊丽莎白·巴托里〔万圣节〕'] = { deploy: (a, u) => a.adjacent(u).filter(x => a.tribe(x, '龙')).forEach(x => a.perm(x, (u.gold ? 2 : 1), (u.gold ? 2 : 1))) };
  np['伊丽莎白·巴托里〔万圣节〕'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, 2), { raw: true })) };
  ab['清姬（Lancer）'] = { hurt: (b, me, src) => { if (src && src.hp > 0) b.hit(me, src, 2, { raw: true }); } };
  np['清姬（Lancer）'] = { on: '阵亡时', run: (b, me, ctx) => { if (ctx.killer && ctx.killer.hp > 0) b.hit(me, ctx.killer, b.n(me, me.atk * 2), { raw: true }); } };
  ab['齐格'] = { death: (b, me, k) => b.summon(me.side, 0, { name: '幼龙', atk: Math.ceil(me.atk / 2), hp: Math.ceil(me.maxHp / 2), tribes: ['龙'] }) };
  np['齐格'] = { on: '第一次受伤时', run: (b, me) => b.buff(me, b.n(me, 4), b.n(me, 6)) };
  ab['谜之Alterego·Λ'] = { start: (b, me) => { me.dodge = Math.max(me.dodge, 1); }, dodge: (b, me) => b.buff(me, 3, 0) };
  np['谜之Alterego·Λ'] = { on: '第一次攻击时', run: (b, me) => { b.extraAttack(me); b.extraAttack(me); } };
  ab['弗栗多'] = { prepEnd: (a, u) => a.perm(u, 1, 1) };
  np['弗栗多'] = { on: '开战时', run: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.debuff(t, b.n(me, me.gold ? 6 : 3)); } };
  ab['多布雷尼亚·尼基季奇（Rider）'] = { allySummon: (b, me, s) => { if (s.name === '龙牙兵') b.buff(s, 2, 2); } };
  np['多布雷尼亚·尼基季奇（Rider）'] = { on: '开战时', run: (b, me) => { for (let i = 0; i < (me.gold ? 2 : 1); i++) b.summon(me.side, b.alive(b.side(me)).indexOf(me) + 1, { name: '幼龙', atk: b.n(me, 4), hp: b.n(me, 6), tribes: ['龙'] }); } };
  ab['奥伯龙'] = { allyNP: (b, me) => b.buff(me, 2, 0) };
  np['奥伯龙'] = { on: '开战时', run: (b, me) => b.foes(me).slice().sort((x, y) => y.atk - x.atk).slice(0, me.gold ? 2 : 1).forEach(u => b.stun(u)) };
  ab['伊吹童子（Berserker）'] = { prepEnd: (a, u) => { const n = a.board().filter(x => x !== u && a.tribe(x, '龙')).length; if (n) a.perm(u, n * (u.gold ? 2 : 1), n * (u.gold ? 2 : 1)); } };
  np['伊吹童子（Berserker）'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: (me.gold ? 1.5 : 1) * me.npMult }) };
  ab['堤丰·厄斐墨洛斯'] = { allyDeath: (b, me) => b.buff(me, 2, 2) };
  np['堤丰·厄斐墨洛斯'] = { on: '阵亡时', run: (b, me, ctx) => {
    b.foes(me).forEach(u => b.hit(me, u, b.n(me, me.atk), { raw: true }));
    if (me.gold) b.summon(me.side, ctx.pos, { name: me.name, atk: me.atk, hp: Math.ceil(me.maxHp / 2), tribes: [...me.tribes] });
  } };

  // ---------- 领域外之存在 ----------
  const OUTER = ['领域外之存在'];
  ab['梵高〔矿工〕'] = { death: (b, me) => b.summon(me.side, 0, { name: '向日葵', atk: 2, hp: 2, tribes: OUTER }) };
  np['梵高〔矿工〕'] = { on: '开战时', run: (b, me) => b.summon(me.side, b.alive(b.side(me)).indexOf(me) + 1, { name: '向日葵', atk: b.n(me, 4), hp: b.n(me, 4), tribes: OUTER }) };
  ab['谜之女主角XX'] = { attackMod: (b, me, tgt, n) => (tgt.c === 'Saber' ? n + 3 : n) };
  np['谜之女主角XX'] = { on: '第一次攻击时', run: (b, me) => ({ mult: 2 * me.npMult }) };
  ab['葛饰北斋（Foreigner）'] = { allySummon: (b, me, s) => { if (b.adj(me).includes(s)) b.buff(s, 2, 2); } };
  np['葛饰北斋（Foreigner）'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, 3), { raw: true })) };
  ab['杨贵妃'] = { start: (b, me) => b.adj(me).forEach(u => { u.dodge = Math.max(u.dodge, 1); }) };
  np['杨贵妃'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.shield(u, b.n(me, 4))) };
  ab['BB（泳装）'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t && t.atk > me.atk) me.atk = t.atk; } };
  np['BB（泳装）'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, me.gold ? 4 : 2), b.n(me, me.gold ? 4 : 2))) };
  ab['雅克·德·莫莱（Foreigner）'] = { allyDeath: (b, me, d) => { if (d.summon) b.buff(me, 2, 0); } };
  np['雅克·德·莫莱（Foreigner）'] = { on: '阵亡时', run: (b, me, ctx) => { const k = me.gold ? 5 : 3; for (let i = 0; i < 2; i++) b.summon(me.side, ctx.pos, { name: '眷属', atk: b.n(me, k), hp: b.n(me, k), tribes: OUTER }); } };
  ab['阿比盖尔·威廉姆斯'] = { allySummon: (b, me) => b.buff(me, 2, 2) };
  np['阿比盖尔·威廉姆斯'] = { on: '第一次攻击时', run: (b, me) => { b.foes(me).forEach(u => b.debuff(u, 2)); return { aoe: (me.gold ? 1 : 0.5) * me.npMult }; } };
  ab['暗之高扬斯卡娅'] = { hurt: (b, me) => { if ((me.counters.s || 0) < 3) { me.counters.s = (me.counters.s || 0) + 1; b.summon(me.side, b.alive(b.side(me)).indexOf(me) + 1, { name: '眷属', atk: 2, hp: 2, tribes: OUTER }); } } };
  np['暗之高扬斯卡娅'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '领域外之存在')).forEach(u => b.buff(u, b.n(me, me.gold ? 5 : 3), 0)) };
  ab['苍崎青子'] = {
    start: (b, me) => { me.first = true; },
    attackMod: (b, me, tgt, n, o) => { if (o.attack && !me.counters.aoko && has(b, me, '久远寺有珠')) { me.counters.aoko = 1; return n + 3; } return n; }, // 魔法使之夜
  };
  np['苍崎青子'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: (me.gold ? 1 : 0.5) * me.npMult }) };

  // ---------- 中立 ----------
  ab['阿拉什'] = { death: (b, me) => { const k = me.counters.byChen ? 4 : 2; b.foes(me).forEach(u => b.hit(me, u, k, { raw: true })); } };
  np['阿拉什'] = { on: '第一次攻击时', run: (b, me) => { b.foes(me).forEach(u => b.hit(me, u, b.n(me, 8), { raw: true })); me.hp = 0; me.killer = null; return { skip: true }; } };
  ab['玛修·基列莱特'] = { hurt: (b, me) => b.adj(me).forEach(u => b.shield(u, 1)) };
  np['玛修·基列莱特'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.shield(u, b.n(me, 4))) };
  ab['汉斯·克里斯蒂安·安徒生'] = { prepEnd: (a, u) => { if (a.npOn(u)) return; const t = a.rng.pick(a.board()); if (t) a.perm(t, 1, 1); } };
  np['汉斯·克里斯蒂安·安徒生'] = { on: '回合结束时', run: (a, u) => a.rng.shuffle(a.board()).slice(0, 2).forEach(t => a.perm(t, 1, 1)) };
  const markDragon = (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) { t.traits.add('龙'); b.log(`${t.name} 被标记为〔龙〕`); } return t; };
  ab['乔尔乔斯'] = {
    start: (b, me) => {
      me.taunt = true;
      const s = has(b, me, '齐格飞');
      if (s) { markDragon(b, me); b.shield(s, Math.ceil(me.hp / 2)); }
    },
    hurt: (b, me) => b.shield(me, 1),
  };
  np['乔尔乔斯'] = { on: '开战时', run: (b, me) => { markDragon(b, me); } };
  ab['爱德华·蒂奇'] = { afterWin: a => { a.P.manaBonusNext = Math.max(a.P.manaBonusNext || 0, 1); } };
  np['爱德华·蒂奇'] = { on: '击杀时', run: (b, me) => { const P = b.side(me).P; if (P && !P.ghost) P.manaBonusNext = (P.manaBonusNext || 0) + 1; } };
  ab['陈宫'] = { start: (b, me) => {
    const l = b.left(me);
    if (!l) return;
    const arash = l.key === '阿拉什';
    const k = me.gold || arash ? 3 : 2;
    b.log(`${me.name} 献祭了 ${l.name}`);
    if (arash) l.counters.byChen = true;
    const dmg = l.atk * k;
    b.sacrifice(l, arash); // 献祭默认不触发归座，阿拉什是写明的特例
    b.foes(me).forEach(u => b.hit(me, u, dmg, { raw: true }));
  } };
  np['陈宫'] = { on: '同固有能力', run: () => {} };
  np['莱昂纳多·达·芬奇（Caster）'] = { on: '购买时', run: a => a.refresh() };
  ab['齐格飞'] = {
    attackMod: (b, me, tgt, n) => (b.trait(tgt, '龙') || b.tribe(tgt, '龙') ? n * 2 : n),
    defendMod: (b, me, src, n) => (src && (b.trait(src, '龙') || b.tribe(src, '龙')) ? Math.ceil(n / 2) : n),
  };
  np['齐格飞'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, me.gold) };
  ab['织田信长（Archer）'] = { attackMod: (b, me, tgt, n) => (b.trait(tgt, '神性') || b.trait(tgt, '骑乘') ? Math.ceil(n * 1.5) : n) };
  np['织田信长（Archer）'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, (me.gold ? 6 : 3) * (b.trait(u, '神性') ? 2 : 1)), { raw: true })) };
  ab['卫宫'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.hit(me, t, me.atk, { raw: true }); } };
  np['卫宫'] = { on: '第一次受伤时', run: (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, me.gold ? 6 : 3), { raw: true })) };
  ab['诸葛孔明〔埃尔梅罗Ⅱ世〕'] = { start: (b, me) => b.adj(me).forEach(u => { u.npOn = true; }) };
  np['诸葛孔明〔埃尔梅罗Ⅱ世〕'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, me.gold ? 4 : 2))) };
  ab['恩奇都'] = { start: (b, me) => {
    const t = b.maxAtk(b.foes(me)); if (t) { t.npSealed = true; b.log(`${t.name} 的宝具被天之锁封住`); }
    const g = has(b, me, '吉尔伽美什（Archer）'); if (g && t) b.npAdd(g, 0.5);
  } };
  np['恩奇都'] = { on: '第一次攻击时', run: (b, me, ctx) => ({ mult: (b.trait(ctx.target, '神性') ? (me.gold ? 4 : 3) : (me.gold ? 3 : 2)) * me.npMult }) };
  ab['梅林'] = { prepEnd: (a, u) => a.board().forEach(x => a.perm(x, u.gold ? 1 : 0, 1 * (u.gold ? 2 : 1))) };
  np['梅林'] = { on: '开战时', run: (b, me) => { b.side(me).flags.merlinHeal = b.n(me, me.gold ? 4 : 2); } };
  ab['吉尔伽美什（Archer）'] = { start: (b, me) => { const n = new Set(b.mates(me).filter(u => u.c).map(u => u.c)).size; b.buff(me, 3 * n, 0); } };
  np['吉尔伽美什（Archer）'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: (me.gold ? 1.5 : 1) * me.npMult }) };
  ab['贞德（Ruler）'] = { allyShieldLost: (b, me, u) => { if ((me.counters.j || 0) < 4 && u !== me) { me.counters.j = (me.counters.j || 0) + 1; b.buff(u, 2, 0); b.heal(u, 2); } } };
  np['贞德（Ruler）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => { u.invul = Math.max(u.invul, 1); if (me.gold) b.shield(u, b.n(me, 3)); }) };

  // ========== 扩充：新种族、多版本、中立经济牌和规则牌 ==========
  const g2 = u => (u.gold ? 2 : 1);
  const near = (b, me) => b.alive(b.side(me)).indexOf(me) + 1;
  const capAdd = (me, key, add, cap) => { const c = me.counters[key] || 0; const k = Math.max(0, Math.min(add, cap - c)); me.counters[key] = c + k; return k; };
  // 阵亡时 me 已经离开队列，用 pos 找原来左右两边的人
  const deadAdj = (b, me, pos) => { const l = b.alive(b.side(me)); return [l[pos - 1], l[pos]].filter(Boolean); };
  const mult2 = (b, me) => ({ mult: 2 * me.npMult });
  const aoeHalf = (b, me) => ({ aoe: (me.gold ? 1 : 0.5) * me.npMult });
  const shieldAll = n => (b, me) => b.mates(me, true).forEach(u => b.shield(u, b.n(me, n)));
  const hitAll = n => (b, me) => b.foes(me).forEach(u => b.hit(me, u, b.n(me, typeof n === 'function' ? n(me) : n), { raw: true }));
  const topOf = (a, list) => list.slice().sort((x, y) => a.atkOf(y) - a.atkOf(x))[0];

  // ---------- 圆桌骑士 ----------
  ab['加雷斯（Saber）'] = { start: (b, me) => b.adj(me).filter(u => b.tribe(u, '圆桌骑士')).forEach(u => b.shield(u, 2 * g2(me))) };
  np['加雷斯（Saber）'] = { on: '开战时', run: (b, me) => { me.taunt = true; b.shield(me, b.n(me, 4)); } };
  ab['兰斯洛特（Berserker）'] = {
    hurt: (b, me) => { const k = capAdd(me, 'lb', 2, 10); if (k) b.buff(me, k, 0); },
    death: (b, me) => { const t = b.maxAtk(b.mates(me).filter(u => b.tribe(u, '圆桌骑士'))); if (t) b.perm(t, Math.ceil(me.atk / 2), 0); },
  };
  np['兰斯洛特（Berserker）'] = { on: '第一次攻击时', run: (b, me, ctx) => {
    for (let i = 0; i < 2; i++) { const t = ctx.target.hp > 0 ? ctx.target : b.pick(b.foes(me)); if (t) b.hit(me, t, b.n(me, me.atk), { attack: true }); }
    return { skip: true };
  } };
  ab['莫德雷德（Saber）'] = { attackMod: (b, me, tgt, n, o) => (o.attack ? n + 2 : n), hurt: (b, me) => { if (!me.counters.md) { me.counters.md = 1; b.buff(me, 3, 0); } } };
  np['莫德雷德（Saber）'] = { on: '第一次攻击时', run: (b, me, ctx) => {
    const list = me.gold ? b.foes(me) : [ctx.target, ...b.adj(ctx.target)].filter(Boolean);
    list.forEach(u => b.hit(me, u, b.n(me, Math.ceil(me.atk * 1.5)), { np: true }));
    return { skip: true };
  } };
  ab['阿尔托莉雅·潘德拉贡（Lancer）'] = { prepEnd: a => a.board().filter(x => a.tribe(x, '圆桌骑士')).forEach(x => a.perm(x, 1, 1)) };
  np['阿尔托莉雅·潘德拉贡（Lancer）'] = { on: '开战时', run: hitAll(me => (me.gold ? me.atk : Math.ceil(me.atk / 2))) };

  // ---------- 罗马 ----------
  ab['尼禄·克劳狄乌斯（Saber）'] = { deploy: (a, u) => a.addMana(1 + (a.board().some(x => x !== u && a.tribe(x, '罗马')) ? 1 : 0)) };
  np['尼禄·克劳狄乌斯（Saber）'] = { on: '第一次攻击时', run: mult2 };
  ab['查理曼'] = { prepEnd: a => { const t = a.board().filter(x => a.tribe(x, '罗马')).sort((x, y) => a.atkOf(x) - a.atkOf(y))[0]; if (t) a.perm(t, 2, 0); } };
  np['查理曼'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '罗马')).forEach(u => b.buff(u, b.n(me, 2), 0)) };
  ab['尼禄·克劳狄乌斯〔新娘〕'] = { deploy: (a, u) => a.adjacent(u).filter(x => a.tribe(x, '罗马')).forEach(x => a.perm(x, g2(u), 2 * g2(u))) };
  np['尼禄·克劳狄乌斯〔新娘〕'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.buff(u, b.n(me, me.gold ? 2 : 1), b.n(me, me.gold ? 6 : 3))) };
  ab['阿摩耳〔卡莲〕'] = { prepEnd: a => a.board().filter(x => a.tribe(x, '罗马')).forEach(x => a.perm(x, 1, 1)) };
  np['阿摩耳〔卡莲〕'] = { on: '开战时', run: (b, me) => b.foes(me).slice().sort((x, y) => y.atk - x.atk).slice(0, me.gold ? 3 : 2).forEach(u => b.stun(u)) };

  // ---------- 希腊 ----------
  ab['阿斯忒里俄斯'] = { start: (b, me) => { me.taunt = true; b.adj(me).forEach(u => b.shield(u, 2)); } };
  np['阿斯忒里俄斯'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, 1))) };
  ab['赫克托耳'] = { start: (b, me) => { const list = b.foes(me); const t = list[list.length - 1]; if (t) b.hit(me, t, me.atk, { raw: true }); } };
  np['赫克托耳'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, false) };
  ab['美狄亚〔Lily〕'] = { afterAttack: (b, me) => { const t = b.minHp(b.mates(me, true)); if (t) b.heal(t, 3 * g2(me)); } };
  np['美狄亚〔Lily〕'] = { on: '开战时', run: (b, me) => b.mates(me, true).slice().sort((x, y) => x.hp - y.hp).slice(0, 2).forEach(u => { u.guts++; }) };
  ab['伊斯坎达尔'] = { start: (b, me) => { me.first = true; const n = b.mates(me).filter(u => b.tribe(u, '希腊')).length; b.buff(me, n, n); } };
  np['伊斯坎达尔'] = { on: '开战时', run: (b, me) => {
    const k = (me.gold ? 5 : 3) + (has(b, me, '诸葛孔明〔埃尔梅罗Ⅱ世〕') ? 2 : 0); // 王与臣
    for (let i = 0; i < 3; i++) b.summon(me.side, near(b, me), { name: '马其顿士兵', atk: b.n(me, k), hp: b.n(me, k), tribes: ['希腊'] });
  } };

  // ---------- 机械 ----------
  ab['弗兰肯斯坦（Saber）'] = { death: (b, me) => b.foes(me).forEach(u => b.hit(me, u, 1, { raw: true })) };
  np['弗兰肯斯坦（Saber）'] = { on: '第一次攻击时', run: mult2 };
  ab['机械伊丽亲'] = { start: (b, me) => { me.taunt = true; } };
  np['机械伊丽亲'] = { on: '受伤时', run: hitAll(2) };
  ab['机械伊丽亲Ⅱ号机'] = { fused: (a, u) => a.perm(u, 2 * g2(u), 0) };
  np['机械伊丽亲Ⅱ号机'] = { on: '开战时', run: hitAll(me => (me.gold ? 8 : 4)) };

  // ---------- 妖精 ----------
  ab['哈贝特洛特（Pretender）'] = { sell: a => { const t = a.rng.pick(a.board().filter(x => a.tribe(x, '妖精'))); if (t) a.perm(t, 1, 2); } };
  np['哈贝特洛特（Pretender）'] = { on: '开战时', run: shieldAll(2) };
  ab['UDK－巴格斯特'] = { deploy: (a, u) => {
    const v = a.adjacent(u).find(x => a.tribe(x, '妖精'));
    if (!v) return;
    const at = a.atkOf(v), hp = a.hpOf(v);
    a.sacrifice(v); a.perm(u, at, hp);
    a.log(`${u.key} 吃掉了 ${v.key}`);
  } };
  np['UDK－巴格斯特'] = { on: '第一次攻击时', run: mult2 };
  ab['梅柳齐娜'] = { start: (b, me) => { me.first = true; if (b.maxAtk(b.mates(me, true)) === me) b.buff(me, 4, 4); } };
  np['梅柳齐娜'] = { on: '第一次受伤时', run: (b, me) => b.buff(me, me.atk, 0) };

  // ---------- 新选组 ----------
  ab['冲田总司〔Alter〕（Alterego）'] = { start: (b, me) => { me.first = true; }, kill: (b, me) => { if (!me.counters.ok) { me.counters.ok = 1; b.extraAttack(me); } } };
  np['冲田总司〔Alter〕（Alterego）'] = { on: '第一次攻击时', run: aoeHalf };

  // ---------- 龙 ----------
  ab['清姬（Berserker）'] = { prepEnd: (a, u) => { if (a.adjacent(u).some(x => a.tribe(x, '龙'))) a.perm(u, 1, 1); } };
  np['清姬（Berserker）'] = { on: '阵亡时', run: (b, me, ctx) => { if (ctx.killer && ctx.killer.hp > 0) b.hit(me, ctx.killer, b.n(me, me.atk * 2), { raw: true }); } };
  ab['齐格鲁德'] = {
    attackMod: (b, me, tgt, n) => (b.trait(tgt, '龙') || b.tribe(tgt, '龙') ? n * 2 : n),
    start: (b, me) => b.shield(me, 2 * b.mates(me, true).filter(u => b.tribe(u, '龙')).length),
  };
  np['齐格鲁德'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.shield = 0; return { mult: (me.gold ? 3 : 2) * me.npMult }; } };

  // ---------- 领域外之存在 ----------
  ab['谜之偶像X〔Alter〕'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (!t) return; const before = t.atk; b.debuff(t, 2); b.buff(me, before - t.atk, 0); } };
  np['谜之偶像X〔Alter〕'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, 1))) };
  ab['阿比盖尔·威廉姆斯〔圣诞〕'] = { prepEnd: a => { const t = a.rng.pick(a.board().filter(x => a.tribe(x, '领域外之存在'))); if (t) a.perm(t, 1, 1); } };
  np['阿比盖尔·威廉姆斯〔圣诞〕'] = { on: '开战时', run: (b, me) => b.summon(me.side, near(b, me), { name: '眷属', atk: b.n(me, 2), hp: b.n(me, 2), tribes: OUTER }) };
  ab['梵高'] = { allySummon: (b, me, s) => b.buff(s, 1, 2) };
  np['梵高'] = { on: '开战时', run: (b, me) => { const k = me.gold ? 8 : 4; for (let i = 0; i < 2; i++) b.summon(me.side, near(b, me), { name: '向日葵', atk: b.n(me, k), hp: b.n(me, k), tribes: OUTER }); } };
  ab['阿比盖尔·威廉姆斯〔夏〕'] = { allyDeath: (b, me, d) => { if (d.summon) b.buff(me, 3, 0); } };
  np['阿比盖尔·威廉姆斯〔夏〕'] = { on: '第一次攻击时', run: aoeHalf };

  // ---------- 鬼 ----------
  ab['茨木童子（Berserker）'] = { deploy: (a, u) => { a.devour(u, { which: 'left' }); } };
  np['茨木童子（Berserker）'] = { on: '第一次攻击时', run: (b, me, ctx) => { b.adj(ctx.target).forEach(u => b.hit(me, u, b.n(me, 2), { raw: true })); return { mult: 2 * me.npMult }; } };
  ab['巴御前'] = { allyDevour: (a, u) => a.perm(u, 1, 1) };
  np['巴御前'] = { on: '开战时', run: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.hit(me, t, b.n(me, 4), { raw: true }); } };
  ab['铃鹿御前'] = { deploy: (a, u) => { const ks = a.devour(u); if (ks.some(k => a.card(k).t >= 3)) a.addMana(1); } };
  np['铃鹿御前'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, false) };
  ab['鬼一法眼'] = {
    start: (b, me) => { me.dodge = Math.max(me.dodge, 1); },
    sell: (a, u) => { const t = topOf(a, a.board().filter(x => a.tribe(x, '鬼'))); if (t) a.perm(t, Math.ceil(a.atkOf(u) / 2), Math.ceil(a.hpOf(u) / 2)); },
  };
  np['鬼一法眼'] = { on: '回避触发时', run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, me.atk * 2), { counter: true }); } };
  ab['茨木童子（Lancer）'] = { sell: (a, u) => { const t = topOf(a, a.board().filter(x => a.tribe(x, '鬼'))); if (t) a.devour(u, { to: t }); } };
  np['茨木童子（Lancer）'] = { on: '开战时', run: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.hit(me, t, b.n(me, 5), { raw: true }); } };
  ab['酒吞童子（Assassin）'] = {
    prepEnd: (a, u) => { if (u.caps.shutenRound === a.G.round) return; u.caps.shutenRound = a.G.round; a.devour(u); },
    // 大江山：茨木童子（Berserker）每次吞噬，酒吞童子也获得一半
    allyDevour: (a, u, dv, ga, gh) => { if (dv.key === '茨木童子（Berserker）') a.perm(u, Math.ceil(ga / 2), Math.ceil(gh / 2)); },
  };
  np['酒吞童子（Assassin）'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, 2))) };
  ab['鬼女红叶'] = { start: (b, me) => { me.taunt = true; }, allyDevour: (a, u) => a.perm(u, 0, 2) };
  np['鬼女红叶'] = { on: '受伤时', uses: 2, run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, 3), { raw: true }); } };
  ab['红阎魔（Saber）'] = { deploy: (a, u) => { a.devour(u, { count: 2 }); a.refresh(); } };
  np['红阎魔（Saber）'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.guts = 0; ctx.target.invul = 0; return { mult: (me.gold ? 3 : 2) * me.npMult }; } };
  ab['酒吞童子（Caster）'] = { prepEnd: a => { const t = a.rng.pick(a.board().filter(x => a.tribe(x, '鬼'))); if (t) a.perm(t, 2, 2); } };
  np['酒吞童子（Caster）'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, '鬼')).forEach(u => b.buff(u, b.n(me, me.gold ? 6 : 3), 0)) };
  ab['源赖光／丑御前'] = { allyDevour: (a, u, dv, ga, gh) => a.perm(u, ga, gh) };
  np['源赖光／丑御前'] = { on: '开战时', run: hitAll(me => (me.gold ? 6 : 3)) };
  ab['伊吹童子（Saber）'] = { deploy: (a, u) => { a.devour(u, { count: 2 }); } };
  np['伊吹童子（Saber）'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: (me.gold ? 1.5 : 1) * me.npMult }) };
  ab['芦屋道满'] = { start: (b, me) => { const l = b.left(me); if (!l) return; b.buff(me, l.atk, l.hp); b.log(`${me.name} 献祭了 ${l.name}`); b.sacrifice(l); } };
  np['芦屋道满'] = { on: '第一次攻击时', run: (b, me) => { b.foes(me).forEach(u => b.debuff(u, 2)); return aoeHalf(b, me); } };

  // ---------- 中华 ----------
  const zh = (a, x) => !!x && a.tribe(x, '中华');
  const bothZh = (a, u) => zh(a, a.left(u)) && zh(a, a.right(u));
  ab['荆轲'] = {
    start: (b, me) => { me.stealth = true; },
    attackMod: (b, me, tgt, n) => n * (tgt.t >= 5 && !tgt.summon ? 2 : 1) * (tgt.key === '始皇帝' ? 3 : 1), // 图穷匕见
  };
  np['荆轲'] = { on: '第一次攻击时', run: (b, me, ctx) => { b.hit(me, ctx.target, b.n(me, me.atk * 3), { attack: true }); me.hp = 0; me.killer = null; return { skip: true }; } };
  ab['赤兔马'] = { start: (b, me) => { me.first = true; }, prepEnd: (a, u) => { const l = a.left(u); if (zh(a, l)) a.perm(l, 1, 0); } };
  np['赤兔马'] = { on: '第一次攻击时', run: (b, me) => { b.extraAttack(me); } };
  ab['吕布奉先'] = {
    start: (b, me) => { const l = b.left(me); if (l && l.key === '赤兔马') { me.first = true; me.counters.sekito = true; } }, // 人中吕布，马中赤兔
    firstAttack: (b, me) => { if (me.counters.sekito) b.extraAttack(me); },
    afterAttack: (b, me) => { if (!me.counters.lb) { me.counters.lb = 1; b.buff(me, 3, 0); } },
  };
  np['吕布奉先'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, false) };
  ab['张角'] = { prepEnd: (a, u) => a.adjacent(u).filter(x => zh(a, x)).forEach(x => a.perm(x, 0, 2)) };
  np['张角'] = { on: '开战时', run: (b, me) => b.summon(me.side, near(b, me), { name: '黄巾力士', atk: b.n(me, 3), hp: b.n(me, 3), tribes: ['中华'] }) };
  ab['秦良玉'] = { start: (b, me) => { me.taunt = true; b.adj(me).filter(u => b.tribe(u, '中华')).forEach(u => { u.counters.dmgReduce = 1; }); } };
  np['秦良玉'] = { on: '开战时', run: (b, me) => b.adj(me).forEach(u => b.shield(u, b.n(me, 4))) };
  ab['虞美人（Lancer）'] = { death: (b, me, k, pos) => { b.foes(me).forEach(u => b.hit(me, u, 2, { raw: true })); deadAdj(b, me, pos).filter(u => b.tribe(u, '中华')).forEach(u => b.perm(u, 1, 0)); } };
  np['虞美人（Lancer）'] = { on: '受伤时', uses: 2, run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, 3), { raw: true }); } };
  ab['李书文（Lancer）'] = { attackMod: (b, me, tgt, n, o) => (o.attack ? n + 2 : n), prepEnd: (a, u) => { if (bothZh(a, u)) a.perm(u, 2, 0); } };
  np['李书文（Lancer）'] = { on: '第一次攻击时', run: (b, me, ctx) => { strip(ctx.target); return { mult: 2 * me.npMult }; } };
  ab['虞美人（Assassin）'] = { start: (b, me) => { me.guts++; }, death: (b, me, k, pos) => deadAdj(b, me, pos).filter(u => b.tribe(u, '中华')).forEach(u => b.perm(u, 1, 1)) };
  np['虞美人（Assassin）'] = { on: '受伤时', uses: 2, run: hitAll(2) };
  ab['黄飞虎'] = { start: (b, me) => { me.first = true; b.adj(me).filter(u => b.tribe(u, '中华')).forEach(u => b.buff(u, 2, 0)); } };
  np['黄飞虎'] = { on: '第一次攻击时', run: mult2 };
  const zhPairs = a => { const B = a.board(); let n = 0; for (let i = 0; i + 1 < B.length; i++) if (zh(a, B[i]) && zh(a, B[i + 1])) n++; return n; };
  ab['武则天'] = { prepEnd: a => { for (let i = zhPairs(a); i > 0; i--) { const t = a.rng.pick(a.board().filter(x => zh(a, x))); if (t) a.perm(t, 1, 1); } } };
  np['武则天'] = { on: '开战时', run: (b, me) => { b.foes(me).forEach(u => b.debuff(u, b.n(me, me.gold ? 2 : 1))); const t = b.minHp(b.foes(me)); if (t) b.stun(t); } };
  ab['李书文（Assassin）'] = { start: (b, me) => { me.stealth = true; }, prepEnd: (a, u) => { if (bothZh(a, u)) a.perm(u, 2, 0); } };
  np['李书文（Assassin）'] = { on: '第一次攻击时', run: (b, me) => ({ mult: 3 * me.npMult }) };
  ab['始皇帝'] = { start: (b, me) => { const n = b.mates(me, true).filter(u => b.tribe(u, '中华')).length; b.buff(me, 2 * n, 2 * n); } };
  np['始皇帝'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => { const k = (b.tribe(u, '中华') ? 4 : 2) * (me.gold ? 2 : 1); b.buff(u, b.n(me, k), b.n(me, k)); }) };
  ab['太公望'] = { prepEnd: a => { const B = a.board(); for (let i = 0; i + 1 < B.length; i++) if (zh(a, B[i]) && zh(a, B[i + 1])) { a.perm(B[i], 1, 0); a.perm(B[i + 1], 1, 0); } } };
  np['太公望'] = { on: '开战时', run: (b, me) => b.foes(me).slice().sort((x, y) => y.atk - x.atk).slice(0, 2).forEach(u => b.stun(u)) };

  // ---------- Saber脸 ----------
  const face = (a, x) => !!x && a.tribe(x, 'Saber脸');
  ab['阿尔托莉雅·潘德拉贡〔Lily〕'] = { deploy: (a, u) => { if (a.board().some(x => x !== u && face(a, x))) a.perm(u, g2(u), 2 * g2(u)); } };
  np['阿尔托莉雅·潘德拉贡〔Lily〕'] = { on: '第一次攻击时', run: mult2 };
  ab['谜之女主角X'] = {
    start: (b, me) => { me.stealth = true; },
    attackMod: (b, me, tgt, n) => (tgt.c === 'Saber' || (b.cardOf(tgt) && b.cardOf(tgt).r.includes('Saber脸')) ? n * 2 : n),
  };
  np['谜之女主角X'] = { on: '第一次攻击时', run: mult2 };
  ab['贞德·Alter·Santa·Lily'] = { start: (b, me) => b.adj(me).filter(u => b.tribe(u, 'Saber脸')).forEach(u => b.shield(u, 2)) };
  np['贞德·Alter·Santa·Lily'] = { on: '开战时', run: shieldAll(3) };
  ab['拉克什米·芭伊'] = { deploy: a => a.refreshWith(c => c.r.includes('Saber脸')) };
  np['拉克什米·芭伊'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.dodge = 0; return { mult: 2 * me.npMult }; } };
  ab['阿尔托莉雅·潘德拉贡〔圣诞Alter〕'] = { prepEnd: a => { const t = a.rng.pick(a.board().filter(x => face(a, x))); if (t) a.perm(t, 1, 1); } };
  np['阿尔托莉雅·潘德拉贡〔圣诞Alter〕'] = { on: '开战时', run: (b, me) => b.mates(me, true).filter(u => b.tribe(u, 'Saber脸')).forEach(u => b.buff(u, b.n(me, 2), 0)) };
  ab['贞德（Archer）'] = { afterAttack: (b, me, tgt) => b.adj(tgt).forEach(u => b.hit(me, u, 1, { raw: true })) };
  np['贞德（Archer）'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, false) };
  ab['贞德〔Alter〕（Avenger）'] = {
    allyDeath: (b, me, d) => { if (d.tribes.has('Saber脸')) b.buff(me, 2, 2); },
    start: (b, me) => { if (has(b, me, '贞德（Ruler）')) me.invul = Math.max(me.invul, 1); }, // 黑与白
  };
  np['贞德〔Alter〕（Avenger）'] = { on: '开战时', run: hitAll(3) };
  ab['冲田总司〔Alter〕（Saber）'] = { start: (b, me) => { me.first = true; }, beforeAttack: (b, me, tgt) => { tgt.dodge = 0; tgt.invul = 0; } };
  np['冲田总司〔Alter〕（Saber）'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: 0.5 * me.npMult }) };
  ab['阿尔托莉雅·潘德拉贡（Archer）'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.hit(me, t, 3, { raw: true }); } };
  np['阿尔托莉雅·潘德拉贡（Archer）'] = { on: '开战时', run: hitAll(3) };
  ab['阿尔托莉雅·潘德拉贡〔Alter〕（Saber）'] = { attackMod: (b, me, tgt, n, o) => (o.attack ? n + 3 : n) };
  np['阿尔托莉雅·潘德拉贡〔Alter〕（Saber）'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, me.gold) };
  ab['谜之女主角X〔Alter〕'] = { attackMod: (b, me, tgt, n) => (tgt.c === 'Saber' ? n + 4 : n) };
  np['谜之女主角X〔Alter〕'] = { on: '第一次攻击时', run: (b, me) => ({ mult: (me.gold ? 3 : 2) * me.npMult }) };
  ab['阿尔托莉雅·卡斯特（Caster）'] = { start: (b, me) => b.mates(me, true).filter(u => b.tribe(u, 'Saber脸')).forEach(u => b.buff(u, 3, 0)) };
  np['阿尔托莉雅·卡斯特（Caster）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => { u.invul = Math.max(u.invul, 1); if (me.gold) b.buff(u, b.n(me, 3), 0); }) };

  // ---------- 樱系列 ----------
  // absorb：【吸收】获得对方攻体的几分之一（核心在击杀时结算）；absorbed：吸收之后
  ab['Kazuradrop'] = { absorb: 4, absorbed: (b, me, ga, gh) => b.adj(me).filter(u => b.tribe(u, '樱系列')).forEach(u => b.perm(u, ga, gh)) };
  np['Kazuradrop'] = { on: '第一次攻击时', run: mult2 };
  ab['帕尔瓦蒂'] = { prepEnd: (a, u) => a.adjacent(u).filter(x => a.tribe(x, '樱系列')).forEach(x => a.perm(x, 0, 2)) };
  np['帕尔瓦蒂'] = { on: '开战时', run: shieldAll(3) };
  ab['BB（原版）'] = { deploy: a => a.refreshWith(c => c.r.includes('樱系列')) };
  np['BB（原版）'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, 1), b.n(me, 1))) };
  ab['Passionlip（Alterego）'] = { absorb: 4, start: (b, me) => { me.taunt = true; }, hurt: (b, me, src) => { if (src && src.hp > 0) b.hit(me, src, 2, { raw: true }); } };
  np['Passionlip（Alterego）'] = { on: '受伤时', run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, me.atk), { raw: true }); } };
  ab['迦摩（Assassin）'] = { absorb: 4, start: (b, me) => { me.stealth = true; }, firstAttack: (b, me, tgt) => { b.stun(tgt); b.log(`${tgt.name} 被魅惑了`); } };
  np['迦摩（Assassin）'] = { on: '第一次攻击时', run: (b, me) => { b.foes(me).forEach(u => { b.hit(me, u, b.n(me, 2), { raw: true }); b.debuff(u, 1); }); } };
  ab['Meltryllis'] = { absorb: 2, afterAttack: (b, me, tgt) => { const k = me.counters.melt ? 2 : 1; if (tgt.hp > 0) { b.debuff(tgt, k); b.buff(me, k, 0); } } };
  np['Meltryllis'] = { on: '第一次攻击时', run: (b, me) => { if (me.gold) me.counters.melt = true; return { mult: 2 * me.npMult }; } };
  ab['杀生院祈荒（Alterego）'] = { prepEnd: (a, u) => {
    const v = a.adjacent(u).find(x => !a.tribe(x, '樱系列') && (a.atkOf(x) > 1 || a.hpOf(x) > 1));
    if (!v) return;
    if (a.atkOf(v) > 1) v.permAtk -= 1;
    if (a.hpOf(v) > 1) v.permHp -= 1;
    a.perm(u, 2, 2);
  } };
  np['杀生院祈荒（Alterego）'] = { on: '开战时', run: (b, me) => b.foes(me).forEach(u => b.debuff(u, b.n(me, me.gold ? 2 : 1), b.n(me, me.gold ? 2 : 1))) };
  ab['Passionlip（Saber）'] = { absorb: 4, kill: (b, me) => { if (!me.counters.lipx) { me.counters.lipx = 1; b.extraAttack(me); } } };
  np['Passionlip（Saber）'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, me.gold) };
  ab['Kingprotea（Alterego）'] = { prepEnd: (a, u) => a.perm(u, 1, 2) };
  np['Kingprotea（Alterego）'] = { on: '开战时', run: (b, me) => { me.taunt = true; b.buff(me, 0, b.n(me, me.gold ? 20 : 10)); } };
  ab['Kingprotea·Alter'] = { absorb: 4, kill: (b, me) => b.buff(me, 3, 0) };
  np['Kingprotea·Alter'] = { on: '第一次攻击时', run: (b, me, ctx) => sweep(b, me, ctx.target, me.gold) };
  ab['Kingprotea（MoonCancer）'] = { prepEnd: (a, u) => [u, ...a.adjacent(u).filter(x => a.tribe(x, '樱系列'))].forEach(x => a.perm(x, 0, 2)) };
  np['Kingprotea（MoonCancer）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.buff(u, 0, b.n(me, me.gold ? 12 : 6))) };
  ab['BB迪拜'] = { start: (b, me) => { const n = Math.min(3, b.mates(me).filter(u => b.tribe(u, '樱系列')).length); b.foes(me).forEach(u => b.debuff(u, 2 + n)); } };
  np['BB迪拜'] = { on: '第一次攻击时', run: (b, me) => ({ aoe: (me.gold ? 1.5 : 1) * me.npMult }) };

  // ---------- 平行世界 ----------
  // allyCE：友方使用概念礼装后（准备阶段）；静希草十郎和久远寺有珠的礼装加成在核心里
  ab['克洛伊·冯·爱因兹贝伦（Archer）'] = { allyCE: (a, u) => a.perm(u, 1, 0) };
  np['克洛伊·冯·爱因兹贝伦（Archer）'] = { on: '第一次攻击时', run: (b, me) => { b.extraAttack(me); } };
  ab['美游·艾德费尔特（Caster）'] = { deploy: a => { a.giveCE(a.randomCE(1)); } };
  np['美游·艾德费尔特（Caster）'] = { on: '开战时', run: shieldAll(3) };
  ab['浅上藤乃'] = { start: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.debuff(t, 0, 3); } };
  np['浅上藤乃'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.shield = 0; return { mult: 2 * me.npMult }; } };
  ab['静希草十郎'] = {};
  np['静希草十郎'] = { on: '受伤时', uses: 2, run: (b, me) => b.buff(me, b.n(me, 3), 0) };
  ab['伊莉雅丝菲尔·冯·爱因兹贝伦（Archer）'] = { start: (b, me) => { const P = b.side(me).P; const n = (P && P.ceUsedRound) || 0; if (n) b.buff(me, 2 * n, 0); } };
  np['伊莉雅丝菲尔·冯·爱因兹贝伦（Archer）'] = { on: '开战时', run: (b, me) => { const t = b.maxAtk(b.foes(me)); if (t) b.hit(me, t, b.n(me, 5), { raw: true }); } };
  ab['美游·艾德费尔特（Lancer）'] = { sell: a => { a.giveCE(a.randomCE()); } };
  np['美游·艾德费尔特（Lancer）'] = { on: '第一次攻击时', run: mult2 };
  ab['伊莉雅丝菲尔·冯·爱因兹贝伦（Caster）'] = { prepEnd: (a, u) => { if (a.P.ceUsedRound > 0 && u.caps.illyaRound !== a.G.round) { u.caps.illyaRound = a.G.round; a.giveCE(a.randomCE()); } } };
  np['伊莉雅丝菲尔·冯·爱因兹贝伦（Caster）'] = { on: '开战时', run: hitAll(3) };
  ab['马纳南·麦克·利尔〔巴泽特〕'] = { defendMod: (b, me, src, n, o) => {
    if (o.attack && !me.counters.frag && src && src.hp > 0) { me.counters.frag = 1; b.log(`${me.name} 后发制人`); b.hit(me, src, me.atk, { raw: true }); if (src.hp <= 0) return 0; }
    return n;
  } };
  np['马纳南·麦克·利尔〔巴泽特〕'] = { on: '受伤时', run: (b, me, ctx) => { if (ctx.src && ctx.src.hp > 0) b.hit(me, ctx.src, b.n(me, me.maxHp - me.hp), { raw: true }); } };
  ab['两仪式（Assassin）'] = { start: (b, me) => { me.stealth = true; }, beforeAttack: (b, me, tgt) => { tgt.guts = 0; } };
  np['两仪式（Assassin）'] = { on: '第一次攻击时', run: (b, me, ctx) => { ctx.target.noRattle = true; return { mult: 2 * me.npMult }; } };
  ab['谜之代行者C.I.E.L'] = { kill: () => ({ suppress: true }) };
  np['谜之代行者C.I.E.L'] = { on: '第一次攻击时', run: (b, me, ctx) => {
    const list = [ctx.target, ...b.adj(ctx.target)].filter(Boolean);
    if (me.gold) list.forEach(u => { u.sealed = true; u.npSealed = true; });
    list.forEach(u => b.hit(me, u, b.n(me, me.atk), { np: true }));
    return { skip: true };
  } };
  ab['克洛伊·冯·爱因兹贝伦（Avenger）'] = { allyCE: (a, u) => a.perm(u, 1, 0) };
  np['克洛伊·冯·爱因兹贝伦（Avenger）'] = { on: '第一次攻击时', run: (b, me) => { for (let i = 0; i < (me.gold ? 3 : 2); i++) b.extraAttack(me); } };
  ab['久远寺有珠'] = {};
  np['久远寺有珠'] = { on: '开战时', run: (b, me) => {
    const k = (me.gold ? 8 : 4) + (has(b, me, '苍崎青子') ? 2 : 0); // 魔法使之夜
    for (let i = 0; i < 2; i++) b.summon(me.side, near(b, me), { name: '驹鸟', atk: b.n(me, k), hp: b.n(me, k), tribes: ['平行世界'] });
  } };
  ab['两仪式（Saber）'] = { beforeAttack: (b, me, tgt) => { tgt.guts = 0; tgt.invul = 0; }, allyCE: (a, u) => a.perm(u, 1, 1) };
  np['两仪式（Saber）'] = { on: '第一次攻击时', run: (b, me) => {
    b.foes(me).forEach(u => b.hit(me, u, b.n(me, Math.ceil(me.atk * (me.gold ? 1.5 : 1))), { pierce: true, np: true }));
    return { skip: true };
  } };

  // ---------- 中立：经济牌 ----------
  ab['巴沙洛缪·罗伯茨'] = { deploy: a => a.addMana(1) };
  np['巴沙洛缪·罗伯茨'] = { on: '击杀时', run: (b, me) => {
    const P = b.side(me).P;
    if (P && !P.ghost && !me.counters.bx && (P.nextManaTotal || 0) < 5) { me.counters.bx = 1; P.nextManaTotal = (P.nextManaTotal || 0) + 1; P.manaBonusNext = (P.manaBonusNext || 0) + 1; }
  } };
  ab['弗朗西斯·德雷克'] = { sell: () => ({ refund: 3 }) };
  np['弗朗西斯·德雷克'] = { on: '第一次攻击时', run: (b, me) => { b.extraAttack(me); } };
  ab['梅菲斯托费勒斯'] = { sell: a => { const t = a.rng.pick(a.board()); if (t) a.perm(t, 2, 1); } };
  np['梅菲斯托费勒斯'] = { on: '阵亡时', run: hitAll(3) };
  ab['吉尔伽美什（Caster）'] = { deploy: a => a.addMana(2) };
  np['吉尔伽美什（Caster）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.buff(u, b.n(me, 2), 0)) };
  ab['安妮·伯妮＆玛莉·瑞德（Rider）'] = { deploy: a => { a.P.discountBuys = (a.P.discountBuys || 0) + 2; } };
  np['安妮·伯妮＆玛莉·瑞德（Rider）'] = { on: '第一次攻击时', run: mult2 };
  ab['托马斯·爱迪生'] = { prepEnd: a => a.addNextMana(1) };
  np['托马斯·爱迪生'] = { on: '开战时', run: shieldAll(4) };

  // ---------- 中立：高阶规则牌（放大效果在核心里） ----------
  ab['威廉·莎士比亚'] = {};
  np['威廉·莎士比亚'] = { on: '开战时', run: (b, me) => { const t = b.maxAtk(b.mates(me, true)); if (t) b.buff(t, b.n(me, 4), 0); } };
  ab['埃列什基伽勒（Lancer）'] = {};
  np['埃列什基伽勒（Lancer）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.buff(u, 0, b.n(me, 4))) };
  ab['斯卡哈·斯卡蒂（Caster）'] = { prepEnd: a => {
    const used = new Set();
    a.G.open.forEach(t => { const c = a.rng.pick(a.board().filter(x => a.tribe(x, t) && !used.has(x))); if (c) { used.add(c); a.perm(c, 1, 1); } });
  } };
  np['斯卡哈·斯卡蒂（Caster）'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => b.buff(u, b.n(me, me.gold ? 6 : 3), 0)) };
  ab['阿维斯布隆'] = {};
  np['阿维斯布隆'] = { on: '开战时', run: (b, me) => { const k = me.gold ? 16 : 8; b.summon(me.side, near(b, me), { name: '魔像·阿当', atk: b.n(me, k), hp: b.n(me, k), taunt: true }); } };
  ab['玉藻前（Caster）'] = {};
  np['玉藻前（Caster）'] = { on: '开战时', run: shieldAll(5) };
  ab['爱丽丝菲尔〔天之衣〕'] = { deploy: (a, u) => {
    const t = a.board().filter(x => x !== u && !x.gold && (u.gold || x.t <= 4)).sort((x, y) => y.t - x.t || a.atkOf(y) - a.atkOf(x))[0];
    if (t) a.gild(t);
  } };
  np['爱丽丝菲尔〔天之衣〕'] = { on: '开战时', run: (b, me) => b.mates(me, true).forEach(u => { u.guts++; }) };

  // 和卡面不完全一致的地方，测试版先这样
  const SIMPLIFIED = [
    '阿斯克勒庇俄斯的复活：以 1 体力召唤一个同名召唤物，没有原来的能力。',
    '堤丰金卡的复活：同上，召唤一个一半体力的召唤物。',
    '美狄亚只清除护盾、回避和无敌，攻击类的本场增益不清除。',
    '诸葛孔明临时解锁的是他相邻的友方；在他左边、已经结算过开战时的宝具不会补发。',
    '清姬「被攻击时」按「受伤时」处理，所以护盾挡住的攻击不反伤。',
    '「回合结束时」和「准备阶段结束时」视为同一时刻。',
    '中华 4 名的「永久加成分一半给相邻」只在准备阶段生效，交战中的永久成长不传。',
    '灵基融合不触发被融合者自己的现界和固有能力，只合并攻体和目标集中。',
    '献祭（陈宫、芦屋道满、UDK－巴格斯特）不触发被献祭者的归座；陈宫献祭阿拉什是特例。',
    '概念礼装和吞噬只用基础攻体计算，不看本场增益。',
  ];
  const IMPL = { ab, np, SIMPLIFIED };
  if (typeof module !== 'undefined' && module.exports) module.exports = IMPL;
  else root.ChessImpl = IMPL;
})(typeof window !== 'undefined' ? window : globalThis);
