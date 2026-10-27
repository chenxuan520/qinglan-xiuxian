import { STANDALONE } from './build-mode.ts';
import { isExtremeLife, difficultyAllowed, rewardDisabled } from './life-mode.ts';
import { resourceFailureContent } from './resource-panel.ts';
import type { ActionShell } from './action-controller.ts';
import type { ParentId } from './hometown.ts';
import type { TownResident } from './town-population.ts';
import type { PanelLocation } from './panel-host.ts';
import type { AdPlacement } from './ads.ts';
import type { Game } from './game.ts';
export function renderEpilogue(shell: ActionShell) {
  shell.battleHud.reset();
  shell.leaveTown();
  shell.inMortalWorld = false;
  shell.game = shell.pendingRun = null;
  shell.clearInput();
  void shell.mobileDisplay.leave();
  shell.document.body.classList.remove('in-game', 'in-mortal', 'journey-complete', 'immortal-home');
  shell.ui.innerHTML = '';
  shell.ui.inert = true;
  shell.panel = 'epilogue';
  shell.modal.innerHTML = shell.epilogueModal(shell.save);
  shell.updateStorySoundButton(
    shell.modal.querySelector<HTMLButtonElement>('[data-action="epilogue-sound"]')!,
    shell.save.sound,
  );
  const scene = shell.modal.querySelector<HTMLElement>('.epilogue-scene')!;
  scene.style.setProperty(
    '--prologue-image',
    `url("${shell.assetUrl('/assets/qinglan-prologue.webp')}")`,
  );
  scene.focus({ preventScroll: true });
}

export function releaseTownScene(shell: ActionShell) {
  if (shell.marketScene) {
    shell.marketPosition = { ...shell.marketScene.position };
    shell.marketScene.destroy();
    shell.marketScene = null;
  }
  if (!shell.townScene) return;
  shell.townPosition = { ...shell.townScene.position };
  shell.townScene.destroy();
  shell.townScene = null;
}

export function leaveTown(shell: ActionShell) {
  shell.closeNpcChat();
  shell.releaseTownScene();
  if (shell.inTown || shell.inMarket) void shell.mobileDisplay.leave();
  shell.document.body.classList.remove('in-town');
  shell.inTown = false;
  shell.inMarket = false;
  shell.marketNpc = null;
  shell.lastMortalTick = shell.performance.now();
}

export function mountTownScene(shell: ActionShell) {
  if (shell.inMarket) {
    const marketHost = shell.document.getElementById('sect-market-view');
    if (marketHost) {
      const visit = shell.save.mortal.sectMarket?.visit;
      const current = () =>
        marketHost.isConnected &&
        shell.inMarket &&
        !shell.saveLock &&
        shell.save.mortal.sectMarket?.visit === visit;
      marketHost.innerHTML =
        '<div class="town-loading" role="status"><div>宗门坊市 · 正在迎候来客…</div></div>';
      void shell.marketEventSource.load().then(
        (module: any) => {
          if (!current()) return;
          shell.marketScene = new module.SectMarketScene(
            marketHost,
            { ...shell.marketPosition },
            shell.save,
            shell.showMarketEvent,
            shell.showAuction,
            (id: string) => showMarketVenue(shell, id),
            (entry?: 'button') => {
              if (marketHost.isConnected) module.travelSettlement(shell, 'town', entry);
            },
          );
        },
        () => {
          if (current())
            marketHost.innerHTML = `<div class="town-loading" role="status">${resourceFailureContent('refresh-game', '坊市暂未准备好，游历已暂停。', '重新加载', false)}</div>`;
        },
      );
    }
    return;
  }
  const host = shell.document.getElementById('town-view');
  if (!shell.inTown || !host) return;
  if (!shell.save.mortal.population) {
    shell.save.mortal.population = shell.freshTownPopulation(shell.save.age);
    shell.persist();
  }
  const current = () => host.isConnected && shell.inTown && !shell.saveLock && !shell.townScene;
  host.innerHTML = '<div class="town-loading" role="status"><div>青岚镇 · 街巷铺展中…</div></div>';
  void shell.townSource.load().then(
    (module) => {
      if (!current()) return;
      shell.townScene = new module.TownScene(
        host,
        { ...shell.townPosition },
        shell.save.mortal.population!,
        shell.save.age,
        shell.showTownEvent,
        () => shell.save.path,
        shell.save.mortal.scenery,
        shell.save.mortal.hometown
          ? {
              state: shell.save.mortal.hometown,
              interact: (target: string) =>
                target === 'dock'
                  ? shell.finishDeparture()
                  : shell.showHometown(
                      target === 'father' || target === 'mother' ? target : undefined,
                    ),
              ready: () => {
                if (shell.panel !== 'hometown-loading') return;
                if (shell.save.mortal.hometown?.stage === 'farewell') {
                  shell.panel = 'hometown-farewell';
                  shell.ui.inert = true;
                  shell.modal.innerHTML = shell.hometownFarewellModal();
                  shell.modal.querySelector<HTMLButtonElement>('button')?.focus();
                } else {
                  shell.panel = '';
                  shell.document.getElementById('town-view')?.focus({ preventScroll: true });
                }
              },
            }
          : undefined,
        {
          open: () => shell.sectMarketOpen(shell.save),
          enter: (entry?: 'button') => {
            if (host.isConnected) module.travelSettlement(shell, 'market', entry);
          },
        },
      );
      if (host.dataset.arrival) {
        shell.townScene.showArrival(host.dataset.arrival);
        delete host.dataset.arrival;
      }
    },
    () => {
      if (current())
        host.innerHTML = `<div class="town-loading" role="status">${resourceFailureContent('refresh-game', '街巷暂未准备好，游历已暂停。', '重新加载', false)}</div>`;
    },
  );
}

