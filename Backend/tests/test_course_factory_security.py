import socket
import unittest
from unittest.mock import patch

from app.services.course_factory import _validate_public_http_url, extract_url_source


class CourseFactoryUrlSecurityTests(unittest.TestCase):
    def test_rejects_loopback_ip(self):
        with self.assertRaisesRegex(ValueError, "Private or local"):
            _validate_public_http_url("http://127.0.0.1:8000/admin")

    def test_rejects_hostname_resolving_to_private_network(self):
        private_result = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.20.30.40", 443)),
        ]
        with patch("app.services.course_factory.socket.getaddrinfo", return_value=private_result):
            with self.assertRaisesRegex(ValueError, "Private or local"):
                _validate_public_http_url("https://courses.example.test/path")

    def test_rejects_credentials_in_url(self):
        with self.assertRaisesRegex(ValueError, "credentials"):
            extract_url_source("https://user:password@example.com/course")

    def test_accepts_public_resolved_address(self):
        public_result = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
        ]
        with patch("app.services.course_factory.socket.getaddrinfo", return_value=public_result):
            self.assertEqual(
                _validate_public_http_url("https://example.com/course"),
                "https://example.com/course",
            )


if __name__ == "__main__":
    unittest.main()
