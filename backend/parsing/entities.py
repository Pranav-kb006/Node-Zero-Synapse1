"""
Rich entity models for code analysis.

This module defines comprehensive dataclasses that capture
enterprise-grade metadata from parsed code entities.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from enum import Enum


class EntityType(Enum):
    """Types of code entities we can extract."""
    FUNCTION = "function"
    CLASS = "class"
    METHOD = "method"
    MODULE = "module"
    VARIABLE = "variable"
    IMPORT = "import"


@dataclass
class Parameter:
    """Represents a function/method parameter."""
    name: str
    type_hint: Optional[str] = None
    default_value: Optional[str] = None
    is_args: bool = False      # *args
    is_kwargs: bool = False    # **kwargs
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type_hint": self.type_hint,
            "default_value": self.default_value,
            "is_args": self.is_args,
            "is_kwargs": self.is_kwargs
        }


@dataclass
class FunctionEntity:
    """
    Rich representation of a function or method.
    
    Captures comprehensive metadata beyond just name and calls,
    including parameters, types, decorators, and complexity metrics.
    """
    name: str
    file_path: str
    start_line: int
    end_line: int
    
    # Parameters and return type
    parameters: List[Parameter] = field(default_factory=list)
    return_type: Optional[str] = None
    
    # Decorators (e.g., @retry, @cache)
    decorators: List[str] = field(default_factory=list)
    
    # Documentation
    docstring: Optional[str] = None
    
    # Visibility / access modifier (e.g. "public", "private", "protected")
    # Populated for Java; None for Python (Python has no formal access modifiers).
    visibility: Optional[str] = None

    # Checked exceptions declared in the method signature (Java only)
    # e.g. throws IOException, SQLException
    throws: List[str] = field(default_factory=list)

    # Function characteristics
    is_async: bool = False
    is_generator: bool = False
    is_method: bool = False
    is_static: bool = False
    is_classmethod: bool = False
    is_property: bool = False
    
    # Class context (if this is a method)
    parent_class: Optional[str] = None
    
    # Complexity metrics
    cyclomatic_complexity: int = 1
    lines_of_code: int = 0
    cognitive_complexity: int = 0
    
    # Call relationships
    calls: List[str] = field(default_factory=list)
    
    # Variables accessed
    reads_globals: List[str] = field(default_factory=list)
    writes_globals: List[str] = field(default_factory=list)
    
    @property
    def unique_id(self) -> str:
        """Generate unique identifier for this entity."""
        if self.parent_class:
            return f"{self.file_path}:{self.parent_class}.{self.name}"
        return f"{self.file_path}:{self.name}"
    
    @property
    def signature(self) -> str:
        """Generate function signature string."""
        params = ", ".join(
            f"{p.name}: {p.type_hint}" if p.type_hint else p.name
            for p in self.parameters
        )
        ret = f" -> {self.return_type}" if self.return_type else ""
        prefix = "async " if self.is_async else ""
        return f"{prefix}def {self.name}({params}){ret}"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "method" if self.is_method else "function",
            "name": self.name,
            "unique_id": self.unique_id,
            "file": self.file_path,
            "range": [self.start_line, self.end_line],
            "signature": self.signature,
            "parameters": [p.to_dict() for p in self.parameters],
            "return_type": self.return_type,
            "decorators": self.decorators,
            "docstring": self.docstring,
            "visibility": self.visibility,
            "throws": self.throws,
            "is_async": self.is_async,
            "is_generator": self.is_generator,
            "is_method": self.is_method,
            "is_static": self.is_static,
            "is_classmethod": self.is_classmethod,
            "is_property": self.is_property,
            "parent_class": self.parent_class,
            "complexity": {
                "cyclomatic": self.cyclomatic_complexity,
                "lines_of_code": self.lines_of_code,
                "cognitive": self.cognitive_complexity
            },
            "calls": self.calls,
            "reads_globals": self.reads_globals,
            "writes_globals": self.writes_globals
        }


@dataclass
class ClassEntity:
    """
    Rich representation of a class definition.
    
    Captures inheritance, methods, attributes, and class-level metadata.
    """
    name: str
    file_path: str
    start_line: int
    end_line: int
    
    # Inheritance
    bases: List[str] = field(default_factory=list)
    metaclass: Optional[str] = None
    
    # Visibility / access modifier (e.g. "public", "private", "protected")
    # Populated for Java; None for Python.
    visibility: Optional[str] = None

    # Class characteristics
    is_abstract: bool = False
    is_dataclass: bool = False
    is_protocol: bool = False

    # True when this entity represents a Java interface (not a class or abstract class)
    is_interface: bool = False
    
    # Decorators
    decorators: List[str] = field(default_factory=list)
    
    # Documentation
    docstring: Optional[str] = None
    
    # Contents
    methods: List[str] = field(default_factory=list)  # Method names
    class_variables: List[str] = field(default_factory=list)
    instance_variables: List[str] = field(default_factory=list)
    
    # Nested classes
    nested_classes: List[str] = field(default_factory=list)
    
    @property
    def unique_id(self) -> str:
        """Generate unique identifier for this entity."""
        return f"{self.file_path}:{self.name}"
    
    @property
    def inheritance_depth(self) -> int:
        """Calculate inheritance depth (basic - just direct bases)."""
        return len(self.bases)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "class",
            "name": self.name,
            "unique_id": self.unique_id,
            "file": self.file_path,
            "range": [self.start_line, self.end_line],
            "bases": self.bases,
            "metaclass": self.metaclass,
            "visibility": self.visibility,
            "is_abstract": self.is_abstract,
            "is_dataclass": self.is_dataclass,
            "is_protocol": self.is_protocol,
            "is_interface": self.is_interface,
            "decorators": self.decorators,
            "docstring": self.docstring,
            "methods": self.methods,
            "class_variables": self.class_variables,
            "instance_variables": self.instance_variables,
            "nested_classes": self.nested_classes,
            "inheritance_depth": self.inheritance_depth
        }


@dataclass
class ImportEntity:
    """
    Represents an import statement.
    
    Tracks both what is imported and how (aliasing, star imports, etc.)
    """
    file_path: str
    line: int
    
    # What is imported
    module: str                              # "os.path" or "utils.helper"
    imported_names: List[str] = field(default_factory=list)  # ["join", "exists"]
    
    # Import characteristics
    alias: Optional[str] = None             # import numpy as np -> "np"
    is_relative: bool = False               # from . import x
    is_star: bool = False                   # from x import *
    relative_level: int = 0                 # Number of dots in relative import
    
    # Classification
    import_type: str = "unknown"            # "stdlib", "third_party", "local"
    
    @property
    def unique_id(self) -> str:
        return f"{self.file_path}:import:{self.module}:{self.line}"

    @property
    def name(self) -> str:
        if self.alias:
            return self.alias
        return self.module

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "import",
            "unique_id": self.unique_id,
            "name": self.name,
            "file": self.file_path,
            "line": self.line,
            "module": self.module,
            "imported_names": self.imported_names,
            "alias": self.alias,
            "is_relative": self.is_relative,
            "is_star": self.is_star,
            "relative_level": self.relative_level,
            "import_type": self.import_type
        }


@dataclass
class ModuleEntity:
    """
    Represents a Python module (file).
    
    Captures module-level information and exports.
    """
    file_path: str
    
    # Module documentation
    docstring: Optional[str] = None
    
    # Exports
    all_exports: List[str] = field(default_factory=list)  # __all__ = [...]
    
    # Top-level contents
    functions: List[str] = field(default_factory=list)
    classes: List[str] = field(default_factory=list)
    global_variables: List[str] = field(default_factory=list)
    
    # Imports
    imports: List[str] = field(default_factory=list)
    
    # Metrics
    total_lines: int = 0
    code_lines: int = 0
    comment_lines: int = 0
    
    @property
    def unique_id(self) -> str:
        return self.file_path
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "module",
            "file": self.file_path,
            "unique_id": self.unique_id,
            "docstring": self.docstring,
            "all_exports": self.all_exports,
            "functions": self.functions,
            "classes": self.classes,
            "global_variables": self.global_variables,
            "imports": self.imports,
            "metrics": {
                "total_lines": self.total_lines,
                "code_lines": self.code_lines,
                "comment_lines": self.comment_lines
            }
        }


@dataclass
class VariableEntity:
    """
    Represents a module-level or class-level variable.
    """
    name: str
    file_path: str
    line: int
    
    # Type information
    type_annotation: Optional[str] = None
    inferred_type: Optional[str] = None
    
    # Scope
    scope: str = "module"  # "module", "class", "function"
    parent: Optional[str] = None  # Class name if class variable
    
    # Characteristics
    is_constant: bool = False  # ALL_CAPS naming convention
    is_export: bool = False    # In __all__
    
    @property
    def unique_id(self) -> str:
        if self.parent:
            return f"{self.file_path}:{self.parent}.{self.name}"
        return f"{self.file_path}:{self.name}"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "variable",
            "name": self.name,
            "unique_id": self.unique_id,
            "file": self.file_path,
            "line": self.line,
            "type_annotation": self.type_annotation,
            "inferred_type": self.inferred_type,
            "scope": self.scope,
            "parent": self.parent,
            "is_constant": self.is_constant,
            "is_export": self.is_export
        }


@dataclass
class ParsedFile:
    """
    Complete parsed representation of a source file.
    """
    file_path: str
    language: str = "python"
    
    # All entities
    module: Optional[ModuleEntity] = None
    functions: List[FunctionEntity] = field(default_factory=list)
    classes: List[ClassEntity] = field(default_factory=list)
    imports: List[ImportEntity] = field(default_factory=list)
    variables: List[VariableEntity] = field(default_factory=list)
    
    # Parse status
    parse_success: bool = True
    parse_errors: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "language": self.language,
            "module": self.module.to_dict() if self.module else None,
            "functions": [f.to_dict() for f in self.functions],
            "classes": [c.to_dict() for c in self.classes],
            "imports": [i.to_dict() for i in self.imports],
            "variables": [v.to_dict() for v in self.variables],
            "parse_success": self.parse_success,
            "parse_errors": self.parse_errors
        }
    
    def get_all_entities(self) -> List[Dict[str, Any]]:
        """Get all entities as a flat list including imports, variables, and modules."""
        lang = self.language
        entities = []
        for f in self.functions:
            d = f.to_dict()
            d["language"] = lang
            entities.append(d)
        for c in self.classes:
            d = c.to_dict()
            d["language"] = lang
            entities.append(d)
        for i in self.imports:
            d = i.to_dict()
            d["language"] = lang
            entities.append(d)
        for v in self.variables:
            d = v.to_dict()
            d["language"] = lang
            entities.append(d)
        if self.module:
            d = self.module.to_dict()
            d["language"] = lang
            entities.append(d)
        return entities
