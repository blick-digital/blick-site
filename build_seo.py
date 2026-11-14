#!/usr/bin/env python3
"""Собирает статические страницы и карту сайта из js/data.js. Без зависимостей."""

import json
import re
from html import escape
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape as xml_escape

from service_content import SERVICES

ROOT = Path(__file__).resolve().parent
ORIGIN = "https://blickdesign.ru"
SITE_IMAGE = "assets/video/hero-poster.jpg"
CATEGORIES = {
    "design": ("Графический дизайн", "Дизайн"),
    "web": ("Веб-сайт", "Сайты"),
    "app": ("Мобильное приложение", "Приложения"),
    "video": ("Видео / AI", "Видео / AI"),
}


def e(value):
    return escape(str(value), quote=True)


def media(path, prefix=""):
    return e(prefix + quote(path, safe="/:#?=&()'@!$*+,;~%"))


def case_path(slug):
    return f"cases/{slug}/"


def case_name(p):
    return f'{p["title"]} — {p.get("format") or CATEGORIES[p["category"]][0]}'


def visual(p, alt):
    art = f'<div class="art art--{e(p["art"])} hue--{e(p["hue"])}" aria-hidden="true"><i></i><b></b></div>'
    if not p.get("image"):
        return art
    overlay = p.get("overlay")
    css = "art-img art-img--over" if overlay else "art-img"
    img = f'<img class="{css}" src="{media(p["image"])}" alt="{e(alt)}" loading="lazy" decoding="async">'
    return art + img if overlay else img


def card(p, number, featured=False):
    title = e(p["title"])
    fmt = p.get("format") or CATEGORIES[p["category"]][0]
    caption = fmt + (f' · {p["year"]}' if p.get("year") else "")
    tags = "".join(f"<span>{e(t)}</span>" for t in p["tags"])
    css = "wcard" if featured else "gcard"
    attr = f'aria-label="{title}"' if featured else f'data-cat="{e(p["category"])}"'
    return f'''<article class="{css}" tabindex="0" {attr}>
  <div class="wcard__media">
    {visual(p, case_name(p))}
    <span class="wcard__num">{number:02}</span>
    <div class="wcard__plate">
      <h3>{title}</h3>
      <p>{e(p["desc"])}</p>
      <div class="wcard__tags">{tags}</div>
      <a class="wcard__more mono" href="{case_path(p["slug"])}" aria-label="Смотреть кейс: {title}">Смотреть кейс <span class="arr">↗</span></a>
    </div>
  </div>
  <div class="{css}__caption"><strong>{title}</strong><span>{e(caption)}</span></div>
</article>'''


def filters(projects):
    counts = {k: sum(p["category"] == k for p in projects) for k in CATEGORIES}
    return '<button class="filter is-on" type="button" data-f="all" aria-pressed="true">Все<sup>' + str(len(projects)) + "</sup></button>" + "".join(
        f'<button class="filter" type="button" data-f="{k}" aria-pressed="false">{CATEGORIES[k][1]}<sup>{n}</sup></button>'
        for k, n in counts.items() if n
    )


