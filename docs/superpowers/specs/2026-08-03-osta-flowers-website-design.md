# Osta Flowers — website design spec

Date: 2026-08-03 · Status: approved for build (autonomous session — decisions documented here in lieu of live Q&A)

## Subject

Osta Flowers — цветочная студия Ольги Останиной, Санкт-Петербург, Кронверкский пр., 65 (Петроградская сторона, м. Горьковская). Ежедневно 9:00–22:00. Рейтинг 5,0 на Яндекс Картах (196 отзывов, 269 оценок), награда «Хорошее место 2026». Заказы принимаются через WhatsApp (+7 921 942-42-04) и Telegram (@osta_flowers); сайта у студии нет — этот сайт становится первым.

Audience: покупатели премиальных «нескучных» букетов в Петербурге; заказывают удалённо и в подарок. The page's single job: convert a visit into a WhatsApp/Telegram order.

**Key research insight:** the studio's real product line is *numbered* bouquets («Букет №20 — 4 900 ₽», «Композиция в сумочке №7») and its customers' own words position it («Я так устала от банальных роз… Ваш букет — это чистое искусство»). Both become design material.

## Concept

**«Букет под номером»** — the catalog-as-specimen-ledger: every bouquet presented like a numbered botanical plate (№ in huge serif, composition list in mono, price). The page itself is threaded by the **signature element: a single red stem** — a thin SVG line that grows down the entire page as you scroll, with leaf nodes marking each section. One continuous stem = one studio, one composition.

Aesthetic risk (deliberate): the hero opens with a verbatim customer complaint — «Я так устала от банальных роз» (from a real 5★ review) — answered by the studio: «Мы — тоже.» A florist site that opens with a complaint about flowers is memorable and states the positioning in one breath.

## Tokens

Palette (adopted from lafiorellaia.it per brief, verified from its CSS `:root{--red:#DF2F32; --pink:#F1D3D3}`):

- `--rose  #F1D3D3` — the canvas, everywhere
- `--red   #DF2F32` — display type, hairlines, buttons, stem, UI (large-text AA: 3.27:1)
- `--ink   #B22226` — small body/label text (AA 4.76:1 on rose)
- `--night #0A0A0A` — one full-bleed evening section + footer depth
- `--milk  #FFFFFFDF` — text on night

Two-color discipline: everything on rose is red; no third hue anywhere.

Type (Cyrillic-native, self-hosted woff2):
- Display: **Cormorant** 500/600 + Italic — fluid `clamp()` up to ~9rem; italic = the "spoken" voice
- Body: **Golos Text** 400/500 — 17px/1.6
- Data: **PT Mono** — uppercase, letter-spaced: eyebrows, №, состав, prices, hours, ticker

Devices (quiet, consistent): arch-topped image frames («парадная»), 1px drawn hairlines, outline pill buttons with flood-fill hover, PT Mono utility ticker, italic serif accents mid-sentence. No custom cursor, no scroll-jacking (differentiation from reference).

## Page anatomy (single page, RU)

1. **Preloader** ≤1.1s: stem draws up, логотип, lifts. Skipped on repeat visit + reduced-motion.
2. **Header** fixed: logotype · Витрина / Студия / События / Отзывы / Контакты · phone + «Заказать» pill. Mobile: fullscreen rose overlay menu.
3. **Hero**: eyebrow (ЦВЕТОЧНАЯ СТУДИЯ · ПЕТРОГРАДСКАЯ СТОРОНА · 9:00–22:00); display quote «Я так устала от банальных роз» + attribution «из отзыва на Яндекс Картах»; answer «Мы — тоже.»; sub-copy; CTAs (WhatsApp / Витрина); trust row: 5,0 · 196 отзывов · Хорошее место 2026. Right: arch-framed peony armful photo.
4. **Ticker**: свежая поставка · сборка в день заказа · доставка за 1 час · Кронверкский, 65 · до 22:00.
5. **Студия**: editorial split, founder line (Ольга Останина), manifesto with italic accents, PT Mono stat strip.
6. **Витрина**: specimen cards — real products (№20 4 900 ₽, №94 4 500 ₽, №66 4 000 ₽, №23 3 200 ₽, сумочки №2/№7 3 500 ₽) + «Букет дня» (от 3 000 ₽) + custom card. Состав lists are placeholders (marked). CTA per card → wa.me deep link with prefilled «Хочу букет №…».
7. **Вечер** (night, black): «Петербург не спит — и мы до 22:00», доставка за час, dark photo strip.
8. **События**: Свадьбы / Мероприятия / Цветы для бизнеса — three editorial rows.
9. **Отзывы**: giant serif quotes (real, named), 5,0 badge, «Хорошее место 2026» chip, link to Yandex listing.
10. **Контакты**: big address, mono facts (метро, часы, телефон), buttons WhatsApp / Telegram / Позвонить / Маршрут; деталь из отзывов: «гостям — кофе».
11. **Footer**: giant cropped OSTA, socials (Instagram 73K, Telegram), legal placeholder.

## Motion

Scroll reveals (rise + hairline draw, IntersectionObserver), stem growth tied to scroll progress (rAF), CSS marquee, arch-image bloom hovers, orchestrated hero load sequence. `prefers-reduced-motion` disables all.

## Engineering

Hand-crafted static site — zero dependencies, no build step: `index.html`, `css/fonts.css`, `css/main.css`, `js/main.js`, `assets/`. Self-hosted subset fonts, lazy images with dimensions, preloaded hero. SEO: full meta/OG, JSON-LD `Florist` (real address/geo/hours/rating), robots.txt, sitemap.xml, canonical (placeholder domain `osta-flowers.ru`). A11y floor: landmarks, skip-link, focus-visible, AA contrast, RU alt text. Ordering is honest to their real workflow (messenger deep links; no fake cart).

Placeholders to replace before launch (listed in README): photography (Unsplash temp), bouquet compositions, legal entity line, final domain.
