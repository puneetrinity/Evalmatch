#!/usr/bin/env python3
"""
Comprehensive project analysis script
Checks for syntax errors, dependency issues, circular imports, and logic problems
"""
import ast
import os
import sys
import traceback
from pathlib import Path
from typing import List, Tuple, Dict, Any
import importlib.util
import subprocess

class ProjectAnalyzer:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.issues = []
        
    def log_issue(self, category: str, severity: str, message: str, file_path: str = None):
        """Log an issue found during analysis."""
        self.issues.append({
            'category': category,
            'severity': severity,
            'message': message,
            'file': file_path,
            'timestamp': str(datetime.now()) if 'datetime' in globals() else 'now'
        })
        
    def analyze_syntax(self) -> List[Dict]:
        """Check all Python files for syntax errors."""
        print("🔍 Analyzing syntax errors...")
        syntax_issues = []
        
        for py_file in self.project_root.rglob("*.py"):
            if "venv" in str(py_file) or "__pycache__" in str(py_file):
                continue
                
            try:
                with open(py_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                ast.parse(content, filename=str(py_file))
            except SyntaxError as e:
                issue = {
                    'file': str(py_file),
                    'line': e.lineno,
                    'error': str(e),
                    'severity': 'ERROR'
                }
                syntax_issues.append(issue)
                print(f"❌ SYNTAX ERROR in {py_file}:{e.lineno} - {e}")
            except Exception as e:
                issue = {
                    'file': str(py_file),
                    'line': 'unknown',
                    'error': str(e),
                    'severity': 'WARNING'
                }
                syntax_issues.append(issue)
                print(f"⚠️ PARSE WARNING in {py_file} - {e}")
                
        if not syntax_issues:
            print("✅ No syntax errors found")
            
        return syntax_issues
    
    def analyze_imports(self) -> List[Dict]:
        """Analyze import statements for circular dependencies and missing modules."""
        print("🔍 Analyzing import dependencies...")
        import_issues = []
        
        # Build import graph
        import_graph = {}
        
        for py_file in self.project_root.rglob("*.py"):
            if "venv" in str(py_file) or "__pycache__" in str(py_file):
                continue
                
            try:
                with open(py_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                tree = ast.parse(content, filename=str(py_file))
                
                imports = []
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            imports.append(alias.name)
                    elif isinstance(node, ast.ImportFrom):
                        if node.module:
                            imports.append(node.module)
                            
                rel_path = py_file.relative_to(self.project_root)
                module_name = str(rel_path).replace('/', '.').replace('\\', '.').replace('.py', '')
                import_graph[module_name] = imports
                
            except Exception as e:
                import_issues.append({
                    'file': str(py_file),
                    'error': f"Could not parse imports: {e}",
                    'severity': 'WARNING'
                })
        
        # Check for circular imports
        circular_imports = self._detect_circular_imports(import_graph)
        for cycle in circular_imports:
            import_issues.append({
                'type': 'circular_import',
                'cycle': cycle,
                'error': f"Circular import detected: {' -> '.join(cycle)}",
                'severity': 'ERROR'
            })
            print(f"❌ CIRCULAR IMPORT: {' -> '.join(cycle)}")
            
        if not import_issues:
            print("✅ No import issues found")
            
        return import_issues
    
    def _detect_circular_imports(self, import_graph: Dict[str, List[str]]) -> List[List[str]]:
        """Detect circular imports using DFS."""
        cycles = []
        visited = set()
        rec_stack = set()
        
        def dfs(node, path):
            if node in rec_stack:
                # Found a cycle
                cycle_start = path.index(node)
                cycles.append(path[cycle_start:] + [node])
                return
                
            if node in visited:
                return
                
            visited.add(node)
            rec_stack.add(node)
            
            for neighbor in import_graph.get(node, []):
                if neighbor.startswith('app.'):  # Only check internal imports
                    dfs(neighbor, path + [node])
                    
            rec_stack.remove(node)
        
        for module in import_graph:
            if module not in visited:
                dfs(module, [])
                
        return cycles
    
    def analyze_requirements(self) -> List[Dict]:
        """Check requirements.txt for issues."""
        print("🔍 Analyzing requirements...")
        req_issues = []
        
        req_file = self.project_root / "requirements.txt"
        if not req_file.exists():
            req_issues.append({
                'error': "requirements.txt not found",
                'severity': 'WARNING'
            })
            return req_issues
            
        try:
            with open(req_file, 'r') as f:
                requirements = f.read().strip().split('\n')
                
            duplicates = {}
            for req in requirements:
                if req.strip() and not req.startswith('#'):
                    package = req.split('>=')[0].split('==')[0].split('[')[0].strip()
                    if package in duplicates:
                        duplicates[package].append(req.strip())
                    else:
                        duplicates[package] = [req.strip()]
                        
            for package, versions in duplicates.items():
                if len(versions) > 1:
                    req_issues.append({
                        'type': 'duplicate_requirement',
                        'package': package,
                        'versions': versions,
                        'error': f"Duplicate requirement: {package} specified {len(versions)} times",
                        'severity': 'WARNING'
                    })
                    print(f"⚠️ DUPLICATE: {package} -> {versions}")
                    
        except Exception as e:
            req_issues.append({
                'error': f"Could not parse requirements.txt: {e}",
                'severity': 'ERROR'
            })
            
        if not req_issues:
            print("✅ No requirements issues found")
            
        return req_issues
    
    def analyze_logic_patterns(self) -> List[Dict]:
        """Check for common logic issues and anti-patterns."""
        print("🔍 Analyzing logic patterns...")
        logic_issues = []
        
        patterns_to_check = [
            # Dangerous patterns
            (r"except\s*:", "Bare except clause", "WARNING"),
            (r"time\.sleep\(", "Blocking sleep in async code", "WARNING"), 
            (r"\.dict\(\)", "Deprecated Pydantic .model_dump() method", "ERROR"),
            (r"Config\s*=", "Deprecated Pydantic Config", "ERROR"),
            
            # Best practice violations
            (r"print\(", "Print statement (use logging)", "INFO"),
            (r"TODO", "TODO comment", "INFO"),
            (r"FIXME", "FIXME comment", "WARNING"),
            (r"XXX", "XXX comment", "WARNING"),
        ]
        
        import re
        
        for py_file in self.project_root.rglob("*.py"):
            if "venv" in str(py_file) or "__pycache__" in str(py_file):
                continue
                
            try:
                with open(py_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    lines = content.split('\n')
                    
                for pattern, description, severity in patterns_to_check:
                    for line_num, line in enumerate(lines, 1):
                        if re.search(pattern, line):
                            logic_issues.append({
                                'file': str(py_file),
                                'line': line_num,
                                'pattern': pattern,
                                'description': description,
                                'severity': severity,
                                'code': line.strip()
                            })
                            if severity in ['ERROR', 'WARNING']:
                                print(f"{'❌' if severity == 'ERROR' else '⚠️'} {description} in {py_file}:{line_num}")
                                
            except Exception as e:
                logic_issues.append({
                    'file': str(py_file),
                    'error': f"Could not analyze file: {e}",
                    'severity': 'WARNING'
                })
                
        return logic_issues
    
    def fix_issues(self, issues: List[Dict]) -> List[str]:
        """Attempt to automatically fix common issues."""
        print("🔧 Attempting to fix issues...")
        fixes_applied = []
        
        for issue in issues:
            if issue.get('description') == "Deprecated Pydantic .model_dump() method":
                try:
                    file_path = issue['file']
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Replace .model_dump() with .model_dump()
                    new_content = content.replace('.model_dump()', '.model_dump()')
                    
                    if new_content != content:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        fixes_applied.append(f"Fixed .model_dump() -> .model_dump() in {file_path}")
                        print(f"✅ Fixed Pydantic .model_dump() in {file_path}")
                        
                except Exception as e:
                    print(f"❌ Could not fix {file_path}: {e}")
                    
            elif issue.get('description') == "Deprecated Pydantic Config":
                try:
                    file_path = issue['file']
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Replace class Config: with model_config = ConfigDict(
                    import re
                    config_pattern = r'class Config:\s*\n(\s+)(.*?)(?=\n\s*class|\n\s*def|\n\s*@|\Z)'
                    matches = re.finditer(config_pattern, content, re.DOTALL)
                    
                    for match in matches:
                        old_config = match.group(0)
                        indent = match.group(1)
                        config_body = match.group(2)
                        
                        # Convert to Pydantic v2 format
                        new_config = f"{indent}model_config = ConfigDict(\n{config_body}\n{indent})"
                        content = content.replace(old_config, new_config)
                    
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    fixes_applied.append(f"Fixed Pydantic Config in {file_path}")
                    print(f"✅ Fixed Pydantic Config in {file_path}")
                    
                except Exception as e:
                    print(f"❌ Could not fix {file_path}: {e}")
        
        return fixes_applied
    
    def generate_report(self) -> str:
        """Generate a comprehensive analysis report."""
        syntax_issues = self.analyze_syntax()
        import_issues = self.analyze_imports()
        requirement_issues = self.analyze_requirements()
        logic_issues = self.analyze_logic_patterns()
        
        # Count issues by severity
        error_count = sum(1 for issues in [syntax_issues, import_issues, requirement_issues, logic_issues] 
                         for issue in issues if issue.get('severity') == 'ERROR')
        warning_count = sum(1 for issues in [syntax_issues, import_issues, requirement_issues, logic_issues] 
                           for issue in issues if issue.get('severity') == 'WARNING')
        
        report = f"""
# 🔍 AI Search System - Comprehensive Project Analysis

## 📊 Summary
- **Errors**: {error_count}
- **Warnings**: {warning_count}
- **Files Analyzed**: {len(list(self.project_root.rglob("*.py")))}

## 🔥 Critical Issues (Errors)
"""
        
        if error_count == 0:
            report += "✅ **No critical errors found!**\n"
        else:
            for issues in [syntax_issues, import_issues, requirement_issues, logic_issues]:
                for issue in issues:
                    if issue.get('severity') == 'ERROR':
                        report += f"- **{issue.get('file', 'Unknown')}**: {issue.get('error', issue.get('description', 'Unknown error'))}\n"
        
        report += f"""
## ⚠️ Warnings ({warning_count} total)
"""
        
        if warning_count == 0:
            report += "✅ **No warnings found!**\n"
        else:
            for issues in [syntax_issues, import_issues, requirement_issues, logic_issues]:
                for issue in issues:
                    if issue.get('severity') == 'WARNING':
                        report += f"- **{issue.get('file', 'Unknown')}**: {issue.get('error', issue.get('description', 'Unknown warning'))}\n"
        
        # Auto-fix recommendations
        fixes = self.fix_issues(logic_issues)
        if fixes:
            report += f"""
## 🔧 Auto-fixes Applied
"""
            for fix in fixes:
                report += f"- {fix}\n"
        
        report += f"""
## 📋 Recommendations

### High Priority
1. **Fix all ERROR-level issues** - These prevent the application from running properly
2. **Resolve circular imports** - These can cause runtime failures
3. **Update deprecated Pydantic patterns** - Future compatibility

### Medium Priority  
1. **Address WARNING-level issues** - These may cause future problems
2. **Remove dead code and unused imports** - Improves maintainability
3. **Add type hints where missing** - Better IDE support and error detection

### Low Priority
1. **Convert print statements to logging** - Better debugging and monitoring
2. **Address TODO/FIXME comments** - Code cleanup
3. **Add docstrings where missing** - Better documentation

## 🚀 Next Steps
1. Run the fixes with: `python scripts/comprehensive-project-analysis.py --fix`
2. Test the application: `python -m uvicorn app.main:app --reload`
3. Run tests: `pytest tests/`
4. Review and commit changes

---
*Analysis completed at {datetime.now().isoformat() if 'datetime' in globals() else 'now'}*
"""
        
        return report


def main():
    """Main execution function."""
    from datetime import datetime
    
    # Add datetime to globals for report generation
    globals()['datetime'] = datetime
    
    project_root = Path(__file__).parent.parent
    analyzer = ProjectAnalyzer(str(project_root))
    
    print("🔍 Starting comprehensive project analysis...")
    print(f"📁 Project root: {project_root}")
    print("=" * 50)
    
    report = analyzer.generate_report()
    
    # Save report
    report_file = project_root / "PROJECT_ANALYSIS_REPORT.md"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print("=" * 50)
    print(f"📄 Full report saved to: {report_file}")
    print("🎯 Analysis complete!")
    
    # Return exit code based on errors
    error_count = len([issue for issue in analyzer.issues if issue.get('severity') == 'ERROR'])
    return 1 if error_count > 0 else 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
