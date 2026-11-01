// Original Rattle line-icon geometry. design-system: DESIGN.md
// No icon-library paths or external artwork are embedded in this source.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'assets/icons/navigation');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/create-rattle-icons.mjs [--check]');
const checkOnly = args.includes('--check');

/** 32 semantic icons used by common controls and the primary navigation. */
const core = [
  ['menu', '더보기', '<path d="M4 6h16M4 12h16M4 18h16"/>'],
  ['notification', '알림', '<path d="M5 17h14l-1.5-2.5V10a5.5 5.5 0 0 0-11 0v4.5L5 17Z"/><path d="M10 20h4M12 3v1.5"/>'],
  ['profile', '마이페이지', '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20v-1.5a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6V20"/>'],
  ['dashboard', '전체 매장', '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'],
  ['home', '홈', '<path d="m3 11 9-7.5 9 7.5M5.5 9v11h5v-6h3v6h5V9"/>'],
  ['inventory', '재고', '<path d="m3.5 7.5 8.5-4 8.5 4v9L12 21l-8.5-4.5v-9Zm0 0 8.5 4 8.5-4M12 11.5V21M8 5.5l8.5 4v3"/>'],
  ['purchase', '매입', '<path d="M3 4h2l2.2 11h11.3L21 7H5.6M8 11h11.5"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="18" cy="19.5" r="1.4"/>'],
  ['staff', '직원·인건비', '<circle cx="9" cy="7.5" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 4.7a3 3 0 0 1 0 5.6M18 13.5a4 4 0 0 1 3 4V20"/>'],
  ['sales', '매출', '<path d="M4 3.5v17h17M8 16v-4M13 16V8M18 16V5"/>'],
  ['store', '매장', '<path d="M4 9.5V20h16V9.5M3 9l2-5h14l2 5M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9.5 20v-6h5v6"/>'],
  ['chevron-left', '뒤로', '<path d="m14.5 5-7 7 7 7"/>'],
  ['chevron-right', '다음', '<path d="m9.5 5 7 7-7 7"/>'],
  ['chevron-up', '접기', '<path d="m5 14.5 7-7 7 7"/>'],
  ['chevron-down', '펼치기', '<path d="m5 9.5 7 7 7-7"/>'],
  ['close', '닫기', '<path d="m5.5 5.5 13 13M18.5 5.5l-13 13"/>'],
  ['add', '추가', '<path d="M12 4v16M4 12h16"/>'],
  ['edit', '수정', '<path d="m4 15.5 11-11a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3l-11 11L3 21l1-5.5ZM13.5 6l4.5 4.5M4 15.5 8.5 20"/>'],
  ['delete', '삭제', '<path d="M3.5 6.5h17M9 6.5V3.5h6v3M5.5 6.5l1 14h11l1-14M10 10.5v6M14 10.5v6"/>'],
  ['search', '검색', '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>'],
  ['filter', '필터', '<path d="M4 6h2M10 6h10M4 12h10M18 12h2M4 18h4M12 18h8"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>'],
  ['reorder', '순서 변경', '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'],
  ['check', '완료', '<path d="m4.5 12 5 5 10-10"/>'],
  ['checkbox', '다중 선택', '<rect x="4" y="4" width="16" height="16" rx="3"/>'],
  ['radio', '단일 선택', '<circle cx="12" cy="12" r="8"/>'],
  ['calendar', '달력', '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>'],
  ['time', '시간', '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2.5"/>'],
  ['refresh', '새로고침', '<path d="M20 9a8.3 8.3 0 0 0-14.5-3L3 9M3 9V3.5M3 9h5.5M4 15a8.3 8.3 0 0 0 14.5 3L21 15M21 15v5.5M21 15h-5.5"/>'],
  ['sync', '동기화', '<path d="M3.5 8h15l-4-4M18.5 8l-4 4M20.5 16h-15l4 4M5.5 16l4-4"/>'],
  ['copy', '복사', '<rect x="8" y="8" width="12.5" height="12.5" rx="2"/><path d="M15.5 8V3.5h-12v12H8"/>'],
  ['visibility', '보기', '<path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>'],
  ['lock', '잠금', '<rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'],
  ['logout', '로그아웃', '<path d="M10 4H4v16h6M9 12h12M17 8l4 4-4 4"/>'],
];

