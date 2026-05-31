from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AudioSegmentViewSet

router = DefaultRouter()
router.register(r'segments', AudioSegmentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
