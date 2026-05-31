package anomaly

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"digitaltwin/internal/models"
)

type IsolationTree struct {
	LeftChild    *IsolationTree
	RightChild   *IsolationTree
	SplitAttr    int
	SplitValue   float64
	Size         int
	Depth        int
	IsLeaf       bool
}

type IsolationForest struct {
	trees          []*IsolationTree
	contamination  float64
	nTrees         int
	sampleSize     int
	maxDepth       int
	nFeatures      int
	mu             sync.RWMutex
	trained        bool
	threshold      float64
}

type FeatureVector struct {
	Vibration    float64
	Current      float64
	Temperature  float64
	VelocityMag  float64
	PositionX    float64
	PositionY    float64
	PositionZ    float64
}

func NewIsolationForest(nTrees, sampleSize int, contamination float64) *IsolationForest {
	return &IsolationForest{
		trees:         make([]*IsolationTree, nTrees),
		contamination: contamination,
		nTrees:        nTrees,
		sampleSize:    sampleSize,
		nFeatures:     7,
	}
}

func (f *IsolationForest) Train(data []FeatureVector) error {
	if len(data) < 2 {
		return fmt.Errorf("insufficient training data: %d samples", len(data))
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	f.maxDepth = int(math.Ceil(math.Log2(float64(min(len(data), f.sampleSize)))))

	for i := 0; i < f.nTrees; i++ {
		sample := f.subsample(data)
		f.trees[i] = f.buildTree(sample, 0)
	}

	scores := make([]float64, len(data))
	for i, v := range data {
		scores[i] = f.computeScore(v)
	}

	sorted := make([]float64, len(scores))
	copy(sorted, scores)
	sort.Float64s(sorted)

	idx := int(float64(len(sorted)) * (1 - f.contamination))
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	f.threshold = sorted[idx]

	f.trained = true
	return nil
}

func (f *IsolationForest) Predict(v FeatureVector) (bool, float64) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	if !f.trained {
		return false, 0
	}

	score := f.computeScore(v)
	isAnomaly := score > f.threshold

	return isAnomaly, score
}

func (f *IsolationForest) IsTrained() bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.trained
}

func (f *IsolationForest) Threshold() float64 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.threshold
}

func (f *IsolationForest) subsample(data []FeatureVector) []FeatureVector {
	n := min(len(data), f.sampleSize)
	sample := make([]FeatureVector, n)
	indices := rand.Perm(len(data))[:n]
	for i, idx := range indices {
		sample[i] = data[idx]
	}
	return sample
}

func (f *IsolationForest) buildTree(data []FeatureVector, depth int) *IsolationTree {
	tree := &IsolationTree{
		Depth: depth,
		Size:  len(data),
	}

	if depth >= f.maxDepth || len(data) <= 1 {
		tree.IsLeaf = true
		return tree
	}

	attr := rand.Intn(f.nFeatures)
	minVal, maxVal := f.getRange(data, attr)

	if minVal == maxVal {
		tree.IsLeaf = true
		return tree
	}

	tree.SplitAttr = attr
	tree.SplitValue = minVal + rand.Float64()*(maxVal-minVal)

	var leftData, rightData []FeatureVector
	for _, v := range data {
		val := f.getFeatureValue(v, attr)
		if val < tree.SplitValue {
			leftData = append(leftData, v)
		} else {
			rightData = append(rightData, v)
		}
	}

	tree.LeftChild = f.buildTree(leftData, depth+1)
	tree.RightChild = f.buildTree(rightData, depth+1)

	return tree
}

func (f *IsolationForest) getRange(data []FeatureVector, attr int) (float64, float64) {
	minVal := math.MaxFloat64
	maxVal := -math.MaxFloat64

	for _, v := range data {
		val := f.getFeatureValue(v, attr)
		if val < minVal {
			minVal = val
		}
		if val > maxVal {
			maxVal = val
		}
	}

	return minVal, maxVal
}

func (f *IsolationForest) getFeatureValue(v FeatureVector, attr int) float64 {
	switch attr {
	case 0:
		return v.Vibration
	case 1:
		return v.Current
	case 2:
		return v.Temperature
	case 3:
		return v.VelocityMag
	case 4:
		return v.PositionX
	case 5:
		return v.PositionY
	case 6:
		return v.PositionZ
	default:
		return 0
	}
}

func (f *IsolationForest) computeScore(v FeatureVector) float64 {
	var avgPathLen float64
	for _, tree := range f.trees {
		avgPathLen += float64(f.pathLength(v, tree, 0))
	}
	avgPathLen /= float64(f.nTrees)

	c := avgPathLen
	if f.sampleSize > 1 {
		c = 2 * (math.Log(float64(f.sampleSize-1)) + 0.5772)
		c -= 2 * float64(f.sampleSize-1) / float64(f.sampleSize)
	}

	return math.Pow(2, -avgPathLen/c)
}

func (f *IsolationForest) pathLength(v FeatureVector, tree *IsolationTree, currentDepth int) int {
	if tree == nil || tree.IsLeaf {
		return currentDepth
	}

	val := f.getFeatureValue(v, tree.SplitAttr)
	if val < tree.SplitValue {
		return f.pathLength(v, tree.LeftChild, currentDepth+1)
	}
	return f.pathLength(v, tree.RightChild, currentDepth+1)
}

func TelemetryToFeatureVector(tel models.DeviceTelemetry) FeatureVector {
	return FeatureVector{
		Vibration:   tel.Vibration,
		Current:     tel.Current,
		Temperature: tel.Temperature,
		VelocityMag: tel.VelocityMag,
		PositionX:   tel.Position.X,
		PositionY:   tel.Position.Y,
		PositionZ:   tel.Position.Z,
	}
}

type Detector struct {
	forests map[string]*IsolationForest
	mu      sync.RWMutex
}

func NewDetector() *Detector {
	return &Detector{
		forests: make(map[string]*IsolationForest),
	}
}

func (d *Detector) GetOrCreateForest(deviceID string) *IsolationForest {
	d.mu.Lock()
	defer d.mu.Unlock()

	if forest, ok := d.forests[deviceID]; ok {
		return forest
	}

	forest := NewIsolationForest(100, 256, 0.05)
	d.forests[deviceID] = forest
	return forest
}

func (d *Detector) Detect(deviceID string, tel models.DeviceTelemetry) (bool, float64, string) {
	forest := d.GetOrCreateForest(deviceID)

	if !forest.IsTrained() {
		return false, 0, ""
	}

	v := TelemetryToFeatureVector(tel)
	isAnomaly, score := forest.Predict(v)

	anomalyType := ""
	if isAnomaly {
		anomalyType = classifyAnomaly(tel)
	}

	return isAnomaly, score, anomalyType
}

func classifyAnomaly(tel models.DeviceTelemetry) string {
	if tel.Vibration > 5.0 {
		return "vibration_exceeded"
	}
	if tel.Current > 20 {
		return "current_surge"
	}
	if tel.Temperature > 80 {
		return "overheat"
	}
	if tel.VelocityMag > 3.0 {
		return "velocity_spike"
	}
	return "unknown"
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
