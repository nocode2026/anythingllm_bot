# Push Faculty Segmentation to GitHub
# Usage: .\PUSH_TO_GITHUB.ps1 -RepositoryUrl "https://github.com/user/repo.git" -Branch "main"

param(
    [Parameter(Mandatory=$true)]
    [string]$RepositoryUrl,
    
    [Parameter(Mandatory=$false)]
    [string]$Branch = "master",
    
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = "faculty-segmentation: dziekanaty context detection"
)

Set-Location "c:\Projekty\AnythingLLM"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Git Push to GitHub - Faculty Segmentation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify commit exists
Write-Host "Step 1: Verifying commit..." -ForegroundColor Yellow
$commit = git log --oneline -1
Write-Host "Current commit: $commit" -ForegroundColor Green
Write-Host ""

# Step 2: Add remote
Write-Host "Step 2: Adding GitHub remote..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin $RepositoryUrl
$remoteCheck = git remote -v
Write-Host "Remote added:" -ForegroundColor Green
Write-Host $remoteCheck
Write-Host ""

# Step 3: Configure branch
Write-Host "Step 3: Setting up branch tracking..." -ForegroundColor Yellow
git branch -M $Branch
Write-Host "Branch: $Branch" -ForegroundColor Green
Write-Host ""

# Step 4: Push to GitHub
Write-Host "Step 4: Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "Pushing to: $RepositoryUrl ($Branch)" -ForegroundColor Cyan
Write-Host ""

try {
    git push -u origin $Branch
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✅ SUCCESS - Code pushed to GitHub!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Repository: $RepositoryUrl" -ForegroundColor Green
        Write-Host "Branch: $Branch" -ForegroundColor Green
        Write-Host "Commit: $(git rev-parse --short HEAD)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Review changes on GitHub" -ForegroundColor White
        Write-Host "2. Create Pull Request if needed" -ForegroundColor White
        Write-Host "3. Run Vercel deployment" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "❌ Push failed (exit code: $exitCode)" -ForegroundColor Red
        Write-Host "Please check your GitHub credentials and try again" -ForegroundColor Red
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error during push: $_" -ForegroundColor Red
    exit 1
}
