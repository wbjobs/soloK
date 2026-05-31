from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    QualityReviewViewSet, QualityReportViewSet,
    AnnotationConsistencyViewSet, KappaInterpretationView,
    QualityDashboardView
)

router = DefaultRouter()
router.register(r'reviews', QualityReviewViewSet)
router.register(r'reports', QualityReportViewSet)
router.register(r'consistency', AnnotationConsistencyViewSet)

urlpatterns = [
    path('dashboard/', QualityDashboardView.as_view(), name='quality-dashboard'),
    path('kappa/interpret/', KappaInterpretationView.as_view(), name='kappa-interpretation'),
    path('', include(router.urls)),
]
