const P = {
  chat: '<path d="M4 5h16v11H9l-5 4z"></path>',
  code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"></path>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect>',
  gear: '<circle cx="12" cy="12" r="3"></circle><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
  lang: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c3.5 3.5 3.5 14.5 0 18M12 3c-3.5 3.5-3.5 14.5 0 18"></path>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  hist: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"></path><path d="M12 8v4l3 2"></path>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"></path>',
  down: '<path d="M6 9l6 6 6-6"></path>',
  x: '<path d="M6 6l12 12M18 6L6 18"></path>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>',
  sendto: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"></path>',
  pause: '<path d="M9 6v12M15 6v12"></path>',
  img: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.5"></circle><path d="M21 16l-5-5-9 8"></path>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9.5l5 2.5-5 2.5z"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"></path>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"></rect><path d="M9 20h6M12 16.5V20"></path>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"></rect><path d="M11 18h2"></path>',
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h11a5 5 0 0 1 0 10h-3"></path>',
  text: '<path d="M5 6V4.5h14V6M12 4.5V20M9 20h6"></path>',
  layers: '<path d="M12 4l9 5-9 5-9-5z"></path><path d="M3 14l9 5 9-5"></path>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6"></path>',
  brush: '<path d="M9.5 14.5l9-9 1.5 1.5-9 9"></path><path d="M9 15c-2 0-3 1.2-3 3s-1 2-2 2c3 1 7 0 7-3 0-1-.8-2-2-2z"></path>',
  drop: '<path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z"></path>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"></path>',
  cut: '<circle cx="6" cy="7" r="2.5"></circle><circle cx="6" cy="17" r="2.5"></circle><path d="M8 8.5L20 18M8 15.5L20 6"></path>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3"></path>',
  music: '<path d="M9 18V6l11-2v12"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="17.5" cy="16" r="2.5"></circle>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"></path>',
  restart: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5"></path>',
  file: '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  warn: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"></path>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M4 10h16M4 15h16M10 5v14"></path>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" ></path>'
};
function ic(n, s) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"' + (s ? ' style="' + s + '"' : '') + '>' + P[n] + '</svg>'; }
function globe(sz, sw) {
  return '<svg class="g" viewBox="0 0 40 40" width="' + sz + '" height="' + sz + '" aria-hidden="true" style="stroke-width:' + (sw || 1.6) + '"><circle cx="20" cy="20" r="11"></circle><ellipse cx="20" cy="20" rx="5" ry="11"></ellipse><path d="M9 20h22M10.6 14.5h18.8M10.6 25.5h18.8"></path><ellipse cx="20" cy="20" rx="18" ry="6.5" transform="rotate(-20 20 20)"></ellipse><circle cx="36.9" cy="13.8" r="1.7" fill="#F2A65A" stroke="none"></circle></svg>';
}
function shell(nav) {
  const n = (k, label, icon) => '<a class="nav' + (nav === k ? ' on' : '') + '" href="#">' + ic(icon) + label + '</a>';
  return '<div class="app"><aside class="side"><div class="logo">' + globe(24) + 'IONEXA</div>' +
    n('chat', 'Ionexa Chat', 'chat') + n('coding', 'Coding', 'code') + n('tools', 'All tools', 'grid') +
    '<div style="flex:1"></div>' + n('settings', 'Settings', 'gear') +
    '<div class="who">Maria Papadaki<div class="sub">Pro</div></div></aside><div class="main">' +
    '<header class="top"><button class="search" type="button">' + ic('search') + '<span>Search anything…</span><span class="kbd">⌘K</span></button>' +
    '<button class="btn ghost" type="button">' + ic('lang') + 'EN</button>' +
    '<button class="ib" type="button" aria-label="Notifications">' + ic('bell') + '</button>' +
    '<button class="btn" type="button">' + ic('bolt') + (window.CREDITS || '82') + '</button>' +
    '<button class="btn" type="button">' + ic('plus') + 'Make anything</button><div class="av">M</div></header></div></div>';
}
const WAVE = [10,18,26,14,30,22,12,28,34,20,16,26,38,24,14,30,22,18,28,12,24,32,16,26,20,14,30,24,18,10,22,28,16,26,34,20,12,24,30,18];
function mount(nav) {
  const nodes = [...document.body.children].filter(e => e.tagName !== 'SCRIPT');
  document.body.insertAdjacentHTML('afterbegin', shell(nav || 'tools'));
  const main = document.querySelector('.main');
  nodes.forEach(n => main.appendChild(n));
  document.querySelectorAll('[data-tbar]').forEach(el => {
    const d = el.dataset;
    el.classList.add('tbar');
    el.insertAdjacentHTML('afterbegin', '<button class="ib" type="button" aria-label="History and chat">' + ic('hist') + '</button><div class="crumb"><span class="tool">' + d.tool + '</span><span class="sl">/</span><span class="doc">' + d.doc + '</span></div>');
  });
  document.querySelectorAll('[data-ask]').forEach(el => {
    const d = el.dataset;
    el.classList.add('askwrap');
    el.innerHTML = (d.note ? '<div class="note">' + globe(18, 1.4) + '<span>' + d.note + '</span><a href="#">' + ic('hist', 'width:13px;height:13px') + 'Chat</a></div>' : '') +
      '<div class="ask"><button class="ib" type="button" aria-label="Add">' + ic('plus') + '</button>' +
      (d.sel ? '<span class="selc">' + d.sel + ic('x', 'width:12px;height:12px') + '</span>' : '') +
      '<input aria-label="Ask Ionexa" placeholder="' + (d.ph || 'Change this…') + '">' +
      (d.cost ? '<span class="cost">' + d.cost + '</span>' : '') +
      '<button class="send" type="button" aria-label="Send">' + ic('up') + '</button></div>';
  });
  document.querySelectorAll('[data-i]').forEach(el => { el.outerHTML = ic(el.dataset.i, el.getAttribute('style') || ''); });
  document.querySelectorAll('[data-img]').forEach(el => {
    el.classList.add('phimg');
    el.insertAdjacentHTML('afterbegin', ic(el.dataset.icon || 'img', 'width:22px;height:22px') + '<span>' + el.dataset.img + '</span>');
  });
  document.querySelectorAll('[data-wave]').forEach(el => {
    const n = +el.dataset.wave, p = +(el.dataset.played || 0);
    let h = '';
    for (let k = 0; k < n; k++) h += '<span' + (k < p ? ' class="p"' : '') + ' style="height:' + WAVE[k % WAVE.length] + 'px"></span>';
    el.classList.add('wave'); el.innerHTML = h;
  });
}
