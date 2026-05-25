import type { TranslationConfig, TranslationProvider } from '../types.js';
import { buildSystemPrompt } from './prompt.js';
import { classifyError } from '../errors.js';
import { stripWrappers } from '../output.js';

export class GeminiProvider implements TranslationProvider {
  name = 'gemini';

  async translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<string> {
    const systemPrompt = buildSystemPrompt(config);

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
      return stripWrappers(data.candidates[0]?.content?.parts[0]?.text || '');
    } finally {
      clearTimeout(timeout);
    }
  }
}
