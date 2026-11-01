import { GUIDE_TABS, guideContent } from './guide-content.ts';

export interface GuideSection {
  tab: string;
  tabName: string;
  heading: string;
  text: string;
}

// 只取游戏内渲染正文；不导入开发文档、彩蛋数据或浏览器控制器。
let cached: GuideSection[] | undefined;
export function guidePlainText(html: string) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (raw, dec, hex, name) => {
      const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : 0;
      if (dec || hex) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
      return (
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[
          name.toLowerCase()
        ] ?? raw
      );
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function splitText(text: string) {
  const parts: string[] = [];
  let current = '';
  for (const sentence of text.match(/[^。！？]+[。！？]?|[。！？]/g) ?? []) {
    let rest = sentence;
    while (rest.length) {
      if (current.length + rest.length <= 1500) {
        current += rest;
        break;
      }
      if (current) {
        parts.push(current.trim());
        current = '';
      } else {
        parts.push(rest.slice(0, 1500).trim());
        rest = rest.slice(1500);
      }
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function guideCorpus(): GuideSection[] {
  if (cached) return cached;
  const sections: GuideSection[] = [];
  for (const tab of GUIDE_TABS) {
    const html = guideContent(tab.id);
    let heading = tab.title;
    let offset = 0;
    const append = (content: string) => {
      for (const text of splitText(guidePlainText(content)))
        sections.push({ tab: tab.id, tabName: tab.title, heading, text });
    };
    // 兼容既有普通h3和guide-subheading，避免把整页长文当成一节。
    for (const match of html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)) {
      append(html.slice(offset, match.index));
      heading = guidePlainText(match[1]);
      offset = match.index + match[0].length;
    }
    append(html.slice(offset));
  }
  cached = sections;
  return cached;
}
