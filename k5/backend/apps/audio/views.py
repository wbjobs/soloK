import os
import uuid
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from django.db.models import Count, Q
from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import FilterSet, CharFilter, NumberFilter

from .models import AudioSegment
from .serializers import (
    AudioSegmentSerializer, AudioSegmentDetailSerializer,
    AudioSegmentUploadSerializer, AudioSegmentProcessSerializer,
    AudioSegmentAssignSerializer
)
from .tasks import process_audio_segment, batch_process_audio
from utils.minio_client import minio_client
from utils.audio_processing import validate_audio, load_audio
from utils.speaker_verification import (
    compute_cosine_similarity, find_similar_speakers,
    cluster_speakers, get_2d_projection
)


class AudioSegmentFilter(FilterSet):
    min_duration = NumberFilter(field_name='duration', lookup_expr='gte')
    max_duration = NumberFilter(field_name='duration', lookup_expr='lte')
    dialect_code = CharFilter(field_name='dialect__code')

    class Meta:
        model = AudioSegment
        fields = [
            'dialect', 'subregion', 'status', 'speaker_gender',
            'speaker_age', 'min_duration', 'max_duration', 'is_active'
        ]


class AudioSegmentViewSet(viewsets.ModelViewSet):
    queryset = AudioSegment.objects.all()
    filter_backends = [DjangoFilterBackend]
    filterset_class = AudioSegmentFilter
    search_fields = ['filename', 'original_filename', 'text_transcript']
    ordering_fields = ['created_at', 'duration', 'completed_annotations', 'quality_score']
    parser_classes = (MultiPartParser, FormParser)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AudioSegmentDetailSerializer
        return AudioSegmentSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'upload', 'assign', 'process']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'annotator':
            queryset = queryset.filter(assigned_annotators=user)
        return queryset

    @action(detail=False, methods=['post'])
    def upload(self, request):
        serializer = AudioSegmentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file = serializer.validated_data['file']
        file_ext = os.path.splitext(file.name)[1].lower()

        if file_ext != '.wav':
            return Response(
                {'detail': 'Only WAV format is supported'},
                status=status.HTTP_400_BAD_REQUEST
            )

        file_bytes = file.read()
        valid, message = validate_audio(file_bytes)
        if not valid:
            return Response(
                {'detail': message},
                status=status.HTTP_400_BAD_REQUEST
            )

        audio_id = uuid.uuid4()
        file_path = f"audio/{audio_id}/{file.name}"
        object_name = str(audio_id) + file_ext

        minio_client.upload_file(
            settings.MINIO_CONFIG['bucket_audio'],
            object_name,
            file_bytes,
            len(file_bytes),
            'audio/wav'
        )

        audio_data, sr = load_audio(file_bytes)
        duration = len(audio_data) / sr

        audio = AudioSegment.objects.create(
            id=audio_id,
            dialect=serializer.validated_data['dialect'],
            subregion=serializer.validated_data.get('subregion'),
            filename=file.name,
            original_filename=file.name,
            file_path=object_name,
            file_size=len(file_bytes),
            duration=duration,
            sample_rate=sr,
            speaker_gender=serializer.validated_data['speaker_gender'],
            speaker_age=serializer.validated_data['speaker_age'],
            text_transcript=serializer.validated_data.get('text_transcript', ''),
            required_annotations=serializer.validated_data['required_annotations'],
            uploaded_by=request.user,
            status='pending'
        )

        process_audio_segment.delay(str(audio_id))

        return Response(
            AudioSegmentSerializer(audio, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        audio = self.get_object()
        serializer = AudioSegmentProcessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        task = process_audio_segment.delay(str(audio.id))

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'audio_id': str(audio.id)
        })

    @action(detail=False, methods=['post'])
    def batch_process(self, request):
        audio_ids = request.data.get('audio_ids', [])
        if not audio_ids:
            return Response(
                {'detail': 'No audio IDs provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = batch_process_audio.delay(audio_ids)

        return Response({
            'status': 'submitted',
            'task_id': result.id,
            'count': len(audio_ids)
        })

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        audio = self.get_object()
        serializer = AudioSegmentAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.accounts.models import User
        annotators = User.objects.filter(
            id__in=serializer.validated_data['annotator_ids'],
            role='annotator',
            is_active=True
        )

        if annotators.count() != len(serializer.validated_data['annotator_ids']):
            return Response(
                {'detail': 'Some annotators not found or invalid'},
                status=status.HTTP_400_BAD_REQUEST
            )

        audio.assign_annotators(annotators)

        return Response({
            'status': 'success',
            'assigned_count': annotators.count(),
            'annotators': [a.id for a in annotators]
        })

    @action(detail=False, methods=['get'])
    def my_tasks(self, request):
        user = request.user
        if user.role != 'annotator':
            return Response([])

        queryset = self.get_queryset().filter(
            Q(assigned_annotators=user) &
            ~Q(status__in=['completed', 'rejected'])
        ).order_by('status', '-created_at')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total = AudioSegment.objects.count()
        by_status = AudioSegment.objects.values('status').annotate(
            count=Count('id')
        ).order_by('-count')

        by_dialect = AudioSegment.objects.values('dialect__name').annotate(
            count=Count('id')
        ).order_by('-count')

        return Response({
            'total': total,
            'by_status': list(by_status),
            'by_dialect': list(by_dialect),
        })

    @action(detail=True, methods=['get'])
    def similar_speakers(self, request, pk=None):
        audio = self.get_object()
        
        if not audio.speaker_embedding:
            return Response({
                'similar_speakers': [],
                'message': 'No speaker embedding available for this audio'
            })

        dialect = request.query_params.get('dialect')
        queryset = AudioSegment.objects.filter(
            speaker_embedding__isnull=False
        ).exclude(id=audio.id)

        if dialect:
            queryset = queryset.filter(dialect_id=dialect)

        all_embeddings = {}
        audio_info = {}
        for seg in queryset[:1000]:
            all_embeddings[str(seg.id)] = seg.speaker_embedding
            audio_info[str(seg.id)] = {
                'id': str(seg.id),
                'filename': seg.original_filename,
                'dialect_name': seg.dialect.name if seg.dialect else '',
                'subregion_name': seg.subregion.name if seg.subregion else '',
                'speaker_gender': seg.speaker_gender,
                'speaker_age': seg.speaker_age,
                'duration': seg.duration,
                'status': seg.status
            }

        similar = find_similar_speakers(
            audio.speaker_embedding,
            all_embeddings,
            top_k=int(request.query_params.get('top_k', 10)),
            threshold=float(request.query_params.get('threshold', 0.5))
        )

        for item in similar:
            item.update(audio_info.get(item['audio_id'], {}))

        return Response({
            'target_audio_id': str(audio.id),
            'similar_speakers': similar,
            'total_checked': len(all_embeddings)
        })

    @action(detail=False, methods=['get'])
    def speaker_clusters(self, request):
        dialect = request.query_params.get('dialect')
        queryset = AudioSegment.objects.filter(speaker_embedding__isnull=False)

        if dialect:
            queryset = queryset.filter(dialect_id=dialect)

        queryset = queryset[:500]

        if queryset.count() < 2:
            return Response({
                'clusters': {},
                'projections': [],
                'num_clusters': 0,
                'total_audio': queryset.count(),
                'message': 'Not enough audio samples for clustering'
            })

        embeddings = []
        audio_ids = []
        audio_info = []

        for seg in queryset:
            embeddings.append(seg.speaker_embedding)
            audio_ids.append(str(seg.id))
            audio_info.append({
                'id': str(seg.id),
                'filename': seg.original_filename,
                'dialect_name': seg.dialect.name if seg.dialect else '',
                'subregion_name': seg.subregion.name if seg.subregion else '',
                'speaker_gender': seg.speaker_gender,
                'speaker_age': seg.speaker_age,
                'duration': seg.duration,
                'status': seg.status
            })

        cluster_result = cluster_speakers(
            embeddings,
            audio_ids,
            threshold=float(request.query_params.get('threshold', 0.7))
        )

        projections = get_2d_projection(
            embeddings,
            method=request.query_params.get('projection', 'pca')
        )

        projection_data = []
        for i, (audio_id, info) in enumerate(zip(audio_ids, audio_info)):
            x, y = projections[i]
            projection_data.append({
                **info,
                'x': round(x, 4),
                'y': round(y, 4),
                'cluster': cluster_result['audio_to_cluster'].get(audio_id, '-1')
            })

        return Response({
            'clusters': cluster_result['clusters'],
            'audio_to_cluster': cluster_result['audio_to_cluster'],
            'projections': projection_data,
            'num_clusters': cluster_result['num_clusters'],
            'threshold': cluster_result['threshold'],
            'total_audio': len(audio_ids)
        })

    @action(detail=False, methods=['post'])
    def compare_speakers(self, request):
        audio_id1 = request.data.get('audio_id1')
        audio_id2 = request.data.get('audio_id2')

        if not audio_id1 or not audio_id2:
            return Response(
                {'detail': 'Both audio_id1 and audio_id2 are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            audio1 = AudioSegment.objects.get(id=audio_id1)
            audio2 = AudioSegment.objects.get(id=audio_id2)
        except AudioSegment.DoesNotExist:
            return Response(
                {'detail': 'One or both audio segments not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not audio1.speaker_embedding or not audio2.speaker_embedding:
            return Response({
                'similarity': 0,
                'message': 'One or both audio segments missing speaker embedding'
            })

        similarity = compute_cosine_similarity(
            audio1.speaker_embedding,
            audio2.speaker_embedding
        )

        return Response({
            'audio1': {
                'id': str(audio1.id),
                'filename': audio1.original_filename
            },
            'audio2': {
                'id': str(audio2.id),
                'filename': audio2.original_filename
            },
            'similarity': round(float(similarity), 4),
            'similarity_percent': round(float(similarity) * 100, 1),
            'interpretation': get_similarity_interpretation(similarity)
        })


def get_similarity_interpretation(similarity: float) -> str:
    if similarity >= 0.9:
        return '几乎可以确定是同一说话人'
    elif similarity >= 0.8:
        return '极有可能是同一说话人'
    elif similarity >= 0.7:
        return '很可能是同一说话人'
    elif similarity >= 0.6:
        return '可能是同一说话人'
    elif similarity >= 0.5:
        return '不确定，可能是也可能不是'
    else:
        return '很可能不是同一说话人'
