from rest_framework import serializers
from .models import QualityReview, QualityReport, AnnotationConsistency
from apps.audio.serializers import AudioSegmentSerializer
from apps.accounts.serializers import UserSerializer


class QualityReviewSerializer(serializers.ModelSerializer):
    overall_quality_display = serializers.CharField(source='get_overall_quality_display', read_only=True)
    audio_segment_info = AudioSegmentSerializer(source='audio_segment', read_only=True)
    reviewed_by_info = UserSerializer(source='reviewed_by', read_only=True)

    class Meta:
        model = QualityReview
        fields = [
            'id', 'audio_segment', 'audio_segment_info', 'reviewed_by', 'reviewed_by_info',
            'overall_quality', 'overall_quality_display', 'quality_score',
            'kappa_score', 'agreement_rate', 'comments', 'issues_found',
            'is_approved', 'reviewed_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'reviewed_at']


class QualityReportSerializer(serializers.ModelSerializer):
    report_type_display = serializers.CharField(source='get_report_type_display', read_only=True)
    generated_by_info = UserSerializer(source='generated_by', read_only=True)

    class Meta:
        model = QualityReport
        fields = [
            'id', 'report_type', 'report_type_display', 'start_date', 'end_date',
            'generated_by', 'generated_by_info', 'total_annotations',
            'completed_annotations', 'avg_kappa_score', 'avg_agreement_rate',
            'avg_quality_score', 'issues_count', 'annotator_stats',
            'dialect_stats', 'file_path', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class AnnotationConsistencySerializer(serializers.ModelSerializer):
    audio_segment_info = AudioSegmentSerializer(source='audio_segment', read_only=True)

    class Meta:
        model = AnnotationConsistency
        fields = [
            'id', 'audio_segment', 'audio_segment_info',
            'phoneme_kappa', 'tone_kappa', 'overall_kappa',
            'agreement_rate', 'disagreement_count', 'disagreements',
            'calculated_at'
        ]
        read_only_fields = ['id', 'calculated_at']


class QualityReviewCreateSerializer(serializers.Serializer):
    audio_segment_id = serializers.UUIDField(required=True)
    overall_quality = serializers.ChoiceField(choices=QualityReview.QUALITY_CHOICES, required=False)
    quality_score = serializers.FloatField(min_value=0, max_value=100, required=False)
    comments = serializers.CharField(required=False, allow_blank=True)
    issues_found = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    is_approved = serializers.BooleanField(default=True)


class QualityReportGenerateSerializer(serializers.Serializer):
    report_type = serializers.ChoiceField(choices=QualityReport.TYPE_CHOICES, default='daily')
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
