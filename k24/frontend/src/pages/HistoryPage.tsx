import React, { useState } from 'react';
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
import { Compare as CompareIcon } from '@mui/icons-material';
import Plot from 'react-plotly.js';
import { useStore } from '../store/useStore';
import { detectChanges } from '../services/api';

const HistoryPage: React.FC = () => {
  const hypercubes = useStore((state) => state.hypercubes);
  const [selectedCube1, setSelectedCube1] = useState<string>('');
  const [selectedCube2, setSelectedCube2] = useState<string>('');
  const [selectedVI, setSelectedVI] = useState('NDVI');
  const [loading, setLoading] = useState(false);
  const [changeResult, setChangeResult] = useState<any>(null);

  const handleDetectChanges = async () => {
    if (!selectedCube1 || !selectedCube2) {
      alert('请选择两个高光谱数据进行对比');
      return;
    }

    setLoading(true);
    try {
      const result = await detectChanges(selectedCube1, selectedCube2, selectedVI);
      setChangeResult(result);
    } catch (err) {
      console.error('Change detection failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        历史影像对比与变化检测
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              选择对比数据
            </Typography>

            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>前期数据</InputLabel>
                  <Select
                    value={selectedCube1}
                    label="前期数据"
                    onChange={(e) => setSelectedCube1(e.target.value)}
                  >
                    {hypercubes.map((cube) => (
                      <MenuItem key={cube.fileId} value={cube.fileId}>
                        {cube.filename}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>后期数据</InputLabel>
                  <Select
                    value={selectedCube2}
                    label="后期数据"
                    onChange={(e) => setSelectedCube2(e.target.value)}
                  >
                    {hypercubes.map((cube) => (
                      <MenuItem key={cube.fileId} value={cube.fileId}>
                        {cube.filename}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel>植被指数</InputLabel>
                  <Select
                    value={selectedVI}
                    label="植被指数"
                    onChange={(e) => setSelectedVI(e.target.value)}
                  >
                    <MenuItem value="NDVI">NDVI</MenuItem>
                    <MenuItem value="NDRE">NDRE</MenuItem>
                    <MenuItem value="GNDVI">GNDVI</MenuItem>
                    <MenuItem value="EVI">EVI</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={handleDetectChanges}
                  disabled={loading || !selectedCube1 || !selectedCube2}
                  startIcon={loading ? <CircularProgress size={20} /> : <CompareIcon />}
                >
                  {loading ? '检测中...' : '开始变化检测'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {changeResult && (
          <>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    变化检测结果
                  </Typography>

                  <TableContainer>
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell>前期 {selectedVI} 均值</TableCell>
                          <TableCell align="right">
                            {changeResult.vi_mean_before.toFixed(4)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>后期 {selectedVI} 均值</TableCell>
                          <TableCell align="right">
                            {changeResult.vi_mean_after.toFixed(4)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>
                            <strong>{selectedVI} 变化量</strong>
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              color: changeResult.vi_change >= 0 ? 'success.main' : 'error.main',
                              fontWeight: 'bold',
                            }}
                          >
                            {changeResult.vi_change >= 0 ? '+' : ''}
                            {changeResult.vi_change.toFixed(4)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>变化幅度</TableCell>
                          <TableCell align="right">
                            {changeResult.change_magnitude.toFixed(4)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>改善区域比例</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>
                            {(changeResult.positive_change_ratio * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>退化区域比例</TableCell>
                          <TableCell align="right" sx={{ color: 'error.main' }}>
                            {(changeResult.negative_change_ratio * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
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
                    病害扩散分析
                  </Typography>

                  {changeResult.spread_direction && (
                    <>
                      <Box sx={{ textAlign: 'center', mb: 2 }}>
                        <Typography variant="h5" color="error">
                          扩散方向: {changeResult.spread_direction.direction}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          角度: {changeResult.spread_direction.angle?.toFixed(1)}°
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          position: 'relative',
                          width: 200,
                          height: 200,
                          margin: '0 auto',
                          borderRadius: '50%',
                          border: '2px solid #ccc',
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: 2,
                            height: 80,
                            bgcolor: 'error.main',
                            transformOrigin: 'bottom center',
                            transform: `translateX(-50%) rotate(${changeResult.spread_direction.angle || 0}deg)`,
                          }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)' }}
                        >
                          北
                        </Typography>
                      </Box>

                      <TableContainer sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>扩散速率指数</TableCell>
                              <TableCell align="right">
                                {changeResult.spread_rate.toFixed(4)}
                              </TableCell>
                            </TableRow>
                          </TableHead>
                        </Table>
                      </TableContainer>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  植被指数时序对比
                </Typography>
                <Plot
                  data={[
                    {
                      x: ['前期', '后期'],
                      y: [changeResult.vi_mean_before, changeResult.vi_mean_after],
                      type: 'bar',
                      name: selectedVI,
                      marker: {
                        color: ['#2196F3', '#4CAF50'],
                      },
                    },
                  ]}
                  layout={{
                    barmode: 'group',
                    xaxis: { title: '时间点' },
                    yaxis: { title: selectedVI },
                    height: 300,
                  }}
                  style={{ width: '100%' }}
                />
              </Paper>
            </Grid>
          </>
        )}

        {!changeResult && (
          <Grid item xs={12}>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="textSecondary">
                选择两个高光谱数据并点击「开始变化检测」查看对比结果
              </Typography>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default HistoryPage;
