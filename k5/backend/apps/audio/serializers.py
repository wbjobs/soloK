from rest_framework import serializers
from .models import AudioSegment
from apps.dialects.serializers import DialectRegionSerializer, DialectSubregionSerializer
from apps.accounts.serializers import UserSerializer


class AudioSegmentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    speaker_gender_display = serializers.CharField(source='get_speaker_gender_display', read_only=True)
    speaker_age_display = serializers.CharField(source='get_speaker_age_display', read_only=True)
    dialect_name = serializers.CharField(source='dialect.name', read_only=True)
    subregion_name = serializers.CharField(source='subregion.name', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = AudioSegment
        fields = [
            'id', 'dialect', 'dialect_name', 'subregion', 'subregion_name',
            'filename', 'original_filename', 'duration', 'sample_rate', 'channels',
            'speaker_gender', 'speaker_gender_display', 'speaker_age', 'speaker_age_display',
            'text_transcript', 'status', 'status_display', 'uploaded_by', 'uploaded_by_name',
            'processed_at', 'required_annotations', 'completed_annotations',
            'quality_score', 'is_active', 'created_at', 'updated_at', 'audio_url',
            'asr_transcript', 'asr_success', 'speaker_embedding_model'
        ]
        read_only_fields = [
            'id', 'file_path', 'file_size', 'processed_at', 'uploaded_by',
            'completed_annotations', 'created_at', 'updated_at', 'audio_url'
        ]

    def get_audio_url(self, obj):
        request = self.context.get('request')
        if request and hasattr(obj, 'get_audio_url'):
            return obj.get_audio_url()
        return None


class AudioSegmentDetailSerializer(AudioSegmentSerializer):
    dialect = DialectRegionSerializer(read_only=True)
    subregion = DialectSubregionSerializer(read_only=True)
    uploaded_by = UserSerializer(read_only=True)
    assigned_annotators = UserSerializer(many=True, read_only=True)

    class Meta(AudioSegmentSerializer.Meta):
        fields = AudioSegmentSerializer.Meta.fields + [
            'waveform_data', 'spectrogram_data', 'initial_phonemes', 'assigned_annotators'
        ]


class AudioSegmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AudioSegment
        fields = [
            'dialect', 'subregion', 'speaker_gender', 'speaker_age',
            'text_transcript', 'required_annotations'
        ]


class AudioSegmentUploadSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    dialect = serializers.PrimaryKeyRelatedField(queryset=AudioSegment._meta.get_field('dialect').related_model.objects.all(), required=True)
    subregion = serializers.PrimaryKeyRelatedField(queryset=AudioSegment._meta.get_field('subregion').related_model.objects.all(), required=False, allow_null=True)
    speaker_gender = serializers.ChoiceField(choices=AudioSegment.GENDER_CHOICES, default='unknown')
    speaker_age = serializers.ChoiceField(choices=AudioSegment.AGE_GROUP_CHOICES, default='unknown')
    text_transcript = serializers.CharField(required=False, allow_blank=True)
    required_annotations = serializers.IntegerField(default=2, min_value=1, max_value=5)


class AudioSegmentProcessSerializer(serializers.Serializer):
    auto_detect_phonemes = serializers.BooleanField(default=True)
    generate_waveform = serializers.BooleanField(default=True)
    generate_spectrogram = serializers.BooleanField(default=True)


class AudioSegmentAssignSerializer(serializers.Serializer):
    annotator_ids = serializers.ListField(child=serializers.IntegerField(), required=True)
