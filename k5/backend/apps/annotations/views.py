from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.decorators import action
from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import FilterSet

from .models import Annotation, AnnotationHistory, Negotiation
from .serializers import (
    AnnotationSerializer, AnnotationDetailSerializer,
    AnnotationUpdateSerializer, AnnotationSubmitSerializer,
    AnnotationHistorySerializer, NegotiationSerializer,
    NegotiationResolveSerializer, AnnotationProgressSerializer
)
from utils.kappa import compute_overall_kappa
from utils.ipa_mapping import pinyin_to_ipa, ipa_to_pinyin


class AnnotationFilter(FilterSet):
    class Meta:
        model = Annotation
        fields = ['audio_segment', 'annotator', 'status']


class AnnotationViewSet(viewsets.ModelViewSet):
    queryset = Annotation.objects.all()
    serializer_class = AnnotationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = AnnotationFilter
    search_fields = ['notes']
    ordering_fields = ['created_at', 'updated_at', 'time_spent']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AnnotationDetailSerializer
        if self.action in ['update', 'partial_update']:
            return AnnotationUpdateSerializer
        return AnnotationSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'annotator':
            queryset = queryset.filter(annotator=user)
        return queryset

    def create(self, request, *args, **kwargs):
        audio_id = request.data.get('audio_segment')
        if not audio_id:
            return Response(
                {'detail': 'audio_segment is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.audio.models import AudioSegment
        try:
            audio = AudioSegment.objects.get(id=audio_id)
        except AudioSegment.DoesNotExist:
            return Response(
                {'detail': 'Audio segment not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if request.user.role == 'annotator' and request.user not in audio.assigned_annotators.all():
            return Response(
                {'detail': 'You are not assigned to this audio segment'},
                status=status.HTTP_403_FORBIDDEN
            )

        annotation, created = Annotation.objects.get_or_create(
            audio_segment=audio,
            annotator=request.user,
            defaults={
                'phonemes': audio.initial_phonemes.get('phonemes', []) if audio.initial_phonemes else [],
                'status': 'in_progress'
            }
        )

        if not created and annotation.status == 'completed':
            return Response(
                {'detail': 'This annotation is already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        self._create_history(annotation, 'create', request.user, new_value={'phonemes': annotation.phonemes})

        return Response(
            self.get_serializer(annotation).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        annotation = self.get_object()

        if annotation.annotator != request.user and request.user.role != 'admin':
            return Response(
                {'detail': 'You can only update your own annotations'},
                status=status.HTTP_403_FORBIDDEN
            )

        if annotation.status == 'completed':
            return Response(
                {'detail': 'Cannot update completed annotation'},
                status=status.HTTP_400_BAD_REQUEST
            )

        old_phonemes = annotation.phonemes
        serializer = self.get_serializer(annotation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        annotation = serializer.save()

        self._create_history(annotation, 'update', request.user, old_value={'phonemes': old_phonemes}, new_value={'phonemes': annotation.phonemes})

        return Response(self.get_serializer(annotation).data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        annotation = self.get_object()

        if annotation.annotator != request.user:
            return Response(
                {'detail': 'You can only submit your own annotations'},
                status=status.HTTP_403_FORBIDDEN
            )

        if annotation.status not in ['in_progress', 'negotiating']:
            return Response(
                {'detail': 'Only in-progress annotations can be submitted'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not annotation.phonemes:
            return Response(
                {'detail': 'Cannot submit empty annotation'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AnnotationSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        annotation.time_spent = serializer.validated_data.get('time_spent', annotation.time_spent)
        annotation.notes = serializer.validated_data.get('notes', annotation.notes)
        annotation.mark_submitted()

        self._create_history(annotation, 'submit', request.user)
        self._check_and_create_negotiation(annotation.audio_segment)

        return Response(AnnotationDetailSerializer(annotation).data)

    @action(detail=True, methods=['post'])
    def toggle_display_mode(self, request, pk=None):
        annotation = self.get_object()
        annotation.display_mode = 'ipa' if annotation.display_mode == 'pinyin' else 'pinyin'
        annotation.save(update_fields=['display_mode', 'updated_at'])
        return Response({
            'display_mode': annotation.display_mode,
            'display_mode_display': annotation.get_display_mode_display()
        })

    @action(detail=True, methods=['post'])
    def convert_phonemes(self, request, pk=None):
        annotation = self.get_object()
        target_mode = request.data.get('target_mode', 'ipa')

        phonemes = annotation.phonemes
        for phoneme in phonemes:
            if target_mode == 'ipa' and phoneme.get('pinyin') and not phoneme.get('ipa'):
                phoneme['ipa'] = pinyin_to_ipa(phoneme['pinyin'])
            elif target_mode == 'pinyin' and phoneme.get('ipa') and not phoneme.get('pinyin'):
                phoneme['pinyin'] = ipa_to_pinyin(phoneme['ipa'])

        annotation.phonemes = phonemes
        annotation.save(update_fields=['phonemes', 'updated_at'])

        return Response({'phonemes': phonemes})

    @action(detail=False, methods=['get'])
    def my_annotations(self, request):
        queryset = self.get_queryset().filter(annotator=request.user)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def progress(self, request):
        annotator_id = request.query_params.get('annotator')
        queryset = self.get_queryset()

        if annotator_id and request.user.role == 'admin':
            queryset = queryset.filter(annotator_id=annotator_id)
        elif request.user.role == 'annotator':
            queryset = queryset.filter(annotator=request.user)

        stats = queryset.aggregate(
            total=Count('id'),
            in_progress=Count('id', filter=Q(status='in_progress')),
            submitted=Count('id', filter=Q(status='submitted')),
            completed=Count('id', filter=Q(status='completed')),
            rejected=Count('id', filter=Q(status='rejected')),
            negotiating=Count('id', filter=Q(status='negotiating')),
        )

        total = stats['total'] or 1
        stats['completion_rate'] = round(stats['completed'] / total * 100, 2)

        serializer = AnnotationProgressSerializer(stats)
        return Response(serializer.data)

    def _create_history(self, annotation, action, user, old_value=None, new_value=None, comment=''):
        AnnotationHistory.objects.create(
            annotation=annotation,
            action=action,
            user=user,
            old_value=old_value,
            new_value=new_value,
            comment=comment
        )

    def _check_and_create_negotiation(self, audio_segment):
        completed_annotations = Annotation.objects.filter(
            audio_segment=audio_segment,
            status='submitted'
        )

        if completed_annotations.count() >= 2:
            ann1, ann2 = completed_annotations[:2]

            kappa_result = compute_overall_kappa(
                {'phonemes': ann1.phonemes},
                {'phonemes': ann2.phonemes}
            )

            significant_disagreements = [
                d for d in kappa_result['disagreements']
                if not d.get('negligible_time_diff') or d.get('phoneme_mismatch') or d.get('tone_mismatch')
            ]

            if kappa_result['overall_kappa'] < 0.6 or len(significant_disagreements) > 0:
                existing = Negotiation.objects.filter(
                    audio_segment=audio_segment,
                    status='open'
                ).first()

                if not existing:
                    Negotiation.objects.create(
                        annotation1=ann1,
                        annotation2=ann2,
                        audio_segment=audio_segment,
                        disagreements=kappa_result['disagreements']
                    )

                ann1.mark_negotiating()
                ann2.mark_negotiating()
            else:
                ann1.mark_completed(kappa_score=kappa_result['overall_kappa'], agreement_rate=kappa_result['agreement_rate'])
                ann2.mark_completed(kappa_score=kappa_result['overall_kappa'], agreement_rate=kappa_result['agreement_rate'])


class AnnotationHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AnnotationHistory.objects.all()
    serializer_class = AnnotationHistorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['annotation', 'action', 'user']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'annotator':
            queryset = queryset.filter(annotation__annotator=user)
        return queryset


class NegotiationViewSet(viewsets.ModelViewSet):
    queryset = Negotiation.objects.all()
    serializer_class = NegotiationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['audio_segment', 'status']
    http_method_names = ['get', 'post', 'patch']

    def get_permissions(self):
        if self.action in ['resolve']:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role == 'annotator':
            queryset = queryset.filter(
                Q(annotation1__annotator=user) | Q(annotation2__annotator=user)
            )
        return queryset

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        negotiation = self.get_object()

        if negotiation.status != 'open':
            return Response(
                {'detail': 'Only open negotiations can be resolved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = NegotiationResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        negotiation.mark_resolved(
            resolved_by=request.user,
            final_annotation=serializer.validated_data['final_annotation'],
            notes=serializer.validated_data.get('notes', '')
        )

        return Response(NegotiationSerializer(negotiation).data)


class KappaCalculationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        annotation1 = request.data.get('annotation1')
        annotation2 = request.data.get('annotation2')

        if not annotation1 or not annotation2:
            return Response(
                {'detail': 'Both annotations are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = compute_overall_kappa(annotation1, annotation2)

        from utils.kappa import interpret_kappa
        result['interpretation'] = interpret_kappa(result['overall_kappa'])

        return Response(result)
