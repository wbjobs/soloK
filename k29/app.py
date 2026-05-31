import streamlit as st
st.set_page_config(page_title="声波测井数据可视化解释平台", layout="wide", page_icon="📊")
import importlib
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent / "src"))

from ui.main_ui import main

if __name__ == "__main__":
    main()
