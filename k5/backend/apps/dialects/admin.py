from django.contrib import admin
from .models import DialectRegion, DialectSubregion, PhonemeInventory


class DialectSubregionInline(admin.TabularInline):
    model = DialectSubregion
    extra = 1


class PhonemeInventoryInline(admin.TabularInline):
    model = PhonemeInventory
    extra = 1


@admin.register(DialectRegion)
class DialectRegionAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'language_family', 'tone_system', 'tone_count', 'is_active', 'created_at']
    list_filter = ['language_family', 'tone_system', 'is_active', 'created_at']
    search_fields = ['name', 'code', 'description']
    inlines = [DialectSubregionInline, PhonemeInventoryInline]


@admin.register(DialectSubregion)
class DialectSubregionAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'region', 'city', 'province', 'is_active']
    list_filter = ['region', 'province', 'is_active']
    search_fields = ['name', 'code', 'city', 'province', 'description']


@admin.register(PhonemeInventory)
class PhonemeInventoryAdmin(admin.ModelAdmin):
    list_display = ['ipa_symbol', 'pinyin', 'region', 'type', 'example', 'is_active']
    list_filter = ['region', 'type', 'is_active']
    search_fields = ['ipa_symbol', 'pinyin', 'example', 'description']
