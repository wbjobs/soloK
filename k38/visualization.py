import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from io import BytesIO
import base64
from typing import List, Optional
from models import FeederData


def generate_fault_waveform(zero_seq_voltage: np.ndarray,
                            feeders: List[FeederData],
                            fault_start_sample: Optional[int] = None,
                            fault_feeder_id: Optional[int] = None,
                            sampling_rate: int = 12800,
                            fundamental_freq: float = 50.0) -> str:
    n_samples = len(zero_seq_voltage)
    t = np.arange(n_samples) / sampling_rate * 1000
    
    fig, axes = plt.subplots(3, 1, figsize=(12, 10))
    fig.suptitle('Single-phase Grounding Fault Waveform Analysis', fontsize=14, fontweight='bold')
    
    ax1 = axes[0]
    ax1.plot(t, zero_seq_voltage, 'b-', linewidth=1.5, label='Zero-sequence Voltage')
    if fault_start_sample is not None and fault_start_sample < n_samples:
        fault_time = t[fault_start_sample]
        ax1.axvline(x=fault_time, color='r', linestyle='--', linewidth=2, label=f'Fault Onset ({fault_time:.2f}ms)')
        ax1.plot(fault_time, zero_seq_voltage[fault_start_sample], 'ro', markersize=8)
    ax1.set_xlabel('Time (ms)')
    ax1.set_ylabel('Voltage (p.u.)')
    ax1.set_title('Zero-sequence Voltage')
    ax1.legend(loc='upper right')
    ax1.grid(True, alpha=0.3)
    
    ax2 = axes[1]
    colors = ['b', 'g', 'c', 'm', 'y', 'k', 'orange', 'purple']
    for i, feeder in enumerate(feeders):
        color = colors[i % len(colors)]
        zero_current = np.array(feeder.zero_sequence)
        label = f'Feeder {feeder.feeder_id}'
        if fault_feeder_id is not None and feeder.feeder_id == fault_feeder_id:
            ax2.plot(t, zero_current, color=color, linewidth=2.5, label=f'{label} (Fault Feeder)')
        else:
            ax2.plot(t, zero_current, color=color, linewidth=1, alpha=0.7, label=label)
    if fault_start_sample is not None and fault_start_sample < n_samples:
        ax2.axvline(x=fault_time, color='r', linestyle='--', linewidth=2)
    ax2.set_xlabel('Time (ms)')
    ax2.set_ylabel('Current (A)')
    ax2.set_title('Zero-sequence Current of Each Feeder')
    ax2.legend(loc='upper right', fontsize=8)
    ax2.grid(True, alpha=0.3)
    
    ax3 = axes[2]
    if fault_start_sample is not None and fault_feeder_id is not None:
        fault_feeder = next((f for f in feeders if f.feeder_id == fault_feeder_id), None)
        if fault_feeder:
            transient_start = max(0, fault_start_sample - int(sampling_rate / fundamental_freq * 0.02))
            transient_end = min(n_samples, fault_start_sample + int(sampling_rate / fundamental_freq * 0.1))
            
            t_transient = t[transient_start:transient_end]
            
            ax3.plot(t_transient, np.array(fault_feeder.phase_a)[transient_start:transient_end], 
                    'r-', linewidth=1.5, label='Phase A')
            ax3.plot(t_transient, np.array(fault_feeder.phase_b)[transient_start:transient_end], 
                    'g-', linewidth=1.5, label='Phase B')
            ax3.plot(t_transient, np.array(fault_feeder.phase_c)[transient_start:transient_end], 
                    'b-', linewidth=1.5, label='Phase C')
            ax3.plot(t_transient, np.array(fault_feeder.zero_sequence)[transient_start:transient_end], 
                    'k-', linewidth=2, label='Zero-sequence')
            
            rel_fault_idx = fault_start_sample - transient_start
            if 0 <= rel_fault_idx < len(t_transient):
                ax3.axvline(x=t_transient[rel_fault_idx], color='m', linestyle='--', linewidth=2, label='Fault Onset')
                ax3.plot(t_transient[rel_fault_idx], np.array(fault_feeder.zero_sequence)[fault_start_sample], 
                        'mo', markersize=8)
    
    ax3.set_xlabel('Time (ms)')
    ax3.set_ylabel('Current (A)')
    ax3.set_title('Transient Characteristic Detail of Fault Feeder')
    ax3.legend(loc='upper right', fontsize=8)
    ax3.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    return img_base64


def generate_spectrum_plot(signal_data: np.ndarray,
                          sampling_rate: int = 12800,
                          title: str = 'Frequency Spectrum') -> str:
    from scipy.fft import fft, fftfreq
    
    n = len(signal_data)
    yf = fft(signal_data)
    xf = fftfreq(n, 1 / sampling_rate)
    
    magnitude = 2.0 / n * np.abs(yf[0:n // 2])
    
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(xf[:n // 2], magnitude, 'b-', linewidth=1.5)
    ax.set_xlabel('Frequency (Hz)')
    ax.set_ylabel('Magnitude')
    ax.set_title(title)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, 1000)
    
    plt.tight_layout()
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()
    
    return img_base64
