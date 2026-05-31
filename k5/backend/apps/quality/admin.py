from django.contrib import admin
from .models import QualityReview, QualityReport, AnnotationConsistency


@admin.register(QualityReview)
class QualityReviewAdmin(admin.ModelAdmin):
    list_display = [
        'audio_segment', 'overall_quality', 'quality_score',
        'kappa_score', 'is_approved', 'reviewed_by', 'reviewed_at'
    ]
    list_filter = ['overall_quality', 'is_approved', 'created_at', 'reviewed_at']
    search_fields = ['audio_segment__filename', 'comments']
    readonly_fields = ['created_at', 'updated_at', 'reviewed_at']


@admin.register(QualityReport)
class QualityReportAdmin(admin.ModelAdmin):
    list_display = [
        'report_type', 'start_date', 'end_date',
        'total_annotations', 'completed_annotations',
        'avg_kappa_score', 'generated_by', 'created_at'
    ]
    list_filter = ['report_type', 'start_date', 'end_date', 'created_at']
    search_fields = ['generated_by__username']
    readonly_fields = ['created_at']


@admin.register(AnnotationConsistency)
class AnnotationConsistencyAdmin(admin.ModelAdmin):
    list_display = [
        'audio_segment', 'overall_kappa', 'phoneme_kappa',
        'tone_kappa', 'agreement_rate', 'disagreement_count', 'calculated_at'
    ]
    list_filter = ['calculated_at']
    search_fields = ['audio_segment__filename']
    readonly_fields = ['calculated_at']
