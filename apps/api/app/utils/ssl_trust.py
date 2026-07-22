"""Configure a secure CA fallback for Python installations without one."""

from __future__ import annotations

import os
import ssl

import certifi


def configure_ca_bundle() -> str | None:
    """Use certifi when Python cannot find a system CA file or directory.

    Explicit operator configuration always wins. The fallback keeps certificate
    verification enabled and primarily covers python.org macOS installations
    whose optional certificate-install step has not been run.
    """
    if os.environ.get("SSL_CERT_FILE") or os.environ.get("SSL_CERT_DIR"):
        return None

    verify_paths = ssl.get_default_verify_paths()
    if verify_paths.cafile or verify_paths.capath:
        return None

    bundle = certifi.where()
    if not os.path.isfile(bundle):
        return None

    os.environ["SSL_CERT_FILE"] = bundle
    return bundle
