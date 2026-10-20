// 管理ページの画面。文字は textContent だけで入れる(HTMLとして解釈しない)。データは、名簿に載った管理者にだけGASが返す。
(function () {
  'use strict';
  var TARGET_LABEL = { public: '一般向け(誰でも見られる)', maker: 'メーカー向け', volunteer: 'ボランティア向け', skip: '載せない' };
  var KINDS = ['お知らせ', 'イベント', 'タスク', 'その他'];
  var TOPICS = ['配置', '当日の流れ', '相談', '議事録置き場', 'セミナー'];
  var ERR = {
    busy: 'ほかの操作中です。少し待ってから、もう一度お試しください。',
    'ai-cap': '今月のAIの使用量が上限に達しています。',
    'ai-nokey': 'AIのキーがまだ設定されていません。',
    'last-admin': '管理者の最後の1人は、消したり、役割を下げたりできません。',
    email: 'メールアドレスの形を確認してください。', length: '12文字以上にしてください。',
    text: '内容が空か、長すぎます(12000文字まで)。', failed: 'うまくいきませんでした。時間をおいてお試しください。'
  };

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var app = document.getElementById('app');
  var view = h('div');
  var msgBox = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });

  function say(text, ok) { msgBox.className = 'status ' + (ok ? 'ok' : 'ng'); msgBox.textContent = text || ''; }
  function api(action, data) {
    var body = { action: action, idToken: window.APP.cred };
    Object.keys(data || {}).forEach(function (k) { body[k] = data[k]; });
    return window.callGas(body);
  }
  function errText(r) { return ERR[(r && (r.reason || r.error))] || ERR.failed; }
  function field(label, input) { return h('div', { class: 'field' }, [h('label', { text: label }), input]); }
  function sel(options, value, labelFn) {
    var s = h('select');
    options.forEach(function (o) { var op = h('option', { value: o, text: labelFn ? labelFn(o) : o }); if (o === value) op.selected = true; s.appendChild(op); });
    return s;
  }

  // ---- 承認待ち
  function renderPending() {
    view.textContent = '';
    view.appendChild(h('h2', { text: '承認待ち' }));
    api('admin.pending.list').then(function (r) {
      if (!r || !r.ok) { say('読み込めませんでした。もう一度ログインしてください。'); return; }
      if (!r.items.length) { view.appendChild(h('p', { class: 'muted', text: '承認待ちはありません。' })); return; }
      r.items.forEach(function (p) { view.appendChild(pendingCard(p)); });
    }).catch(function () { say(ERR.failed); });
  }
  function pendingCard(p) {
    var title = h('input', { type: 'text', maxlength: '80', value: p.title });
    var kind = sel(KINDS, p.kind);
    var target = sel(['public', 'maker', 'volunteer', 'skip'], p.proposed_target, function (o) { return TARGET_LABEL[o]; });
    var topic = sel([''].concat(TOPICS), p.topic, function (o) { return o || '(話題なし)'; });
    var date = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : '' });
    var dateText = h('input', { type: 'text', maxlength: '60', value: p.date_text || '' });
    var place = h('input', { type: 'text', maxlength: '80', value: p.place || '' });
    var summary = h('textarea', { rows: '4', maxlength: '400' }); summary.value = p.summary || '';
    var url = h('input', { type: 'url', maxlength: '300', value: p.url || '' });
    var res = h('p', { class: 'status', role: 'status' });
    var card = h('section', { class: 'item' });
    var badges = h('p');
    if (p.personal_flag) badges.appendChild(h('span', { class: 'badge warn', text: '個人情報が含まれる可能性' }));
    if (p.duplicate_of) badges.appendChild(h('span', { class: 'badge', text: '近い内容がすでにあります' }));
    badges.appendChild(h('span', { class: 'badge', text: '元: ' + (p.source_ref || p.source) }));
    function decide(decision) {
      approve.disabled = reject.disabled = true; res.textContent = '送信しています…';
      api('admin.pending.decide', {
        id: p.id, decision: decision,
        edits: { title: title.value, kind: kind.value, target: target.value, topic: topic.value, date: date.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value }
      }).then(function (r) {
        if (r && r.ok) {
          res.className = 'status ok';
          res.textContent = decision === 'reject' ? '載せないことにしました。' :
            (r.published ? (r.site === 'updated' ? '載せました。サイトの更新は1〜2分かかります。' : (r.site === 'no-token' ? '保存しました(サイトの更新設定が未完了です)。' : '保存しました。')) : '載せないことにしました。');
          setTimeout(function () { card.remove(); }, 1500);
        } else { res.className = 'status ng'; res.textContent = errText(r); approve.disabled = reject.disabled = false; }
      }).catch(function () { res.className = 'status ng'; res.textContent = ERR.failed; approve.disabled = reject.disabled = false; });
    }
    var approve = h('button', { class: 'btn', type: 'button', text: '承認して載せる', onclick: function () { decide('approve'); } });
    var reject = h('button', { class: 'btn-sub', type: 'button', text: '載せない', onclick: function () { decide('reject'); } });
    [badges, field('見出し', title), field('種類', kind), field('載せる先', target), field('話題(ボランティア向けのとき)', topic),
      field('日付', date), field('日時の文章', dateText), field('場所', place), field('要約', summary), field('リンク(https)', url),
      h('div', { class: 'btn-row' }, [approve, reject]), res].forEach(function (x) { card.appendChild(x); });
    return card;
  }

  // ---- 取り込み(貼り付け・メール)
  function renderIngest() {
    view.textContent = '';
    view.appendChild(h('h2', { text: '取り込み' }));
    view.appendChild(h('p', { text: 'LINEの文章やメモを貼り付けると、AIが「載せる候補」に整理します。載せるかどうかは、承認待ちで決めます。' }));
    var ta = h('textarea', { rows: '8', maxlength: '12000', 'aria-label': '貼り付ける文章' });
    var res = h('p', { class: 'status', role: 'status' });
    var go = h('button', { class: 'btn', type: 'button', text: 'AIで整理する', onclick: function () {
      go.disabled = true; res.className = 'status'; res.textContent = '整理しています…(30秒ほどかかります)';
      api('admin.ingest.text', { text: ta.value }).then(function (r) {
        go.disabled = false;
        if (r && r.ok) { res.className = 'status ok'; res.textContent = r.added + '件を承認待ちに入れました。'; ta.value = ''; }
        else { res.className = 'status ng'; res.textContent = errText(r); }
      }).catch(function () { go.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    view.appendChild(ta); view.appendChild(h('div', { class: 'btn-row' }, [go])); view.appendChild(res);

    view.appendChild(h('h2', { text: 'メールの取り込み' }));
    view.appendChild(h('p', { text: '専用Gmailで、ラベル「HP取込」を付けたメールだけを読みます(30分おきに自動。いますぐ読むときは下のボタン)。他のメールは読みません。' }));
    var res2 = h('p', { class: 'status', role: 'status' });
    var go2 = h('button', { class: 'btn-sub', type: 'button', text: 'いまメールを読む', onclick: function () {
      go2.disabled = true; res2.className = 'status'; res2.textContent = '読んでいます…';
      api('admin.ingest.mail').then(function (r) {
        go2.disabled = false;
        if (r && r.ok) { res2.className = 'status ok'; res2.textContent = r.added + '件を承認待ちに入れました。'; }
        else { res2.className = 'status ng'; res2.textContent = (r && r.reason === 'no-label') ? 'ラベル「HP取込」がまだありません。' : errText(r); }
      }).catch(function () { go2.disabled = false; res2.className = 'status ng'; res2.textContent = ERR.failed; });
    } });
    view.appendChild(h('div', { class: 'btn-row' }, [go2])); view.appendChild(res2);
  }

  // ---- お問い合わせ
  function renderContacts() {
    view.textContent = '';
    view.appendChild(h('h2', { text: 'お問い合わせ' }));
    api('admin.contact.list').then(function (r) {
      if (!r || !r.ok) { say('読み込めませんでした。'); return; }
      if (!r.items.length) { view.appendChild(h('p', { class: 'muted', text: '新しいお問い合わせはありません。' })); return; }
      var REPLY = { mail: 'メールで返事希望', tel: '電話で返事希望', either: 'どちらでもよい', none: '返事は不要' };
      r.items.forEach(function (c) {
        var card = h('section', { class: 'item' });
        card.appendChild(h('time', { text: String(c.created_at).replace('T', ' ') }));
        card.appendChild(h('p', { text: (c.name || '(名前なし)') + ' / ' + (REPLY[c.reply] || '') }));
        if (c.email) card.appendChild(h('p', { text: 'メール: ' + c.email }));
        if (c.tel) card.appendChild(h('p', { text: '電話: ' + c.tel }));
        card.appendChild(h('p', { text: c.message }));
        card.appendChild(h('button', { class: 'btn-sub', type: 'button', text: '対応済みにする', onclick: function (ev) {
          ev.target.disabled = true;
          api('admin.contact.done', { id: c.id }).then(function () { card.remove(); });
        } }));
        view.appendChild(card);
      });
    }).catch(function () { say(ERR.failed); });
  }

  // ---- 名簿
  function renderRoster() {
    view.textContent = '';
    view.appendChild(h('h2', { text: '名簿(ログインできる人)' }));
    var list = h('div', { class: 'list' });
    function load() {
      list.textContent = '';
      api('admin.roster.list').then(function (r) {
        if (!r || !r.ok) { say('読み込めませんでした。'); return; }
        r.items.forEach(function (m) {
          var row = h('div', { class: 'item' });
          row.appendChild(h('p', { text: m.email + (m.name ? '(' + m.name + ')' : '') + ' — ' + (m.role === 'admin' ? '管理者' : 'ボランティア') }));
          var armed = false;
          var del = h('button', { class: 'btn-sub', type: 'button', text: '名簿から外す', onclick: function () {
            if (!armed) { armed = true; del.textContent = '本当に外す(もう一度押す)'; setTimeout(function () { armed = false; del.textContent = '名簿から外す'; }, 5000); return; }
            api('admin.roster.remove', { email: m.email }).then(function (x) { if (x && x.ok) { say('外しました。', true); load(); } else say(errText(x)); });
          } });
          var toggle = h('button', { class: 'btn-sub', type: 'button', text: m.role === 'admin' ? 'ボランティアにする' : '管理者にする', onclick: function () {
            api('admin.roster.set', { email: m.email, role: m.role === 'admin' ? 'volunteer' : 'admin' }).then(function (x) { if (x && x.ok) { say('変更しました。', true); load(); } else say(errText(x)); });
          } });
          row.appendChild(h('div', { class: 'btn-row' }, [toggle, del]));
          list.appendChild(row);
        });
      }).catch(function () { say(ERR.failed); });
    }
    var em = h('input', { type: 'email', maxlength: '120', autocomplete: 'off' });
    var nm = h('input', { type: 'text', maxlength: '60', autocomplete: 'off' });
    var rl = sel(['volunteer', 'admin'], 'volunteer', function (o) { return o === 'admin' ? '管理者' : 'ボランティア'; });
    var add = h('button', { class: 'btn', type: 'button', text: '名簿に追加', onclick: function () {
      api('admin.roster.set', { email: em.value, role: rl.value, name: nm.value }).then(function (x) {
        if (x && x.ok) { say('追加しました。', true); em.value = nm.value = ''; load(); } else say(errText(x));
      });
    } });
    view.appendChild(list);
    view.appendChild(h('h2', { text: '追加' }));
    [field('メールアドレス(Googleアカウント)', em), field('表示名(任意)', nm), field('役割', rl), h('div', { class: 'btn-row' }, [add])].forEach(function (x) { view.appendChild(x); });
    view.appendChild(h('p', { class: 'hint', text: '外した人は、1分ほどでログインできなくなります。' }));
    load();
  }

  // ---- 設定
  function renderSettings() {
    view.textContent = '';
    view.appendChild(h('h2', { text: '設定の状態' }));
    var box = h('div', { class: 'list' });
    view.appendChild(box);
    api('admin.status').then(function (r) {
      if (!r || !r.ok) { say('読み込めませんでした。'); return; }
      function row(label, ok, extra) { box.appendChild(h('div', { class: 'item' }, [h('p', { text: label + ': ' + (ok ? 'OK' : '未設定') + (extra ? '(' + extra + ')' : '') })])); }
      row('AIのキー', r.hasAiKey, '今月の使用量 ' + r.ai.used + ' / 上限 ' + r.ai.cap);
      row('サイト更新用のトークン', r.hasGithub);
      row('メーカー向けのパスワード', r.hasMakerPw);
    }).catch(function () { say(ERR.failed); });
    view.appendChild(h('h2', { text: 'メーカー向けのパスワード' }));
    var pw = h('input', { type: 'password', autocomplete: 'new-password', maxlength: '100' });
    var res = h('p', { class: 'status', role: 'status' });
    view.appendChild(field('新しいパスワード(12文字以上)', pw));
    view.appendChild(h('div', { class: 'btn-row' }, [h('button', { class: 'btn', type: 'button', text: '変更する', onclick: function () {
      api('admin.maker.setPassword', { password: pw.value }).then(function (r) {
        if (r && r.ok) { res.className = 'status ok'; res.textContent = '変更しました。メーカーの方へは、別の方法でお知らせください。'; pw.value = ''; }
        else { res.className = 'status ng'; res.textContent = errText(r); }
      });
    } })]));
    view.appendChild(res);
    view.appendChild(h('h2', { text: 'サイトを更新し直す' }));
    var res3 = h('p', { class: 'status', role: 'status' });
    view.appendChild(h('div', { class: 'btn-row' }, [h('button', { class: 'btn-sub', type: 'button', text: '公開データを作り直す', onclick: function () {
      api('admin.publish.rebuild').then(function (r) { res3.className = 'status ' + (r && r.ok ? 'ok' : 'ng'); res3.textContent = r && r.ok ? '更新しました(反映に1〜2分)。' : 'うまくいきませんでした(トークンの設定を確認してください)。'; });
    } })]));
    view.appendChild(res3);
  }

  var TABS = [['承認待ち', renderPending], ['取り込み', renderIngest], ['お問い合わせ', renderContacts], ['名簿', renderRoster], ['設定', renderSettings]];
  document.addEventListener('member-ready', function () {
    if (!app) return;
    if (window.APP.role !== 'admin') { app.textContent = ''; return; }
    var nav = h('div', { class: 'tabs', role: 'tablist' });
    TABS.forEach(function (t, i) {
      nav.appendChild(h('button', { class: 'tab' + (i === 0 ? ' on' : ''), type: 'button', role: 'tab', text: t[0], onclick: function (ev) {
        Array.prototype.forEach.call(nav.children, function (b) { b.className = 'tab'; });
        ev.target.className = 'tab on'; say(''); t[1]();
      } }));
    });
    app.appendChild(nav); app.appendChild(msgBox); app.appendChild(view);
    renderPending();
  });
})();
