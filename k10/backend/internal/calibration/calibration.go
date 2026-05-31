package calibration

import (
	"fmt"
	"math"

	"digitaltwin/internal/models"
)

func Calibrate(deviceID string, measured, design []models.Vector3) (*models.CalibrationReport, error) {
	if len(measured) != len(design) {
		return nil, fmt.Errorf("measured and design point counts do not match: %d vs %d", len(measured), len(design))
	}

	if len(measured) < 3 {
		return nil, fmt.Errorf("at least 3 calibration points required, got %d", len(measured))
	}

	var points []models.CalibrationPoint
	var totalOffset models.Vector3
	var maxOffset float64
	var sumSquaredError float64

	for i := 0; i < len(measured); i++ {
		offset := models.Vector3{
			X: measured[i].X - design[i].X,
			Y: measured[i].Y - design[i].Y,
			Z: measured[i].Z - design[i].Z,
		}

		dist := math.Sqrt(offset.X*offset.X + offset.Y*offset.Y + offset.Z*offset.Z)

		if dist > maxOffset {
			maxOffset = dist
		}
		sumSquaredError += dist * dist

		totalOffset.X += offset.X
		totalOffset.Y += offset.Y
		totalOffset.Z += offset.Z

		points = append(points, models.CalibrationPoint{
			DeviceID:    deviceID,
			PointIndex:  i,
			MeasuredPos: measured[i],
			DesignPos:   design[i],
			Offset:      offset,
		})
	}

	n := float64(len(measured))
	avgOffset := models.Vector3{
		X: totalOffset.X / n,
		Y: totalOffset.Y / n,
		Z: totalOffset.Z / n,
	}

	rmse := math.Sqrt(sumSquaredError / n)

	status := "passed"
	if maxOffset > 0.05 {
		status = "warning"
	}
	if maxOffset > 0.1 {
		status = "failed"
	}

	report := &models.CalibrationReport{
		DeviceID:      deviceID,
		Points:        points,
		AverageOffset: avgOffset,
		MaxOffset:     maxOffset,
		RMSE:          rmse,
		Status:        status,
	}

	return report, nil
}

func ComputeTransformMatrix(measured, design []models.Vector3) ([][]float64, error) {
	if len(measured) != len(design) {
		return nil, fmt.Errorf("point count mismatch")
	}

	n := len(measured)
	A := make([][]float64, n*3)
	B := make([]float64, n*3)

	for i := 0; i < n; i++ {
		A[i*3] = []float64{measured[i].X, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0}
		A[i*3+1] = []float64{0, measured[i].Y, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0}
		A[i*3+2] = []float64{0, 0, measured[i].Z, 0, 0, 1, 0, 0, 0, 0, 0, 0}

		B[i*3] = design[i].X
		B[i*3+1] = design[i].Y
		B[i*3+2] = design[i].Z
	}

	x := leastSquares(A, B)

	transform := make([][]float64, 4)
	for i := range transform {
		transform[i] = make([]float64, 4)
	}
	transform[0][0] = x[0]
	transform[1][1] = x[1]
	transform[2][2] = x[2]
	transform[0][3] = x[3]
	transform[1][3] = x[4]
	transform[2][3] = x[5]
	transform[3][3] = 1.0

	return transform, nil
}

func leastSquares(A [][]float64, B []float64) []float64 {
	m := len(A)
	n := len(A[0])

	AtA := make([][]float64, n)
	for i := range AtA {
		AtA[i] = make([]float64, n)
	}
	for i := 0; i < m; i++ {
		for j := 0; j < n; j++ {
			for k := 0; k < n; k++ {
				AtA[j][k] += A[i][j] * A[i][k]
			}
		}
	}

	AtB := make([]float64, n)
	for i := 0; i < m; i++ {
		for j := 0; j < n; j++ {
			AtB[j] += A[i][j] * B[i]
		}
	}

	return gaussianElimination(AtA, AtB)
}

func gaussianElimination(A [][]float64, B []float64) []float64 {
	n := len(A)

	for col := 0; col < n; col++ {
		maxRow := col
		for row := col + 1; row < n; row++ {
			if math.Abs(A[row][col]) > math.Abs(A[maxRow][col]) {
				maxRow = row
			}
		}
		A[col], A[maxRow] = A[maxRow], A[col]
		B[col], B[maxRow] = B[maxRow], B[col]

		for row := col + 1; row < n; row++ {
			factor := A[row][col] / A[col][col]
			for j := col; j < n; j++ {
				A[row][j] -= factor * A[col][j]
			}
			B[row] -= factor * B[col]
		}
	}

	x := make([]float64, n)
	for i := n - 1; i >= 0; i-- {
		x[i] = B[i]
		for j := i + 1; j < n; j++ {
			x[i] -= A[i][j] * x[j]
		}
		x[i] /= A[i][i]
	}
	return x
}
