// 独立子进程：只使用 pi-ai 的 provider API 和静态模型目录，不创建 coding agent。
// 无工具、项目资源发现、会话、凭据存储或扩展加载；输入走 stdin，唯一 key 只走 env。
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnalysisConfig, AnalysisInput } from './observe-types.ts';
import {
  AnalysisError,
  analysisEndpoint,
  analysisQuestions,
  analysisRecord,
  analysisRequest,
  boundedAnalysisFetch,
  parseAnalysisAnswers,
  parseAnalysisJson,
  requireAnalysis,
  responseByteLimit,
} from './observe-analysis.ts';

async function main() {
  const root = process.env.OBSERVER_PI_PACKAGE_ROOT;
  requireAnalysis(root, 'pi_missing');
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  requireAnalysis(metadata.name === '@earendil-works/pi-ai' && metadata.version === '1.5.0', 'pi');
  const load = (path: string) => import(pathToFileURL(resolve(root, 'dist', path)).href);
  const catalog = await load('providers/openai.models.js');
  const classifier = await load('api/openai-decisions.js');
  if (process.argv[2] === '--smoke') {
    const model = catalog.OPENAI_CLASSIFIER_MODELS['gpt-6-luna'];
    requireAnalysis(
      model?.type === 'classifier' &&
        model.api === 'openai-decisions' &&
        typeof classifier.classify === 'function',
      'pi',
    );
    return {
      version: metadata.version,
      model: model.id,
      type: model.type,
      api: model.api,
      tools: 0,
      sessions: 0,
      networkCalls: 0,
    };
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const bytes of process.stdin) {
    size += bytes.length;
    requireAnalysis(size <= 4 * 1024 ** 2, 'input_limit');
    chunks.push(bytes);
  }
  const request = parseAnalysisJson(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
  );
  const input = request.input as AnalysisInput;
  const config = request.config as AnalysisConfig;
  const key = process.env.OBSERVER_ANALYSIS_KEY;
  requireAnalysis(key, 'key');
  requireAnalysis(config.engine === 'pi', 'config');
  const endpoint = analysisEndpoint(config);
  const ids = input.signals.map((signal) => signal.id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let transportError: AnalysisError | undefined;
  const transport: typeof globalThis.fetch = async (resource, init) => {
    try {
      const http = new Request(resource, init);
      requireAnalysis(http.url === endpoint.href && http.method === 'POST', 'config');
      const body = await http.text();
      requireAnalysis(
        body.length <= config.maxInputChars && parseAnalysisJson(body).model === config.model,
        'input_limit',
      );
      const response = await boundedAnalysisFetch(
        globalThis.fetch,
        endpoint,
        {
          method: 'POST',
          headers: http.headers,
          body,
          signal: controller.signal,
        },
        responseByteLimit(config.maxOutputTokens),
      );
      if (config.protocol !== 'decisions') return response;
      const text = await response.text();
      const raw = parseAnalysisJson(text);
      if (raw.model !== undefined) requireAnalysis(raw.model === config.model, 'output');
      // Pi 1.5.0 内部以 Map 解析 answers，会合并重复项；先检查原始 wire 数据再交 SDK。
      parseAnalysisAnswers(raw, ids, config.maxOutputTokens);
      return new Response(text, { headers: { 'content-type': 'application/json' } });
    } catch (error) {
      transportError = error instanceof AnalysisError ? error : new AnalysisError('network');
      throw transportError;
    }
  };
  const options = {
    apiKey: key,
    fetch: transport,
    signal: controller.signal,
    timeoutMs: config.timeoutMs,
    maxRetries: 0,
  };
  try {
    if (config.protocol === 'decisions') {
      const original = catalog.OPENAI_CLASSIFIER_MODELS[config.model];
      requireAnalysis(original?.type === 'classifier' && original.api === 'openai-decisions', 'pi');
      const model = { ...original, baseUrl: config.baseUrl };
      const questions = Object.fromEntries(
        analysisQuestions(input).map((question) => [
          question.name,
          {
            type: 'bool',
            instructions: question.instructions,
            criteria: { true: '证据充分支持候选信号', false: '证据不足或存在矛盾' },
          },
        ]),
      );
      const result = await classifier.classify(model, { state: input, questions }, options);
      if (transportError) throw transportError;
      requireAnalysis(result.stopReason === 'stop' && result.model === config.model, 'pi');
      const answers = Object.entries(result.answers).map(([name, value]) => {
        const answer = analysisRecord(value);
        requireAnalysis(answer.type === 'bool', 'output');
        return { name, type: 'predicate', probability: answer.probability };
      });
      const raw = {
        answers,
        ...(result.usage
          ? {
              usage: {
                input_tokens: result.usage.input,
                output_tokens: result.usage.output,
              },
            }
          : {}),
      };
      parseAnalysisAnswers(raw, ids, config.maxOutputTokens);
      return raw;
    }

    requireAnalysis(!catalog.OPENAI_CLASSIFIER_MODELS[config.model], 'pi');
    const api = config.protocol === 'responses' ? 'openai-responses' : 'openai-completions';
    const provider = await load(`api/${api}.js`);
    const original = catalog.OPENAI_MODELS[config.model];
    const model = {
      ...(original ?? {
        id: config.model,
        name: config.model,
        provider: 'observer-compatible',
        type: 'chat',
        input: ['text'],
        reasoning: false,
        contextWindow: config.maxInputChars,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      api,
      baseUrl: config.baseUrl,
      maxTokens: config.maxOutputTokens,
    };
    const wire = analysisRequest(input, config);
    const system = config.protocol === 'responses' ? wire.instructions : wire.messages?.[0].content;
    const result = await provider
      .stream(
        model,
        {
          systemPrompt: system,
          messages: [{ role: 'user', content: JSON.stringify(input), timestamp: Date.now() }],
          tools: [],
        },
        {
          ...options,
          maxTokens: config.maxOutputTokens,
          toolChoice: 'none',
          cacheRetention: 'none',
        },
      )
      .result();
    if (transportError) throw transportError;
    requireAnalysis(
      result.stopReason === 'stop' &&
        result.model === config.model &&
        result.content.every((part: { type: string }) => part.type === 'text'),
      'output',
    );
    const raw = parseAnalysisJson(
      result.content.map((part: { text: string }) => part.text).join(''),
    );
    raw.usage = { input_tokens: result.usage.input, output_tokens: result.usage.output };
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

main()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => {
    process.stdout.write(
      JSON.stringify({ analysisError: error instanceof AnalysisError ? error.code : 'pi' }),
    );
  });
