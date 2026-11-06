"""Errors raised by third-party providers, mapped to the API error envelope by the views."""


class ProviderError(Exception):
    """An upstream service failed or rejected the request.

    `code` is a stable machine-readable identifier; `message` is safe to show to users
    (never includes upstream bodies or keys); `status` is the HTTP status to return.
    """

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
