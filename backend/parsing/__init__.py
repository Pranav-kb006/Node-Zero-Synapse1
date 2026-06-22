"""
Parsing module - Code parsing and entity extraction.

This module handles AST parsing using tree-sitter and extracts
rich metadata from code including functions, classes, and complexity metrics.
"""

from .entities import (
    EntityType,
    Parameter,
    FunctionEntity,
    ClassEntity,
    ImportEntity,
    ModuleEntity,
    VariableEntity,
    ParsedFile
)

from .complexity import (
    calculate_cyclomatic_complexity,
    calculate_cognitive_complexity,
    count_lines_of_code,
    count_total_lines,
    contains_yield,
    contains_await,
    get_accessed_globals,
    extract_local_definitions,
    ScopeTracker,
    PYTHON_BUILTINS
)

from .parser import (
    parse_file,
    scan_repository,
    get_all_entities
)

from .java_parser import parse_java_file

from .cpp_parser import parse_cpp_file

from .cpp_complexity import (
    calculate_cpp_cyclomatic_complexity,
    calculate_cpp_cognitive_complexity,
    count_cpp_lines_of_code,
    count_cpp_total_lines,
)

from .java_complexity import (
    calculate_java_cyclomatic_complexity,
    calculate_java_cognitive_complexity,
    count_java_lines_of_code,
    count_java_total_lines,
    JAVA_BUILTINS,
)

__all__ = [
    # Entities
    "EntityType",
    "Parameter",
    "FunctionEntity",
    "ClassEntity",
    "ImportEntity",
    "ModuleEntity",
    "VariableEntity",
    "ParsedFile",
    # Python Complexity
    "calculate_cyclomatic_complexity",
    "calculate_cognitive_complexity",
    "count_lines_of_code",
    "count_total_lines",
    "contains_yield",
    "contains_await",
    "get_accessed_globals",
    "extract_local_definitions",
    "ScopeTracker",
    "PYTHON_BUILTINS",
    # Java Complexity
    "calculate_java_cyclomatic_complexity",
    "calculate_java_cognitive_complexity",
    "count_java_lines_of_code",
    "count_java_total_lines",
    "JAVA_BUILTINS",
    # Parser (language-agnostic entry points)
    "parse_file",
    "scan_repository",
    "get_all_entities",
    # Java-specific entry point
    "parse_java_file",
    # C++-specific entry point
    "parse_cpp_file",
    # C++ Complexity
    "calculate_cpp_cyclomatic_complexity",
    "calculate_cpp_cognitive_complexity",
    "count_cpp_lines_of_code",
    "count_cpp_total_lines",
]
