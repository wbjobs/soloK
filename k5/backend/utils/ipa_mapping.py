from typing import Dict, Optional


IPA_TO_PINYIN: Dict[str, str] = {
    'p': 'b', 'pʰ': 'p', 'm': 'm', 'f': 'f',
    't': 'd', 'tʰ': 't', 'n': 'n', 'l': 'l',
    'k': 'g', 'kʰ': 'k', 'x': 'h',
    'tɕ': 'j', 'tɕʰ': 'q', 'ɕ': 'x',
    'tʂ': 'zh', 'tʂʰ': 'ch', 'ʂ': 'sh', 'ʐ': 'r',
    'ts': 'z', 'tsʰ': 'c', 's': 's',
    'a': 'a', 'o': 'o', 'ə': 'e', 'ɛ': 'ê', 'i': 'i', 'u': 'u', 'y': 'ü',
    'ai': 'ai', 'ei': 'ei', 'au': 'ao', 'ou': 'ou',
    'an': 'an', 'ən': 'en', 'aŋ': 'ang', 'əŋ': 'eng',
    'ia': 'ia', 'ie': 'ie', 'iu': 'iu', 'ian': 'ian', 'in': 'in', 'iŋ': 'ing',
    'ua': 'ua', 'uo': 'uo', 'uai': 'uai', 'ui': 'ui', 'uan': 'uan', 'un': 'un', 'uŋ': 'ong',
    'ye': 'üe', 'yn': 'ün', 'yŋ': 'iong',
}

PINYIN_TO_IPA: Dict[str, str] = {v: k for k, v in IPA_TO_PINYIN.items()}

CANTONESE_TONES: Dict[int, str] = {
    1: '˥˥', 2: '˧˥', 3: '˧˧', 4: '˨˩', 5: '˨˧', 6: '˨˨', 7: '˥˥', 8: '˧˥', 9: '˨˩'
}

CANTONESE_TONE_NAMES: Dict[int, str] = {
    1: '阴平', 2: '阴上', 3: '阴去', 4: '阳平', 5: '阳上', 6: '阳去', 7: '阴入', 8: '中入', 9: '阳入'
}

MANDARIN_TONES: Dict[int, str] = {
    1: '˥˥', 2: '˧˥', 3: '˨˩˦', 4: '˥˩', 5: ''
}

MANDARIN_TONE_NAMES: Dict[int, str] = {
    1: '阴平', 2: '阳平', 3: '上声', 4: '去声', 5: '轻声'
}

DIALECT_TONE_SYSTEMS: Dict[str, Dict] = {
    'cantonese': {
        'tones': CANTONESE_TONES,
        'names': CANTONESE_TONE_NAMES,
        'count': 9
    },
    'mandarin': {
        'tones': MANDARIN_TONES,
        'names': MANDARIN_TONE_NAMES,
        'count': 5
    },
    'minnan': {
        'tones': {
            1: '˥˥', 2: '˥˧', 3: '˧˧', 4: '˨˩', 5: '˨˦', 6: '˨˨', 7: '˧˨', 8: '˦'
        },
        'names': {
            1: '阴平', 2: '阴上', 3: '阴去', 4: '阳平', 5: '阳上', 6: '阳去', 7: '阴入', 8: '阳入'
        },
        'count': 8
    },
    'wu': {
        'tones': {
            1: '˥˥', 2: '˥˧', 3: '˧˥', 4: '˨˩˧', 5: '˨˦', 6: '˧˧', 7: '˨˧', 8: '˨˨'
        },
        'names': {
            1: '阴平', 2: '阴上', 3: '阴去', 4: '阳平', 5: '阳上', 6: '阳去', 7: '阴入', 8: '阳入'
        },
        'count': 8
    }
}


def ipa_to_pinyin(ipa: str) -> str:
    return IPA_TO_PINYIN.get(ipa, ipa)


def pinyin_to_ipa(pinyin: str) -> str:
    return PINYIN_TO_IPA.get(pinyin.lower(), pinyin)


def get_tone_mark(dialect: str, tone_number: int, format: str = 'ipa') -> Optional[str]:
    system = DIALECT_TONE_SYSTEMS.get(dialect)
    if not system:
        return None

    if format == 'ipa':
        return system['tones'].get(tone_number)
    elif format == 'name':
        return system['names'].get(tone_number)
    return None


def get_tone_options(dialect: str) -> list:
    system = DIALECT_TONE_SYSTEMS.get(dialect)
    if not system:
        return []

    options = []
    for tone_num in sorted(system['tones'].keys()):
        options.append({
            'number': tone_num,
            'ipa': system['tones'][tone_num],
            'name': system['names'][tone_num]
        })
    return options
