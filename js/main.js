(function () {
  'use strict';
  var root = document.documentElement;
  root.className += ' js';

  // メニュー(スマホ)
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // 日付 "2026-11-03" → "2026年11月3日"
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : '';
  }
  // 終了日(なければ日付)を過ぎたものは、表示しない。日付のないものは出し続ける。日本時間の「今日」で比べる。
  function todayJst() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  function isPast(it) {
    var last = /^\d{4}-\d{2}-\d{2}$/.test(String(it.endDate || '')) ? it.endDate : (/^\d{4}-\d{2}-\d{2}$/.test(String(it.date || '')) ? it.date : '');
    return !!last && last < todayJst();
  }
  function safeUrl(u) { return /^https:\/\//.test(String(u || '')) ? String(u) : ''; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 写真・資料(サイトの img/up と files/up の中のものだけ。ほかの場所のものは出さない)
  function picsOf(images) {
    if (!Array.isArray(images) || !images.length) return null;
    var wrap = el('div', 'item-pics'), n = 0;
    images.forEach(function (im) {
      if (!im || typeof im !== 'object') return;
      var src = /^img\/up\/[A-Za-z0-9_.-]+$/.test(String(im.src || '')) ? String(im.src) : '';
      var pdf = /^files\/up\/[A-Za-z0-9_.-]+\.pdf$/.test(String(im.pdf || '')) ? String(im.pdf) : '';
      if (src) {
        var f = el('figure', 'pic');
        var link = el('a'); link.href = pdf || src; link.target = '_blank'; link.rel = 'noopener noreferrer';
        var img = el('img'); img.src = src; img.alt = String(im.alt || ''); img.loading = 'lazy';
        link.appendChild(img); f.appendChild(link);
        if (pdf) { var pa = el('a', 'pic-pdf', '資料(PDF)を開く'); pa.href = pdf; pa.target = '_blank'; pa.rel = 'noopener noreferrer'; f.appendChild(pa); }
        wrap.appendChild(f); n++;
      } else if (pdf) {
        var pf = el('p', 'pic-file'); var pl = el('a', null, String(im.alt || '資料(PDF)を開く')); pl.href = pdf; pl.target = '_blank'; pl.rel = 'noopener noreferrer';
        pf.appendChild(pl); wrap.appendChild(pf); n++;
      }
    });
    return n ? wrap : null;
  }

  // データファイル(JSON)の一覧表示。文字は textContent だけで入れる(HTMLとして解釈しない)
  function renderList(box) {
    var src = box.getAttribute('data-src');
    var empty = box.getAttribute('data-empty') || '';
    fetch(src, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (items) {
      box.textContent = '';
      if (Array.isArray(items) && !box.getAttribute('data-keep')) items = items.filter(function (it) { return !isPast(it); });
      var yr = box.getAttribute('data-year');
      if (Array.isArray(items) && yr) items = items.filter(function (it) { return !it.year || String(it.year) === yr; });
      var mx = parseInt(box.getAttribute('data-max') || '0', 10);   // トップは3件まで(残りは掲示板・イベント情報へ)
      if (Array.isArray(items) && mx > 0) items = items.slice(0, mx);
      var tp = box.getAttribute('data-topic');   // 機器展のページの欄(開催案内/セミナー/展示・体験/そのほか)
      if (Array.isArray(items) && tp) items = items.filter(function (it) { return tp === 'そのほか' ? ['開催案内', 'セミナー', '展示・体験'].indexOf(it.topic) < 0   /* gas/main/Config.js の KIKITEN_TOPICS と合わせる */ : it.topic === tp; });
      if (Array.isArray(items) && tp) {   // 当日の順番に(日付→開始時刻。日付のないものは最後)
        var key = function (it) { var m = /(\d{1,2})[:：時](\d{2})?/.exec(String(it.dateText || '').replace(/^.*?日[^\d]*/, '')); return (String(it.date || '9999-99-99')) + ' ' + (m ? ('0' + m[1]).slice(-2) + ':' + (m[2] || '00') : '99:99'); };
        items = items.slice().sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -1 : (x > y ? 1 : 0); });
      }
      if (!Array.isArray(items) || !items.length) {
        if (box.id === 'news-list' && document.querySelector('#kikiten-banner .kk-banner')) return;   // 案内カードがあれば、空の文は出さない
        var sec = box.closest('[data-hide-empty]');   // 空なら、その欄(見出しごと)を隠す
        if (sec) { sec.hidden = true; return; }
        if (empty) box.appendChild(el('p', 'muted', empty));
        return;
      }
      items.forEach(function (it) {
        var d = el('article', 'item');
        var main = el('div', 'item-main');
        var when = fmtDate(it.date);
        if (it.dateText) when = String(it.dateText);
        if (when) { var t = el('time', null, when); main.appendChild(t); }
        main.appendChild(el('h3', null, String(it.title || '')));
        if (it.done === true) { var dn = el('p'); dn.appendChild(el('span', 'badge', '済み')); main.appendChild(dn); }
        if (it.place) main.appendChild(el('p', null, '場所: ' + String(it.place)));
        var more = it.fold === true ? el('details', 'item-more') : null, tgt = main;   // 折りたたむときは、本文・リンク・写真を「くわしく見る」の中に
        if (more) {
          more.appendChild(el('summary', null, 'くわしく見る')); tgt = more;
          // 本文の頭の「・日時:…」「・場所:…」は、上の日時・場所と重なるので飛ばして、内容から見せる
          var b0 = String(it.body || '').replace(/\s+/g, ' ').replace(/[・･]?\s*(日時|日程|場所|会場)\s*[:：][^・･。]*[。]?/g, '').replace(/^[・･\s]*(内容|概要)\s*[:：]\s*/, '').replace(/^[・･\s]+/, '').trim();
          // 最初のひとまとまり(「。」まで、または次の「・」の手前)。長いときは( )の中を外し、それでも長ければ「、」の切れ目で止める(語の途中で切らない)
          var m0 = /^(.*?[。!?！？])/.exec(b0), seg = b0.split(/\s[・･]/)[0];
          var lead = m0 && m0[1].length <= seg.length ? m0[1] : seg;
          if (lead.length > 70) lead = lead.replace(/[（(][^）)]*[）)]/g, '').trim();
          if (lead.length > 70) { var k = lead.lastIndexOf('、', 60); lead = (k > 20 ? lead.slice(0, k) : lead.slice(0, 60)) + '…'; }
          if (lead) main.appendChild(el('p', 'item-lead', lead));   // 最初の一文(続きは「くわしく見る」の中)
        }
        if (it.body) tgt.appendChild(el('p', null, String(it.body)));
        var u = safeUrl(it.url);
        if (u) {
          var p = el('p');
          var a = el('a', null, it.urlLabel ? String(it.urlLabel) : '詳しく見る');
          a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
          p.appendChild(a); tgt.appendChild(p);
        }
        var pics = picsOf(it.images);
        if (more) { if (pics) more.appendChild(pics); main.appendChild(more); d.appendChild(main); box.appendChild(d); return; }
        if (!pics) { d.appendChild(main); box.appendChild(d); return; }
        var lay = (it.imgLayout === 'side' || it.imgLayout === 'bottom') ? it.imgLayout : 'top';
        d.className = 'item has-pics pics-' + lay;
        if (lay === 'bottom') { d.appendChild(main); d.appendChild(pics); } else { d.appendChild(pics); d.appendChild(main); }
        box.appendChild(d);
      });
    }).catch(function () {
      box.textContent = '';
      box.appendChild(el('p', 'muted', '読み込めませんでした。時間をおいて、もう一度お試しください。'));
    });
  }
  // トップの機器展の案内カード(開催の31日前から、終わる日まで。GASが data/banner.json に入れる)
  var bn = document.querySelector('[data-banner]');
  if (bn) fetch(bn.getAttribute('data-banner'), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (items) {
    (Array.isArray(items) ? items : []).forEach(function (it) {
      var KK_YEARS = [2026];   // 機器展の年別ページがある年(ビルドのときに入る)
      var ym = /^kikiten-(\d{4})\.html$/.exec(String(it.link || ''));
      var href = ym && KK_YEARS.indexOf(Number(ym[1])) >= 0 ? String(it.link) : 'events.html';
      var a = el('a', 'kk-banner'); a.href = href;
      var img = (Array.isArray(it.images) ? it.images : []).filter(function (im) { return im && /^img\/up\/[A-Za-z0-9_.-]+$/.test(String(im.src || '')); })[0];
      if (img) { var th = el('img', 'kk-thumb'); th.src = img.src; th.alt = String(img.alt || 'チラシ'); a.appendChild(th); }
      var tx = el('div', 'kk-text');
      tx.appendChild(el('strong', null, String(it.title || '')));
      var when = it.dateText ? String(it.dateText) : fmtDate(it.date);
      if (when || it.place) tx.appendChild(el('span', 'kk-when', [when, it.place ? String(it.place) : ''].filter(Boolean).join(' / ')));
      tx.appendChild(el('span', 'kk-go', '機器展のページを見る →'));
      a.appendChild(tx); bn.appendChild(a);
      var nl0 = document.getElementById('news-list');   // お知らせが先に「ありません」と出ていたら消す
      if (nl0 && !nl0.querySelector('.item')) nl0.textContent = '';
    });
  }).catch(function () { /* 案内カードが出せなくても、お知らせは出す */ });

  var lists = document.querySelectorAll('[data-src]');
  for (var i = 0; i < lists.length; i++) renderList(lists[i]);

  // 機器展のページのチラシ・地図(data/kikiten_media.json。年と種類で選ぶ)。画像が無ければ欄ごと隠したまま
  var medias = document.querySelectorAll('[data-media]');
  Array.prototype.forEach.call(medias, function (box) {
    fetch(box.getAttribute('data-media'), { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (items) {
      var yr = box.getAttribute('data-year'), sl = box.getAttribute('data-slot');
      items = (Array.isArray(items) ? items : []).filter(function (it) {
        return it && String(it.year) === yr && it.slot === sl && /^img\/(kikiten\/\d{4}|up)\/[A-Za-z0-9_.-]+$/.test(String(it.src || ''));
      });
      if (!items.length) return;
      items.forEach(function (it) {
        var f = el('figure', 'media');
        var a = el('a'); a.href = String(it.src); a.target = '_blank'; a.rel = 'noopener';
        var img = el('img'); img.src = String(it.src); img.alt = String(it.alt || it.caption || (sl === 'flyer' ? 'チラシ' : '地図')); img.loading = 'lazy';
        a.appendChild(img); f.appendChild(a);
        if (it.caption) f.appendChild(el('figcaption', null, String(it.caption)));
        box.appendChild(f);
      });
      box.classList.add('n' + Math.min(items.length, 3));
      var sec = box.closest('section'); if (sec) sec.hidden = false;
    }).catch(function () { /* 出せなくても、ほかは出す */ });
  });

  var GAS = (typeof GAS_URL === 'string' && /^https:\/\/script\.google\.com\//.test(GAS_URL)) ? GAS_URL : '';

  // GASへは text/plain で送る(事前確認の通信を避ける。試作で確認済み)
  window.callGas = function (body) {
    if (!GAS) return Promise.reject(new Error('not-ready'));
    return fetch(GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  };

  // メーカー向けリンク(GASのURLは設定ファイル1か所)
  var ml = document.querySelector('[data-gas-link="maker"]');
  if (ml) {
    if (GAS) { ml.href = GAS + '?page=maker'; ml.target = '_blank'; }
    else {
      ml.addEventListener('click', function (e) {
        e.preventDefault();
        var s = ml.querySelector('span'); if (s) s.textContent = 'ただいま準備中です。';
      });
    }
  }

  // お問い合わせフォーム
  var form = document.getElementById('contact-form');
  if (form) {
    var st = document.getElementById('f-status');
    var send = document.getElementById('f-send');
    if (!GAS) { send.disabled = true; st.textContent = 'ただいま準備中のため、送信できません。'; st.className = 'status'; }
    // 選んだお返事の方法に合わせて、メールアドレス・電話番号の「必須」の印を変える
    var mm = document.getElementById('mail-mark'), tm = document.getElementById('tel-mark');
    function mark(elm, need, both) { if (!elm) return; elm.className = need ? 'req' : 'opt'; elm.textContent = need ? (both ? 'どちらか必須' : '必須') : '(任意)'; }
    Array.prototype.forEach.call(form.querySelectorAll('input[name=reply]'), function (r) {
      r.addEventListener('change', function () { var v = r.value; mark(mm, v === 'mail' || v === 'either', v === 'either'); mark(tm, v === 'tel' || v === 'either', v === 'either'); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      st.className = 'status'; st.textContent = '';
      var fd = new FormData(form);
      var msg = String(fd.get('message') || '').trim();
      var reply = String(fd.get('reply') || '');
      var mail = String(fd.get('email') || '').trim();
      if (!reply) { st.className = 'status ng'; st.textContent = '「お返事の方法」を選んでください。'; return; }
      if (!msg) { st.className = 'status ng'; st.textContent = '「お問い合わせの内容」を入力してください。'; return; }
      var tel = String(fd.get('tel') || '').trim();
      if (reply === 'mail' && !mail) { st.className = 'status ng'; st.textContent = 'メールでのお返事を希望する場合は、メールアドレスを入力してください。'; return; }
      if (reply === 'tel' && !tel) { st.className = 'status ng'; st.textContent = '電話でのお返事を希望する場合は、電話番号を入力してください。'; return; }
      if (reply === 'either' && !mail && !tel) { st.className = 'status ng'; st.textContent = 'メールアドレスか電話番号の、どちらかを入力してください。'; return; }
      send.disabled = true; st.textContent = '送信しています…';
      window.callGas({ action: 'contact', name: String(fd.get('name') || ''), reply: reply, email: mail,
        tel: String(fd.get('tel') || ''), message: msg, website: String(fd.get('website') || '') })
        .then(function (j) {
          if (j && j.ok) { st.className = 'status ok'; st.textContent = '送信しました。ありがとうございました。'; form.reset(); }
          else { st.className = 'status ng'; st.textContent = '送信できませんでした。時間をおいて、もう一度お試しください。'; send.disabled = false; }
        }).catch(function () { st.className = 'status ng'; st.textContent = '送信できませんでした。時間をおいて、もう一度お試しください。'; send.disabled = false; });
    });
  }

  // ボランティアスタッフの登録(GAS の join.submit。管理者がLINEで確かめて名簿に入れる)
  var jform = document.getElementById('join-form');
  if (jform) {
    var jst = document.getElementById('j-status'), jsend = document.getElementById('j-send');
    var jng = function (t) { jst.className = 'status ng'; jst.textContent = t; };
    if (!GAS) { jsend.disabled = true; jst.className = 'status'; jst.textContent = 'ただいま準備中のため、送信できません。'; }
    jform.addEventListener('submit', function (e) {
      e.preventDefault();
      jst.className = 'status'; jst.textContent = '';
      var fd = new FormData(jform);
      var name = String(fd.get('name') || '').trim();
      var mail = String(fd.get('email') || '').trim(), mail2 = String(fd.get('email2') || '').trim();
      if (!name) return jng('「お名前」を入力してください。');
      if (!mail) return jng('メールアドレスを入力してください。');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return jng('メールアドレスの形が正しくないようです。もう一度ご確認ください。');
      if (mail.toLowerCase() !== mail2.toLowerCase()) return jng('確認用のメールアドレスが、上と同じではありません。');
      if (!document.getElementById('j-agree').checked) return jng('「同意します」にチェックを入れてください。');
      jsend.disabled = true; jst.textContent = '送信しています…';
      window.callGas({ action: 'join.submit', name: name, email: mail, agree: true, website: String(fd.get('website') || '') })
        .then(function (j) {
          if (j && j.ok) { jst.className = 'status ok'; jst.textContent = '送信しました。ありがとうございます。管理者が確認して登録します(数日かかることがあります)。'; jform.reset(); }
          else if (j && j.reason === 'busy') { jng('いま送信が混み合っています。少し時間をおいて、もう一度お試しください。'); jsend.disabled = false; }
          else if (j && j.reason === 'email') { jng('メールアドレスの形が正しくないようです。もう一度ご確認ください。'); jsend.disabled = false; }
          else { jng('送信できませんでした。時間をおいて、もう一度お試しください。'); jsend.disabled = false; }
        }).catch(function () { jng('送信できませんでした。時間をおいて、もう一度お試しください。'); jsend.disabled = false; });
    });
  }

  // みんなのお知らせへの投稿(GAS の board.submit。管理者がLINEで確かめてから載せる)
  var bform = document.getElementById('board-form');
  if (bform) {
    var bst = document.getElementById('b-status'), bsend = document.getElementById('b-send');
    if (!GAS) { bsend.disabled = true; bst.textContent = 'ただいま準備中のため、送信できません。'; }
    var bng = function (t) { bst.className = 'status ng'; bst.textContent = t; };
    // 写真は長い辺 1800px の JPEG に小さくする(送る量を減らす)。PDF はそのまま(5MBまで)
    var readFile = function (f) {
      return new Promise(function (ok, ng) {
        if (!f) return ok(null);
        var mime = String(f.type || '');
        if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(mime) < 0) return ng(new Error('type'));
        if (mime === 'application/pdf' && f.size > 5 * 1024 * 1024) return ng(new Error('size'));
        if (f.size > 30 * 1024 * 1024) return ng(new Error('size'));
        var rd = new FileReader();
        rd.onerror = function () { ng(new Error('read')); };
        rd.onload = function () {
          var url = String(rd.result || '');
          if (mime === 'application/pdf' || (f.size <= 1500000 && mime !== 'image/png')) return ok({ mime: mime, b64: url.slice(url.indexOf(',') + 1) });
          var im = new Image();
          im.onerror = function () { ng(new Error('read')); };
          im.onload = function () {
            var k = Math.min(1, 1800 / Math.max(im.naturalWidth, im.naturalHeight));
            var cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
            var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
            var out = cv.toDataURL('image/jpeg', 0.85);
            ok({ mime: 'image/jpeg', b64: out.slice(out.indexOf(',') + 1) });
          };
          im.src = url;
        };
        rd.readAsDataURL(f);
      });
    };
    var BMSG = { title: '「題名」を入力してください。', date: '「日付」を、今日から1年以内で選んでください。', body: '「内容」を入力してください(400字まで)。', url: 'URLは https:// から始まるものを入力してください。',
      name: '「お名前・団体名」を入力してください。', contact: 'メールアドレスか電話番号の、どちらかを入力してください。', email: 'メールアドレスの形を確かめてください。', tel: '電話番号は、数字とハイフンで入力してください。',
      file: 'チラシのファイルを確かめてください(写真かPDF・PDFは5MBまで)。', busy: 'ただいま投稿が集中しています。時間をおいて、もう一度お試しください。' };
    bform.addEventListener('submit', function (e) {
      e.preventDefault();
      bst.className = 'status'; bst.textContent = '';
      var fd = new FormData(bform), g = function (k) { return String(fd.get(k) || '').trim(); };
      if (!g('title')) return bng(BMSG.title);
      if (!g('date')) return bng(BMSG.date);
      if (!g('body')) return bng(BMSG.body);
      if (g('url') && !/^https:\/\//.test(g('url'))) return bng(BMSG.url);
      if (!g('name')) return bng(BMSG.name);
      if (!g('email') && !g('tel')) return bng(BMSG.contact);
      var f = document.getElementById('b-file').files[0] || null;
      bsend.disabled = true; bst.textContent = '送信しています…';
      readFile(f).then(function (file) {
        var body = { action: 'board.submit', title: g('title'), date: g('date'), timeText: g('timeText'), place: g('place'), body: g('body'), url: g('url'),
          name: g('name'), email: g('email'), tel: g('tel'), website: String(fd.get('website') || '') };
        if (file) body.file = file;
        return window.callGas(body);
      }, function () { throw { reason: 'file' }; }).then(function (j) {
        if (j && j.ok) { bst.className = 'status ok'; bst.textContent = '送信しました。管理者が確認してから載せます。ありがとうございました。'; bform.reset(); bsend.disabled = false; return; }
        bng(BMSG[j && j.reason] || '送信できませんでした。時間をおいて、もう一度お試しください。'); bsend.disabled = false;
      }).catch(function (err) { bng(BMSG[err && err.reason] || '送信できませんでした。時間をおいて、もう一度お試しください。'); bsend.disabled = false; });
    });
  }

  // ログインのあるページ(ボランティア・管理者)
  var loginBox = document.getElementById('login-box');
  if (loginBox) {
    var authSt = document.getElementById('auth-status');
    if (/\bLine\//i.test(navigator.userAgent)) document.getElementById('line-warn').hidden = false;
    if (!GAS) {  // 受付側(GAS)ができるまでは、ログインボタンを出さない
      loginBox.hidden = true;
      authSt.className = 'status'; authSt.textContent = 'ただいま準備中です。ご利用開始まで、しばらくお待ちください。';
    }
    var needAdmin = document.body.className.indexOf('admin-page') >= 0;
    window.onGoogleCredential = function (resp) {
      if (!GAS) { authSt.className = 'status'; authSt.textContent = 'ただいま準備中です。'; return; }
      authSt.className = 'status'; authSt.textContent = '確認しています…';
      window.callGas({ action: 'whoami', idToken: resp.credential }).then(function (j) {
        var ok = j && j.ok && j.member && (!needAdmin || j.role === 'admin');
        if (!ok) { authSt.className = 'status ng'; authSt.textContent = 'このアカウントでは、ご利用いただけません。'; return; }
        authSt.textContent = '';
        loginBox.hidden = true;
        document.getElementById('member-hello').textContent = 'ログインしました。';
        document.getElementById('member-area').hidden = false;
        window.APP = { cred: resp.credential, role: j.role };   // ログイン情報は、このページの中(メモリ)だけに置く。保存しない
        try { localStorage.setItem('hp_staff', '1'); } catch (e) {}   // この端末は、以後アクセス数に数えない(関係者)
        document.dispatchEvent(new Event('member-ready'));
      }).catch(function () { authSt.className = 'status ng'; authSt.textContent = '確認できませんでした。時間をおいて、もう一度お試しください。'; });
    };
  }

  // アクセス数の集計(GoatCounter・Cookieなし)。コードが無い・関係者の端末・手元の確認では数えない
  (function () {
    var code = "";
    if (!code || location.protocol !== 'https:') return;
    try {
      if (location.hash === '#nocount') localStorage.setItem('hp_staff', '1');
      if (localStorage.getItem('hp_staff') === '1') return;
    } catch (e) {}
    var q = 'p=' + encodeURIComponent(location.pathname) + '&t=' + encodeURIComponent(document.title) +
            '&r=' + encodeURIComponent(document.referrer || '') + '&s=' + ((window.screen && screen.width) || 0) + '&rnd=' + Math.random().toString(36).slice(2);
    new Image().src = 'https://' + code + '.goatcounter.com/count?' + q;
  })();
})();
