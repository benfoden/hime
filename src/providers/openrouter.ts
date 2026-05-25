import type { TranslationConfig, TranslationProvider } from '../types.js';
import { buildSystemPrompt } from './prompt.js';
import { classifyError } from '../errors.js';
import { stripWrappers } from '../output.js';

export class OpenRouterProvider implements TranslationProvider {
  name = 'openrouter';

  async translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<string> {
    const systemPrompt = buildSystemPrompt(config);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      let response: Response;
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/benfoden/hime',
            'X-Title': 'hime',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        const c = classifyError('openrouter', err);
        const e = new Error(c.message);
        (e as any).kind = c.kind;
        throw e;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const bodyMessage = (body as any)?.error?.message;
        const c = classifyError('openrouter', null, { status: response.status, bodyMessage });
        const e = new Error(c.message);
        (e as any).kind = c.kind;
        (e as any).status = c.status;
        throw e;
      }

      const data = await response.json();
      return stripWrappers(data.choices[0]?.message?.content || '');
    } finally {
      clearTimeout(timeout);
    }
  }
}
