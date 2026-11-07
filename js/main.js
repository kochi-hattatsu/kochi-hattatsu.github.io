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
      if (!Array.isArray(items) || !items.length) { box.appendChild(el('p', 'muted', empty)); return; }
      items.forEach(function (it) {
        var d = el('article', 'item');
        var main = el('div', 'item-main');
        var when = fmtDate(it.date);
        if (it.dateText) when = String(it.dateText);
        if (when) { var t = el('time', null, when); main.appendChild(t); }
        main.appendChild(el('h3', null, String(it.title || '')));
        if (it.done === true) { var dn = el('p'); dn.appendChild(el('span', 'badge', '済み')); main.appendChild(dn); }
        if (it.place) main.appendChild(el('p', null, '場所: ' + String(it.place)));
        if (it.body) main.appendChild(el('p', null, String(it.body)));
        var u = safeUrl(it.url);
        if (u) {
          var p = el('p');
          var a = el('a', null, it.urlLabel ? String(it.urlLabel) : '詳しく見る');
          a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
          p.appendChild(a); main.appendChild(p);
        }
        var pics = picsOf(it.images);
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
  var lists = document.querySelectorAll('[data-src]');
  for (var i = 0; i < lists.length; i++) renderList(lists[i]);

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
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      st.className = 'status'; st.textContent = '';
      var fd = new FormData(form);
      var msg = String(fd.get('message') || '').trim();
      var reply = String(fd.get('reply') || '');
      var mail = String(fd.get('email') || '').trim();
      if (!reply) { st.className = 'status ng'; st.textContent = '「お返事の方法」を選んでください。'; return; }
      if (!msg) { st.className = 'status ng'; st.textContent = '「お問い合わせの内容」を入力してください。'; return; }
      if (reply === 'mail' && !mail) { st.className = 'status ng'; st.textContent = 'メールでのお返事を希望する場合は、メールアドレスを入力してください。'; return; }
      send.disabled = true; st.textContent = '送信しています…';
      window.callGas({ action: 'contact', name: String(fd.get('name') || ''), reply: reply, email: mail,
        tel: String(fd.get('tel') || ''), message: msg, website: String(fd.get('website') || '') })
        .then(function (j) {
          if (j && j.ok) { st.className = 'status ok'; st.textContent = '送信しました。ありがとうございました。'; form.reset(); }
          else { st.className = 'status ng'; st.textContent = '送信できませんでした。時間をおいて、もう一度お試しください。'; send.disabled = false; }
        }).catch(function () { st.className = 'status ng'; st.textContent = '送信できませんでした。時間をおいて、もう一度お試しください。'; send.disabled = false; });
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
        document.dispatchEvent(new Event('member-ready'));
      }).catch(function () { authSt.className = 'status ng'; authSt.textContent = '確認できませんでした。時間をおいて、もう一度お試しください。'; });
    };
  }
})();
