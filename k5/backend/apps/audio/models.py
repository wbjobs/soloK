import uuid
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from apps.dialects.models import DialectRegion, DialectSubregion


class AudioSegment(models.Model):
    STATUS_CHOICES = (
        ('pending', '待处理'),
        ('processed', '已处理'),
        ('assigned', '已分配'),
        ('annotating', '标注中'),
        ('reviewing', '审核中'),
        ('completed', '已完成'),
        ('rejected', '已拒绝'),
    )

    GENDER_CHOICES = (
        ('male', '男'),
        ('female', '女'),
        ('other', '其他'),
        ('unknown', '未知'),
    )

    AGE_GROUP_CHOICES = (
        ('child', '儿童(0-12)'),
        ('teen', '青少年(13-18)'),
        ('young', '青年(19-35)'),
        ('middle', '中年(36-55)'),
        ('senior', '老年(56+)'),
        ('unknown', '未知'),
    )

    id = models.UUIDField(_('ID'), primary_key=True, default=uuid.uuid4, editable=False)
    dialect = models.ForeignKey(DialectRegion, on_delete=models.CASCADE, related_name='dialect_audio', verbose_name=_('方言片区'))
    subregion = models.ForeignKey(DialectSubregion, on_delete=models.SET_NULL, null=True, blank=True, related_name='subregion_audio', verbose_name=_('方言子片区'))
    filename = models.CharField(_('文件名'), max_length=255)
    original_filename = models.CharField(_('原始文件名'), max_length=255)
    file_path = models.CharField(_('文件路径'), max_length=500)
    file_size = models.BigIntegerField(_('文件大小(字节)'))
    duration = models.FloatField(_('时长(秒)'))
    sample_rate = models.IntegerField(_('采样率'), default=16000)
    channels = models.IntegerField(_('声道数'), default=1)
    speaker_gender = models.CharField(_('说话人性别'), max_length=20, choices=GENDER_CHOICES, default='unknown')
    speaker_age = models.CharField(_('说话人年龄段'), max_length=20, choices=AGE_GROUP_CHOICES, default='unknown')
    text_transcript = models.TextField(_('文本转录'), blank=True)
    status = models.CharField(_('状态'), max_length=20, choices=STATUS_CHOICES, default='pending')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='uploaded_audio', verbose_name=_('上传者'))
    processed_at = models.DateTimeField(_('处理时间'), null=True, blank=True)
    waveform_data = models.JSONField(_('波形数据'), null=True, blank=True)
    spectrogram_data = models.JSONField(_('频谱图数据'), null=True, blank=True)
    initial_phonemes = models.JSONField(_('初始音素标注'), null=True, blank=True)
    speaker_embedding = models.JSONField(_('说话人特征向量'), null=True, blank=True)
    speaker_embedding_model = models.CharField(_('特征提取模型'), max_length=50, blank=True, default='')
    asr_transcript = models.TextField(_('ASR自动转写文本'), blank=True, default='')
    asr_segments = models.JSONField(_('ASR分段结果'), null=True, blank=True)
    asr_success = models.BooleanField(_('ASR是否成功'), default=False)
    assigned_annotators = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='assigned_audio', blank=True, verbose_name=_('分配的标注员'))
    required_annotations = models.IntegerField(_('需要的标注数量'), default=2)
    completed_annotations = models.IntegerField(_('已完成的标注数量'), default=0)
    quality_score = models.FloatField(_('质量评分'), null=True, blank=True)
    is_active = models.BooleanField(_('是否激活'), default=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'audio_segments'
        verbose_name = _('语音片段')
        verbose_name_plural = _('语音片段')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['dialect', 'status']),
            models.Index(fields=['speaker_gender', 'speaker_age']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.filename} ({self.duration:.2f}s)"

    def get_audio_url(self):
        from utils.minio_client import minio_client
        return minio_client.get_file_url(settings.MINIO_CONFIG['bucket_audio'], self.file_path)

    def update_completed_annotations(self):
        from apps.annotations.models import Annotation
        self.completed_annotations = Annotation.objects.filter(
            audio_segment=self,
            status='completed'
        ).count()
        if self.completed_annotations >= self.required_annotations:
            self.status = 'reviewing'
        elif self.completed_annotations > 0:
            self.status = 'annotating'
        self.save(update_fields=['completed_annotations', 'status', 'updated_at'])

    def assign_annotators(self, annotators):
        self.assigned_annotators.set(annotators)
        self.status = 'assigned'
        self.save(update_fields=['status', 'updated_at'])