export function showTownArrival(shell: ActionShell, message: string) {
  if (shell.townScene) shell.townScene.showArrival(message);
  else {
    const host = shell.document.getElementById('town-view');
    if (host) host.dataset.arrival = message;
  }
}

export function renderDeparture(shell: ActionShell) {
  shell.closeNpcChat();
  // 同一段离乡行程的素材重试只重建场景，保留玩家当前的全屏状态。
  shell.releaseTownScene();
  shell.inMarket = false;
  shell.inMortalWorld = shell.inTown = true;
  shell.townPosition = { ...shell.HOMETOWN_START };
  shell.save.mortal.population ??= shell.freshTownPopulation(15);
  shell.save.mortal.scenery ??= shell.townVisit(undefined, 15);
  shell.persist();
  shell.panel = 'hometown-loading';
  shell.modal.innerHTML = '';
  shell.ui.inert = false;
  shell.clearInput();
  shell.document.body.classList.remove('in-game', 'journey-complete', 'immortal-home');
  shell.document.body.classList.add('in-mortal', 'in-town');
  shell.ui.innerHTML = shell.townPage(
    shell.save,
    shell.fullscreenButton(shell.mobileDisplay.available, shell.mobileDisplay.active),
  );
  shell.mountTownScene();
}

export function showHometown(shell: ActionShell, parent?: ParentId) {
  const home = shell.save.mortal.hometown;
  if (
    !home ||
    home.stage !== 'departed' ||
    !shell.inTown ||
    !shell.townScene ||
    Math.hypot(
      shell.townScene.position.x - shell.HOMETOWN_START.x,
      shell.townScene.position.y - shell.HOMETOWN_START.y,
    ) > 160
  )
    return;
  const parents = shell.hometownParents(home, shell.save.age);
  if (parent && !parents.some((p: { id: ParentId; alive: boolean }) => p.id === parent && p.alive))
    return;
  shell.closeNpcChat();
  const content = shell.hometownContent(shell.save, parent);
  if (
    (parent || parents.every((p: { alive: boolean }) => !p.alive)) &&
    shell.visitHometown(shell.save, parent)
  )
    shell.persist();
  shell.panel = 'hometown-home';
  shell.panelFrame(
    parent ? parents.find((p: { id: ParentId; name: string }) => p.id === parent)!.name : '故居',
    '青岚镇 · 门前旧路',
    content,
  );
  if (parent)
    shell.mountNpcChat(shell.modal.querySelector<HTMLElement>('.npc-dialogue')!, shell.save, {
      id: parent,
      name: parents.find((p: { id: ParentId; name: string }) => p.id === parent)!.name,
      generation: 0,
    });
}

export function showTownEvent(shell: ActionShell, npc: TownResident) {
  if (!shell.inTown || shell.townScene?.nearbyNpc?.id !== npc.id) return;
  shell.townNpc = npc;
  shell.panel = 'town-event';
  const visitor = shell.save.mortal.immortal;
  if (visitor?.npcId === npc.id && !shell.save.journeyEnded) {
    shell.closeNpcChat();
    const next = shell.structuredClone(shell.save);
    const granted = shell.meetTownImmortal(next, npc.id, npc.name, shell.pendingRun?.loot.curios);
    if (granted) {
      try {
        shell.writeSave(next, shell.pendingRun);
      } catch {
        if (!shell.saveLock) {
          shell.panel = '';
          shell.toast('这场相逢未能保存，请再与前辈交谈');
        }
        return;
      }
      Object.assign(shell.save, next);
    }

    shell.panelFrame(
      ...shell.immortalEncounterPanel(shell.save, npc, granted, shell.pendingRun?.loot.curios),
    );
    return;
  }
  const storyId = Object.keys(shell.HUMAN_STORIES).find(
    (id) => shell.isHumanStoryId(id) && shell.HUMAN_STORIES[id].npcId === npc.id,
  );
  const changed = shell.syncHumanStories(shell.save);
  const read =
    storyId && shell.isHumanStoryId(storyId) && shell.chooseHumanStory(shell.save, storyId, 'read');
  if (changed || read) shell.persist();
  shell.panelFrame(npc.name, `${npc.place} · ${npc.role}`, shell.townEventContent(shell.save, npc));
  shell.mountNpcChat(shell.modal.querySelector<HTMLElement>('.npc-dialogue')!, shell.save, npc);
}

export function showSectService(shell: ActionShell) {
  if (
    !shell.inMortalWorld ||
    shell.inTown ||
    shell.inMarket ||
    shell.game ||
    shell.saveLock ||
    shell.panel ||
    !shell.save.mortal.member
  )
    return;
  shell.panel = 'sect-service';
  shell.panelFrame(
    '本门传习',
    '宗门 · 专长办事',
    '<div id="sect-service-loading" role="status">正在展开本门传习…</div>',
  );
  const host = shell.modal.querySelector<HTMLElement>('#sect-service-loading')!;
  const id = shell.save.mortal.member.id;
  const current = () =>
    host.isConnected &&
    !shell.saveLock &&
    shell.inMortalWorld &&
    !shell.inTown &&
    !shell.inMarket &&
    !shell.game &&
    shell.panel === 'sect-service' &&
    shell.save.mortal.member?.id === id;
  const load = () => {
    if (!current()) return;
    host.textContent = '正在展开本门传习…';
    void shell.marketEventSource.load().then(
      (module: any) => {
        if (current()) module.renderSectService(shell);
      },
      () => {
        if (!current()) return;
        host.innerHTML = resourceFailureContent('', '本门传习暂时无法展开，请重试。');
        host.querySelector<HTMLButtonElement>('[data-resource-retry]')!.onclick = load;
      },
    );
  };
  load();
}

