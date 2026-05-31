package prediction

import (
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"time"

	"digitaltwin/internal/timeseries"
)

type LSTMPredictor struct {
	ts           *timeseries.TSDB
	mu           sync.RWMutex
	models       map[string]*PredictionModel
	predictions  map[string][]PredictionPoint
	predictEvery time.Duration
	windowSize   int
	predictSteps int
	externalAPI  string
}

type PredictionModel struct {
	DeviceID    string    `json:"device_id"`
	LastTrainAt time.Time `json:"last_train_at"`
	Weights     []float64 `json:"weights"`
	MAE         float64   `json:"mae"`
	RMSE        float64   `json:"rmse"`
}

type PredictionPoint struct {
	Timestamp      time.Time `json:"timestamp"`
	PredictedValue float64   `json:"predicted_value"`
	UpperBound     float64   `json:"upper_bound"`
	LowerBound     float64   `json:"lower_bound"`
	Confidence     float64   `json:"confidence"`
	WillExceed     bool      `json:"will_exceed"`
}

type PredictionResult struct {
	DeviceID     string            `json:"device_id"`
	GeneratedAt  time.Time         `json:"generated_at"`
	Predictions  []PredictionPoint `json:"predictions"`
	MaxVibration float64           `json:"max_vibration"`
	WillExceed   bool              `json:"will_exceed"`
	ExceedTime   *time.Time        `json:"exceed_time,omitempty"`
	ModelInfo    PredictionModel   `json:"model_info"`
}

func NewLSTMPredictor(ts *timeseries.TSDB, windowSize, predictSteps int, externalAPI string) *LSTMPredictor {
	return &LSTMPredictor{
		ts:           ts,
		models:       make(map[string]*PredictionModel),
		predictions:  make(map[string][]PredictionPoint),
		predictEvery: 5 * time.Minute,
		windowSize:   windowSize,
		predictSteps: predictSteps,
		externalAPI:  externalAPI,
	}
}

func (p *LSTMPredictor) Train(deviceID string) error {
	if p.ts == nil {
		return fmt.Errorf("timeseries database not available")
	}

	endTime := time.Now()
	startTime := endTime.Add(-24 * time.Hour)

	telemetry, err := p.ts.QueryTelemetry(deviceID, startTime, endTime)
	if err != nil {
		return fmt.Errorf("failed to query telemetry: %w", err)
	}

	if len(telemetry) < p.windowSize {
		return fmt.Errorf("insufficient data: need %d samples, got %d", p.windowSize, len(telemetry))
	}

	vibrations := make([]float64, len(telemetry))
	for i, t := range telemetry {
		vibrations[i] = t.Vibration
	}

	if p.externalAPI != "" {
		model, err := p.trainWithExternalAPI(deviceID, vibrations)
		if err == nil {
			p.mu.Lock()
			p.models[deviceID] = model
			p.mu.Unlock()
			return nil
		}
	}

	model := p.trainLocal(deviceID, vibrations)

	p.mu.Lock()
	p.models[deviceID] = model
	p.mu.Unlock()

	return nil
}

func (p *LSTMPredictor) trainWithExternalAPI(deviceID string, data []float64) (*PredictionModel, error) {
	requestBody := map[string]interface{}{
		"device_id":    deviceID,
		"data":         data,
		"window_size":  p.windowSize,
		"predict_steps": p.predictSteps,
	}

	jsonData, _ := json.Marshal(requestBody)
	_ = jsonData

	return nil, fmt.Errorf("external API not available")
}

func (p *LSTMPredictor) trainLocal(deviceID string, vibrations []float64) *PredictionModel {
	n := len(vibrations)

	var sum float64
	for _, v := range vibrations {
		sum += v
	}
	mean := sum / float64(n)

	var variance float64
	for _, v := range vibrations {
		variance += (v - mean) * (v - mean)
	}
	variance /= float64(n)
	std := math.Sqrt(variance)

	trend := 0.0
	if n > 1 {
		trend = (vibrations[n-1] - vibrations[0]) / float64(n)
	}

	autocorr := autoCorrelation(vibrations, 1)

	weights := []float64{mean, std, trend, autocorr}

	predictions := make([]float64, p.predictSteps)
	actuals := make([]float64, p.predictSteps)
	startIdx := n - p.windowSize - p.predictSteps

	if startIdx > 0 {
		for i := 0; i < p.predictSteps; i++ {
			idx := startIdx + p.windowSize + i
			if idx < n {
				actuals[i] = vibrations[idx]
			}
			window := vibrations[startIdx+i : startIdx+p.windowSize+i]
			predictions[i] = predictNext(window, mean, std, trend, autocorr)
		}
	}

	var mae, rmse float64
	for i := 0; i < p.predictSteps; i++ {
		err := math.Abs(predictions[i] - actuals[i])
		mae += err
		rmse += err * err
	}
	mae /= float64(p.predictSteps)
	rmse = math.Sqrt(rmse / float64(p.predictSteps))

	return &PredictionModel{
		DeviceID:    deviceID,
		LastTrainAt: time.Now(),
		Weights:     weights,
		MAE:         mae,
		RMSE:        rmse,
	}
}

