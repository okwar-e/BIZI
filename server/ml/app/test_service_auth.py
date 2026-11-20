import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from ml.app.main import require_service_token


def make_request(authorization: str | None = None) -> Request:
    headers = []
    if authorization is not None:
        headers.append((b"authorization", authorization.encode("latin-1")))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/recommend",
            "headers": headers,
            "query_string": b"",
            "server": ("localhost", 8000),
            "client": ("127.0.0.1", 12345),
            "scheme": "http",
        }
    )


class ServiceTokenTests(unittest.TestCase):
    def test_valid_service_token_is_accepted(self):
        with patch.dict(os.environ, {"NODE_ENV": "production", "BIZI_ML_SERVICE_TOKEN": "secret"}):
            require_service_token(make_request("Bearer secret"))

    def test_invalid_or_missing_service_token_is_rejected(self):
        with patch.dict(os.environ, {"NODE_ENV": "production", "BIZI_ML_SERVICE_TOKEN": "secret"}):
            for authorization in (None, "Bearer wrong"):
                with self.subTest(authorization=authorization):
                    with self.assertRaises(HTTPException) as raised:
                        require_service_token(make_request(authorization))
                    self.assertEqual(raised.exception.status_code, 401)

    def test_production_fails_closed_without_a_service_token(self):
        with patch.dict(os.environ, {"NODE_ENV": "production"}):
            os.environ.pop("BIZI_ML_SERVICE_TOKEN", None)
            with self.assertRaises(HTTPException) as raised:
                require_service_token(make_request())
            self.assertEqual(raised.exception.status_code, 503)
