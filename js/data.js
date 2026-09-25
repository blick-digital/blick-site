/*
  Проекты студии — общий источник для главной и страницы «Все работы».

  Как заменить заглушку на свою картинку:
  положите файл в assets/works/ и укажите путь в поле image,
  например image: "assets/works/tyro.jpg". Пустое поле = абстрактная заглушка.

  featured: true — проект попадает в карточки «Кейсы» на главной (берутся первые пять).
  art — вид заглушки: orb | rings | grid | swirl | fibers | blob
*/
window.PROJECTS = [
  {
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
    title: "Rots Gear",
    category: "design",
    year: 2025,
    desc: "Визуальная система бренда городских рюкзаков: логотип, 3D-рендеры товара и гайдлайн для маркетплейсов.",
    tags: ["Брендинг", "3D-рендер", "Маркетплейсы"],
    art: "blob", hue: "ember",
    image: "",
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
  if (p.image) {
    return `<img class="art-img" src="${p.image}" alt="${p.title}" loading="lazy">`;
  }
  return `<div class="art art--${p.art} hue--${p.hue}" aria-hidden="true"><i></i><b></b></div>`;
};
