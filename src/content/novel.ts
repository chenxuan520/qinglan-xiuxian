import buxizhouManuscript from '../../docs/novel.md?raw';
import buxizhouManuscriptUrl from '../../docs/novel.md?url';
import cunyinManuscript from '../../docs/novel-2.md?raw';
import cunyinManuscriptUrl from '../../docs/novel-2.md?url';
import { parseNovel, type Novel } from './novel-content.ts';
import './novel.css';

type BookId = 'buxizhou' | 'cunyin';
interface BookDefinition {
  id: BookId;
  label: string;
  shortTitle: string;
  seal: string;
  intro: string;
  description: string;
  ending: string;
  downloadName: string;
  manuscriptUrl: string;
  novel: Novel;
}
const books: Record<BookId, BookDefinition> = {
  buxizhou: {
    id: 'buxizhou',
    label: '青岚纪 · 不系舟',
    shortTitle: '不系舟',
    seal: '旧闻',
    intro: '山河辽阔，故人有信。',
    description: '《青岚纪·不系舟》：一个青岚少年的修行长卷。山河辽阔，故人有信。',
    ending: '山河未尽，此卷已终。',
    downloadName: '青岚纪_不系舟.md',
    manuscriptUrl: buxizhouManuscriptUrl,
    novel: parseNovel(buxizhouManuscript),
  },
  cunyin: {
    id: 'cunyin',
    label: '青岚纪 · 寸阴炉',
    shortTitle: '寸阴炉',
    seal: '炉火',
    intro: '药有火候，人有寸阴。',
    description: '《青岚纪·寸阴炉》：一位验药人守火的一生。药有火候，人有寸阴。',
    ending: '炉火未凉，此卷已终。',
    downloadName: '青岚纪_寸阴炉.md',
    manuscriptUrl: cunyinManuscriptUrl,
    novel: parseNovel(cunyinManuscript),
  },
};
function bookIdFromUrl(): BookId {
  return new URLSearchParams(location.search).get('book') === 'cunyin' ? 'cunyin' : 'buxizhou';
}
let bookId = bookIdFromUrl();
let active = books[bookId];
let book = active.novel;
const READING_KEY = 'qinglan-novel-reader-v1';
const sizes = [16, 18, 20, 22, 24];
interface ChapterPlace {
  chapter: string;
  position: number;
}
interface ReadingPlace extends ChapterPlace {
  size: number;
  theme: 'light' | 'dark';
  places?: Partial<Record<BookId, ChapterPlace>>;
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
const places: Partial<Record<BookId, ChapterPlace>> = {};
let storedSize: number | undefined;
try {
  const value: unknown = JSON.parse(localStorage.getItem(READING_KEY) || 'null');
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Partial<ReadingPlace>;
    const validPlace = (candidate: unknown, target: BookId): ChapterPlace | null => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
      const place = candidate as Partial<ChapterPlace>;
      return books[target].novel.chapters.some((chapter) => chapter.id === place.chapter) &&
        typeof place.position === 'number' &&
        Number.isFinite(place.position) &&
        place.position >= 0 &&
        place.position <= 1
        ? { chapter: place.chapter!, position: place.position }
        : null;
    };
    // 旧版顶层 chapter / position 只属于《不系舟》，迁移时原样保留。
    const legacy = validPlace(record, 'buxizhou');
    if (legacy) places.buxizhou = legacy;
    if (record.places && typeof record.places === 'object' && !Array.isArray(record.places)) {
      for (const target of ['buxizhou', 'cunyin'] as const) {
        const place = validPlace(record.places[target], target);
        if (place) places[target] = place;
      }
    }
    if (typeof record.size === 'number' && sizes.includes(record.size)) storedSize = record.size;
    if (record.theme === 'dark') document.documentElement.dataset.theme = 'dark';
  }
} catch {
  /* 阅读位置不可用时仍可正常翻阅。 */
}
const savedPlace = () => places[bookId];
let index = 0;
let size = storedSize ?? 20;
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
  places[bookId] = { chapter: book.chapters[index].id, position: position() };
  try {
    const first = places.buxizhou;
    localStorage.setItem(
      READING_KEY,
      JSON.stringify({
        // 顶层仍镜像《不系舟》位置，兼容旧版阅读器与防闪烁脚本。
        ...(first ? { chapter: first.chapter, position: first.position } : {}),
        size,
        theme,
        places,
      }),
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
  get('reading-caption').textContent = active.label;
  document.title = `${chapter.label} · ${active.shortTitle}`;
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
  get('book-ending').textContent = active.ending;
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
  const activeLink = list.querySelector<HTMLAnchorElement>('[aria-current=page]')!;
  activeLink.closest('details')!.open = true;
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
function buildChapterList() {
  list.replaceChildren();
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
}
const download = get<HTMLAnchorElement>('download-manuscript');
function updateBookChrome() {
  get('book-main').setAttribute('aria-label', `${active.label}阅读器`);
  get('book-short-title').textContent = active.shortTitle;
  get('book-seal').textContent = active.seal;
  get('book-intro').textContent = active.intro;
  get('book-footer-title').textContent = active.label;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content = active.description;
  download.href = active.manuscriptUrl;
  download.download = active.downloadName;
  download.hidden = false;
  get('book-count').textContent = `${book.volumes.length} 卷 · ${book.chapters.length} 章`;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-book-link]')) {
    if (link.dataset.bookLink === bookId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
function activateBook(targetId: BookId, target: number, fraction: number) {
  bookId = targetId;
  active = books[bookId];
  book = active.novel;
  buildChapterList();
  updateBookChrome();
  renderChapter(target, fraction);
}
function switchBook(
  targetId: BookId,
  push = true,
  override?: { target: number; fraction: number },
) {
  if (targetId === bookId) return;
  clearTimeout(scrollTimer);
  remember();
  const place = places[targetId];
  const target =
    override?.target ??
    (place
      ? Math.max(
          0,
          books[targetId].novel.chapters.findIndex((chapter) => chapter.id === place.chapter),
        )
      : 0);
  activateBook(targetId, target, override?.fraction ?? (place ? place.position : 0));
  const url = new URL(location.href);
  if (targetId === 'cunyin') url.searchParams.set('book', 'cunyin');
  else url.searchParams.delete('book');
  url.hash = books[targetId].novel.chapters[target].id;
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-book-link]')) {
  link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    switchBook(link.dataset.bookLink as BookId);
  });
}
let downloading = false;
download.addEventListener('click', (event) => {
  if (!navigator.serviceWorker?.controller) return;
  event.preventDefault();
  if (downloading) return;
  downloading = true;
  document.getElementById('download-error')?.remove();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  void fetch(active.manuscriptUrl, { signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error('download-unavailable');
      const link = document.createElement('a');
      link.href = active.manuscriptUrl;
      // 附件响应须用普通导航接收；未启用缓存时沿用同源静态下载。
      if (!response.headers.get('Content-Disposition')?.startsWith('attachment'))
        link.download = download.download;
      void response.body?.cancel().catch(() => {});
      document.body.append(link);
      link.click();
      link.remove();
    })
    .catch(() => {
      const error = document.createElement('p');
      error.id = 'download-error';
      error.className = 'story-note';
      error.setAttribute('role', 'status');
      error.textContent = '原文暂未下载，请联网后再试。';
      download.after(error);
    })
    .finally(() => {
      clearTimeout(timeout);
      downloading = false;
    });
});
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
function syncFromUrl() {
  const nextId = bookIdFromUrl();
  const nextBook = books[nextId].novel;
  const hashTarget = nextBook.chapters.findIndex((chapter) => `#${chapter.id}` === location.hash);
  if (nextId !== bookId) {
    switchBook(nextId, false, hashTarget >= 0 ? { target: hashTarget, fraction: 0 } : undefined);
    return;
  }
  if (hashTarget === index) return;
  clearTimeout(scrollTimer);
  remember();
  closeContents();
  if (hashTarget < 0) {
    history.replaceState(null, '', `#${book.chapters[index].id}`);
    return;
  }
  renderChapter(hashTarget, 0, true);
}
window.addEventListener('hashchange', syncFromUrl);
window.addEventListener('popstate', syncFromUrl);
updateTheme();
updateType();
buildChapterList();
updateBookChrome();
const initial = chapterAtHash();
const initialPlace = savedPlace();
index =
  initial >= 0
    ? initial
    : Math.max(
        0,
        book.chapters.findIndex((chapter) => chapter.id === initialPlace?.chapter),
      );
history.replaceState(null, '', `#${book.chapters[index].id}`);
renderChapter(index, initialPlace?.chapter === book.chapters[index].id ? initialPlace.position : 0);
