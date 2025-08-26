/**
 * Mock implementation of openai for tests
 */
import { jest } from '@jest/globals';

const mockCompletion = {
  id: 'mock-completion-id',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          skills: ['TypeScript', 'React', 'Node.js'],
          experience: '3+ years',
          matchPercentage: 78,
          analysis: 'Good candidate with solid technical background'
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 120,
    completion_tokens: 60,
    total_tokens: 180,
  },
};

export class OpenAI {
  chat = {
    completions: {
      create: jest.fn().mockResolvedValue(mockCompletion),
    },
  };

  constructor(config?: any) {
    // Mock constructor
  }
}

export default OpenAI;