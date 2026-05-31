from django.contrib import admin
from .models import Annotation, AnnotationHistory, Negotiation


class AnnotationHistoryInline(admin.TabularInline):
    model = AnnotationHistory
    extra = 0
    readonly_fields = ['action', 'user', 'comment', 'created_at']


@admin.register(Annotation)
class AnnotationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'audio_segment', 'annotator', 'status',
        'phoneme_count', 'kappa_score', 'agreement_rate',
        'time_spent', 'submitted_at', 'completed_at'
    ]
    list_filter = [
        'status', 'display_mode', 'audio_segment__dialect',
        'annotator', 'created_at'
    ]
    search_fields = ['audio_segment__filename', 'annotator__username', 'notes']
    readonly_fields = ['created_at', 'updated_at', 'submitted_at', 'completed_at']
    inlines = [AnnotationHistoryInline]

    def phoneme_count(self, obj):
        return len(obj.phonemes)
    phoneme_count.short_description = '音素数量'


@admin.register(AnnotationHistory)
class AnnotationHistoryAdmin(admin.ModelAdmin):
    list_display = ['annotation', 'action', 'user', 'created_at']
    list_filter = ['action', 'created_at']
    search_fields = ['annotation__id', 'user__username', 'comment']
    readonly_fields = ['created_at']


@admin.register(Negotiation)
class NegotiationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'audio_segment', 'status',
        'annotation1', 'annotation2', 'created_at'
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['audio_segment__filename', 'resolution_notes']
    readonly_fields = ['created_at', 'updated_at']
