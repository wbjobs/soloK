import numpy as np
from typing import List, Dict, Tuple, Optional


def cohen_kappa(annotator1: List, annotator2: List, labels: Optional[List] = None) -> float:
    if len(annotator1) != len(annotator2):
        raise ValueError("Annotator lists must have the same length")

    n = len(annotator1)
    if n == 0:
        return 0.0

    if labels is None:
        all_items = list(set(annotator1) | set(annotator2))
        labels = sorted(all_items)

    label_to_idx = {label: i for i, label in enumerate(labels)}
    num_labels = len(labels)

    if num_labels == 0:
        return 0.0

    observed = np.zeros((num_labels, num_labels))
    for a1, a2 in zip(annotator1, annotator2):
        if a1 in label_to_idx and a2 in label_to_idx:
            observed[label_to_idx[a1], label_to_idx[a2]] += 1

    po = np.trace(observed) / n

    row_sums = observed.sum(axis=1)
    col_sums = observed.sum(axis=0)
    pe = (row_sums @ col_sums) / (n * n)

    if pe == 1.0:
        return 1.0

    kappa = (po - pe) / (1 - pe)
    return max(-1.0, min(1.0, kappa))


def fleiss_kappa(annotations: List[List], labels: Optional[List] = None) -> float:
    n_subjects = len(annotations)
    if n_subjects == 0:
        return 0.0

    n_raters = len(annotations[0])

    if labels is None:
        all_labels = set()
        for ann in annotations:
            all_labels.update(ann)
        labels = sorted(all_labels)

    label_to_idx = {label: i for i, label in enumerate(labels)}
    num_labels = len(labels)

    n = np.zeros((n_subjects, num_labels))
    for i, ann in enumerate(annotations):
        for rating in ann:
            if rating in label_to_idx:
                n[i, label_to_idx[rating]] += 1

    pj = n.sum(axis=0) / (n_subjects * n_raters)
    pe = (pj ** 2).sum()

    pi = ((n ** 2).sum(axis=1) - n_raters) / (n_raters * (n_raters - 1))
    po = pi.mean()

    if pe == 1.0:
        return 1.0

    kappa = (po - pe) / (1 - pe)
    return max(-1.0, min(1.0, kappa))


def calculate_phoneme_agreement(ann1_phonemes: List[Dict], ann2_phonemes: List[Dict],
                                tolerance: float = 0.1,
                                negligible_threshold: float = 0.01) -> Tuple[float, List[Dict]]:
    disagreements = []
    matched = 0
    total = max(len(ann1_phonemes), len(ann2_phonemes))

    if total == 0:
        return 1.0, []

    for i, (p1, p2) in enumerate(zip(ann1_phonemes, ann2_phonemes)):
        start_diff = abs(p1.get('start_time', 0) - p2.get('start_time', 0))
        end_diff = abs(p1.get('end_time', 0) - p2.get('end_time', 0))
        phoneme_match = p1.get('phoneme', '') == p2.get('phoneme', '')
        tone_match = p1.get('tone') == p2.get('tone')

        time_agree = start_diff <= tolerance and end_diff <= tolerance
        content_agree = phoneme_match and tone_match

        negligible_time_diff = start_diff <= negligible_threshold and end_diff <= negligible_threshold

        if negligible_time_diff:
            time_agree = True

        if time_agree and content_agree:
            matched += 1
        else:
            time_mismatch = not time_agree and not negligible_time_diff
            
            disagreements.append({
                'index': i,
                'annotator1': p1,
                'annotator2': p2,
                'time_diff': max(start_diff, end_diff),
                'phoneme_mismatch': not phoneme_match,
                'tone_mismatch': not tone_match,
                'time_mismatch': time_mismatch,
                'negligible_time_diff': negligible_time_diff
            })

    agreement = matched / total if total > 0 else 1.0
    return agreement, disagreements


def compute_overall_kappa(annotation1: Dict, annotation2: Dict) -> Dict:
    phonemes1 = annotation1.get('phonemes', [])
    phonemes2 = annotation2.get('phonemes', [])

    phoneme_labels1 = [p.get('phoneme', '') for p in phonemes1]
    phoneme_labels2 = [p.get('phoneme', '') for p in phonemes2]
    min_len = min(len(phoneme_labels1), len(phoneme_labels2))

    phoneme_kappa = cohen_kappa(
        phoneme_labels1[:min_len],
        phoneme_labels2[:min_len]
    )

    tone_labels1 = [p.get('tone') for p in phonemes1]
    tone_labels2 = [p.get('tone') for p in phonemes2]

    tone_kappa = cohen_kappa(
        tone_labels1[:min_len],
        tone_labels2[:min_len]
    )

    agreement, disagreements = calculate_phoneme_agreement(phonemes1, phonemes2)

    overall_kappa = (phoneme_kappa + tone_kappa) / 2

    return {
        'overall_kappa': round(overall_kappa, 4),
        'phoneme_kappa': round(phoneme_kappa, 4),
        'tone_kappa': round(tone_kappa, 4),
        'agreement_rate': round(agreement, 4),
        'disagreements': disagreements,
        'total_phonemes': max(len(phonemes1), len(phonemes2)),
        'matched_phonemes': int(agreement * max(len(phonemes1), len(phonemes2)))
    }


def interpret_kappa(kappa: float) -> str:
    if kappa < 0:
        return "Poor agreement"
    elif kappa < 0.20:
        return "Slight agreement"
    elif kappa < 0.40:
        return "Fair agreement"
    elif kappa < 0.60:
        return "Moderate agreement"
    elif kappa < 0.80:
        return "Substantial agreement"
    else:
        return "Almost perfect agreement"
