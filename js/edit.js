// 「その場で直す」ページ(edit.html)。HP専用LINEに届いたリンク(1回きり・10分)から開く。Googleのログインは使わない。
// 守ること: リンクの印はURLの # の後ろにだけあり、読んだらすぐ消す。合言葉(30分)はメモリにだけ置き、POSTの本文で送る。文字は textContent だけで入れる。
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app) return;
  var token = (location.hash || '').replace(/^#/, '');
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* 消せなくても進める */ }
  var session = '', item = null, KINDS = [];
  var IMG_MAX = 6, FILE_MAX = 4 * 1024 * 1024;
  var TARGET_LABEL = { public: '一般向け(だれでも見られるページ)', volunteer: 'ボランティア向け(ログインしたスタッフだけ)' };
  var PROGRESS_LABEL = { '': '(なし)', open: 'これから', doing: '対応中', done: '対応済み' };
  var LAYOUTS = { top: '文章の上に、大きく', side: '文章の横に、小さく(パソコンの画面)', bottom: '文章の下に、並べる' };

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
  function field(label, input, hint) {
    var id = input.id || ('f' + Math.random().toString(36).slice(2, 8));
    input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: label }), input, hint ? h('p', { class: 'hint', text: hint }) : null]);
  }
  function inp(type, value, max) { var e = h('input', { type: type, maxlength: String(max || 200) }); e.value = value || ''; return e; }
  function sel(options, value, labelFn) {
    var s = h('select');
    options.forEach(function (o) { var op = h('option', { value: o, text: labelFn ? labelFn(o) : o }); if (o === value) op.selected = true; s.appendChild(op); });
    return s;
  }
  function say(el, text, ok) { el.className = 'status' + (ok === true ? ' ok' : (ok === false ? ' ng' : '')); el.textContent = text; }
  function call(body) { return window.callGas(body); }
  var ERR = { expired: 'このリンクは使えません(10分たったか、もう一度開いたものです)。LINEのメニュー「公開中を直す」から、新しいリンクを出してください。',
    busy: '混み合っています。少し待ってから、LINEで新しいリンクを出してください。', notfound: 'この内容は、いま公開していません(取り下げ済みなど)。' };

  function showError(reason) {
    app.textContent = '';
    app.appendChild(h('p', { class: 'status ng', text: ERR[reason] || 'うまくいきませんでした。LINEで新しいリンクを出して、もう一度お試しください。' }));
  }

  if (!/^[0-9a-f]{32}$/.test(token)) { showError('expired'); return; }
  if (typeof window.callGas !== 'function') { showError(''); return; }
  app.textContent = '読み込み中です…';
  call({ action: 'edit.open', token: token }).then(function (r) {
    token = '';
    if (!r || !r.ok) { showError(r && r.reason); return; }
    session = r.session; item = r.item; KINDS = r.kinds || [];
    render(r.minutes || 30);
  }).catch(function () { showError(''); });

  function render(minutes) {
    app.textContent = '';
    app.appendChild(h('p', { class: 'hint', text: 'このページで直せるのは、この1件だけです。開いてから ' + minutes + ' 分のあいだ使えます。直したら「保存する」を押してください。' }));
    var title = inp('text', item.title, 80);
    var kind = sel(KINDS.length ? KINDS : [item.kind], item.kind);
    var tChecks = ['public', 'volunteer'].map(function (t) {
      var c = h('input', { type: 'checkbox', value: t }); c.checked = item.targets.indexOf(t) >= 0;
      return { t: t, c: c, box: h('label', { class: 'check' }, [c, ' ' + TARGET_LABEL[t]]) };
    });
    var date = inp('date', item.date), endDate = inp('date', item.endDate), dateText = inp('text', item.dateText, 60);
    var place = inp('text', item.place, 80), url = inp('url', item.url, 300);
    var summary = h('textarea', { rows: '6', maxlength: '400' }); summary.value = item.summary || '';
    var fold = sel(['', 'fold', 'open'], item.fold === 'open' || item.fold === 'fold' ? item.fold : '', function (o) {
      return o === 'fold' ? '本文・写真を「くわしく見る」に折りたたむ' : (o === 'open' ? 'そのまま見せる' : '設定の基本に合わせる(いまは' + (item.foldDefault === 'open' ? 'そのまま見せる' : '折りたたむ') + ')');
    });
    var pinBox = h('input', { type: 'checkbox' }); pinBox.checked = item.pin === true;
    var progress = sel(['', 'open', 'doing', 'done'], item.progress || '', function (o) { return PROGRESS_LABEL[o]; });
    var progNote = h('textarea', { rows: '2', maxlength: '300' }); progNote.value = item.progressNote || '';

    // 写真・資料: いま載っているもの(外せる)+ この端末から足す
    var keep = item.images.map(function (im) { var c = h('input', { type: 'checkbox' }); c.checked = true; return { im: im, c: c }; });
    var added = [];
    var picBox = h('div', { class: 'list' });
    var layout = sel(Object.keys(LAYOUTS), item.imgLayout || 'top', function (o) { return LAYOUTS[o]; });
    var okBox = h('input', { type: 'checkbox' });
    var picMsg = h('p', { class: 'status', role: 'status' });
    function drawPics() {
      picBox.textContent = '';
      keep.forEach(function (k) {
        var row = h('div', { class: 'item' });
        if (k.im.src) row.appendChild(h('img', { src: k.im.src, alt: k.im.alt || '', style: 'max-width:100%;max-height:220px;height:auto;border-radius:8px' }));
        if (k.im.pdf && !k.im.src) row.appendChild(h('p', { text: '資料(PDF)' }));
        row.appendChild(h('label', { class: 'check' }, [k.c, ' このまま載せる(外すときはチェックを外す)']));
        picBox.appendChild(row);
      });
      added.forEach(function (a, i) {
        var row = h('div', { class: 'item' });
        if (a.preview) row.appendChild(h('img', { src: a.preview, alt: '', style: 'max-width:100%;max-height:220px;height:auto;border-radius:8px' }));
        else row.appendChild(h('p', { text: 'PDF: ' + a.name }));
        row.appendChild(h('button', { class: 'btn-sub', type: 'button', text: '足すのをやめる', onclick: function () { added.splice(i, 1); drawPics(); } }));
        picBox.appendChild(row);
      });
      if (!keep.length && !added.length) picBox.appendChild(h('p', { class: 'muted', text: '写真・資料はありません。' }));
    }
    var fileIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf', multiple: 'multiple' });
    fileIn.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileIn.files || []);
      fileIn.value = '';
      files.forEach(function (f) {
        if (keep.filter(function (k) { return k.c.checked; }).length + added.length >= IMG_MAX) { say(picMsg, '写真・資料は ' + IMG_MAX + ' つまでです。', false); return; }
        if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { say(picMsg, '写真(JPEG・PNG・WebP)とPDFだけ足せます。', false); return; }
        if (f.size > FILE_MAX) { say(picMsg, '「' + f.name + '」は大きすぎます(4MBまで)。', false); return; }
        var rd = new FileReader();
        rd.onload = function () {
          var d = String(rd.result || ''), b64 = d.slice(d.indexOf(',') + 1);
          added.push({ mime: f.type, b64: b64, name: f.name, preview: f.type === 'application/pdf' ? '' : d });
          drawPics();
        };
        rd.readAsDataURL(f);
      });
    });
    drawPics();

    var res = h('p', { class: 'status', role: 'status' });
    var save = h('button', { class: 'btn', type: 'button', text: '保存する', onclick: function () {
      var targets = tChecks.filter(function (x) { return x.c.checked; }).map(function (x) { return x.t; });
      if (!targets.length) { say(res, '載せる先を1つ以上選んでください。', false); return; }
      if (added.length && !okBox.checked) { say(res, '新しく足す写真は、写っている人・個人情報を確かめてから、下のチェックを入れてください。', false); return; }
      var images = keep.filter(function (k) { return k.c.checked; }).map(function (k) { return { src: k.im.src, pdf: k.im.pdf, alt: k.im.alt || '' }; })
        .concat(added.map(function (a) { return { b64: a.b64, mime: a.mime, alt: title.value.slice(0, 80) }; }));
      save.disabled = true; say(res, '保存しています…');
      call({ action: 'edit.save', session: session, imgOk: okBox.checked, images: images,
        edits: { title: title.value, kind: kind.value, targets: targets, date: date.value, endDate: endDate.value, dateText: dateText.value, place: place.value,
                 summary: summary.value, url: url.value, imgLayout: layout.value, fold: fold.value, pin: pinBox.checked, progress: progress.value, progressNote: progNote.value } }).then(function (r) {
        save.disabled = false;
        if (r && r.ok) {
          item = r.item || item; added = []; keep = item.images.map(function (im) { var c = h('input', { type: 'checkbox' }); c.checked = true; return { im: im, c: c }; }); okBox.checked = false; drawPics();
          say(res, '保存しました。' + (r.site && r.site !== 'updated' ? '(一般向けのページの更新だけ失敗しました。管理ページの「設定」から作り直してください)' : 'ページへの反映には1〜2分かかります。'), true);
        } else say(res, r && r.reason === 'expired' ? '時間切れです。LINEで新しいリンクを出してください(直した内容は保存されていません)。' : 'うまく保存できませんでした(' + ((r && r.reason) || '原因不明') + ')。', false);
      }).catch(function () { save.disabled = false; say(res, '通信がうまくいきませんでした。もう一度押してください。', false); });
    } });

    var wdStep = 0, wres = h('p', { class: 'status', role: 'status' });
    var wd = h('button', { class: 'btn-sub', type: 'button', text: 'この内容を取り下げる', onclick: function () {
      if (wdStep === 0) { wdStep = 1; wd.textContent = '本当に取り下げる(もう一度押す)'; say(wres, '取り下げると、ページから消えます。戻すときは、管理ページの「公開中」から「公開に戻す」を押してください。'); return; }
      wd.disabled = true;
      call({ action: 'edit.withdraw', session: session }).then(function (r) {
        if (r && r.ok) { app.textContent = ''; app.appendChild(h('p', { class: 'status ok', text: '取り下げました。ページへの反映には1〜2分かかります。' })); }
        else { wd.disabled = false; say(wres, r && r.reason === 'expired' ? '時間切れです。LINEで新しいリンクを出してください。' : 'うまくいきませんでした。', false); }
      }).catch(function () { wd.disabled = false; say(wres, '通信がうまくいきませんでした。', false); });
    } });

    [field('題名', title), field('種類', kind),
     h('fieldset', { class: 'field' }, [h('legend', { text: '載せる先' })].concat(tChecks.map(function (x) { return x.box; }))),
     field('日付', date), field('終了日(複数日のとき。過ぎるとお知らせから消えます)', endDate), field('日時の文(例: 11月13日(金)・14日(土))', dateText),
     field('場所', place), field('内容', summary), field('リンク(https から始まるもの)', url),
     field('表示(スマホで長くなるときは折りたたむ)', fold),
     h('label', { class: 'check' }, [pinBox, ' トップのお知らせの上に固定する(大事なお知らせだけ)']),
     field('やることの状況(ボランティア向けのページに出ます)', progress), field('対応メモ', progNote),
     h('h2', { text: '写真・資料' }), picBox, field('写真・PDFを足す(6つまで・1つ4MBまで)', fileIn), picMsg, field('並べ方', layout),
     h('label', { class: 'check' }, [okBox, ' 新しく足す写真の、写っている人・個人情報を確かめました(足した写真は、あとで外しても、サイトの記録には残ります)']),
     h('div', { class: 'btn-row' }, [save]), res,
     h('h2', { text: '取り下げ' }), h('div', { class: 'btn-row' }, [wd]), wres].forEach(function (x) { if (x) app.appendChild(x); });
  }
})();
