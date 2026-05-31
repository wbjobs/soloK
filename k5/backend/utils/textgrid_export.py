import io
import json
from typing import List, Dict, Any
from praatio import textgrid


def export_to_textgrid(annotations: List[Dict], duration: float, filename: str) -> bytes:
    tg = textgrid.Textgrid()
    tg.minTimestamp = 0
    tg.maxTimestamp = duration

    phoneme_tier = textgrid.IntervalTier(
        name="phonemes",
        entries=[],
        minT=0,
        maxT=duration
    )

    tone_tier = textgrid.IntervalTier(
        name="tones",
        entries=[],
        minT=0,
        maxT=duration
    )

    pinyin_tier = textgrid.IntervalTier(
        name="pinyin",
        entries=[],
        minT=0,
        maxT=duration
    )

    ipa_tier = textgrid.IntervalTier(
        name="IPA",
        entries=[],
        minT=0,
        maxT=duration
    )

    for phoneme in annotations:
        start = phoneme.get('start_time', 0)
        end = phoneme.get('end_time', 0)
        if end <= start:
            continue

        phoneme_text = phoneme.get('phoneme', '')
        tone = phoneme.get('tone')
        tone_text = str(tone) if tone else ''
        pinyin_text = phoneme.get('pinyin', '')
        ipa_text = phoneme.get('ipa', '')

        phoneme_tier.insertEntry(start, end, phoneme_text)
        tone_tier.insertEntry(start, end, tone_text)
        pinyin_tier.insertEntry(start, end, pinyin_text)
        ipa_tier.insertEntry(start, end, ipa_text)

    tg.addTier(phoneme_tier)
    tg.addTier(tone_tier)
    tg.addTier(pinyin_tier)
    tg.addTier(ipa_tier)

    output = io.StringIO()
    tg.save(output, format="long_textgrid", includeBlankSpaces=True)
    return output.getvalue().encode('utf-8')


def export_to_json(metadata: Dict, annotations: List[Dict], audio_info: Dict) -> bytes:
    export_data = {
        'metadata': {
            'audio_id': metadata.get('audio_id'),
            'dialect': metadata.get('dialect'),
            'dialect_subregion': metadata.get('dialect_subregion'),
            'speaker_gender': metadata.get('speaker_gender'),
            'speaker_age': metadata.get('speaker_age'),
            'duration': audio_info.get('duration'),
            'sample_rate': audio_info.get('sample_rate'),
            'annotator_id': metadata.get('annotator_id'),
            'annotator_name': metadata.get('annotator_name'),
            'annotation_date': metadata.get('annotation_date'),
            'quality_score': metadata.get('quality_score'),
        },
        'phonemes': annotations,
        'audio': {
            'filename': audio_info.get('filename'),
            'url': audio_info.get('url'),
        }
    }
    return json.dumps(export_data, ensure_ascii=False, indent=2).encode('utf-8')


def create_dataset_package(audio_segments: List[Dict], output_dir: str = '/tmp') -> str:
    import os
    import zipfile

    os.makedirs(output_dir, exist_ok=True)
    zip_path = os.path.join(output_dir, f'dataset_{len(audio_segments)}_files.zip')

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for segment in audio_segments:
            audio_id = segment.get('audio_id')

            tg_bytes = export_to_textgrid(
                segment.get('annotations', []),
                segment.get('duration', 0),
                f'{audio_id}.TextGrid'
            )
            zf.writestr(f'{audio_id}/{audio_id}.TextGrid', tg_bytes)

            json_bytes = export_to_json(
                segment.get('metadata', {}),
                segment.get('annotations', []),
                segment.get('audio_info', {})
            )
            zf.writestr(f'{audio_id}/{audio_id}.json', json_bytes)

            manifest = {
                'audio_id': audio_id,
                'textgrid_file': f'{audio_id}/{audio_id}.TextGrid',
                'json_file': f'{audio_id}/{audio_id}.json',
                'dialect': segment.get('metadata', {}).get('dialect'),
                'speaker_gender': segment.get('metadata', {}).get('speaker_gender'),
                'speaker_age': segment.get('metadata', {}).get('speaker_age'),
            }
            zf.writestr(f'{audio_id}/manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))

    return zip_path
