#!/usr/bin/env node
/* ============================================================================
   Osta Flowers — сборка статики для загрузки на reg.ru

     node build.mjs                → превью-сборка (домена ещё нет):
                                     абсолютные URL остаются как __DOMAIN__,
                                     сайт закрыт от индексации.
     node build.mjs example.ru     → боевая сборка под конкретный домен.

   Что делает:
     1. собирает чистый dist/ (без скриншотов, docs, README, MANIFEST);
     2. рядом с каждым JPEG кладёт WebP и оборачивает <img> в <picture>;
     3. штампует css/js хэшем содержимого — хостинг не отдаст старый кэш;
     4. пишет .htaccess (gzip, кэш, HTTPS, 404) и страницу 404.html;
     5. подставляет домен в canonical/og/JSON-LD/robots/sitemap;
     6. пакует dist/ в zip для файлового менеджера reg.ru.

   Зависимости: node, cwebp (brew install webp), zip. Без npm-пакетов.
   ========================================================================== */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const ZIP = path.join(ROOT, 'osta-flowers-site.zip');
const PLACEHOLDER = 'osta-flowers.ru'; /* что стоит в исходниках сейчас */

/* ---------- домен ---------- */
const raw = process.argv[2];
const domain = raw
  ? raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
  : null;
const PREVIEW = !domain;
const HOST = domain ?? '__DOMAIN__';
const BASE = `https://${HOST}/`;

if (raw && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) {
  console.error(`✗ «${raw}» не похоже на домен. Пример: node build.mjs osta-flowers.ru`);
  process.exit(1);
}

/* ---------- утилиты ---------- */
const log = (m) => console.log(m);
const have = (bin) => {
  try { execFileSync('command', ['-v', bin], { shell: '/bin/sh', stdio: 'ignore' }); return true; }
  catch { return false; }
};
const kb = (n) => `${(n / 1024).toFixed(0)} КБ`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} МБ`;
const dirSize = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
  const p = path.join(dir, e.name);
  return sum + (e.isDirectory() ? dirSize(p) : fs.statSync(p).size);
}, 0);
const hash8 = (file) => createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
const today = new Date().toISOString().slice(0, 10);

/* ============================================================================
   1. чистый dist
   ========================================================================== */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

/* Копируем только то, что должно оказаться на хостинге. Скриншоты из корня,
   docs/, README.md, .playwright-mcp/ и MANIFEST.txt на сервер не едут. */
for (const dir of ['css', 'js']) {
  fs.cpSync(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });
}
fs.cpSync(path.join(ROOT, 'assets/fonts'), path.join(DIST, 'assets/fonts'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'assets/img'), { recursive: true });
for (const f of ['favicon.svg', 'apple-touch-icon.png', 'og.jpg']) {
  fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(DIST, 'assets', f));
}
const photos = fs.readdirSync(path.join(ROOT, 'assets/img')).filter((f) => f.endsWith('.jpg'));
for (const f of photos) {
  fs.copyFileSync(path.join(ROOT, 'assets/img', f), path.join(DIST, 'assets/img', f));
}
log(`· dist: css, js, шрифты, ${photos.length} фото`);

/* ============================================================================
   2. WebP + <picture>
   ========================================================================== */
const webp = new Set();
if (have('cwebp')) {
  let before = 0, after = 0;
  for (const f of photos) {
    const src = path.join(DIST, 'assets/img', f);
    const out = src.replace(/\.jpg$/, '.webp');
    execFileSync('cwebp', ['-q', '80', '-m', '6', '-quiet', src, '-o', out]);
    before += fs.statSync(src).size;
    after += fs.statSync(out).size;
    webp.add(f.replace(/\.jpg$/, ''));
  }
  log(`· webp: ${webp.size} шт., ${mb(before)} → ${mb(after)} (−${Math.round((1 - after / before) * 100)}%)`);
} else {
  log('! cwebp не найден — собираю без WebP (brew install webp, затем пересоберите)');
}

/* ============================================================================
   3. index.html
   ========================================================================== */
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* <img src="assets/img/x.jpg" …> → <picture><source …webp><img …></picture>
   Оригинальный <img> не трогаем: он же и фолбэк для старых браузеров.
   CSS цепляется к `.arch img` (потомок), поэтому обёртка вёрстку не ломает —
   за высоту отвечает правило `.arch picture` в main.css. */
let wrapped = 0;
html = html.replace(/<img\b[^>]*\bsrc="assets\/img\/([\w-]+)\.jpg"[^>]*>/g, (tag, name) => {
  if (!webp.has(name)) return tag;
  wrapped++;
  return `<picture><source srcset="assets/img/${name}.webp" type="image/webp">${tag}</picture>`;
});

/* Preload хиро-картинки должен тянуть тот же файл, что реально покажется.
   type="image/webp" — браузер без поддержки WebP просто проигнорирует строку. */
if (webp.has('hero-peonies')) {
  html = html.replace(
    /<link rel="preload" href="assets\/img\/hero-peonies\.jpg" as="image">/,
    '<link rel="preload" href="assets/img/hero-peonies.webp" as="image" type="image/webp" fetchpriority="high">'
  );
}
log(`· <picture>: обёрнуто ${wrapped} из ${photos.length}`);

/* Хэш содержимого вместо ручного ?v=2: после правки CSS хостинг и браузер
   гарантированно возьмут новый файл, даже с годовым кэшем. */
for (const [file, re] of [
  ['css/fonts.css', /href="css\/fonts\.css(\?[^"]*)?"/],
  ['css/main.css', /href="css\/main\.css(\?[^"]*)?"/],
  ['js/vendor/lenis.min.js', /src="js\/vendor\/lenis\.min\.js(\?[^"]*)?"/],
  ['js/main.js', /src="js\/main\.js(\?[^"]*)?"/],
]) {
  const attr = file.endsWith('.css') ? 'href' : 'src';
  html = html.replace(re, `${attr}="${file}?v=${hash8(path.join(DIST, file))}"`);
}

/* Домен во всех абсолютных URL: canonical, og:url, og:image, JSON-LD. */
html = html.replaceAll(`https://${PLACEHOLDER}/`, BASE);

