from django.urls import path

from .views import (
    DashboardOverviewView, AnnotatorProgressView, AnnotatorRankingView,
    DialectStatsView, QualityStatsView, TimelineStatsView,
    NegotiationStatsView, AnnotatorProgressPieView
)

urlpatterns = [
    path('overview/', DashboardOverviewView.as_view(), name='stats-overview'),
    path('annotator-progress/', AnnotatorProgressView.as_view(), name='annotator-progress'),
    path('annotator-progress/pie/', AnnotatorProgressPieView.as_view(), name='annotator-progress-pie'),
    path('annotator-ranking/', AnnotatorRankingView.as_view(), name='annotator-ranking'),
    path('dialects/', DialectStatsView.as_view(), name='dialect-stats'),
    path('quality/', QualityStatsView.as_view(), name='quality-stats'),
    path('timeline/', TimelineStatsView.as_view(), name='timeline-stats'),
    path('negotiations/', NegotiationStatsView.as_view(), name='negotiation-stats'),
]
