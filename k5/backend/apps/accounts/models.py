from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    ROLE_CHOICES = (
        ('admin', '管理员'),
        ('annotator', '标注员'),
        ('auditor', '审核员'),
    )

    GENDER_CHOICES = (
        ('male', '男'),
        ('female', '女'),
        ('other', '其他'),
    )

    AGE_GROUP_CHOICES = (
        ('child', '儿童(0-12)'),
        ('teen', '青少年(13-18)'),
        ('young', '青年(19-35)'),
        ('middle', '中年(36-55)'),
        ('senior', '老年(56+)'),
    )

    role = models.CharField(_('角色'), max_length=20, choices=ROLE_CHOICES, default='annotator')
    phone = models.CharField(_('手机号'), max_length=20, blank=True)
    avatar = models.ImageField(_('头像'), upload_to='avatars/', blank=True, null=True)
    gender = models.CharField(_('性别'), max_length=10, choices=GENDER_CHOICES, blank=True)
    age_group = models.CharField(_('年龄段'), max_length=20, choices=AGE_GROUP_CHOICES, blank=True)
    dialect_preference = models.CharField(_('偏好方言'), max_length=100, blank=True)
    total_annotations = models.IntegerField(_('标注总数'), default=0)
    total_audio_minutes = models.FloatField(_('标注总时长(分钟)'), default=0.0)
    is_active = models.BooleanField(_('是否激活'), default=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'users'
        verbose_name = _('用户')
        verbose_name_plural = _('用户')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    def update_annotation_stats(self, duration_seconds: float):
        self.total_annotations += 1
        self.total_audio_minutes += duration_seconds / 60
        self.save(update_fields=['total_annotations', 'total_audio_minutes', 'updated_at'])
