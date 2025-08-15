# Repository and Deployment Configuration

## Git Remotes
This repository has multiple remotes configured:

- **origin**: `https://github.com/puneetrinity/Evalmatch.git`
  - Main Evalmatch repository
  - Deployed to: `evalmatch.app` on Railway

- **improved**: `https://github.com/puneetrinity/improve-Evalmatch.git`
  - Improved Evalmatch repository (older remote name)
  
- **new-origin**: `https://github.com/puneetrinity/improved-EvalMatch.git`
  - Current improved Evalmatch repository
  - Deployed to: `recruitment-corner.scholavar.com` on Railway

## Deployment Instructions

### For Scholavar Recruitment Corner
When pushing changes for Scholavar recruitment corner:
```bash
git push new-origin main
```
This pushes to the `improved-EvalMatch` repository which is deployed to `recruitment-corner.scholavar.com`

### For Main Evalmatch App
When pushing changes for the main Evalmatch app:
```bash
git push origin main
```
This pushes to the main `Evalmatch` repository which is deployed to `evalmatch.app`

## Important Notes
- Both applications are deployed on Railway
- The same local codebase is used for both deployments
- Use the appropriate remote when pushing changes based on which app you want to update