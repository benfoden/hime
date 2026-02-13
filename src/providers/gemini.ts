import type { TranslationConfig, TranslationProvider } from '../types.js';

export class GeminiProvider implements TranslationProvider {
  name = 'gemini';

  async translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(config);
    
    const response = await fetch(
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
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text?.trim() || '';
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
