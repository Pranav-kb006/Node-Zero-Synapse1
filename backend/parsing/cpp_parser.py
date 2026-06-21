"""
C++ code parser using tree-sitter.

This module parses C++ source files and extracts rich entity metadata
including classes, structs, namespaces, functions, methods, and imports.
"""

import os
from typing import List, Optional, Tuple

from tree_sitter_languages import get_language, get_parser

from .entities import (
    FunctionEntity,
    ClassEntity,
    ImportEntity,
    ModuleEntity,
    VariableEntity,
    Parameter,
    ParsedFile,
)
from .cpp_complexity import (
    calculate_cpp_cyclomatic_complexity,
    calculate_cpp_cognitive_complexity,
    count_cpp_lines_of_code,
    count_cpp_total_lines,
)

_cpp_language = get_language("cpp")
_cpp_parser = get_parser("cpp")


def _extract_cpp_parameters(node) -> List[Parameter]:
    """Extract parameters from a parameter_list node."""
    parameters: List[Parameter] = []
    
    # Locate the parameter_list inside the function_declarator
    param_list = None
    for child in node.children:
        if child.type == "parameter_list":
            param_list = child
            break
            
    if not param_list:
        return parameters
        
    for child in param_list.children:
        if child.type == "parameter_declaration":
            type_node = child.child_by_field_name("type")
            name_node = child.child_by_field_name("declarator")
            
            type_hint = type_node.text.decode("utf8") if type_node else None
            # Extract just the identifier if it's a reference or pointer declarator
            name = ""
            if name_node:
                if name_node.type == "identifier":
                    name = name_node.text.decode("utf8")
                elif name_node.type in ["reference_declarator", "pointer_declarator"]:
                    ident = name_node.child_by_field_name("declarator")
                    if ident and ident.type == "identifier":
                        name = ident.text.decode("utf8")
                    else:
                        name = name_node.text.decode("utf8")
                else:
                    name = name_node.text.decode("utf8")
                    
            parameters.append(Parameter(name=name, type_hint=type_hint))
            
    return parameters


def _find_calls(node) -> List[str]:
    """Find all function calls within a node."""
    calls = []
    if node.type == "call_expression":
        func_node = node.child_by_field_name("function")
        if func_node:
            calls.append(func_node.text.decode("utf8"))
            
    for child in node.children:
        calls.extend(_find_calls(child))
    return calls


def _extract_cpp_function(node, file_path: str, parent_class: Optional[str] = None) -> FunctionEntity:
    """Extract a C++ function or method."""
    declarator = node.child_by_field_name("declarator")
    type_node = node.child_by_field_name("type")
    
    name = "unknown"
    is_method = parent_class is not None
    
    if declarator:
        if declarator.type == "function_declarator":
            name_node = declarator.child_by_field_name("declarator")
            if name_node:
                name = name_node.text.decode("utf8")
        elif declarator.type in ["reference_declarator", "pointer_declarator"]:
            inner_decl = declarator.child_by_field_name("declarator")
            if inner_decl and inner_decl.type == "function_declarator":
                name_node = inner_decl.child_by_field_name("declarator")
                if name_node:
                    name = name_node.text.decode("utf8")
    
    return_type = type_node.text.decode("utf8") if type_node else None
    
    # Find parameters
    target_declarator = declarator
    if declarator and declarator.type in ["reference_declarator", "pointer_declarator"]:
        target_declarator = declarator.child_by_field_name("declarator")
        
    parameters = []
    if target_declarator:
        parameters = _extract_cpp_parameters(target_declarator)
        
    calls = _find_calls(node)
    
    complexity_dict = {
        "cyclomatic": calculate_cpp_cyclomatic_complexity(node),
        "cognitive": calculate_cpp_cognitive_complexity(node)
    }
    
    return FunctionEntity(
        name=name,
        file_path=file_path,
        start_line=node.start_point[0] + 1,
        end_line=node.end_point[0] + 1,
        parameters=parameters,
        return_type=return_type,
        decorators=[],
        is_async=False,
        is_generator=False,
        is_method=is_method,
        docstring=None,
        calls=calls,
        cyclomatic_complexity=calculate_cpp_cyclomatic_complexity(node),
        cognitive_complexity=calculate_cpp_cognitive_complexity(node)
    )