def case_block(b, p, prefix):
    src = lambda path: media(path, prefix)
    title = case_name(p)
    kind = b["type"]
    if kind in {"banner", "single"}:
        if not b.get("src"):
            return f'<figure class="case__banner case__banner--art">{visual({**p, "image": ""}, "")}</figure>'
        scroll = " case__single--scroll" if kind == "single" and b.get("scroll") else ""
        dimensions = ""
        if b.get("width") and b.get("height"):
            dimensions = f' width="{int(b["width"])}" height="{int(b["height"])}"'
        return f'<figure class="case__{kind}{scroll}"><img src="{src(b["src"])}" alt="{e(b.get("alt") or title)}"{dimensions} loading="lazy" decoding="async"></figure>'
    if kind == "grid":
        images = b.get("images") or []
        if b.get("art") or not images:
            tile = f'<figure class="case__tile">{visual({**p, "image": ""}, "")}</figure>'
            return f'<div class="case__grid">{tile * 2}</div>'
        two_columns = b.get("columns") == 2
        ratios, rows, start = b.get("ratios") or [], [], 0
        alts = b.get("alts") or []
        while start < len(images):
            left = len(images) - start
            end = start + min(2 if two_columns or left == 4 else 3, left)
            items = []
            for i in range(start, end):
                ratio = float(ratios[i] or 1.5) if i < len(ratios) else 1.5
                alt = alts[i] if i < len(alts) else f"{title}, изображение {i + 1}"
                sizing = "" if two_columns else f' data-ar="{ratio}" style="flex-grow:{ratio};aspect-ratio:{ratio}"'
                items.append(f'<img src="{src(images[i])}" alt="{e(alt)}" loading="lazy"{sizing}>')
            rows.append('<div class="case__row">' + "".join(items) + "</div>")
            start = end
        layout = " case__rows--two" if two_columns else ""
        return f'<div class="case__rows{layout}">' + "".join(rows) + "</div>"
    if kind == "pdf":
        ratio = float(b.get("ratio") or 842 / 595)
        css = "case__pdf case__pdf--portrait" if ratio < 1 else "case__pdf"
        name = e(b.get("title") or "Открыть PDF")
        return f'''<section class="{css}">
  <div class="case__pdf-frame" style="aspect-ratio:{ratio:.4f}"><iframe src="{src(b["src"])}#toolbar=0&amp;navpanes=0&amp;view=FitH" title="{name}" loading="lazy"></iframe></div>
  <a class="case__pdf-open mono" href="{src(b["src"])}" target="_blank" rel="noopener">{name} — открыть отдельно ↗</a>
</section>'''
    if kind == "videos":
        css = "case__grid case__videos"
        css += " case__videos--plain" if b.get("plain") else ""
        css += " case__videos--wide" if b.get("wide") else ""
        items = []
        for v in b.get("items", []):
            path = v["src"]
            label = e(v.get("title") or title)
            figcaption = f'<figcaption class="mono">{label}</figcaption>' if v.get("title") else ""
            if re.search(r"\.(?:jpe?g|png|webp|avif)$", path, re.I):
                items.append(f'<figure class="case__video case__video--img"><img src="{src(path)}" alt="{label}" loading="lazy">{figcaption}</figure>')
            else:
                fragment = "" if "#" in path else "#t=0.1"
                items.append(f'<figure class="case__video"><video src="{src(path)}{fragment}" muted loop playsinline preload="metadata" aria-label="{label}"></video>{figcaption}</figure>')
        return f'<div class="{css}">' + "".join(items) + "</div>"
    if kind == "gallery":
        images = "".join(f'<img src="{src(path)}" alt="{e(title)}, изображение {i}" loading="lazy">' for i, path in enumerate(b["images"], 1))
        return f'<div class="case__gallery case__gallery--{len(b["images"])}">{images}</div>'
    if kind == "text":
        return text_section(b.get("title"), b.get("body", []))
    raise ValueError(f'Неизвестный тип блока «{kind}»: {p["slug"]}')


def text_section(title, paragraphs):
    heading = f'<h2 class="mono">{e(title)}</h2>' if title else ""
    copy = "".join(f"<p>{e(t)}</p>" for t in paragraphs)
    return f'<section class="case__text">{heading}<div>{copy}</div></section>'


def seo(path, title, description, image=SITE_IMAGE, crumbs=None):
    canonical = ORIGIN + "/" + path
    tags = f'''  <link rel="canonical" href="{canonical}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="BLICK">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(description)}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{ORIGIN}/{media(image)}">
  <meta name="twitter:card" content="summary_large_image">'''
    if crumbs:
        data = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": n, "name": name, "item": ORIGIN + "/" + href}
                for n, (name, href) in enumerate(crumbs, 1)
            ],
        }
        tags += '\n  <script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace("<", "\\u003c") + "</script>"
    return tags


def replace_section(doc, name, body):
    start, end = f"<!-- {name}:start -->", f"<!-- {name}:end -->"
    before, rest = doc.split(start, 1)
    _, after = rest.split(end, 1)
    return f"{before}{start}\n{body}\n{end}{after}"


def detail_page(shell, path, title, description, body, image, crumbs, *, service=False):
    doc = shell.replace('<meta name="robots" content="noindex">\n  ', "")
    doc = doc.replace("<title>Кейс — BLICK</title>", f"<title>{e(title)}</title>")
    doc = doc.replace('content="Кейс студии BLICK."', f'content="{e(description)}"')
    doc = doc.replace('  <script src="js/data.js"></script>\n', "")
    if service:
        doc = doc.replace(' aria-current="page"', "")
    # Относительные ссылки работают и на GitHub Pages, и в локальной админке.
    doc = doc.replace('href="./', 'href="../../')
    doc = re.sub(r'((?:href|src)=")((?:css/|assets/|js/|works\.html|privacy\.html)[^"]*)', r"\g<1>../../\2", doc)
    doc = replace_section(doc, "seo", seo(path, title, description, image, crumbs))
    return re.sub(r'<main class="case" data-case data-case-preview>.*?</main>', lambda _: f'<main class="case" data-case>\n{body}\n  </main>', doc, count=1, flags=re.S)


def case_service(p):
    for slug, s in SERVICES.items():
        if p["slug"] in s["cases"]:
            return slug
    return {"web": "web-development", "design": "branding", "app": "app-design", "video": "motion-design"}[p["category"]]


