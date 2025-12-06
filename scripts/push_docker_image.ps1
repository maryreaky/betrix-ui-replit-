# Push Docker image to Docker Hub
# Usage:
# - Ensure you're logged in: docker login
# - Update image name if necessary
# .\scripts\push_docker_image.ps1

$Image = 'adminoroo/betrix-ui-new:latest'
Write-Host "Building $Image"
docker build -t $Image .

Write-Host "Pushing $Image"
docker push $Image

Write-Host "Done."