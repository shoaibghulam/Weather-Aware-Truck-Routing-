"""Django settings. All environment-specific values come from env vars (see /.env.example)."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
load_dotenv(REPO_ROOT / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", default=False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false")
    SECRET_KEY = "dev-only-insecure-key"  # noqa: S105 - local development only

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    },
]

# No persistent models: the app is stateless. SQLite keeps Django's internals happy.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Production runs several gunicorn workers: a file cache is shared between them, so weather
# lookups and rate-limit counters are not duplicated per worker. Dev/tests use memory.
CACHE_DIR = os.environ.get("CACHE_DIR", "")
CACHES = {
    "default": (
        {
            "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
            "LOCATION": CACHE_DIR,
            "OPTIONS": {"MAX_ENTRIES": 20000},
        }
        if CACHE_DIR
        else {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "truck-routing",
            "OPTIONS": {"MAX_ENTRIES": 20000},
        }
    )
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": os.environ.get("API_THROTTLE_ANON", "60/min")},
    "UNAUTHENTICATED_USER": None,
    # Trust only the proxy hop(s) in X-Forwarded-For when identifying clients for throttling,
    # otherwise a spoofed header gives every request a fresh rate-limit bucket.
    "NUM_PROXIES": int(os.environ.get("API_NUM_PROXIES", "1")),
    "EXCEPTION_HANDLER": "trips.api.views.api_exception_handler",
}

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
WHITENOISE_USE_FINDERS = DEBUG
# Vite fingerprints build assets (name-<8 char hash>.ext): cache them forever.
WHITENOISE_IMMUTABLE_FILE_TEST = r"^.+-[0-9A-Za-z_-]{8}\.(js|mjs|css|svg|woff2?)$"

# The API is stateless JSON with no cookies, sessions or auth, so there is nothing for CSRF
# to protect; the CSRF middleware is intentionally not installed.
# HSTS subdomains/preload are not ours to set on a shared *.onrender.com host.
SILENCED_SYSTEM_CHECKS = ["security.W003", "security.W005", "security.W021"]

# Third-party providers (server side only)
TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")
# Optional commercial key: per-key quota instead of the free tier's per-IP quota, which shared
# hosting egress IPs can exhaust. With a key, Open-Meteo requires the customer endpoint.
OPEN_METEO_API_KEY = os.environ.get("OPEN_METEO_API_KEY", "")
OPEN_METEO_BASE_URL = os.environ.get(
    "OPEN_METEO_BASE_URL",
    "https://customer-api.open-meteo.com/v1/forecast"
    if OPEN_METEO_API_KEY
    else "https://api.open-meteo.com/v1/forecast",
)
HTTP_TIMEOUT_SECONDS = float(os.environ.get("HTTP_TIMEOUT_SECONDS", "15"))
# TomTom truck routing with alternatives on 1,000+ mile trips can take 10-20 s under load.
ROUTING_TIMEOUT_SECONDS = float(os.environ.get("ROUTING_TIMEOUT_SECONDS", "30"))

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
    SECURE_REDIRECT_EXEMPT = [r"^api/health$"]  # platform health checks use plain HTTP
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
    # httpx logs full request URLs at INFO, which would include the TomTom API key.
    "loggers": {
        "httpx": {"level": "WARNING"},
        "httpcore": {"level": "WARNING"},
    },
}
