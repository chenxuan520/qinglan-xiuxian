import { LOGIN_SCRIPT } from '../house-ads/admin.ts';

const head = (title: string, script: string) =>
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#081d19"><title>${title} · 叩仙门：青岚纪</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/leaderboard/app.css"><script src="${script}" defer></script></head>`;
const brand = `<a class="brand" href="/">叩仙门<span>青岚纪</span></a>`;
export const LEADERBOARD_HTML =
  head('万魂幡', '/leaderboard/app.js') +
  `<body><main class="shell"><nav class="topbar" aria-label="页面导航">${brand}<a class="back" href="/">返回修行 <span aria-hidden="true">↗</span></a></nav><header class="hero"><div class="seal" aria-hidden="true">幡</div><p class="eyebrow">此世道果 · 前一百名</p><h1>万魂幡</h1><p class="hero-note">按此世道果排列，同名只保留最高分。</p><div class="hero-rule" aria-hidden="true"><span>◆</span></div></header><section class="board" aria-label="道果榜单"><div class="board-toolbar"><div><h2>道果榜</h2><p id="board-meta">正在读取榜单…</p></div><button id="refresh" class="quiet" type="button">刷新榜单 <span aria-hidden="true">↻</span></button></div><p id="status" role="status" aria-live="polite"></p><div id="disabled" class="empty" hidden><span class="empty-mark" aria-hidden="true">◇</span><h3>排行榜已关闭</h3><p>开启后可查看万魂幡。</p><button id="enable" type="button">开启排行榜</button></div><div id="podium" class="podium" aria-label="前三名"></div><div class="list-head" id="list-head" hidden><span>名次</span><span>修士 / 品第</span><span>道果</span></div><ol id="entries" class="entries" aria-label="万魂幡排名"></ol><div id="empty" class="empty" hidden><span class="empty-mark" aria-hidden="true">◇</span><h3>尚无人留名</h3><p>成仙或此世落幕后，可在游戏中署名入榜。</p><a href="/" class="primary">返回修行 <span aria-hidden="true">↗</span></a></div></section><footer><span>叩仙门：青岚纪</span><a href="/leaderboard/admin/">榜单管理</a></footer></main></body></html>`;

export const LEADERBOARD_ADMIN_HTML =
  head('万魂幡管理', '/leaderboard/admin/app.js') +
  `<body><main class="shell admin"><nav class="topbar" aria-label="页面导航">${brand}<div class="nav-actions"><a href="/leaderboard/">查看榜单 ↗</a><button id="logout" class="quiet" type="button">退出登录</button></div></nav><header class="admin-heading"><p class="eyebrow">管理台</p><h1>万魂幡</h1><p>处理异常成绩与被屏蔽的署名。</p></header><section class="board"><div class="board-toolbar"><div><h2>榜单管理</h2><p>每次最多显示 100 条，可按姓名查找。</p></div><button id="refresh" class="quiet" type="button">刷新</button></div><form id="search" class="search"><label for="query">查找姓名</label><div><input id="query" maxlength="48" autocomplete="off" placeholder="输入姓名"><button type="submit">查找</button></div></form><p id="status" role="status" aria-live="polite"></p><a id="login" class="primary" href="/leaderboard/admin/login" hidden>登录管理</a><div id="admin-entries" class="admin-entries" aria-label="可管理成绩"></div><details class="blocked"><summary>已屏蔽署名 <span id="blocked-count">0</span></summary><p>解除屏蔽后可重新提交，原成绩不会恢复。</p><div id="blocked-entries" class="admin-entries"></div></details><p class="note">删除只移除本条成绩；屏蔽同时限制该姓名与当前匿名身份。公开榜单最迟约 30 秒更新。</p></section><footer><span>叩仙门：青岚纪 · 榜单管理</span><a href="/leaderboard/">返回万魂幡</a></footer></main><dialog id="confirm"><form method="dialog"><p class="eyebrow">确认操作</p><h2 id="confirm-title"></h2><strong id="confirm-name"></strong><p id="confirm-detail"></p><div class="confirm-actions"><button value="cancel" class="quiet">取消</button><button value="confirm" class="danger">确认</button></div></form></dialog></body></html>`;

