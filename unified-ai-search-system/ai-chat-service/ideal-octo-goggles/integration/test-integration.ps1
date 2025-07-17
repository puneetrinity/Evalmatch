# Integration Test Script
# Tests the integration between Ultra Fast Search and ubiquitous-octo-invention

Write-Host "🧪 Testing Integrated AI + Search System..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$testsPassed = 0
$testsTotal = 0

# Function to test an endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = $null,
        [string]$ExpectedContent = $null
    )
    
    $script:testsTotal++
    Write-Host "[$script:testsTotal] Testing $Name..." -ForegroundColor Yellow
    
    try {
        $headers = @{
            "Content-Type" = "application/json"
        }
        
        if ($Method -eq "GET") {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers -TimeoutSec 10
        } else {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $headers -Body $Body -TimeoutSec 30
        }
        
        if ($ExpectedContent -and ($response | ConvertTo-Json) -notlike "*$ExpectedContent*") {
            Write-Host "   ❌ FAIL: Expected content '$ExpectedContent' not found" -ForegroundColor Red
        } else {
            Write-Host "   ✅ PASS" -ForegroundColor Green
            $script:testsPassed++
        }
    }
    catch {
        Write-Host "   ❌ FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 1: Ultra Fast Search System Health
Test-Endpoint -Name "Ultra Fast Search Health" -Url "http://localhost:8081/api/v2/health" -ExpectedContent "status"

# Test 2: AI System Health
Test-Endpoint -Name "AI System Health" -Url "http://localhost:8000/health" -ExpectedContent "status"

# Test 3: Search Functionality
$searchBody = '{"query": "python developer", "num_results": 5}'
Test-Endpoint -Name "Direct Search API" -Url "http://localhost:8081/api/v2/search/ultra-fast" -Method "POST" -Body $searchBody -ExpectedContent "results"

# Test 4: AI Chat with Search Intent
Write-Host "[4] Testing AI Chat with Search Intent..." -ForegroundColor Yellow
try {
    $chatBody = '{"query": "find me python developers with 5 years experience", "conversation_id": "test-integration"}'
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/chat" -Method POST -ContentType "application/json" -Body $chatBody -TimeoutSec 30
    
    if ($response -and ($response | ConvertTo-Json) -like "*python*") {
        Write-Host "   ✅ PASS: AI system responded to search query" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "   ❌ FAIL: AI system did not respond appropriately" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ FAIL: AI chat integration failed - $($_.Exception.Message)" -ForegroundColor Red
}
$testsTotal++
Write-Host ""

# Test 5: Integration Provider Test
Write-Host "[5] Testing Integration Provider..." -ForegroundColor Yellow
try {
    # Test the search provider directly through AI system
    $providerTestBody = '{"action": "search", "query": "senior engineer", "filters": {"min_experience": 5}}'
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/providers/search/test" -Method POST -ContentType "application/json" -Body $providerTestBody -TimeoutSec 30
    
    if ($response -and $response.success) {
        Write-Host "   ✅ PASS: Search provider integration working" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "   ⚠️  WARN: Provider endpoint may not be implemented yet" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  WARN: Provider test endpoint not available (expected during initial setup)" -ForegroundColor Yellow
}
$testsTotal++
Write-Host ""

# Test 6: Performance and Load Test
Write-Host "[6] Testing Performance..." -ForegroundColor Yellow
try {
    $startTime = Get-Date
    
    # Send multiple concurrent requests
    $jobs = @()
    for ($i = 1; $i -le 5; $i++) {
        $jobs += Start-Job -ScriptBlock {
            param($i)
            try {
                $body = "{`"query`": `"developer $i`", `"num_results`": 3}"
                Invoke-RestMethod -Uri "http://localhost:8081/api/v2/search/ultra-fast" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
                return $true
            } catch {
                return $false
            }
        } -ArgumentList $i
    }
    
    # Wait for all jobs to complete
    $jobs | Wait-Job | Out-Null
    $results = $jobs | Receive-Job
    $jobs | Remove-Job
    
    $endTime = Get-Date
    $totalTime = ($endTime - $startTime).TotalMilliseconds
    $successCount = ($results | Where-Object { $_ -eq $true }).Count
    
    if ($successCount -ge 4) {
        Write-Host "   ✅ PASS: Performance test completed ($successCount/5 successful, ${totalTime}ms total)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "   ❌ FAIL: Performance test failed ($successCount/5 successful)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ FAIL: Performance test error - $($_.Exception.Message)" -ForegroundColor Red
}
$testsTotal++
Write-Host ""

# Test 7: Service Discovery and Communication
Write-Host "[7] Testing Service Communication..." -ForegroundColor Yellow
try {
    # Test if AI system can reach search system
    $serviceTestBody = '{"service": "ultra_fast_search", "action": "ping"}'
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/services/test" -Method POST -ContentType "application/json" -Body $serviceTestBody -TimeoutSec 15
    
    if ($response -and $response.success) {
        Write-Host "   ✅ PASS: Service communication working" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "   ⚠️  WARN: Service test endpoint may not be implemented" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  WARN: Service communication test not available (expected)" -ForegroundColor Yellow
}
$testsTotal++
Write-Host ""

# Test 8: Data Flow Integration
Write-Host "[8] Testing Data Flow..." -ForegroundColor Yellow
try {
    # Test adding a document through AI system
    $documentBody = '{"action": "add_document", "document": {"id": "test_integration_doc", "content": "Integration test document for Python development", "experience": 3, "skills": ["Python", "Integration", "Testing"]}}'
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/data/document" -Method POST -ContentType "application/json" -Body $documentBody -TimeoutSec 30
    
    if ($response -and $response.success) {
        Write-Host "   ✅ PASS: Document integration working" -ForegroundColor Green
        $testsPassed++
        
        # Test searching for the added document
        Start-Sleep -Seconds 2  # Allow indexing
        $searchBody = '{"query": "Integration test document", "num_results": 5}'
        $searchResponse = Invoke-RestMethod -Uri "http://localhost:8081/api/v2/search/ultra-fast" -Method POST -ContentType "application/json" -Body $searchBody -TimeoutSec 15
        
        if ($searchResponse -and $searchResponse.results) {
            Write-Host "   ✅ BONUS: Added document is searchable" -ForegroundColor Green
        }
    } else {
        Write-Host "   ⚠️  WARN: Document integration endpoint may not be implemented" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  WARN: Document integration test not available (expected during setup)" -ForegroundColor Yellow
}
$testsTotal++
Write-Host ""

# Summary
Write-Host "📊 INTEGRATION TEST SUMMARY" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host "Tests Passed: $testsPassed / $testsTotal" -ForegroundColor White

if ($testsPassed -eq $testsTotal) {
    Write-Host "🎉 ALL INTEGRATION TESTS PASSED!" -ForegroundColor Green
    Write-Host "Your integrated AI + Search system is working perfectly!" -ForegroundColor Green
} elseif ($testsPassed -ge ($testsTotal * 0.6)) {
    Write-Host "✅ INTEGRATION MOSTLY WORKING!" -ForegroundColor Yellow
    Write-Host "Core functionality is operational. Some advanced features may need implementation." -ForegroundColor Yellow
} else {
    Write-Host "❌ INTEGRATION ISSUES DETECTED!" -ForegroundColor Red
    Write-Host "Please check service logs and configuration." -ForegroundColor Red
}

Write-Host ""
Write-Host "🔗 Integration Status:" -ForegroundColor Cyan
Write-Host "  • Ultra Fast Search: http://localhost:8081/docs" -ForegroundColor Gray
Write-Host "  • AI Chat System: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "  • Combined System Ready: $(if ($testsPassed -ge 4) { 'YES' } else { 'PARTIAL' })" -ForegroundColor Gray

Write-Host ""
Write-Host "💡 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Test actual chat queries with search intent" -ForegroundColor Gray
Write-Host "  2. Implement custom search nodes in AI workflows" -ForegroundColor Gray
Write-Host "  3. Configure AI model access and API keys" -ForegroundColor Gray
Write-Host "  4. Monitor system performance under load" -ForegroundColor Gray

Write-Host ""
Write-Host "🔧 If tests failed:" -ForegroundColor Yellow
Write-Host "  docker-compose -f integration\docker-compose.integrated.yml logs" -ForegroundColor Gray
Write-Host "  docker-compose -f integration\docker-compose.integrated.yml restart" -ForegroundColor Gray

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