export function showMarketVenue(shell: ActionShell, id: string) {
  const place = shell.marketScene?.nearVenue;
  if (!shell.inMarket || shell.saveLock || !place || place.id !== id || shell.panel) return;
  shell.marketNpc = null;
  shell.panel = 'market-venue';
  shell.panelFrame(
    place.name,
    '宗门坊市 · 坊中诸事',
    '<div id="venue-loading" role="status">正在展开坊中诸事…</div>',
  );
  const host = shell.modal.querySelector<HTMLElement>('#venue-loading')!;
  const visit = shell.save.mortal.sectMarket?.visit;
  const current = () =>
    host.isConnected &&
    !shell.saveLock &&
    shell.inMarket &&
    shell.panel === 'market-venue' &&
    shell.marketScene?.nearVenue?.id === id &&
    shell.save.mortal.sectMarket?.visit === visit;
  const load = () => {
    if (!current()) return;
    host.textContent = '正在展开坊中诸事…';
    void shell.marketEventSource.load().then(
      (module: any) => {
        if (current()) module.renderVenue(shell, id);
      },
      () => {
        if (!current()) return;
        host.innerHTML = resourceFailureContent('', '坊中诸事暂时无法展开，请重试。');
        host.querySelector<HTMLButtonElement>('[data-resource-retry]')!.onclick = load;
      },
    );
  };
  load();
}

export function showAuction(shell: ActionShell) {
  if (!shell.inMarket || !shell.marketScene?.nearAuction || shell.saveLock) return;
  if (!shell.marketEventSource.current) {
    shell.panel = 'sect-auction';
    shell.panelFrame(
      '坊间竞宝',
      '宗门坊市 · 拍卖行',
      '<div id="auction-loading" role="status">正在展开拍卖行…</div>',
    );
    const host = shell.modal.querySelector<HTMLElement>('#auction-loading')!;
    const visit = shell.save.mortal.sectMarket?.visit;
    const current = () =>
      host.isConnected &&
      !shell.saveLock &&
      shell.panel === 'sect-auction' &&
      shell.inMarket &&
      !!shell.marketScene?.nearAuction &&
      shell.save.mortal.sectMarket?.visit === visit;
    const load = () => {
      if (!current()) return;
      host.textContent = '正在展开拍卖行…';
      void shell.marketEventSource.load().then(
        () => {
          if (current()) showAuction(shell);
        },
        () => {
          if (!current()) return;
          host.innerHTML = resourceFailureContent('', '拍卖行暂时无法展开，请重试。');
          host.querySelector<HTMLButtonElement>('[data-resource-retry]')!.onclick = load;
        },
      );
    };
    load();
    return;
  }
  const next = shell.structuredClone(shell.save);
  if (!shell.prepareAuction(next)) return;
  try {
    shell.writeSave(next, shell.pendingRun);
  } catch {
    if (!shell.saveLock) shell.toast('暂时无法保存拍卖进度，请重试');
    return;
  }
  Object.assign(shell.save, next);
  shell.marketNpc = null;
  shell.panel = 'sect-auction';
  shell.auctionView = 'buy';
  shell.auctionKind = 'medicine';
  shell.panelFrame(
    '坊间竞宝',
    '宗门坊市 · 拍卖行',
    `<div id="auction-content">${shell.auctionContent(shell.save, shell.auctionView, !!shell.pendingRun)}</div>`,
  );
}

export function showPanel(shell: ActionShell, name: string) {
  shell.panel = name;
  shell.renderPanel();
}

export function rememberPanel(shell: ActionShell): PanelLocation {
  return shell.panelHost.remember(shell.panel);
}

export function restorePanel(shell: ActionShell, location: PanelLocation) {
  shell.panel = location.name;
  shell.panelHost.restore(location, shell.renderPanel);
}

export function panelFrame(
  shell: ActionShell,
  title: string,
  subtitle: string,
  body: string,
  wide = false,
) {
  shell.journeyCardPanel.cancel();
  shell.closeNpcChat();
  shell.panelHost.frame(shell.panel, title, subtitle, body, wide);
}

