import test from 'node:test';
import assert from 'node:assert/strict';
import { closeRewardAd, renderPanel, restorePanel } from '../src/scene-flow.ts';
import type { ActionShell } from '../src/action-controller.ts';
import type { PanelLocation } from '../src/panel-host.ts';
import { freshSave } from '../src/progress.ts';

test('坊中补给返回保留现场、重开正确入口并交还滚动与展开记录', () => {
  for (const name of ['market-venue', 'sect-market-event']) {
    const save = freshSave();
    const npc = { id: 'market-alchemist' };
    const scene = { nearVenue: { id: 'forum' }, nearbyNpc: npc };
    const location: PanelLocation = {
      name,
      scroll: 420,
      action: 'sect-market-debate-pay',
      id: npc.id,
      openDetails: ['market-debate'],
    };
    const status = { innerHTML: '' };
    const calls: string[] = [];
    let restored: PanelLocation | undefined;
    const shell = {
      save,
      panel: 'reward-ad',
      rewardAd: 'supplies',
      adReadyAt: 123,
      adTimer: 42,
      rewardReturn: location,
      inMortalWorld: true,
      inMarket: true,
      marketScene: scene,
      marketNpc: npc,
      modal: { innerHTML: '广告' },
      clearInterval: (id: number) => assert.equal(id, 42),
      document: { getElementById: (id: string) => (id === 'town-status' ? status : null) },
      townStatus: () => '补给后的物资',
      renderMortal: () => {
        throw Error('不应销毁并异步重建坊市场景');
      },
      renderLobby: () => {
        throw Error('不应离开坊市');
      },
      showMarketEvent: (actual: unknown) => {
        assert.equal(actual, npc);
        calls.push('npc');
      },
      marketEventSource: {
        current: {
          renderVenue: (_shell: unknown, id: string) => {
            assert.equal(id, 'forum');
            calls.push('forum');
          },
        },
      },
      panelHost: {
        restore: (actual: PanelLocation, render: () => void) => {
          restored = actual;
          render();
        },
      },
    } as unknown as ActionShell;
    Object.assign(shell, {
      renderPanel: () => renderPanel(shell),
      restorePanel: (actual: PanelLocation) => restorePanel(shell, actual),
    });
    closeRewardAd(shell);
    assert.equal(shell.marketScene, scene);
    assert.equal(shell.marketNpc, npc);
    assert.equal(shell.panel, name);
    assert.equal(status.innerHTML, '补给后的物资');
    assert.equal(shell.adReadyAt, 0);
    assert.equal(shell.rewardAd, null);
    assert.equal(shell.rewardReturn, null);
    assert.equal(restored, location);
    assert.deepEqual(calls, [name === 'market-venue' ? 'forum' : 'npc']);
  }
});

test('场景外补给返回仍刷新原首页或人间页', () => {
  for (const inMortalWorld of [false, true]) {
    const calls: string[] = [];
    const shell = {
      inMarket: false,
      inMortalWorld,
      rewardReturn: null,
      modal: { innerHTML: '广告' },
      clearInterval: () => {},
      renderMortal: () => calls.push('mortal'),
      renderLobby: () => calls.push('lobby'),
    } as unknown as ActionShell;
    closeRewardAd(shell);
    assert.deepEqual(calls, [inMortalWorld ? 'mortal' : 'lobby']);
    assert.equal(shell.panel, '');
    assert.equal(shell.modal.innerHTML, '');
  }
});
