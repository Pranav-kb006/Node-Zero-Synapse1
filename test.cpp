#include <iostream>

namespace MyMath {
    class Calculator {
    public:
        int add(int a, int b) {
            return a + b;
        }

        int multiply(int x, int y) {
            int result = 0;
            for(int i = 0; i < y; i++) {
                result += x;
            }
            return result;
        }
    };
}

int main() {
    MyMath::Calculator calc;
    std::cout << calc.add(5, 3) << std::endl;
    return 0;
}
