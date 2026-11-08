// 构建产物中的 git describe 版本号；直接运行源码（测试）时回退为开发版。
declare const __QINGLAN_VERSION__: string | undefined;
export const GAME_VERSION: string =
  typeof __QINGLAN_VERSION__ !== 'undefined' && __QINGLAN_VERSION__ ? __QINGLAN_VERSION__ : 'dev';