def build(projects=None, *, check=False):
    if projects is None:
        source = (ROOT / "js/data.js").read_text(encoding="utf-8")
        projects, _ = json.JSONDecoder().raw_decode(source.split("window.PROJECTS = ", 1)[1].lstrip())
    by_slug = {p["slug"]: p for p in projects}
    if len(by_slug) != len(projects) or not all(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) for slug in by_slug):
        raise ValueError("Адреса кейсов должны быть уникальными: латинские строчные буквы, цифры и дефисы.")

    outputs = {}
    for file, slots in {
        "index.html": {"featured": "\n".join(card(p, i, True) for i, p in enumerate([p for p in projects if p.get("featured")][:5], 1))},
        "works.html": {"grid": "\n".join(card(p, i) for i, p in enumerate(projects, 1)), "filters": filters(projects), "count": f"[ {len(projects):02} ]"},
    }.items():
        doc = (ROOT / file).read_text(encoding="utf-8")
        for name, body in slots.items():
            doc = replace_section(doc, name, body)
        outputs[file] = doc

    shell = (ROOT / "case.html").read_text(encoding="utf-8")
    home_crumb = ("Главная", "")
    for i, p in enumerate(projects):
        path = case_path(p["slug"])
        nxt = projects[(i + 1) % len(projects)]
        facts = p.get("facts") or [["Направление", CATEGORIES[p["category"]][0]], ["Услуги", ", ".join(p["tags"])]]
        facts_html = "".join(f"<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>" for k, v in facts)
        blocks = p.get("blocks") or [{"type": "grid", "art": True}, {"type": "text", "title": "О проекте", "body": [p["desc"]]}]
        related = case_service(p)
        body = f'''    <div class="case__top"><a href="../../works.html" class="back mono">← все кейсы</a><span class="mono tag">[ {i+1:02} / {len(projects):02} ]</span></div>
    <header class="case__head"><h1 class="display">{e(p["title"])}</h1><dl class="case__facts mono">{facts_html}</dl></header>
    <p class="case__lead">{e(p["desc"])}</p>
    {"".join(case_block(b, p, "../../") for b in blocks)}
    <div class="case__service"><a class="pill" href="../../services/{related}/">{e(SERVICES[related]["title"])} <span class="arr">↗</span></a></div>
    <a class="case__next" href="../../{case_path(nxt["slug"])}"><span class="mono">следующий кейс</span><strong class="display">{e(nxt["title"])} <span class="arr">↗</span></strong></a>'''
        crumbs = [home_crumb, ("Кейсы", "works.html"), (p["title"], path)]
        outputs[path + "index.html"] = detail_page(shell, path, case_name(p) + " | BLICK", p["desc"], body, p.get("image") or SITE_IMAGE, crumbs)

    for slug, s in SERVICES.items():
        path = f"services/{slug}/"
        links = "".join(
            f'<li><a href="../../{case_path(k)}">{e(case_name(by_slug[k]))} ↗</a><p>{e(by_slug[k]["desc"])}</p></li>'
            for k in s["cases"] if k in by_slug
        )
        examples = f'<section class="case__text"><h2 class="mono">Примеры работ</h2><ul class="service__examples">{links}</ul></section>' if links else ""
        body = f'''    <div class="case__top"><a href="../../#services" class="back mono">← все услуги</a></div>
    <header class="case__head service__head"><h1 class="display">{e(s["title"])}</h1></header>
    <p class="case__lead">{e(s["intro"])}</p>
    {"".join(text_section(heading, [copy]) for heading, copy in s["sections"])}
{examples}
    <div class="case__service"><a class="pill pill--accent" href="#contact">Обсудить проект <span class="arr">↗</span></a></div>'''
        outputs[path + "index.html"] = detail_page(shell, path, s["title"] + " | BLICK", s["description"], body, SITE_IMAGE, [home_crumb, (s["title"], path)], service=True)

    urls = ["", "works.html", *(name.removesuffix("index.html") for name in outputs if "/" in name)]
    outputs["sitemap.xml"] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
        f"  <url><loc>{xml_escape(ORIGIN + '/' + path)}</loc></url>\n" for path in urls
    ) + "</urlset>\n"
    stale = [f for f in (ROOT / "cases").glob("*/index.html") if f.relative_to(ROOT).as_posix() not in outputs]
    outdated = []
    for name, content in outputs.items():
        file = ROOT / name
        if not file.exists() or file.read_text(encoding="utf-8") != content:
            outdated.append(name)
            if not check:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(content, encoding="utf-8")
    for file in stale:
        if "data-case" not in file.read_text(encoding="utf-8"):
            continue
        outdated.append(file.relative_to(ROOT).as_posix())
        if not check:
            file.unlink()
    if check and outdated:
        raise SystemExit("Запустите python3 build_seo.py: " + ", ".join(outdated))
    return len(urls)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Проверить, что HTML и sitemap актуальны")
    print(f"Страниц в sitemap: {build(check=parser.parse_args().check)}")
