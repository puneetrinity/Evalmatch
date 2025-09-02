# Hybrid Analyzer Environment Variables Reference

## 🔧 Core Configuration Variables

### Thresholds
```bash
# Failure threshold for ML/LLM analysis (replaces hardcoded ≤50)
HYBRID_FAILURE_THRESHOLD=50              # Default: 50, scores ≤ this trigger fallback

# Weight caps for ensemble blending  
HYBRID_ML_WEIGHT_CAP=0.4                 # Default: 0.4 (40% max ML weight)
HYBRID_LLM_WEIGHT_CAP=0.8                # Default: 0.8 (80% max LLM weight)

# Bias adjustment configuration
HYBRID_BIAS_LIMIT=0.1                    # Default: 0.1 (10% max penalty)
HYBRID_CONFIDENCE_FLOOR=0.75             # Default: 0.75 (aligned with CONFIDENCE_THRESHOLDS)
```

### Feature Flags
```bash
# Core feature toggles (all default to safe values)
HYBRID_BIAS_ADJUSTMENT=false             # Default: false (new feature, opt-in)
HYBRID_CONTAMINATION_FILTERING=true      # Default: true (existing behavior)  
HYBRID_TELEMETRY=false                   # Default: false (enable for monitoring)
```

## 🧪 A/B Testing & Experiments

### Hybrid Analyzer Threshold Experiments
```bash
# Main threshold experiment toggle
EXPERIMENT_HYBRID_ANALYZER_THRESHOLDS=false    # Default: false
EXPERIMENT_HYBRID_ANALYZER_RATE=0.1            # Default: 0.1 (10% participation)
EXPERIMENT_HYBRID_ANALYZER_VARIANT=control     # Options: control | experimental
```

### ESCO Contamination V2 Experiments  
```bash
# ESCO contamination improvement experiment
EXPERIMENT_ESCO_CONTAMINATION_V2=false         # Default: false
EXPERIMENT_ESCO_CONTAMINATION_RATE=0.1         # Default: 0.1 (10% participation)  
EXPERIMENT_ESCO_CONTAMINATION_VARIANT=current  # Options: current | wordBoundary
```

## 📊 Configuration by Environment

### Development Environment
```bash
# Safe defaults for development
HYBRID_TELEMETRY=true                    # Enable for testing
HYBRID_BIAS_ADJUSTMENT=false
HYBRID_CONTAMINATION_FILTERING=true
HYBRID_FAILURE_THRESHOLD=50
HYBRID_ML_WEIGHT_CAP=0.4
HYBRID_LLM_WEIGHT_CAP=0.8
HYBRID_CONFIDENCE_FLOOR=0.75

# A/B testing disabled in development
EXPERIMENT_HYBRID_ANALYZER_THRESHOLDS=false
EXPERIMENT_ESCO_CONTAMINATION_V2=false
```

### Staging Environment
```bash
# Enable features for testing
HYBRID_TELEMETRY=true
HYBRID_BIAS_ADJUSTMENT=true              # Test bias adjustment
HYBRID_CONTAMINATION_FILTERING=true
HYBRID_FAILURE_THRESHOLD=50
HYBRID_ML_WEIGHT_CAP=0.4
HYBRID_LLM_WEIGHT_CAP=0.8
HYBRID_CONFIDENCE_FLOOR=0.75

# Enable A/B testing at high rate for validation
EXPERIMENT_HYBRID_ANALYZER_THRESHOLDS=true
EXPERIMENT_HYBRID_ANALYZER_RATE=0.5      # 50% for thorough testing
EXPERIMENT_ESCO_CONTAMINATION_V2=true
EXPERIMENT_ESCO_CONTAMINATION_RATE=0.5
```

### Production Environment (Phase 1 - Telemetry)
```bash
# Telemetry-first rollout
HYBRID_TELEMETRY=true                    # ENABLE FIRST
HYBRID_BIAS_ADJUSTMENT=false             # Keep disabled initially
HYBRID_CONTAMINATION_FILTERING=true     # Existing behavior
HYBRID_FAILURE_THRESHOLD=50             # Existing behavior
HYBRID_ML_WEIGHT_CAP=0.4               # Existing behavior
HYBRID_LLM_WEIGHT_CAP=0.8              # Existing behavior
HYBRID_CONFIDENCE_FLOOR=0.75           # Aligned threshold

# A/B testing disabled initially
EXPERIMENT_HYBRID_ANALYZER_THRESHOLDS=false
EXPERIMENT_ESCO_CONTAMINATION_V2=false
```

### Production Environment (Full Rollout)
```bash
# All features enabled after successful gradual rollout
HYBRID_TELEMETRY=true
HYBRID_BIAS_ADJUSTMENT=true              # Enabled after testing
HYBRID_CONTAMINATION_FILTERING=true
HYBRID_FAILURE_THRESHOLD=45              # May be optimized based on A/B results
HYBRID_ML_WEIGHT_CAP=0.4
HYBRID_LLM_WEIGHT_CAP=0.8
HYBRID_CONFIDENCE_FLOOR=0.75

# A/B testing may be disabled after full rollout
EXPERIMENT_HYBRID_ANALYZER_THRESHOLDS=false
EXPERIMENT_ESCO_CONTAMINATION_V2=false
```

## 🛠️ Helper Functions Available

### Configuration Access
```typescript
// Centralized threshold access (replaces hardcoded values)
getFailureThreshold()      // Returns HYBRID_FAILURE_THRESHOLD
getMLWeightCap()          // Returns HYBRID_ML_WEIGHT_CAP  
getLLMWeightCap()         // Returns HYBRID_LLM_WEIGHT_CAP
getBiasAdjustmentLimit()  // Returns HYBRID_BIAS_LIMIT
getConfidenceFloor()      // Returns min(HYBRID_CONFIDENCE_FLOOR, CONFIDENCE_THRESHOLDS.MINIMUM_VIABLE)
```

### Feature Flag Access
```typescript
// Feature flag helpers
isBiasAdjustmentEnabled()         // Returns HYBRID_BIAS_ADJUSTMENT
isContaminationFilteringEnabled() // Returns HYBRID_CONTAMINATION_FILTERING
isTelemetryEnabled()              // Returns HYBRID_TELEMETRY
```

### A/B Testing Helpers
```typescript
// Experiment participation and variant assignment
shouldParticipateInExperiment(experimentName, userId)  // Deterministic user assignment
getExperimentVariant(experimentName, userId)           // Get user's variant
isHybridAnalyzerThresholdExperimentEnabled()          // Check if experiment is active
isEscoContaminationV2ExperimentEnabled()              // Check if ESCO experiment is active
```

## 🔍 Validation Notes

- All thresholds are validated at startup
- Invalid values fall back to safe defaults
- Configuration changes require application restart
- Telemetry data includes current configuration values for debugging
- A/B testing uses deterministic hashing for consistent user experience

## 🚨 Important Defaults

- **All new features default to `false`** (opt-in for safety)
- **Existing behavior preserved** (contamination filtering stays `true`)
- **A/B testing starts at 10%** participation for gradual validation
- **Telemetry should be enabled first** before any feature rollouts