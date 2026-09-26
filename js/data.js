/*
  Проекты студии — общий источник для главной и страницы «Все работы».

  Как заменить заглушку на свою картинку:
  положите файл в assets/works/ и укажите путь в поле image,
  например image: "assets/works/tyro.jpg". Пустое поле = абстрактная заглушка.

  featured: true — проект попадает в карточки «Кейсы» на главной (берутся первые пять).
  art — вид заглушки: orb | rings | grid | swirl | fibers | blob
  slug — адрес страницы кейса: case.html?p=<slug>
  blocks — содержимое страницы кейса (необязательно), по порядку сверху вниз:
    { type: "banner", src: "assets/works/xxx.jpg", alt: "…" }          — одно фото на всю ширину экрана
    { type: "grid", images: ["a.jpg", "b.jpg"] }                          — сетка на всю ширину экрана: фото в две колонки (можно 2, 4, 6…)
    { type: "text", title: "О проекте", body: ["абзац 1", "абзац 2"] }  — текстовый блок
    { type: "gallery", images: ["a.jpg", "b.jpg"] }                       — 2–3 картинки в ряд внутри полей
  Если blocks нет — страница покажет сетку-заглушку из двух плиток и описание desc.
  facts — строки справа от заголовка: [["Клиент", "…"], ["Роль", "…"]]
  overlay: true — картинка с прозрачным фоном показывается поверх заглушки (круги остаются на фоне)
*/
window.PROJECTS = [
  {
    slug: "nova-bank",
    title: "Nova Bank",
    category: "app",
    year: 2026,
    desc: "Мобильный банк для нового поколения: онбординг за 90 секунд, живые карточки и тактильная анимация переводов.",
    tags: ["iOS / Android", "UX-исследование", "Моушн"],
    art: "blob", hue: "amber",
    image: "",
    featured: true,
  },
  {
    slug: "oliva-casa",
    title: "Oliva Casa",
    category: "design",
    year: 2026,
    desc: "Айдентика и упаковка для линейки оливкового масла: этикетка, фирменный паттерн и фотостиль.",
    tags: ["Айдентика", "Упаковка", "Фотостиль"],
    art: "blob", hue: "olive",
    image: "",
    featured: true,
  },
  {
    slug: "pulse-motion",
    title: "Pulse Motion",
    category: "video",
    year: 2025,
    desc: "Серия AI-роликов для запуска кроссовок: генеративные сцены, 3D-продукт и монтаж под вертикальные форматы.",
    tags: ["AI-видео", "3D", "Reels / Shorts"],
    art: "blob", hue: "violet",
    image: "",
    featured: true,
  },
  {
    slug: "exode-auto",
    title: "Exode Auto",
    category: "web",
    year: 2025,
    desc: "Промо-сайт электрокроссовера: конфигуратор в реальном времени, WebGL-сцены и запись на тест-драйв.",
    tags: ["Веб-сайт", "WebGL", "Конфигуратор"],
    art: "blob", hue: "ice",
    image: "",
    featured: true,
  },
  {
    slug: "hotu-as",
    title: "Хоту-Ас",
    category: "design",
    year: 2026,
    desc: "Айдентика и мерч для этно-проекта «Хоту-Ас» (Этноран, Якутия): геометрический орнамент, знак с оленем и паттерн на шоппере.",
    tags: ["Айдентика", "Паттерн", "Мерч"],
    art: "blob", hue: "ice",
    image: "assets/works/hotu-as.jpg",
    facts: [["Клиент", "Этноран, Якутия"], ["Год", "2026"], ["Услуги", "Айдентика, паттерн, мерч"]],
    blocks: [
      { type: "grid", images: ["assets/works/hotu-as.jpg", "assets/works/hotu-as.jpg"] }, // заглушка: замените вторым фото
      { type: "text", title: "О проекте", body: [
        "Айдентика для этно-проекта «Хоту-Ас»: знак с оленем, яркий геометрический орнамент и фирменный паттерн, который работает на мерче, упаковке и в digital.",
        "Здесь вы можете описать задачу клиента, ход работы и результат. Текст и баннеры на всю ширину экрана добавляются в блоки этого кейса в js/data.js.",
      ] },
    ],
    featured: true,
  },
];

window.CATEGORIES = {
  design: "Графический дизайн",
  web: "Веб-сайт",
  app: "Мобильное приложение",
  video: "Видео / AI",
};

/* Рендер визуала проекта: картинка, если есть, иначе заглушка */
window.projectVisual = function (p) {
  if (p.image && p.overlay) {
    return `<div class="art art--${p.art} hue--${p.hue}" aria-hidden="true"><i></i><b></b></div><img class="art-img art-img--over" src="${p.image}" alt="${p.title}" loading="lazy">`;
  }
  if (p.image) {
    return `<img class="art-img" src="${p.image}" alt="${p.title}" loading="lazy">`;
  }
  return `<div class="art art--${p.art} hue--${p.hue}" aria-hidden="true"><i></i><b></b></div>`;
};
