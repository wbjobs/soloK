from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AnnotationViewSet, AnnotationHistoryViewSet,
    NegotiationViewSet, KappaCalculationView
)

router = DefaultRouter()
router.register(r'annotations', AnnotationViewSet)
router.register(r'history', AnnotationHistoryViewSet)
router.register(r'negotiations', NegotiationViewSet)

urlpatterns = [
    path('kappa/', KappaCalculationView.as_view(), name='kappa-calculation'),
    path('', include(router.urls)),
]
