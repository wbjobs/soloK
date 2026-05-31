from django.contrib import admin
from .models import Dataset, DatasetExport


class AudioSegmentsInline(admin.TabularInline):
    model = Dataset.audio_segments.through
    extra = 0


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'dialect', 'subregion', 'speaker_gender', 'speaker_age',
        'format', 'status', 'total_files', 'file_size', 'created_by', 'created_at'
    ]
    list_filter = [
        'dialect', 'subregion', 'speaker_gender', 'speaker_age',
        'format', 'status', 'created_at'
    ]
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'download_url', 'file_path', 'created_at', 'updated_at']
    inlines = [AudioSegmentsInline]


@admin.register(DatasetExport)
class DatasetExportAdmin(admin.ModelAdmin):
    list_display = [
        'dataset', 'format', 'file_count', 'file_size',
        'exported_by', 'expires_at', 'created_at'
    ]
    list_filter = ['format', 'created_at']
    search_fields = ['dataset__name', 'exported_by__username']
    readonly_fields = ['download_url', 'file_path', 'created_at']
