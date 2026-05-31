from django.db import models
from django.utils.translation import gettext_lazy as _


class DialectRegion(models.Model):
    name = models.CharField(_('方言片区名称'), max_length=100, unique=True)
    code = models.CharField(_('片区代码'), max_length=50, unique=True)
    description = models.TextField(_('描述'), blank=True)
    language_family = models.CharField(_('语系'), max_length=100, default='Chinese')
    tone_system = models.CharField(_('声调系统'), max_length=50, default='cantonese')
    tone_count = models.IntegerField(_('声调数量'), default=9)
    is_active = models.BooleanField(_('是否激活'), default=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'dialect_regions'
        verbose_name = _('方言片区')
        verbose_name_plural = _('方言片区')
        ordering = ['name']

    def __str__(self):
        return self.name


class DialectSubregion(models.Model):
    region = models.ForeignKey(DialectRegion, on_delete=models.CASCADE, related_name='subregions', verbose_name=_('所属片区'))
    name = models.CharField(_('子片区名称'), max_length=100)
    code = models.CharField(_('子片区代码'), max_length=50)
    city = models.CharField(_('代表城市'), max_length=100, blank=True)
    province = models.CharField(_('省份'), max_length=100, blank=True)
    description = models.TextField(_('特点描述'), blank=True)
    is_active = models.BooleanField(_('是否激活'), default=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)
    updated_at = models.DateTimeField(_('更新时间'), auto_now=True)

    class Meta:
        db_table = 'dialect_subregions'
        verbose_name = _('方言子片区')
        verbose_name_plural = _('方言子片区')
        ordering = ['region', 'name']
        unique_together = ['region', 'code']

    def __str__(self):
        return f"{self.region.name} - {self.name}"


class PhonemeInventory(models.Model):
    region = models.ForeignKey(DialectRegion, on_delete=models.CASCADE, related_name='phonemes', verbose_name=_('方言片区'))
    ipa_symbol = models.CharField(_('IPA符号'), max_length=20)
    pinyin = models.CharField(_('拼音'), max_length=20, blank=True)
    type = models.CharField(_('类型'), max_length=20, choices=[
        ('initial', '声母'),
        ('final', '韵母'),
        ('tone', '声调'),
    ])
    description = models.TextField(_('发音描述'), blank=True)
    example = models.CharField(_('例字'), max_length=100, blank=True)
    is_active = models.BooleanField(_('是否激活'), default=True)
    created_at = models.DateTimeField(_('创建时间'), auto_now_add=True)

    class Meta:
        db_table = 'phoneme_inventory'
        verbose_name = _('音素库存')
        verbose_name_plural = _('音素库存')
        ordering = ['region', 'type', 'ipa_symbol']
        unique_together = ['region', 'ipa_symbol', 'type']

    def __str__(self):
        return f"{self.region.name} - {self.ipa_symbol} ({self.get_type_display()})"
