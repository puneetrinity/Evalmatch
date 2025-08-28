/**
 * Test Results Processor
 * Processes Jest test results for enhanced reporting and analytics
 */

const fs = require('fs');
const path = require('path');

module.exports = (results) => {
  const {
    numFailedTests,
    numPassedTests,
    numTotalTests,
    testResults,
    numFailedTestSuites,
    numPassedTestSuites,
    numTotalTestSuites,
    startTime,
    success
  } = results;

  // Calculate execution metrics
  const endTime = Date.now();
  const executionTime = endTime - startTime;
  
  // Process test results
  const processedResults = {
    summary: {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      executionTime,
      success,
      tests: {
        total: numTotalTests,
        passed: numPassedTests,
        failed: numFailedTests,
        passRate: numTotalTests > 0 ? (numPassedTests / numTotalTests * 100).toFixed(2) : 0
      },
      testSuites: {
        total: numTotalTestSuites,
        passed: numPassedTestSuites,
        failed: numFailedTestSuites,
        passRate: numTotalTestSuites > 0 ? (numPassedTestSuites / numTotalTestSuites * 100).toFixed(2) : 0
      }
    },
    testSuites: [],
    slowestTests: [],
    failedTests: [],
    performanceMetrics: {
      averageTestTime: 0,
      slowestSuite: null,
      fastestSuite: null,
      memoryUsage: process.memoryUsage()
    }
  };

  let totalTestTime = 0;
  let slowestSuiteTime = 0;
  let fastestSuiteTime = Infinity;
  let slowestSuite = null;
  let fastestSuite = null;

  // Process each test suite
  testResults.forEach(suiteResult => {
    const {
      testFilePath,
      numFailingTests,
      numPassingTests,
      numTodoTests,
      perfStats,
      testResults: tests,
      failureMessage
    } = suiteResult;

    const suiteName = path.relative(process.cwd(), testFilePath);
    const suiteTime = perfStats.runtime;
    totalTestTime += suiteTime;

    // Track fastest and slowest suites
    if (suiteTime > slowestSuiteTime) {
      slowestSuiteTime = suiteTime;
      slowestSuite = suiteName;
    }
    if (suiteTime < fastestSuiteTime) {
      fastestSuiteTime = suiteTime;
      fastestSuite = suiteName;
    }

    const suiteData = {
      name: suiteName,
      path: testFilePath,
      status: numFailingTests === 0 ? 'passed' : 'failed',
      runtime: suiteTime,
      tests: {
        total: numPassingTests + numFailingTests + numTodoTests,
        passed: numPassingTests,
        failed: numFailingTests,
        todo: numTodoTests
      },
      failureMessage: failureMessage || null
    };

    processedResults.testSuites.push(suiteData);

    // Process individual tests
    tests.forEach(test => {
      const testData = {
        suite: suiteName,
        name: test.ancestorTitles.concat(test.title).join(' › '),
        fullName: test.fullName,
        status: test.status,
        duration: test.duration || 0,
        failureMessages: test.failureMessages || [],
        location: test.location || null
      };

      // Track slow tests
      if (test.duration && test.duration > 1000) { // Slower than 1 second
        processedResults.slowestTests.push(testData);
      }

      // Track failed tests
      if (test.status === 'failed') {
        processedResults.failedTests.push(testData);
      }
    });
  });

  // Calculate performance metrics
  processedResults.performanceMetrics.averageTestTime = totalTestTime / numTotalTestSuites;
  processedResults.performanceMetrics.slowestSuite = {
    name: slowestSuite,
    runtime: slowestSuiteTime
  };
  processedResults.performanceMetrics.fastestSuite = {
    name: fastestSuite,
    runtime: fastestSuiteTime
  };

  // Sort slowest tests
  processedResults.slowestTests.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  processedResults.slowestTests = processedResults.slowestTests.slice(0, 10); // Top 10

  // Generate recommendations
  processedResults.recommendations = generateRecommendations(processedResults);

  // Save detailed results
  saveResults(processedResults);

  // Print summary to console
  printSummary(processedResults);

  return results; // Return original results for Jest
};

function generateRecommendations(results) {
  const recommendations = [];
  const { summary, slowestTests, performanceMetrics } = results;

  // Test performance recommendations
  if (performanceMetrics.averageTestTime > 5000) {
    recommendations.push({
      type: 'performance',
      severity: 'high',
      message: 'Average test suite execution time is high (>5s). Consider optimizing test setup/teardown.',
      metric: `${performanceMetrics.averageTestTime.toFixed(0)}ms average`
    });
  }

  if (slowestTests.length > 5) {
    recommendations.push({
      type: 'performance',
      severity: 'medium',
      message: `${slowestTests.length} tests are running slower than 1 second. Consider optimization.`,
      details: slowestTests.slice(0, 3).map(t => `${t.name} (${t.duration}ms)`)
    });
  }

  // Test coverage recommendations
  if (summary.tests.passRate < 90) {
    recommendations.push({
      type: 'quality',
      severity: 'high',
      message: `Test pass rate is ${summary.tests.passRate}%. Investigate failing tests.`,
      metric: `${summary.tests.failed}/${summary.tests.total} tests failing`
    });
  }

  // Memory usage recommendations
  const memoryMB = results.performanceMetrics.memoryUsage.heapUsed / 1024 / 1024;
  if (memoryMB > 1024) {
    recommendations.push({
      type: 'resource',
      severity: 'medium',
      message: 'High memory usage detected during test execution.',
      metric: `${memoryMB.toFixed(0)}MB heap used`
    });
  }

  // Test distribution recommendations
  const testSuiteDistribution = results.testSuites.reduce((acc, suite) => {
    const type = getTestType(suite.name);
    acc[type] = (acc[type] || 0) + suite.tests.total;
    return acc;
  }, {});

  if ((testSuiteDistribution.unit || 0) < (testSuiteDistribution.integration || 0)) {
    recommendations.push({
      type: 'strategy',
      severity: 'low',
      message: 'Consider increasing unit test coverage relative to integration tests for faster feedback.',
      details: testSuiteDistribution
    });
  }

  return recommendations;
}

