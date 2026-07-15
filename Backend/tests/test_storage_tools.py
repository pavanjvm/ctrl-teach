from __future__ import annotations

import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.tools import storage_tools


def _png_base64() -> str:
    output = io.BytesIO()
    Image.new("RGB", (16, 16), (20, 90, 160)).save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


class StorageToolSecurityTests(unittest.TestCase):
    def test_sanitizes_all_path_components(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.object(
            storage_tools.settings,
            "uploads_dir",
            directory,
        ):
            result = storage_tools.upload_canvas_snapshot(
                "../../outside",
                "../session",
                _png_base64(),
                "../../lesson",
            )
            self.assertEqual(result["status"], "ok")
            self.assertNotIn("..", result["local_path"])
            saved = (Path(directory) / result["local_path"]).resolve()
            self.assertIn(Path(directory).resolve(), saved.parents)
            self.assertTrue(saved.is_file())

    def test_rejects_non_image_payload(self) -> None:
        encoded = base64.b64encode(b"not an image" * 20).decode("ascii")
        with tempfile.TemporaryDirectory() as directory, patch.object(
            storage_tools.settings,
            "uploads_dir",
            directory,
        ):
            result = storage_tools.upload_generated_image(
                "7",
                encoded,
                filename="payload",
                content_type="image/svg+xml",
            )
            self.assertEqual(result["status"], "error")
            self.assertEqual(list(Path(directory).rglob("*")), [])


if __name__ == "__main__":
    unittest.main()
