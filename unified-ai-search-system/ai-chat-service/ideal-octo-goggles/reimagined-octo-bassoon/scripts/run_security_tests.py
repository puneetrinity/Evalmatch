#!/usr/bin/env python3
"""
Security Test Runner

This script runs comprehensive security tests and generates a detailed report.
It validates all security fixes implemented in the AI Search System.
"""

import asyncio
import sys
import os
import subprocess
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("security_tests")


class SecurityTestRunner:
    """Runs comprehensive security tests and generates reports."""
    
    def __init__(self):
        self.settings = get_settings()
        self.test_results = {
            "timestamp": datetime.now().isoformat(),
            "environment": self.settings.environment,
            "tests_run": 0,
            "tests_passed": 0,
            "tests_failed": 0,
            "security_issues": [],
            "recommendations": []
        }
    
    def run_pytest_security_tests(self) -> Dict[str, Any]:
        """Run pytest security tests and return results."""
        logger.info("🔒 Running pytest security tests...")
        
        try:
            # Run security tests with verbose output
            result = subprocess.run([
                "python", "-m", "pytest", 
                "tests/test_security.py",
                "-v",
                "--tb=short",
                "--json-report",
                "--json-report-file=security_test_results.json"
            ], cwd=project_root, capture_output=True, text=True)
            
            # Parse JSON results if available
            json_file = project_root / "security_test_results.json"
            if json_file.exists():
                with open(json_file, 'r') as f:
                    pytest_results = json.load(f)
                
                self.test_results["tests_run"] = pytest_results.get("summary", {}).get("total", 0)
                self.test_results["tests_passed"] = pytest_results.get("summary", {}).get("passed", 0)
                self.test_results["tests_failed"] = pytest_results.get("summary", {}).get("failed", 0)
                
                # Clean up JSON file
                json_file.unlink()
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
            
        except Exception as e:
            logger.error(f"❌ Error running pytest security tests: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def check_configuration_security(self) -> Dict[str, Any]:
        """Check configuration security settings."""
        logger.info("⚙️ Checking configuration security...")
        
        issues = []
        recommendations = []
        
        # Check JWT secret security
        if len(self.settings.jwt_secret_key) < 32:
            issues.append("JWT secret key is too short (< 32 characters)")
            recommendations.append("Generate a longer JWT secret key")
        
        if self.settings.jwt_secret_key in ["your-secret-key-here", "development-secret"]:
            issues.append("JWT secret key is using default value")
            recommendations.append("Set a unique JWT secret key")
        
        # Check CORS configuration
        if self.settings.environment == "production":
            if "*" in self.settings.cors_origins:
                issues.append("CORS allows all origins in production")
                recommendations.append("Restrict CORS origins to specific domains")
            
            if "http://localhost" in " ".join(self.settings.cors_origins):
                issues.append("CORS allows localhost in production")
                recommendations.append("Remove localhost from CORS origins")
        
        # Check debug mode
        if self.settings.environment == "production" and self.settings.debug:
            issues.append("Debug mode is enabled in production")
            recommendations.append("Disable debug mode in production")
        
        # Check API key configuration
        if self.settings.brave_api_key == "your_api_key_here":
            issues.append("Brave API key is using default value")
            recommendations.append("Set a valid Brave API key")
        
        if self.settings.scrapingbee_api_key == "your_api_key_here":
            issues.append("ScrapingBee API key is using default value")
            recommendations.append("Set a valid ScrapingBee API key")
        
        return {
            "issues": issues,
            "recommendations": recommendations,
            "checks_passed": len(issues) == 0
        }
    
    def check_docker_security(self) -> Dict[str, Any]:
        """Check Docker security configuration."""
        logger.info("🐳 Checking Docker security...")
        
        issues = []
        recommendations = []
        
        # Check if Dockerfile.production exists
        dockerfile_path = project_root / "Dockerfile.production"
        if not dockerfile_path.exists():
            issues.append("Dockerfile.production not found")
            recommendations.append("Create production Dockerfile with security measures")
            return {
                "issues": issues,
                "recommendations": recommendations,
                "checks_passed": False
            }
        
        # Read and analyze Dockerfile
        try:
            with open(dockerfile_path, 'r') as f:
                dockerfile_content = f.read()
            
            # Check for non-root user
            if "USER" not in dockerfile_content:
                issues.append("Dockerfile doesn't specify non-root user")
                recommendations.append("Add USER directive to run as non-root")
            
            # Check for unnecessary port exposure
            if "EXPOSE 22" in dockerfile_content:
                issues.append("SSH port (22) is exposed in Dockerfile")
                recommendations.append("Remove SSH port exposure")
            
            # Check for proper file permissions
            if "RUN chown" not in dockerfile_content:
                issues.append("File permissions not explicitly set")
                recommendations.append("Set proper file permissions in Dockerfile")
            
        except Exception as e:
            issues.append(f"Error reading Dockerfile: {e}")
            recommendations.append("Fix Dockerfile reading issues")
        
        return {
            "issues": issues,
            "recommendations": recommendations,
            "checks_passed": len(issues) == 0
        }
    
    def check_dependency_security(self) -> Dict[str, Any]:
        """Check dependency security using safety."""
        logger.info("📦 Checking dependency security...")
        
        try:
            # Try to run safety check
            result = subprocess.run([
                "python", "-m", "safety", "check", "--json"
            ], cwd=project_root, capture_output=True, text=True)
            
            if result.returncode == 0:
                # No vulnerabilities found
                return {
                    "issues": [],
                    "recommendations": [],
                    "checks_passed": True,
                    "vulnerabilities": []
                }
            else:
                # Parse safety results
                try:
                    safety_results = json.loads(result.stdout)
                    issues = [f"Vulnerability in {vuln['package_name']}: {vuln['advisory']}" 
                             for vuln in safety_results]
                    recommendations = [f"Update {vuln['package_name']} to version {vuln['analyzed_version']}" 
                                     for vuln in safety_results]
                    
                    return {
                        "issues": issues,
                        "recommendations": recommendations,
                        "checks_passed": False,
                        "vulnerabilities": safety_results
                    }
                except json.JSONDecodeError:
                    return {
                        "issues": ["Unable to parse safety results"],
                        "recommendations": ["Check dependency security manually"],
                        "checks_passed": False
                    }
                    
        except FileNotFoundError:
            return {
                "issues": ["Safety package not installed"],
                "recommendations": ["Install safety package: pip install safety"],
                "checks_passed": False
            }
        except Exception as e:
            return {
                "issues": [f"Error running safety check: {e}"],
                "recommendations": ["Install and run safety manually"],
                "checks_passed": False
            }
    
    def generate_security_report(self) -> str:
        """Generate a comprehensive security report."""
        logger.info("📊 Generating security report...")
        
        report = [
            "# Security Test Report",
            f"Generated: {self.test_results['timestamp']}",
            f"Environment: {self.test_results['environment']}",
            "",
            "## Test Summary",
            f"- Tests Run: {self.test_results['tests_run']}",
            f"- Tests Passed: {self.test_results['tests_passed']}",
            f"- Tests Failed: {self.test_results['tests_failed']}",
            ""
        ]
        
        # Add security issues
        if self.test_results["security_issues"]:
            report.extend([
                "## Security Issues Found",
                ""
            ])
            for issue in self.test_results["security_issues"]:
                report.append(f"- ❌ {issue}")
            report.append("")
        
        # Add recommendations
        if self.test_results["recommendations"]:
            report.extend([
                "## Recommendations",
                ""
            ])
            for rec in self.test_results["recommendations"]:
                report.append(f"- 💡 {rec}")
            report.append("")
        
        # Add overall status
        if self.test_results["tests_failed"] == 0 and not self.test_results["security_issues"]:
            report.extend([
                "## Overall Status",
                "✅ **ALL SECURITY TESTS PASSED**",
                "",
                "The system has passed all security tests and is ready for production deployment."
            ])
        else:
            report.extend([
                "## Overall Status",
                "⚠️ **SECURITY ISSUES FOUND**",
                "",
                "Please address the security issues and recommendations above before deployment."
            ])
        
        return "\n".join(report)
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all security tests and generate report."""
        logger.info("🚀 Starting comprehensive security test suite...")
        
        # Run pytest security tests
        pytest_results = self.run_pytest_security_tests()
        
        # Check configuration security
        config_results = self.check_configuration_security()
        self.test_results["security_issues"].extend(config_results["issues"])
        self.test_results["recommendations"].extend(config_results["recommendations"])
        
        # Check Docker security
        docker_results = self.check_docker_security()
        self.test_results["security_issues"].extend(docker_results["issues"])
        self.test_results["recommendations"].extend(docker_results["recommendations"])
        
        # Check dependency security
        dep_results = self.check_dependency_security()
        self.test_results["security_issues"].extend(dep_results["issues"])
        self.test_results["recommendations"].extend(dep_results["recommendations"])
        
        # Generate report
        report = self.generate_security_report()
        
        # Save report to file
        report_file = project_root / "SECURITY_TEST_REPORT.md"
        with open(report_file, 'w') as f:
            f.write(report)
        
        logger.info(f"📋 Security report saved to {report_file}")
        
        return {
            "success": self.test_results["tests_failed"] == 0 and not self.test_results["security_issues"],
            "report": report,
            "report_file": str(report_file),
            "pytest_results": pytest_results,
            "config_results": config_results,
            "docker_results": docker_results,
            "dependency_results": dep_results
        }


def main():
    """Main entry point for security test runner."""
    print("🔒 AI Search System Security Test Suite")
    print("=" * 50)
    
    runner = SecurityTestRunner()
    results = runner.run_all_tests()
    
    print("\n" + "=" * 50)
    if results["success"]:
        print("✅ ALL SECURITY TESTS PASSED!")
        print("🚀 System is ready for production deployment.")
        sys.exit(0)
    else:
        print("⚠️ SECURITY ISSUES FOUND!")
        print("📋 Please check the security report for details.")
        print(f"📄 Report saved to: {results['report_file']}")
        sys.exit(1)


if __name__ == "__main__":
    main()