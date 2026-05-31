from celery import shared_task
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import os
import logging
import uuid

from .models import Dataset, DatasetExport
from utils.minio_client import minio_client
from utils.textgrid_export import create_dataset_package, export_to_json, export_to_textgrid
from apps.annotations.models import Annotation

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def export_dataset(self, dataset_id, export_format='both', expires_hours=24):
    try:
        dataset = Dataset.objects.get(id=dataset_id)
        logger.info(f"Starting export for dataset: {dataset_id}")

        dataset.status = 'exporting'
        dataset.save(update_fields=['status', 'updated_at'])

        audio_segments = dataset.get_filtered_audio()

        if audio_segments.count() == 0:
            dataset.status = 'failed'
            dataset.save(update_fields=['status', 'updated_at'])
            return {'status': 'error', 'message': 'No audio segments match the criteria'}

        export_data = []
        for audio in audio_segments:
            annotation = Annotation.objects.filter(
                audio_segment=audio,
                status='completed'
            ).first()

            if not annotation:
                continue

            phonemes = annotation.phonemes
            for p in phonemes:
                if 'pinyin' not in p:
                    p['pinyin'] = p.get('phoneme', '')
                if 'ipa' not in p:
                    p['ipa'] = p.get('phoneme', '')

            export_data.append({
                'audio_id': str(audio.id),
                'annotations': phonemes,
                'duration': audio.duration,
                'metadata': {
                    'audio_id': str(audio.id),
                    'dialect': audio.dialect.name if audio.dialect else '',
                    'dialect_subregion': audio.subregion.name if audio.subregion else '',
                    'speaker_gender': audio.speaker_gender,
                    'speaker_age': audio.speaker_age,
                    'annotator_id': annotation.annotator.id,
                    'annotator_name': annotation.annotator.username,
                    'annotation_date': annotation.completed_at.isoformat() if annotation.completed_at else '',
                    'quality_score': audio.quality_score,
                },
                'audio_info': {
                    'filename': audio.filename,
                    'url': audio.get_audio_url(),
                    'duration': audio.duration,
                    'sample_rate': audio.sample_rate,
                }
            })

        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = create_dataset_package(export_data, tmpdir)

            file_size = os.path.getsize(zip_path)
            object_name = f"exports/{dataset_id}/{uuid.uuid4()}.zip"

            with open(zip_path, 'rb') as f:
                minio_client.upload_file(
                    settings.MINIO_CONFIG['bucket_export'],
                    object_name,
                    f.read(),
                    file_size,
                    'application/zip'
                )

        download_url = minio_client.get_file_url(
            settings.MINIO_CONFIG['bucket_export'],
            object_name,
            expires=expires_hours * 3600
        )

        export = DatasetExport.objects.create(
            dataset=dataset,
            exported_by=dataset.created_by,
            format=export_format,
            file_path=object_name,
            download_url=download_url,
            file_size=file_size,
            file_count=len(export_data),
            expires_at=timezone.now() + timedelta(hours=expires_hours)
        )

        dataset.status = 'completed'
        dataset.download_url = download_url
        dataset.file_size = file_size
        dataset.total_files = len(export_data)
        dataset.save(update_fields=['status', 'download_url', 'file_size', 'total_files', 'updated_at'])

        logger.info(f"Successfully exported dataset: {dataset_id} with {len(export_data)} files")
        return {
            'status': 'success',
            'dataset_id': str(dataset_id),
            'export_id': export.id,
            'download_url': download_url,
            'file_count': len(export_data),
            'file_size': file_size
        }

    except Dataset.DoesNotExist:
        logger.error(f"Dataset not found: {dataset_id}")
        return {'status': 'error', 'message': 'Dataset not found'}
    except Exception as e:
        logger.error(f"Error exporting dataset {dataset_id}: {str(e)}", exc_info=True)
        try:
            dataset = Dataset.objects.get(id=dataset_id)
            dataset.status = 'failed'
            dataset.save(update_fields=['status', 'updated_at'])
        except:
            pass
        self.retry(exc=e, countdown=60)
        return {'status': 'error', 'message': str(e)}