export const LEADERBOARD_CSS = `
:root{color-scheme:dark;--bg:#081d19;--panel:#102820;--gold:#e8d69c;--text:#d9dfcf;--muted:#8fa596;--line:#a0b58b28;font-family:"Songti SC","Noto Serif CJK SC","SimSun",serif;background:var(--bg);color:var(--text);font-size:15px}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% 0,#274d352b,transparent 60%)}a{color:inherit;text-decoration:none}button,input{font:inherit}button,a.primary{min-height:44px;cursor:pointer}button,.primary{display:inline-flex;align-items:center;justify-content:center;gap:12px;border:1px solid #b4bf875c;border-radius:3px;padding:11px 20px;background:#c5c99b;color:#172d22;font-weight:600;text-decoration:none;white-space:nowrap}button:disabled{opacity:.45;cursor:default}.quiet{color:var(--text);background:transparent;border-color:var(--line);font-weight:400}.quiet:hover:not(:disabled){border-color:#a8bb8266;background:#afbd8b09}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:4px}h1,h2,h3,p{margin:0}h2{font-size:22px;letter-spacing:.12em;font-weight:500}h3{font-size:22px;font-weight:500}p{line-height:1.8;color:var(--muted)}.shell{max-width:1140px;margin:auto;padding:0 52px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:100px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:15px;color:var(--gold);font-size:20px;letter-spacing:.1em;white-space:nowrap}.brand span{padding-left:16px;border-left:1px solid #b5bf8855;font-size:13px;letter-spacing:.18em;color:#acb99c}.back{font-size:13px;white-space:nowrap;color:#b1bd9f}.back span{margin-left:12px;color:var(--gold)}.hero{text-align:center;position:relative;padding:70px 0 36px}.seal{display:grid;place-items:center;border:1px solid #b5bf8859;color:var(--gold);width:36px;height:42px;font-size:22px;margin:0 auto 24px;outline:1px solid #b5bf881c;outline-offset:4px}.eyebrow{font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.22em;color:#a6b694}.hero h1{color:var(--gold);font-size:clamp(48px,6vw,68px);font-weight:500;letter-spacing:.3em;text-indent:.3em;margin:15px 0 17px}.hero-note{font-size:13px;letter-spacing:.05em}.hero-rule{display:flex;align-items:center;gap:15px;max-width:280px;margin:35px auto 0;color:#aebd8a79;font-size:9px}.hero-rule:before,.hero-rule:after{content:"";height:1px;background:linear-gradient(90deg,transparent,#a0b58b55);flex:1}.hero-rule:after{transform:scaleX(-1)}.board{padding-top:22px}.board-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:24px}.board-toolbar p{font-size:12px;margin-top:7px}.board-toolbar button{font-size:13px}#status{font-family:system-ui,sans-serif;font-size:13px;white-space:pre-line}#status:not(:empty){padding:14px 0 22px}#status[data-error=true]{color:#d3a995}.podium{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:0 0 28px}.podium:empty{display:none}.podium-card{position:relative;text-align:center;min-width:0;padding:28px 18px 25px;border:1px solid var(--line);background:linear-gradient(160deg,#b5c38d0b,#b5c38d02);overflow:hidden}.podium-card:first-child{border-color:#dcc98d5c;background:radial-gradient(ellipse at 50% 0,#aebc7726,transparent 75%),linear-gradient(160deg,#b5c38d0c,#b5c38d02)}.place{display:block;font-size:12px;color:var(--muted);letter-spacing:.14em}.podium-card:first-child .place{color:var(--gold)}.podium-number{display:block;font-size:37px;font-style:italic;font-weight:400;color:#a7b78d75;margin:12px 0 15px;line-height:1}.podium-card:first-child .podium-number{color:var(--gold)}.podium-card .name{font-size:20px;display:block;overflow-wrap:anywhere;line-height:1.7;min-height:34px;font-weight:500}.podium-card .score{display:block;font-weight:700;font-size:clamp(20px,2.4vw,29px);margin:15px 0 9px;overflow-wrap:anywhere;line-height:1.4}.score{font-family:Georgia,"Songti SC",serif;font-variant-numeric:tabular-nums;color:var(--gold)}.podium-card>.tier,.podium-card>.mode{display:block}.tier{color:#b5c599;font-size:12px;line-height:1.7}.mode{font-family:system-ui,sans-serif;display:inline-block;font-size:10px;line-height:1.6;margin-top:10px;color:#8fa596;letter-spacing:.06em}.mode.extreme{color:#ddc995}.list-head,.rank-row{display:grid;grid-template-columns:56px minmax(0,1fr) auto;column-gap:20px;align-items:center}.list-head{padding:0 24px 15px;border-bottom:1px solid var(--line);font-family:system-ui,sans-serif;color:var(--muted);font-size:11px;letter-spacing:.06em}.list-head span:last-child{text-align:right}.entries{list-style:none;padding:0;margin:0}.rank-row{padding:23px 24px;border-bottom:1px solid var(--line);min-width:0}.rank-row:nth-child(even){background:#b5c38d03}.rank-row .number{font:italic 21px Georgia,serif;color:#98a98c}.identity{min-width:0}.rank-row .name{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;font-weight:500;line-height:1.8}.row-meta{display:flex;flex-wrap:wrap;gap:3px 12px;align-items:center;font-size:11px;color:var(--muted);line-height:1.7;margin-top:4px}.row-meta>span{white-space:nowrap}.row-meta .mode{margin:0}.rank-row .score{font-size:23px;text-align:right;white-space:nowrap}.empty{text-align:center;padding:55px 20px 65px;border:1px solid var(--line);background:#b5c38d04}.empty-mark{display:block;font-size:55px;font-weight:400;color:#aebd8a69;margin-bottom:22px}.empty h3{color:#bdcba4;letter-spacing:.12em}.empty p{font-size:13px;margin:15px 0 25px}.empty .primary,.empty button{font-size:13px}.empty[hidden],[hidden]{display:none!important}footer{display:flex;justify-content:space-between;gap:20px;font-size:11px;color:#6e8b79;border-top:1px solid var(--line);padding:25px 0 35px;margin-top:60px;letter-spacing:.05em}footer a{color:#93a389}.nav-actions{display:flex;gap:20px;align-items:center;font-size:12px}.admin-heading{padding:55px 0 22px}.admin-heading h1{font-size:44px;color:var(--gold);font-weight:500;letter-spacing:.2em;margin:12px 0 15px}.admin-heading>p:last-child{font-size:13px}.search{display:grid;gap:9px;max-width:500px;margin-bottom:10px}.search label{font-size:12px;color:var(--muted)}.search>div{display:flex;gap:10px}input{border:1px solid #627b514d;background:#061b16;color:var(--text);padding:11px 13px;min-height:44px;min-width:0;border-radius:3px}input:focus{border-color:#b1bd87}.search input{flex:1;width:0}.admin-row{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:22px 0;border-bottom:1px solid var(--line);min-width:0}.admin-row .identity{flex:1}.admin-row strong{font-weight:500;font-size:18px;overflow-wrap:anywhere}.admin-row p{font:12px system-ui,sans-serif;line-height:1.8;margin-top:6px}.row-actions{display:flex;gap:8px;flex-shrink:0}.row-actions button{padding:9px 12px;font-size:12px;min-height:42px}.danger{color:#dbab97;border-color:#a5756059;background:#a5756009}.blocked{margin-top:35px;border-top:1px solid var(--line);padding-top:22px}.blocked summary{cursor:pointer;font-size:18px;color:#bbc99f;line-height:2}.blocked summary span{font:12px system-ui,sans-serif;color:var(--muted);margin-left:10px}.blocked>p,.note{font-size:12px;margin-top:15px}.note{margin-top:30px}.admin footer{margin-top:42px}dialog{width:min(440px,calc(100% - 40px));background:#112b22;color:var(--text);border:1px solid #a6b88265;padding:28px}dialog::backdrop{background:#020e0bce;backdrop-filter:blur(5px)}dialog h2{margin:15px 0}#confirm-name{display:block;color:var(--gold);font-weight:500;font-size:21px;overflow-wrap:anywhere}#confirm-detail{font-size:13px;margin:14px 0 24px}.confirm-actions{display:flex;justify-content:flex-end;gap:12px}.login{width:min(460px,100%);margin:80px auto;padding:36px 28px}.login h1{font-size:32px;color:var(--gold);font-weight:500;margin:20px 0 32px}.login form,.login label{display:grid;gap:10px}.login form{gap:20px}.login label{font-size:13px;color:#aebe9e}.login #status{font-size:12px}.login #login-verification{min-width:0}.login form>button{width:100%}
@media(max-width:700px){.shell{padding:0 22px}.topbar{min-height:78px}.brand{font-size:17px;gap:11px}.brand span{font-size:11px;padding-left:12px}.back{font-size:12px}.back span{margin-left:5px}.hero{padding:45px 0 24px}.hero h1{font-size:50px}.seal{margin-bottom:23px}.hero-note{font-size:12px;letter-spacing:0}.hero-rule{margin-top:27px;max-width:220px}.board-toolbar{gap:12px;margin-bottom:20px}.board-toolbar h2{font-size:20px}.board-toolbar button{font-size:12px;padding:10px 13px}.podium{grid-template-columns:1fr;gap:10px;margin-bottom:25px}.podium-card{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:0 14px;text-align:left;align-items:center;padding:18px 16px}.podium-number{grid-column:1;grid-row:1/4;font-size:32px;margin:0}.podium-card .place{display:none}.podium-card .name{grid-column:2;grid-row:1;font-size:18px;min-height:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.podium-card .score{grid-column:3;grid-row:1;font-size:21px;margin:0;white-space:nowrap}.podium-card .tier{grid-column:2/4;grid-row:2;font-size:11px;margin-top:6px}.podium-card .mode{grid-column:2/4;grid-row:3;margin-top:5px;font-size:10px}.list-head,.rank-row{grid-template-columns:28px minmax(0,1fr) auto;column-gap:10px;padding-left:10px;padding-right:10px}.rank-row{padding-top:20px;padding-bottom:20px}.rank-row .name{font-size:16px}.rank-row .score{font-size:18px}.rank-row .number{font-size:18px}.row-meta{font-size:10px;gap:2px 8px}.nav-actions{gap:12px}.nav-actions button{font-size:11px;padding:9px 10px}.admin-heading{padding:40px 0 16px}.admin-row{align-items:flex-start;gap:12px;flex-wrap:wrap}.admin-row .identity{flex-basis:180px}.row-actions{margin-left:auto}.admin .board-toolbar{align-items:flex-start}.board-toolbar p{max-width:180px}.admin footer{margin-top:35px}footer{margin-top:40px;font-size:10px;padding-bottom:28px}.login{margin-top:40px}.login h1{font-size:28px}.empty{padding:40px 12px 45px}}
@media(max-width:359px){.shell{padding:0 16px}.brand span{font-size:10px}.back{font-size:11px}.brand{font-size:16px}.podium-card{column-gap:9px;padding:17px 12px;grid-template-columns:28px minmax(0,1fr) auto}.podium-card .score{font-size:18px}.podium-card .name{font-size:16px}.rank-row .score{font-size:16px}.rank-row .name{font-size:14px}.nav-actions{gap:8px;font-size:11px}.nav-actions button{font-size:10px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

const COMMON_SCRIPT = String.raw`'use strict';
const $=id=>document.getElementById(id),status=$('status');
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
const number=value=>new Intl.NumberFormat('zh-CN').format(value);
let busy=false,active,closed=false,generation=0,signedOut=false;
function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
function controls(value){busy=value;document.querySelectorAll('button').forEach(node=>node.disabled=value||signedOut);}
async function request(url,body){const epoch=generation,controller=new AbortController();active=controller;const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('unavailable');const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>65536)throw Error('unavailable');text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}if(closed||epoch!==generation)throw new DOMException('cancelled','AbortError');const value=JSON.parse(text);if(!response.ok){const error=Error(value.error||'unavailable');error.status=response.status;throw error;}return value;}finally{clearTimeout(timer);if(active===controller)active=null;}}
addEventListener('pagehide',()=>{closed=true;generation++;active?.abort();});addEventListener('pageshow',event=>{if(event.persisted){closed=false;controls(false);void load();}});
const mode=entry=>{const node=el('span','mode'+(entry.lifeMode==='extreme'?' extreme':''),entry.lifeMode==='extreme'?'一命问道':'普通修行');return node;};
const grades={'下品':'#96b2a7','中下品':'#adc9c7','中品':'#91c9ae','中上品':'#78c9aa','上品':'#e8d69c','极品':'#f3d37b','仙品':'#d6c6f2','帝品':'#f1b487'};
function color(node,grade){node.style.color=grades[grade]||'#e8d69c';}
`;
export const LEADERBOARD_SCRIPT =
  COMMON_SCRIPT +
  String.raw`