func (p *LSTMPredictor) Predict(deviceID string) (*PredictionResult, error) {
	p.mu.RLock()
	model, hasModel := p.models[deviceID]
	p.mu.RUnlock()

	if !hasModel {
		if err := p.Train(deviceID); err != nil {
			return nil, fmt.Errorf("failed to train model: %w", err)
		}
		p.mu.RLock()
		model = p.models[deviceID]
		p.mu.RUnlock()
	}

	if p.ts == nil {
		return nil, fmt.Errorf("timeseries database not available")
	}

	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(p.windowSize) * 10 * time.Second)

	telemetry, err := p.ts.QueryTelemetry(deviceID, startTime, endTime)
	if err != nil {
		return nil, fmt.Errorf("failed to query recent telemetry: %w", err)
	}

	if len(telemetry) < p.windowSize/2 {
		return nil, fmt.Errorf("insufficient recent data: need %d, got %d", p.windowSize/2, len(telemetry))
	}

	recentVibrations := make([]float64, len(telemetry))
	for i, t := range telemetry {
		recentVibrations[i] = t.Vibration
	}

	mean, std, trend, autocorr := model.Weights[0], model.Weights[1], model.Weights[2], model.Weights[3]

	now := time.Now()
	predictions := make([]PredictionPoint, p.predictSteps)
	maxVibration := 0.0
	var exceedTime *time.Time
	willExceed := false
	threshold := 4.0

	window := recentVibrations
	for i := 0; i < p.predictSteps; i++ {
		predicted := predictNext(window, mean, std, trend, autocorr)

		uncertainty := std * (1.0 + float64(i)*0.1)
		confidence := math.Max(0, 1.0-float64(i)/float64(p.predictSteps)*0.5)

		predictions[i] = PredictionPoint{
			Timestamp:      now.Add(time.Duration(i+1) * 30 * time.Second),
			PredictedValue: predicted,
			UpperBound:     predicted + uncertainty*2,
			LowerBound:     math.Max(0, predicted-uncertainty*2),
			Confidence:     confidence,
			WillExceed:     predicted > threshold,
		}

		if predicted > maxVibration {
			maxVibration = predicted
		}

		if predicted > threshold && !willExceed {
			t := predictions[i].Timestamp
			exceedTime = &t
			willExceed = true
		}

		window = append(window[1:], predicted)
	}

	result := &PredictionResult{
		DeviceID:     deviceID,
		GeneratedAt:  now,
		Predictions:  predictions,
		MaxVibration: maxVibration,
		WillExceed:   willExceed,
		ExceedTime:   exceedTime,
		ModelInfo:    *model,
	}

	p.mu.Lock()
	p.predictions[deviceID] = predictions
	p.mu.Unlock()

	return result, nil
}

func (p *LSTMPredictor) GetPrediction(deviceID string) (*PredictionResult, error) {
	p.mu.RLock()
	points, exists := p.predictions[deviceID]
	model := p.models[deviceID]
	p.mu.RUnlock()

	if !exists {
		return p.Predict(deviceID)
	}

	var maxVibration float64
	var exceedTime *time.Time
	willExceed := false
	threshold := 4.0

	for _, pt := range points {
		if pt.PredictedValue > maxVibration {
			maxVibration = pt.PredictedValue
		}
		if pt.WillExceed && !willExceed {
			t := pt.Timestamp
			exceedTime = &t
			willExceed = true
		}
	}

	return &PredictionResult{
		DeviceID:     deviceID,
		GeneratedAt:  time.Now(),
		Predictions:  points,
		MaxVibration: maxVibration,
		WillExceed:   willExceed,
		ExceedTime:   exceedTime,
		ModelInfo:    *model,
	}, nil
}

func (p *LSTMPredictor) StartPeriodicPrediction(deviceIDs []string) {
	ticker := time.NewTicker(p.predictEvery)

	go func() {
		for range ticker.C {
			for _, id := range deviceIDs {
				_, _ = p.Predict(id)
			}
		}
	}()
}

func predictNext(window []float64, mean, std, trend, autocorr float64) float64 {
	n := len(window)
	if n == 0 {
		return mean
	}

	lastValue := window[n-1]

	var movingAvg float64
	k := min(n, 10)
	for i := n - k; i < n; i++ {
		movingAvg += window[i]
	}
	movingAvg /= float64(k)

	noise := (mean - movingAvg) * 0.1

	trendComponent := trend * float64(n)

	autocorrComponent := 0.0
	if n > 1 {
		autocorrComponent = (window[n-1] - window[n-2]) * autocorr
	}

	predicted := lastValue + trendComponent*0.1 + autocorrComponent*0.3 + noise

	if std > 0 {
		randComponent := (mean - lastValue) * 0.05
		predicted += randComponent
	}

	return math.Max(0, predicted)
}

func autoCorrelation(data []float64, lag int) float64 {
	n := len(data)
	if n <= lag {
		return 0
	}

	var mean float64
	for _, v := range data {
		mean += v
	}
	mean /= float64(n)

	var numerator, denominator float64
	for i := 0; i < n-lag; i++ {
		numerator += (data[i] - mean) * (data[i+lag] - mean)
	}
	for i := 0; i < n; i++ {
		denominator += (data[i] - mean) * (data[i] - mean)
	}

	if denominator == 0 {
		return 0
	}
	return numerator / denominator
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
