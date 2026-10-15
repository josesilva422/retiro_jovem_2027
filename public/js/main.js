(() => {
  const C = window.CONTENT;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Menu mobile + barra com sombra ao rolar
  const nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') { menu.classList.remove('open'); burger.setAttribute('aria-expanded', false); } });

  // Programação: carrossel em loop (um dia por tela no celular)
  const WEEK = { Sex: 'Sexta-feira', 'Sáb': 'Sábado', Dom: 'Domingo', Seg: 'Segunda-feira', Ter: 'Terça-feira' };
  const colors = ['c-coral', 'c-yellow', 'c-cream', 'c-coral', 'c-yellow'];
  const N = C.program.length;
  const dayHtml = (d, i) => {
    const [wk, date] = d.day.split('·').map(s => s.trim());
    const num = (date || '').split('/')[0];
    return `<article class="day ${colors[i % colors.length]}" data-i="${i}">
      <b class="num">${esc(num)}</b>
      <p class="wk">${esc(WEEK[wk] || wk)}</p>
      <h3>${esc(d.title)}</h3>
      <ul>${d.items.map(it => `<li><time>${esc(it.time)}</time><span><b>${esc(it.name)}</b>${it.desc ? `<small>${esc(it.desc)}</small>` : ''}</span></li>`).join('')}</ul>
    </article>`;
  };
  const track = $('#progList'), dots = $('#dayDots');
  track.innerHTML = [0, 1, 2].map(() => C.program.map(dayHtml).join('')).join('');
  dots.innerHTML = C.program.map((d, i) => `<button type="button" data-i="${i}" aria-label="Ir para ${esc(d.day)}">${esc((d.day.split('·')[1] || '').trim().split('/')[0])}</button>`).join('');
  const cards = [...track.children];
  const step = () => cards[1].offsetLeft - cards[0].offsetLeft;
  const setW = () => cards[N].offsetLeft - cards[0].offsetLeft;
  const jump = x => { track.style.scrollSnapType = 'none'; track.scrollLeft = x; track.style.scrollSnapType = ''; };
  const start = () => jump(setW());
  start(); requestAnimationFrame(start); addEventListener('load', start); addEventListener('resize', start);
  if (document.fonts) document.fonts.ready.then(start);
  let idle, dragging = false;
  const settle = () => {
    if (dragging) return;
    const w = setW(), x = track.scrollLeft;
    if (x < w * .5) jump(x + w); else if (x > w * 1.5) jump(x - w);
  };
  const paintDots = () => {
    const i = ((Math.round(track.scrollLeft / step()) % N) + N) % N;
    dots.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  };
  track.addEventListener('scroll', () => { paintDots(); clearTimeout(idle); idle = setTimeout(settle, 140); }, { passive: true });
  $('#prevDay').onclick = () => track.scrollBy({ left: -step(), behavior: 'smooth' });
  $('#nextDay').onclick = () => track.scrollBy({ left: step(), behavior: 'smooth' });
  dots.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    track.scrollTo({ left: cards[N + +b.dataset.i].offsetLeft - cards[0].offsetLeft, behavior: 'smooth' });
  });
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); $('#nextDay').click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); $('#prevDay').click(); }
  });
  // Arrastar com o mouse no computador
  let sx = 0, sl = 0;
  track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; dragging = true; sx = e.clientX; sl = track.scrollLeft; track.style.scrollSnapType = 'none'; track.classList.add('grab'); });
  addEventListener('pointermove', e => { if (dragging) track.scrollLeft = sl - (e.clientX - sx); });
  addEventListener('pointerup', () => {
    if (!dragging) return; dragging = false; track.classList.remove('grab');
    const s = step(), target = Math.round(track.scrollLeft / s) * s;
    track.scrollTo({ left: target, behavior: 'smooth' });
    setTimeout(() => { track.style.scrollSnapType = ''; settle(); }, 350);
  });
  paintDots();

  // Line-up
  const lu = $('#lineup-grid');
  lu.innerHTML = C.lineup.length
    ? C.lineup.map(a => `<figure class="artist reveal"><img src="${esc(a.photo)}" alt="${esc(a.name)}" loading="lazy"><figcaption><b>${esc(a.name)}</b><small>${esc(a.role)}</small></figcaption></figure>`).join('')
    : Array.from({ length: 4 }, () => `<div class="artist mystery reveal"><b>?</b><span>Em breve</span></div>`).join('');

  // Local
  const L = C.local;
  if (L.name) $('#localName').textContent = L.name;
  if (L.address) $('#localAddress').textContent = L.address;
  if (L.mapUrl) { const m = $('#mapBtn'); m.href = L.mapUrl; m.hidden = false; }
  $('#localGallery').classList.toggle('media', L.photos.length > 0);
  $('#localGallery').innerHTML = L.photos.length
    ? L.photos.map(p => p.type === 'video'
      ? `<figure class="vid"><video src="${esc(p.src)}#t=0.1" controls muted playsinline preload="metadata" aria-label="${esc(p.alt)}"></video></figure>`
      : `<figure><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy"></figure>`).join('')
    : Array.from({ length: 3 }, (_, i) => `<div class="ph" ${i === 0 ? 'style="grid-column:span 2;aspect-ratio:16/9"' : ''}>Fotos do local<br>em breve</div>`).join('');

  // Novidades
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  $('#newsList').innerHTML = C.news.map(n =>
    `<article class="post reveal"><div class="meta"><span class="chip-tag">${esc(n.tag)}</span><span>${fmt(n.date)}</span></div><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></article>`).join('');

  // Fotos do retiro: 6 em destaque + link para o álbum completo
  const wall = $('#photoWall');
  const six = C.photos.slice(0, 6);
  wall.innerHTML = Array.from({ length: 6 }, (_, i) => six[i]
    ? `<figure class="reveal"><img src="${esc(six[i].src)}" alt="${esc(six[i].alt)}" loading="lazy"></figure>`
    : `<div class="ph reveal">Em breve</div>`).join('');
  if (six.length) $('#photosSub').textContent = 'Reviva os melhores momentos do RECONNECT.';
  const all = $('#allPhotos');
  if (C.photosLink) {
    all.href = C.photosLink; all.target = '_blank'; all.rel = 'noopener';
    all.classList.remove('disabled'); all.removeAttribute('aria-disabled');
    $('#allPhotosNote').hidden = true;
  } else {
    all.addEventListener('click', e => e.preventDefault());
  }

  // Contagem regressiva
  fetch('/api/config').then(r => r.json()).then(cfg => {
    const target = new Date(cfg.eventStart).getTime(), box = $('#countdown');
    const pad = n => String(n).padStart(2, '0');
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      const v = { d: Math.floor(diff / 864e5), h: Math.floor(diff / 36e5) % 24, m: Math.floor(diff / 6e4) % 60, s: Math.floor(diff / 1e3) % 60 };
      for (const k in v) box.querySelector(`[data-u=${k}]`).textContent = pad(v[k]);
    };
    tick(); setInterval(tick, 1000);
  }).catch(() => {});

  // Revelar ao rolar
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = (i % 3) * 70 + 'ms'; io.observe(el); });
})();

// Botão fixo de inscrição no celular: aparece após o topo e some na área de inscrição
(() => {
  const cta = document.getElementById('stickyCta'), reg = document.getElementById('inscricao');
  if (!cta) return;
  const update = () => {
    const r = reg.getBoundingClientRect();
    const inReg = r.top < innerHeight * .6 && r.bottom > 0;
    cta.classList.toggle('show', scrollY > innerHeight * .7 && !inReg);
  };
  addEventListener('scroll', update, { passive: true }); update();
})();
