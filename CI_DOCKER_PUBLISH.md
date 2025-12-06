# CI Docker Publish

This repository includes a GitHub Actions workflow that can build and publish the Docker image.

Required repository secrets (set these in GitHub Settings → Secrets → Actions):

- `DOCKERHUB_USERNAME` — Docker Hub username
- `DOCKERHUB_TOKEN` — Docker Hub access token (or password)

How to push locally (POSIX):

```bash
DOCKERHUB_USERNAME=you DOCKERHUB_TOKEN=yourtoken ./scripts/push_docker_image.sh
```

How to push locally (PowerShell):

```powershell
# Ensure you are logged in or use docker login
.\scripts\push_docker_image.ps1
```

CI notes:
- The workflow in `.github/workflows/ci.yml` will only push when secrets are available and the push job is enabled.
- Keep credentials in GitHub Secrets; do not commit tokens in the repo.
