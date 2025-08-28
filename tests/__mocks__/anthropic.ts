/**
 * Mock implementation of @anthropic-ai/sdk for tests
 */
import { jest } from '@jest/globals';

const mockMessage = {
  id: 'mock-message-id',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        skills: ['Python', 'Machine Learning', 'Data Science'],
        experience: '4+ years',
        matchPercentage: 92,
        analysis: 'Excellent candidate with strong AI/ML background'
      }),
    },
  ],
  model: 'claude-3-sonnet-20240229',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 150,
    output_tokens: 75,
  },
};

export class Anthropic {
  messages = {
    create: jest.fn().mockResolvedValue(mockMessage),
  };

  constructor(config?: any) {
    // Mock constructor
  }
}

export default Anthropic;