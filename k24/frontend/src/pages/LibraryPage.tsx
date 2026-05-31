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
  List,
  ListItem,
  ListItemText,
  Divider,
  Slider,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import SpectrumChart from '../components/SpectrumChart';
import {
  searchSpectralLibrary,
  getDiseaseList,
  getDiseaseSignature,
  SpectralMatchResult,
} from '../services/api';

const LibraryPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [diseases, setDiseases] = useState<string[]>([]);
  const [selectedDisease, setSelectedDisease] = useState<string>('');
  const [diseaseSignature, setDiseaseSignature] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<SpectralMatchResult[]>([]);
  const [searchMethod, setSearchMethod] = useState('spectral_angle');
  const [topK, setTopK] = useState(5);

  const [inputSpectrum, setInputSpectrum] = useState<number[]>([]);
  const wavelengths = Array.from({ length: 150 }, (_, i) => 400 + (i * 600) / 149);

  useEffect(() => {
    loadDiseaseList();
  }, []);

  useEffect(() => {
    if (selectedDisease) {
      loadDiseaseSignature(selectedDisease);
    }
  }, [selectedDisease]);

  const loadDiseaseList = async () => {
    try {
      const result = await getDiseaseList();
      setDiseases(result.diseases || []);
    } catch (err) {
      console.error('Failed to load disease list:', err);
    }
  };

  const loadDiseaseSignature = async (diseaseName: string) => {
    try {
      const result = await getDiseaseSignature(diseaseName);
      setDiseaseSignature(result.signature);
    } catch (err) {
      console.error('Failed to load disease signature:', err);
    }
  };

  const generateTestSpectrum = () => {
    const spectrum = wavelengths.map((wl) => {
      if (wl < 680) {
        return 0.05 + 0.02 * Math.sin(wl / 50) + (Math.random() - 0.5) * 0.01;
      } else if (wl < 750) {
        const t = (wl - 680) / 70;
        return 0.05 + t * 0.35 + (Math.random() - 0.5) * 0.02;
      } else {
        return 0.4 + 0.05 * Math.sin(wl / 100) + (Math.random() - 0.5) * 0.01;
      }
    });
    setInputSpectrum(spectrum);
  };

  const handleSearch = async () => {
    if (inputSpectrum.length === 0) {
      alert('请先生成或输入测试光谱');
      return;
    }

    setLoading(true);
    try {
      const result = await searchSpectralLibrary(
        inputSpectrum,
        searchMethod,
        topK,
        true
      );
      setSearchResults(result.results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        光谱库检索
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              输入光谱
            </Typography>

            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                onClick={generateTestSpectrum}
                sx={{ mr: 2 }}
              >
                生成测试光谱
              </Button>
            </Box>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>匹配方法</InputLabel>
                  <Select
                    value={searchMethod}
                    label="匹配方法"
                    onChange={(e) => setSearchMethod(e.target.value)}
                  >
                    <MenuItem value="spectral_angle">光谱角匹配 (SAM)</MenuItem>
                    <MenuItem value="euclidean">欧氏距离</MenuItem>
                    <MenuItem value="cosine">余弦相似度</MenuItem>
                    <MenuItem value="pearson">皮尔逊相关系数</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <Typography gutterBottom>返回结果数: {topK}</Typography>
                <Slider
                  value={topK}
                  onChange={(_, val) => setTopK(val as number)}
                  min={1}
                  max={10}
                  marks
                  valueLabelDisplay="auto"
                />
              </Grid>
            </Grid>

            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={handleSearch}
              disabled={loading || inputSpectrum.length === 0}
              startIcon={loading ? <CircularProgress size={20} /> : <SearchIcon />}
            >
              {loading ? '检索中...' : '光谱库检索'}
            </Button>

            {inputSpectrum.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <SpectrumChart
                  wavelengths={wavelengths}
                  spectra={[
                    {
                      name: '输入光谱',
                      values: inputSpectrum,
                      color: '#2196F3',
                    },
                  ]}
                  title="输入光谱曲线"
                />
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                检索结果
              </Typography>

              {searchResults.length === 0 ? (
                <Typography color="textSecondary">
                  点击「光谱库检索」查看匹配结果
                </Typography>
              ) : (
                <List>
                  {searchResults.map((result, idx) => (
                    <React.Fragment key={idx}>
                      <ListItem alignItems="flex-start">
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle1" fontWeight="bold">
                                {idx + 1}. {result.disease_name}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="primary"
                                fontWeight="bold"
                              >
                                {(result.similarity * 100).toFixed(1)}%
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <>
                              <Typography variant="body2">
                                严重程度: {result.severity} 级 | 作物: {result.crop_type}
                              </Typography>
                              <Typography variant="body2" color="textSecondary">
                                {result.description}
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                      {idx < searchResults.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                病害光谱模板
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>选择病害类型</InputLabel>
                <Select
                  value={selectedDisease}
                  label="选择病害类型"
                  onChange={(e) => setSelectedDisease(e.target.value)}
                >
                  {diseases.map((disease) => (
                    <MenuItem key={disease} value={disease}>
                      {disease}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {diseaseSignature && (
                <>
                  <Typography variant="body2" paragraph>
                    {diseaseSignature.description}
                  </Typography>
                  <SpectrumChart
                    wavelengths={diseaseSignature.wavelengths || wavelengths}
                    spectra={[
                      {
                        name: diseaseSignature.disease_name,
                        values: diseaseSignature.spectrum,
                        color: '#F44336',
                      },
                    ]}
                    title={`${diseaseSignature.disease_name} 光谱特征`}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default LibraryPage;
