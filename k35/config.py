from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "FDIA Detection API"
    version: str = "1.0.0"
    
    database_url: str = "postgresql://postgres:password@localhost:5432/fdia_db"
    
    max_nodes: int = 300
    measurement_frequency: float = 5.0
    
    chi_square_confidence: float = 0.99
    
    lstm_sequence_length: int = 20
    lstm_hidden_size: int = 64
    lstm_latent_dim: int = 32
    lstm_detrend_window: int = 12
    lstm_ewma_alpha: float = 0.05
    lstm_relative_error: bool = True
    
    mpnn_hidden_channels: int = 64
    mpnn_num_layers: int = 3
    
    vae_hidden_dim: int = 64
    vae_latent_dim: int = 16
    vae_beta: float = 1.0
    vae_density_threshold_percentile: float = 5.0
    
    consequence_voltage_min: float = 0.95
    consequence_voltage_max: float = 1.05
    consequence_cost_a: float = 0.01
    consequence_cost_b: float = 20.0
    consequence_cost_c: float = 100.0
    consequence_electricity_price: float = 50.0
    
    anomaly_threshold_std: float = 3.0
    
    model_save_path: str = "./models/"
    
    class Config:
        env_file = ".env"


settings = Settings()
