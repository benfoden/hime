import type { TranslationConfig, TranslationProvider, TranslationResult } from '../types.js';
import { buildSystemPrompt, buildPredictionPrompt } from './prompt.js';
import { classifyError } from '../errors.js';
import { stripWrappers } from '../output.js';

export class GeminiProvider implements TranslationProvider {
  name = 'gemini';

  async predict(text: string, apiKey: string, model: string): Promise<TranslationResult> {
    const systemPrompt = buildPredictionPrompt();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text }],
                },
              ],
              systemInstruction: {
                parts: [{ text: systemPrompt }],
              },
              generationConfig: { maxOutputTokens: 8, stopSequences: ['\n', '。', '！', '？'] },
            }),
            signal: controller.signal,
          }
        );
      } catch (err) {
        const c = classifyError('gemini', err);
        const e = new Error(c.message);
        (e as any).kind = c.kind;
        throw e;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const bodyMessage = (body as any)?.error?.message;
        const c = classifyError('gemini', null, { status: response.status, bodyMessage });
        const e = new Error(c.message);
        (e as any).kind = c.kind;
        (e as any).status = c.status;
        throw e;
      }

      const data = await response.json();
      const meta = data.usageMetadata;
      const usage = meta ? {
        inputTokens: meta.promptTokenCount ?? 0,
        outputTokens: meta.candidatesTokenCount ?? 0,
      } : undefined;
      return { text: stripWrappers(data.candidates[0]?.content?.parts[0]?.text || ''), usage };
    } finally {
      clearTimeout(timeout);
    }
  }

  async translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<TranslationResult> {
    const systemPrompt = buildSystemPrompt(config);

    const controller = new AbortController();
    // 60s: a full-page / image-overlay batch is up to ~4000 chars in one call and
    // routinely exceeds 10s on free-tier models. The old 10s cap self-aborted every
    // page chunk ("The user aborted a request") while compose-sized calls finished
    // fine (T-16 verify defect). Ceiling only — fast calls still return immediately.
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text }],
                },
              ],
              systemInstruction: {
                parts: [{ text: systemPrompt }],
              },
            }),
            signal: controller.signal,
          }
        );
      } catch (err) {
        const c = classifyError('gemini', err);
        const e = new Error(c.message);
        (e as any).kind = c.kind;
        throw e;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const bodyMessage = (body as any)?.error?.message;
        const c = classifyError('gemini', null, { status: response.status, bodyMessage });
        const e = new Error(c.message);
        (e as any).kind = c.kind;
        (e as any).status = c.status;
        throw e;
      }

      const data = await response.json();
      const meta = data.usageMetadata;
      const usage = meta ? {
        inputTokens: meta.promptTokenCount ?? 0,
        outputTokens: meta.candidatesTokenCount ?? 0,
      } : undefined;
      return { text: stripWrappers(data.candidates[0]?.content?.parts[0]?.text || ''), usage };
    } finally {
      clearTimeout(timeout);
    }
  }
}
