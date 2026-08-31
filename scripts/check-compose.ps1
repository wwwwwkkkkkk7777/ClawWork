$composeFile = "infra/compose/docker-compose.yml"
if (-not (Test-Path $composeFile)) {
  throw "missing compose file"
}
docker compose -f $composeFile config | Out-Null
docker compose -f $composeFile -f "infra/compose/docker-compose.demo.yml" config | Out-Null
docker compose --env-file "infra/compose/.env.production.example" -f "infra/compose/docker-compose.production.yml" config | Out-Null
