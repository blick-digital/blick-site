/*
  Проекты студии — общий источник для главной и страницы «Все работы».

  Как заменить заглушку на свою картинку:
  положите файл в assets/works/ и укажите путь в поле image,
  например image: "assets/works/tyro.jpg". Пустое поле = абстрактная заглушка.

  featured: true — проект попадает в 5 карточек на главной (берутся первые пять).
  art — вид заглушки: orb | rings | grid | swirl | fibers | blob
*/
window.PROJECTS = [
  {
    title: "Nova Bank",
    category: "app",
    year: 2026,
    desc: "Мобильный банк для нового поколения: онбординг за 90 секунд, живые карточки и тактильная анимация переводов.",
    tags: ["iOS / Android", "UX-исследование", "Моушн"],
    art: "orb", hue: "amber",
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
    art: "fibers", hue: "amber",
    image: "",
    featured: true,
  },
  {
    title: "Exode Auto",
    category: "web",
    year: 2025,
    desc: "Промо-сайт электрокроссовера: конфигуратор в реальном времени, WebGL-сцены и запись на тест-драйв.",
    tags: ["Веб-сайт", "WebGL", "Конфигуратор"],
    art: "grid", hue: "ice",
    image: "",
    featured: true,
  },
  {
    title: "Rots Gear",
    category: "design",
    year: 2025,
    desc: "Визуальная система бренда городских рюкзаков: логотип, 3D-рендеры товара и гайдлайн для маркетплейсов.",
    tags: ["Брендинг", "3D-рендер", "Маркетплейсы"],
    art: "rings", hue: "steel",
    image: "",
    featured: true,
  },
  {
    title: "Kaskad Studio",
    category: "web",
    year: 2025,
    desc: "Портфолио архитектурного бюро: кинематографичный скролл, каталог объектов и CMS для команды.",
    tags: ["Веб-сайт", "CMS", "Анимация"],
    art: "swirl", hue: "ember",
    image: "",
  },
  {
    title: "Mята",
    category: "app",
    year: 2025,
    desc: "Приложение доставки здоровой еды: персональные рационы, трекер привычек и программа лояльности.",
    tags: ["Приложение", "Дизайн-система", "Прототип"],
    art: "blob", hue: "mint",
    image: "",
  },
  {
    title: "Северный Свет",
    category: "video",
    year: 2024,
    desc: "Имиджевый ролик для туристического кластера: AI-апскейл архивных кадров и генеративные переходы.",
    tags: ["Видео", "AI-графика", "Цветокор"],
    art: "fibers", hue: "ice",
    image: "",
  },
  {
    title: "Forma Lab",
    category: "design",
    year: 2024,
    desc: "Ребрендинг лаборатории косметики: новая типографика, система иконок и оформление соцсетей.",
    tags: ["Ребрендинг", "Типографика", "SMM"],
    art: "rings", hue: "ember",
    image: "",
  },
  {
    title: "Orbit CRM",
    category: "web",
    year: 2024,
    desc: "Интерфейс B2B-платформы: дашборды, сложные таблицы и дизайн-система на 200+ компонентов.",
    tags: ["SaaS", "Дизайн-система", "UI"],
    art: "grid", hue: "amber",
    image: "",
  },
  {
    title: "Tyro Watch",
    category: "app",
    year: 2024,
    desc: "Компаньон-приложение для смарт-часов: циферблаты, тренировки и синхронизация здоровья.",
    tags: ["watchOS", "Приложение", "Иконки"],
    art: "orb", hue: "steel",
    image: "",
  },
  {
    title: "Ноль Шесть",
    category: "video",
    year: 2024,
    desc: "Музыкальный клип с генеративной графикой: 40 уникальных AI-сцен, собранных в единый визуальный язык.",
    tags: ["Клип", "Генеративная графика", "Монтаж"],
    art: "swirl", hue: "amber",
    image: "",
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
