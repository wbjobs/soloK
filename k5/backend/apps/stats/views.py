from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Sum, Avg, Q, F
from django.utils import timezone
from datetime import timedelta

from apps.accounts.models import User
from apps.audio.models import AudioSegment
from apps.annotations.models import Annotation, Negotiation
from apps.dialects.models import DialectRegion
from apps.quality.models import QualityReview


class DashboardOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total_audio = AudioSegment.objects.count()
        total_annotations = Annotation.objects.count()
        completed_annotations = Annotation.objects.filter(status='completed').count()
        total_annotators = User.objects.filter(role='annotator', is_active=True).count()

        total_duration = AudioSegment.objects.aggregate(
            total=Sum('duration')
        )['total'] or 0

        avg_kappa = Annotation.objects.filter(
            status='completed',
            kappa_score__isnull=False
        ).aggregate(Avg('kappa_score'))['kappa_score__avg']

        by_status = AudioSegment.objects.values('status').annotate(
            count=Count('id')
        ).order_by('status')

        status_map = {
            'pending': '待处理',
            'processed': '已处理',
            'assigned': '已分配',
            'annotating': '标注中',
            'reviewing': '审核中',
            'completed': '已完成',
            'rejected': '已拒绝'
        }

        status_data = []
        for item in by_status:
            status_data.append({
                'key': item['status'],
                'name': status_map.get(item['status'], item['status']),
                'value': item['count']
            })

        return Response({
            'total_audio': total_audio,
            'total_annotations': total_annotations,
            'completed_annotations': completed_annotations,
            'total_annotators': total_annotators,
            'total_duration_minutes': round(total_duration / 60, 2),
            'avg_kappa': round(avg_kappa, 4) if avg_kappa else None,
            'completion_rate': round(completed_annotations / total_annotations * 100, 2) if total_annotations > 0 else 0,
            'by_status': status_data
        })


class AnnotatorProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        annotators = User.objects.filter(role='annotator', is_active=True)

        progress_data = []
        for annotator in annotators:
            total = Annotation.objects.filter(annotator=annotator).count()
            completed = Annotation.objects.filter(
                annotator=annotator,
                status='completed'
            ).count()
            in_progress = Annotation.objects.filter(
                annotator=annotator,
                status__in=['in_progress', 'submitted', 'negotiating']
            ).count()
            total_minutes = annotator.total_audio_minutes

            progress_data.append({
                'annotator_id': annotator.id,
                'annotator_name': annotator.username,
                'full_name': f"{annotator.first_name} {annotator.last_name}".strip(),
                'avatar': annotator.avatar.url if annotator.avatar else None,
                'total': total,
                'completed': completed,
                'in_progress': in_progress,
                'total_minutes': round(total_minutes, 2),
                'completion_rate': round(completed / total * 100, 2) if total > 0 else 0
            })

        progress_data.sort(key=lambda x: x['completion_rate'], reverse=True)

        return Response({
            'count': len(progress_data),
            'results': progress_data
        })


class AnnotatorRankingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = request.query_params.get('limit', 20)
        try:
            limit = int(limit)
        except ValueError:
            limit = 20

        sort_by = request.query_params.get('sort_by', 'total_annotations')

        annotators = User.objects.filter(role='annotator', is_active=True)

        ranking_data = []
        for idx, annotator in enumerate(annotators):
            annotations = Annotation.objects.filter(
                annotator=annotator,
                status='completed'
            )

            total_annotations = annotations.count()
            total_minutes = annotator.total_audio_minutes
            avg_kappa = annotations.aggregate(
                Avg('kappa_score')
            )['kappa_score__avg']
            avg_time = annotations.aggregate(
                Avg('time_spent')
            )['time_spent__avg']

            ranking_data.append({
                'rank': idx + 1,
                'annotator_id': annotator.id,
                'annotator_name': annotator.username,
                'full_name': f"{annotator.first_name} {annotator.last_name}".strip(),
                'avatar': annotator.avatar.url if annotator.avatar else None,
                'total_annotations': total_annotations,
                'total_minutes': round(total_minutes, 2),
                'avg_kappa': round(avg_kappa, 4) if avg_kappa else None,
                'avg_time_per_annotation': round(avg_time, 2) if avg_time else None
            })

        if sort_by == 'total_annotations':
            ranking_data.sort(key=lambda x: x['total_annotations'], reverse=True)
        elif sort_by == 'total_minutes':
            ranking_data.sort(key=lambda x: x['total_minutes'], reverse=True)
        elif sort_by == 'avg_kappa':
            ranking_data.sort(key=lambda x: x['avg_kappa'] or 0, reverse=True)

        for i, item in enumerate(ranking_data):
            item['rank'] = i + 1

        return Response({
            'count': len(ranking_data[:limit]),
            'sort_by': sort_by,
            'results': ranking_data[:limit]
        })


class DialectStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        regions = DialectRegion.objects.filter(is_active=True)

        stats = []
        for region in regions:
            audio_count = AudioSegment.objects.filter(dialect=region).count()
            completed_count = AudioSegment.objects.filter(
                dialect=region,
                status='completed'
            ).count()
            total_duration = AudioSegment.objects.filter(
                dialect=region
            ).aggregate(Sum('duration'))['duration__sum'] or 0

            annotation_count = Annotation.objects.filter(
                audio_segment__dialect=region,
                status='completed'
            ).count()

            avg_kappa = Annotation.objects.filter(
                audio_segment__dialect=region,
                status='completed',
                kappa_score__isnull=False
            ).aggregate(Avg('kappa_score'))['kappa_score__avg']

            subregions = list(region.subregions.filter(is_active=True).values('id', 'name', 'code'))

            stats.append({
                'region_id': region.id,
                'region_name': region.name,
                'region_code': region.code,
                'tone_system': region.tone_system,
                'tone_count': region.tone_count,
                'audio_count': audio_count,
                'completed_count': completed_count,
                'total_duration_minutes': round(total_duration / 60, 2),
                'annotation_count': annotation_count,
                'avg_kappa': round(avg_kappa, 4) if avg_kappa else None,
                'completion_rate': round(completed_count / audio_count * 100, 2) if audio_count > 0 else 0,
                'subregions': subregions
            })

        return Response({
            'count': len(stats),
            'results': stats
        })


class QualityStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total_reviews = QualityReview.objects.count()
        approved = QualityReview.objects.filter(is_approved=True).count()
        pending = QualityReview.objects.filter(reviewed_at__isnull=True).count()

        by_quality = QualityReview.objects.values('overall_quality').annotate(
            count=Count('id')
        ).order_by('-count')

        quality_map = {
            'excellent': '优秀',
            'good': '良好',
            'fair': '一般',
            'poor': '较差'
        }

        quality_data = []
        for item in by_quality:
            if item['overall_quality']:
                quality_data.append({
                    'key': item['overall_quality'],
                    'name': quality_map.get(item['overall_quality'], item['overall_quality']),
                    'value': item['count']
                })

        kappa_distribution = [
            {'range': '>= 0.8', 'name': 'Almost Perfect', 'count': 0},
            {'range': '0.6 - 0.8', 'name': 'Substantial', 'count': 0},
            {'range': '0.4 - 0.6', 'name': 'Moderate', 'count': 0},
            {'range': '0.2 - 0.4', 'name': 'Fair', 'count': 0},
            {'range': '0 - 0.2', 'name': 'Slight', 'count': 0},
            {'range': '< 0', 'name': 'Poor', 'count': 0}
        ]

        annotations = Annotation.objects.filter(
            status='completed',
            kappa_score__isnull=False
        )

        for ann in annotations:
            kappa = ann.kappa_score
            if kappa >= 0.8:
                kappa_distribution[0]['count'] += 1
            elif kappa >= 0.6:
                kappa_distribution[1]['count'] += 1
            elif kappa >= 0.4:
                kappa_distribution[2]['count'] += 1
            elif kappa >= 0.2:
                kappa_distribution[3]['count'] += 1
            elif kappa >= 0:
                kappa_distribution[4]['count'] += 1
            else:
                kappa_distribution[5]['count'] += 1

        open_negotiations = Negotiation.objects.filter(status='open').count()

        return Response({
            'total_reviews': total_reviews,
            'approved': approved,
            'pending': pending,
            'approval_rate': round(approved / total_reviews * 100, 2) if total_reviews > 0 else 0,
            'by_quality': quality_data,
            'kappa_distribution': kappa_distribution,
            'open_negotiations': open_negotiations
        })


class TimelineStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = request.query_params.get('days', 30)
        try:
            days = int(days)
        except ValueError:
            days = 30

        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days - 1)

        daily_data = []
        current_date = start_date

        while current_date <= end_date:
            next_date = current_date + timedelta(days=1)

            audio_uploaded = AudioSegment.objects.filter(
                created_at__date__gte=current_date,
                created_at__date__lt=next_date
            ).count()

            annotations_completed = Annotation.objects.filter(
                completed_at__date__gte=current_date,
                completed_at__date__lt=next_date,
                status='completed'
            ).count()

            daily_data.append({
                'date': current_date.isoformat(),
                'audio_uploaded': audio_uploaded,
                'annotations_completed': annotations_completed
            })

            current_date = next_date

        return Response({
            'days': days,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'data': daily_data
        })


class NegotiationStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total = Negotiation.objects.count()
        open = Negotiation.objects.filter(status='open').count()
        resolved = Negotiation.objects.filter(status='resolved').count()
        closed = Negotiation.objects.filter(status='closed').count()

        by_dialect = Negotiation.objects.values(
            'audio_segment__dialect__name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')

        avg_disagreements = Negotiation.objects.filter(
            status='resolved'
        ).annotate(
            dis_count=Count('disagreements')
        ).aggregate(
            Avg('dis_count')
        )['dis_count__avg']

        return Response({
            'total': total,
            'open': open,
            'resolved': resolved,
            'closed': closed,
            'resolution_rate': round(resolved / total * 100, 2) if total > 0 else 0,
            'avg_disagreements_per_negotiation': round(avg_disagreements, 2) if avg_disagreements else 0,
            'by_dialect': list(by_dialect)
        })


class AnnotatorProgressPieView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        annotators = User.objects.filter(role='annotator', is_active=True)

        pie_data = []
        for annotator in annotators:
            total = Annotation.objects.filter(annotator=annotator).count()
            if total == 0:
                continue

            completed = Annotation.objects.filter(
                annotator=annotator,
                status='completed'
            ).count()

            in_progress = Annotation.objects.filter(
                annotator=annotator,
                status='in_progress'
            ).count()

            submitted = Annotation.objects.filter(
                annotator=annotator,
                status='submitted'
            ).count()

            negotiating = Annotation.objects.filter(
                annotator=annotator,
                status='negotiating'
            ).count()

            pie_data.append({
                'annotator_id': annotator.id,
                'annotator_name': annotator.username,
                'full_name': f"{annotator.first_name} {annotator.last_name}".strip(),
                'total': total,
                'slices': [
                    {'name': '已完成', 'value': completed, 'color': '#67C23A'},
                    {'name': '进行中', 'value': in_progress, 'color': '#409EFF'},
                    {'name': '已提交', 'value': submitted, 'color': '#E6A23C'},
                    {'name': '协商中', 'value': negotiating, 'color': '#F56C6C'}
                ]
            })

        return Response({
            'count': len(pie_data),
            'results': pie_data
        })
