from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    DialectRegionViewSet, DialectSubregionViewSet,
    PhonemeInventoryViewSet, ToneSystemView
)

router = DefaultRouter()
router.register(r'regions', DialectRegionViewSet)
router.register(r'subregions', DialectSubregionViewSet)
router.register(r'phonemes', PhonemeInventoryViewSet)

urlpatterns = [
    path('tone-systems/', ToneSystemView.as_view(), name='tone-systems'),
    path('', include(router.urls)),
]
