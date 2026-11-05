// 管理ページの画面。文字は textContent だけで入れる(HTMLとして解釈しない)。データは、名簿に載った管理者にだけGASが返す。
(function () {
  'use strict';
  var TARGET_LABEL = { public: '一般向け(誰でも見られる)', maker: 'メーカー向け', volunteer: 'ボランティア向け', skip: '載せない' };
  var KINDS = ['お知らせ', 'イベント', '単発イベント', '機器展の内容', 'タスク', 'その他'];
  var KIND_HINT = '種類: 高知ふくし機器展そのもの=「イベント」(トップ・イベント情報に出る)/機器展の中のセミナー・展示・地図・資料=「機器展の内容」(機器展のページに出る。終わっても残る)/勉強会などの単発=「単発イベント」(トップ・みんなのお知らせ掲示板に出る)。日付(終了日)を過ぎると、一般向けのお知らせ・掲示板から自動で消えます。';
  var TOPICS = ['配置', '当日の流れ', '相談', '議事録置き場', 'セミナー', '定例会予定', '事務局への回答'];
  var ATTENDS = ['全員参加', '希望者のみ', 'リーダーのみ'];
  var STATUS_LABEL = { active: '公開中', withdrawn: '取り下げ済み' };
  var ERR = {
    busy: 'ほかの操作中です。少し待ってから、もう一度お試しください。',
    'ai-cap': '今月のAIの使用量が上限に達しています。',
    'ai-nokey': 'AIのキーがまだ設定されていません。',
    'last-admin': '管理者の最後の1人は、消したり、役割を下げたりできません。',
    email: 'メールアドレスの形を確認してください。', length: '12文字以上にしてください。',
    text: '内容が空か、長すぎます(12000文字まで)。',
    imgok: '新しく載せる写真があります。写っている方・個人情報を確認して、「確認しました」にチェックを入れてください。', imgmax: '写真・資料は、1つの内容に6つまでです。', imgid: '写真・資料を確認できませんでした。選び直してください。',
    imgfail: '写真・資料の保存に失敗しました。時間をおいて、もう一度お試しください。', 'no-token': 'サイトの更新設定が未完了です(サイト更新用のトークン)。',
    files: 'ファイルを読み込めませんでした。画像(写真・スクリーンショット)か、4MBまでのPDFを、8つまで選んでください。合計で約10MBまでです。', failed: 'うまくいきませんでした。時間をおいてお試しください。'
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

  // 載せる先は、複数選べる(一般向け・メーカー向け・ボランティア向け)。initial: 「public,volunteer」のような文字。
  function targetChecks(initial) {
    var cur = String(initial || '').split(',');
    var box = h('div', { class: 'checks', role: 'group', 'aria-label': '載せる先(複数選べます)' });
    var inputs = ['public', 'maker', 'volunteer'].map(function (k) {
      var cb = h('input', { type: 'checkbox', value: k });
      cb.checked = cur.indexOf(k) >= 0;
      box.appendChild(h('label', {}, [cb, TARGET_LABEL[k]]));
      return cb;
    });
    return { box: box, get: function () { return inputs.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); } };
  }
  function targetsText(str) { return String(str || '').split(',').map(function (k) { return TARGET_LABEL[k] || ''; }).filter(Boolean).join('・'); }

  // 元の内容(何をもとに作った候補か)。文章と、元のメール・ファイルを開くリンク。
  function srcBox(text, urlStr, linkLabel) {
    var urls = String(urlStr || '').split(/\s+/).filter(function (u) { return /^https:\/\//.test(u); });
    if (!text && !urls.length) return null;
    var d = h('details', { class: 'srcbox' }, [h('summary', { text: '元の内容を見る' })]);
    if (text) d.appendChild(h('p', { class: 'src', text: text }));
    urls.forEach(function (u, i) {
      d.appendChild(h('p', {}, [h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: linkLabel + (urls.length > 1 ? '(' + (i + 1) + ')' : '') })]));
    });
    return d;
  }

  // ---- 写真・資料を載せる(承認・修正・直接入力の画面で使う)
  var LAYOUTS = { top: '文章の上に、大きく', side: '文章の横に、小さく(パソコンの画面)', bottom: '文章の下に、並べる' };
  var IMG_MAX = 6;
  function driveIds(urlStr) {
    var ids = [];
    String(urlStr || '').split(/\s+/).forEach(function (u) { var m = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,80})/.exec(u); if (m && ids.indexOf(m[1]) < 0) ids.push(m[1]); });
    return ids;
  }
  function toB64(buf) { var b = new Uint8Array(buf), s = '', i; for (i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); }
  function prepFile0(f) {   // 画像は縮小(長い辺1600px・JPEG)。PDFはそのまま(4MBまで)
    if (f.type === 'application/pdf') {
      if (f.size > 4 * 1024 * 1024) return Promise.reject(new Error('big'));
      return f.arrayBuffer().then(function (buf) { return { mime: 'application/pdf', b64: toB64(buf), name: f.name }; });
    }
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return Promise.reject(new Error('type'));
    return createImageBitmap(f).then(function (bm) {
      var sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
      c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      return new Promise(function (ok, ng) { c.toBlob(function (bl) { bl ? bl.arrayBuffer().then(function (buf) { ok({ mime: 'image/jpeg', b64: toB64(buf), name: f.name }); }) : ng(new Error('img')); }, 'image/jpeg', 0.85); });
    });
  }
  // sourceUrl: 取り込み元のファイル(Drive)のリンク。existing: いま載っているもの。layout: 並べ方。
  // get() → { images: [...], imgOk, imgLayout, hasNew }。画像は、「載せる」にチェックしたものだけ。
  function imgPicker(sourceUrl, existing, layout) {
    existing = existing || [];
    var wrap = h('details', { class: 'srcbox imgbox' }, [h('summary', { text: '写真・資料を載せる' + (existing.length ? '(いま ' + existing.length + ' 件)' : '') })]);
    var rows = [], grid = h('div', { class: 'imggrid' }), loaded = false, status = h('p', { class: 'status', role: 'status' });
    function addRow(o) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = !!o.checked;
      var alt = h('input', { type: 'text', maxlength: '80', placeholder: '写真の説明(例: 体験コーナーの様子)', 'aria-label': '写真の説明' }); alt.value = o.alt || '';
      var thumb = h('div', { class: 'imgthumb' });
      var row = { cb: cb, alt: alt, src: o.src || '', pdf: o.pdf || '', fid: o.fid || '', pdfCb: null, thumb: thumb };
      if (o.src) thumb.appendChild(h('img', { src: o.src, alt: '' }));
      else if (o.pdf) thumb.appendChild(h('span', { class: 'muted', text: 'PDF資料' }));
      else thumb.appendChild(h('span', { class: 'muted', text: '読み込み中…' }));
      var lab = h('label', {}, [cb, o.fid ? '載せる(新しい写真・資料)' : '載せる(いま載っているもの)']);
      var right = h('div', {}, [lab, field('写真の説明(読み上げ・見えないときの代わり)', alt)]);
      if (o.pdf && o.src) right.appendChild(h('p', { class: 'hint', text: 'PDFの資料つき(写真を押すとPDFが開きます)' }));
      grid.appendChild(h('div', { class: 'imgrow' }, [thumb, right]));
      row.right = right; rows.push(row);
      return row;
    }
    existing.forEach(function (e) { addRow({ src: e.src, pdf: e.pdf, alt: e.alt, checked: true }); });
    driveIds(sourceUrl).forEach(function (id) { addRow({ fid: id, checked: false }); });
    function loadPreview(row) {
      return api('admin.file.preview', { id: row.fid }).then(function (r) {
        row.thumb.textContent = '';
        if (r && r.ok && r.b64) {
          row.thumb.appendChild(h('img', { src: 'data:' + r.mime + ';base64,' + r.b64, alt: '' }));
          if (r.kind === 'pdf') row.thumb.appendChild(h('span', { class: 'muted', text: 'PDFの1ページ目' }));
        } else if (r && r.ok && r.kind === 'pdf') row.thumb.appendChild(h('span', { class: 'muted', text: 'PDF(表紙の画像はありません。資料として載ります)' }));
        else row.thumb.appendChild(h('span', { class: 'muted', text: '見本を表示できません' }));
        if (r && r.ok && r.kind === 'pdf') {
          row.pdfCb = h('input', { type: 'checkbox' });
          row.right.appendChild(h('label', {}, [row.pdfCb, 'PDFそのものも「資料を開く」で載せる']));
        }
      }).catch(function () { row.thumb.textContent = '見本を表示できません'; });
    }
    wrap.addEventListener('toggle', function () {
      if (!wrap.open || loaded) return; loaded = true;
      rows.filter(function (r) { return r.fid; }).reduce(function (p, r) { return p.then(function () { return loadPreview(r); }); }, Promise.resolve());
    });
    var fin = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf', 'aria-label': '写真・PDFを足す' });
    var add = h('button', { class: 'btn-sub', type: 'button', text: 'この端末から写真・PDFを足す', onclick: function () {
      var f = fin.files && fin.files[0];
      if (!f) { status.className = 'status ng'; status.textContent = '足すファイルを選んでください。'; return; }
      if (rows.length >= IMG_MAX) { status.className = 'status ng'; status.textContent = ERR.imgmax; return; }
      add.disabled = true; status.className = 'status'; status.textContent = '保存しています…';
      prepFile0(f).then(function (pf) { return api('admin.file.upload', { file: pf }); }).then(function (r) {
        add.disabled = false;
        if (r && r.ok) { var row = addRow({ fid: r.fid, checked: true }); loadPreview(row); fin.value = ''; status.className = 'status ok'; status.textContent = '足しました。'; }
        else { status.className = 'status ng'; status.textContent = errText(r); }
      }).catch(function () { add.disabled = false; status.className = 'status ng'; status.textContent = ERR.files; });
    } });
    var lay = sel(['top', 'side', 'bottom'], layout || 'top', function (o) { return LAYOUTS[o]; });
    var ok = h('input', { type: 'checkbox' });
    [h('p', { class: 'hint', text: '取り込んだ写真・PDFが下に出ます。載せたいものに「載せる」を入れてください(6件まで)。子どもの顔や名前が写っているものは、載せる前によく確認してください。' }),
      grid, h('div', { class: 'field' }, [fin]), h('div', { class: 'btn-row' }, [add]), status,
      field('並べ方', lay), h('label', {}, [ok, '載せる写真に、写っている方・個人情報の問題がないことを確認しました(新しく載せるときは必須)'])].forEach(function (x) { wrap.appendChild(x); });
    return { box: wrap, get: function () {
      var images = [];
      rows.forEach(function (r) {
        if (!r.cb.checked) return;
        if (r.fid) images.push({ fid: r.fid, alt: r.alt.value, pdf: !!(r.pdfCb && r.pdfCb.checked) });
        else images.push({ src: r.src, pdf: r.pdf, alt: r.alt.value });
      });
      return { images: images, imgOk: ok.checked, imgLayout: lay.value, hasNew: images.some(function (i) { return i.fid; }) };
    } };
  }
  function imgCheck(pk, res) {   // 送る前の確認。問題があれば文字を出して false
    if (pk.images.length > IMG_MAX) { res.className = 'status ng'; res.textContent = ERR.imgmax; return false; }
    if (pk.hasNew && !pk.imgOk) { res.className = 'status ng'; res.textContent = ERR.imgok; return false; }
    return true;
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
    var tc = targetChecks(p.proposed_target);   // 「skip」(載せない)のときは、どれもチェックなし
    var topic = sel([''].concat(TOPICS), p.topic, function (o) { return o || '(話題なし)'; });
    var attend = sel([''].concat(ATTENDS), p.attendance, function (o) { return o || '(指定なし)'; });
    var date = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : '' });
    var endDate = h('input', { type: 'date', value: '' });
    var dateText = h('input', { type: 'text', maxlength: '60', value: p.date_text || '' });
    var place = h('input', { type: 'text', maxlength: '80', value: p.place || '' });
    var summary = h('textarea', { rows: '4', maxlength: '400' }); summary.value = p.summary || '';
    var url = h('input', { type: 'url', maxlength: '300', value: p.url || '' });
    var res = h('p', { class: 'status', role: 'status' });
    var card = h('section', { class: 'item' });
    var source = srcBox(p.source_text, p.source_url, p.source === 'mail' ? '元のメールを開く(専用アカウントのGmail)' : '元のファイルを開く(Google ドライブ)');
    var badges = h('p');
    if (p.personal_flag) badges.appendChild(h('span', { class: 'badge warn', text: '個人情報が含まれる可能性' }));
    if (p.duplicate_of) badges.appendChild(h('span', { class: 'badge', text: '近い内容がすでにあります' }));
    badges.appendChild(h('span', { class: 'badge', text: '元: ' + (p.source_ref || p.source) }));
    var pick = imgPicker(p.source_url, [], 'top');
    var replCb = null, repl = null;
    if (p.dup_title) {   // 近い内容が、すでにある(公開中・承認待ち)
      replCb = h('input', { type: 'checkbox' }); replCb.checked = true;
      repl = h('div', { class: 'dupbox' }, [h('p', { class: 'hint', text: '近い内容が' + p.dup_where + 'にあります: 「' + p.dup_title + '」' }),
        h('label', {}, [replCb, '入れ替える(古いほうは「取り下げ済み」/載せない扱いにします。消さないので、あとで戻せます)'])]);
    }
    var armedPublic = false;
    function decide(decision) {
      if (decision === 'approve' && !tc.get().length) {   // 載せる先が1つも選ばれていない
        res.className = 'status ng'; res.textContent = '載せる先を、1つ以上選んでください(載せないときは「載せない」を押します)。';
        return;
      }
      if (decision === 'approve' && p.personal_flag && tc.get().indexOf('public') >= 0 && !armedPublic) {   // 個人情報の可能性があるものを、一般に公開する前の再確認
        armedPublic = true; res.className = 'status ng';
        res.textContent = '個人情報が含まれる可能性があります。内容を確認して、問題なければ、もう一度「承認して載せる」を押してください。';
        return;
      }
      var pk = pick.get();
      if (decision === 'approve' && !imgCheck(pk, res)) return;
      approve.disabled = reject.disabled = true; res.textContent = '送信しています…(写真があると少し時間がかかります)';
      api('admin.pending.decide', {
        id: p.id, decision: decision, replace: (decision === 'approve' && replCb && replCb.checked) ? p.duplicate_of : '',
        images: decision === 'approve' ? pk.images : [], imgOk: pk.imgOk,
        edits: { title: title.value, kind: kind.value, targets: decision === 'reject' ? [] : tc.get(), topic: topic.value, attendance: attend.value, date: date.value, endDate: endDate.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, imgLayout: pk.imgLayout }
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
    [badges, repl, source, field('見出し', title), field('種類', kind), field('載せる先(複数選べます)', tc.box), field('話題(ボランティア向けのとき)', topic), field('参加区分(ボランティア向けのとき)', attend),
      field('日付(開始日)', date), field('終了日(複数日のときだけ)', endDate), field('日時の文章', dateText), field('場所', place), field('要約', summary), field('リンク(https)', url),
      pick.box, h('div', { class: 'btn-row' }, [approve, reject]), res].forEach(function (x) { if (x) card.appendChild(x); });
    return card;
  }

  // ---- 取り込み(貼り付け・画像/PDF・メール)
  // 載せ方の指定(載せる先・話題・参加区分・補足メモ)。貼り付けと画像・PDFで共通。空のものは、AIの提案に任せる。
  function presetBox() {
    var tcp = targetChecks('');   // 何も選ばなければ、AIが提案する
    var topic = sel([''].concat(TOPICS), '', function (o) { return o || '(おまかせ・話題なし)'; });
    var attend = sel([''].concat(ATTENDS), '', function (o) { return o || '(指定なし)'; });
    var memo = h('textarea', { rows: '2', maxlength: '300', 'aria-label': '補足メモ', placeholder: '例: 全員参加は不要です。参加できる方だけで。' });
    var box = h('section', { class: 'item' }, [
      h('p', { class: 'hint', text: 'ここで指定すると、承認待ちに、その内容で入ります(承認のときにも直せます)。空のところは、AIが提案します。' }),
      field('載せる先(複数選べます。選ばなければ、AIが提案します)', tcp.box), field('話題(ボランティア向けのとき)', topic), field('参加区分(ボランティア向けのとき)', attend),
      field('補足メモ(任意。要約にも反映します)', memo)]);
    return {
      box: box,
      get: function () { return { targets: tcp.get(), topic: topic.value, attendance: attend.value, memo: memo.value }; },
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
    view.appendChild(h('p', { text: 'LINEのスクリーンショットや写真、PDFを選んでください(8つまで。PDFは1つ4MBまで・合計で約10MBまで)。個人の名前や電話番号は、AIが要約に書かないようになっています。' }));
    var fin = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf', multiple: 'multiple', 'aria-label': '画像・PDFを選ぶ' });
    var fres = h('p', { class: 'status', role: 'status' });
    function toB64(buf) { var b = new Uint8Array(buf), s = '', i; for (i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); }
    function prepFile(f) {   // 画像は縮小(長い辺1600px・JPEG)。PDFはそのまま
      if (f.type === 'application/pdf') {
        if (f.size > 4 * 1024 * 1024) return Promise.reject(new Error('big'));
        return f.arrayBuffer().then(function (buf) { return { mime: 'application/pdf', b64: toB64(buf), name: f.name }; });
      }
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return Promise.reject(new Error('type'));
      return createImageBitmap(f).then(function (bm) {
        var sc = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
        c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
        c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
        return new Promise(function (ok, ng) { c.toBlob(function (bl) { bl ? bl.arrayBuffer().then(function (buf) { ok({ mime: 'image/jpeg', b64: toB64(buf), name: f.name }); }) : ng(new Error('img')); }, 'image/jpeg', 0.85); });
      });
    }
    var fgo = h('button', { class: 'btn', type: 'button', text: 'AIで読み取る', onclick: function () {
      var list = Array.prototype.slice.call(fin.files || []);
      if (!list.length || list.length > 8) { fres.className = 'status ng'; fres.textContent = ERR.files; return; }
      fgo.disabled = true; fres.className = 'status'; fres.textContent = '読み取っています…(1分ほどかかることがあります)';
      Promise.all(list.map(prepFile)).then(function (files) {
        var total = files.reduce(function (n, f) { return n + f.b64.length; }, 0);
        if (total > 13000000) return { ok: false, reason: 'files' };   // 合計が大きすぎる(送信の上限は約14MB)
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
    view.appendChild(addBox(renderPublished));
    view.appendChild(h('h3', { text: 'いま載っているもの' }));
    var list = h('div', { class: 'list' });
    view.appendChild(list);
    api('admin.published.list').then(function (r) {
      if (!r || !r.ok) { say('読み込めませんでした。もう一度ログインしてください。'); return; }
      if (!r.items.length) { list.appendChild(h('p', { class: 'muted', text: 'まだ、載せた内容はありません。' })); return; }
      r.items.forEach(function (it) { list.appendChild(publishedCard(it)); });
    }).catch(function () { say(ERR.failed); });
  }
  // 管理者が直接入れる(勉強会などの単発のお知らせ。承認待ちを通さず、そのまま載る)
  function addBox(reload) {
    var box = h('details', { class: 'item' });
    box.appendChild(h('summary', { text: '＋ お知らせを直接入れる(勉強会など)' }));
    var title = h('input', { type: 'text', maxlength: '80' });
    var kind = sel(KINDS.slice(0, 4), '単発イベント');
    var pick = imgPicker('', [], 'top');
    var tc = targetChecks('public');
    var date = h('input', { type: 'date' });
    var endDate = h('input', { type: 'date' });
    var dateText = h('input', { type: 'text', maxlength: '60' });
    var place = h('input', { type: 'text', maxlength: '80' });
    var summary = h('textarea', { rows: '4', maxlength: '400' });
    var url = h('input', { type: 'url', maxlength: '300' });
    var res = h('p', { class: 'status', role: 'status' });
    var go = h('button', { class: 'btn', type: 'button', text: 'これを載せる', onclick: function () {
      if (!title.value.trim()) { res.className = 'status ng'; res.textContent = '見出しを入れてください。'; return; }
      if (!tc.get().length) { res.className = 'status ng'; res.textContent = '載せる先を1つ以上選んでください。'; return; }
      var pk = pick.get();
      if (!imgCheck(pk, res)) return;
      go.disabled = true; res.className = 'status'; res.textContent = '載せています…';
      api('admin.published.add', { images: pk.images, imgOk: pk.imgOk, edits: { title: title.value, kind: kind.value, targets: tc.get(), date: date.value, endDate: endDate.value,
        dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, imgLayout: pk.imgLayout } }).then(function (r) {
        go.disabled = false;
        if (r && r.ok) { res.className = 'status ok'; res.textContent = '載せました。' + (r.site === 'updated' ? '(サイトの更新は1〜2分かかります)' : ''); setTimeout(reload, 1500); }
        else { res.className = 'status ng'; res.textContent = errText(r); }
      }).catch(function () { go.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    [h('p', { class: 'hint', text: KIND_HINT }), field('見出し', title), field('種類', kind), field('載せる先(複数選べます)', tc.box), field('日付(開始日)', date),
      field('終了日(複数日のときだけ)', endDate), field('日時の文章(例: 12月5日(金)19時〜)', dateText), field('場所', place), field('内容', summary),
      field('リンク(https)', url), pick.box, h('div', { class: 'btn-row' }, [go]), res].forEach(function (x) { box.appendChild(x); });
    return box;
  }
  function publishedCard(it) {
    var card = h('section', { class: 'item' });
    var active = it.status === 'active';
    var title = h('input', { type: 'text', maxlength: '80', value: it.title });
    var kind = sel(KINDS, it.kind);
    var tcq = targetChecks(it.target);
    var topic = sel([''].concat(TOPICS), it.topic, function (o) { return o || '(話題なし)'; });
    var attend = sel([''].concat(ATTENDS), it.attendance, function (o) { return o || '(指定なし)'; });
    var date = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : '' });
    var endDate = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(it.end_date) ? it.end_date : '' });
    var dateText = h('input', { type: 'text', maxlength: '60', value: it.date_text || '' });
    var place = h('input', { type: 'text', maxlength: '80', value: it.place || '' });
    var summary = h('textarea', { rows: '4', maxlength: '400' }); summary.value = it.summary || '';
    var url = h('input', { type: 'url', maxlength: '300', value: it.url || '' });
    var res = h('p', { class: 'status', role: 'status' });
    var badges = h('p', {}, [h('span', { class: 'badge' + (active ? '' : ' warn'), text: STATUS_LABEL[it.status] || it.status }),
      h('span', { class: 'badge', text: targetsText(it.target) || it.target })]);
    var pick = imgPicker(it.source_url, it.images, it.img_layout);
    var dupNote = it.dup_title ? h('p', { class: 'hint' }, [h('span', { class: 'badge warn', text: '重複かも' }), ' 近い内容のものがほかにもあります: 「' + it.dup_title + '」。同じ内容なら、どちらかを取り下げてください。']) : null;
    var inputs = [title, kind, topic, attend, date, endDate, dateText, place, summary, url].concat([].slice.call(tcq.box.querySelectorAll('input')));
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
      var pk = pick.get();
      if (!imgCheck(pk, res)) return;
      save.disabled = true; res.className = 'status'; res.textContent = '保存しています…(写真があると少し時間がかかります)';
      api('admin.published.update', { id: it.id, images: pk.images, imgOk: pk.imgOk, edits: { title: title.value, kind: kind.value, targets: tcq.get(), topic: topic.value, attendance: attend.value,
        date: date.value, endDate: endDate.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, imgLayout: pk.imgLayout } }).then(function (r) {
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
    var source = srcBox('', it.source_url, '元の資料を開く');
    [badges, dupNote, source, field('見出し', title), field('種類', kind), field('載せる先(複数選べます。あとから追加もできます)', tcq.box), field('話題(ボランティア向けのとき)', topic),
      field('参加区分(ボランティア向けのとき)', attend), field('日付(開始日)', date), field('終了日(複数日のとき。この日を過ぎると一般向けから消えます)', endDate), field('日時の文章', dateText), field('場所', place), field('要約', summary),
      field('リンク(https)', url), active ? pick.box : null, h('div', { class: 'btn-row' }, active ? [save, withdraw] : [restore]), res].forEach(function (x) { if (x) card.appendChild(x); });
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
