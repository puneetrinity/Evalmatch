# Railway Monitoring & Performance Setup Guide

This guide explains how to set up comprehensive monitoring and performance tracking for your Railway deployment.

## 🛠️ Setup Instructions

### 1. GitHub Actions Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

```
RAILWAY_TOKEN=your_railway_api_token
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
PERFORMANCE_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/PERFORMANCE/WEBHOOK
RAILWAY_TEST_URL=https://your-app.up.railway.app (optional - will auto-detect)
```

### 2. Environment Variables

For local monitoring, add to your `.env` file:

```bash
# Railway Monitoring
RAILWAY_MONITOR_URL=https://your-app.up.railway.app
MONITOR_INTERVAL=300000  # 5 minutes
SLACK_WEBHOOK_URL=your_slack_webhook_url
PERFORMANCE_WEBHOOK_URL=your_performance_webhook_url
```

## 📊 Available Monitoring Scripts

### Health Monitoring
```bash
npm run monitor:railway
```
- Continuous health checks every 5 minutes
- Tracks uptime, response times, and errors
- Sends alerts for failures and performance issues
- Logs metrics to `monitoring-logs/`

### Performance Monitoring
```bash
npm run monitor:performance
```
- Comprehensive performance testing using autocannon
- Tests multiple endpoints with load simulation
- Tracks latency percentiles (P50, P90, P95, P99)
- Monitors throughput and error rates
- Generates performance reports with recommendations

## 🚀 CI/CD Integration

The GitHub Actions workflow automatically:
1. Runs local tests (unit, integration, linting)
2. Deploys to Railway (on main branch)
3. Waits for deployment to be ready
4. Runs comprehensive deployment tests
5. Executes performance monitoring
6. Sends notifications with results

### Workflow Triggers
- **Push to main/development**: Full deployment and testing
- **Pull requests**: Local testing only
- **Daily schedule**: 2 AM UTC automated testing
- **Manual dispatch**: On-demand testing with environment selection

## 📈 Performance Metrics

### Monitored Endpoints
- `/api/health` - Basic health check
- `/api/job-descriptions` - Job listing API
- `/api/resumes` - Resume management API
- `/api/migration-status` - Database status

### Performance Thresholds
- **P50 Latency**: < 200ms
- **P90 Latency**: < 500ms
- **P95 Latency**: < 1000ms
- **P99 Latency**: < 2000ms
- **Error Rate**: < 1%
- **Throughput**: > 100 req/s

### Load Testing Configuration
- **Connections**: 10 concurrent
- **Duration**: 30 seconds per endpoint
- **Pipelining**: 2 requests per connection

## 🔔 Alert System

### Alert Types
1. **Service Down**: 3+ consecutive health check failures
2. **Slow Response**: Response time exceeds thresholds
3. **High Error Rate**: > 1% error rate over time
4. **Performance Degradation**: Latency trends worsening

### Webhook Notifications
Alerts are sent to configured Slack/Discord webhooks with:
- Alert severity and type
- Performance metrics
- Service uptime statistics
- Links to detailed logs

## 📋 Monitoring Reports

### Health Reports (`monitoring-logs/`)
- `railway-metrics.json`: Current health metrics
- `railway-alerts.json`: Alert history

### Performance Reports (`performance-reports/`)
- `performance-report-{timestamp}.json`: Detailed test results
- `latest-performance-report.json`: Most recent report

### Report Contents
- Response time trends and percentiles
- Error rates and status code distribution
- Endpoint-specific performance analysis
- Automated recommendations for optimization

## 🔧 Configuration Options

### Health Monitor Settings
```javascript
{
  checkInterval: 300000,    // 5 minutes
  alertThreshold: {
    responseTime: 5000,     // 5 seconds
    errorRate: 0.1,         // 10%
    consecutiveFailures: 3
  }
}
```

### Performance Monitor Settings
```javascript
{
  performanceTests: {
    duration: 30,           // 30 seconds
    connections: 10,        // concurrent
    pipelining: 2,          // requests per connection
    interval: 300000        // 5 minutes between tests
  }
}
```

## 🚨 Troubleshooting

### Common Issues

1. **"autocannon not found"**
   ```bash
   npm install -g autocannon
   ```

2. **Permission denied on scripts**
   ```bash
   chmod +x scripts/*.js
   ```

3. **Railway URL not detected**
   - Set `RAILWAY_TEST_URL` environment variable
   - Check Railway CLI authentication

4. **Webhook alerts not sending**
   - Verify webhook URLs are correct
   - Check webhook service permissions

### Debug Mode
Set `NODE_ENV=development` for verbose logging and debug output.

## 📊 Sample Metrics

### Healthy Performance
```json
{
  "latency": {
    "p50": 45,
    "p90": 89,
    "p95": 145,
    "p99": 234
  },
  "throughput": 245.6,
  "errorRate": 0.001
}
```

### Alert Conditions
- P99 > 2000ms (critical)
- Error rate > 1% (warning)
- 3+ consecutive failures (critical)
- Throughput < 100 req/s (warning)

## 🎯 Best Practices

1. **Monitor continuously** during peak usage times
2. **Set up alerts** for critical performance degradation
3. **Review reports** weekly for optimization opportunities
4. **Update thresholds** based on actual usage patterns
5. **Test monitoring** setup in staging environment first

## 📞 Support

For monitoring setup issues:
1. Check the workflow logs in GitHub Actions
2. Verify all required secrets are configured
3. Test webhook URLs independently
4. Review Railway deployment logs

The monitoring system provides comprehensive insights into your application's health and performance, enabling proactive maintenance and optimization.