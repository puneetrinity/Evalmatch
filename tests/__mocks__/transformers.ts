/**
 * Mock for @xenova/transformers package
 * Prevents the actual transformers library from loading during tests
 */

export const pipeline = jest.fn().mockResolvedValue({
  encode: jest.fn().mockResolvedValue([[1, 2, 3, 4, 5]]), // Mock embeddings
  decode: jest.fn().mockResolvedValue('mock decoded text')
});

export const AutoTokenizer = {
  from_pretrained: jest.fn().mockResolvedValue({
    encode: jest.fn().mockReturnValue([1, 2, 3, 4, 5]),
    decode: jest.fn().mockReturnValue('mock text')
  })
};

export const AutoModel = {
  from_pretrained: jest.fn().mockResolvedValue({
    forward: jest.fn().mockResolvedValue({
      last_hidden_state: [[1, 2, 3, 4, 5]]
    })
  })
};

export const env = {
  backends: {
    onnx: {
      wasm: {
        wasmPaths: '/mock/path'
      }
    }
  },
  cache_dir: '/tmp/transformers_cache',
  remoteURL: 'https://mock.url',
  remotePathTemplate: 'mock/{model}'
};