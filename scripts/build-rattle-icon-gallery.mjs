// Offline handoff gallery for original Rattle assets. design-system: DESIGN.md
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { basename, resolve } from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(project, 'assets/icons');
const plan = JSON.parse(await readFile(resolve(directory, 'raster-plan.json'), 'utf8'));
const source = await readFile(resolve(project, 'scripts/create-rattle-icons.mjs'), 'utf8');
const vectorLabels = new Map([...source.matchAll(/^\s*\['([a-z-]+)', '([^']+)'/gm)].map(([, id, label]) => [id, label]));
const vectorNames = (await readdir(resolve(directory, 'navigation'))).filter(name => name.endsWith('.svg'));
if (plan.assets.length !== 24 || vectorNames.length !== 58 || vectorLabels.size !== 58) throw new Error('Expected 24 planned raster assets and 58 vector files');
if (new Set(plan.assets.map(asset => asset.file)).size !== 24) throw new Error('Duplicate raster filenames');

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function assetRecord({ id, label, category, file, variant = null }) {
  if (!/^(?:business|status|navigation)\/[a-z-]+\.(?:png|svg)$/.test(file)) throw new Error(`Invalid asset path: ${file}`);
  try {
    const data = await readFile(resolve(directory, file));
    return { id, label, filename: basename(file), file, category, variant, exists: true, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { id, label, filename: basename(file), file, category, variant, exists: false, bytes: 0, sha256: null };
  }
}

const rasters = await Promise.all(plan.assets.map(assetRecord));
const vectors = await Promise.all([...vectorLabels].map(([id, label]) => assetRecord({
  id, label, category: 'navigation', file: `navigation/${id}.svg`, variant: id.endsWith('-checked') ? 'checked' : null,
})));
if (vectors.some(asset => !asset.exists)) throw new Error('Missing vector source');

// Inline only this project's restricted geometry. Never inline arbitrary remote SVGs.
function safeVector(markup, filename) {
  if (/<!|<\?|\bon[a-z]+\s*=|\bhref\s*=|url\s*\(/i.test(markup)) throw new Error(`Unsupported SVG content: ${filename}`);
  const tags = markup.match(/<[^>]*>/g) ?? [];
  const allowed = new Set(['svg', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse']);
  const attrs = new Set(['xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points']);
  if (markup.replace(/<[^>]*>/g, '').trim()) throw new Error(`Unexpected SVG text: ${filename}`);
  for (const tag of tags) {
    const match = tag.match(/^<\/?([a-z]+)\b/);
    if (!match || !allowed.has(match[1])) throw new Error(`Unsupported SVG element: ${filename}`);
    for (const [, key] of tag.matchAll(/([a-zA-Z][\w:-]*)\s*=/g)) {
      if (!attrs.has(key)) throw new Error(`Unsupported SVG attribute ${key}: ${filename}`);
    }
  }
  return markup.trim();
}

function rasterCard(asset) {
  const art = asset.exists ? `<img src="${escape(asset.file)}" alt="${escape(asset.label)}" width="180" height="180" loading="lazy">` : '<span class="missing">제작 중</span>';
  const link = asset.exists ? `<a href="${escape(asset.file)}">원본 PNG 열기 ↗</a>` : '<span class="pending">원본 준비 중</span>';
  return `<article class="asset-card"><div class="stage raster-stage">${art}</div><div class="caption"><h3>${escape(asset.label)}</h3><code>${escape(asset.filename)}</code><div class="file-link">${link}</div></div></article>`;
}

const svgCards = new Map();
for (const asset of vectors) {
  const markup = safeVector(await readFile(resolve(directory, asset.file), 'utf8'), asset.file);
  const sizes = [16, 24, 32].map(size => `<div class="sample size-${size}"><span class="vector-art" aria-hidden="true">${markup}</span><span class="sample-size">${size}px</span></div>`).join('');
  svgCards.set(asset.id, `<article class="asset-card vector-card"><div class="stage vector-stage">${sizes}</div><div class="caption"><h3>${escape(asset.label)}</h3><code>${escape(asset.filename)}</code><div class="file-link"><a href="${escape(asset.file)}">원본 SVG 열기 ↗</a></div></div></article>`);
}

const business = rasters.filter(asset => asset.category === 'business');
const status = rasters.filter(asset => asset.category === 'status');
if (business.length !== 16 || status.length !== 8) throw new Error('Unexpected raster category counts');
const generatedAt = new Date().toISOString();
const formatDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(generatedAt));
const count = rasters.filter(asset => asset.exists).length;
const section = (id, title, note, className, cards) => `<section id="${id}"><div class="section-heading"><h2>${title}</h2><p>${note}</p></div><div class="${className}">${cards.join('\n')}</div></section>`;

const html = `<!doctype html>
<html lang="ko" data-background="checker">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rattle 공통 아이콘 갤러리</title>
<style>
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#191f28;background:#f3f8ff;--stage:#fff;--stage-image:linear-gradient(45deg,#e8edf3 25%,transparent 25%),linear-gradient(-45deg,#e8edf3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8edf3 75%),linear-gradient(-45deg,transparent 75%,#e8edf3 75%)}
*{box-sizing:border-box}body{margin:0}main{max-width:1240px;padding:40px 24px 64px;margin:auto}header{margin-bottom:30px}.brand{color:#3182f6;letter-spacing:-1px;font-size:30px;font-weight:800}h1{font-size:26px;margin:10px 0 12px}header p,.section-heading p{color:#4b5563;line-height:1.7;margin:8px 0}.summary{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.tag{padding:7px 12px;border:1px solid #dde8f5;background:white;border-radius:999px;font-size:13px}.tools{position:sticky;top:0;z-index:2;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px;background:#f3f8ff;border:1px solid #dde8f5;border-radius:16px;box-shadow:0 4px 16px #1b64da0d}.tools-label{font-size:13px;color:#4b5563;margin-right:6px}button{cursor:pointer;border:1px solid #dde8f5;background:white;color:#4b5563;font:inherit;font-size:13px;border-radius:10px;min-height:44px;padding:8px 14px}button[aria-pressed="true"]{color:#fff;background:#1b64da;border-color:#1b64da}button:focus-visible,a:focus-visible{outline:3px solid #3182f6;outline-offset:3px}nav{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0;font-size:14px}a{color:#1b64da;text-underline-offset:3px}section{margin-top:40px;scroll-margin-top:100px}h2{font-size:21px;margin:0 0 8px}.section-heading{margin-bottom:18px}.raster-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.vector-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.asset-card{min-width:0;background:white;border:1px solid #dde8f5;border-radius:18px;overflow:hidden}.stage{background-color:var(--stage);background-image:var(--stage-image);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}.raster-stage{height:224px;display:flex;align-items:center;justify-content:center;padding:20px}.raster-stage img{display:block;width:180px;height:180px;max-width:100%;object-fit:contain}.caption{padding:15px;border-top:1px solid #dde8f5}h3{font-size:15px;margin:0 0 7px}.caption code{font-size:12px;color:#4b5563;overflow-wrap:anywhere}.file-link{margin-top:12px;font-size:12px}.pending{color:#6b7280}.missing{font-size:13px;color:#6b7280;background:#fff;padding:9px 14px;border:1px dashed #9ca3af;border-radius:8px}.vector-stage{height:116px;display:flex;gap:22px;align-items:center;justify-content:center;padding:16px;color:#191f28}.sample{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:12px;min-width:36px}.vector-art{height:32px;display:flex;align-items:center;justify-content:center}.vector-art svg{display:block}.size-16 svg{width:16px;height:16px}.size-24 svg{width:24px;height:24px}.size-32 svg{width:32px;height:32px}.sample-size{font-size:11px;color:#4b5563}.note{margin-top:30px;padding:18px;border:1px solid #dde8f5;border-radius:16px;background:#fff;line-height:1.7;font-size:13px;color:#4b5563}footer{margin-top:30px;color:#6b7280;font-size:12px;line-height:1.7}[data-background="white"]{--stage:#fff;--stage-image:none}[data-background="blue"]{--stage:#e8f3ff;--stage-image:none}
@media(max-width:900px){.raster-grid,.vector-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){main{padding:24px 14px 40px}.raster-stage{height:180px;padding:12px}.raster-stage img{width:150px;height:150px}.vector-grid{grid-template-columns:1fr}.vector-stage{gap:32px}.tools{gap:6px}.tools-label{width:100%}h1{font-size:23px}}
</style></head>
<body><main>
<header><div class="brand">Rattle.</div><h1>공통 아이콘 Assets</h1><p>업무용 입체 이미지와 공통 선 아이콘을 비교하는 로컬 미리보기입니다.<br>체커보드·흰색·연한 블루 바탕에서 투명도와 형태를 확인하세요.</p><div class="summary"><span class="tag">업무 이미지 ${business.filter(asset => asset.exists).length}/16</span><span class="tag">상태 이미지 ${status.filter(asset => asset.exists).length}/8</span><span class="tag">SVG 56종 + 선택 변형 2종</span></div></header>
<div class="tools" role="group" aria-label="미리보기 배경"><span class="tools-label">미리보기 배경</span><button type="button" data-background="checker" aria-pressed="true">체커보드</button><button type="button" data-background="white" aria-pressed="false">흰색</button><button type="button" data-background="blue" aria-pressed="false">연한 블루</button></div>
<nav aria-label="아이콘 섹션"><a href="#business-first">업무 1차 12종</a><a href="#business-second">업무 2차 4종</a><a href="#status">상태 8종</a><a href="#vectors">선 아이콘 56종</a><a href="#variants">선택 상태</a><a href="catalog.json">파일 목록 JSON</a></nav>
${section('business-first', '업무용 브랜드 · 1차 12종', '같은 재질·조명·시점과 시각적 크기를 비교하세요. 데스크톱에서는 4열 × 3행으로 표시합니다.', 'raster-grid', business.slice(0, 12).map(rasterCard))}
${section('business-second', '업무용 브랜드 · 2차 4종', '체크리스트, 근무시간 입력, 매장 관리, POS 연결.', 'raster-grid', business.slice(12).map(rasterCard))}
${section('status', '상태·빈 화면 · 8종', '자료 없음·대기·실패·완료의 의미를 구분하고, 안내 문구와 버튼은 앱에서 별도로 제공합니다.', 'raster-grid', status.map(rasterCard))}
${section('vectors', '공통 조작·업무 선 아이콘 · 56종', '각 SVG를 16px / 24px / 32px로 나란히 표시합니다. 선 색은 currentColor입니다.', 'vector-grid', vectors.filter(asset => !asset.variant).map(asset => svgCards.get(asset.id)))}
${section('variants', '선택 상태 변형 · 2종', '기본 checkbox·radio는 미선택이며 아래 파일은 선택 상태입니다.', 'vector-grid', vectors.filter(asset => asset.variant).map(asset => svgCards.get(asset.id)))}
<aside class="note">현재 준비된 래스터 원본은 ${count}/24개입니다. 없는 파일은 ‘제작 중’으로 표시합니다. 이 갤러리는 자산 검토용이며 실제 앱 교체·접근성·터치 영역 검증을 대신하지 않습니다. PNG는 원본 링크, SVG는 인라인 렌더링으로 확인할 수 있으며 외부 서버 요청 없이 열립니다.</aside>
<footer>생성 시각: ${escape(formatDate)} KST<br>재생성: <code>node scripts/build-rattle-icon-gallery.mjs</code><br>카탈로그에 파일별 존재 여부·바이트 수·SHA-256을 기록합니다.</footer>
</main><script>
document.querySelectorAll('button[data-background]').forEach(function(button){button.addEventListener('click',function(){document.documentElement.dataset.background=button.dataset.background;document.querySelectorAll('button[data-background]').forEach(function(other){other.setAttribute('aria-pressed',String(other===button));});});});
</script></body></html>\n`;

const catalog = {
  schemaVersion: 1, generatedAt, source: 'raster-plan.json + navigation SVG originals',
  summary: { rasterPlanned: 24, rasterAvailable: count, businessPlanned: 16, statusPlanned: 8, vectorMeanings: 56, vectorVariants: 2, filesAvailable: count + vectors.length },
  assets: [...rasters, ...vectors],
};
await Promise.all([
  writeFile(resolve(directory, 'preview.html'), html),
  writeFile(resolve(directory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`),
]);
console.log(`Gallery ready: ${count}/24 raster files, 56 vector meanings + 2 checked variants. All references are local.`);