export function renderPanel(shell: ActionShell) {
  if (shell.panel === 'sect-service') {
    shell.marketEventSource.current?.renderSectService(shell);
  } else if (shell.panel === 'market-venue') {
    const id = shell.marketScene?.nearVenue?.id;
    if (id) shell.marketEventSource.current?.renderVenue(shell, id);
  } else if (shell.panel === 'sect-market-event' && shell.marketNpc) {
    shell.showMarketEvent(shell.marketNpc);
  } else if (shell.panel === 'settings') {
    shell.panelFrame('设置', '游戏选项', shell.settingsContent(shell.save));
    void shell.mobileDisplay.mount(shell.modal.querySelector('#screen')!);
    void shell.openOfflinePanel();
  } else if (shell.panel === 'about') {
    shell.panelFrame(
      '关于《叩仙门》',
      '独立制作 · 持续更新',
      `<div class="about-copy"><p class="about-lead">《叩仙门：青岚纪》 · 一世修行，叩问仙门。</p><div class="about-maker"><span>制作</span><strong>一个想做点自己喜欢的东西的程序员 chenxuan，和一堆 AI 工具。</strong><p>在秘境与人间修行，见岁月流转、故人离合；叩入仙门后，可留一物传承，让后来人接续问道。</p></div><p class="panel-note">程序设计、玩法与内容由作者持续迭代；部分开发、美术生成与辅助工作使用 AI 工具完成。项目持续更新中，源码公开于 GitHub。</p><div class="about-meta"><p><span>GitHub</span><a href="https://github.com/chenxuan520/qinglan-xiuxian" target="_blank" rel="noopener noreferrer" tabindex="0">chenxuan520/qinglan-xiuxian</a></p><p><span>官网</span><a href="${shell.GAME_SITE_URL}" target="_blank" rel="noopener noreferrer" tabindex="0">${new shell.URL(shell.GAME_SITE_URL).host}</a></p><p><span>版本</span>${STANDALONE ? `<span class="about-version">${shell.GAME_VERSION} · 单机版</span>` : `<button class="about-version" data-action="debug-version" aria-label="版本 ${shell.GAME_VERSION}">${shell.GAME_VERSION}</button>`}</p>${STANDALONE ? '' : `<p><span>运行监控</span><a href="${shell.assetUrl('/monitor/')}" target="_blank" rel="noopener noreferrer">公开统计与每日测试</a></p>${shell.telemetryRow(shell.telemetry.enabled(), shell.telemetry.active)}`}</div><div class="save-actions about-actions"><a class="primary-button" href="https://github.com/chenxuan520/qinglan-xiuxian" target="_blank" rel="noopener noreferrer" tabindex="0">GitHub 源码</a><a class="secondary-button" href="https://github.com/chenxuan520/qinglan-xiuxian/issues" target="_blank" rel="noopener noreferrer" tabindex="0">反馈问题</a></div><div class="about-support"><img src="${shell.assetUrl(shell.SUPPORT_CODE_IMAGE)}" alt="微信赞赏码" width="128" height="128" loading="lazy"><div><strong>请道友喝杯茶</strong><p>这一程山水不收分文。若觉得值得，请作者喝杯茶便好——茶钱不换道具，也不换修为，只换作者多写几段山水。</p><small>微信扫码即可；手机上可先截图，再在「扫一扫」里从相册选取。</small></div></div></div>`,
    );
  } else if (shell.panel === 'medicine') {
    const content = shell.medicinePanel.content(
      shell.selectedStage,
      !!(shell.game || shell.pendingRun),
      shell.inTown && shell.townNpc?.id === 'herbs',
    );
    // 换货写入可能发现其他窗口的新存档，不覆盖刚打开的存档锁。
    if (shell.saveLock || shell.panel !== 'medicine') return;
    shell.panelFrame('丹香入道', '炼丹炉', content, true);
  } else if (shell.panel === 'arsenal' || shell.panel === 'treasure-detail') {
    if (!shell.marketEventSource.current) {
      shell.panelFrame(
        '藏器阁',
        '随身珍藏',
        '<div id="catalog-loading" role="status">正在展开藏器阁…</div>',
        true,
      );
      const host = shell.modal.querySelector<HTMLElement>('#catalog-loading')!;
      const current = () =>
        host.isConnected &&
        !shell.saveLock &&
        (shell.panel === 'arsenal' || shell.panel === 'treasure-detail');
      const load = () => {
        if (!current()) return;
        host.textContent = '正在展开藏器阁…';
        void shell.marketEventSource.load().then(
          () => {
            if (current()) renderPanel(shell);
          },
          () => {
            if (!current()) return;
            host.innerHTML = resourceFailureContent('', '藏器阁暂时无法展开，请重试。');
            host.querySelector<HTMLButtonElement>('[data-resource-retry]')!.onclick = load;
          },
        );
      };
      load();
      return;
    }
    const view = shell.catalogPanel(shell.save, {
      panel: shell.panel,
      catalogTreasures: shell.catalogTreasures,
      schoolFilter: shell.schoolFilter,
      treasurePage: shell.treasurePage,
      selectedTreasure: shell.selectedTreasure,
      bookTab: shell.bookTab,
    });
    shell.panelFrame(view.title, view.subtitle, view.body, view.wide);
    if (shell.panel === 'treasure-detail') return;
  } else if (shell.panel === 'cultivation') {
    const view = shell.cultivationPanel(shell.save, shell.selectedStage);
    shell.panelFrame(view.title, view.subtitle, view.body, view.wide);
  } else if (shell.panel === 'chronicle') {
    if (!shell.chronicleSource.current) {
      shell.panelFrame(
        '仙途履历',
        '岁月留痕 · 此世道果',
        '<p class="panel-note" data-chronicle-loading role="status">正在展开履历与属性…</p>',
      );
      const host = shell.modal.querySelector<HTMLElement>('[data-chronicle-loading]')!;
      const current = () => host.isConnected && !shell.saveLock && shell.panel === 'chronicle';
      void shell.chronicleSource
        .load()
        .then(() => {
          if (current()) shell.renderPanel();
        })
        .catch(() => {
          if (current())
            shell.panelFrame(
              '仙途履历',
              '岁月留痕 · 此世道果',
              resourceFailureContent('chronicle'),
            );
        });
      return;
    }
    shell.panelFrame(
      '仙途履历',
      '岁月留痕 · 此世道果',
      shell.chronicleSource.current.chronicleContent(shell.save),
      true,
    );
  } else if (shell.panel === 'guide' || shell.panel === 'bestiary') {
    const target = shell.panel;
    const bestiary = target === 'bestiary';
    if (!shell.guideSource.current) {
      const tab = bestiary ? shell.bestiaryStage : shell.guideTab;
      const title = bestiary ? '知妖性，方能破万劫' : '修行指南';
      const subtitle = bestiary ? '妖物志' : '道法有迹';
      let host: HTMLElement;
      const current = () =>
        host.isConnected &&
        !shell.saveLock &&
        shell.panel === target &&
        (bestiary ? shell.bestiaryStage : shell.guideTab) === tab;
      shell.panelFrame(
        title,
        subtitle,
        '<p class="panel-note" data-guide-loading role="status">正在展开…</p>',
        bestiary,
      );
      host = shell.modal.querySelector<HTMLElement>('[data-guide-loading]')!;
      void shell.guideSource
        .load()
        .then(() => {
          if (current()) shell.renderPanel();
        })
        .catch(() => {
          if (current())
            shell.panelFrame(title, subtitle, resourceFailureContent(target), bestiary);
        });
      return;
    }
    if (bestiary) {
      const view = shell.guideSource.current.bestiaryPanel(
        shell.bestiaryStage,
        shell.bestiaryDifficulty,
      );
      shell.panelFrame(view.title, view.subtitle, view.body, view.wide);
    } else {
      const { GUIDE_TABS, guideContent } = shell.guideSource.current;
      shell.panelFrame(...shell.guidePanel(shell.guideTab, !!shell.game, GUIDE_TABS, guideContent));
    }
  }
}

