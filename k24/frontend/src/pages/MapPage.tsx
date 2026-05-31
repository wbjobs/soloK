import React, { useState, useEffect, useRef } from 'react';
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
  Chip,
  Alert,
} from '@mui/material';
import { Map as MapIcon, Download as DownloadIcon } from '@mui/icons-material';
import Heatmap from '../components/Heatmap';
import { useStore } from '../store/useStore';
import { getDiseaseDistribution, calculateVI, SmallLesion } from '../services/api';

const diseaseColors: Record<string, string> = {
  '健康': '#4CAF50',
  '条锈病': '#FFC107',
  '叶锈病': '#FF9800',
  '白粉病': '#9E9E9E',
  '赤霉病': '#F44336',
};

const MapPage: React.FC = () => {
  const currentHypercube = useStore((state) => state.currentHypercube);
  const [loading, setLoading] = useState(false);
  const [distribution, setDistribution] = useState<any>(null);
  const [smallLesions, setSmallLesions] = useState<SmallLesion[]>([]);
  const [selectedVI, setSelectedVI] = useState('NDVI');
  const [viData, setViData] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'disease' | 'vi'>('disease');
  const [showLesionMarkers, setShowLesionMarkers] = useState(true);

  useEffect(() => {
    if (currentHypercube) {
      loadDiseaseDistribution();
      loadVIData();
    }
  }, [currentHypercube, selectedVI]);

  const loadDiseaseDistribution = async () => {
    if (!currentHypercube) return;
    
    setLoading(true);
    try {
      const result = await getDiseaseDistribution(currentHypercube.fileId);
      setDistribution(result);
      setSmallLesions(result.small_lesions || []);
    } catch (err) {
      console.error('Failed to load disease distribution:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadVIData = async () => {
    if (!currentHypercube) return;
    
    try {
      const result = await calculateVI(currentHypercube.fileId, [selectedVI]);
      setViData(result.results[selectedVI]);
    } catch (err) {
      console.error('Failed to load VI data:', err);
    }
  };

  const handleExportGeoJSON = () => {
    if (!distribution?.geojson) return;
    
    const blob = new Blob([JSON.stringify(distribution.geojson, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disease_distribution_${currentHypercube?.fileId}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentHypercube) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          病害分布图
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
        病害分布图
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item>
                <FormControl sx={{ minWidth: 150 }}>
                  <InputLabel>显示模式</InputLabel>
                  <Select
                    value={viewMode}
                    label="显示模式"
                    onChange={(e) => setViewMode(e.target.value as any)}
                  >
                    <MenuItem value="disease">病害分布</MenuItem>
                    <MenuItem value="vi">植被指数</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              {viewMode === 'vi' && (
                <Grid item>
                  <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel>植被指数</InputLabel>
                    <Select
                      value={selectedVI}
                      label="植被指数"
                      onChange={(e) => setSelectedVI(e.target.value)}
                    >
                      <MenuItem value="NDVI">NDVI</MenuItem>
                      <MenuItem value="PRI">PRI</MenuItem>
                      <MenuItem value="PSRI">PSRI</MenuItem>
                      <MenuItem value="CCCI">CCCI</MenuItem>
                      <MenuItem value="NDRE">NDRE</MenuItem>
                      <MenuItem value="GNDVI">GNDVI</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              )}
              
              <Grid item>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleExportGeoJSON}
                  disabled={!distribution?.geojson}
                  startIcon={<DownloadIcon />}
                >
                  导出 GeoJSON
                </Button>
              </Grid>
              
              {viewMode === 'disease' && smallLesions.length > 0 && (
                <Grid item>
                  <FormControl sx={{ minWidth: 180 }}>
                    <InputLabel>零星病灶标记</InputLabel>
                    <Select
                      value={showLesionMarkers}
                      label="零星病灶标记"
                      onChange={(e) => setShowLesionMarkers(e.target.value as boolean)}
                    >
                      <MenuItem value={true}>显示</MenuItem>
                      <MenuItem value={false}>隐藏</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              )}
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
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 2 }}>
                {viewMode === 'disease' && distribution?.heatmap && (
                  <>
                    {smallLesions.length > 0 && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        检测到 {smallLesions.length} 个零星发病区域（病斑面积 &lt; 1%），已进行增强显示
                      </Alert>
                    )}
                    <Heatmap
                      data={distribution.heatmap}
                      title="病害严重程度热力图"
                      colormap="red"
                      minValue={1}
                      maxValue={5}
                      smallLesions={smallLesions}
                      showLesionMarkers={showLesionMarkers}
                    />
                  </>
                )}
                {viewMode === 'vi' && viData?.values && (
                  <Heatmap
                    data={viData.values}
                    title={`${selectedVI} 分布图`}
                    colormap="viridis"
                  />
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    统计信息
                  </Typography>
                  
                  {viewMode === 'disease' && distribution && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        病害分布比例:
                      </Typography>
                      {Object.entries(distribution.distribution || {}).map(
                        ([name, ratio]: [string, any]) => (
                          <Box
                            key={name}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              mb: 1,
                              gap: 1,
                            }}
                          >
                            <Box
                              sx={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                bgcolor: diseaseColors[name] || '#ccc',
                              }}
                            />
                            <Typography sx={{ flex: 1 }}>{name}</Typography>
                            <Typography fontWeight="bold">
                              {(ratio * 100).toFixed(1)}%
                            </Typography>
                          </Box>
                        )
                      )}
                      
                      <Typography variant="subtitle2" sx={{ mt: 2 }}>
                        平均严重程度:
                      </Typography>
                      <Typography variant="h4" color="error">
                        {distribution.severity_mean?.toFixed(2)}
                        <Typography component="span" variant="body1">
                          {' '}/ 5 级
                        </Typography>
                      </Typography>
                      
                      {smallLesions.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            零星发病区域: {smallLesions.length} 个
                          </Typography>
                          {smallLesions.slice(0, 3).map((lesion) => (
                            <Box
                              key={lesion.id}
                              sx={{
                                p: 1,
                                bgcolor: 'rgba(244, 67, 54, 0.1)',
                                borderRadius: 1,
                                mb: 1,
                              }}
                            >
                              <Typography variant="body2">
                                #{lesion.id + 1} - 面积: {(lesion.area_ratio * 100).toFixed(3)}%
                              </Typography>
                              <Typography variant="body2" color="textSecondary">
                                严重程度: {lesion.mean_severity.toFixed(1)} - {lesion.max_severity.toFixed(1)} 级
                              </Typography>
                            </Box>
                          ))}
                          {smallLesions.length > 3 && (
                            <Typography variant="caption" color="textSecondary">
                              还有 {smallLesions.length - 3} 个零星病灶...
                            </Typography>
                          )}
                        </Box>
                      )}
                    </>
                  )}

                  {viewMode === 'vi' && viData && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        {viData.name}: {viData.description}
                      </Typography>
                      <Box sx={{ mt: 2 }}>
                        <Typography>平均值: {viData.mean.toFixed(4)}</Typography>
                        <Typography>标准差: {viData.std.toFixed(4)}</Typography>
                        <Typography>最小值: {viData.min.toFixed(4)}</Typography>
                        <Typography>最大值: {viData.max.toFixed(4)}</Typography>
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    图例
                  </Typography>
                  {viewMode === 'disease' ? (
                    <>
                      <Typography variant="body2" gutterBottom>
                        病害严重程度:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {[1, 2, 3, 4, 5].map((level) => (
                          <Chip
                            key={level}
                            label={`${level} 级`}
                            sx={{
                              bgcolor: `rgba(244, 67, 54, ${level / 5})`,
                              color: level > 2 ? 'white' : 'black',
                            }}
                          />
                        ))}
                      </Box>
                    </>
                  ) : (
                    <Typography variant="body2" color="textSecondary">
                      颜色从蓝到黄表示数值从低到高
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default MapPage;
