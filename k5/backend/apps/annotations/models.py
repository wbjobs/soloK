from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from apps.audio.models import AudioSegment


class Annotation(models.Model):
    STATUS_CHOICES = (
        ('in_progress', '进行中'),
        ('submitted', '已提交'),
        ('completed', '已完成'),
        ('rejected', '已拒绝'),
        ('negotiating', '协商中'),
    )

    id = models.BigAutoField(_('ID'), primary_key=True)
    audio_segment = models.ForeignKey(AudioSegment, on_delete=models.CASCADE, related_name='annotations', verbose_name=_('语音片段'))
    annotator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='my_annotations', verbose_name=_('标注员'))
    status = models.CharField(_('状态'), max_length=20, choices=STATUS_CHOICES, default='in_progress')
    phonemes = models.JSONField(_('音素标注'), default=list)
    display_mode = models.CharField(_('显示模式'), max_length=10, choices=[('pinyin', '拼音'), ('ipa', 'IPA')], default='pinyin')
    notes = models.TextField(_('标注备注'), blank=True)
    time_spent = models.FloatField(_('花费时间(秒)'), default=0.0)
    quality_score = models.FloatField(_('质量评分'), null=True, blank=True)
    kappa_score = models.FloatField(_('Kappa系数'), null=True, blank=True)
    agreement_rate = models.FloatField(_('一致性比率'), null=True, blank=True)
    submitted_at = models.DateTimeField(_('提交时间'), null=True, blank=True)
    completed_at = models.DateTimeField(_('完成时间'), null=True, blank=True)
    is_active = models.BooleanField(_('是否激活'), default=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'annotations'
        verbose_name = _('标注')
        verbose_name_plural = _('标注')
        ordering = ['-created_at']
        unique_together = ['audio_segment', 'annotator']
        indexes = [
            models.Index(fields=['audio_segment', 'status']),
            models.Index(fields=['annotator', 'status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.annotator.username} - {self.audio_segment.filename}"

    def calculate_phoneme_count(self):
        return len(self.phonemes)

    def calculate_total_duration(self):
        if not self.phonemes:
            return 0.0
        return sum(p.get('end_time', 0) - p.get('start_time', 0) for p in self.phonemes)

    def mark_submitted(self):
        from django.utils import timezone
        self.status = 'submitted'
        self.submitted_at = timezone.now()
        self.save(update_fields=['status', 'submitted_at', 'updated_at'])

    def mark_completed(self, kappa_score=None, agreement_rate=None):
        from django.utils import timezone
        self.status = 'completed'
        self.completed_at = timezone.now()
        if kappa_score is not None:
            self.kappa_score = kappa_score
        if agreement_rate is not None:
            self.agreement_rate = agreement_rate
        self.save(update_fields=['status', 'completed_at', 'kappa_score', 'agreement_rate', 'updated_at'])

        self.annotator.update_annotation_stats(self.audio_segment.duration)
        self.audio_segment.update_completed_annotations()

    def mark_negotiating(self):
        self.status = 'negotiating'
        self.save(update_fields=['status', 'updated_at'])


class AnnotationHistory(models.Model):
    ACTION_CHOICES = (
        ('create', '创建'),
        ('update', '更新'),
        ('submit', '提交'),
        ('approve', '批准'),
        ('reject', '拒绝'),
        ('negotiate', '协商'),
    )

    annotation = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name='history', verbose_name=_('标注'))
    action = models.CharField(_('操作'), max_length=20, choices=ACTION_CHOICES)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, verbose_name=_('操作用户'))
    old_value = models.JSONField(_('旧值'), null=True, blank=True)
    new_value = models.JSONField(_('新值'), null=True, blank=True)
    comment = models.TextField(_('备注'), blank=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)

    class Meta:
        db_table = 'annotation_history'
        verbose_name = _('标注历史')
        verbose_name_plural = _('标注历史')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_action_display()} - {self.annotation_id}"


class Negotiation(models.Model):
    STATUS_CHOICES = (
        ('open', '开放中'),
        ('resolved', '已解决'),
        ('closed', '已关闭'),
    )

    annotation1 = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name='negotiation_as_1', verbose_name=_('标注1'))
    annotation2 = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name='negotiation_as_2', verbose_name=_('标注2'))
    audio_segment = models.ForeignKey(AudioSegment, on_delete=models.CASCADE, related_name='negotiations', verbose_name=_('语音片段'))
    disagreements = models.JSONField(_('不一致项'), default=list)
    status = models.CharField(_('状态'), max_length=20, choices=STATUS_CHOICES, default='open')
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_negotiations', verbose_name=_('解决人'))
    resolution_notes = models.TextField(_('解决备注'), blank=True)
    final_annotation = models.JSONField(_('最终标注'), null=True, blank=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'negotiations'
        verbose_name = _('协商记录')
        verbose_name_plural = _('协商记录')
        ordering = ['-created_at']

    def __str__(self):
        return f"Negotiation for {self.audio_segment.filename} - {self.status}"

    def mark_resolved(self, resolved_by, final_annotation, notes=''):
        self.status = 'resolved'
        self.resolved_by = resolved_by
        self.final_annotation = final_annotation
        self.resolution_notes = notes
        self.save(update_fields=['status', 'resolved_by', 'final_annotation', 'resolution_notes', 'updated_at'])

        self.annotation1.mark_completed()
        self.annotation2.mark_completed()
