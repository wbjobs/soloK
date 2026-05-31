from celery import shared_task
from django.conf import settings
import logging

from .models import AudioSegment
from utils.minio_client import minio_client
from utils.audio_processing import (
    load_audio, validate_audio, generate_initial_annotation,
    generate_waveform_data, generate_spectrogram_data
)
from utils.speech_recognition import generate_initial_annotation_with_asr
from utils.speaker_verification import extract_speaker_embedding

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_audio_segment(self, audio_id, use_whisper: bool = True):
    try:
        audio = AudioSegment.objects.get(id=audio_id)
        logger.info(f"Processing audio segment: {audio_id}")

        file_bytes = minio_client.download_file(
            settings.MINIO_CONFIG['bucket_audio'],
            audio.file_path
        )

        valid, message = validate_audio(file_bytes)
        if not valid:
            audio.status = 'rejected'
            audio.save(update_fields=['status', 'updated_at'])
            logger.error(f"Audio validation failed for {audio_id}: {message}")
            return {'status': 'error', 'message': message}

        audio_data, sr = load_audio(file_bytes)
        audio.sample_rate = sr

        dialect_code = audio.dialect.code if audio.dialect else 'mandarin'
        initial_annotation = generate_initial_annotation_with_asr(
            audio_data, sr, dialect_code=dialect_code, use_whisper=use_whisper
        )
        
        audio.initial_phonemes = {'phonemes': initial_annotation['phonemes']}
        audio.waveform_data = initial_annotation['waveform']
        audio.spectrogram_data = initial_annotation['spectrogram']
        audio.duration = initial_annotation['duration']

        if initial_annotation.get('asr_success'):
            audio.asr_transcript = initial_annotation.get('transcript', '')
            audio.asr_segments = initial_annotation.get('asr_segments', [])
            audio.asr_success = True
            if audio.asr_transcript and not audio.text_transcript:
                audio.text_transcript = audio.asr_transcript

        embedding_result = extract_speaker_embedding(audio_data, sr)
        if embedding_result.get('success'):
            audio.speaker_embedding = embedding_result['embedding']
            audio.speaker_embedding_model = embedding_result.get('model', '')

        audio.status = 'processed'
        from django.utils import timezone
        audio.processed_at = timezone.now()
        audio.save()

        logger.info(f"Successfully processed audio segment: {audio_id}")
        return {
            'status': 'success',
            'audio_id': str(audio_id),
            'duration': audio.duration,
            'phoneme_count': len(initial_annotation['phonemes']),
            'asr_success': initial_annotation.get('asr_success', False),
            'embedding_success': embedding_result.get('success', False)
        }

    except AudioSegment.DoesNotExist:
        logger.error(f"Audio segment not found: {audio_id}")
        return {'status': 'error', 'message': 'Audio segment not found'}
    except Exception as e:
        logger.error(f"Error processing audio {audio_id}: {str(e)}", exc_info=True)
        self.retry(exc=e, countdown=60)
        return {'status': 'error', 'message': str(e)}


@shared_task
def batch_process_audio(audio_ids):
    results = []
    for audio_id in audio_ids:
        result = process_audio_segment.delay(audio_id)
        results.append({'audio_id': audio_id, 'task_id': result.id})
    return {'submitted': len(results), 'tasks': results}


@shared_task
def regenerate_waveform(audio_id):
    try:
        audio = AudioSegment.objects.get(id=audio_id)
        file_bytes = minio_client.download_file(
            settings.MINIO_CONFIG['bucket_audio'],
            audio.file_path
        )
        audio_data, sr = load_audio(file_bytes)
        audio.waveform_data = generate_waveform_data(audio_data, sr)
        audio.save(update_fields=['waveform_data', 'updated_at'])
        return {'status': 'success'}
    except Exception as e:
        logger.error(f"Error regenerating waveform for {audio_id}: {str(e)}")
        return {'status': 'error', 'message': str(e)}


@shared_task
def regenerate_spectrogram(audio_id):
    try:
        audio = AudioSegment.objects.get(id=audio_id)
        file_bytes = minio_client.download_file(
            settings.MINIO_CONFIG['bucket_audio'],
            audio.file_path
        )
        audio_data, sr = load_audio(file_bytes)
        audio.spectrogram_data = generate_spectrogram_data(audio_data, sr)
        audio.save(update_fields=['spectrogram_data', 'updated_at'])
        return {'status': 'success'}
    except Exception as e:
        logger.error(f"Error regenerating spectrogram for {audio_id}: {str(e)}")
        return {'status': 'error', 'message': str(e)}