export function renderHud(shell: ActionShell) {
  if (shell.game) shell.battleHud.render(shell.game, shell.volumeOpen, shell.touchHintDismissed);
}

export function updateHud(shell: ActionShell) {
  if (shell.game) shell.battleHud.update(shell.game);
}

export function renderChoices(shell: ActionShell) {
  if (!shell.game) return;
  shell.modal.innerHTML = shell.upgradeChoicesModal(shell.game, shell.save);
  shell.modal.querySelector<HTMLButtonElement>('.choice-card')?.focus();
}

export function renderPause(shell: ActionShell) {
  if (!shell.game) return;

  shell.panelFrame(
    ...shell.pausePanel(shell.game, shell.save, shell.frameRate.value, shell.abandonConfirm),
  );
}

export function gameEvent(shell: ActionShell, name: string) {
  shell.gameAudio.play(name);
  if (['loot', 'cache'].includes(name)) shell.persist();
}

export function renderVictory(shell: ActionShell) {
  if (!shell.game || !shell.rewards) return;
  shell.panel = 'victory';
  shell.modal.innerHTML = shell.victoryModal(shell.game);
  shell.modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  shell.victoryTimer = shell.window.setTimeout(() => {
    if (shell.panel === 'victory') shell.renderResult();
  }, 3000);
}

export function showReviveAd(shell: ActionShell) {
  if (isExtremeLife(shell.save)) return;
  if (
    !shell.game ||
    shell.game.state !== 'lost' ||
    shell.game.revivesUsed >= shell.MAX_REVIVES ||
    shell.settled ||
    shell.panel === 'revive-ad'
  )
    return;
  shell.panel = 'revive-ad';
  shell.modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="复活广告"><div class="eyebrow">复活机缘</div>${shell.AD_PLACEHOLDER_HTML}<div class="result-actions death-actions"><button class="primary-button" data-action="ad-revive" disabled>${shell.AD_SECONDS} 秒后可复活</button><button class="secondary-button" data-action="finish-run">${shell.game.tribulation ? '放弃渡劫 · 此世落幕' : '放弃复活并结算'}</button></div></section></div>`;
  shell.startAdWatch('ad-revive', '满血复活', 'revive');
}

export function markAdWatched(shell: ActionShell, action: string, label: string) {
  if (isExtremeLife(shell.save)) return;
  shell.adWatched = true;
  shell.refreshAdCountdown(action, label); // 按钮文本切到「广告已结束 · …」并解除禁用
}

export function startAdWatch(
  shell: ActionShell,
  action: string,
  label: string,
  placement: AdPlacement,
) {
  if (isExtremeLife(shell.save)) return;
  shell.adWatched = false;
  shell.adClaimReport = null;
  const epoch = (shell.adWatchEpoch = (shell.adWatchEpoch || 0) + 1);
  const provider = shell.getAdProvider();
  if (provider.name === 'placeholder') {
    shell.startAdCountdown(action, label);
    return;
  }
  // SDK 分支与倒计时互不承认：先掐断任何遗留的 adReadyAt，避免上个面板的倒计时残留放行领取。
  shell.adReadyAt = 0;
  const adHost = shell.modal.querySelector<HTMLElement>('.revive-ad');
  if (adHost) {
    adHost.hidden = false;
    adHost.removeAttribute('style');
    adHost.textContent = '广告加载中…';
  }
  const watchPanel = shell.panel;
  // 真实广告全屏播放期间按钮保持禁用；看完回调会解锁为「广告已结束 · …」。
  const waiting = shell.modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (waiting) {
    waiting.disabled = true;
    waiting.textContent = '观看广告中…';
  }
  shell.watchAdPlacement({
    provider,
    placement,
    host: shell.modal.querySelector<HTMLElement>('.revive-ad') ?? undefined,
    onProgress: (seconds) => {
      if (!waiting) return;
      waiting.dataset.adRemaining = `${seconds} 秒后${label}`;
      waiting.textContent = waiting.dataset.adRemaining;
      waiting.disabled = true;
    },
    alive: () => shell.panel === watchPanel && shell.adWatchEpoch === epoch,
    onWatched: (onClaim) => {
      shell.adClaimReport = onClaim ?? null;
      shell.markAdWatched(action, label);
    },
    onFallback: (_reason, noInventory) => {
      const host = shell.modal.querySelector<HTMLElement>('.revive-ad');
      if (host) {
        host.hidden = false;
        host.removeAttribute('style');
        host.textContent = noInventory ? '广告位招租' : '广告加载失败';
        if (!noInventory) {
          const retry = shell.document.createElement('button');
          retry.type = 'button';
          retry.className = 'secondary-button';
          retry.textContent = '重新加载';
          retry.onclick = () => {
            if (shell.panel !== watchPanel || shell.adWatchEpoch !== epoch) return;
            shell.clearInterval(shell.adTimer);
            shell.startAdWatch(action, label, placement);
          };
          host.append(retry);
        }
      }
      shell.startAdCountdown(action, label);
    },
  });
}

export function startAdCountdown(shell: ActionShell, action: string, label: string) {
  if (isExtremeLife(shell.save)) return;
  shell.adReadyAt = Date.now() + shell.AD_DURATION_MS;
  shell.clearInterval(shell.adTimer);
  shell.adTimer = shell.window.setInterval(() => {
    if (!shell.refreshAdCountdown(action, label)) shell.clearInterval(shell.adTimer);
  }, 200);
}

export function refreshAdCountdown(shell: ActionShell, action: string, label: string) {
  const button = shell.modal.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) return 0;
  if (isExtremeLife(shell.save)) {
    button.disabled = true;
    return 0;
  }
  // 选择五行也会刷新按钮，图片尚未看完时仍须保持不可领取。
  if (shell.adReadyAt === 0 && !shell.adWatched) {
    button.disabled = true;
    button.textContent = button.dataset.adRemaining || '观看广告中…';
    return 1;
  }
  const seconds = Math.max(0, Math.ceil((shell.adReadyAt - Date.now()) / 1000));
  const incomplete =
    shell.rewardAd === 'root' &&
    shell.adElements.length !== shell.spiritRootInfo(shell.adRoot).count;
  button.disabled = seconds > 0 || incomplete;
  button.textContent =
    seconds > 0
      ? `${seconds} 秒后${label}`
      : incomplete
        ? '请选满对应数量的五行'
        : `广告已结束 · ${label}`;
  return seconds;
}

export function renderRootPicker(shell: ActionShell) {
  const container = shell.modal.querySelector('#root-picker');
  if (!container) return;
  container.innerHTML = shell.rootPickerView(shell.save, shell.adRoot, shell.adElements);
}

export function rememberRewardReturn(shell: ActionShell) {
  shell.rewardReturn = shell.rememberPanel();
}

export function showSuppliesShortage(shell: ActionShell, stones: number, iron: number) {
  if (shell.game || (shell.save.stones >= stones && shell.save.iron >= iron)) return false;
  shell.rememberRewardReturn();
  const missing = [
    stones > shell.save.stones ? `${stones - shell.save.stones} 灵石` : '',
    iron > shell.save.iron ? `${iron - shell.save.iron} 玄铁` : '',
  ]
    .filter(Boolean)
    .join('、');
  shell.panel = 'supplies-shortage';
  shell.modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="物资不足"><div class="eyebrow">修行资粮</div><h2>物资不足</h2><p>本次操作还缺 ${missing}。</p><p class="panel-note">当前持有 ${shell.save.stones} 灵石、${shell.save.iron} 玄铁。<br>${isExtremeLife(shell.save) ? '极限模式不可领取补给，请通过历练或交易积累资粮。' : `可观看 ${shell.AD_SECONDS} 秒广告，领取 ${shell.adSupplies(shell.save.unlocked).stones} 灵石与 ${shell.adSupplies(shell.save.unlocked).iron} 玄铁。领取后返回原页面，再选择要进行的操作。`}</p><div class="result-actions death-actions"><button class="primary-button" data-action="watch-supplies-ad" ${rewardDisabled(shell.save)}>看广告 · 领取物资</button><button class="secondary-button" data-action="cancel-supplies">暂不领取</button></div></section></div>`;
  shell.modal.querySelector<HTMLButtonElement>('[data-action="cancel-supplies"]')?.focus();
  return true;
}

