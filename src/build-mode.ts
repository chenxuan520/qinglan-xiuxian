// 编译期常量；源码测试与 Worker 未定义时沿用联网版。单机能力不能被运行时设置或白名单开启。
declare const __QINGLAN_STANDALONE__: boolean;
export const STANDALONE = typeof __QINGLAN_STANDALONE__ !== 'undefined' && __QINGLAN_STANDALONE__;
