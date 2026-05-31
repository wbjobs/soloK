#include "data_processor.h"
#include <algorithm>
#include <cmath>
#include <iostream>

DataProcessor::DataProcessor(size_t fft_size)
    : fft_size_(fft_size)
    , window_type_(WindowType::HANN)
    , fft_in_(fft_size, 0.0)
    , fft_out_(fft_size / 2 + 1) {
    generateWindow();
    fft_plan_ = fftw_plan_dft_r2c_1d(
        static_cast<int>(fft_size),
        fft_in_.data(),
        reinterpret_cast<fftw_complex*>(fft_out_.data()),
        FFTW_MEASURE
    );
}

DataProcessor::~DataProcessor() {
    fftw_destroy_plan(fft_plan_);
}

void DataProcessor::setWindowType(WindowType type) {
    window_type_ = type;
    generateWindow();
}

void DataProcessor::generateWindow() {
    window_.resize(fft_size_);
    
    switch (window_type_) {
        case WindowType::HANN:
            for (size_t n = 0; n < fft_size_; ++n) {
                window_[n] = 0.5f * (1.0f - std::cos(2.0f * M_PI * n / (fft_size_ - 1)));
            }
            break;
        case WindowType::HAMMING:
            for (size_t n = 0; n < fft_size_; ++n) {
                window_[n] = 0.54f - 0.46f * std::cos(2.0f * M_PI * n / (fft_size_ - 1));
            }
            break;
        case WindowType::BLACKMAN:
            for (size_t n = 0; n < fft_size_; ++n) {
                double t = 2.0 * M_PI * n / (fft_size_ - 1);
                window_[n] = 0.42f - 0.5f * std::cos(t) + 0.08f * std::cos(2.0 * t);
            }
            break;
        case WindowType::RECTANGULAR:
            std::fill(window_.begin(), window_.end(), 1.0f);
            break;
    }
}

void DataProcessor::applyWindow(std::vector<double>& data) const {
    for (size_t i = 0; i < data.size() && i < window_.size(); ++i) {
        data[i] *= window_[i];
    }
}

AeroCoefficients DataProcessor::calculateAeroCoefficients(
    const BalanceData& balance_data,
    double air_density,
    double velocity,
    double reference_area,
    double chord_length
) {
    AeroCoefficients coeffs;
    double dynamic_pressure = 0.5 * air_density * velocity * velocity;

    double Fx = balance_data.values[0];
    double Fy = balance_data.values[1];
    double Fz = balance_data.values[2];
    double Mx = balance_data.values[3];
    double My = balance_data.values[4];
    double Mz = balance_data.values[5];

    coeffs.Cl = 2.0 * Fz / (dynamic_pressure * reference_area);
    coeffs.Cd = 2.0 * Fx / (dynamic_pressure * reference_area);
    coeffs.Cm = 2.0 * My / (dynamic_pressure * reference_area * chord_length);
    coeffs.L_over_D = (coeffs.Cd != 0.0) ? (coeffs.Cl / coeffs.Cd) : 0.0;

    return coeffs;
}

std::vector<float> DataProcessor::computeWindowedFFT(const std::vector<float>& signal) {
    size_t n = std::min(signal.size(), fft_size_);
    std::fill(fft_in_.begin(), fft_in_.end(), 0.0);
    
    for (size_t i = 0; i < n; ++i) {
        fft_in_[i] = static_cast<double>(signal[i]);
    }
    
    applyWindow(fft_in_);

    fftw_execute(fft_plan_);

    std::vector<float> result(fft_size_ / 2 + 1);
    for (size_t i = 0; i < result.size(); ++i) {
        result[i] = static_cast<float>(std::abs(fft_out_[i]));
    }
    return result;
}

std::vector<float> DataProcessor::computeWelchPSD(const std::vector<float>& signal,
                                                       double sample_rate,
                                                       size_t nperseg,
                                                       size_t noverlap) {
    if (signal.size() < nperseg) {
        return std::vector<float>(fft_size_ / 2 + 1, 0.0f);
    }

    size_t step = nperseg - noverlap;
    size_t n_segments = (signal.size() - noverlap) / step;
    
    if (n_segments == 0) n_segments = 1;

    std::vector<double> psd_sum(fft_size_ / 2 + 1, 0.0);
    
    double window_power = 0.0;
    for (size_t i = 0; i < nperseg && i < window_.size(); ++i) {
        window_power += window_[i] * window_[i];
    }
    double norm = 1.0 / (sample_rate * window_power);

    for (size_t seg = 0; seg < n_segments; ++seg) {
        size_t start = seg * step;
        size_t end = std::min(start + nperseg, signal.size());
        
        std::fill(fft_in_.begin(), fft_in_.end(), 0.0);
        for (size_t i = 0; i < end - start; ++i) {
            fft_in_[i] = static_cast<double>(signal[start + i]);
        }
        
        applyWindow(fft_in_);
        fftw_execute(fft_plan_);

        for (size_t i = 0; i < psd_sum.size(); ++i) {
            double mag = std::abs(fft_out_[i]);
            psd_sum[i] += mag * mag * norm;
        }
    }

    std::vector<float> psd(psd_sum.size());
    for (size_t i = 0; i < psd.size(); ++i) {
        psd[i] = static_cast<float>(psd_sum[i] / n_segments);
        if (i > 0 && i < psd.size() - 1) {
            psd[i] *= 2.0f;
        }
    }

    return psd;
}

