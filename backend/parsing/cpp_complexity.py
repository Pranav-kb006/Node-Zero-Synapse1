"""
C++ Complexity Calculator using tree-sitter.

Calculates Cyclomatic and Cognitive complexity for C++ functions/methods.
"""

def count_cpp_total_lines(code: str) -> dict:
    """Count lines of code and comments."""
    lines = code.split("\n")
    total = len(lines)
    comment_lines = 0
    code_lines = 0
    
    in_block_comment = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
            
        if in_block_comment:
            comment_lines += 1
            if "*/" in stripped:
                in_block_comment = False
            continue
            
        if stripped.startswith("/*"):
            comment_lines += 1
            if "*/" not in stripped:
                in_block_comment = True
        elif stripped.startswith("//"):
            comment_lines += 1
        else:
            code_lines += 1
            
    return {
        "total": total,
        "code": code_lines,
        "comment": comment_lines
    }

def count_cpp_lines_of_code(node) -> int:
    """Calculate the number of lines a node spans."""
    start_line = node.start_point[0]
    end_line = node.end_point[0]
    return end_line - start_line + 1

def calculate_cpp_cyclomatic_complexity(node) -> int:
    """
    Calculate Cyclomatic Complexity for a C++ AST node.
    Starts at 1, adds 1 for each branch/loop/operator.
    """
    complexity = 1
    
    branching_types = {
        "if_statement",
        "for_statement",
        "while_statement",
        "do_statement",
        "case_statement",
        "catch_clause",
        "conditional_expression"
    }
    
    operator_types = {
        "&&", "||"
    }
    
    def traverse(n):
        nonlocal complexity
        if n.type in branching_types:
            complexity += 1
        elif n.type == "binary_expression":
            operator = n.child_by_field_name("operator")
            if operator and operator.text.decode("utf8") in operator_types:
                complexity += 1
                
        for child in n.children:
            traverse(child)
            
    traverse(node)
    return complexity

def calculate_cpp_cognitive_complexity(node) -> int:
    """
    Calculate Cognitive Complexity for a C++ AST node.
    Increases with nesting level and control flow breaks.
    """
    complexity = 0
    
    nesting_types = {
        "if_statement",
        "for_statement",
        "while_statement",
        "do_statement",
        "catch_clause",
        "switch_statement"
    }
    
    def traverse(n, nesting_level):
        nonlocal complexity
        
        increment = 0
        new_nesting = nesting_level
        
        if n.type in nesting_types:
            increment = 1 + nesting_level
            new_nesting += 1
            
        elif n.type == "binary_expression":
            operator = n.child_by_field_name("operator")
            if operator and operator.text.decode("utf8") in {"&&", "||"}:
                increment = 1
                
        elif n.type in {"goto_statement", "break_statement", "continue_statement"}:
            increment = 1
            
        complexity += increment
        
        for child in n.children:
            traverse(child, new_nesting)
            
    traverse(node, 0)
    return complexity