/* Превью-сборка живёт на техническом домене reg.ru и не должна попасть
   в выдачу с битым canonical. Боевая сборка индексируется как обычно. */
if (PREVIEW) {
  html = html.replace(
    /<meta name="viewport"[^>]*>/,
    (m) => `${m}\n  <meta name="robots" content="noindex, nofollow"><!-- превью-сборка: домен не задан -->`
  );
}

fs.writeFileSync(path.join(DIST, 'index.html'), html);

/* ============================================================================
   4. robots.txt + sitemap.xml
   ========================================================================== */
fs.writeFileSync(path.join(DIST, 'robots.txt'), PREVIEW
  ? `# Превью-сборка без домена — индексация закрыта.\n# Боевой robots.txt появится после: node build.mjs ваш-домен.ru\nUser-agent: *\nDisallow: /\n`
  : `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);

fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);

/* ============================================================================
   5. .htaccess
   ========================================================================== */
/* Каждый блок обёрнут в <IfModule>: если на тарифе нет модуля, сервер просто
   пропустит блок, а не отдаст 500 на весь сайт. Домен нигде не зашит —
   редиректы работают через %{HTTP_HOST}, так что файл не надо править при
   смене домена. */
const httpsBlock = PREVIEW
  ? `  # HTTPS отключён: сборка без домена (на техническом домене reg.ru
  # сертификата может не быть). Включится сам при сборке под домен.
  # RewriteCond %{HTTPS} !=on
  # RewriteCond %{HTTP:X-Forwarded-Proto} !https
  # RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]`
  : `  # Весь трафик на HTTPS.
  # Если сайт открылся с ошибкой сертификата или ушёл в бесконечный редирект —
  # закомментируйте четыре строки ниже, выпустите бесплатный SSL в панели
  # reg.ru, потом верните обратно.
  # Три условия, а не одно: на reg.ru перед Apache стоит nginx, и при
  # HTTPS-запросе сам Apache может видеть обычный http. Проверяем все три
  # признака сразу, иначе получится цикл редиректов.
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteCond %{SERVER_PORT} !^443$
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]`;

fs.writeFileSync(path.join(DIST, '.htaccess'), `# ============================================================
# Osta Flowers — конфигурация Apache для хостинга reg.ru
# Сгенерировано build.mjs ${today}. Правьте build.mjs, не этот файл.
# ============================================================

AddDefaultCharset UTF-8
DirectoryIndex index.html
Options -Indexes
ServerSignature Off

ErrorDocument 404 /404.html

# ---------- типы файлов ----------
# Без этого Apache отдаёт .webp и .woff2 как octet-stream, и браузер
# отказывается их показывать.
<IfModule mod_mime.c>
  AddType image/webp .webp
  AddType image/svg+xml .svg
  AddType font/woff2 .woff2
  AddType application/javascript .js
  AddType text/css .css
</IfModule>

# ---------- канонический адрес ----------
<IfModule mod_rewrite.c>
  RewriteEngine On

${httpsBlock}

  # www.site.ru → site.ru (одна версия сайта для поисковиков)
  RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
  RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]
</IfModule>

# ---------- сжатие ----------
# Картинки и шрифты уже сжаты — их не трогаем.
# Два вложенных IfModule, и это не перестраховка: сам фильтр живёт в
# mod_deflate, а директива AddOutputFilterByType — в mod_filter. Проверка
# только по mod_deflate пропускает строку на сервер без mod_filter, и весь
# сайт отдаёт 500. Проверено локально на Apache 2.4.
<IfModule mod_deflate.c>
  <IfModule mod_filter.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml
    AddOutputFilterByType DEFLATE application/javascript application/x-javascript
    AddOutputFilterByType DEFLATE application/json application/xml image/svg+xml
  </IfModule>
</IfModule>

# ---------- кэш ----------
# Ссылки на css/js содержат ?v=<хэш>, поэтому долгий кэш безопасен:
# после пересборки меняется адрес файла.
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresDefault                      "access plus 1 month"
  ExpiresByType text/html             "access plus 0 seconds"
  ExpiresByType text/css              "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/jpeg            "access plus 1 year"
  ExpiresByType image/webp            "access plus 1 year"
  ExpiresByType image/png             "access plus 1 year"
  ExpiresByType image/svg+xml         "access plus 1 year"
  ExpiresByType font/woff2            "access plus 1 year"
  ExpiresByType text/xml              "access plus 1 day"
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set X-Frame-Options "SAMEORIGIN"

  # HTML всегда перепроверяется — правки видно сразу после заливки.
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
</IfModule>

# ---------- служебные файлы ----------
# Прячем сам .htaccess. Через RedirectMatch, а не Require: Require требует
# от хостинга AllowOverride AuthConfig и на строгом тарифе роняет сайт в 500,
# а RedirectMatch обходится правом FileInfo — тем же, что уже нужно
# директиве ErrorDocument выше. Штатный конфиг Apache обычно закрывает .ht*
# и сам, но полагаться на это нельзя: на голом конфиге файл отдаётся как
# обычный текст (проверено локально).
<IfModule mod_alias.c>
  RedirectMatch 404 "/\\.(htaccess|htpasswd)$"
</IfModule>
`);

/* ============================================================================
   6. 404.html
   ========================================================================== */
/* Пути от корня (/css/...), а не относительные: 404 отдаётся с любого
   несуществующего адреса, включая /что-то/глубже/. */
fs.writeFileSync(path.join(DIST, '404.html'), `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Страница не найдена — Osta Flowers</title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/fonts.css?v=${hash8(path.join(DIST, 'css/fonts.css'))}">
  <link rel="stylesheet" href="/css/main.css?v=${hash8(path.join(DIST, 'css/main.css'))}">
  <style>
    .nf { min-height: 100vh; min-height: 100svh; display: grid; place-content: center; text-align: center; padding: var(--gutter); }
    .nf-no { font-family: var(--font-display); font-weight: 500; font-style: italic;
             font-size: clamp(5rem, 22vw, 13rem); line-height: 0.9; color: var(--red); }
    .nf-text { font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 2rem);
               color: var(--red); margin-top: 18px; }
    .nf-note { margin-top: 14px; }
    .nf-actions { display: flex; flex-wrap: wrap; gap: 18px; justify-content: center; margin-top: 40px; }
  </style>
</head>
<body>
  <main class="nf">
    <p class="nf-no">404</p>
    <p class="nf-text">Такой страницы не&nbsp;выросло</p>
    <p class="nf-note mono-note">Зато на&nbsp;Кронверкском, 65 всё на&nbsp;месте — ежедневно 9:00–22:00</p>
    <div class="nf-actions">
      <a class="pill pill-solid" href="/">На главную</a>
      <a class="pill" href="tel:+79219424204">+7 921 942-42-04</a>
    </div>
  </main>
</body>
</html>
`);

/* ============================================================================
   7. копия .htaccess для ручной вставки
   ========================================================================== */
/* Файловые менеджеры хостингов часто прячут файлы с точки в начале имени, и
   .htaccess может «потеряться» при распаковке архива. Эта копия лежит рядом
   с проектом (на сервер не заливается) — из неё можно скопировать текст и
   создать файл в панели руками. */
fs.copyFileSync(path.join(DIST, '.htaccess'), path.join(ROOT, 'htaccess-copy.txt'));

/* ============================================================================
   8. zip
   ========================================================================== */
fs.rmSync(ZIP, { force: true });
if (have('zip')) {
  /* Из самой папки, чтобы index.html лёг в корень архива, а не внутрь dist/.
     -X убирает macOS-метаданные, точечные файлы (.htaccess) попадают. */
  execFileSync('zip', ['-r', '-q', '-X', ZIP, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: DIST });
  log(`· zip: ${path.basename(ZIP)} (${mb(fs.statSync(ZIP).size)})`);
} else {
  log('! zip не найден — архив не собран, заливайте папку dist/ как есть');
}

/* ---------- отчёт ---------- */
const page = ['index.html', 'css/fonts.css', 'css/main.css', 'js/main.js', 'js/vendor/lenis.min.js']
  .reduce((s, f) => s + fs.statSync(path.join(DIST, f)).size, 0);
log('');
log(`  dist/            ${mb(dirSize(DIST))}`);
log(`  html+css+js      ${kb(page)}`);
log(`  фото (jpg)       ${mb(dirSize(path.join(DIST, 'assets/img')))} — из них webp отдаётся браузеру`);
log(`  шрифты           ${mb(dirSize(path.join(DIST, 'assets/fonts')))}`);
log('');
log(PREVIEW
  ? `  ⚠ ПРЕВЬЮ-СБОРКА: домена нет → canonical/og/sitemap содержат __DOMAIN__,\n    robots.txt закрывает индексацию, HTTPS-редирект выключен.\n    Появится домен — пересоберите: node build.mjs ваш-домен.ru`
  : `  ✓ Боевая сборка под ${HOST}`);
log('');
