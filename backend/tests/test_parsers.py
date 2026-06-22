import os
import unittest
from pathlib import Path
from backend.parsing.parser import parse_file
from backend.parsing.cpp_parser import parse_cpp_file
from backend.parsing.java_parser import parse_java_file

class ParsersTestCase(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(__file__).parent / "temp_test_parser"
        self.test_dir.mkdir(exist_ok=True)

    def tearDown(self):
        for f in self.test_dir.glob("*"):
            f.unlink()
        self.test_dir.rmdir()

    def test_cpp_parser(self):
        code = """
        #include <iostream>
        #include "helper.h"
        
        namespace utils {
            int global_var = 42;
            const double PI = 3.14159;
            
            class Math {
            public:
                int add(int a, int b) {
                    return a + b;
                }
            };
            
            void greet() {
                std::cout << "Hello" << std::endl;
            }
        }
        """
        cpp_file = self.test_dir / "test.cpp"
        cpp_file.write_text(code, encoding="utf-8")
        
        res = parse_cpp_file(str(cpp_file))
        self.assertTrue(res.parse_success)
        self.assertEqual(res.language, "cpp")
        
        # Imports
        self.assertEqual(len(res.imports), 2)
        self.assertEqual(res.imports[0].module, "iostream")
        self.assertEqual(res.imports[1].module, "helper.h")
        
        # Classes
        self.assertEqual(len(res.classes), 1)
        self.assertEqual(res.classes[0].name, "utils::Math")
        
        # Functions / methods
        func_names = [f.name for f in res.functions]
        self.assertIn("utils::add", func_names)
        self.assertIn("utils::greet", func_names)
        
        # Variables
        self.assertEqual(len(res.variables), 2)
        var_names = [v.name for v in res.variables]
        self.assertIn("utils::global_var", var_names)
        self.assertIn("utils::PI", var_names)

    def test_java_parser(self):
        code = """
        package com.example;
        import java.util.List;
        import static java.lang.Math.max;
        
        public class Calculator implements Action {
            private int value = 0;
            
            public int sum(int a, int b) {
                return a + b;
            }
        }
        """
        java_file = self.test_dir / "Calculator.java"
        java_file.write_text(code, encoding="utf-8")
        
        res = parse_java_file(str(java_file))
        self.assertTrue(res.parse_success)
        self.assertEqual(res.language, "java")
        
        # Imports
        self.assertEqual(len(res.imports), 2)
        self.assertEqual(res.imports[0].module, "java.util")
        
        # Classes
        self.assertEqual(len(res.classes), 1)
        self.assertEqual(res.classes[0].name, "Calculator")
        
        # Functions / Methods
        self.assertEqual(len(res.functions), 1)
        self.assertEqual(res.functions[0].name, "sum")

    def test_python_parser(self):
        code = """
        import sys
        from pathlib import Path
        
        CONSTANT = "debug"
        
        class Runner:
            def run(self, cmd: str) -> bool:
                return True
                
        def start():
            print("starting")
        """
        py_file = self.test_dir / "runner.py"
        py_file.write_text(code, encoding="utf-8")
        
        res = parse_file(str(py_file))
        self.assertTrue(res.parse_success)
        self.assertEqual(res.language, "python")
        
        # Imports
        self.assertEqual(len(res.imports), 2)
        self.assertEqual(res.imports[0].module, "sys")
        
        # Classes
        self.assertEqual(len(res.classes), 1)
        self.assertEqual(res.classes[0].name, "Runner")
        
        # Variables
        self.assertEqual(len(res.variables), 1)
        self.assertEqual(res.variables[0].name, "CONSTANT")

if __name__ == "__main__":
    unittest.main()
