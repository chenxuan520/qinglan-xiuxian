import manuscript from '../docs/novel.md?raw';
import manuscriptUrl from '../docs/novel.md?url';
import { parseNovel } from './novel-content.ts';
import './novel.css';

const book = parseNovel(manuscript);
const READING_KEY = 'qinglan-novel-reader-v1';
const sizes = [16, 18, 20, 22, 24];
interface ReadingPlace {
  chapter: string;
  position: number;
  size: number;
  theme: 'light' | 'dark';
}
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const page = get<HTMLElement>('reading-page');
const prose = get<HTMLElement>('chapter-prose');
const list = get<HTMLElement>('chapter-list');
const title = get<HTMLElement>('chapter-title');
const contents = get<HTMLElement>('contents-inner');
const sidebar = document.querySelector('.book-contents')!;
const dialog = get<HTMLDialogElement>('contents-dialog');
const toggle = get<HTMLButtonElement>('contents-toggle');
const smaller = get<HTMLButtonElement>('type-smaller');
const larger = get<HTMLButtonElement>('type-larger');
const themeToggle = get<HTMLButtonElement>('theme-toggle');
const previous = get<HTMLButtonElement>('previous-chapter');
const next = get<HTMLButtonElement>('next-chapter');
let saved: ReadingPlace | null = null;
try {
  const value: unknown = JSON.parse(localStorage.getItem(READING_KEY) || 'null');
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Partial<ReadingPlace>;
    if (
      book.chapters.some((chapter) => chapter.id === record.chapter) &&
      typeof record.position === 'number' &&
      Number.isFinite(record.position) &&
      record.position >= 0 &&
      record.position <= 1 &&
      typeof record.size === 'number' &&
      sizes.includes(record.size)
    )
      saved = record as ReadingPlace;
  }
} catch {
  /* 阅读位置不可用时仍可正常翻阅。 */
}
let index = 0;
let size = saved?.size ?? 20;
let theme: ReadingPlace['theme'] =
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
let restoring = false;
let restoreFrame = 0;