function getTestType(suiteName) {
  if (suiteName.includes('/unit/')) return 'unit';
  if (suiteName.includes('/integration/')) return 'integration';
  if (suiteName.includes('/e2e/')) return 'e2e';
  if (suiteName.includes('/performance/')) return 'performance';
  if (suiteName.includes('/security/')) return 'security';
  if (suiteName.includes('/load/')) return 'load';
  return 'other';
}

function saveResults(results) {
  try {
    // Ensure test-results directory exists
    const resultsDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Save detailed JSON report
    const jsonPath = path.join(resultsDir, 'detailed-test-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

    // Save CSV report for analysis
    const csvPath = path.join(resultsDir, 'test-metrics.csv');
    const csvData = generateCSVReport(results);
    fs.writeFileSync(csvPath, csvData);

    // Save HTML report
    const htmlPath = path.join(resultsDir, 'test-summary.html');
    const htmlContent = generateHTMLReport(results);
    fs.writeFileSync(htmlPath, htmlContent);

  } catch (error) {
    console.warn('Failed to save test results:', error.message);
  }
}

function generateCSVReport(results) {
  const lines = ['Suite,Status,Tests,Passed,Failed,Runtime,Pass Rate'];
  
  results.testSuites.forEach(suite => {
    const passRate = suite.tests.total > 0 ? (suite.tests.passed / suite.tests.total * 100).toFixed(2) : 0;
    lines.push([
      suite.name,
      suite.status,
      suite.tests.total,
      suite.tests.passed,
      suite.tests.failed,
      suite.runtime,
      passRate
    ].join(','));
  });

  return lines.join('\n');
}

function generateHTMLReport(results) {
  const { summary, testSuites, recommendations, performanceMetrics } = results;
  
  return `<!DOCTYPE html>
<html>
<head>
    <title>Test Results Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: white; border-radius: 3px; }
        .success { border-left: 4px solid #4caf50; }
        .error { border-left: 4px solid #f44336; }
        .warning { border-left: 4px solid #ff9800; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Results Summary</h1>
        <p>Generated: ${summary.endTime}</p>
        <p>Execution Time: ${(summary.executionTime / 1000).toFixed(2)} seconds</p>
    </div>

    <div class="metrics">
        <div class="metric ${summary.tests.passRate >= 90 ? 'success' : 'error'}">
            <h3>Tests</h3>
            <p>${summary.tests.passed}/${summary.tests.total} passed (${summary.tests.passRate}%)</p>
        </div>
        <div class="metric ${summary.testSuites.passRate >= 90 ? 'success' : 'error'}">
            <h3>Test Suites</h3>
            <p>${summary.testSuites.passed}/${summary.testSuites.total} passed (${summary.testSuites.passRate}%)</p>
        </div>
        <div class="metric">
            <h3>Average Suite Time</h3>
            <p>${performanceMetrics.averageTestTime.toFixed(0)}ms</p>
        </div>
    </div>

    ${recommendations.length > 0 ? `
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ul>
        ${recommendations.map(rec => `
            <li class="${rec.severity}">
                <strong>${rec.type.toUpperCase()}:</strong> ${rec.message}
                ${rec.metric ? `<br><em>Metric: ${rec.metric}</em>` : ''}
            </li>
        `).join('')}
        </ul>
    </div>` : ''}

    <h2>Test Suite Details</h2>
    <table>
        <thead>
            <tr>
                <th>Suite</th>
                <th>Status</th>
                <th>Tests</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Runtime (ms)</th>
            </tr>
        </thead>
        <tbody>
        ${testSuites.map(suite => `
            <tr class="${suite.status === 'passed' ? 'success' : 'error'}">
                <td>${suite.name}</td>
                <td>${suite.status}</td>
                <td>${suite.tests.total}</td>
                <td>${suite.tests.passed}</td>
                <td>${suite.tests.failed}</td>
                <td>${suite.runtime}</td>
            </tr>
        `).join('')}
        </tbody>
    </table>
</body>
</html>`;
}

function printSummary(results) {
  const { summary, recommendations } = results;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`⏱️  Execution Time: ${(summary.executionTime / 1000).toFixed(2)}s`);
  console.log(`✅ Tests Passed: ${summary.tests.passed}/${summary.tests.total} (${summary.tests.passRate}%)`);
  console.log(`📦 Suites Passed: ${summary.testSuites.passed}/${summary.testSuites.total} (${summary.testSuites.passRate}%)`);
  
  if (recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:');
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. [${rec.severity.toUpperCase()}] ${rec.message}`);
    });
  }
  
  console.log(`\n📄 Detailed reports saved to: test-results/`);
  console.log('='.repeat(60));
}