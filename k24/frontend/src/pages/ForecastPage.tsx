import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Alert,
  Chip,
  Divider,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Cloud as CloudIcon,
  Grass as GrassIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Timeline as TimelineIcon,
  Navigation as NavigationIcon,
} from '@mui/icons-material';
import Plot from 'react-plotly.js';
import { api } from '../services/api';

const ForecastPage: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [forecastResult, setForecastResult] = useState<any>(null);
  const [weatherResult, setWeatherResult] = useState<any>(null);
  const [soilResult, setSoilResult] = useState<any>(null);
  const [integratedResult, setIntegratedResult] = useState<any>(null);

  const [weatherData, setWeatherData] = useState({
    temperature: 22,
    humidity: 75,
    rainfall: 5,
    diseaseType: '',
  });

  const [soilData, setSoilData] = useState({
    ph: 6.8,
    organicMatter: 0.035,
    nitrogen: 120,
    phosphorus: 60,
    potassium: 180,
    fieldHistory: 'normal',
  });

  const [spectralData, setSpectralData] = useState({
    stage1: Array(150).fill(0.5),
    stage2: Array(150).fill(0.5),
    stage3: Array(150).fill(0.5),
    stage4: Array(150).fill(0.5),
  });

  const steps = ['时序光谱输入', '气象数据', '土壤数据', '综合风险评估'];

  const generateDemoSpectralData = () => {
    const generateSpectrum = (base: number, noise: number) => {
      return Array.from({ length: 150 }, (_, i) => {
        const wavelength = 400 + i * 4;
        let value = base;
        if (wavelength > 680 && wavelength < 750) {
          value += 0.3 * Math.sin((wavelength - 680) * 0.05);
        }
        value += (Math.random() - 0.5) * noise;
        return Math.max(0.1, Math.min(0.9, value));
      });
    };

    setSpectralData({
      stage1: generateSpectrum(0.5, 0.05),
      stage2: generateSpectrum(0.52, 0.05),
      stage3: generateSpectrum(0.48, 0.08),
      stage4: generateSpectrum(0.45, 0.1),
    });
  };

  const runTemporalForecast = async () => {
    setLoading(true);
    try {
      const response = await api.post('/forecast/temporal', {
        temporal_spectra: [
          spectralData.stage1,
          spectralData.stage2,
          spectralData.stage3,
          spectralData.stage4,
        ],
        growth_stages: ['分蘖期', '拔节期', '抽穗期', '灌浆期'],
      });
      setForecastResult(response.data);
    } catch (err) {
      console.error('Temporal forecast error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runWeatherAnalysis = async () => {
    setLoading(true);
    try {
      const response = await api.post('/analyze/weather', {
        temperature: weatherData.temperature,
        humidity: weatherData.humidity,
        rainfall: weatherData.rainfall,
        disease_type: weatherData.diseaseType || undefined,
      });
      setWeatherResult(response.data);
    } catch (err) {
      console.error('Weather analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runSoilAnalysis = async () => {
    setLoading(true);
    try {
      const response = await api.post('/analyze/soil', {
        ph: soilData.ph,
        organic_matter: soilData.organicMatter,
        nitrogen: soilData.nitrogen,
        phosphorus: soilData.phosphorus,
        potassium: soilData.potassium,
        field_history: soilData.fieldHistory,
      });
      setSoilResult(response.data);
    } catch (err) {
      console.error('Soil analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runIntegratedAssessment = async () => {
    setLoading(true);
    try {
      const spectralPred = forecastResult || {
        max_outbreak_prob: 0.6,
        outbreak_probabilities: Array(14).fill(0.5),
      };

      const response = await api.post('/analyze/integrated-risk', {
        spectral_prediction: spectralPred,
        weather_data: {
          temperature: weatherData.temperature,
          humidity: weatherData.humidity,
          rainfall: weatherData.rainfall,
        },
        soil_data: {
          ph: soilData.ph,
          organic_matter: soilData.organicMatter,
          nitrogen: soilData.nitrogen,
          phosphorus: soilData.phosphorus,
          potassium: soilData.potassium,
        },
      });
      setIntegratedResult(response.data);
    } catch (err) {
      console.error('Integrated assessment error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (activeStep === 0) {
      await runTemporalForecast();
    } else if (activeStep === 1) {
      await runWeatherAnalysis();
    } else if (activeStep === 2) {
      await runSoilAnalysis();
    } else if (activeStep === 3) {
      await runIntegratedAssessment();
    }
    setActiveStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return '#f44336';
      case 'medium': return '#ff9800';
      case 'low': return '#4caf50';
      default: return '#9e9e9e';
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        病害预测与风险评估
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {activeStep === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                <TimelineIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                时序光谱数据
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                输入4个关键生长期的平均光谱数据
              </Typography>
              
              <Button
                variant="outlined"
                onClick={generateDemoSpectralData}
                sx={{ mb: 2 }}
              >
                生成演示数据
              </Button>

              <Plot
                data={[
                  {
                    x: Array.from({ length: 150 }, (_, i) => 400 + i * 4),
                    y: spectralData.stage1,
                    type: 'scatter',
                    mode: 'lines',
                    name: '分蘖期',
                    line: { color: '#4caf50' },
                  },
                  {
                    x: Array.from({ length: 150 }, (_, i) => 400 + i * 4),
                    y: spectralData.stage2,
                    type: 'scatter',
                    mode: 'lines',
                    name: '拔节期',
                    line: { color: '#2196f3' },
                  },
                  {
                    x: Array.from({ length: 150 }, (_, i) => 400 + i * 4),
                    y: spectralData.stage3,
                    type: 'scatter',
                    mode: 'lines',
                    name: '抽穗期',
                    line: { color: '#ff9800' },
                  },
                  {
                    x: Array.from({ length: 150 }, (_, i) => 400 + i * 4),
                    y: spectralData.stage4,
                    type: 'scatter',
                    mode: 'lines',
                    name: '灌浆期',
                    line: { color: '#f44336' },
                  },
                ]}
                layout={{
                  title: '生长期光谱变化曲线',
                  xaxis: { title: '波长 (nm)' },
                  yaxis: { title: '反射率' },
                  height: 350,
                  margin: { l: 50, r: 20, t: 50, b: 50 },
                }}
              />
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            {forecastResult && (
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  LSTM时序预测结果
                </Typography>

                <Alert severity="info" sx={{ mb: 2 }}>
                  未来14天病害暴发概率: <b>{(forecastResult.max_outbreak_prob * 100).toFixed(1)}%</b>
                </Alert>

                <Plot
                  data={[
                    {
                      x: Array.from({ length: 14 }, (_, i) => i + 1),
                      y: forecastResult.outbreak_probabilities,
                      type: 'scatter',
                      mode: 'lines+markers',
                      name: '暴发概率',
                      fill: 'tozeroy',
                      line: { color: '#f44336' },
                    },
                  ]}
                  layout={{
                    title: '未来14天病害暴发概率预测',
                    xaxis: { title: '天数' },
                    yaxis: { title: '概率', range: [0, 1] },
                    height: 250,
                    shapes: [
                      {
                        type: 'line',
                        x0: 0,
                        y0: 0.5,
                        x1: 15,
                        y1: 0.5,
                        line: { color: '#ff9800', dash: 'dash' },
                      },
                    ],
                  }}
                />

                <Typography variant="subtitle2" sx={{ mt: 2 }}>
                  预测扩散方向:
                </Typography>
                <Typography variant="body2">
                  {forecastResult.spread_direction.angle_degrees.toFixed(1)}°
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {activeStep === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                <CloudIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                气象数据输入
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>温度 (°C): {weatherData.temperature}</Typography>
                <Slider
                  value={weatherData.temperature}
                  onChange={(_, val) => setWeatherData({ ...weatherData, temperature: val as number })}
                  min={0}
                  max={40}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>湿度 (%): {weatherData.humidity}</Typography>
                <Slider
                  value={weatherData.humidity}
                  onChange={(_, val) => setWeatherData({ ...weatherData, humidity: val as number })}
                  min={0}
                  max={100}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>降雨量 (mm): {weatherData.rainfall}</Typography>
                <Slider
                  value={weatherData.rainfall}
                  onChange={(_, val) => setWeatherData({ ...weatherData, rainfall: val as number })}
                  min={0}
                  max={30}
                />
              </Box>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>目标病害类型</InputLabel>
                <Select
                  value={weatherData.diseaseType}
                  onChange={(e) => setWeatherData({ ...weatherData, diseaseType: e.target.value })}
                  label="目标病害类型"
                >
                  <MenuItem value="">通用评估</MenuItem>
                  <MenuItem value="条锈病">条锈病</MenuItem>
                  <MenuItem value="叶锈病">叶锈病</MenuItem>
                  <MenuItem value="白粉病">白粉病</MenuItem>
                  <MenuItem value="赤霉病">赤霉病</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            {weatherResult && (
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  气象风险分析结果
                </Typography>

                {typeof weatherResult.current_risk === 'object' ? (
                  <>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      综合气象风险: <b>{(weatherResult.current_risk.overall_risk * 100).toFixed(1)}%</b>
                    </Alert>

                    <Typography variant="subtitle2" gutterBottom>
                      各病害风险:
                    </Typography>
                    {Object.entries(weatherResult.current_risk.disease_risks || {}).map(([disease, risk]: [string, any]) => (
                      <Box key={disease} sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{disease}</span>
                          <span>{(risk * 100).toFixed(1)}%</span>
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={risk * 100}
                          sx={{ height: 8, borderRadius: 4 }}
                        />
                      </Box>
                    ))}
                  </>
                ) : (
                  <Alert severity="info">
                    当前病害类型风险: {(weatherResult.current_risk * 100).toFixed(1)}%
                  </Alert>
                )}
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {activeStep === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                <GrassIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                土壤数据输入
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>pH值: {soilData.ph.toFixed(1)}</Typography>
                <Slider
                  value={soilData.ph}
                  onChange={(_, val) => setSoilData({ ...soilData, ph: val as number })}
                  min={4}
                  max={9}
                  step={0.1}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>有机质含量: {(soilData.organicMatter * 100).toFixed(1)}%</Typography>
                <Slider
                  value={soilData.organicMatter}
                  onChange={(_, val) => setSoilData({ ...soilData, organicMatter: val as number })}
                  min={0.01}
                  max={0.1}
                  step={0.005}
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <TextField
                    label="氮 (mg/kg)"
                    type="number"
                    value={soilData.nitrogen}
                    onChange={(e) => setSoilData({ ...soilData, nitrogen: Number(e.target.value) })}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="磷 (mg/kg)"
                    type="number"
                    value={soilData.phosphorus}
                    onChange={(e) => setSoilData({ ...soilData, phosphorus: Number(e.target.value) })}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="钾 (mg/kg)"
                    type="number"
                    value={soilData.potassium}
                    onChange={(e) => setSoilData({ ...soilData, potassium: Number(e.target.value) })}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>

              <FormControl fullWidth sx={{ mt: 3, mb: 2 }}>
                <InputLabel>田块历史</InputLabel>
                <Select
                  value={soilData.fieldHistory}
                  onChange={(e) => setSoilData({ ...soilData, fieldHistory: e.target.value })}
                  label="田块历史"
                >
                  <MenuItem value="normal">常规种植</MenuItem>
                  <MenuItem value="continuous_disease">连年发病</MenuItem>
                  <MenuItem value="rotation">轮作</MenuItem>
                  <MenuItem value="fallow">休耕</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            {soilResult && (
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  土壤易感性分析结果
                </Typography>

                <Alert 
                  severity={soilResult.risk_level === 'high' ? 'error' : soilResult.risk_level === 'medium' ? 'warning' : 'success'}
                  sx={{ mb: 2 }}
                >
                  土壤病害易感性: <b>{(soilResult.adjusted_susceptibility * 100).toFixed(1)}%</b>
                  <Chip 
                    label={soilResult.risk_level.toUpperCase()} 
                    size="small" 
                    sx={{ ml: 1, bgcolor: getRiskColor(soilResult.risk_level), color: 'white' }}
                  />
                </Alert>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <Typography variant="body2">pH适宜性: {(soilResult.ph_score * 100).toFixed(0)}%</Typography>
                    <LinearProgress variant="determinate" value={soilResult.ph_score * 100} />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">有机质风险: {(soilResult.organic_matter_risk * 100).toFixed(0)}%</Typography>
                    <LinearProgress variant="determinate" value={soilResult.organic_matter_risk * 100} color="error" />
                  </Grid>
                </Grid>

                <Typography variant="subtitle2" gutterBottom>
                  管理建议:
                </Typography>
                <List dense>
                  {soilResult.recommendations?.map((rec: string, idx: number) => (
                    <ListItem key={idx}>
                      <ListItemIcon>
                        <CheckCircleIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={rec} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {activeStep >= 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                <WarningIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#f44336' }} />
                综合风险评估
              </Typography>

              {integratedResult ? (
                <>
                  <Card sx={{ mb: 3, bgcolor: getRiskColor(integratedResult.risk_level) + '20' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="h4" sx={{ color: getRiskColor(integratedResult.risk_level) }}>
                            {(integratedResult.fused_risk_score * 100).toFixed(1)}%
                          </Typography>
                          <Typography variant="subtitle1">综合发病风险</Typography>
                        </Box>
                        <Chip 
                          label={integratedResult.risk_level.toUpperCase()}
                          sx={{ 
                            bgcolor: getRiskColor(integratedResult.risk_level), 
                            color: 'white',
                            fontSize: '1.2rem',
                            px: 2,
                            py: 1
                          }}
                        />
                      </Box>
                    </CardContent>
                  </Card>

                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">光谱风险</Typography>
                        <Typography variant="h6">
                          {(integratedResult.component_risks.spectral_risk * 100).toFixed(0)}%
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">气象风险</Typography>
                        <Typography variant="h6">
                          {(integratedResult.component_risks.weather_risk * 100).toFixed(0)}%
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">土壤风险</Typography>
                        <Typography variant="h6">
                          {(integratedResult.component_risks.soil_risk * 100).toFixed(0)}%
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">
                      行动优先级: {integratedResult.action_priority}
                    </Typography>
                  </Alert>

                  {integratedResult.prevention_timing && (
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        关键防治窗口期
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Typography variant="body2">
                            开始: 第 {integratedResult.prevention_timing.critical_window_start} 天
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2">
                            最佳施药: 第 {integratedResult.prevention_timing.optimal_application_day} 天
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>
                  )}
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <CircularProgress />
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                管理建议
              </Typography>

              {integratedResult?.management_recommendations?.map((rec: any, idx: number) => (
                <Card key={idx} sx={{ mb: 2 }}>
                  <CardContent sx={{ py: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Chip 
                        label={rec.type}
                        size="small"
                        color={rec.priority === 1 ? 'error' : rec.priority === 2 ? 'primary' : 'default'}
                        sx={{ mr: 1 }}
                      />
                      <Chip 
                        label={`P${rec.priority}`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                    <Typography variant="subtitle2">{rec.action}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      {rec.details}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      时间: {rec.timing}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                <NavigationIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                GNN病害传播网络分析
              </Typography>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                图神经网络(GNN)分析多个田块间的病害传播风险，考虑距离、风向、作物抗性等因素
              </Alert>

              <Button 
                variant="contained" 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const demoFields = [
                      { name: '田块A', disease_severity: 3.5, ndvi: 0.6, weather: { temperature: 22, humidity: 75 } },
                      { name: '田块B', disease_severity: 1.0, ndvi: 0.8, weather: { temperature: 23, humidity: 70 } },
                      { name: '田块C', disease_severity: 2.0, ndvi: 0.7, weather: { temperature: 21, humidity: 80 } },
                      { name: '田块D', disease_severity: 0.5, ndvi: 0.85, weather: { temperature: 20, humidity: 65 } },
                    ];
                    
                    const response = await api.post('/analyze/transmission', {
                      fields: demoFields,
                      wind_direction: 45,
                      wind_speed: 8,
                    });
                    
                    console.log('Transmission analysis:', response.data);
                    alert(`检测到 ${response.data.high_risk_fields?.length || 0} 个高风险田块，${response.data.transmission_paths?.length || 0} 条传播路径`);
                  } catch (err) {
                    console.error('Transmission error:', err);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                运行田块传播网络分析
              </Button>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          上一步
        </Button>
        
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={loading || activeStep > 3}
        >
          {loading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
          {activeStep >= 3 ? '完成' : activeStep === 3 ? '综合评估' : '下一步分析'}
        </Button>
      </Box>
    </Box>
  );
};

export default ForecastPage;