function position() {
  const distance = page.scrollHeight - page.clientHeight;
  return distance > 0 ? Math.max(0, Math.min(1, page.scrollTop / distance)) : 0;
}
function remember() {
  if (restoring) return;
  try {
    localStorage.setItem(
      READING_KEY,
      JSON.stringify({
        chapter: book.chapters[index].id,
        position: position(),
        size,
        theme,
      } satisfies ReadingPlace),
    );
  } catch {
    /* 本机存储被拒绝不影响阅读或切章。 */
  }
}
function restorePosition(fraction: number) {
  cancelAnimationFrame(restoreFrame);
  restoring = true;
  restoreFrame = requestAnimationFrame(() => {
    page.scrollTop = fraction * Math.max(0, page.scrollHeight - page.clientHeight);
    restoring = false;
    remember();
  });
}
function updateType() {
  page.style.setProperty('--reading-size', `${size}px`);
  get('type-size').textContent = String(size);
  smaller.disabled = size === sizes[0];
  larger.disabled = size === sizes[sizes.length - 1];
}
function updateTheme() {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggle.title = theme === 'dark' ? '切回浅色书页' : '切换暗色书页';
  themeToggle.setAttribute('aria-label', themeToggle.title);
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content =
    theme === 'dark' ? '#0e201d' : '#142e29';
}
function closeContents() {
  if (dialog.open) dialog.close();
}
function chapterAtHash() {
  return book.chapters.findIndex((chapter) => `#${chapter.id}` === location.hash);
}
function renderChapter(target: number, fraction = 0, focus = false) {
  index = target;
  const chapter = book.chapters[index];
  get('volume-title').textContent = book.volumes.find(
    (volume) => volume.number === chapter.volumeNumber,
  )!.label;
  get('chapter-number').textContent = `第 ${chapter.number} 章`;
  title.textContent = chapter.title;
  get('reading-caption').textContent = '青岚纪 · 不系舟';
  document.title = `${chapter.label} · 不系舟`;
  const paragraphs = document.createDocumentFragment();
  for (const text of chapter.paragraphs) {
    if (text === '---') {
      const separator = document.createElement('hr');
      separator.className = 'scene-break';
      paragraphs.append(separator);
      continue;
    }
    const p = document.createElement('p');
    p.textContent = text;
    paragraphs.append(p);
  }
  prose.replaceChildren(paragraphs);
  get('book-ending').hidden = index !== book.chapters.length - 1;
  previous.disabled = index === 0;
  next.disabled = index === book.chapters.length - 1;
  previous.querySelector('strong')!.textContent =
    index > 0 ? book.chapters[index - 1].title : '已是卷首';
  next.querySelector('strong')!.textContent =
    index < book.chapters.length - 1 ? book.chapters[index + 1].title : '全书终';
  get('chapter-position').textContent = `${index + 1} / ${book.chapters.length} 章`;
  for (const link of list.querySelectorAll<HTMLAnchorElement>('.chapter-link')) {
    if (link.dataset.chapter === chapter.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const active = list.querySelector<HTMLAnchorElement>('[aria-current=page]')!;
  active.closest('details')!.open = true;
  if (focus) title.focus({ preventScroll: true });
  restorePosition(fraction);
}
function selectChapter(target: number) {
  if (target < 0 || target >= book.chapters.length) return;
  clearTimeout(scrollTimer);
  remember();
  closeContents();
  if (target === index) return;
  history.pushState(null, '', `#${book.chapters[target].id}`);
  renderChapter(target, 0, true);
}
for (const volume of book.volumes) {
  const details = document.createElement('details');
  details.className = 'volume';
  details.dataset.volume = String(volume.number);
  const summary = document.createElement('summary');
  summary.textContent = volume.label;
  const ol = document.createElement('ol');
  for (const chapter of volume.chapters) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'chapter-link';
    link.dataset.chapter = chapter.id;
    link.href = `#${chapter.id}`;
    const number = document.createElement('span');
    number.className = 'chapter-index';
    number.textContent = String(chapter.number).padStart(2, '0');
    const text = document.createElement('span');
    text.textContent = chapter.title;
    link.append(number, text);
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectChapter(book.chapters.indexOf(chapter));
    });
    li.append(link);
    ol.append(li);
  }
  details.append(summary, ol);
  list.append(details);
}
const download = get<HTMLAnchorElement>('download-manuscript');
download.href = manuscriptUrl;
download.hidden = false;
get('book-count').textContent = `${book.volumes.length} 卷 · ${book.chapters.length} 章`;
previous.addEventListener('click', () => selectChapter(index - 1));
next.addEventListener('click', () => selectChapter(index + 1));
themeToggle.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  updateTheme();
  remember();
});
for (const [button, step] of [
  [smaller, -1],
  [larger, 1],
] as const) {
  button.addEventListener('click', () => {
    const fraction = position();
    size = sizes[Math.max(0, Math.min(sizes.length - 1, sizes.indexOf(size) + step))];
    updateType();
    restorePosition(fraction);
  });
}
toggle.addEventListener('click', () => {
  dialog.append(contents);
  dialog.showModal();
  list.querySelector<HTMLElement>('[aria-current=page]')?.scrollIntoView({ block: 'nearest' });
});
get('contents-close').addEventListener('click', closeContents);
dialog.addEventListener('close', () => {
  sidebar.append(contents);
});
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    closeContents();
});
matchMedia('(min-width: 761px)').addEventListener('change', (event) => {
  if (event.matches) closeContents();
});
page.addEventListener(
  'scroll',
  () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(remember, 150);
  },
  { passive: true },
);
window.addEventListener('pagehide', remember);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) remember();
});
window.addEventListener('hashchange', () => {
  const target = chapterAtHash();
  if (target === index) return;
  clearTimeout(scrollTimer);
  remember();
  closeContents();
  if (target < 0) {
    history.replaceState(null, '', `#${book.chapters[index].id}`);
    return;
  }
  renderChapter(target, 0, true);
});
updateTheme();
updateType();
const initial = chapterAtHash();
index =
  initial >= 0
    ? initial
    : Math.max(
        0,
        book.chapters.findIndex((chapter) => chapter.id === saved?.chapter),
      );
history.replaceState(null, '', `#${book.chapters[index].id}`);
renderChapter(index, saved?.chapter === book.chapters[index].id ? saved.position : 0);
