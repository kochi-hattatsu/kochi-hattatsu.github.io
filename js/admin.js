// 管理ページの画面。文字は textContent だけで入れる(HTMLとして解釈しない)。データは、名簿に載った管理者にだけGASが返す。
(function () {
  'use strict';
  var TARGET_LABEL = { public: '一般向け(誰でも見られる)', maker: 'メーカー向け', volunteer: 'ボランティア向け', skip: '載せない' };
  var KINDS = ['お知らせ', 'イベント', 'タスク', 'その他'];
  var TOPICS = ['配置', '当日の流れ', '相談', '議事録置き場', 'セミナー', '定例会予定'];
  var ATTENDS = ['全員参加', '希望者のみ', 'リーダーのみ'];
  var STATUS_LABEL = { active: '公開中', withdrawn: '取り下げ済み' };
  var ERR = {
    busy: 'ほかの操作中です。少し待ってから、もう一度お試しください。',
    'ai-cap': '今月のAIの使用量が上限に達しています。',
    'ai-nokey': 'AIのキーがまだ設定されていません。',
    'last-admin': '管理者の最後の1人は、消したり、役割を下げたりできません。',
    email: 'メールアドレスの形を確認してください。', length: '12文字以上にしてください。',
    text: '内容が空か、長すぎます(12000文字まで)。',
    files: 'ファイルを読み込めませんでした。画像(写真・スクリーンショット)か、4MBまでのPDFを、3つまで選んでください。', failed: 'うまくいきませんでした。時間をおいてお試しください。'
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
    var attend = sel([''].concat(ATTENDS), p.attendance, function (o) { return o || '(指定なし)'; });
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
    var armedPublic = false;
    function decide(decision) {
      if (decision === 'approve' && p.personal_flag && target.value === 'public' && !armedPublic) {   // 個人情報の可能性があるものを、一般に公開する前の再確認
        armedPublic = true; res.className = 'status ng';
        res.textContent = '個人情報が含まれる可能性があります。内容を確認して、問題なければ、もう一度「承認して載せる」を押してください。';
        return;
      }
      approve.disabled = reject.disabled = true; res.textContent = '送信しています…';
      api('admin.pending.decide', {
        id: p.id, decision: decision,
        edits: { title: title.value, kind: kind.value, target: target.value, topic: topic.value, attendance: attend.value, date: date.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value }
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
    [badges, field('見出し', title), field('種類', kind), field('載せる先', target), field('話題(ボランティア向けのとき)', topic), field('参加区分(ボランティア向けのとき)', attend),
      field('日付', date), field('日時の文章', dateText), field('場所', place), field('要約', summary), field('リンク(https)', url),
      h('div', { class: 'btn-row' }, [approve, reject]), res].forEach(function (x) { card.appendChild(x); });
    return card;
  }

  // ---- 取り込み(貼り付け・画像/PDF・メール)
  // 載せ方の指定(載せる先・話題・参加区分・補足メモ)。貼り付けと画像・PDFで共通。空のものは、AIの提案に任せる。
  function presetBox() {
    var target = sel(['', 'public', 'maker', 'volunteer'], '', function (o) { return o ? TARGET_LABEL[o] : 'おまかせ(AIが提案)'; });
    var topic = sel([''].concat(TOPICS), '', function (o) { return o || '(おまかせ・話題なし)'; });
    var attend = sel([''].concat(ATTENDS), '', function (o) { return o || '(指定なし)'; });
    var memo = h('textarea', { rows: '2', maxlength: '300', 'aria-label': '補足メモ', placeholder: '例: 全員参加は不要です。参加できる方だけで。' });
    var box = h('section', { class: 'item' }, [
      h('p', { class: 'hint', text: 'ここで指定すると、承認待ちに、その内容で入ります(承認のときにも直せます)。空のところは、AIが提案します。' }),
      field('載せる先', target), field('話題(ボランティア向けのとき)', topic), field('参加区分(ボランティア向けのとき)', attend),
      field('補足メモ(任意。要約にも反映します)', memo)]);
    return {
      box: box,
      get: function () { return { target: target.value, topic: topic.value, attendance: attend.value, memo: memo.value }; },
      clear: function () { memo.value = ''; }
    };
  }

  function renderIngest() {
    view.textContent = '';
    view.appendChild(h('h2', { text: '取り込み' }));
    view.appendChild(h('p', { text: 'LINEの文章や、スクリーンショット・写真・PDFを入れると、AIが「載せる候補」に整理します。載せるかどうかは、承認待ちで決めます。' }));
    var preset = presetBox();
    view.appendChild(h('h2', { text: '載せ方の指定(任意)' }));
    view.appendChild(preset.box);

    view.appendChild(h('h2', { text: '文章の貼り付け' }));
    var ta = h('textarea', { rows: '8', maxlength: '12000', 'aria-label': '貼り付ける文章' });
    var res = h('p', { class: 'status', role: 'status' });
    var go = h('button', { class: 'btn', type: 'button', text: 'AIで整理する', onclick: function () {
      go.disabled = true; res.className = 'status'; res.textContent = '整理しています…(30秒ほどかかります)';
      api('admin.ingest.text', { text: ta.value, preset: preset.get() }).then(function (r) {
        go.disabled = false;
        if (r && r.ok) { res.className = 'status ok'; res.textContent = r.added + '件を承認待ちに入れました。'; ta.value = ''; preset.clear(); }
        else { res.className = 'status ng'; res.textContent = errText(r); }
      }).catch(function () { go.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    view.appendChild(ta); view.appendChild(h('div', { class: 'btn-row' }, [go])); view.appendChild(res);

    view.appendChild(h('h2', { text: '画像・PDFの取り込み' }));
    view.appendChild(h('p', { text: 'LINEのスクリーンショットや写真、PDFを選んでください(3つまで。PDFは4MBまで)。個人の名前や電話番号は、AIが要約に書かないようになっています。' }));
    var fin = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf', multiple: 'multiple', 'aria-label': '画像・PDFを選ぶ' });
    var fres = h('p', { class: 'status', role: 'status' });
    function toB64(buf) { var b = new Uint8Array(buf), s = '', i; for (i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); }
    function prepFile(f) {   // 画像は縮小(長い辺1600px・JPEG)。PDFはそのまま
      if (f.type === 'application/pdf') {
        if (f.size > 4 * 1024 * 1024) return Promise.reject(new Error('big'));
        return f.arrayBuffer().then(function (buf) { return { mime: 'application/pdf', b64: toB64(buf) }; });
      }
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return Promise.reject(new Error('type'));
      return createImageBitmap(f).then(function (bm) {
        var sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
        c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
        c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
        return new Promise(function (ok, ng) { c.toBlob(function (bl) { bl ? bl.arrayBuffer().then(function (buf) { ok({ mime: 'image/jpeg', b64: toB64(buf) }); }) : ng(new Error('img')); }, 'image/jpeg', 0.85); });
      });
    }
    var fgo = h('button', { class: 'btn', type: 'button', text: 'AIで読み取る', onclick: function () {
      var list = Array.prototype.slice.call(fin.files || []);
      if (!list.length || list.length > 3) { fres.className = 'status ng'; fres.textContent = ERR.files; return; }
      fgo.disabled = true; fres.className = 'status'; fres.textContent = '読み取っています…(1分ほどかかることがあります)';
      Promise.all(list.map(prepFile)).then(function (files) {
        return api('admin.ingest.files', { files: files, preset: preset.get() });
      }).then(function (r) {
        fgo.disabled = false;
        if (r && r.ok) { fres.className = 'status ok'; fres.textContent = r.added + '件を承認待ちに入れました。'; fin.value = ''; preset.clear(); }
        else { fres.className = 'status ng'; fres.textContent = errText(r); }
      }).catch(function () { fgo.disabled = false; fres.className = 'status ng'; fres.textContent = ERR.files; });
    } });
    view.appendChild(h('div', { class: 'field' }, [fin]));
    view.appendChild(h('div', { class: 'btn-row' }, [fgo])); view.appendChild(fres);

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

  // ---- 公開中(修正・取り下げ)
  function renderPublished() {
    view.textContent = '';
    view.appendChild(h('h2', { text: '公開中の内容' }));
    view.appendChild(h('p', { class: 'hint', text: '載せたあとの修正と、取り下げができます。取り下げは、消さずに「取り下げ済み」にするので、あとで戻せます。' }));
    var list = h('div', { class: 'list' });
    view.appendChild(list);
    api('admin.published.list').then(function (r) {
      if (!r || !r.ok) { say('読み込めませんでした。もう一度ログインしてください。'); return; }
      if (!r.items.length) { list.appendChild(h('p', { class: 'muted', text: 'まだ、載せた内容はありません。' })); return; }
      r.items.forEach(function (it) { list.appendChild(publishedCard(it)); });
    }).catch(function () { say(ERR.failed); });
  }
  function publishedCard(it) {
    var card = h('section', { class: 'item' });
    var active = it.status === 'active';
    var title = h('input', { type: 'text', maxlength: '80', value: it.title });
    var kind = sel(KINDS, it.kind);
    var target = sel(['public', 'maker', 'volunteer'], it.target, function (o) { return TARGET_LABEL[o]; });
    var topic = sel([''].concat(TOPICS), it.topic, function (o) { return o || '(話題なし)'; });
    var attend = sel([''].concat(ATTENDS), it.attendance, function (o) { return o || '(指定なし)'; });
    var date = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : '' });
    var dateText = h('input', { type: 'text', maxlength: '60', value: it.date_text || '' });
    var place = h('input', { type: 'text', maxlength: '80', value: it.place || '' });
    var summary = h('textarea', { rows: '4', maxlength: '400' }); summary.value = it.summary || '';
    var url = h('input', { type: 'url', maxlength: '300', value: it.url || '' });
    var res = h('p', { class: 'status', role: 'status' });
    var badges = h('p', {}, [h('span', { class: 'badge' + (active ? '' : ' warn'), text: STATUS_LABEL[it.status] || it.status }),
      h('span', { class: 'badge', text: TARGET_LABEL[it.target] || it.target })]);
    var inputs = [title, kind, target, topic, attend, date, dateText, place, summary, url];
    if (!active) inputs.forEach(function (x) { x.disabled = true; });
    function done(r, okText) {
      if (r && r.ok) {
        res.className = 'status ok';
        res.textContent = okText + (r.site === 'updated' ? '(サイトの更新は1〜2分かかります)' : (r.site ? '(サイトの更新がうまくいきませんでした。「設定」から「公開データを作り直す」を押してください)' : ''));
        return true;
      }
      res.className = 'status ng'; res.textContent = errText(r); return false;
    }
    var save = h('button', { class: 'btn', type: 'button', text: '修正を保存', onclick: function () {
      save.disabled = true; res.className = 'status'; res.textContent = '保存しています…';
      api('admin.published.update', { id: it.id, edits: { title: title.value, kind: kind.value, target: target.value, topic: topic.value, attendance: attend.value,
        date: date.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value } }).then(function (r) {
        save.disabled = false; done(r, '保存しました。');
      }).catch(function () { save.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    var armed = false;
    var withdraw = h('button', { class: 'btn-sub', type: 'button', text: '取り下げる', onclick: function () {
      if (!armed) { armed = true; withdraw.textContent = '本当に取り下げる(もう一度押す)'; setTimeout(function () { armed = false; withdraw.textContent = '取り下げる'; }, 5000); return; }
      withdraw.disabled = true;
      api('admin.published.withdraw', { id: it.id }).then(function (r) { if (done(r, '取り下げました。')) setTimeout(function () { card.remove(); }, 1500); else withdraw.disabled = false; })
        .catch(function () { withdraw.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    var restore = h('button', { class: 'btn', type: 'button', text: '公開に戻す', onclick: function () {
      restore.disabled = true;
      api('admin.published.withdraw', { id: it.id, restore: true }).then(function (r) { if (done(r, '公開に戻しました。')) setTimeout(function () { card.remove(); }, 1500); else restore.disabled = false; })
        .catch(function () { restore.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    [badges, field('見出し', title), field('種類', kind), field('載せる先', target), field('話題(ボランティア向けのとき)', topic),
      field('参加区分(ボランティア向けのとき)', attend), field('日付', date), field('日時の文章', dateText), field('場所', place), field('要約', summary),
      field('リンク(https)', url), h('div', { class: 'btn-row' }, active ? [save, withdraw] : [restore]), res].forEach(function (x) { card.appendChild(x); });
    return card;
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

  var TABS = [['承認待ち', renderPending], ['取り込み', renderIngest], ['公開中', renderPublished], ['お問い合わせ', renderContacts], ['名簿', renderRoster], ['設定', renderSettings]];
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