const preference='qinglan-leaderboard-v1';let reloadAfter=false;
function enabled(){try{return localStorage.getItem(preference)!=='0';}catch{return false;}}
function valid(board){return board&&board.version===1&&board.limit===100&&Array.isArray(board.entries)&&board.entries.length<=100&&board.entries.every(e=>e&&typeof e.name==='string'&&[...e.name].length<=24&&Number.isSafeInteger(e.score)&&e.score>=0&&typeof e.grade==='string'&&e.grade.length<=8&&typeof e.title==='string'&&e.title.length<=12&&['normal','extreme'].includes(e.lifeMode));}
function render(board){$('podium').replaceChildren();$('entries').replaceChildren();$('empty').hidden=!!board.entries.length;$('list-head').hidden=board.entries.length<=3;$('board-meta').textContent=board.entries.length?'已留名 '+board.entries.length+' / 100':'前一百名 · 由此世道果排列';for(let i=0;i<board.entries.length;i++){const entry=board.entries[i],name=el('strong','name',entry.name),score=el('strong','score',number(entry.score));name.title=entry.name;score.setAttribute('aria-label',entry.score+' 道果');color(score,entry.grade);if(i<3){const card=el('article','podium-card');card.append(el('span','place','第 '+(i+1)+' 名'),el('span','podium-number',String(i+1).padStart(2,'0')),name,score,el('span','tier',entry.grade+' · '+entry.title),mode(entry));$('podium').append(card);}else{const row=el('li','rank-row'),identity=el('div','identity'),meta=el('div','row-meta');meta.append(el('span','',entry.grade),el('span','',entry.title),mode(entry));identity.append(name,meta);row.value=i+1;row.append(el('span','number',String(i+1).padStart(2,'0')),identity,score);$('entries').append(row);}}}
async function load(){if(busy||closed)return;const epoch=generation;if(!enabled()){$('disabled').hidden=false;$('refresh').disabled=true;$('board-meta').textContent='排行榜已关闭';return;}$('disabled').hidden=true;controls(true);message('正在读取榜单…');try{const board=await request('/api/leaderboard');if(closed||epoch!==generation)return;if(!enabled())return;if(!valid(board))throw Error('invalid');render(board);message('');}catch(error){if(!closed&&epoch===generation&&enabled()){$('board-meta').textContent='暂未更新';message(error.name==='AbortError'?'读取超时，请重试。':'榜单暂不可用，请重试。',true);}}finally{if(!closed&&epoch===generation){controls(false);$('refresh').disabled=!enabled();if(reloadAfter&&enabled()){reloadAfter=false;void load();}}}}
$('refresh').onclick=()=>void load();$('enable').onclick=()=>{try{localStorage.setItem(preference,'1');}catch{message('排行榜设置尚未保存，请重试。',true);return;}void load();};
addEventListener('storage',event=>{if(event.key!==preference)return;active?.abort();$('podium').replaceChildren();$('entries').replaceChildren();$('empty').hidden=true;$('list-head').hidden=true;$('disabled').hidden=enabled();if(!enabled()){message('');$('board-meta').textContent='排行榜已关闭';}else if(busy)reloadAfter=true;else void load();});void load();
`;
export const LEADERBOARD_ADMIN_SCRIPT =
  COMMON_SCRIPT +
  String.raw`
