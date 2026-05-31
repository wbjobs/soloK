from rest_framework import serializers
from .models import DialectRegion, DialectSubregion, PhonemeInventory


class PhonemeInventorySerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model = PhonemeInventory
        fields = [
            'id', 'ipa_symbol', 'pinyin', 'type', 'type_display',
            'description', 'example', 'is_active', 'created_at'
        ]


class DialectSubregionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DialectSubregion
        fields = [
            'id', 'name', 'code', 'city', 'province',
            'description', 'is_active', 'created_at', 'updated_at'
        ]


class DialectRegionSerializer(serializers.ModelSerializer):
    subregions = DialectSubregionSerializer(many=True, read_only=True)
    phonemes = PhonemeInventorySerializer(many=True, read_only=True)
    tone_options = serializers.SerializerMethodField()

    class Meta:
        model = DialectRegion
        fields = [
            'id', 'name', 'code', 'description', 'language_family',
            'tone_system', 'tone_count', 'subregions', 'phonemes',
            'tone_options', 'is_active', 'created_at', 'updated_at'
        ]

    def get_tone_options(self, obj):
        from utils.ipa_mapping import get_tone_options
        return get_tone_options(obj.tone_system)


class DialectRegionSummarySerializer(serializers.ModelSerializer):
    subregion_count = serializers.IntegerField(read_only=True)
    audio_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = DialectRegion
        fields = [
            'id', 'name', 'code', 'language_family',
            'tone_count', 'subregion_count', 'audio_count',
            'is_active'
        ]
