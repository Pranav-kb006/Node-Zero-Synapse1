"""
Enhanced Python code parser using tree-sitter.

This module parses Python source files and extracts rich entity metadata
including functions, classes, imports, and their relationships.
"""

import os
import json
from typing import List, Optional, Tuple
from tree_sitter_languages import get_language, get_parser

from .entities import (
    FunctionEntity, ClassEntity, ImportEntity, ModuleEntity,
    VariableEntity, Parameter, ParsedFile
)
from .complexity import (
    calculate_cyclomatic_complexity,
    calculate_cognitive_complexity,
    count_lines_of_code,
    count_total_lines,
    contains_yield
)


# --- CONFIGURATION ---
REPO_PATH = "./dummy_repo"  # Default path
OUTPUT_FILE = "repo_graph.json"

# --- PARSER SETUP ---
language = get_language("python")
parser = get_parser("python")


def extract_docstring(node) -> Optional[str]:
    """Extract docstring from a function/class body."""
    body = node.child_by_field_name("body")
    if body and body.child_count > 0:
        first_stmt = body.children[0]
        # Check if first statement is an expression statement with a string
        if first_stmt.type == "expression_statement":
            expr = first_stmt.children[0] if first_stmt.child_count > 0 else None
            if expr and expr.type == "string":
                docstring = expr.text.decode("utf8")
                # Strip quotes and clean up
                if docstring.startswith('"""') or docstring.startswith("'''"):
                    return docstring[3:-3].strip()
                elif docstring.startswith('"') or docstring.startswith("'"):
                    return docstring[1:-1].strip()
    return None


def extract_decorators(node) -> List[str]:
    """Extract decorator names from a function/class definition."""
    decorators = []
    
    # Look for decorator nodes before the definition
    parent = node.parent
    if parent and parent.type == "decorated_definition":
        for child in parent.children:
            if child.type == "decorator":
                # Get the decorator name/expression
                for dec_child in child.children:
                    if dec_child.type == "@":
                        continue
                    # Get the full decorator text
                    dec_text = dec_child.text.decode("utf8")
                    # Extract just the name (before any parentheses)
                    dec_name = dec_text.split("(")[0]
                    decorators.append(dec_name)
    
    return decorators


def extract_parameters(node) -> List[Parameter]:
    """Extract function parameters with type hints and defaults."""
    parameters = []
    params_node = node.child_by_field_name("parameters")
    
    if not params_node:
        return parameters
    
    for child in params_node.children:
        if child.type in ["(", ")", ","]:
            continue
        
        param = None
        
        if child.type == "identifier":
            # Simple parameter: def foo(x)
            name = child.text.decode("utf8")
            if name not in ["self", "cls"]:  # Skip self/cls
                param = Parameter(name=name)
        
        elif child.type == "typed_parameter":
            # Typed parameter: def foo(x: int)
            name_node = child.child_by_field_name("name") or child.children[0]
            type_node = child.child_by_field_name("type")
            
            name = name_node.text.decode("utf8") if name_node else ""
            type_hint = type_node.text.decode("utf8") if type_node else None
            
            if name not in ["self", "cls"]:
                param = Parameter(name=name, type_hint=type_hint)
        
        elif child.type == "default_parameter":
            # Default parameter: def foo(x=10)
            name_node = child.child_by_field_name("name")
            value_node = child.child_by_field_name("value")
            
            name = name_node.text.decode("utf8") if name_node else ""
            default = value_node.text.decode("utf8") if value_node else None
            
            if name not in ["self", "cls"]:
                param = Parameter(name=name, default_value=default)
        
        elif child.type == "typed_default_parameter":
            # Typed default: def foo(x: int = 10)
            name_node = None
            type_node = None
            value_node = None
            
            for subchild in child.children:
                if subchild.type == "identifier" and name_node is None:
                    name_node = subchild
                elif subchild.type == "type":
                    type_node = subchild
            value_node = child.child_by_field_name("value")
            
            name = name_node.text.decode("utf8") if name_node else ""
            type_hint = type_node.text.decode("utf8") if type_node else None
            default = value_node.text.decode("utf8") if value_node else None
            
            if name not in ["self", "cls"]:
                param = Parameter(name=name, type_hint=type_hint, default_value=default)
        
        elif child.type == "list_splat_pattern":
            # *args
            for subchild in child.children:
                if subchild.type == "identifier":
                    param = Parameter(name=subchild.text.decode("utf8"), is_args=True)
                    break
        
        elif child.type == "dictionary_splat_pattern":
            # **kwargs
            for subchild in child.children:
                if subchild.type == "identifier":
                    param = Parameter(name=subchild.text.decode("utf8"), is_kwargs=True)
                    break
        
        if param:
            parameters.append(param)
    
    return parameters


