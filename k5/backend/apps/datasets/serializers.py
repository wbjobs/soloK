from rest_framework import serializers
from .models import Dataset, DatasetExport
from apps.dialects.serializers import DialectRegionSerializer, DialectSubregionSerializer
from apps.accounts.serializers import UserSerializer


class DatasetSerializer(serializers.ModelSerializer):
    format_display = serializers.CharField(source='get_format_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    speaker_gender_display = serializers.CharField(source='get_speaker_gender_display', read_only=True)
    speaker_age_display = serializers.CharField(source='get_speaker_age_display', read_only=True)
    dialect_info = DialectRegionSerializer(source='dialect', read_only=True)
    subregion_info = DialectSubregionSerializer(source='subregion', read_only=True)
    created_by_info = UserSerializer(source='created_by', read_only=True)
    audio_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Dataset
        fields = [
            'id', 'name', 'description', 'dialect', 'dialect_info',
            'subregion', 'subregion_info', 'speaker_gender', 'speaker_gender_display',
            'speaker_age', 'speaker_age_display', 'min_duration', 'max_duration',
            'min_quality_score', 'format', 'format_display', 'include_audio',
            'status', 'status_display', 'total_files', 'file_size',
            'download_url', 'audio_count', 'created_by', 'created_by_info',
            'expires_at', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'status', 'total_files', 'file_size', 'download_url',
            'created_by', 'expires_at', 'created_at', 'updated_at', 'audio_count'
        ]


class DatasetCreateSerializer(serializers.ModelSerializer):
    audio_segment_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list
    )

    class Meta:
        model = Dataset
        fields = [
            'name', 'description', 'dialect', 'subregion', 'speaker_gender',
            'speaker_age', 'min_duration', 'max_duration', 'min_quality_score',
            'format', 'include_audio', 'audio_segment_ids'
        ]


class DatasetFilterSerializer(serializers.Serializer):
    dialect = serializers.UUIDField(required=False)
    subregion = serializers.UUIDField(required=False)
    speaker_gender = serializers.CharField(required=False)
    speaker_age = serializers.CharField(required=False)
    min_duration = serializers.FloatField(required=False)
    max_duration = serializers.FloatField(required=False)
    min_quality_score = serializers.FloatField(required=False)
    search = serializers.CharField(required=False)


class DatasetExportSerializer(serializers.ModelSerializer):
    format_display = serializers.CharField(source='get_format_display', read_only=True)
    dataset_info = DatasetSerializer(source='dataset', read_only=True)
    exported_by_info = UserSerializer(source='exported_by', read_only=True)

    class Meta:
        model = DatasetExport
        fields = [
            'id', 'dataset', 'dataset_info', 'exported_by', 'exported_by_info',
            'format', 'format_display', 'download_url', 'file_size',
            'file_count', 'expires_at', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class DatasetExportRequestSerializer(serializers.Serializer):
    format = serializers.ChoiceField(choices=Dataset.FORMAT_CHOICES, default='both')
    expires_hours = serializers.IntegerField(default=24, min_value=1, max_value=168)
