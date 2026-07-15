import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.middleware.body_limit import RequestBodyLimitMiddleware


class RequestBodyLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.add_middleware(RequestBodyLimitMiddleware, max_bytes=16)

        @app.post("/echo")
        async def echo(request: Request):
            return {"size": len(await request.body())}

        self.client = TestClient(app)

    def test_allows_small_request(self):
        response = self.client.post("/echo", content=b"small")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"size": 5})

    def test_rejects_declared_oversized_request(self):
        response = self.client.post("/echo", content=b"x" * 17)
        self.assertEqual(response.status_code, 413)


if __name__ == "__main__":
    unittest.main()