def extract_return_type(node) -> Optional[str]:
    """Extract return type annotation from function definition."""
    return_type_node = node.child_by_field_name("return_type")
    if return_type_node:
        return return_type_node.text.decode("utf8")
    return None


def find_calls(node) -> List[str]:
    """Find all function calls within a node."""
    calls = []
    
    if node.type == "call":
        function_node = node.child_by_field_name("function")
        if function_node:
            call_text = function_node.text.decode("utf8")
            calls.append(call_text)
    
    for child in node.children:
        calls.extend(find_calls(child))
    
    return calls


def extract_function(node, file_path: str, parent_class: Optional[str] = None) -> FunctionEntity:
    """Extract a complete FunctionEntity from an AST node."""
    
    # Get basic info
    name_node = node.child_by_field_name("name")
    func_name = name_node.text.decode("utf8") if name_node else "unknown"
    
    # Extract rich metadata
    parameters = extract_parameters(node)
    return_type = extract_return_type(node)
    decorators = extract_decorators(node)
    docstring = extract_docstring(node)
    
    # Check function characteristics
    is_async = node.type == "async_function_definition"
    is_generator = contains_yield(node)
    is_method = parent_class is not None
    is_static = "staticmethod" in decorators
    is_classmethod = "classmethod" in decorators
    is_property = "property" in decorators
    
    # Calculate complexity
    cyclomatic = calculate_cyclomatic_complexity(node)
    cognitive = calculate_cognitive_complexity(node)
    loc = count_lines_of_code(node)
    
    # Find calls
    body_node = node.child_by_field_name("body")
    calls = find_calls(body_node) if body_node else []
    
    return FunctionEntity(
        name=func_name,
        file_path=file_path,
        start_line=node.start_point[0] + 1,  # Convert to 1-indexed
        end_line=node.end_point[0] + 1,
        parameters=parameters,
        return_type=return_type,
        decorators=decorators,
        docstring=docstring,
        is_async=is_async,
        is_generator=is_generator,
        is_method=is_method,
        is_static=is_static,
        is_classmethod=is_classmethod,
        is_property=is_property,
        parent_class=parent_class,
        cyclomatic_complexity=cyclomatic,
        cognitive_complexity=cognitive,
        lines_of_code=loc,
        calls=calls
    )


def extract_bases(node) -> List[str]:
    """Extract base class names from a class definition."""
    bases = []
    
    # Find the argument_list (contains base classes)
    for child in node.children:
        if child.type == "argument_list":
            for arg in child.children:
                if arg.type in ["(", ")", ","]:
                    continue
                if arg.type == "identifier":
                    bases.append(arg.text.decode("utf8"))
                elif arg.type == "attribute":
                    # Handle things like abc.ABC
                    bases.append(arg.text.decode("utf8"))
                elif arg.type == "keyword_argument":
                    # Handle metaclass=...
                    pass  # Ignore for bases, handle separately
    
    return bases


def extract_metaclass(node) -> Optional[str]:
    """Extract metaclass from class definition."""
    for child in node.children:
        if child.type == "argument_list":
            for arg in child.children:
                if arg.type == "keyword_argument":
                    name_node = arg.child_by_field_name("name")
                    value_node = arg.child_by_field_name("value")
                    if name_node and name_node.text.decode("utf8") == "metaclass":
                        return value_node.text.decode("utf8") if value_node else None
    return None


