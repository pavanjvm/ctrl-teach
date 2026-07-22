from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.utils import ssl_trust


class SslTrustTests(unittest.TestCase):
    def test_preserves_explicit_ca_configuration(self) -> None:
        with (
            patch.dict(os.environ, {"SSL_CERT_FILE": "/custom/ca.pem"}, clear=True),
            patch.object(ssl_trust.ssl, "get_default_verify_paths") as get_paths,
        ):
            self.assertIsNone(ssl_trust.configure_ca_bundle())
            self.assertEqual(os.environ["SSL_CERT_FILE"], "/custom/ca.pem")
            get_paths.assert_not_called()

    def test_keeps_available_system_trust_store(self) -> None:
        paths = SimpleNamespace(cafile="/system/ca.pem", capath=None)
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(ssl_trust.ssl, "get_default_verify_paths", return_value=paths),
        ):
            self.assertIsNone(ssl_trust.configure_ca_bundle())
            self.assertNotIn("SSL_CERT_FILE", os.environ)

    def test_uses_certifi_when_python_has_no_ca_store(self) -> None:
        paths = SimpleNamespace(cafile=None, capath=None)
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(ssl_trust.ssl, "get_default_verify_paths", return_value=paths),
            patch.object(ssl_trust.certifi, "where", return_value="/certifi/cacert.pem"),
            patch.object(ssl_trust.os.path, "isfile", return_value=True),
        ):
            self.assertEqual(
                ssl_trust.configure_ca_bundle(),
                "/certifi/cacert.pem",
            )
            self.assertEqual(os.environ["SSL_CERT_FILE"], "/certifi/cacert.pem")


if __name__ == "__main__":
    unittest.main()
