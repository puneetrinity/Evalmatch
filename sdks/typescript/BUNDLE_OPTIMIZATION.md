# Bundle Optimization Guide

## 📦 Multi-Format Builds

The EvalMatch SDK is optimized for minimal bundle size while maintaining maximum compatibility:

### Available Formats
- **ESM** (`dist/index.mjs`) - Modern ES modules with tree-shaking
- **CJS** (`dist/index.cjs`) - CommonJS for Node.js compatibility  
- **IIFE** (`dist/index.global.js`) - Standalone browser script

### Bundle Sizes (Target: <50KB)
- Core Client: ~25KB
- Auth Provider: ~15KB  
- Full SDK: ~40KB (ESM), ~45KB (CJS), ~50KB (IIFE)

## 🌳 Tree-Shaking Enabled

Import only what you need:

```typescript
// Import everything (not recommended)
import * as EvalMatch from '@evalmatch/sdk'

// Import specific modules (recommended)
import { EvalMatchClient } from '@evalmatch/sdk'
import { FirebaseAuthProvider } from '@evalmatch/sdk'
```

## 🔗 External Dependencies

Large dependencies are externalized to keep bundle size small:

### Required Peer Dependencies
```bash
npm install firebase axios
```

### Why External?
- **Firebase**: ~300KB (often already used by apps)
- **Axios**: ~50KB (common HTTP client)
- **Result**: SDK bundle stays <50KB instead of >400KB

## 🎯 Size Monitoring

### Commands
```bash
# Build and check sizes
npm run build:analyze

# View bundle composition
npm run bundle-analyzer

# Size limit check (CI)
npm run size-limit
```

### Size Limits
- ESM Bundle: 40KB limit
- CJS Bundle: 45KB limit
- Browser Bundle: 50KB limit
- Core Client Only: 25KB limit
- Auth Provider Only: 15KB limit

## 🚀 Performance Features

### Build Optimizations
- **Minification**: Code compressed for production
- **Tree-shaking**: Dead code elimination
- **Code splitting**: Separate chunks for optimal loading
- **Source maps**: Debug-friendly builds

### Runtime Optimizations  
- **sideEffects: false** - Enables aggressive tree-shaking
- **ES2020 target** - Modern JavaScript output
- **Mangled properties** - Smaller private property names

## 📊 Bundle Analysis

After building, check bundle composition:

1. Run `npm run bundle-analyzer`
2. Interactive visualization opens in browser
3. Identify largest modules and optimize

## 🔧 Development Workflow

```bash
# Development with hot reload
npm run dev

# Production build
npm run build

# Size check before publishing
npm run prepublishOnly
```

## ⚙️ Configuration Files

- `tsup.config.ts` - Build configuration
- `.size-limit.json` - Bundle size enforcement
- `package.json` - Multi-format exports and peer deps

## 🎛️ Advanced Usage

### Custom Builds
```bash
# Development build (unminified)
npx tsup --no-minify

# Analyze specific format
npx tsup --format esm --metafile

# Bundle with specific externals
npx tsup --external firebase,axios
```

### Size Debugging
```bash
# Check what's using space
npm run size-limit --why

# Detailed bundle report  
npm run bundle-analyzer --detailed
```

This optimization setup ensures your SDK stays lightweight while providing maximum functionality.