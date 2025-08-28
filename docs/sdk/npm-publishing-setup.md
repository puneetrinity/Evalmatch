# NPM Publishing Setup for TypeScript SDK

This document outlines how to configure NPM publishing for the EvalMatch TypeScript SDK using GitHub Actions.

## Environment Setup

### 1. NPM Token Configuration

1. **Create NPM Access Token**:
   - Visit [npmjs.com](https://www.npmjs.com) and log in
   - Go to Account Settings → Access Tokens
   - Click "Generate New Token" → "Automation"
   - Copy the generated token (starts with `npm_`)

2. **Add NPM Token to GitHub Secrets**:
   - Go to your repository on GitHub
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your NPM token

### 2. GitHub Environment Setup

1. **Create NPM Publishing Environment**:
   - Go to Settings → Environments
   - Click "New environment"
   - Name: `npm-publishing`
   - Add required reviewers (optional for enhanced security)

2. **Environment Protection Rules** (Optional):
   - Required reviewers: Add team members who should approve releases
   - Wait timer: Set deployment delay if needed
   - Deployment branches: Restrict to `main` branch only

## CI/CD Pipeline Features

### Automated Triggers

The pipeline automatically triggers on:

- **Push to main branch** with changes in:
  - `docs/api/**` (OpenAPI spec changes)
  - `sdks/typescript/**` (SDK source changes)
  - `server/config/swagger-config.ts` (API config changes)
  - `.github/workflows/typescript-sdk-ci.yml` (CI config changes)

- **Pull requests** to main branch (testing only, no publishing)

- **Manual workflow dispatch** with option to force publish

### Automated Versioning

- **Patch version bump**: Automatically incremented when OpenAPI spec changes
- **Manual versioning**: Use Git tags for specific versions (`sdk-v1.0.0`)
- **Current version maintenance**: Manual publishes use existing version

### Multi-Node.js Testing

Tests across Node.js versions:
- Node.js 18.x (LTS)
- Node.js 20.x (LTS)
- Node.js 22.x (Current)

### Security & Quality Checks

- NPM security audit
- Dependency vulnerability scanning
- Package validation
- Bundle size reporting

## Manual Publishing

### Tag-based Releases

```bash
# Create and push a version tag
git tag sdk-v1.0.0
git push origin sdk-v1.0.0
```

### Force Manual Publish

1. Go to Actions tab in GitHub
2. Select "TypeScript SDK CI/CD" workflow
3. Click "Run workflow"
4. Check "Force publish to NPM"
5. Click "Run workflow"

## Package Configuration

The SDK is published as `@evalmatch/sdk` with:

- **Public access**: Available to all NPM users
- **Multi-format exports**: CommonJS, ESM, and TypeScript definitions
- **Tree-shaking support**: Optimized for modern bundlers
- **Node.js compatibility**: 18+ required

## Release Process

1. **Development**: Make changes to SDK or API
2. **Testing**: CI automatically tests changes
3. **Version bump**: Automatic patch increment on API changes
4. **Publishing**: Automatic NPM publish on main branch
5. **Release notes**: GitHub release created with changelog
6. **Notification**: Team notified of new release

## Monitoring

### Build Status

Monitor the CI/CD pipeline:
- GitHub Actions tab shows build status
- Email notifications for failures
- Slack integration available (optional)

### NPM Package Stats

Track package usage:
- NPM download statistics
- Version adoption rates
- Bundle size tracking

## Troubleshooting

### Common Issues

1. **NPM Token Expired**:
   - Generate new token on npmjs.com
   - Update `NPM_TOKEN` secret in GitHub

2. **Version Conflicts**:
   - Check existing versions on NPM
   - Use manual tagging for specific versions

3. **Build Failures**:
   - Check Node.js version compatibility
   - Verify TypeScript compilation
   - Review dependency conflicts

### Debug Commands

```bash
# Test SDK locally
cd sdks/typescript
npm ci
npm run build
npm run typecheck
node test-sdk.js

# Dry run publish
npm publish --dry-run

# Check package contents
npm pack && tar -tf *.tgz
```

## Security Considerations

- NPM token has automation scope only
- Environment protection prevents unauthorized releases
- Code review required for workflow changes
- Secrets are encrypted and not exposed in logs

## Next Steps

1. Configure NPM organization (optional)
2. Set up Slack notifications
3. Add integration tests
4. Create SDK documentation website
5. Set up automated security scanning