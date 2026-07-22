import math
import unittest

from app.tools.plot_tools import _evaluate_math_expression, _parse_math_expression


class PlotExpressionSecurityTests(unittest.TestCase):
    def test_supported_math_expression(self):
        parsed = _parse_math_expression("sin(x) + x**2 + pi")
        result = _evaluate_math_expression(parsed, 2.0)
        self.assertAlmostEqual(result, math.sin(2.0) + 4.0 + math.pi)

    def test_rejects_python_object_traversal(self):
        hostile = (
            "().__class__.__bases__[0].__subclasses__()"
        )
        with self.assertRaises(ValueError):
            _parse_math_expression(hostile)

    def test_rejects_imports_and_lambdas(self):
        for hostile in ('__import__("os")', "(lambda: 1)()"):
            with self.subTest(hostile=hostile), self.assertRaises(ValueError):
                _parse_math_expression(hostile)

    def test_rejects_unbounded_power(self):
        parsed = _parse_math_expression("10**1001")
        with self.assertRaises(ValueError):
            _evaluate_math_expression(parsed, 0.0)


if __name__ == "__main__":
    unittest.main()