def extract_class(node, file_path: str) -> Tuple[ClassEntity, List[FunctionEntity]]:
    """Extract a ClassEntity and its methods from an AST node."""
    
    # Get class name
    name_node = node.child_by_field_name("name")
    class_name = name_node.text.decode("utf8") if name_node else "unknown"
    
    # Extract metadata
    decorators = extract_decorators(node)
    docstring = extract_docstring(node)
    bases = extract_bases(node)
    metaclass = extract_metaclass(node)
    
    # Determine class type
    is_dataclass = "dataclass" in decorators
    is_abstract = "ABC" in bases or "ABCMeta" in (metaclass or "")
    is_protocol = "Protocol" in bases
    
    # Extract methods and variables
    methods = []
    method_names = []
    class_variables = []
    instance_variables = []
    nested_classes = []
    
    body_node = node.child_by_field_name("body")
    if body_node:
        for child in body_node.children:
            # Extract methods
            if child.type in ["function_definition", "async_function_definition"]:
                method = extract_function(child, file_path, parent_class=class_name)
                methods.append(method)
                method_names.append(method.name)
                
                # Find instance variables from __init__
                if method.name == "__init__":
                    instance_variables.extend(
                        extract_instance_variables(child)
                    )
            
            # Extract class variables
            elif child.type == "expression_statement":
                # Look for assignments
                for subchild in child.children:
                    if subchild.type == "assignment":
                        targets = subchild.child_by_field_name("left")
                        if targets and targets.type == "identifier":
                            class_variables.append(targets.text.decode("utf8"))
            
            # Extract nested classes
            elif child.type == "class_definition":
                nested_name = child.child_by_field_name("name")
                if nested_name:
                    nested_classes.append(nested_name.text.decode("utf8"))
    
    class_entity = ClassEntity(
        name=class_name,
        file_path=file_path,
        start_line=node.start_point[0] + 1,
        end_line=node.end_point[0] + 1,
        bases=bases,
        metaclass=metaclass,
        is_abstract=is_abstract,
        is_dataclass=is_dataclass,
        is_protocol=is_protocol,
        decorators=decorators,
        docstring=docstring,
        methods=method_names,
        class_variables=class_variables,
        instance_variables=instance_variables,
        nested_classes=nested_classes
    )
    
    return class_entity, methods


def extract_instance_variables(init_node) -> List[str]:
    """Extract instance variables (self.x = ...) from __init__ method."""
    variables = []
    
    def find_self_assignments(node):
        if node.type == "assignment":
            left = node.child_by_field_name("left")
            if left and left.type == "attribute":
                obj = left.child_by_field_name("object")
                attr = left.child_by_field_name("attribute")
                if obj and obj.text.decode("utf8") == "self" and attr:
                    variables.append(attr.text.decode("utf8"))
        
        for child in node.children:
            find_self_assignments(child)
    
    body = init_node.child_by_field_name("body")
    if body:
        find_self_assignments(body)
    
    return variables


def extract_import(node, file_path: str) -> List[ImportEntity]:
    """Extract import information from import statements."""
    imports = []
    
    if node.type == "import_statement":
        # import os, sys
        for child in node.children:
            if child.type == "dotted_name":
                module = child.text.decode("utf8")
                imports.append(ImportEntity(
                    file_path=file_path,
                    line=node.start_point[0] + 1,
                    module=module
                ))
            elif child.type == "aliased_import":
                # import numpy as np
                name_node = child.child_by_field_name("name")
                alias_node = child.child_by_field_name("alias")
                module = name_node.text.decode("utf8") if name_node else ""
                alias = alias_node.text.decode("utf8") if alias_node else None
                imports.append(ImportEntity(
                    file_path=file_path,
                    line=node.start_point[0] + 1,
                    module=module,
                    alias=alias
                ))
    
    elif node.type == "import_from_statement":
        # from os.path import join, exists
        module_node = node.child_by_field_name("module_name")
        module = module_node.text.decode("utf8") if module_node else ""
        
        # Check for relative imports
        relative_level = 0
        is_relative = False
        for child in node.children:
            if child.type == "relative_import":
                is_relative = True
                for subchild in child.children:
                    if subchild.type == "import_prefix":
                        relative_level = subchild.text.decode("utf8").count(".")
        
        imported_names = []
        is_star = False
        
        for child in node.children:
            if child.type == "wildcard_import":
                is_star = True
                imported_names = ["*"]
            elif child.type == "dotted_name" and child != module_node:
                imported_names.append(child.text.decode("utf8"))
            elif child.type == "aliased_import":
                name_node = child.child_by_field_name("name")
                if name_node:
                    imported_names.append(name_node.text.decode("utf8"))
        
        imports.append(ImportEntity(
            file_path=file_path,
            line=node.start_point[0] + 1,
            module=module,
            imported_names=imported_names,
            is_relative=is_relative,
            is_star=is_star,
            relative_level=relative_level
        ))
    
    return imports


