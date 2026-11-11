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
  // ---- 管理者だけに出る「この1件を直す」(ボランティアページを見たまま、直す・アーカイブ・取り下げ)
  // 管理者でログインしているときだけ動く。データは admin.published.list(管理者のみ)から取り、操作はすべてGAS側で管理者かどうか確かめる。
  var ADMIN = {}, reloadFeed = function () {};
  var A_KINDS = ['お知らせ', 'イベント', '単発イベント', '機器展の内容', 'タスク', 'その他'];
  var A_ATTENDS = ['全員', '希望者のみ', 'リーダーのみ'];   // gas/main/Config.js と合わせる
  var A_PROGRESS = { '': '(なし)', open: 'これから', doing: '対応中', done: '対応済み' };
  var A_ERR = { notfound: 'この内容は、いま公開していません(すでに取り下げたか、動かしたあとです)。', busy: 'ほかの操作中です。少し待ってから、もう一度お試しください。', target: '載せる先を1つ以上選んでください。', title: '見出しを入れてください。' };
  var seq = 0;
  function aField(label, input) { var id = 'ae' + (++seq); input.id = id; return h('div', { class: 'field' }, [h('label', { 'for': id, text: label }), input]); }
  function aInp(type, value, max) { var e = h('input', { type: type, maxlength: String(max || 200) }); e.value = value || ''; return e; }
  function aSel(options, value, labelFn) {
    var e = h('select');
    options.forEach(function (o) { var op = h('option', { value: o, text: labelFn ? labelFn(o) : (o || '(指定なし)') }); if (o === value) op.selected = true; e.appendChild(op); });
    return e;
  }
  function aCall(action, data) {
    var body = { action: action, idToken: window.APP.cred };
    Object.keys(data || {}).forEach(function (k) { body[k] = data[k]; });
    return window.callGas(body);
  }
  function aErr(r) { return A_ERR[r && r.reason] || 'うまくいきませんでした。ログインから1時間たっているときは、ページを開き直してログインし直してください。'; }
  function adminBar(it) {
    var a = window.APP && window.APP.role === 'admin' ? ADMIN[it.id] : null;
    if (!a) return null;
    var det = h('details', { class: 'srcbox admin-bar' }, [h('summary', { text: '管理者: この1件を直す・アーカイブ・取り下げ' })]);
    var built = false;
    det.addEventListener('toggle', function () { if (det.open && !built) { built = true; build(); } });
    function build() {
      var res = h('p', { class: 'status', role: 'status' });
      function say(t, ok) { res.className = 'status' + (ok === true ? ' ok' : (ok === false ? ' ng' : '')); res.textContent = t; }
      var title = aInp('text', a.title, 80), kind = aSel(A_KINDS, a.kind, function (o) { return o; });
      var tg = String(a.target || '').split(',');
      var tPub = h('input', { type: 'checkbox' }), tVol = h('input', { type: 'checkbox' }); tPub.checked = tg.indexOf('public') >= 0; tVol.checked = tg.indexOf('volunteer') >= 0;
      var topic = aInp('text', a.topic, 20), att = aSel([''].concat(A_ATTENDS), a.attendance || '');
      var date = aInp('date', /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : ''), endDate = aInp('date', /^\d{4}-\d{2}-\d{2}$/.test(a.end_date) ? a.end_date : '');
      var dateText = aInp('text', a.date_text, 60), place = aInp('text', a.place, 80), url = aInp('url', a.url, 300);
      var summary = h('textarea', { rows: '5', maxlength: '400' }); summary.value = a.summary || '';
      var prog = aSel(['', 'open', 'doing', 'done'], a.progress || '', function (o) { return A_PROGRESS[o]; });
      var note = h('textarea', { rows: '2', maxlength: '300' }); note.value = a.progress_note || '';
      var vtop = h('input', { type: 'checkbox' }); vtop.checked = a.vtop === true;
      var btns = [];
      function lock(b) { btns.forEach(function (x) { x.disabled = b; }); }
      function after(r, okText) {
        if (r && r.ok) { say(okText + (r.site && r.site !== 'updated' ? '(一般向けのページの更新だけ失敗しました。管理ページの「設定」から作り直してください)' : ''), true); setTimeout(reloadFeed, 1200); return true; }
        lock(false); say(aErr(r), false); return false;
      }
      function fail() { lock(false); say('通信がうまくいきませんでした。もう一度押してください。', false); }
      var save = h('button', { class: 'btn', type: 'button', text: '修正を保存', onclick: function () {
        var targets = (tPub.checked ? ['public'] : []).concat(tVol.checked ? ['volunteer'] : []);
        if (!targets.length) { say('載せる先を1つ以上選んでください。', false); return; }
        lock(true); say('保存しています…');
        aCall('admin.published.update', { id: it.id, edits: { title: title.value, kind: kind.value, targets: targets, topic: topic.value, attendance: att.value, date: date.value, endDate: endDate.value,
          dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, progress: prog.value, progressNote: note.value, vtop: vtop.checked } })
          .then(function (r) { after(r, '保存しました。'); }).catch(fail);
      } });
      function twoStep(label, sure, hint, run) {
        var armed = false, b = h('button', { class: 'btn-sub', type: 'button', text: label, onclick: function () {
          if (!armed) { armed = true; b.textContent = sure; say(hint); setTimeout(function () { armed = false; b.textContent = label; }, 5000); return; }
          lock(true); run();
        } });
        return b;
      }
      var arch = twoStep('アーカイブへ移す', '本当にアーカイブへ移す(もう一度押す)', 'どのページにも出なくなります。消えはせず、管理ページの「アーカイブ」から公開に戻せます。', function () {
        aCall('admin.published.archive', { id: it.id }).then(function (r) { after(r, 'アーカイブへ移しました。'); }).catch(fail);
      });
      var wd = twoStep('取り下げる', '本当に取り下げる(もう一度押す)', 'ページから消えます。管理ページの「公開中」から戻せます(30日たつと自動で消えます)。', function () {
        aCall('admin.published.withdraw', { id: it.id }).then(function (r) { after(r, '取り下げました。'); }).catch(fail);
      });
      btns = [save, arch, wd];
      var photo = h('p', {}, [h('a', { href: 'admin.html#edit=' + encodeURIComponent(it.id), target: '_blank', rel: 'noopener noreferrer', text: '写真・資料を足す・外すときは、管理ページで開く(ログインし直しが要ります)' })]);
      [h('p', { class: 'hint', text: '管理者にだけ出ています。ほかの方には見えません。保存すると、このページも自動で読み直します。' }),
        aField('見出し', title), aField('種類', kind),
        h('div', { class: 'field' }, [h('label', { text: '載せる先' }), h('div', { class: 'checks', role: 'group', 'aria-label': '載せる先(複数選べます)' }, [h('label', {}, [tPub, '一般向け(誰でも見られる)']), h('label', {}, [tVol, 'ボランティア向け'])])]),
        aField('話題(ボランティア向けのとき)', topic), aField('参加区分(ボランティア向けのとき)', att),
        aField('日付(開始日)', date), aField('終了日(複数日のとき。過ぎると一般向けから消えます)', endDate), aField('日時の文章', dateText), aField('場所', place),
        aField('要約', summary), aField('リンク(https)', url),
        aField('対応状況(ボランティア向けのページに出ます)', prog), aField('対応メモ', note),
        h('label', { class: 'check' }, [vtop, ' ボランティア向けページの一番上に出す(集合時間・持ち物など)']),
        photo, h('div', { class: 'btn-row' }, [save, arch, wd]), res].forEach(function (x) { det.appendChild(x); });
    }
    return det;
  }

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
    var ab = adminBar(it); if (ab) d.appendChild(ab);
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
  function loadFeed() {
    if (!app) return;
    var keepY = window.pageYOffset || 0;   // 直したあとの読み直しで、見ていた場所に戻す
    app.textContent = '読み込み中です…';
    var isAdmin = window.APP && window.APP.role === 'admin';
    var adminP = isAdmin ? aCall('admin.published.list').catch(function () { return null; }) : Promise.resolve(null);   // 管理用の項目(管理者のみ)。取れなくても、ふだんの表示は出す
    Promise.all([window.callGas({ action: 'volunteer.feed', idToken: window.APP.cred }), adminP]).then(function (both) {
      var r = both[0];
      ADMIN = {};
      if (both[1] && both[1].ok && Array.isArray(both[1].items)) both[1].items.forEach(function (x) { if (x.status === 'active') ADMIN[x.id] = x; });
      app.textContent = '';
      if (!r || !r.ok) { app.appendChild(h('p', { class: 'status ng', text: '読み込めませんでした。もう一度ログインしてください。' })); return; }
      // 一番上に送ったお知らせ(集合時間・持ち物など)。ページのいちばん上に出し、下の一覧には重ねて出さない
      var tops = (r.items || []).filter(function (it) { return it.vtop === true; });
      if (tops.length) {
        var tl0 = h('div', { class: 'list' });
        tops.forEach(function (it) { var c = card(it); c.classList.add('item-top'); tl0.appendChild(c); });
        app.appendChild(h('section', { class: 'top-notes' }, [h('h2', { text: 'まず見てほしいお知らせ' }), tl0]));
      }
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
      var NONE = '__none__', items0 = (r.items || []).filter(function (it) { return it.vtop !== true; }).map(function (it) { if (it.attendance === '全員参加') it.attendance = '全員'; return it; });
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
      if (!any && !on && !(r.tasks && r.tasks.length) && !tops.length) listArea.appendChild(h('p', { class: 'muted', text: 'いま、ご案内するものはありません。' }));
      }
      draw();
      if (keepY) window.scrollTo(0, keepY);
    }).catch(function () { app.textContent = ''; app.appendChild(h('p', { class: 'status ng', text: '読み込めませんでした。時間をおいてお試しください。' })); });
  }
  reloadFeed = loadFeed;
  document.addEventListener('member-ready', loadFeed);
})();