export function showRewardAd(shell: ActionShell, kind: 'root' | 'supplies') {
  if (isExtremeLife(shell.save)) return;
  if (shell.game || shell.rewardAd) return;
  if (shell.panel !== 'supplies-shortage') shell.rememberRewardReturn();
  shell.rewardAd = kind;
  shell.adRoot = 'heaven';
  shell.adElements = shell.rootElementsFor(shell.adRoot, shell.save.rootElements);
  shell.panel = 'reward-ad';
  const reward =
    kind === 'root'
      ? '自选灵根与五行'
      : `${shell.adSupplies(shell.save.unlocked).stones} 灵石 · ${shell.adSupplies(shell.save.unlocked).iron} 玄铁`;
  shell.modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel ${kind === 'root' ? 'root-ad-panel' : ''}" role="dialog" aria-modal="true" aria-label="仙缘广告"><div class="eyebrow">${kind === 'root' ? '自选灵根' : '仙缘补给'}</div>${shell.AD_PLACEHOLDER_HTML}<p>${reward} · ${shell.AD_SECONDS} 秒</p>${kind === 'root' ? '<div id="root-picker"></div>' : ''}<div class="result-actions death-actions"><button class="primary-button" data-action="claim-ad-reward" disabled>${shell.AD_SECONDS} 秒后领取奖励</button><button class="secondary-button" data-action="cancel-reward-ad">放弃领取</button></div></section></div>`;
  if (kind === 'root') shell.renderRootPicker();
  shell.startAdWatch(
    'claim-ad-reward',
    '领取奖励',
    kind === 'root' ? 'reward-root' : 'reward-supplies',
  );
  shell.modal
    .querySelector<HTMLButtonElement>('[data-action="cancel-reward-ad"]')
    ?.focus({ preventScroll: true });
}

export function closeRewardAd(shell: ActionShell) {
  shell.adClaimReport = null;
  shell.clearInterval(shell.adTimer);
  shell.adReadyAt = 0;
  shell.rewardAd = null;
  shell.panel = '';
  shell.modal.innerHTML = '';
  if (shell.inMarket && shell.marketScene) {
    // 补给不推进年岁或换批；保留现场，避免异步重建期间丢失院落与眼前修士。
    const status = shell.document.getElementById('town-status');
    if (status) status.innerHTML = shell.townStatus(shell.save);
  } else if (shell.inMortalWorld) shell.renderMortal();
  else shell.renderLobby();
  if (shell.rewardReturn) {
    if (shell.rewardReturn.name === 'sect-dues') shell.renderSectDues();
    else if (shell.rewardReturn.name === 'town-event' && shell.townNpc)
      shell.showTownEvent(shell.townNpc);
    else shell.restorePanel(shell.rewardReturn);
    shell.rewardReturn = null;
  }
}

export function renderResult(shell: ActionShell) {
  if (!shell.game || !shell.rewards) return;
  shell.window.clearTimeout(shell.victoryTimer);
  shell.panel = '';
  shell.modal.innerHTML = shell.settlementModal(
    shell.save,
    shell.game,
    shell.rewards,
    shell.oldRealm,
  );
  shell.modal.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}