def extract_global_variable(node, file_path: str) -> Optional[VariableEntity]:
    """Extract module-level variable from assignment."""
    if node.type != "expression_statement":
        return None
    
    for child in node.children:
        if child.type == "assignment":
            left = child.child_by_field_name("left")
            if left and left.type == "identifier":
                name = left.text.decode("utf8")
                # Check if it's a constant (ALL_CAPS)
                is_constant = name.isupper() and "_" in name or name.isupper()
                
                # Try to get type annotation
                type_annotation = None
                if child.type == "annotated_assignment":
                    type_node = child.child_by_field_name("type")
                    if type_node:
                        type_annotation = type_node.text.decode("utf8")
                
                return VariableEntity(
                    name=name,
                    file_path=file_path,
                    line=node.start_point[0] + 1,
                    type_annotation=type_annotation,
                    scope="module",
                    is_constant=is_constant
                )
    
    return None


def parse_file(file_path: str) -> ParsedFile:
    """
    Parse a source file and extract all entities.

    Dispatches to the appropriate language parser based on file extension:
    - .py  → Python parser (this module)
    - .java → Java parser (java_parser module)

    Args:
        file_path: Path to the source file

    Returns:
        ParsedFile containing all extracted entities
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".java":
        from .java_parser import parse_java_file
        return parse_java_file(file_path)
    elif ext in (".cpp", ".cc", ".cxx", ".h", ".hpp"):
        from .cpp_parser import parse_cpp_file
        return parse_cpp_file(file_path)

    # --- Python parsing (original logic below) ---
    try:
        with open(file_path, "r", encoding="utf8") as f:
            code = f.read()
    except Exception as e:
        return ParsedFile(
            file_path=file_path,
            parse_success=False,
            parse_errors=[str(e)]
        )
    
    tree = parser.parse(bytes(code, "utf8"))
    root_node = tree.root_node
    
    # Initialize result
    result = ParsedFile(file_path=file_path)
    
    # Get line counts
    line_counts = count_total_lines(code)
    
    # Create module entity
    module_docstring = None
    if root_node.child_count > 0:
        first_child = root_node.children[0]
        if first_child.type == "expression_statement":
            expr = first_child.children[0] if first_child.child_count > 0 else None
            if expr and expr.type == "string":
                module_docstring = expr.text.decode("utf8")[3:-3].strip()
    
    result.module = ModuleEntity(
        file_path=file_path,
        docstring=module_docstring,
        total_lines=line_counts["total"],
        code_lines=line_counts["code"],
        comment_lines=line_counts["comment"]
    )
    
    # Extract all exports (__all__)
    for child in root_node.children:
        if child.type == "expression_statement":
            for subchild in child.children:
                if subchild.type == "assignment":
                    left = subchild.child_by_field_name("left")
                    right = subchild.child_by_field_name("right")
                    if left and left.text.decode("utf8") == "__all__" and right:
                        if right.type == "list":
                            for item in right.children:
                                if item.type == "string":
                                    name = item.text.decode("utf8")[1:-1]
                                    result.module.all_exports.append(name)
    
    # Parse all top-level nodes
    for child in root_node.children:
        # Handle decorated definitions
        actual_node = child
        if child.type == "decorated_definition":
            for subchild in child.children:
                if subchild.type in ["function_definition", "async_function_definition", "class_definition"]:
                    actual_node = subchild
                    break
        
        # Functions
        if actual_node.type in ["function_definition", "async_function_definition"]:
            func = extract_function(actual_node, file_path)
            result.functions.append(func)
            result.module.functions.append(func.name)
        
        # Classes
        elif actual_node.type == "class_definition":
            class_entity, methods = extract_class(actual_node, file_path)
            result.classes.append(class_entity)
            result.functions.extend(methods)
            result.module.classes.append(class_entity.name)
        
        # Imports
        elif child.type in ["import_statement", "import_from_statement"]:
            imports = extract_import(child, file_path)
            result.imports.extend(imports)
            for imp in imports:
                result.module.imports.append(imp.module)
        
        # Global variables
        elif child.type == "expression_statement":
            var = extract_global_variable(child, file_path)
            if var:
                result.variables.append(var)
                result.module.global_variables.append(var.name)
    
    return result


def scan_repository(path: str) -> List[ParsedFile]:
    """
    Scan a repository and parse all supported source files.

    Currently supports:
    - Python (.py)
    - Java (.java)

    Args:
        path: Path to the repository root

    Returns:
        List of ParsedFile objects
    """
    print(f"[*] Scanning Repository: {path}...")
    parsed_files = []

    _supported = (".py", ".java", ".cpp", ".cc", ".cxx", ".h", ".hpp")

    # Directories that are noise for code intelligence: VCS/caches, test trees,
    # and — critically — vendored third-party source and build output. Without
    # these, a repo that bundles a dependency (e.g. node-qt ships all of Qt
    # under deps/) drowns the real project in tens of thousands of foreign
    # entities and an unreadable graph.
    _skip_dirs = {
        ".venv", "venv", ".git", "__pycache__", "node_modules", "site-packages",
        "chroma_db", "tests", "test",
        # vendored third-party source
        "deps", "vendor", "vendored", "third_party", "thirdparty", "3rdparty",
        "external", "externals", "extern", "bower_components",
        # build / generated output
        "build", "dist", "out", "target", "bin", "obj", "cmake-build-debug",
        # editor/tooling
        ".idea", ".vscode", ".tox", ".mypy_cache", ".pytest_cache",
    }

    for root, dirs, files in os.walk(path):
        # Skip hidden and system directories (in-place prune of os.walk).
        dirs[:] = [d for d in dirs if d not in _skip_dirs]

        for file in files:
            if not file.endswith(_supported):
                continue
            full_path = os.path.join(root, file)
            print(f"  -> Parsing {file}...")
            try:
                parsed = parse_file(full_path)
                parsed_files.append(parsed)
            except Exception as e:
                print(f"  [ERROR] Error parsing {file}: {e}")

    return parsed_files


def get_all_entities(parsed_files: List[ParsedFile]) -> List[dict]:
    """
    Get a flat list of all entities for backward compatibility.
    """
    entities = []
    for pf in parsed_files:
        entities.extend(pf.get_all_entities())
    return entities


# --- MAIN EXECUTION ---
if __name__ == "__main__":
    import sys
    
    # Allow custom repo path from command line
    repo_path = sys.argv[1] if len(sys.argv) > 1 else REPO_PATH
    
    if not os.path.exists(repo_path):
        print(f"[ERROR] The folder '{repo_path}' does not exist.")
        sys.exit(1)
    
    # Parse repository
    parsed_files = scan_repository(repo_path)
    
    # Get all entities for output
    all_entities = get_all_entities(parsed_files)
    
    # Save to JSON
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_entities, f, indent=2)
    
    print(f"\n[OK] Success! Parsed {len(parsed_files)} files.")
    print(f"[INFO] Extracted {len(all_entities)} entities.")
    print(f"[SAVE] Database saved to: {OUTPUT_FILE}")
    
    # Print summary
    func_count = sum(len(pf.functions) for pf in parsed_files)
    class_count = sum(len(pf.classes) for pf in parsed_files)
    import_count = sum(len(pf.imports) for pf in parsed_files)
    
    print(f"\n[SUMMARY]:")
    print(f"   Functions: {func_count}")
    print(f"   Classes: {class_count}")
    print(f"   Imports: {import_count}")