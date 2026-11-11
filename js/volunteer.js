// ボランティアの画面。文字は textContent だけで入れる。データは、名簿に載った人にだけGASが返す。
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var app = document.getElementById('app');
  function card(it) {
    var d = h('article', { class: 'item' });
    if (it.attendance) d.appendChild(h('p', {}, [h('span', { class: 'badge', text: it.attendance })]));   // 参加区分(全員/希望者のみ/リーダーのみ)
    var when = it.dateText || it.date;
    if (when) d.appendChild(h('time', { text: when }));
    d.appendChild(h('h3', { text: it.title }));
    if (it.place) d.appendChild(h('p', { text: '場所: ' + it.place }));
    var box = d;   // 折りたたむときは、本文・写真・リンクを「くわしく見る」の中に
    if (it.fold === true) box = h('details', { class: 'item-more' }, [h('summary', { text: 'くわしく見る' })]);
    if (it.summary) box.appendChild(h('p', { text: it.summary }));
    (Array.isArray(it.images) ? it.images : []).slice(0, 6).forEach(function (im) {   // 写真・資料(サイトの img/up・files/up の中のものだけ)
      var src = /^img\/up\/[A-Za-z0-9_.-]+$/.test(String(im && im.src || '')) ? String(im.src) : '';
      var pdf = /^files\/up\/[A-Za-z0-9_.-]+\.pdf$/.test(String(im && im.pdf || '')) ? String(im.pdf) : '';
      if (src) { var a1 = h('a', { href: pdf || src, target: '_blank', rel: 'noopener noreferrer' }, [h('img', { src: src, alt: String(im.alt || ''), loading: 'lazy', style: 'max-width:100%;height:auto;border-radius:8px' })]); box.appendChild(h('p', {}, [a1])); }
      if (pdf) box.appendChild(h('p', {}, [h('a', { href: pdf, target: '_blank', rel: 'noopener noreferrer', text: '資料(PDF)を開く' })]));
    });
    if (it.url && /^https:\/\//.test(it.url)) {
      var a = h('a', { text: '詳しく見る', href: it.url, target: '_blank', rel: 'noopener noreferrer' });
      box.appendChild(h('p', {}, [a]));
    }
    if (box !== d) d.appendChild(box);
    if (it.progress) {   // 依頼などの対応状況(管理者が書く)
      d.appendChild(h('p', {}, [h('span', { class: 'badge' + (it.progress === 'done' ? '' : ' warn'), text: ({ open: 'これから', doing: '対応中', done: '対応済み' })[it.progress] || '対応中' })].concat(it.due && it.progress !== 'done' ? [' 締切: ' + it.due] : [])));
      if (it.progressNote) d.appendChild(h('p', { text: '対応メモ: ' + it.progressNote }));
    }
    return d;
  }
  function taskCard(t) {
    var d = h('div', { class: 'item' }, [h('p', { text: t.title + (t.due ? '(期限: ' + t.due + ')' : '') })]);
    if (t.status === 'doing') d.appendChild(h('p', {}, [h('span', { class: 'badge warn', text: '対応中' })]));
    if (t.status === 'done') d.appendChild(h('p', {}, [h('span', { class: 'badge', text: '済' })]));
    if (t.note) d.appendChild(h('p', { text: '対応メモ: ' + t.note }));
    return d;
  }
  // 当日の参加メンバーの表(日ごとの午前・午後)。○ 参加 / △ 未定 / − 不参加 / 空 = まだ聞いていない
  var MARK = { yes: ['○', '参加'], maybe: ['△', '未定'], no: ['−', '不参加'] };
  function todayJst() { var d = new Date(Date.now() + 9 * 3600000); return d.toISOString().slice(0, 10); }
  function membersBox(m) {
    if (!m || !Array.isArray(m.rows) || !m.rows.length || !Array.isArray(m.days)) return null;
    var today = todayJst(), sec = h('section', { class: 'members' }, [h('h2', { text: '当日の参加メンバー' })]);
    sec.appendChild(h('p', { class: 'hint', text: (m.title || '') + (m.asOf ? '(' + m.asOf.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日') + ' 時点)' : '') + '。予定が変わった方は、お知らせください。' }));
    var r1 = h('tr', {}, [h('th', { rowspan: '2', scope: 'col', class: 'm-name', text: '名前' })]), r2 = h('tr');
    m.days.forEach(function (d) {
      var on = d[0] === today ? ' m-today' : '';
      r1.appendChild(h('th', { colspan: '2', scope: 'colgroup', class: 'm-day' + on }, [String(d[1] || ''), d[2] ? h('small', { text: d[2] + (on ? '・今日' : '') }) : null]));
      r2.appendChild(h('th', { scope: 'col', class: 'm-am' + on, text: '午前' })); r2.appendChild(h('th', { scope: 'col', class: on.trim(), text: '午後' }));
    });
    var n = m.days.length * 2, yes = [], maybe = [], tb = h('tbody');
    for (var k = 0; k < n; k++) { yes.push(0); maybe.push(0); }
    m.rows.forEach(function (p) {
      var tr = h('tr', {}, [h('th', { scope: 'row', class: 'm-name' }, [String(p.name || ''), p.org ? h('small', { text: p.org }) : null])]);
      for (var k = 0; k < n; k++) {
        var v = (p.s || [])[k], mk = MARK[v], on = m.days[k >> 1][0] === today ? ' m-today' : '';
        if (v === 'yes') yes[k]++; if (v === 'maybe') maybe[k]++;
        tr.appendChild(h('td', { class: 'm-' + (mk ? v : 'none') + (k % 2 ? '' : ' m-am') + on }, mk ? [h('span', { 'aria-hidden': 'true', text: mk[0] }), h('span', { class: 'sr-only', text: mk[1] })] : [h('span', { class: 'sr-only', text: 'まだ分かりません' })]));
      }
      tb.appendChild(tr);
    });
    var tf = h('tr', {}, [h('th', { scope: 'row', class: 'm-name', text: '参加の人数' })]);
    for (var j = 0; j < n; j++) tf.appendChild(h('td', { class: (j % 2 ? '' : 'm-am') + (m.days[j >> 1][0] === today ? ' m-today' : '') }, [yes[j] + '人', maybe[j] ? h('small', { text: '未定' + maybe[j] }) : null]));
    var table = h('table', { class: 'mtable' }, [h('caption', { class: 'sr-only', text: '当日の参加メンバー(日ごとの午前・午後)' }), h('thead', {}, [r1, r2]), tb, h('tfoot', {}, [tf])]);
    sec.appendChild(h('div', { class: 'mtable-wrap', tabindex: '0', role: 'region', 'aria-label': '当日の参加メンバーの表(横に動かせます)' }, [table]));
    sec.appendChild(h('p', { class: 'm-legend' }, [h('span', { class: 'm-yes', text: '○' }), ' 参加 ', h('span', { class: 'm-maybe', text: '△' }), ' 未定 ', h('span', { class: 'm-no', text: '−' }), ' 不参加']));
    var notes = m.rows.filter(function (p) { return p.note; });
    if (notes.length) {
      var dl = h('dl', { class: 'm-notes' });
      notes.forEach(function (p) { dl.appendChild(h('dt', { text: p.name })); dl.appendChild(h('dd', { text: p.note })); });
      sec.appendChild(h('details', { class: 'srcbox' }, [h('summary', { text: 'ひとこと(' + notes.length + '人)' }), dl]));
    }
    return sec;
  }
  document.addEventListener('member-ready', function () {
    if (!app) return;
    app.textContent = '読み込み中です…';
    window.callGas({ action: 'volunteer.feed', idToken: window.APP.cred }).then(function (r) {
      app.textContent = '';
      if (!r || !r.ok) { app.appendChild(h('p', { class: 'status ng', text: '読み込めませんでした。もう一度ログインしてください。' })); return; }
      var mbox = null;
      try { mbox = membersBox(r.members); } catch (e) { mbox = null; }   // 表が作れなくても、お知らせは出す
      if (mbox) app.appendChild(mbox);
      if (r.tasks && r.tasks.length) {
        app.appendChild(h('h2', { text: 'やること' }));
        var tl = h('div', { class: 'list' });
        r.tasks.forEach(function (t) { tl.appendChild(taskCard(t)); });
        app.appendChild(tl);
      }
      if (r.doneTasks && r.doneTasks.length) {   // 済んだやること(記録として残す)
        var dd = h('details', { class: 'srcbox' }, [h('summary', { text: '済んだやること(' + r.doneTasks.length + '件)' })]);
        r.doneTasks.forEach(function (t) { dd.appendChild(taskCard(t)); });
        app.appendChild(dd);
      }
      // 絞り込み(種類・話題・参加区分)。選べるのは、いま使われているものだけ。話題・参加区分は「指定なし」でも選べる
      var NONE = '__none__', items0 = (r.items || []).map(function (it) { if (it.attendance === '全員参加') it.attendance = '全員'; return it; });
      function opts(get, withNone) {
        var vals = [], none = false;
        items0.forEach(function (it) { var v = get(it); if (!v) none = true; else if (vals.indexOf(v) < 0) vals.push(v); });
        return vals.map(function (v) { return [v, v]; }).concat(withNone && none ? [[NONE, '指定なし']] : []);
      }
      var topicOf = function (it) { return it.target === 'volunteer' ? (it.topic || '') : ''; };
      var FILTERS = [['kind', '種類', function (it) { return it.kind || ''; }, false], ['topic', '話題', topicOf, true], ['att', '参加区分', function (it) { return it.attendance || ''; }, true]];
      var cur = { kind: '', topic: '', att: '' };
      var bar = h('div', { class: 'filter-bar', role: 'group', 'aria-label': 'お知らせの絞り込み' });
      var listArea = h('div', {});
      var count = h('p', { class: 'hint', role: 'status' });
      FILTERS.forEach(function (f) {
        var o = opts(f[2], f[3]);
        if (!o.length) return;
        var s = h('select', { 'aria-label': f[1] + 'で絞り込む' });
        s.appendChild(h('option', { value: '', text: 'すべて' }));
        o.forEach(function (x) { s.appendChild(h('option', { value: x[0], text: x[1] })); });
        s.addEventListener('change', function () { cur[f[0]] = s.value; draw(); });
        bar.appendChild(h('label', { class: 'filter' }, [h('span', { text: f[1] }), s]));
      });
      var reset = h('button', { class: 'btn-sub', type: 'button', text: '絞り込みをやめる', onclick: function () {
        cur = { kind: '', topic: '', att: '' }; Array.prototype.forEach.call(bar.querySelectorAll('select'), function (s) { s.value = ''; }); draw();
      } });
      bar.appendChild(reset);
      if (items0.length) { app.appendChild(h('h2', { text: 'お知らせ' })); app.appendChild(bar); app.appendChild(count); }
      app.appendChild(listArea);
      function pass(it) {
        return FILTERS.every(function (f) { var c = cur[f[0]]; if (!c) return true; var v = f[2](it); return c === NONE ? !v : v === c; });
      }
      function draw() {
      listArea.textContent = '';
      var shown = items0.filter(pass);
      var on = cur.kind || cur.topic || cur.att;
      count.textContent = on ? '絞り込み中: ' + shown.length + '件 / 全部で ' + items0.length + '件' : '全部で ' + items0.length + '件';
      reset.hidden = !on;
      var groups = {};
      shown.forEach(function (it) { var k = it.target === 'volunteer' ? (it.topic || 'その他のお知らせ') : '一般向けのお知らせ'; (groups[k] = groups[k] || []).push(it); });
      var order = (r.topics || []).concat(['その他のお知らせ', '一般向けのお知らせ']);
      var any = false;
      order.forEach(function (k) {
        if (!groups[k]) return;
        any = true;
        listArea.appendChild(h('h3', { class: 'topic-h', text: k }));
        var l = h('div', { class: 'list' });
        groups[k].slice().sort(function (a, b) { return (a.progress === 'done' ? 1 : 0) - (b.progress === 'done' ? 1 : 0); }).forEach(function (it) { l.appendChild(card(it)); });   // 対応済みは、あとに並べる
        listArea.appendChild(l);
      });
      if (!any && on) listArea.appendChild(h('p', { class: 'muted', text: '当てはまるお知らせはありません。' }));
      if (!any && !on && !(r.tasks && r.tasks.length)) listArea.appendChild(h('p', { class: 'muted', text: 'いま、ご案内するものはありません。' }));
      }
      draw();
    }).catch(function () { app.textContent = ''; app.appendChild(h('p', { class: 'status ng', text: '読み込めませんでした。時間をおいてお試しください。' })); });
  });
})();
