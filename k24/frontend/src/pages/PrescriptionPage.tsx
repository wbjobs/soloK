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
  TextField,
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
  Slider,
  Chip,
} from '@mui/material';
import {
  Agriculture as AgricultureIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import Heatmap from '../components/Heatmap';
import { useStore } from '../store/useStore';
import { getDiseaseDistribution, generatePrescription } from '../services/api';

const PrescriptionPage: React.FC = () => {
  const currentHypercube = useStore((state) => state.currentHypercube);
  const [loading, setLoading] = useState(false);
  const [distribution, setDistribution] = useState<any>(null);
  const [baseRate, setBaseRate] = useState(100);
  const [fertilizerTypes, setFertilizerTypes] = useState<string[]>(['氮肥', '磷肥', '钾肥']);
  const [prescriptionResult, setPrescriptionResult] = useState<any>(null);
  const [selectedFertilizer, setSelectedFertilizer] = useState('氮肥');

  useEffect(() => {
    if (currentHypercube) {
      loadDiseaseDistribution();
    }
  }, [currentHypercube]);

  const loadDiseaseDistribution = async () => {
    if (!currentHypercube) return;

    setLoading(true);
    try {
      const result = await getDiseaseDistribution(currentHypercube.fileId);
      setDistribution(result);
    } catch (err) {
      console.error('Failed to load disease distribution:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePrescription = async () => {
    if (!distribution?.heatmap) {
      alert('请先加载病害分布数据');
      return;
    }

    setLoading(true);
    try {
      const result = await generatePrescription(
        currentHypercube!.fileId,
        distribution.heatmap,
        fertilizerTypes,
        baseRate
      );
      setPrescriptionResult(result);
    } catch (err) {
      console.error('Failed to generate prescription:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPrescriptionData = () => {
    if (!prescriptionResult?.prescription_map) return [];
    return prescriptionResult.prescription_map.map((row: any[]) =>
      row.map((cell) => cell[selectedFertilizer] || 0)
    );
  };

  const handleExport = () => {
    if (!prescriptionResult) return;

    const content = JSON.stringify(prescriptionResult, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prescription_${currentHypercube?.fileId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentHypercube) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          变量施肥处方图
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
        变量施肥处方图
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              处方参数设置
            </Typography>

            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={4}>
                <Typography gutterBottom>
                  基础施肥量: {baseRate} kg/ha
                </Typography>
                <Slider
                  value={baseRate}
                  onChange={(_, val) => setBaseRate(val as number)}
                  min={50}
                  max={200}
                  marks
                  valueLabelDisplay="auto"
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>显示肥料类型</InputLabel>
                  <Select
                    value={selectedFertilizer}
                    label="显示肥料类型"
                    onChange={(e) => setSelectedFertilizer(e.target.value)}
                  >
                    {fertilizerTypes.map((fert) => (
                      <MenuItem key={fert} value={fert}>
                        {fert}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleGeneratePrescription}
                    disabled={loading || !distribution?.heatmap}
                    startIcon={loading ? <CircularProgress size={20} /> : <AgricultureIcon />}
                  >
                    {loading ? '生成中...' : '生成处方图'}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleExport}
                    disabled={!prescriptionResult}
                    startIcon={<DownloadIcon />}
                  >
                    导出处方
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {loading ? (
          <Grid item xs={12} sx={{ textAlign: 'center', py: 8 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>加载中...</Typography>
          </Grid>
        ) : (
          <>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  病害严重程度
                </Typography>
                {distribution?.heatmap && (
                  <Heatmap
                    data={distribution.heatmap}
                    title=""
                    colormap="red"
                    minValue={1}
                    maxValue={5}
                  />
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {selectedFertilizer} 处方图 (kg/ha)
                </Typography>
                {prescriptionResult?.prescription_map && (
                  <Heatmap
                    data={getPrescriptionData()}
                    title=""
                    colormap="plasma"
                  />
                )}
              </Paper>
            </Grid>

            {prescriptionResult && (
              <>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        肥料用量统计
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>肥料类型</TableCell>
                              <TableCell align="right">总用量 (kg)</TableCell>
                              <TableCell align="right">平均用量 (kg/ha)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {Object.entries(prescriptionResult.total_fertilizer || {}).map(
                              ([name, total]: [string, any]) => (
                                <TableRow key={name}>
                                  <TableCell>{name}</TableCell>
                                  <TableCell align="right">{total.toFixed(1)}</TableCell>
                                  <TableCell align="right">
                                    {(
                                      total /
                                      (prescriptionResult.prescription_map.length *
                                        prescriptionResult.prescription_map[0].length)
                                    ).toFixed(1)}
                                  </TableCell>
                                </TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        施肥建议
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {prescriptionResult.recommendations?.map((rec: string, idx: number) => (
                          <Chip
                            key={idx}
                            label={rec}
                            variant="outlined"
                            sx={{ justifyContent: 'flex-start' }}
                          />
                        ))}
                      </Box>

                      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                        分级施肥策略:
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>严重程度</TableCell>
                              <TableCell>施肥比例</TableCell>
                              <TableCell>说明</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            <TableRow>
                              <TableCell>1 级 (健康)</TableCell>
                              <TableCell>100%</TableCell>
                              <TableCell>标准施肥量</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>2 级 (轻度)</TableCell>
                              <TableCell>115-130%</TableCell>
                              <TableCell>轻度增加营养</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>3 级 (中度)</TableCell>
                              <TableCell>130-145%</TableCell>
                              <TableCell>适度增加施肥</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>4 级 (重度)</TableCell>
                              <TableCell>145-160%</TableCell>
                              <TableCell>显著增加施肥</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>5 级 (严重)</TableCell>
                              <TableCell>160-175%</TableCell>
                              <TableCell>大量补充营养</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              </>
            )}
          </>
        )}
      </Grid>
    </Box>
  );
};

export default PrescriptionPage;
