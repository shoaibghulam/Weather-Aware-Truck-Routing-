from django.urls import path

from trips.api.views import GeocodeView, HealthView, HeatmapView, PlanTripView

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("geocode", GeocodeView.as_view(), name="geocode"),
    path("trips/plan", PlanTripView.as_view(), name="plan-trip"),
    path("trips/heatmap", HeatmapView.as_view(), name="heatmap"),
]
