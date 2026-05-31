#pragma once

#include "common.h"
#include <vector>
#include <complex>
#include <fftw3.h>

enum class WindowType {
    HANN,
    HAMMING,
    BLACKMAN,
    RECTANGULAR
};

class DataProcessor {
public:
    DataProcessor(size_t fft_size = 1024);
    ~DataProcessor();

    AeroCoefficients calculateAeroCoefficients(
        const BalanceData& balance_data,
        double air_density,
        double velocity,
        double reference_area,
        double chord_length
    );

    void setWindowType(WindowType type);

    std::vector<float> computeWindowedFFT(const std::vector<float>& signal);

    std::vector<float> computeWelchPSD(const std::vector<float>& signal, 
                                           double sample_rate,
                                           size_t nperseg,
                                           size_t noverlap);

    std::vector<std::vector<float>> computeSTFT(const std::vector<float>& signal,
                                                     double sample_rate,
                                                     size_t nperseg,
                                                     size_t noverlap);

    std::vector<float> computeMeanPressure(const std::vector<PressureData>& data);
    std::vector<float> computeRMS(const std::vector<PressureData>& data);

    double findVortexSheddingFreq(const std::vector<float>& freqs, 
                                        const std::vector<float>& psd,
                                        double sample_rate,
                                        double min_freq = 10.0,
                                        double max_freq = 1000.0);

    std::vector<float> getFrequencies(double sample_rate) const;

    std::vector<float> getWindow() const { return window_; }

private:
    void generateWindow();
    void applyWindow(std::vector<double>& data) const;

    size_t fft_size_;
    WindowType window_type_;
    std::vector<float> window_;

    fftw_plan fft_plan_;
    std::vector<double> fft_in_;
    std::vector<std::complex<double>> fft_out_;
};