let state={entries:[],blocked:[]},selected=null;
function loginRequired(){signedOut=true;message('登录已失效，请重新登录。',true);$('login').hidden=false;}
function render(){for(const [id,entries,blocked] of [['admin-entries',state.entries,false],['blocked-entries',state.blocked,true]]){const host=$(id);host.replaceChildren();if(!entries.length){host.append(el('p','note',blocked?'暂无屏蔽记录。':'没有符合条件的成绩。'));continue;}for(const entry of entries){const row=el('article','admin-row'),identity=el('div','identity'),actions=el('div','row-actions');identity.append(el('strong','',entry.name),el('p','',blocked?'屏蔽于 '+new Date(entry.updatedAt).toLocaleString('zh-CN'):number(entry.score)+' 道果 · '+entry.grade+' · '+(entry.lifeMode==='extreme'?'一命问道':'普通修行')));for(const action of blocked?['unblock']:['remove','block']){const button=el('button',action==='unblock'?'quiet':'danger',action==='remove'?'删除成绩':action==='block'?'屏蔽':'解除屏蔽');button.type='button';button.onclick=()=>confirmAction(entry,action);actions.append(button);}row.append(identity,actions);host.append(row);}}$('blocked-count').textContent=String(state.blocked.length);}
async function load(){if(busy||closed||signedOut)return;const epoch=generation;controls(true);message('正在读取…');try{const data=await request('/leaderboard/admin/entries?q='+encodeURIComponent($('query').value.trim()));if(closed||epoch!==generation)return;if(!data||!Array.isArray(data.entries)||!Array.isArray(data.blocked)||data.entries.length>100||data.blocked.length>100)throw Error('invalid');state=data;render();$('login').hidden=true;message('');}catch(error){if(!closed&&epoch===generation){if(error.status===401)loginRequired();else message('未能读取榜单，请重试。',true);}}finally{if(!closed&&epoch===generation)controls(false);}}
function confirmAction(entry,action){if(busy||signedOut)return;selected={name:entry.name,expectedUpdatedAt:entry.updatedAt,expectedScore:entry.score??0,action};$('confirm-title').textContent=action==='remove'?'删除这条成绩？':action==='block'?'屏蔽这个署名？':'解除这个署名的屏蔽？';$('confirm-name').textContent=entry.name;$('confirm-detail').textContent=action==='remove'?'只移除此条成绩，之后仍可重新提交。':action==='block'?'移除成绩，并限制该姓名与当前匿名身份再次提交。':'允许重新提交；已移除的成绩不会恢复。';$('confirm').returnValue='';$('confirm').showModal();}
$('confirm').addEventListener('cancel',()=>{selected=null;$('confirm').returnValue='';});$('confirm').addEventListener('close',()=>{const input=selected;selected=null;if($('confirm').returnValue==='confirm'&&input)void moderate(input);});
async function moderate(input){if(busy||closed||signedOut)return;const epoch=generation;controls(true);message('正在处理…');let success=false;try{await request('/leaderboard/admin/moderate',input);if(closed||epoch!==generation)return;success=true;message('操作已完成。');}catch(error){if(!closed&&epoch===generation){if(error.status===401)loginRequired();else message(error.status===409?'记录已有变化，请刷新后重新确认。':'操作结果尚未确认，请刷新榜单核对后再操作。',true);}}finally{if(!closed&&epoch===generation)controls(false);}if(success)await load();}
$('search').onsubmit=event=>{event.preventDefault();void load();};$('refresh').onclick=()=>void load();$('logout').onclick=async()=>{if(busy)return;controls(true);try{await request('/ads/admin/logout',{});location.replace('/leaderboard/admin/login');}catch{message('退出未完成，请重试。',true);controls(false);}};void load();
`;

export function leaderboardPageResponse(content: string, contentType: string, login = false) {
  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': `default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'${login ? ' https://challenges.cloudflare.com' : ''}; connect-src 'self'${login ? ' https://challenges.cloudflare.com' : ''}; frame-src ${login ? 'https://challenges.cloudflare.com' : "'none'"}`,
    },
  });
}

