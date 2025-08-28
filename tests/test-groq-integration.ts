/**
 * Test script to validate Groq integration
 * This script tests the Groq provider functionality
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Set up environment variables for testing
process.env.NODE_ENV = 'development';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';

// Mock logger to prevent console output during tests
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

// Simple test runner
class TestRunner {
  private tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void> | void) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running Groq Integration Tests\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${(error as Error).message}\n`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

async function runTests() {
  const runner = new TestRunner();

  // Test 1: Module imports
  runner.test('Groq module imports correctly', async () => {
    const groq = await import(`${projectRoot}/server/lib/groq.js`);
    if (!groq.getGroqServiceStatus) {
      throw new Error('getGroqServiceStatus function not exported');
    }
    if (!groq.analyzeResume) {
      throw new Error('analyzeResume function not exported');
    }
  });

  // Test 2: Service status check
  runner.test('Groq service status returns expected structure', async () => {
    const groq = await import(`${projectRoot}/server/lib/groq.js`);
    const status = groq.getGroqServiceStatus();
    
    if (!status.hasOwnProperty('isAvailable')) {
      throw new Error('Status missing isAvailable property');
    }
    if (!status.hasOwnProperty('provider')) {
      throw new Error('Status missing provider property');
    }
    if (status.provider !== 'Groq') {
      throw new Error(`Expected provider 'Groq', got '${status.provider}'`);
    }
  });

  // Test 3: AI Provider includes Groq
  runner.test('AI Provider includes Groq in status', async () => {
    const aiProvider = await import(`${projectRoot}/server/lib/ai-provider.js`);
    const status = aiProvider.getAIServiceStatus();
    
    if (!status.providers.groq) {
      throw new Error('AI Provider status missing groq provider');
    }
    if (!status.providers.groq.isPrimary) {
      throw new Error('Groq should be marked as primary provider');
    }
  });

  // Test 4: Model configuration
  runner.test('Groq models are properly configured', async () => {
    const groq = await import(`${projectRoot}/server/lib/groq.js`);
    const status = groq.getGroqServiceStatus();
    
    if (!status.models || !Array.isArray(status.models)) {
      throw new Error('Models not properly configured');
    }
    if (status.models.length === 0) {
      throw new Error('No models configured');
    }
  });

  // Test 5: Usage tracking
  runner.test('Usage tracking functions exist', async () => {
    const groq = await import(`${projectRoot}/server/lib/groq.js`);
    
    if (!groq.getGroqUsage) {
      throw new Error('getGroqUsage function not exported');
    }
    if (!groq.resetGroqUsage) {
      throw new Error('resetGroqUsage function not exported');
    }
    
    const usage = groq.getGroqUsage();
    if (!usage.hasOwnProperty('totalTokens')) {
      throw new Error('Usage tracking missing totalTokens');
    }
  });

  const success = await runner.run();
  process.exit(success ? 0 : 1);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { runTests };