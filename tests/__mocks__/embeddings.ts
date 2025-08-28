export const getEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
export const calculateSimilarity = jest.fn().mockReturnValue(0.85);