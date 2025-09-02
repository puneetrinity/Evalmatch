/**
 * Mock for @xenova/transformers package
 * Prevents the actual transformers library from loading during tests
 */

export const pipeline = async () => ({
  encode: async () => [[1, 2, 3, 4, 5]], // Mock embeddings
  decode: async () => 'mock decoded text'
});

export const AutoTokenizer = {
  from_pretrained: async () => ({
    encode: () => [1, 2, 3, 4, 5],
    decode: () => 'mock text'
  })
};

export const AutoModel = {
  from_pretrained: async () => ({
    forward: async () => ({
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