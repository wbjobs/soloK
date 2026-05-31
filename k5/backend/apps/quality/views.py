from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.decorators import action
from django.db.models import Avg, Count, Q
from django.utils import timezone
from datetime import timedelta
from django_filters.rest_framework import DjangoFilterBackend

from .models import QualityReview, QualityReport, AnnotationConsistency
from .serializers import (
    QualityReviewSerializer, QualityReportSerializer,
    AnnotationConsistencySerializer, QualityReviewCreateSerializer,
    QualityReportGenerateSerializer
)
from apps.annotations.models import Annotation
from utils.kappa import compute_overall_kappa, interpret_kappa


class QualityReviewViewSet(viewsets.ModelViewSet):
    queryset = QualityReview.objects.all()
    serializer_class = QualityReviewSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['audio_segment', 'is_approved', 'overall_quality']
    http_method_names = ['get', 'post', 'patch']

    def get_permissions(self):
        if self.action in ['create', 'review', 'partial_update']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        serializer = QualityReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.audio.models import AudioSegment
        try:
            audio = AudioSegment.objects.get(id=serializer.validated_data['audio_segment_id'])
        except AudioSegment.DoesNotExist:
            return Response(
                {'detail': 'Audio segment not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        review, created = QualityReview.objects.get_or_create(
            audio_segment=audio,
            defaults={
                'overall_quality': serializer.validated_data.get('overall_quality', ''),
                'quality_score': serializer.validated_data.get('quality_score'),
                'comments': serializer.validated_data.get('comments', ''),
                'issues_found': serializer.validated_data.get('issues_found', []),
                'is_approved': serializer.validated_data.get('is_approved', True),
            }
        )

        return Response(
            QualityReviewSerializer(review).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        review = self.get_object()

        if review.is_approved and review.reviewed_at:
            return Response(
                {'detail': 'This review is already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        quality_score = request.data.get('quality_score', review.quality_score)
        is_approved = request.data.get('is_approved', True)
        comments = request.data.get('comments', '')

        review.mark_reviewed(
            reviewed_by=request.user,
            quality_score=quality_score,
            is_approved=is_approved,
            comments=comments
        )

        return Response(QualityReviewSerializer(review).data)

    @action(detail=False, methods=['get'])
    def pending(self, request):
        queryset = self.get_queryset().filter(
            Q(reviewed_at__isnull=True) | Q(is_approved=False)
        ).order_by('created_at')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class QualityReportViewSet(viewsets.ModelViewSet):
    queryset = QualityReport.objects.all()
    serializer_class = QualityReportSerializer
    permission_classes = [IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['report_type', 'start_date', 'end_date']
    http_method_names = ['get', 'post']

    @action(detail=False, methods=['post'])
    def generate(self, request):
        serializer = QualityReportGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report_type = serializer.validated_data['report_type']
        end_date = serializer.validated_data.get('end_date', timezone.now().date())
        start_date = serializer.validated_data.get('start_date')

        if not start_date:
            if report_type == 'daily':
                start_date = end_date
            elif report_type == 'weekly':
                start_date = end_date - timedelta(days=7)
            elif report_type == 'monthly':
                start_date = end_date - timedelta(days=30)
            else:
                start_date = end_date - timedelta(days=7)

        annotations = Annotation.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date,
            status='completed'
        )

        total_annotations = annotations.count()
        completed_annotations = annotations.filter(status='completed').count()

        avg_stats = annotations.aggregate(
            avg_kappa=Avg('kappa_score'),
            avg_agreement=Avg('agreement_rate'),
            avg_quality=Avg('quality_score')
        )

        annotator_stats = list(annotations.values(
            'annotator__id', 'annotator__username'
        ).annotate(
            count=Count('id'),
            avg_kappa=Avg('kappa_score')
        ).order_by('-count'))

        dialect_stats = list(annotations.values(
            'audio_segment__dialect__name'
        ).annotate(
            count=Count('id')
        ).order_by('-count'))

        report = QualityReport.objects.create(
            report_type=report_type,
            start_date=start_date,
            end_date=end_date,
            generated_by=request.user,
            total_annotations=total_annotations,
            completed_annotations=completed_annotations,
            avg_kappa_score=avg_stats['avg_kappa'],
            avg_agreement_rate=avg_stats['avg_agreement'],
            avg_quality_score=avg_stats['avg_quality'],
            annotator_stats=annotator_stats,
            dialect_stats=dialect_stats
        )

        return Response(QualityReportSerializer(report).data, status=status.HTTP_201_CREATED)


class AnnotationConsistencyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AnnotationConsistency.objects.all()
    serializer_class = AnnotationConsistencySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['audio_segment']


class KappaInterpretationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        kappa_value = request.query_params.get('kappa')
        if kappa_value is None:
            return Response(
                {'detail': 'kappa parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            kappa = float(kappa_value)
        except ValueError:
            return Response(
                {'detail': 'kappa must be a number'},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'kappa': kappa,
            'interpretation': interpret_kappa(kappa)
        })


class QualityDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total_reviews = QualityReview.objects.count()
        approved = QualityReview.objects.filter(is_approved=True).count()
        pending = QualityReview.objects.filter(reviewed_at__isnull=True).count()

        avg_kappa = Annotation.objects.filter(
            status='completed', kappa_score__isnull=False
        ).aggregate(Avg('kappa_score'))['kappa_score__avg']

        avg_agreement = Annotation.objects.filter(
            status='completed', agreement_rate__isnull=False
        ).aggregate(Avg('agreement_rate'))['agreement_rate__avg']

        recent_consistency = AnnotationConsistency.objects.order_by('-calculated_at')[:10]

        return Response({
            'total_reviews': total_reviews,
            'approved': approved,
            'pending': pending,
            'approval_rate': round(approved / total_reviews * 100, 2) if total_reviews > 0 else 0,
            'avg_kappa': round(avg_kappa, 4) if avg_kappa else None,
            'avg_agreement': round(avg_agreement, 4) if avg_agreement else None,
            'recent_consistency': AnnotationConsistencySerializer(recent_consistency, many=True).data
        })
