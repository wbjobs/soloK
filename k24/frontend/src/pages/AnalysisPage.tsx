import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { Analyze as AnalyzeIcon } from '@mui/icons-material';
import SpectrumChart from '../components/SpectrumChart';
import Heatmap from '../components/Heatmap';
import { useStore } from '../store/useStore';
import {
  getMeanSpectrum,
  classifySpectrum,
  analyzeGradCAM,
  getRgbPreview,
} from '../services/api';

const AnalysisPage: React.FC = () => {
  const currentHypercube = useStore((state) => state.currentHypercube);
  const [meanSpectrum, setMeanSpectrum] = useState<number[] | null>(null);
  const [stdSpectrum, setStdSpectrum] = useState<number[] | null>(null);
  const [wavelengths, setWavelengths] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [gradcamResult, setGradcamResult] = useState<any>(null);
  const [rgbPreview, setRgbPreview] = useState<string | null>(null);

  useEffect(() => {
    if (currentHypercube) {
      loadSpectrumData();
      loadRgbPreview();
    }
  }, [currentHypercube]);

  const loadSpectrumData = async () => {
    if (!currentHypercube) return;
    
    setLoading(true);
    try {
      const result = await getMeanSpectrum(currentHypercube.fileId);
      setMeanSpectrum(result.mean_spectrum);
      setStdSpectrum(result.std_spectrum);
      setWavelengths(result.wavelengths);
    } catch (err) {
      console.error('Failed to load spectrum data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRgbPreview = async () => {
    if (!currentHypercube) return;
    
    try {
      const result = await getRgbPreview(currentHypercube.fileId);
      setRgbPreview(result.rgb_preview);
    } catch (err) {
      console.error('Failed to load RGB preview:', err);
    }
  };

  const handleClassify = async () => {
    if (!meanSpectrum) return;
    
    setLoading(true);
    try {
      const result = await classifySpectrum(meanSpectrum, wavelengths);
      setClassificationResult(result.results[0]);
    } catch (err) {
      console.error('Classification failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGradCAM = async () => {
    if (!meanSpectrum) return;
    
    setLoading(true);
    try {
      const result = await analyzeGradCAM(meanSpectrum, wavelengths);
      setGradcamResult(result);
    } catch (err) {
      console.error('Grad-CAM analysis failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!currentHypercube) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          光谱分析
        </Typography>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="textSecondary">
            请先在「数据上传」页面上传高光谱数据
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        光谱分析
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>选择数据</InputLabel>
                  <Select
                    value={currentHypercube.fileId}
                    label="选择数据"
                    disabled
                  >
                    <MenuItem value={currentHypercube.fileId}>
                      {currentHypercube.filename}
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleClassify}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <AnalyzeIcon />}
                >
                  病害分类
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleGradCAM}
                  disabled={loading}
                >
                  Grad-CAM 可解释性分析
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {rgbPreview && (
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  RGB 预览
                </Typography>
                <img
                  src={rgbPreview}
                  alt="RGB Preview"
                  style={{ width: '100%', borderRadius: 4 }}
                />
              </CardContent>
            </Card>
          </Grid>
        )}

        {meanSpectrum && (
          <Grid item xs={12} md={rgbPreview ? 8 : 12}>
            <Paper sx={{ p: 2 }}>
              <SpectrumChart
                wavelengths={wavelengths}
                spectra={[
                  {
                    name: '平均光谱',
                    values: meanSpectrum,
                    color: '#008080',
                    std: stdSpectrum || undefined,
                  },
                ]}
                title="区域平均光谱曲线"
                highlightRegions={[
                  { start: 400, end: 500, color: 'blue' },
                  { start: 600, end: 700, color: 'red' },
                  { start: 750, end: 900, color: 'green' },
                ]}
              />
            </Paper>
          </Grid>
        )}

        {classificationResult && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  分类结果
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>病害类型</TableCell>
                        <TableCell>置信度</TableCell>
                        <TableCell>严重程度</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <strong>{classificationResult.class_name}</strong>
                        </TableCell>
                        <TableCell>
                          {(classificationResult.confidence * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          {classificationResult.severity} 级
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                <Typography variant="subtitle2" sx={{ mt: 2 }}>
                  各类别概率分布:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                  {classificationResult.probabilities.map((prob: number, idx: number) => (
                    <Box
                      key={idx}
                      sx={{
                        px: 2,
                        py: 1,
                        bgcolor: idx === classificationResult.class_id ? 'primary.light' : 'grey.200',
                        borderRadius: 1,
                        fontSize: '0.875rem',
                      }}
                    >
                      类别{idx}: {(prob * 100).toFixed(1)}%
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {gradcamResult && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Grad-CAM 波段贡献分析
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  对分类结果 {gradcamResult.class_name} 贡献最大的波段
                </Typography>
                
                <SpectrumChart
                  wavelengths={wavelengths}
                  spectra={[
                    {
                      name: '原始光谱',
                      values: meanSpectrum || [],
                      color: '#008080',
                    },
                    {
                      name: '波段重要性',
                      values: gradcamResult.cam_upsampled.map((v: number) => v * Math.max(...(meanSpectrum || [1]))),
                      color: '#ff4444',
                    },
                  ]}
                  title=""
                  showLegend={true}
                />

                <TableContainer sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>排名</TableCell>
                        <TableCell>波长 (nm)</TableCell>
                        <TableCell>贡献度</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {gradcamResult.top_bands.slice(0, 5).map((band: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{band.wavelength.toFixed(1)}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: `${band.importance * 100}%`,
                                  minWidth: 20,
                                  height: 8,
                                  bgcolor: 'primary.main',
                                  borderRadius: 1,
                                }}
                              />
                              {(band.importance * 100).toFixed(1)}%
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default AnalysisPage;