std::vector<std::vector<float>> DataProcessor::computeSTFT(const std::vector<float>& signal,
                                                                double sample_rate,
                                                                size_t nperseg,
                                                                size_t noverlap) {
    if (signal.size() < nperseg) {
        return {};
    }

    size_t step = nperseg - noverlap;
    size_t n_frames = (signal.size() - noverlap) / step;
    
    std::vector<std::vector<float>> stft_result;
    stft_result.reserve(n_frames);

    for (size_t frame = 0; frame < n_frames; ++frame) {
        size_t start = frame * step;
        size_t end = std::min(start + nperseg, signal.size());
        
        std::fill(fft_in_.begin(), fft_in_.end(), 0.0);
        for (size_t i = 0; i < end - start; ++i) {
            fft_in_[i] = static_cast<double>(signal[start + i]);
        }
        
        applyWindow(fft_in_);
        fftw_execute(fft_plan_);

        std::vector<float> spectrum(fft_size_ / 2 + 1);
        for (size_t i = 0; i < spectrum.size(); ++i) {
            spectrum[i] = static_cast<float>(std::abs(fft_out_[i]));
        }
        stft_result.push_back(std::move(spectrum));
    }

    return stft_result;
}

std::vector<float> DataProcessor::getFrequencies(double sample_rate) const {
    std::vector<float> freqs(fft_size_ / 2 + 1);
    for (size_t i = 0; i < freqs.size(); ++i) {
        freqs[i] = static_cast<float>(i * sample_rate / fft_size_);
    }
    return freqs;
}

std::vector<float> DataProcessor::computeMeanPressure(const std::vector<PressureData>& data) {
    std::vector<float> means(PRESSURE_CHANNELS, 0.0f);
    if (data.empty()) return means;

    for (const auto& sample : data) {
        for (size_t i = 0; i < PRESSURE_CHANNELS; ++i) {
            means[i] += sample.values[i];
        }
    }

    for (auto& m : means) {
        m /= static_cast<float>(data.size());
    }
    return means;
}

std::vector<float> DataProcessor::computeRMS(const std::vector<PressureData>& data) {
    std::vector<float> rms(PRESSURE_CHANNELS, 0.0f);
    std::vector<float> means = computeMeanPressure(data);
    if (data.empty()) return rms;

    for (const auto& sample : data) {
        for (size_t i = 0; i < PRESSURE_CHANNELS; ++i) {
            float diff = sample.values[i] - means[i];
            rms[i] += diff * diff;
        }
    }

    for (auto& r : rms) {
        r = std::sqrt(r / static_cast<float>(data.size()));
    }
    return rms;
}

double DataProcessor::findVortexSheddingFreq(const std::vector<float>& freqs,
                                                  const std::vector<float>& psd,
                                                  double sample_rate,
                                                  double min_freq,
                                                  double max_freq) {
    if (psd.empty() || freqs.empty() || psd.size() != freqs.size()) {
        return 0.0;
    }

    size_t start_idx = 0;
    size_t end_idx = psd.size() - 1;
    
    for (size_t i = 0; i < freqs.size(); ++i) {
        if (freqs[i] >= min_freq) {
            start_idx = i;
            break;
        }
    }
    
    for (size_t i = freqs.size(); i-- > 0; ) {
        if (freqs[i] <= max_freq) {
            end_idx = i;
            break;
        }
    }

    if (start_idx >= end_idx) return 0.0;

    size_t peak_idx = start_idx;
    float peak_val = psd[start_idx];
    
    for (size_t i = start_idx + 1; i <= end_idx; ++i) {
        if (psd[i] > peak_val) {
            bool is_local_peak = true;
            for (int j = -3; j <= 3; ++j) {
                if (j != 0 && i + j >= start_idx && i + j <= end_idx) {
                    if (psd[i] <= psd[i + j]) {
                        is_local_peak = false;
                        break;
                    }
                }
            }
            if (is_local_peak) {
                peak_val = psd[i];
                peak_idx = i;
            }
        }
    }

    if (peak_idx > 0 && peak_idx < psd.size() - 1) {
        float y1 = psd[peak_idx - 1];
        float y2 = psd[peak_idx];
        float y3 = psd[peak_idx + 1];
        float denom = 2.0f * (y1 - 2.0f * y2 + y3);
        if (std::abs(denom) > 1e-10f) {
            float d = (y1 - y3) / denom;
            return freqs[peak_idx] + d * (freqs[1] - freqs[0]);
        }
    }

    return freqs[peak_idx];
}
