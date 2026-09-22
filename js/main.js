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
  if (topNav) {
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
      if (!ok) { status.textContent = "Заполните имя и контакт"; return; }

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

  /* ---------- Hero: видео или canvas-анимация ---------- */
  const hero = $(".hero");
  const video = $(".hero__video");
  if (video) {
    video.addEventListener("loadeddata", () => {
      hero.classList.add("has-video");
      video.play().catch(() => {});
    }, { once: true });
    video.addEventListener("error", () => video.remove(), { once: true });
    video.src = video.dataset.src;
  }

  const canvas = $(".hero__canvas");
  if (canvas) fibers(canvas, hero);

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

  /* Пучок светящихся волокон — заглушка, пока нет видео */
  function fibers(cv, host) {
    const ctx = cv.getContext("2d");
    let w, h, dpr, strands = [], sparks = [];
    let mx = 0, my = 0, tx = 0, ty = 0, running = true, raf;

    const rand = (a, b) => a + Math.random() * (b - a);

    function build() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = host.clientWidth; h = host.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = w * 0.52, cy = w < 860 ? Math.min(h * 0.4, innerHeight * 0.36) : h * 0.56;
      const R = Math.min(w, h) * 0.16;
      const n = w < 860 ? 46 : 72;
      strands = Array.from({ length: n }, () => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * R;
        const z = Math.pow(Math.random(), 1.6);
        const tipX = cx + Math.cos(a) * r;
        const tipY = cy + Math.sin(a) * r * 0.7 + (1 - z) * -R * 0.3;
        return {
          z, phase: rand(0, Math.PI * 2), speed: rand(0.3, 0.7),
          sx: cx - w * 0.12 + (tipX - cx) * 1.6 + rand(-w * 0.05, w * 0.05),
          sy: -h * 0.12,
          tipX, tipY,
          bend: rand(-1, 1),
          width: 1.2 + z * 7,
        };
      }).sort((a, b) => a.z - b.z);

      sparks = Array.from({ length: w < 860 ? 40 : 80 }, () => ({
        x: rand(w * 0.2, w * 0.85), y: rand(0, h),
        r: rand(0.6, 2.4), vy: rand(-0.35, -0.08), vx: rand(-0.12, 0.12),
        a: rand(0.2, 0.9), p: rand(0, 6),
      }));
    }

    function draw(t) {
      t *= 0.001;
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      ctx.clearRect(0, 0, w, h);

      // Тёплое свечение за пучком
      const g = ctx.createRadialGradient(w * 0.52, h * 0.55, 0, w * 0.52, h * 0.55, Math.max(w, h) * 0.5);
      g.addColorStop(0, "rgba(255,140,40,0.16)");
      g.addColorStop(1, "rgba(10,10,11,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (const s of strands) {
        const sway = Math.sin(t * s.speed + s.phase);
        const par = 10 + s.z * 40;
        const ex = s.tipX + sway * (4 + s.z * 10) + mx * par;
        const ey = s.tipY + Math.cos(t * s.speed * 0.8 + s.phase) * 4 + my * par * 0.6;
        const c1x = s.sx + s.bend * 60, c1y = h * 0.18;
        const c2x = ex - (ex - w * 0.52) * 0.25 + s.bend * 40 + sway * 20, c2y = ey - h * 0.28;

        const alpha = 0.25 + s.z * 0.75;
        const lg = ctx.createLinearGradient(s.sx, s.sy, ex, ey);
        lg.addColorStop(0, "rgba(60,30,12,0)");
        lg.addColorStop(0.45, `rgba(120,62,24,${0.35 * alpha})`);
        lg.addColorStop(0.85, `rgba(214,120,40,${0.75 * alpha})`);
        lg.addColorStop(1, `rgba(255,214,140,${alpha})`);
        ctx.strokeStyle = lg;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
        ctx.stroke();

        // Светящийся кончик
        const gr = s.width * (3 + Math.sin(t * 2 + s.phase) * 0.6);
        const tg = ctx.createRadialGradient(ex, ey, 0, ex, ey, gr);
        tg.addColorStop(0, `rgba(255,240,190,${alpha})`);
        tg.addColorStop(0.3, `rgba(255,180,70,${0.55 * alpha})`);
        tg.addColorStop(1, "rgba(255,120,20,0)");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(ex, ey, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Искры
      for (const p of sparks) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = rand(w * 0.2, w * 0.85); }
        const a = p.a * (0.5 + 0.5 * Math.sin(t * 1.5 + p.p));
        const sg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        sg.addColorStop(0, `rgba(255,220,150,${a})`);
        sg.addColorStop(1, "rgba(255,150,40,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      if (running && !reduced) raf = requestAnimationFrame(draw);
    }

    build();
    raf = requestAnimationFrame(draw);

    let rt;
    addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { build(); if (reduced) requestAnimationFrame(draw); }, 150);
    });
    host.addEventListener("pointermove", (e) => {
      tx = e.clientX / w - 0.5;
      ty = e.clientY / h - 0.5;
    });
    // Не рисуем, когда первый экран не виден или видео уже загружено
    new IntersectionObserver(([e]) => {
      const on = e.isIntersecting && !host.classList.contains("has-video");
      if (on && !running) { running = true; raf = requestAnimationFrame(draw); }
      if (!on) { running = false; cancelAnimationFrame(raf); }
    }).observe(host);
  }
})();
