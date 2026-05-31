from rest_framework import serializers
from .models import Annotation, AnnotationHistory, Negotiation
from apps.audio.serializers import AudioSegmentSerializer, AudioSegmentDetailSerializer
from apps.accounts.serializers import UserSerializer


class PhonemeSerializer(serializers.Serializer):
    start_time = serializers.FloatField(required=True)
    end_time = serializers.FloatField(required=True)
    phoneme = serializers.CharField(required=True, allow_blank=True)
    pinyin = serializers.CharField(required=False, allow_blank=True)
    ipa = serializers.CharField(required=False, allow_blank=True)
    tone = serializers.IntegerField(required=False, allow_null=True)
    confidence = serializers.FloatField(required=False, default=1.0)
    is_disagreement = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs['end_time'] <= attrs['start_time']:
            raise serializers.ValidationError("End time must be greater than start time")
        return attrs


class AnnotationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    display_mode_display = serializers.CharField(source='get_display_mode_display', read_only=True)
    audio_segment_info = AudioSegmentSerializer(source='audio_segment', read_only=True)
    annotator_info = UserSerializer(source='annotator', read_only=True)
    phoneme_count = serializers.IntegerField(source='calculate_phoneme_count', read_only=True)

    class Meta:
        model = Annotation
        fields = [
            'id', 'audio_segment', 'audio_segment_info', 'annotator', 'annotator_info',
            'status', 'status_display', 'display_mode', 'display_mode_display',
            'phonemes', 'phoneme_count', 'notes', 'time_spent',
            'quality_score', 'kappa_score', 'agreement_rate',
            'submitted_at', 'completed_at', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'annotator', 'submitted_at', 'completed_at',
            'created_at', 'updated_at', 'quality_score', 'kappa_score', 'agreement_rate'
        ]

    def validate_phonemes(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Phonemes must be a list")

        for i, phoneme in enumerate(value):
            serializer = PhonemeSerializer(data=phoneme)
            if not serializer.is_valid():
                raise serializers.ValidationError(f"Phoneme at index {i}: {serializer.errors}")

        return value


class AnnotationDetailSerializer(AnnotationSerializer):
    audio_segment_info = AudioSegmentDetailSerializer(source='audio_segment', read_only=True)


class AnnotationUpdateSerializer(serializers.ModelSerializer):
    phonemes = serializers.ListField(child=PhonemeSerializer(), required=True)

    class Meta:
        model = Annotation
        fields = ['phonemes', 'display_mode', 'notes', 'time_spent']


class AnnotationSubmitSerializer(serializers.Serializer):
    time_spent = serializers.FloatField(required=False, default=0.0)
    notes = serializers.CharField(required=False, allow_blank=True)


class AnnotationHistorySerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    user_info = UserSerializer(source='user', read_only=True)

    class Meta:
        model = AnnotationHistory
        fields = [
            'id', 'annotation', 'action', 'action_display',
            'user', 'user_info', 'old_value', 'new_value',
            'comment', 'created_at'
        ]


class DisagreementSerializer(serializers.Serializer):
    index = serializers.IntegerField()
    annotator1 = PhonemeSerializer()
    annotator2 = PhonemeSerializer()
    time_diff = serializers.FloatField()
    phoneme_mismatch = serializers.BooleanField()
    tone_mismatch = serializers.BooleanField()
    time_mismatch = serializers.BooleanField()


class NegotiationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    annotation1_info = AnnotationSerializer(source='annotation1', read_only=True)
    annotation2_info = AnnotationSerializer(source='annotation2', read_only=True)
    audio_segment_info = AudioSegmentSerializer(source='audio_segment', read_only=True)
    resolved_by_info = UserSerializer(source='resolved_by', read_only=True)
    disagreements = DisagreementSerializer(many=True, read_only=True)

    class Meta:
        model = Negotiation
        fields = [
            'id', 'annotation1', 'annotation1_info', 'annotation2', 'annotation2_info',
            'audio_segment', 'audio_segment_info', 'disagreements',
            'status', 'status_display', 'resolved_by', 'resolved_by_info',
            'resolution_notes', 'final_annotation', 'created_at', 'updated_at'
        ]


class NegotiationResolveSerializer(serializers.Serializer):
    final_annotation = serializers.ListField(child=PhonemeSerializer(), required=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class AnnotationProgressSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    submitted = serializers.IntegerField()
    completed = serializers.IntegerField()
    rejected = serializers.IntegerField()
    negotiating = serializers.IntegerField()
    completion_rate = serializers.FloatField()
