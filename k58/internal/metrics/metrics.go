package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	generationDuration *prometheus.HistogramVec
	requestsTotal      *prometheus.CounterVec
	workerConflicts    prometheus.Counter
}

func NewMetrics() *Metrics {
	m := &Metrics{
		generationDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "id_generation_duration_seconds",
				Help:    "Duration of ID generation in seconds",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"mode"},
		),
		requestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "id_requests_total",
				Help: "Total number of ID requests",
			},
			[]string{"mode", "status"},
		),
		workerConflicts: prometheus.NewCounter(
			prometheus.CounterOpts{
				Name: "worker_conflicts_total",
				Help: "Total number of worker ID conflicts",
			},
		),
	}

	prometheus.MustRegister(m.generationDuration)
	prometheus.MustRegister(m.requestsTotal)
	prometheus.MustRegister(m.workerConflicts)

	return m
}

func (m *Metrics) ObserveDuration(mode string, duration time.Duration) {
	m.generationDuration.WithLabelValues(mode).Observe(duration.Seconds())
}

func (m *Metrics) IncRequests(mode string, success bool) {
	status := "success"
	if !success {
		status = "error"
	}
	m.requestsTotal.WithLabelValues(mode, status).Inc()
}

func (m *Metrics) IncWorkerConflicts() {
	m.workerConflicts.Inc()
}

func (m *Metrics) AddWorkerConflicts(count int64) {
	m.workerConflicts.Add(float64(count))
}

func (m *Metrics) Handler() http.Handler {
	return promhttp.Handler()
}

func StartMetricsServer(port int) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	server := &http.Server{
		Addr:    ":" + strconv.Itoa(port),
		Handler: mux,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			panic(err)
		}
	}()

	return server
}
