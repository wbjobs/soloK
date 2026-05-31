from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from apps.audio.models import AudioSegment
from apps.annotations.models import Annotation


class QualityReview(models.Model):
    QUALITY_CHOICES = (
        ('excellent', '优秀'),
        ('good', '良好'),
        ('fair', '一般'),
        ('poor', '较差'),
    )

    audio_segment = models.OneToOneField(AudioSegment, on_delete=models.CASCADE, related_name='quality_review', verbose_name=_('语音片段'))
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='quality_reviews', verbose_name=_('审核人'))
    overall_quality = models.CharField(_('整体质量'), max_length=20, choices=QUALITY_CHOICES, blank=True)
    quality_score = models.FloatField(_('质量评分'), null=True, blank=True)
    kappa_score = models.FloatField(_('Kappa系数'), null=True, blank=True)
    agreement_rate = models.FloatField(_('一致性比率'), null=True, blank=True)
    comments = models.TextField(_('审核备注'), blank=True)
    issues_found = models.JSONField(_('发现的问题'), default=list)
    is_approved = models.BooleanField(_('是否通过'), default=False)
    reviewed_at = models.DateTimeField(_('审核时间'), null=True, blank=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'quality_reviews'
        verbose_name = _('质量审核')
        verbose_name_plural = _('质量审核')
        ordering = ['-created_at']

    def __str__(self):
        return f"Quality Review for {self.audio_segment.filename}"

    def mark_reviewed(self, reviewed_by, quality_score=None, is_approved=True, comments=''):
        from django.utils import timezone
        self.reviewed_by = reviewed_by
        self.quality_score = quality_score
        self.is_approved = is_approved
        self.comments = comments
        self.reviewed_at = timezone.now()
        self.save()

        if is_approved:
            self.audio_segment.status = 'completed'
            self.audio_segment.quality_score = quality_score
            self.audio_segment.save(update_fields=['status', 'quality_score', 'updated_at'])


class QualityReport(models.Model):
    TYPE_CHOICES = (
        ('daily', '日报'),
        ('weekly', '周报'),
        ('monthly', '月报'),
        ('custom', '自定义'),
    )

    report_type = models.CharField(_('报告类型'), max_length=20, choices=TYPE_CHOICES, default='daily')
    start_date = models.DateField(_('开始日期'))
    end_date = models.DateField(_('结束日期'))
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='generated_reports', verbose_name=_('生成人'))
    total_annotations = models.IntegerField(_('总标注数'), default=0)
    completed_annotations = models.IntegerField(_('已完成标注数'), default=0)
    avg_kappa_score = models.FloatField(_('平均Kappa系数'), null=True, blank=True)
    avg_agreement_rate = models.FloatField(_('平均一致性比率'), null=True, blank=True)
    avg_quality_score = models.FloatField(_('平均质量评分'), null=True, blank=True)
    issues_count = models.JSONField(_('问题统计'), default=dict)
    annotator_stats = models.JSONField(_('标注员统计'), default=list)
    dialect_stats = models.JSONField(_('方言统计'), default=list)
    file_path = models.CharField(_('报告文件路径'), max_length=500, blank=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)

    class Meta:
        db_table = 'quality_reports'
        verbose_name = _('质量报告')
        verbose_name_plural = _('质量报告')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_report_type_display()} - {self.start_date} to {self.end_date}"


class AnnotationConsistency(models.Model):
    annotation1 = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name='consistency_as_1', verbose_name=_('标注1'))
    annotation2 = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name='consistency_as_2', verbose_name=_('标注2'))
    audio_segment = models.ForeignKey(AudioSegment, on_delete=models.CASCADE, related_name='consistency_checks', verbose_name=_('语音片段'))
    phoneme_kappa = models.FloatField(_('音素Kappa'))
    tone_kappa = models.FloatField(_('声调Kappa'))
    overall_kappa = models.FloatField(_('整体Kappa'))
    agreement_rate = models.FloatField(_('一致性比率'))
    disagreement_count = models.IntegerField(_('不一致数量'))
    disagreements = models.JSONField(_('不一致详情'), default=list)
    calculated_at = models.DateTimeField(_('计算时间'), auto_now_add=True)

    class Meta:
        db_table = 'annotation_consistency'
        verbose_name = _('标注一致性')
        verbose_name_plural = _('标注一致性')
        ordering = ['-calculated_at']

    def __str__(self):
        return f"Consistency: {self.overall_kappa:.4f} for {self.audio_segment.filename}"
