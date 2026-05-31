import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { uploadHypercube } from '../services/api';
import { useStore } from '../store/useStore';

const UploadPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hdrFile, setHdrFile] = useState<File | null>(null);
  const [datFile, setDatFile] = useState<File | null>(null);
  const addHypercube = useStore((state) => state.addHypercube);
  const hypercubes = useStore((state) => state.hypercubes);

  const onDropHdr = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && (file.name.endsWith('.hdr') || file.name.endsWith('.HDR'))) {
      setHdrFile(file);
      setError(null);
    } else {
      setError('请上传 .hdr 格式的头文件');
    }
  }, []);

  const onDropDat = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setDatFile(file);
      setError(null);
    }
  }, []);

  const { getRootProps: getRootPropsHdr, getInputProps: getInputPropsHdr } = useDropzone({
    onDrop: onDropHdr,
    accept: {
      'application/octet-stream': ['.hdr', '.HDR'],
    },
    maxFiles: 1,
  });

  const { getRootProps: getRootPropsDat, getInputProps: getInputPropsDat } = useDropzone({
    onDrop: onDropDat,
    accept: {
      'application/octet-stream': ['.dat', '.DAT', '.img', '.IMG'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!hdrFile) {
      setError('请选择头文件 (.hdr)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await uploadHypercube(hdrFile, datFile || undefined);
      
      addHypercube({
        fileId: result.file_id,
        filename: result.filename,
        width: result.width,
        height: result.height,
        bands: result.bands,
        wavelengths: result.wavelengths,
        uploadedAt: new Date(),
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || '上传失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        高光谱数据上传
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              上传 ENVI 格式高光谱数据
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              支持 ENVI 标准格式（.hdr + .dat/.img），波段数 100-200，波长范围 400-1000nm
            </Typography>

            <Box sx={{ mb: 2 }}>
              <div
                {...getRootPropsHdr()}
                style={{
                  border: '2px dashed #ccc',
                  borderRadius: 8,
                  padding: 20,
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: hdrFile ? '#e8f5e9' : 'transparent',
                }}
              >
                <input {...getInputPropsHdr()} />
                <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main' }} />
                <Typography>
                  {hdrFile ? `已选择: ${hdrFile.name}` : '点击或拖拽上传头文件 (.hdr)'}
                </Typography>
              </div>
            </Box>

            <Box sx={{ mb: 2 }}>
              <div
                {...getRootPropsDat()}
                style={{
                  border: '2px dashed #ccc',
                  borderRadius: 8,
                  padding: 20,
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: datFile ? '#e8f5e9' : 'transparent',
                }}
              >
                <input {...getInputPropsDat()} />
                <CloudUploadIcon sx={{ fontSize: 48, color: 'secondary.main' }} />
                <Typography>
                  {datFile ? `已选择: ${datFile.name}` : '点击或拖拽上传数据文件 (.dat/.img) - 可选'}
                </Typography>
              </div>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              onClick={handleUpload}
              disabled={loading || !hdrFile}
              startIcon={loading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
            >
              {loading ? '上传中...' : '上传并处理'}
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                已上传数据
              </Typography>
              {hypercubes.length === 0 ? (
                <Typography color="textSecondary">
                  暂无上传数据
                </Typography>
              ) : (
                <List>
                  {hypercubes.map((cube) => (
                    <ListItem key={cube.fileId} divider>
                      <ListItemText
                        primary={cube.filename}
                        secondary={`${cube.width} x ${cube.height} x ${cube.bands} 波段 - ${cube.uploadedAt.toLocaleString()}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                支持的数据格式
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText primary="ENVI 标准格式" secondary=".hdr + .dat/.img" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="波段数" secondary="100-200 波段" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="波长范围" secondary="400-1000 nm" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="空间分辨率" secondary="无人机/卫星影像" />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default UploadPage;
