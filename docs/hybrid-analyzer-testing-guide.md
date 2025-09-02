# Hybrid Analyzer Testing Guide

## Testing Abstain Flow via Public APIs

Rather than testing private methods like `validateResultFields`, test the abstain behavior through the public `analyzeMatch` method.

### Example Test Cases

```typescript
import { HybridMatchAnalyzer } from '../server/lib/hybrid-match-analyzer';

describe('Hybrid Analyzer Abstain Flow', () => {
  it('should preserve null matchPercentage when both ML and LLM fail', async () => {
    const analyzer = new HybridMatchAnalyzer();
    
    // Create mock data that would cause both providers to fail/abstain
    const mockResumeAnalysis = {
      skills: [], // Empty skills to trigger failure
      experience: [], 
      education: []
    };
    
    const mockJobAnalysis = {
      requiredSkills: ['Very specific skill that won\'t match'],
      title: 'Test Job',
      skills: []
    };
    
    const mockUserTier = { tier: 'free' };
    
    const result = await analyzer.analyzeMatch(
      mockResumeAnalysis,
      mockJobAnalysis, 
      mockUserTier,
      'minimal resume text', // Insufficient text to trigger abstain
      'minimal job text'
    );
    
    // Test abstain flow through public API
    expect(result.matchPercentage).toBeNull(); // Abstain signal preserved
    expect(result.analysisMethod).toBe('abstain');
    expect(result.confidence).toBeLessThan(0.5);
  });
});
```

### Testing Contamination Word Boundary Logic

```typescript
describe('Contamination Filtering', () => {
  it('should block single-letter skills in wrong context via public API', async () => {
    const analyzer = new HybridMatchAnalyzer();
    
    const resumeWithRLang = {
      skills: ['R'], // Single letter that should be blocked in pharma context
      // ... other fields
    };
    
    const pharmaJobAnalysis = {
      title: 'Pharmaceutical Quality Manager',
      requiredSkills: ['Quality Control', 'GMP'],
      // ... other fields  
    };
    
    const result = await analyzer.analyzeMatch(
      resumeWithRLang,
      pharmaJobAnalysis,
      { tier: 'premium' },
      'Experience with R statistical software', // Has context
      'Pharmaceutical manufacturing role requiring quality control'
    );
    
    // Verify contamination filtering worked through public API
    const hasRSkill = result.matchedSkills?.some(skill => 
      (typeof skill === 'string' ? skill : skill.skill) === 'R'
    );
    
    expect(hasRSkill).toBe(false); // Should be filtered out
  });
});
```

### Testing Configuration Integration

```typescript
describe('Configuration-Driven Behavior', () => {
  it('should respect failure threshold configuration', async () => {
    // Test that getFailureThreshold() is used instead of hardcoded 50
    // This verifies the configuration integration works through public API
    
    const analyzer = new HybridMatchAnalyzer();
    
    // Mock scenario that produces score exactly at threshold
    const result = await analyzer.analyzeMatch(
      mockLowQualityResume,
      mockHighStandardJob,
      { tier: 'premium' }
    );
    
    // Verify behavior respects configured threshold, not hardcoded value
    // Implementation details tested through observable public behavior
  });
  
  it('should respect feature flags through public API', async () => {
    // Test bias adjustment feature flag
    const result = await analyzer.analyzeMatch(
      mockBiasedResume,
      mockNeutralJob, 
      { tier: 'premium' }
    );
    
    // When bias adjustment is disabled, biasDetection should be null/minimal
    // When enabled, should show bias adjustment applied
    expect(result.biasDetection).toBeDefined();
  });
});
```

## Key Principles

1. **Public API Testing**: Always test through `analyzeMatch()` method, not private methods
2. **Observable Behavior**: Test what users/systems can observe, not implementation details
3. **Configuration Integration**: Verify feature flags and thresholds work through actual usage
4. **Abstain Signal Preservation**: Ensure `null` values are preserved through the entire pipeline
5. **Real-world Scenarios**: Use realistic test data that matches actual usage patterns

## Benefits

- Tests remain valid even if internal implementation changes
- Tests verify end-to-end behavior including configuration integration  
- Tests match how the system is actually used in production
- Easier to maintain as they don't depend on private method signatures