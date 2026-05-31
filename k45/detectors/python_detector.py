import ast
import os
from typing import List, Dict, Any


class PythonSmellDetector:
    def __init__(self):
        self.smells = []
        self.current_file = ""
        self.source_lines = []

    def detect(self, file_path: str) -> List[Dict[str, Any]]:
        self.smells = []
        self.current_file = file_path
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source = f.read()
                self.source_lines = source.splitlines()
            
            tree = ast.parse(source)
            
            self._detect_long_methods(tree)
            self._detect_large_classes(tree)
            self._detect_too_many_parameters(tree)
            self._detect_global_data_abuse(tree)
            self._detect_shotgun_surgery(tree)
            self._detect_feature_envy(tree)
            self._detect_data_clumps(tree)
            
        except Exception as e:
            pass
        
        return self.smells

    def _add_smell(self, smell_type: str, start_line: int, end_line: int, 
                   description: str, suggestion: str, severity: str = 'medium',
                   metrics: Dict = None):
        code_snippet = '\n'.join(self.source_lines[start_line-1:end_line]) if self.source_lines else ""
        self.smells.append({
            'smell_type': smell_type,
            'file_path': self.current_file,
            'language': 'python',
            'start_line': start_line,
            'end_line': end_line,
            'description': description,
            'suggestion': suggestion,
            'severity': severity,
            'code_snippet': code_snippet,
            'metrics': metrics or {}
        })

    def _detect_long_methods(self, tree: ast.AST):
        MAX_METHOD_LINES = 20
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                method_lines = node.end_lineno - node.lineno + 1 if node.end_lineno else 0
                
                if method_lines > MAX_METHOD_LINES:
                    self._add_smell(
                        'long_method',
                        node.lineno,
                        node.end_lineno or node.lineno,
                        f"方法 '{node.name}' 有 {method_lines} 行代码，超过阈值 {MAX_METHOD_LINES} 行",
                        f"考虑将方法 '{node.name}' 拆分为多个更小的方法，每个方法专注于单一职责",
                        severity='high' if method_lines > 50 else 'medium',
                        metrics={'line_count': method_lines, 'threshold': MAX_METHOD_LINES}
                    )

    def _detect_large_classes(self, tree: ast.AST):
        MAX_CLASS_LINES = 150
        MAX_CLASS_METHODS = 15
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                class_lines = node.end_lineno - node.lineno + 1 if node.end_lineno else 0
                method_count = sum(1 for n in ast.walk(node) 
                                  if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
                
                if class_lines > MAX_CLASS_LINES or method_count > MAX_CLASS_METHODS:
                    self._add_smell(
                        'large_class',
                        node.lineno,
                        node.end_lineno or node.lineno,
                        f"类 '{node.name}' 有 {class_lines} 行代码和 {method_count} 个方法",
                        f"考虑将类 '{node.name}' 拆分为多个更小的类，使用组合或继承来分离职责",
                        severity='high' if class_lines > 300 else 'medium',
                        metrics={'line_count': class_lines, 'method_count': method_count,
                                'line_threshold': MAX_CLASS_LINES, 'method_threshold': MAX_CLASS_METHODS}
                    )

    def _detect_too_many_parameters(self, tree: ast.AST):
        MAX_PARAMS = 5
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                param_count = len(node.args.args) + len(node.args.kwonlyargs)
                
                if param_count > MAX_PARAMS:
                    param_names = [a.arg for a in node.args.args] + [a.arg for a in node.args.kwonlyargs]
                    self._add_smell(
                        'too_many_parameters',
                        node.lineno,
                        node.lineno,
                        f"方法 '{node.name}' 有 {param_count} 个参数，超过阈值 {MAX_PARAMS} 个",
                        f"考虑引入参数对象或将相关参数分组: {', '.join(param_names)}",
                        severity='medium',
                        metrics={'param_count': param_count, 'threshold': MAX_PARAMS}
                    )

    def _detect_global_data_abuse(self, tree: ast.AST):
        global_vars = []
        global_assigns = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.Global):
                global_vars.extend(node.names)
                global_assigns.append((node.lineno, node.names))
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                if node.id in global_vars:
                    global_assigns.append((node.lineno, [node.id]))
        
        if global_vars:
            for lineno, names in global_assigns:
                self._add_smell(
                    'global_data_abuse',
                    lineno,
                    lineno,
                    f"使用了全局变量: {', '.join(names)}",
                    "考虑使用类属性、闭包或依赖注入来替代全局变量，减少副作用",
                    severity='high' if len(global_vars) > 3 else 'medium',
                    metrics={'global_count': len(global_vars), 'variables': global_vars}
                )

    def _detect_shotgun_surgery(self, tree: ast.AST):
        method_modifications = {}
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for method in ast.walk(node):
                    if isinstance(method, ast.FunctionDef):
                        accessed_attrs = set()
                        for n in ast.walk(method):
                            if isinstance(n, ast.Attribute):
                                if isinstance(n.value, ast.Name) and n.value.id == 'self':
                                    accessed_attrs.add(n.attr)
                        
                        if len(accessed_attrs) >= 4:
                            method_modifications[method.name] = len(accessed_attrs)
        
        for method_name, attr_count in method_modifications.items():
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and node.name == method_name:
                    self._add_smell(
                        'shotgun_surgery',
                        node.lineno,
                        node.end_lineno or node.lineno,
                        f"方法 '{method_name}' 访问了 {attr_count} 个不同的属性",
                        "考虑将相关属性和行为封装到新的类中，减少跨类修改",
                        severity='medium',
                        metrics={'accessed_attributes': attr_count}
                    )
                    break

    def _detect_feature_envy(self, tree: ast.AST):
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for method in ast.walk(node):
                    if isinstance(method, ast.FunctionDef):
                        external_calls = {}
                        
                        for n in ast.walk(method):
                            if isinstance(n, ast.Call):
                                if isinstance(n.func, ast.Attribute):
                                    if isinstance(n.func.value, ast.Name) and n.func.value.id != 'self':
                                        obj_name = n.func.value.id
                                        external_calls[obj_name] = external_calls.get(obj_name, 0) + 1
                        
                        for obj_name, call_count in external_calls.items():
                            if call_count >= 3:
                                self._add_smell(
                                    'feature_envy',
                                    method.lineno,
                                    method.end_lineno or method.lineno,
                                    f"方法 '{method.name}' 过度依赖外部对象 '{obj_name}' (调用 {call_count} 次)",
                                    f"考虑将方法 '{method.name}' 移动到 '{obj_name}' 类中，或使用委托模式",
                                    severity='medium',
                                    metrics={'external_object': obj_name, 'call_count': call_count}
                                )

    def _detect_data_clumps(self, tree: ast.AST):
        param_groups = {}
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                param_names = tuple(sorted([a.arg for a in node.args.args if a.arg != 'self']))
                
                if len(param_names) >= 3:
                    if param_names in param_groups:
                        param_groups[param_names].append(node.name)
                    else:
                        param_groups[param_names] = [node.name]
        
        for params, methods in param_groups.items():
            if len(methods) >= 2:
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in methods:
                        self._add_smell(
                            'data_clumps',
                            node.lineno,
                            node.lineno,
                            f"参数组 {params} 在多个方法中重复出现: {', '.join(methods)}",
                            f"考虑创建一个新类来封装这些相关参数: {', '.join(params)}",
                            severity='medium',
                            metrics={'parameters': list(params), 'occurrences': len(methods)}
                        )
                        break
