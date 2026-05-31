from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.decorators import action
from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend

from .models import DialectRegion, DialectSubregion, PhonemeInventory
from .serializers import (
    DialectRegionSerializer, DialectSubregionSerializer,
    PhonemeInventorySerializer, DialectRegionSummarySerializer
)


class DialectRegionViewSet(viewsets.ModelViewSet):
    queryset = DialectRegion.objects.all()
    serializer_class = DialectRegionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['language_family', 'is_active']
    search_fields = ['name', 'code', 'description']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        regions = DialectRegion.objects.annotate(
            subregion_count=Count('subregions', distinct=True),
            audio_count=Count('dialect_audio', distinct=True)
        ).filter(is_active=True)
        serializer = DialectRegionSummarySerializer(regions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def tone_system(self, request, pk=None):
        region = self.get_object()
        from utils.ipa_mapping import get_tone_options
        tone_options = get_tone_options(region.tone_system)
        return Response({
            'tone_system': region.tone_system,
            'tone_count': region.tone_count,
            'tone_options': tone_options
        })

    @action(detail=True, methods=['post'])
    def add_subregion(self, request, pk=None):
        region = self.get_object()
        serializer = DialectSubregionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(region=region)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def add_phoneme(self, request, pk=None):
        region = self.get_object()
        serializer = PhonemeInventorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(region=region)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DialectSubregionViewSet(viewsets.ModelViewSet):
    queryset = DialectSubregion.objects.all()
    serializer_class = DialectSubregionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['region', 'is_active']
    search_fields = ['name', 'code', 'city', 'province']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]


class PhonemeInventoryViewSet(viewsets.ModelViewSet):
    queryset = PhonemeInventory.objects.all()
    serializer_class = PhonemeInventorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['region', 'type', 'is_active']
    search_fields = ['ipa_symbol', 'pinyin', 'example']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]


class ToneSystemView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from utils.ipa_mapping import DIALECT_TONE_SYSTEMS
        systems = []
        for system_id, system_data in DIALECT_TONE_SYSTEMS.items():
            systems.append({
                'id': system_id,
                'tone_count': system_data['count'],
                'tones': [
                    {
                        'number': num,
                        'ipa': mark,
                        'name': system_data['names'][num]
                    }
                    for num, mark in sorted(system_data['tones'].items())
                ]
            })
        return Response(systems)