export function ensureScene(
  shell: ActionShell,
  stage: number,
  next: () => void,
  run?: Game | null,
  tribulation = false,
  combat = false,
) {
  const extra =
    run?.enemies.map((e) =>
      e.boss ? shell.STAGES[e.bossStage ?? run.stage].sprite : shell.ENEMIES[e.type].sprite,
    ) ?? [];
  const isTribulation = tribulation || !!run?.tribulation;
  const extraImages = [
    shell.window.matchMedia('(max-width: 640px)').matches
      ? shell.JOURNEY_MAP_MOBILE_IMAGE
      : shell.JOURNEY_MAP_IMAGE,
    ...(shell.save.prologueSeen ? [] : [shell.PROLOGUE_IMAGE]),
  ];
  if (
    shell.realmInfo(shell.save.cultivation, shell.save.completed.includes(shell.FINAL_TRIAL_STAGE))
      .max
  )
    extraImages.push('/assets/qinglan-prologue.webp');
  const battle = combat || !!run || isTribulation;
  if (shell.renderer.hasScene(stage, isTribulation, extra, extraImages, battle)) return true;
  if (shell.sceneLoading) return false;
  shell.sceneLoading = true;
  const loading = shell.document.createElement('div');
  loading.className = 'scene-loading';
  loading.setAttribute('role', 'dialog');
  loading.setAttribute('aria-label', '场景资源加载');
  loading.setAttribute('aria-modal', 'true');
  loading.innerHTML = `<section><div class="eyebrow">叩仙门：青岚纪</div><h2>${isTribulation ? '天劫将至' : shell.STAGES[stage].name}</h2><p>正在准备地图、人物与法宝</p><progress max="1" value="0" aria-label="素材加载进度"></progress><p class="load-progress" role="status">0%</p><button class="secondary-button" hidden>重新加载</button></section>`;
  shell.app.append(loading);
  let failed = false;
  shell.renderer
    .prepareScene(
      stage,
      isTribulation,
      extra,
      (done: number, total: number) => {
        if (failed) return;
        const progress = loading.querySelector('progress')!;
        progress.max = total;
        progress.value = done;
        loading.querySelector('.load-progress')!.textContent =
          `${Math.round((done / total) * 100)}% · ${done} / ${total} 项资源`;
      },
      extraImages,
      battle,
    )
    .then(() => {
      loading.remove();
      shell.sceneLoading = false;
      shell.assetsReady = true;
      next();
    })
    .catch(() => {
      failed = true;
      loading.innerHTML = `<section><div class="eyebrow">叩仙门：青岚纪</div><h2>${isTribulation ? '天劫将至' : shell.STAGES[stage].name}</h2>${resourceFailureContent('', '素材加载失败，请检查网络后重试。尚未进入场景。', '重新加载', false)}</section>`;
      const retry = loading.querySelector<HTMLButtonElement>('[data-resource-retry]')!;
      retry.onclick = () => {
        loading.remove();
        shell.sceneLoading = false;
        shell.ensureScene(stage, next, run, tribulation, combat);
      };
      retry.focus();
    });
  return false;
}

export function startRun(shell: ActionShell) {
  if (
    !shell.assetsReady ||
    (shell.game && !shell.settled) ||
    shell.save.pendingReincarnation ||
    shell.selectedStage > shell.save.unlocked ||
    !difficultyAllowed(shell.save, shell.difficulty)
  )
    return;
  if (shell.tribulationDue(shell.save)) {
    shell.renderTribulationPending();
    return;
  }
  if (shell.pendingRun) {
    if (isExtremeLife(shell.save)) {
      shell.restoreRun();
      return;
    }
    shell.panel = 'restart';

    shell.panelFrame(...shell.restartRunPanel());
    return;
  }
  if (!shell.ensureScene(shell.selectedStage, shell.startRun, null, false, true)) {
    return;
  }
  let entering: Game | null = null;
  if (isExtremeLife(shell.save)) {
    const next = structuredClone(shell.save);
    entering = new shell.Game(next, shell.selectedStage, shell.difficulty);
    try {
      shell.writeSave(next, entering);
    } catch {
      if (!shell.saveLock) shell.toast('尚未进入秘境，未能保存入场，请重试');
      return;
    }
    Object.assign(shell.save, next);
    entering.save = shell.save;
  }
  shell.clearInput();
  shell.panel = '';
  shell.modal.innerHTML = '';
  shell.battleHud.reset();
  shell.settled = false;
  shell.rewards = null;
  shell.abandonConfirm = false;
  shell.game = entering ?? new shell.Game(shell.save, shell.selectedStage, shell.difficulty);
  shell.frameRate.reset();
  shell.game.onEvent = shell.gameEvent;
  shell.telemetry.track({
    type: 'run-start',
    ...shell.lifeStats(),
    stage: shell.selectedStage,
    difficulty: shell.difficulty,
  });
  shell.previousState = 'playing';
  shell.oldRealm = shell.realmInfo(
    shell.save.cultivation - shell.game.creditedCultivation,
    shell.save.completed.includes(shell.FINAL_TRIAL_STAGE),
  ).name;
  shell.renderHud();
  if (shell.save.sound) shell.gameAudio.sync();
  shell.persist();
}

export function restoreRun(shell: ActionShell) {
  if (!shell.pendingRun || !shell.assetsReady) return;
  if (!shell.ensureScene(shell.pendingRun.stage, shell.restoreRun, shell.pendingRun)) {
    return;
  }
  shell.game = shell.pendingRun;
  shell.frameRate.reset();
  shell.pendingRun = null;
  shell.settled = false;
  shell.rewards = null;
  shell.abandonConfirm = false;
  shell.selectedStage = shell.game.stage;
  shell.difficulty = shell.game.difficulty;
  shell.game.onEvent = shell.gameEvent;
  shell.clearInput();
  shell.panel = '';
  shell.previousState = shell.game.state;
  shell.oldRealm = shell.realmInfo(
    shell.save.cultivation - shell.game.creditedCultivation,
    shell.save.completed.includes(shell.FINAL_TRIAL_STAGE),
  ).name;
  shell.renderHud();
  if (shell.game.state === 'upgrade') shell.renderChoices();
  else if (shell.game.state === 'lost') shell.renderDeath();
  else shell.renderPause();
  if (shell.save.sound) shell.gameAudio.sync();
  shell.persist();
}