def _extract_cpp_class(node, file_path: str) -> Tuple[ClassEntity, List[FunctionEntity]]:
    """Extract a C++ class or struct."""
    name_node = node.child_by_field_name("name")
    name = name_node.text.decode("utf8") if name_node else "unknown"
    
    is_struct = node.type == "struct_specifier"
    
    # Find base classes
    base_classes = []
    base_clause = node.child_by_field_name("base_classes")
    if base_clause:
        for child in base_clause.children:
            if child.type == "base_class_clause":
                for sub in child.children:
                    if sub.type == "type_identifier":
                        base_classes.append(sub.text.decode("utf8"))
    
    methods: List[FunctionEntity] = []
    method_names: List[str] = []
    
    body = node.child_by_field_name("body")
    if body:
        for child in body.children:
            if child.type == "function_definition":
                func = _extract_cpp_function(child, file_path, parent_class=name)
                methods.append(func)
                method_names.append(func.name)
            elif child.type == "declaration":
                pass # Field declarations could be extracted here
                
    class_entity = ClassEntity(
        name=name,
        file_path=file_path,
        start_line=node.start_point[0] + 1,
        end_line=node.end_point[0] + 1,
        methods=method_names,
        bases=base_classes,
        decorators=[],
        docstring=None
    )
    
    return class_entity, methods


def parse_cpp_file(file_path: str) -> ParsedFile:
    """Parse a C++ source file using tree-sitter."""
    try:
        with open(file_path, "r", encoding="utf8") as f:
            code = f.read()
    except Exception as e:
        return ParsedFile(
            file_path=file_path,
            parse_success=False,
            parse_errors=[str(e)]
        )
        
    tree = _cpp_parser.parse(bytes(code, "utf8"))
    root_node = tree.root_node
    
    result = ParsedFile(file_path=file_path)
    line_counts = count_cpp_total_lines(code)
    
    result.module = ModuleEntity(
        file_path=file_path,
        docstring=None,
        total_lines=line_counts["total"],
        code_lines=line_counts["code"],
        comment_lines=line_counts["comment"]
    )
    
    def traverse(node, current_namespace=None):
        if node.type == "function_definition":
            func = _extract_cpp_function(node, file_path)
            if current_namespace:
                func.name = f"{current_namespace}::{func.name}"
            result.functions.append(func)
            result.module.functions.append(func.name)
            
        elif node.type in ["class_specifier", "struct_specifier"]:
            class_entity, methods = _extract_cpp_class(node, file_path)
            if current_namespace:
                class_entity.name = f"{current_namespace}::{class_entity.name}"
                for m in methods:
                    m.name = f"{current_namespace}::{m.name}"
            result.classes.append(class_entity)
            result.functions.extend(methods)
            result.module.classes.append(class_entity.name)
            
        elif node.type == "namespace_definition":
            name_node = node.child_by_field_name("name")
            ns_name = name_node.text.decode("utf8") if name_node else "anonymous"
            new_ns = f"{current_namespace}::{ns_name}" if current_namespace else ns_name
            body = node.child_by_field_name("body")
            if body:
                for child in body.children:
                    traverse(child, new_ns)
                    
        elif node.type == "preproc_include":
            path_node = node.child_by_field_name("path")
            if path_node:
                inc_path = path_node.text.decode("utf8").strip('<>"')
                imp = ImportEntity(
                    file_path=file_path,
                    line=node.start_point[0] + 1,
                    module=inc_path,
                    imported_names=["*"],
                    is_relative='"' in path_node.text.decode("utf8"),
                    is_star=False,
                    relative_level=0
                )
                result.imports.append(imp)
                result.module.imports.append(inc_path)
                
        else:
            for child in node.children:
                traverse(child, current_namespace)
                
    traverse(root_node)
    
    return result
