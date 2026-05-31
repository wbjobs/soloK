from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    DatasetViewSet, DatasetExportViewSet, DatasetExportAPIView
)

router = DefaultRouter()
router.register(r'datasets', DatasetViewSet)
router.register(r'exports', DatasetExportViewSet)

urlpatterns = [
    path('dataset/<uuid:dataset_id>/export', DatasetExportAPIView.as_view(), name='dataset-export-api'),
    path('', include(router.urls)),
]