export function returnLobby(shell: ActionShell) {
  const years =
    shell.game && shell.settled && shell.save.runs === 1 && !shell.game.tribulation
      ? shell.game.elapsedYears
      : undefined;
  shell.game = null;
  shell.panel = '';
  shell.modal.innerHTML = '';
  shell.previousState = '';
  shell.clearInput();
  shell.renderLobby(years);
}

export function beginTribulation(shell: ActionShell) {
  if (!shell.assetsReady || !shell.tribulationDue(shell.save)) return;
  if (shell.pendingRun?.tribulation) {
    shell.restoreRun();
    return;
  }
  if (!shell.ensureScene(6, shell.beginTribulation, null, true)) {
    return;
  }
  const source = shell.game && !shell.settled ? shell.game : shell.pendingRun;
  if (isExtremeLife(shell.save)) {
    const next = structuredClone(shell.save);
    next.tribulationReturn = source?.snapshot() ?? null;
    const entering = shell.Game.createTribulation(next, source);
    try {
      shell.writeSave(next, entering);
    } catch {
      if (!shell.saveLock) shell.toast('尚未迎劫，未能保存入场，请重试');
      return;
    }
    Object.assign(shell.save, next);
    entering.save = shell.save;
    shell.game = entering;
  } else {
    shell.save.tribulationReturn = source?.snapshot() ?? null;
    shell.game = shell.Game.createTribulation(shell.save, source);
  }
  shell.frameRate.reset();
  shell.pendingRun = null;
  shell.settled = false;
  shell.rewards = null;
  shell.abandonConfirm = false;
  shell.panel = '';
  shell.previousState = 'playing';
  shell.modal.innerHTML = '';
  shell.clearInput();
  shell.game.onEvent = shell.gameEvent;
  shell.telemetry.track({
    type: 'run-start',
    ...shell.lifeStats(),
    tribulation: shell.game.tribulation,
  });
  shell.renderHud();
  shell.lastFrame = shell.performance.now();
  shell.persist();
}

export function finishTribulation(shell: ActionShell) {
  if (!shell.game?.tribulation || shell.game.state !== 'won') return;
  const report = shell.damageReport(shell.game);
  if (isExtremeLife(shell.save)) {
    const next = structuredClone(shell.save);
    if (!shell.completeTribulation(next, shell.game.tribulation)) return;
    shell.resolveActivity(next);
    const original = shell.Game.restore(next, next.tribulationReturn);
    next.tribulationReturn = null;
    try {
      shell.writeSave(next, original);
    } catch {
      if (!shell.saveLock) {
        shell.panel = 'settlement-retry';
        shell.panelFrame(
          '此行未结',
          '劫后收心',
          '<p>尚未保存渡劫结果，请暂留此页重试。</p><button class="primary-button" data-action="finish-run">重试保存收获</button>',
        );
        shell.modal.querySelector('[data-action="close"]')?.remove();
      }
      return;
    }
    Object.assign(shell.save, next);
    if (original) original.save = shell.save;
    shell.telemetry.track({
      type: 'run-end',
      ...shell.lifeStats(),
      result: 'won',
      tribulation: shell.save.tribulations,
      seconds: Math.round(shell.game.time),
    });
    shell.telemetry.flush();
    shell.pendingRun = original;
    shell.game = null;
    shell.settled = false;
    shell.clearInput();
    shell.renderLobby();
    shell.panel = 'tribulation-won';
    shell.panelFrame(...shell.tribulationWonPanel(shell.save, report, !!shell.pendingRun));
    return;
  }
  if (!shell.completeTribulation(shell.save, shell.game.tribulation)) return;
  shell.telemetry.track({
    type: 'run-end',
    ...shell.lifeStats(),
    result: 'won',
    tribulation: shell.save.tribulations,
    seconds: Math.round(shell.game.time),
  });
  shell.telemetry.flush();
  shell.resolveActivity(shell.save);
  const original = shell.save.tribulationReturn;
  shell.save.tribulationReturn = null;
  shell.pendingRun = shell.Game.restore(shell.save, original);
  shell.game = null;
  shell.settled = false;
  shell.clearInput();
  shell.persist();
  shell.renderLobby();
  shell.panel = 'tribulation-won';

  shell.panelFrame(...shell.tribulationWonPanel(shell.save, report, !!shell.pendingRun));
}

export function showLifespanAd(shell: ActionShell) {
  if (isExtremeLife(shell.save)) return;
  const life = shell.lifespanInfo(shell.save);
  if (!Number.isFinite(life.base) || life.remaining > 0 || shell.panel !== 'lifespan-ended') return;
  shell.panel = 'lifespan-ad';
  shell.modal.innerHTML = `<div class="modal-backdrop"><section class="result-panel" role="dialog" aria-modal="true" aria-label="借寿广告"><div class="eyebrow">向天再借五百年</div>${shell.AD_PLACEHOLDER_HTML}<p>本次增加 ${Math.round(life.base * 0.3)} 年寿元（基础寿命的 30%）。<br>再次寿尽时可再借，年数累加；突破后保留已借寿元。</p><div class="result-actions death-actions"><button class="primary-button" data-action="claim-lifespan" disabled>${shell.AD_SECONDS} 秒后借寿</button><button class="secondary-button" data-action="cancel-lifespan">暂不借寿</button></div></section></div>`;
  shell.startAdWatch('claim-lifespan', '领取寿元', 'lifespan');
}
