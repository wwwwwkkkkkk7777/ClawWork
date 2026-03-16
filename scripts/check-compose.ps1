$composeFile = "infra/compose/docker-compose.yml"
if (-not (Test-Path $composeFile)) {
  throw "missing compose file"
}
docker compose -f $composeFile config | Out-Null
