import esprima
import os
from typing import List, Dict, Any


class JavaScriptSmellDetector:
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
            
            tree = esprima.parseScript(source, {'loc': True, 'range': True})
            
            self._detect_long_functions(tree)
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
            'language': 'javascript',
            'start_line': start_line,
            'end_line': end_line,
            'description': description,
            'suggestion': suggestion,
            'severity': severity,
            'code_snippet': code_snippet,
            'metrics': metrics or {}
        })

    def _get_node_lines(self, node):
        if hasattr(node, 'loc') and node.loc:
            start = node.loc.start.line
            end = node.loc.end.line if node.loc.end else start
            return start, end
        return 1, 1

    def _detect_long_functions(self, tree):
        MAX_FUNCTION_LINES = 25

        def visit_nodes(node, parent=None):
            if isinstance(node, dict):
                if node.get('type') in ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']:
                    start, end = self._get_node_lines(node)
                    func_lines = end - start + 1
                    
                    if func_lines > MAX_FUNCTION_LINES:
                        func_name = node.get('id', {}).get('name', 'anonymous') if node.get('id') else 'anonymous'
                        self._add_smell(
                            'long_method',
                            start,
                            end,
                            f"函数 '{func_name}' 有 {func_lines} 行代码，超过阈值 {MAX_FUNCTION_LINES} 行",
                            f"考虑将函数 '{func_name}' 拆分为多个更小的函数，每个函数专注于单一职责",
                            severity='high' if func_lines > 60 else 'medium',
                            metrics={'line_count': func_lines, 'threshold': MAX_FUNCTION_LINES}
                        )
                
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        visit_nodes(value, node)
            elif isinstance(node, list):
                for item in node:
                    visit_nodes(item, parent)

        visit_nodes(tree.toDict())

    def _detect_large_classes(self, tree):
        MAX_CLASS_LINES = 150
        MAX_CLASS_METHODS = 15

        def visit_nodes(node):
            if isinstance(node, dict):
                if node.get('type') == 'ClassDeclaration':
                    start, end = self._get_node_lines(node)
                    class_lines = end - start + 1
                    method_count = 0
                    class_name = node.get('id', {}).get('name', 'AnonymousClass')
                    
                    body = node.get('body', {})
                    if body.get('type') == 'ClassBody':
                        for item in body.get('body', []):
                            if item.get('type') == 'MethodDefinition':
                                method_count += 1
                    
                    if class_lines > MAX_CLASS_LINES or method_count > MAX_CLASS_METHODS:
                        self._add_smell(
                            'large_class',
                            start,
                            end,
                            f"类 '{class_name}' 有 {class_lines} 行代码和 {method_count} 个方法",
                            f"考虑将类 '{class_name}' 拆分为多个更小的类，使用组合或继承来分离职责",
                            severity='high' if class_lines > 300 else 'medium',
                            metrics={'line_count': class_lines, 'method_count': method_count,
                                    'line_threshold': MAX_CLASS_LINES, 'method_threshold': MAX_CLASS_METHODS}
                        )
                
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        visit_nodes(value)
            elif isinstance(node, list):
                for item in node:
                    visit_nodes(item)

        visit_nodes(tree.toDict())

    def _detect_too_many_parameters(self, tree):
        MAX_PARAMS = 5

        def visit_nodes(node):
            if isinstance(node, dict):
                if node.get('type') in ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']:
                    params = node.get('params', [])
                    param_count = len(params)
                    
                    if param_count > MAX_PARAMS:
                        start, _ = self._get_node_lines(node)
                        func_name = node.get('id', {}).get('name', 'anonymous') if node.get('id') else 'anonymous'
                        param_names = [p.get('name', 'unknown') for p in params if isinstance(p, dict)]
                        self._add_smell(
                            'too_many_parameters',
                            start,
                            start,
                            f"函数 '{func_name}' 有 {param_count} 个参数，超过阈值 {MAX_PARAMS} 个",
                            f"考虑引入参数对象或将相关参数分组: {', '.join(param_names)}",
                            severity='medium',
                            metrics={'param_count': param_count, 'threshold': MAX_PARAMS}
                        )
                
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        visit_nodes(value)
            elif isinstance(node, list):
                for item in node:
                    visit_nodes(item)

        visit_nodes(tree.toDict())

    def _detect_global_data_abuse(self, tree):
        global_vars = set()
        global_assigns = []

        def visit_nodes(node, in_function=False):
            if isinstance(node, dict):
                if not in_function:
                    if node.get('type') == 'VariableDeclaration':
                        for decl in node.get('declarations', []):
                            if decl.get('type') == 'VariableDeclarator':
                                var_name = decl.get('id', {}).get('name')
                                if var_name:
                                    global_vars.add(var_name)
                                    start, _ = self._get_node_lines(node)
                                    global_assigns.append((start, var_name))
                    
                    if node.get('type') == 'AssignmentExpression':
                        left = node.get('left', {})
                        if left.get('type') == 'Identifier':
                            var_name = left.get('name')
                            if var_name in global_vars:
                                start, _ = self._get_node_lines(node)
                                global_assigns.append((start, var_name))
                
                is_function = node.get('type') in ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']
                
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        visit_nodes(value, in_function or is_function)
            elif isinstance(node, list):
                for item in node:
                    visit_nodes(item, in_function)

        visit_nodes(tree.toDict())
        
        if global_vars:
            for lineno, var_name in global_assigns:
                self._add_smell(
                    'global_data_abuse',
                    lineno,
                    lineno,
                    f"使用了全局变量: {var_name}",
                    "考虑使用模块模式、闭包或类属性来替代全局变量，减少副作用",
                    severity='high' if len(global_vars) > 3 else 'medium',
                    metrics={'global_count': len(global_vars), 'variables': list(global_vars)}
                )

    def _detect_shotgun_surgery(self, tree):
        method_modifications = {}

        def visit_class(node):
            if isinstance(node, dict):
                if node.get('type') == 'ClassDeclaration':
                    class_name = node.get('id', {}).get('name', 'AnonymousClass')
                    body = node.get('body', {})
                    
                    if body.get('type') == 'ClassBody':
                        for item in body.get('body', []):
                            if item.get('type') == 'MethodDefinition':
                                method_name = item.get('key', {}).get('name', 'unknown')
                                accessed_properties = set()
                                
                                def visit_method(n):
                                    if isinstance(n, dict):
                                        if n.get('type') == 'MemberExpression':
                                            obj = n.get('object', {})
                                            prop = n.get('property', {})
                                            if obj.get('type') == 'ThisExpression' and prop.get('name'):
                                                accessed_properties.add(prop.get('name'))
                                        
                                        for k, v in n.items():
                                            if isinstance(v, (dict, list)):
                                                visit_method(v)
                                    elif isinstance(n, list):
                                        for i in n:
                                            visit_method(i)
                                
                                visit_method(item)
                                
                                if len(accessed_properties) >= 4:
                                    start, end = self._get_node_lines(item)
                                    method_modifications[method_name] = {
                                        'start': start,
                                        'end': end,
                                        'count': len(accessed_properties)
                                    }
                
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        visit_class(value)
            elif isinstance(node, list):
                for item in node:
                    visit_class(item)

        visit_class(tree.toDict())
        
        for method_name, data in method_modifications.items():
            self._add_smell(
                'shotgun_surgery',
                data['start'],
                data['end'],
                f"方法 '{method_name}' 访问了 {data['count']} 个不同的属性",
                "考虑将相关属性和行为封装到新的类中，减少跨类修改",
                severity='medium',
                metrics={'accessed_attributes': data['count']}
            )

    def _detect_feature_envy(self, tree):
        pass

    def _detect_data_clumps(self, tree):
        param_groups = {}
        function_params = []

        def visit_nodes(node):
            if isinstance(node, dict):
                if node.get('type') in ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']:
                    params = node.get('params', [])
                    param_names = tuple(sorted(
                        [p.get('name', '') for p in params if isinstance(p, dict) and p.get('name')]
                    ))
                    
                    if len(param_names) >= 3:
                        func_name = node.get('id', {}).get('name', 'anonymous') if node.get('id') else 'anonymous'
                        start, _ = self._get_node_lines(node)
                        function_params.append((param_names, func_name, start))
                
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        visit_nodes(value)
            elif isinstance(node, list):
                for item in node:
                    visit_nodes(item)

        visit_nodes(tree.toDict())
        
        for params, func_name, start in function_params:
            count = sum(1 for p, _, _ in function_params if p == params)
            if count >= 2:
                self._add_smell(
                    'data_clumps',
                    start,
                    start,
                    f"参数组 {params} 在多个函数中重复出现",
                    f"考虑创建一个新对象来封装这些相关参数: {', '.join(params)}",
                    severity='medium',
                    metrics={'parameters': list(params), 'occurrences': count}
                )
