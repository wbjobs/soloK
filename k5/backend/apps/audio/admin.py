from django.contrib import admin
from .models import AudioSegment


@admin.register(AudioSegment)
class AudioSegmentAdmin(admin.ModelAdmin):
    list_display = [
        'filename', 'dialect', 'subregion', 'duration', 'status',
        'speaker_gender', 'speaker_age', 'completed_annotations',
        'quality_score', 'uploaded_by', 'created_at'
    ]
    list_filter = [
        'dialect', 'subregion', 'status', 'speaker_gender',
        'speaker_age', 'is_active', 'created_at'
    ]
    search_fields = ['filename', 'original_filename', 'text_transcript']
    readonly_fields = [
        'id', 'file_path', 'file_size', 'processed_at',
        'waveform_data', 'spectrogram_data', 'initial_phonemes',
        'completed_annotations', 'created_at', 'updated_at'
    ]
    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'filename', 'original_filename', 'file_path', 'file_size')
        }),
        ('Audio Properties', {
            'fields': ('duration', 'sample_rate', 'channels')
        }),
        ('Metadata', {
            'fields': ('dialect', 'subregion', 'speaker_gender', 'speaker_age', 'text_transcript')
        }),
        ('Status', {
            'fields': ('status', 'uploaded_by', 'assigned_annotators', 'required_annotations', 'completed_annotations', 'quality_score')
        }),
        ('Processed Data', {
            'fields': ('processed_at', 'waveform_data', 'spectrogram_data', 'initial_phonemes'),
            'classes': ('collapse',)
        }),
        ('System', {
            'fields': ('is_active', 'created_at', 'updated_at')
        }),
    )
    actions = ['mark_processed', 'mark_completed']

    def mark_processed(self, request, queryset):
        queryset.update(status='processed')
    mark_processed.short_description = 'Mark selected as processed'

    def mark_completed(self, request, queryset):
        queryset.update(status='completed')
    mark_completed.short_description = 'Mark selected as completed'
