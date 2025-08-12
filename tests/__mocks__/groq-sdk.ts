/**
 * Mock implementation of groq-sdk for tests
 */
import { jest } from '@jest/globals';

const mockCompletion = {
  id: 'mock-completion-id',
  object: 'chat.completion',
  created: Date.now(),
  model: 'llama-3.1-70b-versatile',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          skills: ['JavaScript', 'React', 'Node.js'],
          experience: '5+ years',
          matchPercentage: 85,
          analysis: 'Strong candidate with relevant experience'
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  },
};

export class Groq {
  chat = {
    completions: {
      create: jest.fn().mockResolvedValue(mockCompletion),
    },
  };

  constructor(config?: any) {
    // Mock constructor
  }
}

export default Groq;