/** 24 further icons for existing business, settings and assistance surfaces. */
const support = [
  ['settings', '설정', '<path d="M9.5 2.5h5l.6 2.5 2.1 1.2 2.4-.7 2 3.5-1.9 1.7v2.6l1.9 1.7-2 3.5-2.4-.7-2.1 1.2-.6 2.5h-5l-.6-2.5-2.1-1.2-2.4.7-2-3.5 1.9-1.7v-2.6L2.4 9l2-3.5 2.4.7 2.1-1.2.6-2.5Z"/><circle cx="12" cy="12" r="3"/>'],
  ['info', '안내', '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6M12 7.5h.01"/>'],
  ['warning', '주의', '<path d="m10.3 4.5-7.5 13a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5M12 17h.01"/>'],
  ['error', '오류', '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>'],
  ['success', '성공', '<circle cx="12" cy="12" r="8.5"/><path d="m7.5 12 3 3 6-6"/>'],
  ['document', '문서', '<path d="M5 3.5h9l5 5V21H5V3.5ZM14 3.5v5h5M8.5 12h7M8.5 16h7"/>'],
  ['shield', '개인정보 보호', '<path d="m12 3 8 3v6c0 4.5-4.5 7.7-8 9-3.5-1.3-8-4.5-8-9V6l8-3Z"/><path d="m8.5 11.5 2.5 2.5 4.5-4.5"/>'],
  ['member-remove', '멤버 제거', '<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20v-1.5a6 6 0 0 1 6-6h1a6 6 0 0 1 6 6V20M16.5 8h5"/>'],
  ['category', '분류', '<path d="M3.5 3.5h7v7h-7v-7ZM16.5 3.5l4 7h-8l4-7Z"/><circle cx="7" cy="17" r="3.5"/><path d="m16.5 13 4 4-4 4-4-4 4-4Z"/>'],
  ['folder', '미분류', '<path d="M3 7V4.5h6l2 2.5h10v13H3V7ZM3 10h18"/>'],
  ['card', '카드', '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>'],
  ['cash', '현금', '<rect x="2.5" y="5.5" width="19" height="13" rx="1.5"/><circle cx="12" cy="12" r="3"/><path d="M3 9h3V6M18 6v3h3M3 15h3v3M18 18v-3h3"/>'],
  ['calculator', '계산', '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M8 6h8v4H8V6ZM8.5 14h.01M12 14h.01M15.5 14h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>'],
  ['marketing', '마케팅', '<path d="M3 9.5h4l12-5v15l-12-5H3v-5ZM7 9.5v5M7 14.5l2 6h4l-2.5-4.5M21.5 10v4"/>'],
  ['maintenance', '시설 보수', '<path d="M14 3.5a5.5 5.5 0 0 0-6.5 7L3.5 17a2.5 2.5 0 0 0 3.5 3.5l6.5-4a5.5 5.5 0 0 0 7-6.5l-4 4-4.5-4.5 4-4L14 3.5Z"/>'],
  ['utilities', '공과금', '<path d="M13.5 2.5 4 14h7l-.5 7.5L20 10h-7l.5-7.5Z"/>'],
  ['recipe', '레시피', '<path d="M12 6C9 3.5 6 3.5 3 4.5v15c3-1 6-1 9 1.5 3-2.5 6-2.5 9-1.5v-15c-3-1-6-1-9 1.5ZM12 6v15M6 8h3M6 12h3M15 8h3M15 12h3"/>'],
  ['expense', '비용', '<path d="M6 3.5h12v17L15 19l-3 1.5L9 19l-3 1.5v-17ZM9 7.5h6M9 11.5h6M9 15.5h3"/>'],
  ['profit-loss', '손익', '<path d="M5.5 3.5H20V21H5.5V3.5ZM8.5 3.5V21M3 7h4M3 12h4M3 17h4M12 7.5h5M12 12h5M12 16.5h5"/>'],
  ['checklist', '체크리스트', '<path d="M8 5H5v16h14V5h-3M8 3h8v4H8V3ZM8 11l1.2 1.2L11 10.5M13 11h3M8 16l1.2 1.2L11 15.5M13 16h3"/>'],
  ['open-prep', '오픈 준비', '<path d="M4 16a8 8 0 0 1 16 0M2.5 16h19M5 20h14M12 3v3M4.5 6.5l2 2M19.5 6.5l-2 2"/>'],
  ['closing', '마감 정리', '<path d="M20 14A8.7 8.7 0 0 1 10 3.8 8.7 8.7 0 1 0 20 14Z"/><path d="m14 6 1.5 1.5 3-3"/>'],
  ['pos', 'POS 단말기', '<rect x="3" y="3.5" width="18" height="12" rx="2"/><path d="M6.5 7h11M6.5 11h6M12 15.5V20M7.5 20h9"/>'],
  ['financial-sharing', '손익 공유', '<circle cx="5" cy="12" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m7.2 10.8 8.6-4.6M7.2 13.2l8.6 4.6"/>'],
];

const variants = [
  ['checkbox-checked', '다중 선택 · 선택됨', '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.5 2.5 5.5-5.5"/>'],
  ['radio-checked', '단일 선택 · 선택됨', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'],
];

const entries = [...core, ...support, ...variants];
if (core.length !== 32 || support.length !== 24 || new Set(entries.map(([name]) => name)).size !== entries.length) {
  throw new Error('Unexpected icon inventory or duplicate filenames');
}

const render = body => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">\n  ${body}\n</svg>\n`;
const files = entries.map(([name, label, body]) => ({ name, label, content: render(body) }));

// Preflight every existing target before writing anything. Preserve hand-edited assets.
for (const file of files) {
  try {
    const existing = await readFile(resolve(directory, `${file.name}.svg`), 'utf8');
    if (existing !== file.content) throw new Error(`Preserving modified asset: ${file.name}.svg; inspect it before regenerating`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (checkOnly) throw new Error(`Missing asset: ${file.name}.svg`);
    file.missing = true;
  }
}

if (!checkOnly) {
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    if (file.missing) await writeFile(resolve(directory, `${file.name}.svg`), file.content, { flag: 'wx' });
  }
}

console.log(`${checkOnly ? 'Verified' : 'Ready'}: ${core.length} core + ${support.length} support + ${variants.length} selection variants = ${entries.length} original SVG files`);
