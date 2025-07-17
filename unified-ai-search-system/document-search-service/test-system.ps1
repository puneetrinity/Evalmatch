# Ultra Fast Search System - Test Script
# This script tests all major endpoints to verify the system is working correctly

Write-Host "🧪 Testing Ultra Fast Search System..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost"
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
            Write-Host "   Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Gray
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

# Test 1: Health Check
Test-Endpoint -Name "Health Check" -Url "$baseUrl/api/v2/health" -ExpectedContent "status"

# Test 2: System Metrics
Test-Endpoint -Name "System Metrics" -Url "$baseUrl/api/v2/metrics" -ExpectedContent "system"

# Test 3: Performance Stats
Test-Endpoint -Name "Performance Stats" -Url "$baseUrl/api/v2/search/performance" -ExpectedContent "search_engine"

# Test 4: Check if indexes exist (this might fail if not built yet)
Write-Host "[4] Checking if indexes are built..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v2/search/performance" -TimeoutSec 10
    if ($response.search_engine.indexes_loaded -eq $true) {
        Write-Host "   ✅ PASS: Indexes are loaded" -ForegroundColor Green
        $testsPassed++
        $indexesLoaded = $true
    } else {
        Write-Host "   ⚠️  WARN: Indexes not loaded yet" -ForegroundColor Yellow
        $indexesLoaded = $false
    }
} catch {
    Write-Host "   ❌ FAIL: Cannot check index status" -ForegroundColor Red
    $indexesLoaded = $false
}
$testsTotal++
Write-Host ""

# Test 5: Build indexes if not loaded
if (-not $indexesLoaded) {
    Write-Host "[5] Building indexes (this may take 1-2 minutes)..." -ForegroundColor Yellow
    try {
        $buildBody = '{"data_source": "data/resumes.json"}'
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v2/admin/build-indexes" -Method POST -ContentType "application/json" -Body $buildBody -TimeoutSec 120
        Write-Host "   ✅ PASS: Indexes built successfully" -ForegroundColor Green
        Write-Host "   Documents processed: $($response.documents_processed)" -ForegroundColor Gray
        Write-Host "   Processing time: $($response.processing_time)" -ForegroundColor Gray
        $testsPassed++
        $indexesLoaded = $true
    } catch {
        Write-Host "   ❌ FAIL: Index building failed - $($_.Exception.Message)" -ForegroundColor Red
    }
    $testsTotal++
    Write-Host ""
}

# Test 6: Search functionality (only if indexes are loaded)
if ($indexesLoaded) {
    $searchBody = '{"query": "python developer", "num_results": 3}'
    Test-Endpoint -Name "Basic Search" -Url "$baseUrl/api/v2/search/ultra-fast" -Method "POST" -Body $searchBody -ExpectedContent "results"
    
    # Test 7: Search with filters
    $filterSearchBody = '{"query": "engineer", "num_results": 2, "filters": {"min_experience": 2}}'
    Test-Endpoint -Name "Filtered Search" -Url "$baseUrl/api/v2/search/ultra-fast" -Method "POST" -Body $filterSearchBody -ExpectedContent "results"
    
    # Test 8: Incremental operations
    $addDocBody = '{"document": {"id": "test_doc_1", "content": "Test document for incremental indexing", "experience": 5, "skills": ["Testing", "Python"]}}'
    Test-Endpoint -Name "Add Document" -Url "$baseUrl/api/v2/search/add-document" -Method "POST" -Body $addDocBody -ExpectedContent "success"
    
    # Test 9: Search for the added document
    $testSearchBody = '{"query": "incremental indexing", "num_results": 5}'
    Test-Endpoint -Name "Search Added Document" -Url "$baseUrl/api/v2/search/ultra-fast" -Method "POST" -Body $testSearchBody -ExpectedContent "results"
    
    # Test 10: Update document
    $updateDocBody = '{"document_id": "test_doc_1", "document": {"id": "test_doc_1", "content": "Updated test document for incremental indexing", "experience": 6, "skills": ["Testing", "Python", "FastAPI"]}}'
    Test-Endpoint -Name "Update Document" -Url "$baseUrl/api/v2/search/update-document" -Method "PUT" -Body $updateDocBody -ExpectedContent "success"
    
    # Test 11: Delete document
    $deleteDocBody = '{"document_id": "test_doc_1"}'
    Test-Endpoint -Name "Delete Document" -Url "$baseUrl/api/v2/search/delete-document" -Method "DELETE" -Body $deleteDocBody -ExpectedContent "success"
} else {
    Write-Host "⚠️  Skipping search tests - indexes not available" -ForegroundColor Yellow
    Write-Host ""
}

# Test 12: API Documentation accessibility
Write-Host "[$($testsTotal + 1)] Testing API Documentation..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/docs" -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ PASS: API docs accessible" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "   ❌ FAIL: API docs not accessible" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ FAIL: Cannot access API docs - $($_.Exception.Message)" -ForegroundColor Red
}
$testsTotal++
Write-Host ""

# Summary
Write-Host "📊 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan
Write-Host "Tests Passed: $testsPassed / $testsTotal" -ForegroundColor White

if ($testsPassed -eq $testsTotal) {
    Write-Host "🎉 ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "Your Ultra Fast Search System is working correctly!" -ForegroundColor Green
} elseif ($testsPassed -gt ($testsTotal * 0.8)) {
    Write-Host "✅ MOSTLY WORKING!" -ForegroundColor Yellow
    Write-Host "Most tests passed. Check failed tests above." -ForegroundColor Yellow
} else {
    Write-Host "❌ SYSTEM ISSUES DETECTED!" -ForegroundColor Red
    Write-Host "Multiple tests failed. Check the system logs:" -ForegroundColor Red
    Write-Host "  docker-compose logs app" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🔗 Quick Links:" -ForegroundColor Cyan
Write-Host "  • API Documentation: http://localhost/docs" -ForegroundColor Gray
Write-Host "  • Health Check: http://localhost/api/v2/health" -ForegroundColor Gray
Write-Host "  • System Metrics: http://localhost/api/v2/metrics" -ForegroundColor Gray
Write-Host "  • Performance Stats: http://localhost/api/v2/search/performance" -ForegroundColor Gray
Write-Host ""

if ($testsPassed -lt $testsTotal) {
    Write-Host "🔧 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check if Docker containers are running: docker-compose ps" -ForegroundColor Gray
    Write-Host "  2. View application logs: docker-compose logs app" -ForegroundColor Gray
    Write-Host "  3. Restart the system: docker-compose restart" -ForegroundColor Gray
    Write-Host "  4. See COMPLETE_SETUP_GUIDE.md for detailed troubleshooting" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Press any key to exit..." -ForegroundColor Gray
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
