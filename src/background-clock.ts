// 后台标签页停止绘制时，继续驱动 AI 模拟；主线程只在 AI 开启时消费心跳。
setInterval(() => postMessage(null), 100);
