import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from apps.audio.models import AudioSegment


class Dataset(models.Model):
    FORMAT_CHOICES = (
        ('json', 'JSON'),
        ('textgrid', 'TextGrid'),
        ('both', 'JSON + TextGrid'),
    )

    STATUS_CHOICES = (
        ('creating', '创建中'),
        ('ready', '已就绪'),
        ('exporting', '导出中'),
        ('completed', '已完成'),
        ('failed', '失败'),
    )

    id = models.UUIDField(_('ID'), primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(_('数据集名称'), max_length=200)
    description = models.TextField(_('描述'), blank=True)
    dialect = models.ForeignKey('dialects.DialectRegion', on_delete=models.SET_NULL, null=True, blank=True, related_name='datasets', verbose_name=_('方言片区'))
    subregion = models.ForeignKey('dialects.DialectSubregion', on_delete=models.SET_NULL, null=True, blank=True, related_name='datasets', verbose_name=_('方言子片区'))
    speaker_gender = models.CharField(_('说话人性别'), max_length=20, choices=AudioSegment.GENDER_CHOICES, blank=True)
    speaker_age = models.CharField(_('说话人年龄段'), max_length=20, choices=AudioSegment.AGE_GROUP_CHOICES, blank=True)
    min_duration = models.FloatField(_('最小时长(秒)'), null=True, blank=True)
    max_duration = models.FloatField(_('最大时长(秒)'), null=True, blank=True)
    min_quality_score = models.FloatField(_('最低质量评分'), null=True, blank=True)
    format = models.CharField(_('导出格式'), max_length=20, choices=FORMAT_CHOICES, default='both')
    include_audio = models.BooleanField(_('包含音频文件'), default=False)
    audio_segments = models.ManyToManyField(AudioSegment, related_name='datasets', verbose_name=_('语音片段'))
    status = models.CharField(_('状态'), max_length=20, choices=STATUS_CHOICES, default='creating')
    total_files = models.IntegerField(_('文件总数'), default=0)
    file_size = models.BigIntegerField(_('文件大小(字节)'), default=0)
    download_url = models.CharField(_('下载链接'), max_length=500, blank=True)
    file_path = models.CharField(_('文件路径'), max_length=500, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_datasets', verbose_name=_('创建人'))
    expires_at = models.DateTimeField(_('过期时间'), null=True, blank=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'datasets'
        verbose_name = _('数据集')
        verbose_name_plural = _('数据集')
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def get_filtered_audio(self):
        queryset = self.audio_segments.filter(status='completed', is_active=True)

        if self.dialect:
            queryset = queryset.filter(dialect=self.dialect)
        if self.subregion:
            queryset = queryset.filter(subregion=self.subregion)
        if self.speaker_gender:
            queryset = queryset.filter(speaker_gender=self.speaker_gender)
        if self.speaker_age:
            queryset = queryset.filter(speaker_age=self.speaker_age)
        if self.min_duration:
            queryset = queryset.filter(duration__gte=self.min_duration)
        if self.max_duration:
            queryset = queryset.filter(duration__lte=self.max_duration)
        if self.min_quality_score:
            queryset = queryset.filter(quality_score__gte=self.min_quality_score)

        return queryset

    def update_stats(self):
        audio = self.get_filtered_audio()
        self.total_files = audio.count()
        self.save(update_fields=['total_files', 'updated_at'])


class DatasetExport(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name='exports', verbose_name=_('数据集'))
    exported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='exports', verbose_name=_('导出人'))
    format = models.CharField(_('格式'), max_length=20, choices=Dataset.FORMAT_CHOICES)
    file_path = models.CharField(_('文件路径'), max_length=500)
    download_url = models.CharField(_('下载链接'), max_length=500)
    file_size = models.BigIntegerField(_('文件大小(字节)'))
    file_count = models.IntegerField(_('文件数量'))
    expires_at = models.DateTimeField(_('过期时间'), null=True, blank=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)

    class Meta:
        db_table = 'dataset_exports'
        verbose_name = _('数据集导出')
        verbose_name_plural = _('数据集导出')
        ordering = ['-created_at']

    def __str__(self):
        return f"Export of {self.dataset.name} at {self.created_at}"