export async function leaderboardPage(
  request: Request,
  env: Partial<Pick<LeaderboardEnv, 'ADMIN_AUTH'>>,
) {
  const url = new URL(request.url);
  if (url.search || request.method !== 'GET') return new Response('Not found', { status: 404 });
  if (url.pathname === '/leaderboard' || url.pathname === '/leaderboard/admin')
    return new Response(null, {
      status: 302,
      headers: { Location: url.pathname + '/', 'Cache-Control': 'no-store' },
    });
  if (url.pathname === '/leaderboard/')
    return leaderboardPageResponse(LEADERBOARD_HTML, 'text/html; charset=utf-8');
  if (url.pathname === '/leaderboard/admin/')
    return leaderboardPageResponse(LEADERBOARD_ADMIN_HTML, 'text/html; charset=utf-8');
  if (url.pathname === '/leaderboard/app.css')
    return leaderboardPageResponse(LEADERBOARD_CSS, 'text/css; charset=utf-8');
  if (url.pathname === '/leaderboard/app.js')
    return leaderboardPageResponse(LEADERBOARD_SCRIPT, 'text/javascript; charset=utf-8');
  if (url.pathname === '/leaderboard/admin/app.js')
    return leaderboardPageResponse(LEADERBOARD_ADMIN_SCRIPT, 'text/javascript; charset=utf-8');
  if (url.pathname === '/leaderboard/admin/login.js')
    return leaderboardPageResponse(
      LOGIN_SCRIPT.replace(
        "location.replace('/ads/admin/')",
        "location.replace('/leaderboard/admin/')",
      ),
      'text/javascript; charset=utf-8',
      true,
    );
  if (url.pathname === '/leaderboard/admin/login') {
    if (!env.ADMIN_AUTH) return new Response('管理登录暂不可用，请稍后重试。', { status: 503 });
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await env.ADMIN_AUTH.fetch(
        new Request('https://xiuxian.011203.xyz/ads/admin/login', {
          signal: controller.signal,
          redirect: 'error',
        }),
      );
      if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html'))
        throw Error('unavailable');
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let html = '',
        size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 32768) throw Error('too-large');
          html += decoder.decode(part.value, { stream: true });
        }
        html += decoder.decode();
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      html = html
        .replaceAll('广告管理登录', '万魂幡管理登录')
        .replace('/ads/admin/app.css', '/leaderboard/app.css')
        .replace('/ads/admin/login.js', '/leaderboard/admin/login.js')
        .replace(/<meta name="ai-agent-instructions"[^>]*>/, '')
        .replace(/<link rel="service-(?:desc|doc)"[^>]*>/g, '');
      return leaderboardPageResponse(html, 'text/html; charset=utf-8', true);
    } catch {
      return new Response('管理登录暂不可用，请稍后重试。', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return new Response('Not found', { status: 404 });
}
