import type { TranslationConfig, TranslationProvider } from '../types.js';

export class OpenAIProvider implements TranslationProvider {
  name = 'openai';

  async translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(config);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
  }

  private buildSystemPrompt(config: TranslationConfig): string {
    const formalityInstruction = this.getFormalityInstruction(config.formality);
    return `You are a translation engine. Translate the following text to ${config.targetLanguage}.
Output ONLY the translated text — no explanations, no quotes, no markdown.
Use natural, native-sounding phrasing that a native speaker would actually use.
${formalityInstruction}
${config.customPrompt || ''}`.trim();
  }

  private getFormalityInstruction(formality: string): string {
    switch (formality) {
      case 'casual':
        return 'Use casual, informal language (e.g. for Japanese: タメ口、plain form).';
      case 'polite':
        return 'Use polite, standard language (e.g. for Japanese: です/ます form).';
      case 'formal':
        return 'Use formal, respectful language (e.g. for Japanese: 敬語/keigo).';
      case 'auto':
      default:
        return 'Match the formality level to the tone of the input. Casual, informal input → casual output. Professional, formal input → polite/formal output.';
    }
  }
}
