#!/usr/bin/env python3
"""
Fix ModelManager initialization and get_model_stats method
"""

import os
import sys

def fix_model_manager():
    """Add get_model_stats method if missing and ensure proper initialization"""
    
    manager_file = "app/models/manager.py"
    
    if not os.path.exists(manager_file):
        print(f"❌ {manager_file} not found")
        return False
    
    with open(manager_file, 'r') as f:
        content = f.read()
    
    # Check if get_model_stats method exists
    if 'def get_model_stats(' in content:
        print("✅ get_model_stats method already exists")
        return True
    
    # Add get_model_stats method before the __all__ export
    method_code = '''
    def get_model_stats(self) -> Dict[str, Any]:
        """Get model statistics (health check compatibility)."""
        try:
            stats = {
                "total_models": len(self.models),
                "loaded_models": len([m for m in self.models.values() 
                                     if hasattr(m, 'status') and str(m.status) == 'ModelStatus.READY']),
                "is_initialized": self.is_initialized,
                "status": "healthy" if self.is_initialized else "initializing",
                "models": {}
            }
            
            # Add individual model stats
            for name, model in self.models.items():
                try:
                    stats["models"][name] = {
                        "status": str(model.status) if hasattr(model, 'status') else "unknown",
                        "requests": getattr(model, 'total_requests', 0),
                        "avg_response_time": getattr(model, 'avg_response_time', 0.0)
                    }
                except Exception as e:
                    stats["models"][name] = {"status": "error", "error": str(e)}
            
            return stats
            
        except Exception as e:
            # Fallback stats if there's any error
            return {
                "total_models": 0,
                "loaded_models": 0,
                "is_initialized": False,
                "status": "error",
                "error": str(e),
                "models": {}
            }
'''
    
    # Insert the method before __all__
    if '__all__ = [' in content:
        content = content.replace('__all__ = [', method_code + '\n\n# Export main classes\n__all__ = [')
        
        with open(manager_file, 'w') as f:
            f.write(content)
        
        print("✅ Added get_model_stats method to ModelManager")
        return True
    else:
        print("❌ Could not find __all__ export in ModelManager")
        return False

if __name__ == "__main__":
    if fix_model_manager():
        print("🎉 ModelManager fixed successfully")
        sys.exit(0)
    else:
        print("❌ Failed to fix ModelManager")
        sys.exit(1)