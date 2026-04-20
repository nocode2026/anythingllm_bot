$envPath = 'C:\Projekty\AnythingLLM\.env'
$line = Get-Content $envPath | Where-Object { $_ -match '^ANYTHINGLLM_API_KEY=' } | Select-Object -First 1
if (-not $line) { throw 'Brak ANYTHINGLLM_API_KEY w .env' }
$key = ($line -split '=', 2)[1].Trim()

$headers = @{ Authorization = "Bearer $key" }
$ws = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/workspace/sum-student-bot' -Headers $headers -Method Get
$prompt = $ws.workspace.openAiPrompt

if ($prompt -notmatch 'Mozesz tez zapytac:') {
  $prompt += @'

Dodatkowa zasada odpowiedzi:
- Na koncu kazdej odpowiedzi dodaj sekcje "Mozesz tez zapytac:" z 2-3 krotkimi pytaniami poglebiajacymi ten sam temat.
- Pytania sugerowane maja byc praktyczne, konkretne, bez powtorzenia pytania uzytkownika i bez mieszania tematow.
'@
}

$body = @{
  openAiPrompt = $prompt
  similarityThreshold = $ws.workspace.similarityThreshold
  topN = $ws.workspace.topN
  chatModel = $ws.workspace.chatModel
  chatProvider = $ws.workspace.chatProvider
  openAiTemp = $ws.workspace.openAiTemp
  queryRefusalResponse = $ws.workspace.queryRefusalResponse
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/workspace/sum-student-bot/update' `
  -Headers @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' } `
  -Method Post -Body $body | Out-Null

$check = Invoke-RestMethod -Uri 'http://localhost:3001/api/v1/workspace/sum-student-bot' -Headers $headers -Method Get
if ($check.workspace.openAiPrompt -match 'Mozesz tez zapytac:') {
  Write-Output 'PROMPT_SUGGESTIONS=ENABLED'
} else {
  Write-Output 'PROMPT_SUGGESTIONS=MISSING'
}
