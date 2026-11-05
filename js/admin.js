// 管理ページの画面。文字は textContent だけで入れる(HTMLとして解釈しない)。データは、名簿に載った管理者にだけGASが返す。
(function () {
  'use strict';
  var TARGET_LABEL = { public: '一般向け(誰でも見られる)', maker: 'メーカー向け', volunteer: 'ボランティア向け', skip: '載せない' };
  var KINDS = ['お知らせ', 'イベント', '単発イベント', '機器展の内容', 'タスク', 'その他'];
  var KIND_HINT = '種類: 高知ふくし機器展そのもの=「イベント」(トップ・イベント情報に出る)/機器展の中のセミナー・展示・地図・資料=「機器展の内容」(機器展のページに出る。終わっても残る)/勉強会などの単発=「単発イベント」(トップ・みんなのお知らせ掲示板に出る)。日付(終了日)を過ぎると、一般向けのお知らせ・掲示板から自動で消えます。';
  var TOPICS = ['配置', '当日の流れ', '相談', '議事録置き場', 'セミナー', '定例会予定', '事務局への回答'];
  var ATTENDS = ['全員参加', '希望者のみ', 'リーダーのみ'];
  var PROGRESS_LABEL = { '': '(なし)', doing: '対応中', done: '対応済み' };
  var TASK_LABEL = { open: 'これから', doing: '対応中', done: '済' };
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

  // 話題: 一覧から選ぶか、「新しい話題を文字で入れる」を選んで入力する
  var KNOWN_TOPICS = TOPICS.slice();
  function topicInput(initial) {
    var known = KNOWN_TOPICS.slice();
    if (initial && known.indexOf(initial) < 0) known.push(initial);
    var s = h('select', { 'aria-label': '話題' });
    [''].concat(known).forEach(function (o) { var op = h('option', { value: o, text: o || '(話題なし)' }); if (o === (initial || '')) op.selected = true; s.appendChild(op); });
    s.appendChild(h('option', { value: '__new__', text: '＋ 新しい話題を文字で入れる' }));
    var t = h('input', { type: 'text', maxlength: '20', placeholder: '新しい話題(20字まで)', 'aria-label': '新しい話題' });
    t.hidden = true;
    s.addEventListener('change', function () { t.hidden = s.value !== '__new__'; if (!t.hidden) t.focus(); });
    return { box: h('div', {}, [s, t]), inputs: [s, t], get: function () { return s.value === '__new__' ? t.value.trim() : s.value; } };
  }

  // 反映したページを、すぐ開いて確かめるためのリンク(反映には1〜2分かかる)
  function fiscalYearOf(date) {
    var d = /^(\d{4})-(\d{2})/.exec(date || ''), y, m;
    if (d) { y = +d[1]; m = +d[2]; } else { var n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; }
    return m >= 4 ? y : y - 1;
  }
  function pageLinks(res, kind, targets, date) {
    var t = [].concat(targets || []), links = [];
    if (t.indexOf('public') >= 0) {
      if (kind === '機器展の内容') links.push(['機器展のページ', 'kikiten-' + fiscalYearOf(date) + '.html']);
      if (kind === 'イベント') links.push(['イベント情報', 'events.html']);
      if (kind === '単発イベント') links.push(['みんなのお知らせ', 'board.html']);
      if (['お知らせ', 'イベント', '単発イベント', 'その他'].indexOf(kind) >= 0) links.push(['トップページ', 'index.html']);
    }
    if (t.indexOf('volunteer') >= 0) links.push(['ボランティア向けページ', 'volunteer.html']);
    var old = res.parentNode && res.parentNode.querySelector('.pagelinks');
    if (old) old.remove();
    if (!links.length || !res.parentNode) return false;
    var p = h('p', { class: 'pagelinks' }, [h('span', { text: '反映されたページを開く(反映に1〜2分かかります。出ないときは、少し待って再読み込み): ' })]);
    links.forEach(function (l, i) { if (i) p.appendChild(document.createTextNode(' / ')); p.appendChild(h('a', { href: l[1], target: '_blank', rel: 'noopener noreferrer', text: l[0] })); });
    res.parentNode.insertBefore(p, res.nextSibling);
    return true;
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
  // ファイルをドラッグして入れる場所。onFiles(ファイルの配列)。クリックでも選べる。
  function dropZone(label, multiple, onFiles) {
    var inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf', 'aria-label': label });
    if (multiple) inp.multiple = true;
    inp.className = 'dz-input';
    var z = h('label', { class: 'dropzone' }, [h('span', { text: label }), inp]);
    function take(files) { var l = Array.prototype.slice.call(files || []); if (l.length) onFiles(l); }
    inp.addEventListener('change', function () { take(inp.files); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); }); });
    z.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files); });
    return z;
  }
  // ほかの場所にドロップして、ブラウザがファイルを開いてしまわないように
  ['dragover', 'drop'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (!e.target.closest || !e.target.closest('.dropzone')) e.preventDefault(); }); });

  function driveOpenUrl(id) { return 'https://drive.google.com/file/d/' + id + '/view'; }

  // sourceUrl: 取り込み元のファイル(Drive)のリンク。existing: いま載っているもの。layout: 並べ方。picks: 最初からチェックを入れるファイルid(AIが選んだもの)。
  // get() → { images: [...], imgOk, imgLayout, hasNew }。画像は、「載せる」にチェックしたものだけ。
  function imgPicker(sourceUrl, existing, layout, picks) {
    existing = existing || []; picks = picks || [];
    var wrap = h('details', { class: 'srcbox imgbox' }, [h('summary', { text: '写真・資料を載せる' + (existing.length ? '(いま ' + existing.length + ' 件)' : '') })]);
    var rows = [], grid = h('div', { class: 'imggrid' }), loaded = false, status = h('p', { class: 'status', role: 'status' });
    if (picks.length) wrap.open = true;
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
      if (o.fid) right.appendChild(h('p', {}, [h('a', { href: driveOpenUrl(o.fid), target: '_blank', rel: 'noopener noreferrer', text: '元のファイルを開く(Google ドライブ)' })]));
      if (o.pdf && o.src) right.appendChild(h('p', { class: 'hint', text: 'PDFの資料つき(写真を押すとPDFが開きます)' }));
      var box = h('div', { class: 'imgrow' }, [thumb, right]);
      grid.appendChild(box);
      row.right = right; row.box = box; rows.push(row);
      return row;
    }
    existing.forEach(function (e) { addRow({ src: e.src, pdf: e.pdf, alt: e.alt, checked: true }); });
    driveIds(sourceUrl).forEach(function (id) { addRow({ fid: id, checked: picks.indexOf(id) >= 0 }); });
    function loadPreview(row) {
      return api('admin.file.preview', { id: row.fid }).then(function (r) {
        row.thumb.textContent = '';
        if (r && r.ok && r.b64) {
          row.thumb.appendChild(h('img', { src: 'data:' + r.mime + ';base64,' + r.b64, alt: '' }));
          if (r.kind === 'pdf') row.thumb.appendChild(h('span', { class: 'muted', text: 'PDFの1ページ目' }));
        } else if (r && r.ok && r.kind === 'pdf') row.thumb.appendChild(h('span', { class: 'muted', text: 'PDF(表紙の画像はありません。資料として載ります)' }));
        else {   // Excel・Word など、写真としては載せられないもの(下の「元のファイルを開く」で中身を見られます)
          row.thumb.appendChild(h('span', { class: 'muted', text: '写真としては載せられません' }));
          row.cb.checked = false; row.cb.disabled = true; row.alt.disabled = true;
        }
        if (r && r.ok && r.kind === 'pdf') {
          row.pdfCb = h('input', { type: 'checkbox' });
          row.right.appendChild(h('label', {}, [row.pdfCb, 'PDFそのものも「資料を開く」で載せる']));
        }
      }).catch(function () { row.thumb.textContent = '見本を表示できません'; });
    }
    function loadAll() {
      if (loaded) return; loaded = true;
      rows.filter(function (r) { return r.fid; }).reduce(function (p, r) { return p.then(function () { return loadPreview(r); }); }, Promise.resolve());
    }
    wrap.addEventListener('toggle', function () { if (wrap.open) loadAll(); });
    if (wrap.open) setTimeout(loadAll, 0);
    function addFiles(list) {   // この端末から足す(ドラッグ・選択)。1つずつ縮小して保存する
      var left = list.slice();
      status.className = 'status'; status.textContent = '保存しています…';
      (function next() {
        var f = left.shift();
        if (!f) { status.className = 'status ok'; status.textContent = '足しました。載せるものにチェックを入れて、承認・保存してください。'; return; }
        if (rows.length >= IMG_MAX) { status.className = 'status ng'; status.textContent = ERR.imgmax; return; }
        prepFile0(f).then(function (pf) { return api('admin.file.upload', { file: pf }); }).then(function (r) {
          if (r && r.ok) { var row = addRow({ fid: r.fid, checked: true }); loadPreview(row); wrap.open = true; next(); }
          else { status.className = 'status ng'; status.textContent = errText(r); }
        }).catch(function () { status.className = 'status ng'; status.textContent = ERR.files; });
      })();
    }
    var lay = sel(['top', 'side', 'bottom'], layout || 'top', function (o) { return LAYOUTS[o]; });
    var ok = h('input', { type: 'checkbox' });
    [h('p', { class: 'hint', text: '載せたいものに「載せる」を入れてください(6件まで)。取り込んだ写真・PDFは、AIが選んだものにチェックが入っています。子どもの顔や名前が写っているものは、載せる前によく確認してください。' }),
      grid, dropZone('ここに写真・PDFをドラッグして入れる(押して選ぶこともできます)', true, addFiles), status,
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
      if (r.topics) KNOWN_TOPICS = r.topics;
      r.items.forEach(function (p) { view.appendChild(pendingCard(p)); });
    }).catch(function () { say(ERR.failed); });
  }
  function pendingCard(p) {
    var title = h('input', { type: 'text', maxlength: '80', value: p.title });
    var kind = sel(KINDS, p.kind);
    var tc = targetChecks(p.proposed_target);   // 「skip」(載せない)のときは、どれもチェックなし
    var topic = topicInput(p.topic);
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
    var pick = imgPicker(p.source_url, [], 'top', String(p.img_pick || '').split(/\s+/).filter(Boolean));
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
        edits: { title: title.value, kind: kind.value, targets: decision === 'reject' ? [] : tc.get(), topic: topic.get(), attendance: attend.value, date: date.value, endDate: endDate.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, imgLayout: pk.imgLayout }
      }).then(function (r) {
        if (r && r.ok) {
          res.className = 'status ok';
          res.textContent = decision === 'reject' ? '載せないことにしました。' :
            (r.published ? (r.site === 'updated' ? '載せました。サイトの更新は1〜2分かかります。' : (r.site === 'no-token' ? '保存しました(サイトの更新設定が未完了です)。' : '保存しました。')) : '載せないことにしました。');
          var shown = decision === 'approve' && r.published && pageLinks(res, kind.value, tc.get(), date.value);
          setTimeout(function () { card.remove(); }, shown ? 20000 : 1500);   // リンクを押せるよう、少し長く残す
        } else { res.className = 'status ng'; res.textContent = errText(r); approve.disabled = reject.disabled = false; }
      }).catch(function () { res.className = 'status ng'; res.textContent = ERR.failed; approve.disabled = reject.disabled = false; });
    }
    var approve = h('button', { class: 'btn', type: 'button', text: '承認して載せる', onclick: function () { decide('approve'); } });
    var reject = h('button', { class: 'btn-sub', type: 'button', text: '載せない', onclick: function () { decide('reject'); } });
    [badges, repl, source, field('見出し', title), field('種類', kind), field('載せる先(複数選べます)', tc.box), field('話題(ボランティア向けのとき。一覧にないものは文字で入れられます)', topic.box), field('参加区分(ボランティア向けのとき)', attend),
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
    var fnames = h('p', { class: 'hint' });
    function showNames() { var l = Array.prototype.slice.call(fin.files || []); fnames.textContent = l.length ? '選んだファイル(' + l.length + '件): ' + l.map(function (f) { return f.name; }).join('、') : ''; }
    fin.addEventListener('change', showNames);
    var fdrop = h('div', { class: 'dropzone', role: 'group', 'aria-label': 'ここにドラッグして入れる' }, [h('span', { text: 'ここに写真・PDFをドラッグして入れる(下のボタンで選ぶこともできます)' })]);
    ['dragenter', 'dragover'].forEach(function (ev) { fdrop.addEventListener(ev, function (e) { e.preventDefault(); fdrop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { fdrop.addEventListener(ev, function (e) { e.preventDefault(); fdrop.classList.remove('over'); }); });
    fdrop.addEventListener('drop', function (e) { var dt = e.dataTransfer; if (dt && dt.files && dt.files.length) { try { fin.files = dt.files; } catch (x) { /* 入れられないときは、下のボタンから */ } showNames(); } });
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
    view.appendChild(fdrop);
    view.appendChild(h('div', { class: 'field' }, [fin])); view.appendChild(fnames);
    view.appendChild(h('p', { class: 'hint', text: '取り込んだ写真・PDFは、承認のときに「載せる写真」の候補になります(AIが、どの内容の写真かを選んで、チェックを入れておきます)。' }));
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
      if (r.topics) KNOWN_TOPICS = r.topics;
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
    var topic = topicInput('');
    var attend = sel([''].concat(ATTENDS), '', function (o) { return o || '(指定なし)'; });
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
      api('admin.published.add', { images: pk.images, imgOk: pk.imgOk, edits: { title: title.value, kind: kind.value, targets: tc.get(), topic: topic.get(), attendance: attend.value, date: date.value, endDate: endDate.value,
        dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, imgLayout: pk.imgLayout } }).then(function (r) {
        go.disabled = false;
        if (r && r.ok) { res.className = 'status ok'; res.textContent = '載せました。' + (r.site === 'updated' ? '(サイトの更新は1〜2分かかります)' : ''); var shown = pageLinks(res, kind.value, tc.get(), date.value); setTimeout(reload, shown ? 20000 : 1500); }
        else { res.className = 'status ng'; res.textContent = errText(r); }
      }).catch(function () { go.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    [h('p', { class: 'hint', text: KIND_HINT }), field('見出し', title), field('種類', kind), field('載せる先(複数選べます)', tc.box), field('話題(ボランティア向けのとき。文字で新しく入れられます)', topic.box), field('参加区分(ボランティア向けのとき)', attend), field('日付(開始日)', date),
      field('終了日(複数日のときだけ)', endDate), field('日時の文章(例: 12月5日(金)19時〜)', dateText), field('場所', place), field('内容', summary),
      field('リンク(https)', url), pick.box, h('div', { class: 'btn-row' }, [go]), res].forEach(function (x) { box.appendChild(x); });
    return box;
  }
  function publishedCard(it, onChange) {
    var card = h('section', { class: 'item' });
    var active = it.status === 'active';
    var title = h('input', { type: 'text', maxlength: '80', value: it.title });
    var kind = sel(KINDS, it.kind);
    var tcq = targetChecks(it.target);
    var topic = topicInput(it.topic);
    var attend = sel([''].concat(ATTENDS), it.attendance, function (o) { return o || '(指定なし)'; });
    var date = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : '' });
    var endDate = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(it.end_date) ? it.end_date : '' });
    var dateText = h('input', { type: 'text', maxlength: '60', value: it.date_text || '' });
    var place = h('input', { type: 'text', maxlength: '80', value: it.place || '' });
    var summary = h('textarea', { rows: '4', maxlength: '400' }); summary.value = it.summary || '';
    var url = h('input', { type: 'url', maxlength: '300', value: it.url || '' });
    var progress = sel(['', 'doing', 'done'], it.progress || '', function (o) { return PROGRESS_LABEL[o]; });
    var progNote = h('textarea', { rows: '2', maxlength: '300', placeholder: '例: 11/5 県社協へ○○を送りました' }); progNote.value = it.progress_note || '';
    var res = h('p', { class: 'status', role: 'status' });
    var badges = h('p', {}, [h('span', { class: 'badge' + (active ? '' : ' warn'), text: STATUS_LABEL[it.status] || it.status }),
      h('span', { class: 'badge', text: targetsText(it.target) || it.target })]);
    var pick = imgPicker(it.source_url, it.images, it.img_layout);
    var dupNote = it.dup_title ? h('p', { class: 'hint' }, [h('span', { class: 'badge warn', text: '重複かも' }), ' 近い内容のものがほかにもあります: 「' + it.dup_title + '」。同じ内容なら、どちらかを取り下げてください。']) : null;
    var inputs = [title, kind, attend, date, endDate, dateText, place, summary, url, progress, progNote].concat(topic.inputs).concat([].slice.call(tcq.box.querySelectorAll('input')));
    if (!active) inputs.forEach(function (x) { x.disabled = true; });
    function done(r, okText) {
      if (r && r.ok) {
        res.className = 'status ok';
        res.textContent = okText + (r.site === 'updated' ? '(サイトの更新は1〜2分かかります)' : (r.site ? '(サイトの更新がうまくいきませんでした。「設定」から「公開データを作り直す」を押してください)' : ''));
        var shown = okText.indexOf('取り下げ') < 0 && pageLinks(res, kind.value, tcq.get(), date.value);
        if (onChange) setTimeout(onChange, shown ? 20000 : 1800);
        return true;
      }
      res.className = 'status ng'; res.textContent = errText(r); return false;
    }
    var save = h('button', { class: 'btn', type: 'button', text: '修正を保存', onclick: function () {
      var pk = pick.get();
      if (!imgCheck(pk, res)) return;
      save.disabled = true; res.className = 'status'; res.textContent = '保存しています…(写真があると少し時間がかかります)';
      api('admin.published.update', { id: it.id, images: pk.images, imgOk: pk.imgOk, edits: { title: title.value, kind: kind.value, targets: tcq.get(), topic: topic.get(), attendance: attend.value,
        date: date.value, endDate: endDate.value, dateText: dateText.value, place: place.value, summary: summary.value, url: url.value, imgLayout: pk.imgLayout, progress: progress.value, progressNote: progNote.value } }).then(function (r) {
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
    [badges, dupNote, source, field('見出し', title), field('種類', kind), field('載せる先(複数選べます。あとから追加もできます)', tcq.box), field('話題(ボランティア向けのとき。一覧にないものは文字で入れられます)', topic.box),
      field('参加区分(ボランティア向けのとき)', attend), field('日付(開始日)', date), field('終了日(複数日のとき。この日を過ぎると一般向けから消えます)', endDate), field('日時の文章', dateText), field('場所', place), field('要約', summary),
      field('リンク(https)', url), field('対応状況(依頼などのとき。ボランティア向けのページに出ます)', progress), field('対応メモ(送った内容・済んだことなど。ボランティア向けのページに出ます)', progNote), active ? pick.box : null, h('div', { class: 'btn-row' }, active ? [save, withdraw] : [restore]), res].forEach(function (x) { if (x) card.appendChild(x); });
    return card;
  }

  // ---- やること(タスク): 状態・メモ(送った内容、済んだこと)を書き込める。消さずに「済」にして記録に残す。
  function tasksBox() {
    var box = h('section', { class: 'item' }, [h('h3', { text: 'やること(ボランティア向けページの「やること」)' })]);
    var list = h('div', { class: 'list' }), res = h('p', { class: 'status', role: 'status' });
    var nt = h('input', { type: 'text', maxlength: '80', placeholder: '新しいやること(例: ○○の資料を事務局へ送る)', 'aria-label': '新しいやること' });
    var nd = h('input', { type: 'date', 'aria-label': '期限' });
    function load() {
      list.textContent = '読み込み中です…';
      api('admin.tasks.list').then(function (r) {
        list.textContent = '';
        if (!r || !r.ok) { list.textContent = '読み込めませんでした。'; return; }
        if (!r.items.length) list.appendChild(h('p', { class: 'muted', text: 'やることは、まだありません。' }));
        r.items.forEach(function (t) { list.appendChild(taskRow(t)); });
      }).catch(function () { list.textContent = ERR.failed; });
    }
    function taskRow(t) {
      var st = sel(['open', 'doing', 'done'], t.status, function (o) { return TASK_LABEL[o]; });
      var title = h('input', { type: 'text', maxlength: '80', value: t.title });
      var due = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '' });
      var note = h('textarea', { rows: '2', maxlength: '300', placeholder: '送った内容・済んだことなど(ボランティア向けのページに出ます)' }); note.value = t.note || '';
      var r2 = h('p', { class: 'status', role: 'status' });
      var save = h('button', { class: 'btn-sub', type: 'button', text: '保存', onclick: function () {
        save.disabled = true; r2.className = 'status'; r2.textContent = '保存しています…';
        api('admin.tasks.update', { id: t.id, title: title.value, due: due.value, status: st.value, note: note.value }).then(function (r) {
          save.disabled = false; r2.className = 'status ' + (r && r.ok ? 'ok' : 'ng'); r2.textContent = r && r.ok ? '保存しました。' : errText(r);
        }).catch(function () { save.disabled = false; r2.className = 'status ng'; r2.textContent = ERR.failed; });
      } });
      return h('div', { class: 'item' }, [field('やること', title), field('期限', due), field('状態', st), field('対応メモ', note), h('div', { class: 'btn-row' }, [save]), r2]);
    }
    var addBtn = h('button', { class: 'btn', type: 'button', text: '足す', onclick: function () {
      if (!nt.value.trim()) { res.className = 'status ng'; res.textContent = 'やることを入れてください。'; return; }
      addBtn.disabled = true;
      api('admin.tasks.add', { title: nt.value, due: nd.value }).then(function (r) {
        addBtn.disabled = false;
        if (r && r.ok) { nt.value = ''; nd.value = ''; res.className = 'status ok'; res.textContent = '足しました。'; load(); } else { res.className = 'status ng'; res.textContent = errText(r); }
      }).catch(function () { addBtn.disabled = false; res.className = 'status ng'; res.textContent = ERR.failed; });
    } });
    [field('新しいやること', nt), field('期限(任意)', nd), h('div', { class: 'btn-row' }, [addBtn]), res, list].forEach(function (x) { box.appendChild(x); });
    load();
    return box;
  }

  // ---- ページで直す: 公開しているページと同じ見た目で並べて、そこから直す・取り下げる・写真を足す
  var PAGE_GROUPS = [
    ['top', 'トップのお知らせ'], ['board', 'みんなのお知らせ'], ['events', 'イベント情報'], ['kikiten', '機器展のページ'],
    ['volunteer', 'ボランティア向け'], ['maker', 'メーカー向け'], ['out', '取り下げ済み']
  ];
  function todayJst() { var d = new Date(Date.now() + 9 * 3600000); return d.toISOString().slice(0, 10); }
  function isExpiredIt(it) { var last = it.end_date || it.date; return !!last && last < todayJst(); }
  function pageOf(it) {   // この内容が、どのページに出るか(複数のことがある)
    var g = [];
    if (it.status !== 'active') return ['out'];
    var t = String(it.target || '').split(',');
    if (t.indexOf('public') >= 0) {
      if (it.kind === '機器展の内容') g.push('kikiten');
      if (it.kind === 'イベント') g.push('events');
      if (it.kind === '単発イベント' && !isExpiredIt(it)) g.push('board');
      if (['お知らせ', 'イベント', '単発イベント', 'その他'].indexOf(it.kind) >= 0 && !isExpiredIt(it)) g.push('top');
    }
    if (t.indexOf('volunteer') >= 0) g.push('volunteer');
    if (t.indexOf('maker') >= 0) g.push('maker');
    return g;
  }
  function previewItem(it) {   // 公開ページと同じ並べ方の見本
    var lay = it.images && it.images.length ? it.img_layout || 'top' : '';
    var d = h('div', { class: 'item' + (lay ? ' has-pics pics-' + lay : '') });
    var main = h('div', { class: 'item-main' });
    var when = it.date_text || it.date;
    if (when) main.appendChild(h('time', { text: when }));
    main.appendChild(h('h3', { text: it.title }));
    if (it.place) main.appendChild(h('p', { text: '場所: ' + it.place }));
    if (it.summary) main.appendChild(h('p', { text: it.summary }));
    if (it.topic) main.appendChild(h('p', { class: 'hint', text: '話題: ' + it.topic }));
    var pics = null;
    if (lay) {
      pics = h('div', { class: 'item-pics' });
      it.images.forEach(function (im) {
        if (im.src) pics.appendChild(h('figure', { class: 'pic' }, [h('img', { src: im.src, alt: im.alt || '' })]));
        else if (im.pdf) pics.appendChild(h('p', { class: 'pic-file', text: '資料(PDF)あり' }));
      });
    }
    if (lay === 'bottom') { d.appendChild(main); if (pics) d.appendChild(pics); } else { if (pics) d.appendChild(pics); d.appendChild(main); }
    return d;
  }
  var liveGroup = 'top';
  function renderLive() {
    view.textContent = '';
    view.appendChild(h('h2', { text: 'ページで直す' }));
    view.appendChild(h('p', { class: 'hint', text: '公開しているページに近い見た目で並べています。「直す」を押すと、その場で文章の修正・写真の追加・取り下げができます。' }));
    var chips = h('div', { class: 'tabs', role: 'group', 'aria-label': 'ページを選ぶ' });
    var list = h('div', { class: 'list' });
    view.appendChild(chips); view.appendChild(list);
    api('admin.published.list').then(function (r) {
      if (!r || !r.ok) { say('読み込めませんでした。もう一度ログインしてください。'); return; }
      if (r.topics) KNOWN_TOPICS = r.topics;
      var items = r.items.slice();
      var by = {}; PAGE_GROUPS.forEach(function (g) { by[g[0]] = []; });
      items.forEach(function (it) { pageOf(it).forEach(function (k) { if (by[k]) by[k].push(it); }); });
      by.top = by.top.sort(function (a, b) { return String(b.published_at).localeCompare(String(a.published_at)); });
      var topIds = by.top.slice(0, 5).map(function (x) { return x.id; });
      function show() {
        list.textContent = '';
        Array.prototype.forEach.call(chips.children, function (b) { b.className = 'tab' + (b.getAttribute('data-k') === liveGroup ? ' on' : ''); });
        var arr = by[liveGroup] || [];
        if (liveGroup === 'volunteer') { list.appendChild(tasksBox()); list.appendChild(addBox(renderLive)); }
        else if (liveGroup === 'top' || liveGroup === 'board' || liveGroup === 'events' || liveGroup === 'kikiten') list.appendChild(addBox(renderLive));
        if (liveGroup === 'top') list.appendChild(h('p', { class: 'hint', text: 'トップには、新しいものから5件まで出ます(「トップに出ない」の印のものは、6件目以降です)。' }));
        if (!arr.length) { list.appendChild(h('p', { class: 'muted', text: 'このページに出ている内容はありません。' })); return; }
        arr.forEach(function (it) {
          var wrap = h('div', { class: 'livewrap' });
          if (liveGroup === 'top' && topIds.indexOf(it.id) < 0) wrap.appendChild(h('p', {}, [h('span', { class: 'badge warn', text: 'トップに出ない(5件を超えています)' })]));
          if (it.dup_title) wrap.appendChild(h('p', {}, [h('span', { class: 'badge warn', text: '重複かも' }), ' 近い内容: 「' + it.dup_title + '」']));
          wrap.appendChild(previewItem(it));
          var editor = null;
          var edit = h('button', { class: 'btn-sub', type: 'button', text: '直す・写真を足す・取り下げる', onclick: function () {
            if (editor) { editor.remove(); editor = null; edit.textContent = '直す・写真を足す・取り下げる'; return; }
            editor = publishedCard(it, renderLive); wrap.appendChild(editor); edit.textContent = '閉じる';
          } });
          wrap.appendChild(h('div', { class: 'btn-row' }, [edit]));
          list.appendChild(wrap);
        });
      }
      PAGE_GROUPS.forEach(function (g) {
        chips.appendChild(h('button', { class: 'tab', type: 'button', 'data-k': g[0], text: g[1] + '(' + by[g[0]].length + ')', onclick: function () { liveGroup = g[0]; show(); } }));
      });
      show();
    }).catch(function () { say(ERR.failed); });
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
      row('AIのキー(' + (r.aiProvider === 'anthropic' ? 'Claude Haiku' : 'Gemini') + ')', r.hasAiKey, '今月の使用量 ' + r.ai.used + ' / 上限 ' + r.ai.cap);
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

  var TABS = [['承認待ち', renderPending], ['取り込み', renderIngest], ['ページで直す', renderLive], ['公開中', renderPublished], ['お問い合わせ', renderContacts], ['名簿', renderRoster], ['設定', renderSettings]];
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
