"""Routes: JSON API under /api/, everything else serves the built React app."""

from django.conf import settings
from django.http import FileResponse, HttpRequest, HttpResponse
from django.urls import include, path, re_path


def spa_index(request: HttpRequest) -> HttpResponse:
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse(
            "Frontend not built. Run `npm run build` in frontend/.",
            status=503,
            content_type="text/plain",
        )
    return FileResponse(index.open("rb"), content_type="text/html")


urlpatterns = [
    path("api/", include("trips.api.urls")),
    re_path(r"^(?!api/|static/).*$", spa_index, name="spa"),
]
