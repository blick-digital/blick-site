// Обновление страницы всегда открывает её сверху, а не с прежней позиции скролла
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!location.hash) window.scrollTo(0, 0);

// Просмотр черновика из админки: ?preview=1 подменяет данные кейсов тем, что сохранено в браузере
if (/[?&]preview=1/.test(location.search)) {
  try {
    const d = JSON.parse(localStorage.getItem("blick-draft"));
    if (d && d.projects) {
      const imgs = d.images || {};
      const rep = (v) => typeof v === "string" ? (imgs[v] || v) : Array.isArray(v) ? v.map(rep) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rep(x)])) : v;
      window.PROJECTS = rep(d.projects);
    }
  } catch (e) {}
}

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover)").matches;
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const scrubEnabled = $(".hero-scrub") && !reduced && matchMedia("(min-width: 861px)").matches;

  /* ---------- Hero-кадры (десктоп): последовательность JPG вместо видео ----------
     Перемотка скроллом двигает индекс кадра и рисует его в canvas — быстрее и стабильнее,
     чем перемотка <video>, и не зависит от политик автозапуска/энергосбережения браузера. */
  const FRAME_COUNT = 120;
  const FRAME_RATE = 24; // кадров/сек в исходном ролике — только для тайминга вступления
  const framePath = (i) => "assets/video/hero-frames/frame-" + String(i).padStart(4, "0") + ".jpg";
  const frames = [];
  let framesLoadedCount = 0;
  if (scrubEnabled) {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.onload = img.onerror = () => { framesLoadedCount++; };
      img.src = framePath(i);
      frames.push(img);
    }
  }

  /* Заставка загрузки: пока она на экране, страница не листается и вступление не идёт.
     bootReady выполняется, когда заставка ушла (или сразу, если её на странице нет). */
  let bootResolve;
  const bootReady = new Promise((r) => { bootResolve = r; });

  /* ---------- Заставка загрузки ---------- */
  (() => {
    const boot = $("#boot");
    // Блок намеренно стоит первым и ни от чего не зависит: если ниже по файлу что-то
    // сломается, заставка всё равно снимется и сайт останется рабочим.
    const video = $(".hero__video"); // только мобильная ветка; на десктопе кадры — см. framesPart
    if (!boot) { bootResolve(); return; }
    const MIN = 550;    // минимум на экране — чтобы заставка не мигала на быстром интернете
    const MAX = 7000;   // страховка: дольше не держим никогда, даже если что-то не догрузилось
    const t0 = performance.now();
    let fonts = 0, loaded = 0, vFailed = 0, shown = 0, done = false;

    // document.fonts.ready в Safari разрешается очень поздно (замер на живом сайте: 4,7 с),
    // поэтому ждём поимённо только шрифты первого экрана и не дольше 1,5 с.
    // document.fonts.load ещё и сам запускает загрузку — Safari иначе тянет шрифт лениво.
    const needFonts = ['500 1em "PP Neue Machina"', '400 1em "PP Neue Machina"',
                       '400 1em "Manrope"', '400 1em "TT Autonomous Mono Trial Variable Roman"'];
    const markFonts = () => { if (!fonts) { fonts = 1; mark.fonts = Math.round(performance.now() - t0); } };
    if (document.fonts && document.fonts.load) {
      Promise.race([
        Promise.all(needFonts.map((f) => document.fonts.load(f).catch(() => {}))),
        new Promise((r) => setTimeout(r, 1500)),
      ]).then(markFonts);
    } else markFonts();
    // Ждём только то, что нужно первому экрану: шрифты, ролик/кадры и постер под ними.
    // Обложки кейсов лежат ниже и догрузятся сами, пока идёт вступление и прокрутка hero —
    // если ждать событие load, заставка висела бы лишние секунды из-за картинок, которых ещё не видно.
    const poster = "assets/video/hero-poster.jpg";
    const im = new Image();
    im.onload = im.onerror = () => { loaded = 1; mark.poster = Math.round(performance.now() - t0); };
    im.src = poster;
    if (im.complete) loaded = 1;
    if (video) video.addEventListener("error", () => { vFailed = 1; }, { once: true });
    // canplaythrough / readyState 4 = браузер сам считает, что доиграет без остановок.
    // Это надёжнее, чем ждать полный буфер: Safari часто перестаёт качать, не дойдя до конца.
    let canThrough = 0;
    if (video) video.addEventListener("canplaythrough", () => { canThrough = 1; }, { once: true });
    const mark = { fonts: 0, poster: 0, video: 0 };

    // Доля загруженного ролика (мобильные): для зацикленного видео достаточно первых секунд
    const videoPart = () => {
      if (!video || vFailed) return 1;
      if (canThrough || video.readyState >= 4) return 1;
      if (!video.duration) return 0;
      const need = Math.min(video.duration, 3);
      let end = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= 0.05) end = Math.max(end, video.buffered.end(i));
      }
      // хвост в доли секунды может не догрузиться никогда — считаем почти полное за полное
      return end >= need - 0.2 ? 1 : Math.min(1, end / need);
    };

    // Доля загруженных кадров (десктоп): половины достаточно, чтобы отпустить экран —
    // остальные дойдут, пока идёт вступление и прокрутка hero
    const framesPart = () => {
      if (!FRAME_COUNT) return 1;
      const need = Math.ceil(FRAME_COUNT * 0.5);
      return Math.min(1, framesLoadedCount / need);
    };

    const paint = (p) => {
      shown = Math.max(shown, p);            // прогресс не отматываем назад
      boot.style.setProperty("--p", shown.toFixed(4));
    };

    const finish = () => {
      if (done) return;
      done = true;
      paint(1);
      setTimeout(() => {                      // даём блику дойти до конца слова
        boot.classList.add("is-done");
        document.body.classList.remove("is-booting");
        scrollTo(0, 0);
        bootResolve();
        setTimeout(() => boot.remove(), 800);
        if (/[?&]debug=1/.test(location.search)) {
          const d = document.createElement("pre");
          d.style.cssText = "position:fixed;left:12px;top:12px;z-index:300;margin:0;padding:12px 14px;" +
            "background:rgba(10,10,11,.92);color:#ededea;font:12px/1.6 ui-monospace,monospace;" +
            "border:1px solid rgba(255,255,255,.16);border-radius:6px;white-space:pre";
          d.textContent =
            "заставка висела: " + Math.round(performance.now() - t0) + " мс\n" +
            "шрифты готовы:   " + (mark.fonts || "—") + " мс\n" +
            "постер готов:    " + (mark.poster || "—") + " мс\n" +
            "кадры готовы:    " + (mark.video || "не успели") + " мс\n" +
            "нажмите, чтобы убрать";
          d.onclick = () => d.remove();
          document.body.appendChild(d);
        }
      }, 280);
    };

    const tick = () => {
      if (done) return;
      const el = performance.now() - t0;
      const mediaPart = scrubEnabled ? framesPart() : videoPart();
      if (!mark.video && mediaPart >= 1) mark.video = Math.round(el);
      const p = 0.15 * fonts + 0.65 * mediaPart + 0.20 * loaded;
      paint(Math.min(0.99, p));
      if ((p >= 0.99 && el >= MIN) || el >= MAX) return finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Страховка на таймере, а не на кадрах анимации: в фоновой вкладке браузер
    // перестаёт выдавать кадры, и без неё заставка висела бы, пока вкладку не откроют
    setTimeout(finish, MAX);
    // вкладку вернули — продолжаем считать прогресс
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !done) requestAnimationFrame(tick); });
  })();

  /* ---------- Интро ---------- */
  const ready = () => {
    const on = () => document.body.classList.add("is-loaded");
    requestAnimationFrame(on);
    setTimeout(on, 80); // в фоновой вкладке кадров не выдают — подстраховываемся таймером
  };
  const readyAfterFonts = () => {
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]).then(ready);
    } else ready();
  };
  bootReady.then(readyAfterFonts);

  /* ---------- Меню ---------- */
  const fab = $(".menu-fab");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    fab.setAttribute("aria-expanded", open);
    $(".menu-fab__label").textContent = open ? "закрыть" : "меню";
  };
  fab.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  $$(".overlay a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // Кнопка меню появляется, когда верхнее меню ушло за экран
  const topNav = $(".hero__nav") || $(".page-head nav");
  const scrubWrap = $(".hero-scrub");
  if (scrubWrap && !reduced && matchMedia("(min-width: 861px)").matches) {
    // На главной hero закреплён и меню внутри него гаснет по скроллу — кнопка появляется, когда оно почти погасло
    const upd = () => {
      const range = Math.max(1, scrubWrap.offsetHeight - innerHeight);
      fab.classList.toggle("is-visible", scrollY > scrubWrap.offsetTop + range * 0.3);
    };
    addEventListener("scroll", upd, { passive: true });
    addEventListener("resize", upd);
    upd();
  } else if (topNav) {
    new IntersectionObserver(([e]) => fab.classList.toggle("is-visible", !e.isIntersecting)).observe(topNav);
  } else fab.classList.add("is-visible");

  /* ---------- Карточка проекта ---------- */
  const caption = (p) => (p.format || CATEGORIES[p.category]) + (p.year ? ` · ${p.year}` : "");
  const url = (path) => encodeURI(path); // пути с пробелами, скобками и кириллицей
  const plate = (p) => `
    <div class="wcard__plate">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.desc)}</p>
      <div class="wcard__tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      <a class="wcard__more mono" href="case.html?p=${esc(p.slug)}">Смотреть кейс <span class="arr">↗</span></a>
    </div>`;
  const caseUrl = (card) => { const a = card.querySelector(".wcard__more"); return a ? a.getAttribute("href") : null; };

  /* ---------- Главная: 5 избранных карточек ---------- */
  const row = $("[data-featured]");
  if (row && window.PROJECTS) {
    const list = PROJECTS.filter((p) => p.featured).slice(0, 5);
    row.innerHTML = list.map((p, i) => `
      <article class="wcard" tabindex="0" aria-label="${esc(p.title)}">
        <div class="wcard__media">
          ${projectVisual(p)}
          <span class="wcard__num">${pad(i + 1)}</span>
          ${plate(p)}
        </div>
        <div class="wcard__caption">
          <strong>${esc(p.title)}</strong>
          <span>${esc(caption(p))}</span>
        </div>
      </article>`).join("");

    const cards = $$(".wcard", row);
    const setActive = (card) => {
      cards.forEach((c) => c.classList.toggle("is-active", c === card));
      row.classList.toggle("has-active", !!card);
    };
    cards.forEach((card) => {
      if (canHover) card.addEventListener("mouseenter", () => setActive(card));
      card.addEventListener("focus", () => setActive(card));
      card.addEventListener("click", (e) => {
        if (canHover && !e.target.closest("a")) { const u = caseUrl(card); if (u) { location.href = u; return; } } // на десктопе клик по карточке открывает кейс
        setActive(card.classList.contains("is-active") && !canHover ? null : card);
      });
    });
    if (canHover) row.addEventListener("mouseleave", () => setActive(null));
    row.addEventListener("focusout", (e) => { if (!row.contains(e.relatedTarget)) setActive(null); });
  }

  /* ---------- Страница «Кейсы» ---------- */
  const grid = $("[data-grid]");
  if (grid && window.PROJECTS) {
    grid.innerHTML = PROJECTS.map((p, i) => `
      <article class="gcard" tabindex="0" data-cat="${p.category}">
        <div class="wcard__media">
          ${projectVisual(p)}
          <span class="wcard__num">${pad(i + 1)}</span>
          ${plate(p)}
        </div>
        <div class="gcard__caption">
          <strong>${esc(p.title)}</strong>
          <span>${esc(caption(p))}</span>
        </div>
      </article>`).join("");

    // клик по карточке открывает кейс (на телефоне — по ссылке «Смотреть кейс» в раскрытой плашке)
    $$(".gcard", grid).forEach((card) => card.addEventListener("click", (e) => {
      if (canHover && !e.target.closest("a")) { const u = caseUrl(card); if (u) location.href = u; }
    }));

    const count = $("[data-count-all]");
    if (count) count.textContent = `[ ${pad(PROJECTS.length)} ]`;

    const filters = $("[data-filters]");
    const cats = [["all", "Все"], ...Object.entries({ design: "Дизайн", web: "Сайты", app: "Приложения", video: "Видео / AI" })];
    filters.innerHTML = cats.filter(([k]) => k === "all" || PROJECTS.some((p) => p.category === k)).map(([k, label]) => {
      const n = k === "all" ? PROJECTS.length : PROJECTS.filter((p) => p.category === k).length;
      return `<button class="filter${k === "all" ? " is-on" : ""}" type="button" data-f="${k}" aria-pressed="${k === "all"}">${label}<sup>${n}</sup></button>`;
    }).join("");
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      $$(".filter", filters).forEach((b) => { b.classList.toggle("is-on", b === btn); b.setAttribute("aria-pressed", b === btn); });
      const f = btn.dataset.f;
      $$(".gcard", grid).forEach((c) => c.classList.toggle("is-hidden", f !== "all" && c.dataset.cat !== f));
    });
  }

  /* ---------- Страница кейса: case.html?p=<slug> ---------- */
  const caseRoot = $("[data-case]");
  if (caseRoot && window.PROJECTS) {
    const slug = new URLSearchParams(location.search).get("p");
    const idx = PROJECTS.findIndex((p) => p.slug === slug);
    const p = PROJECTS[idx];
    if (!p) {
      caseRoot.innerHTML = `<a href="works.html" class="back mono">← все кейсы</a><h1 class="display">КЕЙС НЕ НАЙДЕН</h1>`;
    } else {
      document.title = `${p.title} — BLICK`;
      const blocks = p.blocks && p.blocks.length ? p.blocks : [
        { type: "grid", art: true },
        { type: "text", title: "О проекте", body: [p.desc] },
      ];
      const renderBlock = (b) => {
        if (b.type === "banner") {
          return b.src
            ? `<figure class="case__banner"><img src="${esc(url(b.src))}" alt="${esc(b.alt || p.title)}"></figure>`
            : `<figure class="case__banner case__banner--art">${projectVisual({ ...p, image: "" })}</figure>`;
        }
        if (b.type === "grid") {
          if (b.art || !(b.images || []).length) {
            return `<div class="case__grid">${[0, 1].map(() => `<figure class="case__tile">${projectVisual({ ...p, image: "" })}</figure>`).join("")}</div>`;
          }
          // фото рядами по 3 (хвост — по 2), в каждом ряду одинаковая высота: ширина каждого фото пропорциональна его формату
          const n = b.images.length, sizes = [];
          for (let k = n; k > 0;) { if (k === 4) { sizes.push(2, 2); break; } const t = Math.min(3, k); sizes.push(t); k -= t; }
          let i = 0;
          return `<div class="case__rows">${sizes.map((t) => `<div class="case__row">${b.images.slice(i, (i += t)).map((src, j) => {
            const idx = i - t + j, ar = (b.ratios && b.ratios[idx]) || 1.5;
            return `<img src="${esc(url(src))}" alt="${esc(p.title)}" loading="lazy" data-ar="${ar}" style="flex-grow:${ar};aspect-ratio:${ar}">`;
          }).join("")}</div>`).join("")}</div>`;
        }
        if (b.type === "single") {
          return `<figure class="case__single${b.scroll ? " case__single--scroll" : ""}"><img src="${esc(url(b.src))}" alt="${esc(b.alt || p.title)}"></figure>`;
        }
        if (b.type === "pdf") {
          // PDF по центру в окне с прокруткой; на телефонах, где PDF не листается внутри страницы, работает ссылка
          const r = b.ratio || 842 / 595, portrait = r < 1;
          return `<section class="case__pdf${portrait ? " case__pdf--portrait" : ""}">
            <div class="case__pdf-frame" style="aspect-ratio:${r.toFixed(4)}"><iframe src="${esc(url(b.src))}#toolbar=0&navpanes=0&view=FitH" title="${esc(b.title || "PDF")}" loading="lazy"></iframe></div>
            <a class="case__pdf-open mono" href="${esc(url(b.src))}" target="_blank" rel="noopener">${esc(b.title || "Открыть PDF")} — открыть отдельно ↗</a>
          </section>`;
        }
        if (b.type === "videos") {
          return `<div class="case__grid case__videos">${b.items.map((v) => `<figure class="case__video"><video src="${esc(url(v.src))}#t=0.1" muted loop playsinline preload="metadata" aria-label="${esc(v.title || "")}"></video>${v.title ? `<figcaption class="mono">${esc(v.title)}</figcaption>` : ""}</figure>`).join("")}</div>`;
        }
        if (b.type === "gallery") {
          return `<div class="case__gallery case__gallery--${b.images.length}">${b.images.map((src) => `<img src="${esc(url(src))}" alt="" loading="lazy">`).join("")}</div>`;
        }
        if (b.type === "text") {
          return `<section class="case__text">${b.title ? `<h2 class="mono">${esc(b.title)}</h2>` : ""}<div>${(b.body || []).map((t) => `<p>${esc(t)}</p>`).join("")}</div></section>`;
        }
        return "";
      };
      const facts = p.facts || [["Направление", CATEGORIES[p.category]], ...(p.year ? [["Год", String(p.year)]] : []), ["Услуги", p.tags.join(", ")]];
      const next = PROJECTS[(idx + 1) % PROJECTS.length];
      caseRoot.innerHTML = `
        <div class="case__top">
          <a href="works.html" class="back mono">← все кейсы</a>
          <span class="mono tag">[ ${pad(idx + 1)} / ${pad(PROJECTS.length)} ]</span>
        </div>
        <header class="case__head">
          <h1 class="display">${esc(p.title)}</h1>
          <dl class="case__facts mono">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        </header>
        <p class="case__lead">${esc(p.desc)}</p>
        ${blocks.map(renderBlock).join("")}
        <a class="case__next" href="case.html?p=${esc(next.slug)}">
          <span class="mono">следующий кейс</span>
          <strong class="display">${esc(next.title)} <span class="arr">↗</span></strong>
        </a>`;
      // пропорции фото в рядах уточняем по реальному размеру файла (если в данных их нет или они неточные)
      $$(".case__row img", caseRoot).forEach((img) => {
        const fix = () => { if (!img.naturalWidth) return; const ar = img.naturalWidth / img.naturalHeight; if (Math.abs(ar - parseFloat(img.dataset.ar)) > 0.01) { img.dataset.ar = ar; img.style.flexGrow = ar; img.style.aspectRatio = ar; } };
        if (img.complete) fix(); else img.addEventListener("load", fix, { once: true });
      });
      // ролики играют, пока видны на экране
      const vids = $$("video", caseRoot);
      if (vids.length && "IntersectionObserver" in window) {
        const vio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const pr = e.target.play(); if (pr && pr.catch) pr.catch(() => {}); } else e.target.pause(); }), { threshold: 0.35 });
        vids.forEach((v) => vio.observe(v));
      }
    }
  }

  /* ---------- Появление по скроллу ---------- */
  const revealEls = $$("[data-reveal]");
  if (reduced || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        // Лёгкая лесенка для соседних элементов
        const sibs = [...e.target.parentElement.children].filter((n) => n.hasAttribute("data-reveal"));
        e.target.style.setProperty("--d", `${Math.max(0, sibs.indexOf(e.target)) * 0.08}s`);
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Счётчики ---------- */
  const counters = $$("[data-count]");
  if (counters.length) {
    const run = (el) => {
      const target = +el.dataset.count;
      if (reduced) { el.textContent = target; return; }
      const t0 = performance.now(), dur = 1600;
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const co = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { run(e.target); co.unobserve(e.target); }
    }), { threshold: 0.6 });
    counters.forEach((c) => co.observe(c));
  }

  /* ---------- Форма ---------- */
  const form = $(".form");
  if (form) {
    const status = $(".form__status", form);
    const consentBox = form.elements.consent;
    if (consentBox) consentBox.addEventListener("change", () => consentBox.closest(".consent").classList.remove("is-error"));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let ok = true;
      ["name", "contact"].forEach((n) => {
        const input = form.elements[n];
        const bad = !input.value.trim();
        input.closest(".field").classList.toggle("is-error", bad);
        if (bad) ok = false;
      });
      status.classList.remove("ok");
      // без согласия на обработку персональных данных заявка не отправляется
      const consent = form.elements.consent;
      const noConsent = consent && !consent.checked;
      if (consent) consent.closest(".consent").classList.toggle("is-error", noConsent);
      if (!ok && noConsent) { status.textContent = "Заполните имя и контакт и подтвердите согласие"; return; }
      if (!ok) { status.textContent = "Заполните имя и контакт"; return; }
      if (noConsent) { status.textContent = "Подтвердите согласие на обработку персональных данных"; return; }

      const data = {
        name: form.elements.name.value.trim(),
        contact: form.elements.contact.value.trim(),
        message: form.elements.message.value.trim(),
        types: $$("input[name=type]:checked", form).map((i) => i.value),
        consent: true,
      };
      // Заявка уходит на почту студии через api/contact.py (Vercel)
      const btn = $("button[type=submit]", form);
      if (btn.disabled) return;
      btn.disabled = true;
      status.textContent = "Отправляем…";
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "blick-form" },
        body: JSON.stringify(data),
      })
        .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok && j.ok, error: j.error })))
        .catch(() => ({ ok: false }))
        .then((res) => {
          btn.disabled = false;
          if (res.ok) {
            status.textContent = "Спасибо! Ответим в течение рабочего дня.";
            status.classList.add("ok");
            form.reset();
          } else {
            status.textContent = res.error || "Не удалось отправить. Напишите нам на почту blickdesign@yandex.ru";
          }
        });
    });
  }

  /* ---------- Hero: фон (первый кадр виден сразу через CSS-постер) ---------- */
  const heroScrub = $(".hero-scrub");
  const hero = $(".hero");
  const video = $(".hero__video");
  const canvas = $(".hero__canvas");

  if (scrubEnabled) {
    // Десктоп: видео не используется вовсе — фон рисует canvas по кадрам (см. heroPinScrub)
    if (video) video.remove();
    if (canvas) heroPinScrub(heroScrub, hero, canvas);
  } else {
    if (canvas) canvas.remove();
    if (video) {
      video.muted = true; // на iOS автозапуск возможен только у muted-видео
      video.setAttribute("playsinline", "");
      // Мобильные / reduced-motion — обычное фоновое видео в цикле.
      // Проявляем его только когда оно реально пошло (событие playing): в режиме энергосбережения
      // iOS блокирует автозапуск — тогда остаётся постер (первый кадр), а не пустой чёрный кадр.
      video.loop = true;
      video.addEventListener("playing", () => hero.classList.add("has-video"), { once: true });
      const tryPlay = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };

      // Запасной вариант: если система запретила автозапуск (например, режим энергосбережения iOS),
      // "проигрываем" видео вручную — сами двигаем время кадр за кадром, это не считается автозапуском
      let manual = false;
      const startManual = () => {
        if (manual || !video.paused) return;
        manual = true;
        let vt = video.currentTime || 0, last = 0;
        video.addEventListener("seeked", () => hero.classList.add("has-video"), { once: true });
        const step = (ts) => {
          if (!video.paused) { manual = false; return; } // настоящий play() заработал — отпускаем
          if (!last) last = ts;
          vt += (ts - last) / 1000; last = ts;
          if (video.duration) {
            if (vt >= video.duration) vt = 0;
            if (!video.seeking) video.currentTime = vt;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };

      // Через секунду после загрузки страницы — старт (эта секунда покрывает подгрузку файла)
      setTimeout(() => {
        tryPlay();
        setTimeout(startManual, 600);
      }, 1000);
      // Если система разрешит позже — первое касание запускает настоящее воспроизведение
      ["touchend", "pointerup", "click"].forEach((ev) =>
        addEventListener(ev, () => { if (video.paused) tryPlay(); }, { once: true, passive: true })
      );
      document.addEventListener("visibilitychange", () => { if (!document.hidden && video.paused) tryPlay(); });
      video.addEventListener("error", () => video.remove(), { once: true }); // останется постер
      video.src = video.dataset.srcLight;
      video.load();
    }
  }

  // Оборачивает каждое слово внутри элемента в <span class="word">, не трогая теги внутри (например .accent)
  function wrapWords(root) {
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const span = document.createElement("span");
          span.className = "word";
          span.textContent = part;
          frag.appendChild(span);
        });
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        [...node.childNodes].forEach(walk);
      }
    }
    [...root.childNodes].forEach(walk);
    return [...root.querySelectorAll(".word")];
  }

  function heroPinScrub(wrap, hero, canvas) {
    wrap.classList.add("js-scrub");
    const fadeEls = [...$$(".hero__top > *", hero), ...$$(".hero__bottom > *", hero)];
    const reveal = $(".hero__reveal", hero);
    const main = $("main");
    const fade = $(".hero__fade", hero);
    const body = reveal ? $(".hero__reveal-body", reveal) : null;
    const words = reveal ? wrapWords(reveal) : [];
    // строки с оранжевой плашкой «выделенного текста»: её ширина следует за проявлением слов
    const plates = reveal ? $$(".hero__reveal-line, .hero__reveal-body-line", reveal).map((el) => ({ el, ws: [...$$(".word", el)] })) : [];
    let scrolling = false; // пока false — не мешаем вступительной анимации на загрузке
    const clamp01 = (n) => Math.min(1, Math.max(0, n));

    // Слово-за-словом проявляется в этом диапазоне, дальше держится на 100% и просто
    // уезжает вместе с видео, когда закрепление отпускает в конце
    const REVEAL_START = 0.36, REVEAL_END = 0.92;

    let ticking = false;

    // ---------- Рисование кадров ----------
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2); // выше 2x — впустую, только тяжелее канвас
    function sizeCanvas() {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    }
    sizeCanvas();

    let currentFrame = 0;
    function drawFrame(i) {
      currentFrame = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(i)));
      const img = frames[currentFrame];
      if (!img || !img.complete || !img.naturalWidth) return; // кадр ещё не догрузился — оставляем прежний
      const cw = canvas.width, ch = canvas.height;
      // object-fit: cover вручную — канвас не умеет сам
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    }
    const showFirstFrame = () => { hero.classList.add("has-video"); drawFrame(0); };
    if (frames[0] && frames[0].complete && frames[0].naturalWidth) showFirstFrame();
    else if (frames[0]) frames[0].addEventListener("load", showFirstFrame, { once: true });

    // Вступление: первая секунда проигрывается сама (по номинальному фрейм-рейту исходника),
    // дальше — только скролл, до последнего кадра.
    // introT0Frame — кадр, с которого начинается перемотка скроллом (0, если вступление не запускалось)
    const INTRO_END_FRAME = Math.min(FRAME_COUNT - 1, Math.round(FRAME_RATE));
    let introT0Frame = 0, introActive = false;
    const endIntro = () => {
      if (!introActive) return;
      introActive = false;
      introT0Frame = currentFrame;
      update();
    };
    // таймер, а не rAF: не засыпает в фоновой вкладке и не зависит от политик автозапуска видео
    const introStep = (startTs) => {
      if (!introActive) return;
      const f = Math.round(((performance.now() - startTs) / 1000) * FRAME_RATE);
      if (f >= INTRO_END_FRAME) { drawFrame(INTRO_END_FRAME); endIntro(); return; }
      drawFrame(f);
      setTimeout(() => introStep(startTs), 1000 / FRAME_RATE);
    };
    const startIntro = () => {
      if (scrollY > 8) return;
      introActive = true;
      introStep(performance.now());
    };
    bootReady.then(startIntro); // вступление — только когда заставка ушла

    // Затемнение под текстом второго экрана: считаем его положение от верха нижнего текста
    function fitBody() {
      if (!reveal || !body) return;
      if (fade) fade.style.top = (reveal.offsetTop + body.offsetTop).toFixed(1) + "px";
      // Длина градиента: от верха текста до низа экрана + отрезок --grad блока «услуги».
      // Слой продлён ещё на 300px сплошным цветом вниз — так при любой разнице высот экрана (vh / svh / innerHeight, тулбар Safari)
      // между затемнением и сплошным фоном блока «услуги» не остаётся щели, через которую видно видео
      const grad = Math.min(innerHeight * 0.24, 170);
      const len = Math.max(0, hero.offsetHeight - reveal.offsetTop - body.offsetTop + grad);
      if (fade) {
        fade.style.setProperty("--fade-solid", len.toFixed(1) + "px");
        fade.style.height = (len + 300).toFixed(1) + "px";
      }
    }
    fitBody();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBody);
    addEventListener("load", fitBody);
    let fitT;
    addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(fitBody, 120); });

    function update() {
      ticking = false;
      const wrapTop = wrap.offsetTop;
      const range = Math.max(1, wrap.offsetHeight - innerHeight);
      const y = scrollY;

      // После конца видео hero остаётся закреплённым (последний кадр держится на экране),
      // а следующий блок наезжает на него сверху — см. .hero-scrub.js-scrub + main
      const pinEnd = wrapTop + range;
      const covered = main ? y >= main.offsetTop + Math.min(innerHeight * 0.24, 170) : false; // блок «услуги» (градиент + сплошной фон) уже закрыл экран целиком
      let progress, extra = 0;
      if (y <= wrapTop && wrapTop > 0) {
        hero.style.position = "absolute";
        hero.style.top = "0px";
        progress = 0;
      } else if (y <= wrapTop) {
        // hero-scrub стоит в самом верху страницы (wrapTop = 0): держим hero закреплённым сразу, без переключения
        // absolute → fixed на первом же пикселе скролла — в Safari браузер успевал отрисовать кадр раньше скрипта, и экран «дёргался»
        hero.style.position = "fixed";
        hero.style.top = "0px";
        progress = 0;
      } else {
        hero.style.position = "fixed";
        hero.style.top = "0px";
        if (y >= pinEnd) { progress = 1; extra = y - pinEnd; }
        else progress = (y - wrapTop) / range;
      }
      hero.style.visibility = covered ? "hidden" : "";
      // Текст второго экрана после конца видео уезжает вверх вместе со скроллом
      const lift = extra ? `translateY(${(-extra).toFixed(1)}px)` : "";
      if (reveal) reveal.style.transform = lift;
      // затемнение поднимается вместе с текстом и плавно проявляется в первые 120px после конца видео
      const ramp = Math.min(1, extra / 120);
      if (fade) { fade.style.transform = lift; fade.style.opacity = String(ramp); }

      if (!introActive) drawFrame(introT0Frame + progress * ((FRAME_COUNT - 1) - introT0Frame));

      if (scrolling) {
        // Текст и меню первого экрана затухают за первые 35% прокрутки
        const fade = Math.min(1, progress / 0.35);
        fadeEls.forEach((el) => {
          el.style.opacity = String(1 - fade);
          el.style.transform = `translateY(${(-14 * fade).toFixed(1)}px)`;
          el.style.pointerEvents = fade > 0.6 ? "none" : "";
        });

        // Заголовок и текст проявляются следом — слово за словом вместе со скроллом:
        // просто из прозрачного в 100% непрозрачности, без блюра и сдвига
        if (reveal && words.length) {
          const r = clamp01((progress - REVEAL_START) / (REVEAL_END - REVEAL_START));
          const n = words.length;
          // Окно проявления одного слова — соседние слова слегка перекрываются, не мигают по одному;
          // старт слов растянут так, что последнее слово всегда доходит до 100% ровно при r = 1
          const fadeSpan = Math.min(0.5, 3 / n);
          const startSpan = 1 - fadeSpan;
          words.forEach((w, i) => {
            const wordStart = n > 1 ? (i / (n - 1)) * startSpan : 0;
            const t = clamp01((r - wordStart) / fadeSpan);
            w.style.opacity = String(t);
            w._t = t;
          });
          plates.forEach(({ el, ws }) => {
            let prev = 0, right = 0;
            for (const w of ws) {
              if (!w._t) break;
              const end = w.offsetLeft + w.offsetWidth;
              right = prev + (end - prev) * w._t;
              prev = end;
            }
            el.style.setProperty("--plate", right.toFixed(1) + "px");
          });
        }
      }
    }

    addEventListener("scroll", () => {
      endIntro(); // пользователь начал скроллить — вступление заканчивается на текущем кадре
      if (!scrolling) {
        // Первый реальный скролл — отключаем плавный transition вступления,
        // дальше всё идёт 1:1 со скроллом, без задержки
        scrolling = true;
        fadeEls.forEach((el) => { el.style.transition = "none"; });
        if (reveal) reveal.style.transition = "none";
      }
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    addEventListener("resize", () => { sizeCanvas(); update(); });
    update();
  }

  /* ---------- Бегущая строка в шапке: "карусельное" сжатие у краёв ---------- */
  const marquee = $(".hero__marquee");
  if (marquee && !reduced) marqueeLoop(marquee);

  function marqueeLoop(wrap) {
    const track = $(".hero__marquee__track", wrap);
    const items = () => $$("span, i", track);
    let on = false, raf;

    function tick() {
      const rect = wrap.getBoundingClientRect();
      if (rect.width) {
        const cx = rect.left + rect.width / 2;
        const half = rect.width / 2;
        for (const el of items()) {
          const r = el.getBoundingClientRect();
          const dist = Math.abs(r.left + r.width / 2 - cx);
          const t = Math.min(1, dist / half);
          const scale = 1 - t * 0.4;
          el.style.transform = `scale(${scale.toFixed(3)})`;
          el.style.opacity = (1 - t * 0.75).toFixed(3);
        }
      }
      if (on) raf = requestAnimationFrame(tick);
    }

    new IntersectionObserver(([e]) => {
      const visible = e.isIntersecting && getComputedStyle(wrap).display !== "none";
      if (visible && !on) { on = true; raf = requestAnimationFrame(tick); }
      if (!visible && on) { on = false; cancelAnimationFrame(raf); }
    }).observe(hero);
  }

  /* ---------- Курсор: crop-маркер ----------
     Оранжевая точка точно под мышью + рамка из четырёх угловых скобок вокруг неё.
     Над изображением рамка плавно растягивается до границ картинки. */
  if (!reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const FRAME_SEL = ".wcard__media, .case__banner, .case__tile, .case__video, .case__grid img, .case__gallery img, .case__single img, .case__rows img";
    const LINK_SEL = "a, button, summary, label.chip, .chip, .filter, [role=button]";
    const NATIVE_SEL = "input, textarea, select, iframe"; // здесь остаётся системный курсор
    const IDLE = 26, LINK = 38, INSET = 8; // размеры рамки; INSET — отступ скобок внутрь картинки

    const dot = document.createElement("div"); dot.className = "cursor-dot";
    const frame = document.createElement("div"); frame.className = "cursor-frame";
    frame.innerHTML = "<i></i><i></i><i></i><i></i>";
    dot.setAttribute("aria-hidden", "true"); frame.setAttribute("aria-hidden", "true");
    document.body.append(frame, dot);
    document.documentElement.classList.add("has-cursor");

    let px = -100, py = -100, seen = false, native = false, target = null, link = false, pressed = false;
    const cur = { x: -100, y: -100, w: IDLE, h: IDLE };
    const show = (on) => { dot.classList.toggle("is-visible", on); frame.classList.toggle("is-visible", on); };

    addEventListener("pointermove", (e) => {
      px = e.clientX; py = e.clientY;
      const t = e.target instanceof Element ? e.target : null;
      native = !!(t && t.closest(NATIVE_SEL));
      target = !native && t ? t.closest(FRAME_SEL) : null;
      link = !native && !!(t && t.closest(LINK_SEL));
      dot.classList.toggle("is-link", link && !target);
      if (!seen) { seen = true; cur.x = px - IDLE / 2; cur.y = py - IDLE / 2; }
      show(!native);
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => show(false));
    addEventListener("pointerdown", () => { pressed = true; });
    addEventListener("pointerup", () => { pressed = false; });

    (function loop() {
      let tx, ty, tw, th;
      if (target && target.isConnected) {
        // граница картинки берётся каждый кадр — карточка может расти при наведении, страница — скроллиться
        const r = target.getBoundingClientRect();
        tx = r.left + INSET; ty = r.top + INSET; tw = Math.max(IDLE, r.width - INSET * 2); th = Math.max(IDLE, r.height - INSET * 2);
      } else {
        const s = (link ? LINK : IDLE) * (pressed ? 0.8 : 1);
        tw = th = s; tx = px - s / 2; ty = py - s / 2;
      }
      const k = target ? 0.18 : 0.32;
      cur.x += (tx - cur.x) * k; cur.y += (ty - cur.y) * k;
      cur.w += (tw - cur.w) * k; cur.h += (th - cur.h) * k;
      frame.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0)`;
      frame.style.width = cur.w.toFixed(1) + "px"; frame.style.height = cur.h.toFixed(1) + "px";
      dot.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      requestAnimationFrame(loop);
    })();
  }
})();

/* ---------- Нижний левый блок hero: выравнивание по сетке ----------
   • "Диджитал Ателье" — по правому краю, по центру буквы "B" из "( B )"
   • BLICK — верх заглавных вровень с верхом строки "Мы собираем…"
   • "визуальное производство" — по ширине BLICK (левый и правый край)
   • низ "для бизнеса" — вровень с низом кнопки "Обсудить проект" */
(() => {
  const title = document.querySelector(".hero__title");
  const aside = document.querySelector(".hero__aside");
  if (!title || !aside) return;
  const da = title.querySelector(".hero__da");
  const nameLine = title.querySelector(".hero__line--name");
  const name = title.querySelector(".hero__name");
  const sub2 = title.querySelector(".hero__sub--2");
  const sub3 = title.querySelector(".hero__sub--3");
  const daText = da.firstElementChild, sub2Text = sub2.firstElementChild, sub3Text = sub3.firstElementChild;
  const mark = aside.querySelector(".hero__mark");
  const scrollIcon = document.querySelector(".hero__scroll");
  const lead = aside.querySelector(".hero__lead");
  const pill = aside.querySelector(".pill");
  const brandTag = document.querySelector(".hero__brand .tag"); // "[ v.01b ]" — ориентир для мобильного top ниже
  const ctx = document.createElement("canvas").getContext("2d");

  // Положение базовой линии и размеры глифов внутри строки: считаем по метрикам шрифта
  function metrics(el, sample) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    const m = ctx.measureText(sample || "H");
    const lh = cs.lineHeight === "normal" ? fs * 1.2 : parseFloat(cs.lineHeight);
    const base = (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    return { base, cap: ctx.measureText("H").actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
  }
  // offsetTop относительно .hero__bottom (он position:relative) — не зависит от transform-анимаций
  const top = (el) => { let y = 0; for (; el && !el.classList.contains("hero__bottom"); el = el.offsetParent) y += el.offsetTop; return y; };

  // Границы самих букв (а не блока). Считаем без canvas: положение букв берём из DOM (Range),
  // а боковые поля глифов — из таблиц шрифтов (в долях em), поэтому результат не зависит от браузера
  const RSB = { K: .032, C: .058, О: .058, А: .075, ")": .08 };
  const LSB = { B: .072, В: .072 };
  function charRect(el, i) {
    let node = i < 0 ? el.lastChild : el.firstChild; // первая/последняя буква — в крайних текстовых узлах
    // если крайний узел — элемент-обёртка (например, цветной span вокруг скобки), спускаемся до текста внутри
    while (node && node.nodeType !== Node.TEXT_NODE) node = i < 0 ? node.lastChild : node.firstChild;
    const r = document.createRange();
    const k = i < 0 ? node.length + i : i;
    r.setStart(node, k); r.setEnd(node, k + 1);
    return r.getBoundingClientRect();
  }
  const fsOf = (el) => parseFloat(getComputedStyle(el).fontSize);
  const lsOf = (el) => parseFloat(getComputedStyle(el).letterSpacing) || 0;
  // правый край букв i-го символа (с учётом межбуквенного интервала, который добавляется после символа)
  const inkRight = (el, i, rsb) => charRect(el, i).right - lsOf(el) - rsb * fsOf(el);
  const inkLeft = (el, lsb) => charRect(el, 0).left + lsb * fsOf(el);

  function layout() {
    [da, sub2, sub3].forEach((l) => { l.style.marginTop = ""; l.style.marginBottom = ""; l.style.left = ""; });
    title.style.removeProperty("--sub-fs");

    name.style.fontSize = ""; nameLine.style.marginLeft = "";

    // Телефон: BLICK растягиваем на всю ширину блока — левый край "B" вровень с "визуальное",
    // правый край "K" вровень с "производство", "для бизнеса" и ")" сверху
    if (scrollIcon) scrollIcon.style.marginBottom = "";
    if (matchMedia("(max-width: 860px)").matches) {
      sub2.style.marginTop = "6px";
      const tL = inkLeft(sub2Text, LSB.В), tR = inkRight(sub2Text, -1, RSB.О);
      const nL = inkLeft(name, LSB.B), nR = inkRight(name, 4, RSB.K);
      if (nR > nL && tR > tL) {
        name.style.fontSize = (fsOf(name) * (tR - tL) / (nR - nL)).toFixed(2) + "px";
        nameLine.style.marginLeft = (parseFloat(getComputedStyle(nameLine).marginLeft) + tL - inkLeft(name, LSB.B)).toFixed(2) + "px";
      }
      // Сам заголовок (CSS выше делает его position:absolute; right:0) поднимаем наверх,
      // в правый угол — верх вровень с верхом "[ v.01b ]" слева. title.offsetParent — hero__bottom,
      // поэтому top считаем как разницу между тегом и собственным верхом hero__bottom.
      // offsetTop, а не getBoundingClientRect: на старте тег ещё сдвинут transform-анимацией появления
      if (brandTag) {
        const heroEl = title.closest(".hero");
        const within = (el) => { let y = 0; for (; el && el !== heroEl; el = el.offsetParent) y += el.offsetTop; return y; };
        title.style.top = (within(brandTag) - within(title.offsetParent)).toFixed(1) + "px";
      }
      return;
    }
    title.style.top = ""; // на десктопе заголовок остаётся в обычном потоке

    // Эталон — буквы BLICK: левый край "B", правый край "C" и правый край "K"
    const refL = inkLeft(name, LSB.B);
    const refC = inkRight(name, 3, RSB.C);
    const refR = inkRight(name, 4, RSB.K);

    // "визуальное производство": от левого края "B" до правого края "C"; "для бизнеса" — того же размера
    const fs0 = fsOf(sub2Text);
    const boxW = sub2Text.getBoundingClientRect().width;
    const inkEm = boxW / fs0 - LSB.В - RSB.О;
    if (inkEm > 0) title.style.setProperty("--sub-fs", ((refC - refL) / inkEm).toFixed(3) + "px");
    sub2.style.position = sub3.style.position = da.style.position = "relative";
    sub2.style.left = (refL - inkLeft(sub2Text, LSB.В)).toFixed(2) + "px";
    sub3.style.left = (refR - inkRight(sub3Text, -1, RSB.А)).toFixed(2) + "px";
    da.style.left = (refR - inkRight(daText, -1, RSB[")"])).toFixed(2) + "px";

    const markY = top(mark) + (() => { const m = metrics(mark, "B"); return m.base - m.cap / 2; })();
    const leadY = top(lead) + (() => { const m = metrics(lead); return m.base - m.cap; })();
    const pillBottom = top(pill) + pill.offsetHeight;

    const dm = metrics(daText, "Д");
    da.style.marginTop = (markY - (dm.base - dm.cap / 2)).toFixed(2) + "px";

    const nm = metrics(name);
    const nameCap = top(name) + nm.base - nm.cap;
    da.style.marginBottom = (leadY - nameCap).toFixed(2) + "px";

    // строка набрана заглавными — низ букв это базовая линия (без выносных элементов)
    // строка «для бизнеса» набрана заглавными — низ букв это базовая линия. Берём её из самой вёрстки:
    // нулевой inline-элемент встаёт ровно на базовую линию в любом браузере (без расчётов по метрикам шрифта)
    let probe = sub3Text.querySelector(".baseline-probe");
    if (!probe) {
      probe = document.createElement("span");
      probe.className = "baseline-probe";
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      sub3Text.insertBefore(probe, sub3Text.firstChild);
    }
    const inkBottom = top(probe);
    // отступ считаем от нулевого (в начале layout margin сброшен): ровно столько, чтобы базовая линия легла на низ кнопки
    sub2.style.marginTop = (pillBottom - inkBottom).toFixed(2) + "px";
    // иконка прокрутки: низ — вровень с низом кнопки «Обсудить проект»; измеряем фактическое положение и доводим
    if (scrollIcon) {
      scrollIcon.style.marginBottom = "0px";
      const iconBottom = top(scrollIcon) + scrollIcon.offsetHeight;
      scrollIcon.style.marginBottom = Math.max(0, iconBottom - pillBottom).toFixed(2) + "px";
    }
  }

  let t;
  const run = () => { clearTimeout(t); t = setTimeout(layout, 80); };
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  addEventListener("load", layout);
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", layout);
  addEventListener("resize", run);
})();

/* ---------- Подсказка к слову «Ателье» ---------- */
(() => {
  const word = document.querySelector(".hero__hint");
  const tip = document.querySelector(".hero__tip");
  const title = document.querySelector(".hero__title");
  if (!word || !tip || !title) return;
  const place = () => {
    const w = word.getBoundingClientRect(), t = title.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    // над словом, правый край подсказки — по правому краю слова; не выходим за экран
    let left = w.right - tw;
    left = Math.max(16, Math.min(left, innerWidth - 16 - tw));
    tip.style.left = (left - t.left).toFixed(1) + "px";
    tip.style.top = (w.top - t.top - th - 12).toFixed(1) + "px";
  };
  const open = () => { place(); tip.classList.add("is-open"); word.classList.add("is-open"); };
  const close = () => { tip.classList.remove("is-open"); word.classList.remove("is-open"); };
  word.addEventListener("mouseenter", open);
  word.addEventListener("mouseleave", close);
  word.addEventListener("focus", open);
  word.addEventListener("blur", close);
  word.addEventListener("click", (e) => { e.stopPropagation(); tip.classList.contains("is-open") ? close() : open(); });
  document.addEventListener("click", close);
  addEventListener("scroll", close, { passive: true });
})();

/* ---------- «Кейсы»: пояснение справа выровнено по нижнему краю букв заголовка ----------
   низ последней строки — вровень с базовой линией «КЕЙСЫ» */
(() => {
  const intro = document.querySelector(".works__intro");
  const h = intro && intro.querySelector("h2");
  const note = intro && intro.querySelector(".works__note");
  if (!h || !note) return;
  const ctx = document.createElement("canvas").getContext("2d");
  const metr = (el, lh) => {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    const m = ctx.measureText("H");
    const L = lh || (parseFloat(cs.lineHeight) || fs * 1.2);
    return { L, base: (L - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent, cap: m.actualBoundingBoxAscent };
  };
  function layout() {
    note.style.lineHeight = ""; note.style.marginTop = ""; intro.style.alignItems = "";
    if (matchMedia("(max-width: 860px)").matches) return;
    intro.style.alignItems = "flex-start";
    const hm = metr(h);
    const baseY = (h.offsetTop - intro.offsetTop) + hm.base; // базовая линия «КЕЙСЫ»
    const n0 = metr(note);
    const lines = Math.max(1, Math.round(note.offsetHeight / n0.L));
    // межстрочный интервал не трогаем — сдвигаем блок так, чтобы базовая линия последней строки легла на базовую линию «КЕЙСЫ»
    note.style.marginTop = Math.max(0, baseY - ((lines - 1) * n0.L + n0.base) + 2).toFixed(2) + "px"; // +2px: по просьбе, чуть ниже линии
  }
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  addEventListener("load", layout);
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(layout, 120); });
})();

/* ---------- Футер: правая колонка (почта + соцсети) ----------
   верх блока «Почта» — на верхнем крае подписей «Имя / Контакт», низ соцсетей — на нижнем краю поля «Задача»;
   расстояние между блоками подбирается автоматически */
(() => {
  const grid = document.querySelector(".footer__grid");
  const form = grid && grid.querySelector(".form");
  const contacts = grid && grid.querySelector(".contacts");
  const area = form && form.querySelector("textarea");
  const inputs = form && form.querySelectorAll(".form__row input");
  const blocks = contacts ? [...contacts.children] : [];
  if (!area || !inputs || !inputs.length || blocks.length < 2) return;
  const topIn = (el) => { let y = 0; for (; el && el !== grid; el = el.offsetParent) y += el.offsetTop; return y; };
  function layout() {
    contacts.style.marginTop = ""; contacts.style.gap = "";
    if (matchMedia("(max-width: 860px)").matches) return;
    const lineY = topIn(inputs[0].closest(".field"));          // верх подписей «Имя / Контакт»
    const areaBottom = topIn(area) + area.offsetHeight;       // нижний край поля «Задача»
    contacts.style.marginTop = Math.max(0, lineY - topIn(contacts)).toFixed(1) + "px";
    const total = blocks.reduce((sum, b) => sum + b.offsetHeight, 0);
    const gap = (areaBottom - lineY - total) / (blocks.length - 1);
    contacts.style.gap = Math.max(12, gap).toFixed(1) + "px";
  }
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  addEventListener("load", layout);
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(layout, 120); });
  // поле «Задача» можно растянуть мышью — пересчитываем
  if (window.ResizeObserver) new ResizeObserver(layout).observe(area);
})();

/* ---------- Заголовок второго экрана: «ВОЗМОЖНОСТЯМИ» вровень с концом первой строки ----------
   Если первая строка в браузере не растянулась (или не влезла), ширина контейнера подстраивается под неё,
   а третья строка сдвигается так, чтобы её последняя буква встала ровно под последней буквой «СТУДИЯ». */
(() => {
  const title = document.querySelector(".hero__reveal-title");
  if (!title) return;
  const l1 = title.querySelector(".hero__reveal-line--1");
  const l3 = title.querySelector(".hero__reveal-line--3");
  if (!l1 || !l3) return;
  const lastRight = (line) => { const w = line.querySelectorAll(".word"); return w.length ? w[w.length - 1].getBoundingClientRect().right : 0; };
  function layout() {
    title.style.width = ""; l3.style.marginRight = "";
    if (!title.querySelector(".word")) return;
    // естественная ширина первой строки (без растяжки)
    title.classList.add("is-measuring");
    const r = document.createRange(); r.selectNodeContents(l1);
    const natural = r.getBoundingClientRect().width;
    title.classList.remove("is-measuring");
    if (natural > title.getBoundingClientRect().width) title.style.width = Math.ceil(natural) + "px";
    // выравниваем конец третьей строки по концу первой
    const diff = lastRight(l3) - lastRight(l1);
    if (Math.abs(diff) > 0.3) l3.style.marginRight = diff.toFixed(2) + "px";
  }
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  addEventListener("load", layout);
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(layout, 120); });
})();
