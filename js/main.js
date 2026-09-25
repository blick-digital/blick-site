// Обновление страницы всегда открывает её сверху, а не с прежней позиции скролла
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!location.hash) window.scrollTo(0, 0);

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover)").matches;
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Интро ---------- */
  const ready = () => requestAnimationFrame(() => document.body.classList.add("is-loaded"));
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]).then(ready);
  } else ready();

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
  const plate = (p) => `
    <div class="wcard__plate">
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.desc)}</p>
      <div class="wcard__tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
    </div>`;

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
          <span>${CATEGORIES[p.category]} · ${p.year}</span>
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
      card.addEventListener("click", () => setActive(card.classList.contains("is-active") && !canHover ? null : card));
    });
    if (canHover) row.addEventListener("mouseleave", () => setActive(null));
    row.addEventListener("focusout", (e) => { if (!row.contains(e.relatedTarget)) setActive(null); });
  }

  /* ---------- Страница «Все работы» ---------- */
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
          <span>${CATEGORIES[p.category]} · ${p.year}</span>
        </div>
      </article>`).join("");

    const count = $("[data-count-all]");
    if (count) count.textContent = `[ ${pad(PROJECTS.length)} ]`;

    const filters = $("[data-filters]");
    const cats = [["all", "Все"], ...Object.entries({ design: "Дизайн", web: "Сайты", app: "Приложения", video: "Видео / AI" })];
    filters.innerHTML = cats.map(([k, label]) => {
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
      };
      // Здесь подключается отправка: fetch на Formspree / бот Telegram / свой сервер.
      // fetch("https://formspree.io/f/XXXX", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      console.info("Заявка:", data);

      status.textContent = "Спасибо! Ответим в течение рабочего дня.";
      status.classList.add("ok");
      form.reset();
    });
  }

  /* ---------- Hero: фоновое видео (первый кадр — постер, виден сразу) ---------- */
  const heroScrub = $(".hero-scrub");
  const hero = $(".hero");
  const video = $(".hero__video");
  const scrubEnabled = heroScrub && !reduced && matchMedia("(min-width: 861px)").matches;

  if (video) {
    video.muted = true; // на iOS автозапуск возможен только у muted-видео
    video.setAttribute("playsinline", "");
    if (scrubEnabled) {
      // Перемотка управляется скроллом — видео не проигрывается само
      video.addEventListener("loadeddata", () => hero.classList.add("has-video"), { once: true });
    } else {
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
    }
    video.addEventListener("error", () => video.remove(), { once: true }); // останется постер
    video.src = video.dataset.src;
    if (!scrubEnabled) video.load();
  }

  /* ---------- Закреплённый hero: скролл перематывает видео вперёд/назад, текст затухает ---------- */
  if (scrubEnabled) heroPinScrub(heroScrub, hero, video);

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

  function heroPinScrub(wrap, hero, video) {
    wrap.classList.add("js-scrub");
    const fadeEls = [...$$(".hero__top > *", hero), ...$$(".hero__bottom > *", hero)];
    const reveal = $(".hero__reveal", hero);
    const main = $("main");
    const fade = $(".hero__fade", hero);
    const body = reveal ? $(".hero__reveal-body", reveal) : null;
    const words = reveal ? wrapWords(reveal) : [];
    let scrolling = false; // пока false — не мешаем вступительной анимации на загрузке
    const clamp01 = (n) => Math.min(1, Math.max(0, n));

    // Слово-за-словом проявляется в этом диапазоне, дальше держится на 100% и просто
    // уезжает вместе с видео, когда закрепление отпускает в конце
    const REVEAL_START = 0.36, REVEAL_END = 0.92;

    let duration = 0;
    let ticking = false;

    // Вступление: при загрузке видео само играет первую секунду (INTRO_END), дальше — только скролл.
    // introT0 — время видео, с которого начинается перемотка скроллом (0, если вступление не запускалось)
    const INTRO_END = 45 / 24; // кадр №45 при 24 к/с (1 с + 21 кадр) — до появления кругов на планшете
    let introT0 = 0, introActive = false;
    const endIntro = () => {
      if (!introActive) return;
      introActive = false;
      video.pause();
      introT0 = Math.min(video.currentTime, INTRO_END);
      update();
    };
    // таймер, а не rAF: короткий шаг даёт остановку точно на нужном кадре, и он не засыпает в фоновой вкладке
    const introWatch = () => {
      if (!introActive) return;
      if (video.currentTime >= INTRO_END) { video.currentTime = INTRO_END; endIntro(); return; }
      setTimeout(introWatch, 30);
    };
    const startIntro = () => {
      if (scrollY > 8) return;
      const p = video.play();
      if (p && p.then) p.then(() => { introActive = true; introWatch(); }).catch(() => {});
    };
    if (video.readyState >= 3) startIntro();
    else video.addEventListener("canplay", startIntro, { once: true });
    video.addEventListener("loadedmetadata", () => { duration = video.duration || 0; });

    // Нижний текст: ширина блока — от левого края до правого края слова «студия,» в верхнем заголовке;
    // строки растянуты на всю ширину (третья — по правому краю). Если шрифт не влезает — слегка уменьшаем.
    function fitBody() {
      if (!reveal || !body) return;
      const line1 = $(".hero__reveal-line--1", reveal);
      const w1 = line1 ? $$(".word", line1) : [];
      if (!w1.length) return;
      body.style.fontSize = "";
      body.style.width = "";
      const W = w1[w1.length - 1].getBoundingClientRect().right - reveal.getBoundingClientRect().left;
      if (W <= 0) return;
      body.style.width = W.toFixed(1) + "px";
      body.classList.add("is-measuring");
      const base = parseFloat(getComputedStyle(body).fontSize);
      let widest = 0;
      $$(".hero__reveal-body-line", body).forEach((l) => {
        const r = document.createRange(); r.selectNodeContents(l);
        widest = Math.max(widest, r.getBoundingClientRect().width);
      });
      body.classList.remove("is-measuring");
      if (widest > W) body.style.fontSize = (base * W / widest * 0.995).toFixed(2) + "px";
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
      if (y <= wrapTop) {
        hero.style.position = "absolute";
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

      if (duration && !introActive) video.currentTime = introT0 + progress * (duration - introT0);

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
    addEventListener("resize", update);
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

  /* ---------- Свечение у курсора: всегда, с первого движения мыши ---------- */
  const glow = $(".cursor-glow");
  if (glow && !reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let tx = innerWidth / 2, ty = innerHeight / 2, gx = tx, gy = ty;
    let moved = false;

    addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!moved) { moved = true; gx = tx; gy = ty; glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`; glow.classList.add("is-active"); } // свечение — с первого движения мыши, на любом экране
    }, { passive: true });

    (function loop() {
      gx += (tx - gx) * 0.16;
      gy += (ty - gy) * 0.16;
      glow.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
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
  const lead = aside.querySelector(".hero__lead");
  const pill = aside.querySelector(".pill");
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
    const node = i < 0 ? el.lastChild : el.firstChild; // первая/последняя буква — в крайних текстовых узлах
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

    // Телефон: без подгонки — строки просто выравниваются по правому краю блока
    if (matchMedia("(max-width: 860px)").matches) { sub2.style.marginTop = "6px"; return; }

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
    const sm = metrics(sub3Text, "Д");
    const inkBottom = top(sub3Text) + sm.base;
    sub2.style.marginTop = Math.max(6, 6 + pillBottom - inkBottom).toFixed(2) + "px";
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
