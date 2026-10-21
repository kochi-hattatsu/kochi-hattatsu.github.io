// ボランティアの画面。文字は textContent だけで入れる。データは、名簿に載った人にだけGASが返す。
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var app = document.getElementById('app');
  function card(it) {
    var d = h('article', { class: 'item' });
    if (it.attendance) d.appendChild(h('p', {}, [h('span', { class: 'badge', text: it.attendance })]));   // 参加区分(全員参加/希望者のみ/リーダーのみ)
    var when = it.dateText || it.date;
    if (when) d.appendChild(h('time', { text: when }));
    d.appendChild(h('h3', { text: it.title }));
    if (it.place) d.appendChild(h('p', { text: '場所: ' + it.place }));
    if (it.summary) d.appendChild(h('p', { text: it.summary }));
    if (it.url && /^https:\/\//.test(it.url)) {
      var a = h('a', { text: '詳しく見る', href: it.url, target: '_blank', rel: 'noopener noreferrer' });
      d.appendChild(h('p', {}, [a]));
    }
    return d;
  }
  document.addEventListener('member-ready', function () {
    if (!app) return;
    app.textContent = '読み込み中です…';
    window.callGas({ action: 'volunteer.feed', idToken: window.APP.cred }).then(function (r) {
      app.textContent = '';
      if (!r || !r.ok) { app.appendChild(h('p', { class: 'status ng', text: '読み込めませんでした。もう一度ログインしてください。' })); return; }
      if (r.tasks && r.tasks.length) {
        app.appendChild(h('h2', { text: 'やること' }));
        var tl = h('div', { class: 'list' });
        r.tasks.forEach(function (t) { tl.appendChild(h('div', { class: 'item' }, [h('p', { text: t.title + (t.due ? '(期限: ' + t.due + ')' : '') })])); });
        app.appendChild(tl);
      }
      var groups = {};
      (r.items || []).forEach(function (it) { var k = it.target === 'volunteer' ? (it.topic || 'その他のお知らせ') : '一般向けのお知らせ'; (groups[k] = groups[k] || []).push(it); });
      var order = (r.topics || []).concat(['その他のお知らせ', '一般向けのお知らせ']);
      var any = false;
      order.forEach(function (k) {
        if (!groups[k]) return;
        any = true;
        app.appendChild(h('h2', { text: k }));
        var l = h('div', { class: 'list' });
        groups[k].forEach(function (it) { l.appendChild(card(it)); });
        app.appendChild(l);
      });
      if (!any && !(r.tasks && r.tasks.length)) app.appendChild(h('p', { class: 'muted', text: 'いま、ご案内するものはありません。' }));
    }).catch(function () { app.textContent = ''; app.appendChild(h('p', { class: 'status ng', text: '読み込めませんでした。時間をおいてお試しください。' })); });
  });
})();
