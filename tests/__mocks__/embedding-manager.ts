export class EmbeddingManager {
  getEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  calculateSimilarity = jest.fn().mockReturnValue(0.85);
  initialize = jest.fn().mockResolvedValue(true);
}

export const embeddingManager = new EmbeddingManager();