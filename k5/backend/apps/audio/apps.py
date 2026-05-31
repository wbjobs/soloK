from django.apps import AppConfig


class AudioConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.audio'
    verbose_name = '语音片段管理'
