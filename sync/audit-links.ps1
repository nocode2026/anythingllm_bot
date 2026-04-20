$key=((Get-Content .env|Where-Object{$_ -match '^ANYTHINGLLM_API_KEY='}|Select-Object -First 1).Split('=')[1].Trim())
$headers=@{Authorization="Bearer $key";'Content-Type'='application/json'}
$slug='sum-student-bot'
$tests=@(
  @{q='ubezpieczenie';e='student.sum.edu.pl/ubezpieczenie-studentow-i-doktorantow/'},
  @{q='stypendium rektora';e='student.sum.edu.pl/stypendium-rektora/'},
  @{q='stypendium socjalne';e='student.sum.edu.pl/stypendium-socjalne/'},
  @{q='legitymacja studencka';e='student.sum.edu.pl/uslugi-informatyczne-dla-studentow/'},
  @{q='erasmus';e='student.sum.edu.pl/wyjazdy-studentow/'},
  @{q='praktyki studenckie';e='student.sum.edu.pl/praktyki/'},
  @{q='dom studenta';e='student.sum.edu.pl/domy-studenta/'},
  @{q='wsparcie psychologiczne';e='student.sum.edu.pl/wsparcie-psychologiczne/'},
  @{q='oplaty za studia';e='student.sum.edu.pl/oplaty-za-studia/'},
  @{q='biuro karier';e='student.sum.edu.pl/biuro-karier-sum/'}
)
$rows=@()
foreach($t in $tests){
  try {
    $body=@{message=$t.q;mode='chat'}|ConvertTo-Json
    $r=Invoke-RestMethod -Uri "http://localhost:3001/api/v1/workspace/$slug/chat" -Headers $headers -Method Post -Body $body
    $blob = ($r.textResponse + "`n" + (($r.sources|ForEach-Object{$_.text}) -join "`n")).ToLower()
    $pass = $blob.Contains($t.e.ToLower())
    $rows += [PSCustomObject]@{query=$t.q;expected=$t.e;pass=$pass;sources=$r.sources.Count}
  } catch {
    $rows += [PSCustomObject]@{query=$t.q;expected=$t.e;pass=$false;sources=0}
  }
}
$rows | Format-Table -AutoSize | Out-String
"PASS_TOTAL=" + (($rows|Where-Object {$_.pass}).Count)
"TOTAL=" + $rows.Count
