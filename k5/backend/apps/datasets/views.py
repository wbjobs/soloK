from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.decorators import action
from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import FilterSet

from .models import Dataset, DatasetExport
from .serializers import (
    DatasetSerializer, DatasetCreateSerializer,
    DatasetExportSerializer, DatasetExportRequestSerializer,
    DatasetFilterSerializer
)
from .tasks import export_dataset
from apps.audio.models import AudioSegment


class DatasetFilter(FilterSet):
    class Meta:
        model = Dataset
        fields = ['dialect', 'subregion', 'speaker_gender', 'speaker_age', 'status', 'format']


class DatasetViewSet(viewsets.ModelViewSet):
    queryset = Dataset.objects.all()
    serializer_class = DatasetSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = DatasetFilter
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'total_files', 'file_size']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'export']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset().annotate(
            audio_count=Count('audio_segments')
        )
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = DatasetCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        audio_ids = serializer.validated_data.pop('audio_segment_ids', [])

        dataset = Dataset.objects.create(
            **serializer.validated_data,
            created_by=request.user,
            status='creating'
        )

        if audio_ids:
            audio_segments = AudioSegment.objects.filter(id__in=audio_ids, status='completed')
            dataset.audio_segments.set(audio_segments)

        dataset.update_stats()
        dataset.status = 'ready'
        dataset.save(update_fields=['status', 'updated_at'])

        return Response(
            DatasetSerializer(dataset).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def export(self, request, pk=None):
        dataset = self.get_object()

        if dataset.status not in ['ready', 'completed']:
            return Response(
                {'detail': 'Dataset is not ready for export'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DatasetExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = export_dataset.delay(
            dataset_id=str(dataset.id),
            export_format=serializer.validated_data['format'],
            expires_hours=serializer.validated_data['expires_hours']
        )

        return Response({
            'status': 'exporting',
            'task_id': task.id,
            'dataset_id': str(dataset.id)
        })

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        dataset = self.get_object()
        audio = dataset.get_filtered_audio()

        limit = request.query_params.get('limit', 10)
        try:
            limit = int(limit)
        except ValueError:
            limit = 10

        from apps.audio.serializers import AudioSegmentSerializer
        audio_data = AudioSegmentSerializer(audio[:limit], many=True, context={'request': request}).data

        return Response({
            'total_matching': audio.count(),
            'limit': limit,
            'preview': audio_data
        })

    @action(detail=False, methods=['post'])
    def filter_audio(self, request):
        serializer = DatasetFilterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        queryset = AudioSegment.objects.filter(status='completed', is_active=True)

        if serializer.validated_data.get('dialect'):
            queryset = queryset.filter(dialect_id=serializer.validated_data['dialect'])
        if serializer.validated_data.get('subregion'):
            queryset = queryset.filter(subregion_id=serializer.validated_data['subregion'])
        if serializer.validated_data.get('speaker_gender'):
            queryset = queryset.filter(speaker_gender=serializer.validated_data['speaker_gender'])
        if serializer.validated_data.get('speaker_age'):
            queryset = queryset.filter(speaker_age=serializer.validated_data['speaker_age'])
        if serializer.validated_data.get('min_duration'):
            queryset = queryset.filter(duration__gte=serializer.validated_data['min_duration'])
        if serializer.validated_data.get('max_duration'):
            queryset = queryset.filter(duration__lte=serializer.validated_data['max_duration'])
        if serializer.validated_data.get('min_quality_score'):
            queryset = queryset.filter(quality_score__gte=serializer.validated_data['min_quality_score'])
        if serializer.validated_data.get('search'):
            queryset = queryset.filter(
                models.Q(filename__icontains=serializer.validated_data['search']) |
                models.Q(text_transcript__icontains=serializer.validated_data['search'])
            )

        page = self.paginate_queryset(queryset)
        if page is not None:
            from apps.audio.serializers import AudioSegmentSerializer
            serializer = AudioSegmentSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        from apps.audio.serializers import AudioSegmentSerializer
        return Response({
            'count': queryset.count(),
            'results': AudioSegmentSerializer(queryset, many=True, context={'request': request}).data
        })


class DatasetExportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DatasetExport.objects.all()
    serializer_class = DatasetExportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['dataset', 'format']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'annotator':
            queryset = queryset.filter(dataset__created_by=user)
        return queryset


class DatasetExportAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, dataset_id):
        try:
            dataset = Dataset.objects.get(id=dataset_id)
        except Dataset.DoesNotExist:
            return Response(
                {'detail': 'Dataset not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if dataset.status == 'completed' and dataset.download_url:
            return Response({
                'dataset_id': str(dataset.id),
                'name': dataset.name,
                'status': dataset.status,
                'download_url': dataset.download_url,
                'file_size': dataset.file_size,
                'total_files': dataset.total_files,
                'format': dataset.format,
                'expires_at': dataset.expires_at.isoformat() if dataset.expires_at else None
            })
        elif dataset.status in ['creating', 'ready']:
            return Response({
                'dataset_id': str(dataset.id),
                'name': dataset.name,
                'status': dataset.status,
                'message': 'Dataset is being prepared, please check back later'
            }, status=status.HTTP_202_ACCEPTED)
        elif dataset.status == 'exporting':
            return Response({
                'dataset_id': str(dataset.id),
                'name': dataset.name,
                'status': dataset.status,
                'message': 'Export in progress, please check back later'
            }, status=status.HTTP_202_ACCEPTED)
        else:
            return Response({
                'dataset_id': str(dataset.id),
                'name': dataset.name,
                'status': dataset.status,
                'message': 'Dataset export failed'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
