# GitHub Actions Workflows

This directory contains automated CI/CD workflows for the AI Search System project.

## Workflows

### 🔄 `ci-cd.yml` - Primary CI/CD Pipeline
**Triggers**: Push to main/develop, PRs, manual dispatch
**Purpose**: Build, test, and deploy Docker images

**Jobs**:
- **Test**: Python linting, type checking, pytest
- **Build**: Multi-architecture Docker builds for production and RunPod
- **Test-Deployment**: Validate deployments work correctly
- **Security-Scan**: Trivy vulnerability scanning
- **Deployment-Summary**: Generate deployment documentation

**Images Built**:
- `ghcr.io/puneetrinity/ubiquitous-octo-invention:latest-production`
- `ghcr.io/puneetrinity/ubiquitous-octo-invention:latest-runpod`

### 🚀 `release.yml` - Release Management
**Triggers**: Release published, manual dispatch
**Purpose**: Build and tag release images

**Features**:
- Semantic versioning
- Multi-platform builds
- Automated release notes with deployment instructions
- Latest tags for stable releases

### 🛠️ `maintenance.yml` - Automated Maintenance
**Triggers**: Weekly schedule (Sundays 2 AM UTC), manual dispatch
**Purpose**: Repository and security maintenance

**Jobs**:
- **Dependency-Audit**: Security vulnerability scanning
- **Docker-Cleanup**: Remove old container images
- **Performance-Check**: Container performance metrics
- **Repository-Health**: Code metrics and activity analysis

## Image Registry

All images are published to GitHub Container Registry:
- **Base URL**: `ghcr.io/puneetrinity/ubiquitous-octo-invention`
- **Tags**: `{version}-{environment}` (e.g., `v1.0.0-production`)

## Required Secrets

The workflows use these repository secrets:
- `GITHUB_TOKEN` - Automatically provided, used for package registry access

## Development Workflow

1. **Feature Development**:
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git push origin feature/new-feature
   # Create PR
   ```

2. **PR Process**:
   - CI/CD runs tests and builds images
   - Deployment testing validates functionality
   - Security scanning checks for vulnerabilities

3. **Release Process**:
   ```bash
   # Create and publish release on GitHub
   # Release workflow automatically builds and tags images
   ```

## Local Testing

Before pushing, test locally:
```bash
cd deploy
make test      # Run local tests
make health    # Check deployment health
make clean     # Cleanup
```

## Workflow Status

Check workflow status:
- **Actions Tab**: https://github.com/puneetrinity/ubiquitous-octo-invention/actions
- **Packages**: https://github.com/puneetrinity/ubiquitous-octo-invention/pkgs/container/ubiquitous-octo-invention

## Troubleshooting

### Common Issues:

**Build Failures**:
- Check Dockerfile paths are correct
- Verify all required files exist
- Review build logs for specific errors

**Test Failures**:
- Run tests locally: `cd deploy && make test`
- Check Python dependencies in requirements.txt
- Validate code formatting with ruff/mypy

**Deployment Issues**:
- Verify Docker Compose configurations
- Check environment variable requirements
- Test image manually: `docker run -it <image> /bin/bash`

### Debug Commands:

```bash
# Test specific workflow
gh workflow run ci-cd.yml

# View workflow logs
gh run list
gh run view <run-id> --log

# Test image locally
docker pull ghcr.io/puneetrinity/ubiquitous-octo-invention:latest-production
docker run -p 8000:8000 ghcr.io/puneetrinity/ubiquitous-octo-invention:latest-production
```