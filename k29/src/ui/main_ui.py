import streamlit as st
import numpy as np
import pandas as pd
from typing import List, Optional, Dict, Tuple
import io

from ..processing.las_loader import WellData, load_las_file, generate_synthetic_wells, resample_well
from ..processing.elastic_params import calculate_elastic_params, get_elastic_units
from ..processing.porosity import calculate_porosity, get_porosity_units
from ..processing.brittleness import calculate_brittleness, get_brittleness_units, classify_brittleness
from ..processing.lithology import predict_lithology, get_lithology_color, LITHOLOGY_TYPES
from ..processing.fracture import analyze_fractures, get_fracture_units
from ..processing.time_depth_conversion import convert_well_to_time_domain, create_checkshot_calibration, get_time_depth_units
from ..processing.export import export_to_excel, create_interpretation_report, export_interpretation_table
from ..processing.shear_anisotropy import analyze_shear_anisotropy, get_anisotropy_units
from ..processing.lithofacies_ml import (
    train_lithofacies_model, predict_lithofacies, compare_predictions,
    FACIES_NAMES, TORCH_AVAILABLE, generate_synthetic_labels_for_well
)
from ..visualization.log_plot import create_log_plot, create_multi_well_comparison, create_crossplot, create_lithology_track
from ..visualization.well_trajectory_3d import (
    create_3d_trajectory_plot, create_top_view_trajectory, generate_synthetic_trajectory,
    create_3d_anisotropy_rose, create_anisotropy_rose_2d
)


def init_session_state():
    if "wells" not in st.session_state:
        st.session_state.wells: List[WellData] = []
    if "current_well_index" not in st.session_state:
        st.session_state.current_well_index = 0
    if "elastic_results" not in st.session_state:
        st.session_state.elastic_results: Dict[str, pd.DataFrame] = {}
    if "porosity_results" not in st.session_state:
        st.session_state.porosity_results: Dict[str, pd.DataFrame] = {}
    if "brittleness_results" not in st.session_state:
        st.session_state.brittleness_results: Dict[str, pd.DataFrame] = {}
    if "lithology_results" not in st.session_state:
        st.session_state.lithology_results: Dict[str, pd.DataFrame] = {}
    if "fracture_results" not in st.session_state:
        st.session_state.fracture_results: Dict[str, pd.DataFrame] = {}
    if "time_domain_results" not in st.session_state:
        st.session_state.time_domain_results: Dict[str, pd.DataFrame] = {}
    if "well_trajectories" not in st.session_state:
        st.session_state.well_trajectories: Dict[str, pd.DataFrame] = {}
    if "anisotropy_results" not in st.session_state:
        st.session_state.anisotropy_results: Dict[str, pd.DataFrame] = {}
    if "dl_model" not in st.session_state:
        st.session_state.dl_model = None
    if "dl_model_info" not in st.session_state:
        st.session_state.dl_model_info: Dict = {}
    if "dl_predictions" not in st.session_state:
        st.session_state.dl_predictions: Dict[str, pd.DataFrame] = {}
    if "comparison_results" not in st.session_state:
        st.session_state.comparison_results: Dict[str, pd.DataFrame] = {}


def get_current_well() -> Optional[WellData]:
    if st.session_state.wells and 0 <= st.session_state.current_well_index < len(st.session_state.wells):
        return st.session_state.wells[st.session_state.current_well_index]
    return None


def render_sidebar():
    with st.sidebar:
        st.title("📊 声波测井解释平台")
        st.markdown("---")
        
        st.subheader("📁 数据加载")
        uploaded_files = st.file_uploader("上传LAS文件", type=["las", "LAS"], accept_multiple_files=True)
        
        if uploaded_files:
            for uploaded_file in uploaded_files:
                try:
                    file_bytes = uploaded_file.read()
                    well = load_las_file(file_bytes, uploaded_file.name)
                    
                    existing_names = [w.well_name for w in st.session_state.wells]
                    if well.well_name in existing_names:
                        well.well_name = f"{well.well_name}_{len(st.session_state.wells)}"
                    
                    st.session_state.wells.append(well)
                    st.success(f"成功加载: {well.well_name}")
                except Exception as e:
                    st.error(f"加载失败 {uploaded_file.name}: {str(e)}")
        
        if st.button("🔬 加载示例数据 (3口井)", type="secondary"):
            st.session_state.wells = generate_synthetic_wells(3)
            st.session_state.current_well_index = 0
            st.session_state.elastic_results = {}
            st.session_state.porosity_results = {}
            st.session_state.brittleness_results = {}
            st.session_state.lithology_results = {}
            st.session_state.fracture_results = {}
            st.session_state.time_domain_results = {}
            st.success("已加载3口示例井数据")
        
        st.markdown("---")
        
        if st.session_state.wells:
            st.subheader("🔧 井选择")
            well_names = [w.well_name for w in st.session_state.wells]
            selected_well = st.selectbox("选择井", well_names, index=st.session_state.current_well_index)
            st.session_state.current_well_index = well_names.index(selected_well)
            
            if st.button("🗑️ 移除当前井", type="secondary"):
                well_name = st.session_state.wells[st.session_state.current_well_index].well_name
                st.session_state.wells.pop(st.session_state.current_well_index)
                for key in [well_name]:
                    st.session_state.elastic_results.pop(key, None)
                    st.session_state.porosity_results.pop(key, None)
                    st.session_state.brittleness_results.pop(key, None)
                    st.session_state.lithology_results.pop(key, None)
                    st.session_state.fracture_results.pop(key, None)
                    st.session_state.time_domain_results.pop(key, None)
                if st.session_state.wells:
                    st.session_state.current_well_index = 0
                st.rerun()
        
        st.markdown("---")
        st.caption("© 2024 声波测井数据可视化解释平台")


def render_data_overview(well: WellData):
    st.header(f"📋 {well.well_name} - 数据概览")
    
    col1, col2 = st.columns([1, 2])
    
    with col1:
        st.subheader("基本信息")
        info_data = {
            "井名": well.well_name,
            "曲线数量": len(well.curves),
            "深度单位": well.depth_unit,
        }
        
        if well.df is not None:
            depths = well.get_depth()
            if depths is not None:
                info_data["顶深"] = f"{depths.min():.2f} m"
                info_data["底深"] = f"{depths.max():.2f} m"
                info_data["采样点数"] = len(depths)
        
        st.write(pd.DataFrame(list(info_data.items()), columns=["参数", "值"]))
        
        st.subheader("可用曲线")
        curves_df = pd.DataFrame({
            "曲线名": well.curves,
            "单位": [well.units.get(c, "") for c in well.curves],
        })
        st.dataframe(curves_df, height=300, use_container_width=True)
    
    with col2:
        st.subheader("数据预览")
        if well.df is not None:
            st.dataframe(well.df.head(20), height=400, use_container_width=True)
            
            st.subheader("曲线统计")
            numeric_cols = well.df.select_dtypes(include=[np.number]).columns
            st.dataframe(well.df[numeric_cols].describe().T, use_container_width=True)


def render_processing(well: WellData):
    st.header(f"⚙️ {well.well_name} - 数据处理")
    
    tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs([
        "弹性参数计算", "孔隙度预测", "脆性指数", "岩性判别", "裂缝识别",
        "横波各向异性", "深度学习岩相预测"
    ])
    
    with tab1:
        st.subheader("地层弹性参数计算")
        st.info("需要: DT(纵波时差), DTS(横波时差), RHOB(体积密度)")
        
        if st.button("计算弹性参数", key="calc_elastic"):
            try:
                with st.spinner("计算中..."):
                    result = calculate_elastic_params(well)
                    st.session_state.elastic_results[well.well_name] = result
                    st.success("弹性参数计算完成!")
            except Exception as e:
                st.error(f"计算失败: {str(e)}")
        
        if well.well_name in st.session_state.elastic_results:
            result = st.session_state.elastic_results[well.well_name]
            st.dataframe(result.head(20), use_container_width=True)
            
            st.subheader("弹性参数曲线")
            tracks = [
                {"curves": ["VP", "VS"], "title": "速度 (km/s)"},
                {"curves": ["YOUNGS_MODULUS", "BULK_MODULUS", "SHEAR_MODULUS"], "title": "模量 (GPa)"},
                {"curves": ["POISSONS_RATIO", "VP_VS"], "title": "比值"},
            ]
            
            well_with_elastic = WellData(well.well_name)
            well_with_elastic.df = result
            well_with_elastic.curves = list(result.columns)
            well_with_elastic.units = get_elastic_units()
            
            fig = create_log_plot(well_with_elastic, tracks, height=700)
            st.plotly_chart(fig, use_container_width=True)
    
    with tab2:
        st.subheader("孔隙度预测")
        st.info("需要: DT(纵波时差), RHOB(体积密度)")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            dt_ma = st.number_input("骨架声波时差 (us/ft)", value=55.0, min_value=40.0, max_value=70.0)
        with col2:
            dt_fl = st.number_input("流体声波时差 (us/ft)", value=189.0, min_value=180.0, max_value=200.0)
        with col3:
            rho_ma = st.number_input("骨架密度 (g/cm3)", value=2.65, min_value=2.5, max_value=3.0)
        
        if st.button("计算孔隙度", key="calc_porosity"):
            try:
                with st.spinner("计算中..."):
                    result = calculate_porosity(well, dt_ma=dt_ma, dt_fl=dt_fl, rho_ma=rho_ma)
                    st.session_state.porosity_results[well.well_name] = result
                    st.success("孔隙度计算完成!")
            except Exception as e:
                st.error(f"计算失败: {str(e)}")
        
        if well.well_name in st.session_state.porosity_results:
            result = st.session_state.porosity_results[well.well_name]
            st.dataframe(result.head(20), use_container_width=True)
            
            st.subheader("孔隙度曲线对比")
            tracks = [{"curves": [c for c in result.columns if c != "DEPTH"], "title": "孔隙度"}]
            
            well_with_phi = WellData(well.well_name)
            well_with_phi.df = result
            well_with_phi.curves = list(result.columns)
            well_with_phi.units = get_porosity_units()
            
            fig = create_log_plot(well_with_phi, tracks, height=700)
            st.plotly_chart(fig, use_container_width=True)
    
    with tab3:
        st.subheader("脆性指数计算 (页岩气评价)")
        st.info("需要: DT, DTS, RHOB。基于杨氏模量和泊松比归一化计算。")
        
        if st.button("计算脆性指数", key="calc_brittleness"):
            try:
                with st.spinner("计算中..."):
                    result = calculate_brittleness(well)
                    result["BRITTLENESS_CLASS"] = classify_brittleness(result["BRITTLENESS"].values)
                    st.session_state.brittleness_results[well.well_name] = result
                    st.success("脆性指数计算完成!")
            except Exception as e:
                st.error(f"计算失败: {str(e)}")
        
        if well.well_name in st.session_state.brittleness_results:
            result = st.session_state.brittleness_results[well.well_name]
            st.dataframe(result.head(20), use_container_width=True)
            
            st.subheader("脆性指数分布")
            fig = create_crossplot(
                result["YOUNGS_MODULUS"].values,
                result["POISSONS_RATIO"].values,
                color_data=result["BRITTLENESS"].values,
                x_label="杨氏模量 (GPa)",
                y_label="泊松比",
                color_label="脆性指数 (%)",
                title="脆性指数交会图",
            )
            st.plotly_chart(fig, use_container_width=True)
    
    with tab4:
        st.subheader("岩性自动判别 (随机森林)")
        st.info("需要: DT, RHOB, GR。基于预训练的随机森林模型判别岩性。")
        
        if st.button("进行岩性判别", key="calc_lithology"):
            try:
                with st.spinner("判别中..."):
                    result = predict_lithology(well)
                    st.session_state.lithology_results[well.well_name] = result
                    st.success("岩性判别完成!")
            except Exception as e:
                st.error(f"判别失败: {str(e)}")
        
        if well.well_name in st.session_state.lithology_results:
            result = st.session_state.lithology_results[well.well_name]
            
            col1, col2 = st.columns([1, 1])
            with col1:
                st.subheader("岩性分布统计")
                litho_counts = result["LITHOLOGY"].value_counts()
                st.dataframe(pd.DataFrame({
                    "岩性": litho_counts.index,
                    "点数": litho_counts.values,
                    "百分比": (litho_counts.values / len(result) * 100).round(1),
                }), use_container_width=True)
            
            with col2:
                st.subheader("岩性剖面")
                fig = create_lithology_track(result)
                st.plotly_chart(fig, use_container_width=True)
            
            st.subheader("判别结果预览")
            display_cols = ["DEPTH", "DT", "RHOB", "GR", "LITHOLOGY", "CONFIDENCE"]
            st.dataframe(result[display_cols].head(30), use_container_width=True)
    
    with tab5:
        st.subheader("裂缝识别 (横波分裂)")
        st.info("需要: DTS_FAST(快横波) 和 DTS_SLOW(慢横波)，或至少 DTS 曲线。")
        
        col1, col2 = st.columns(2)
        with col1:
            window_size = st.number_input("滑动窗口大小", value=20, min_value=5, max_value=100)
        with col2:
            threshold = st.number_input("裂缝检测阈值 (us)", value=5.0, min_value=1.0, max_value=20.0)
        
        if st.button("进行裂缝识别", key="calc_fracture"):
            try:
                with st.spinner("识别中..."):
                    result = analyze_fractures(well)
                    st.session_state.fracture_results[well.well_name] = result
                    st.success("裂缝识别完成!")
            except Exception as e:
                st.error(f"识别失败: {str(e)}")
        
        if well.well_name in st.session_state.fracture_results:
            result = st.session_state.fracture_results[well.well_name]
            
            st.subheader("裂缝等级分布")
            frac_counts = result["FRACTURE_LEVEL"].value_counts()
            st.dataframe(pd.DataFrame({
                "裂缝等级": frac_counts.index,
                "点数": frac_counts.values,
                "百分比": (frac_counts.values / len(result) * 100).round(1),
            }), use_container_width=True)
            
            st.subheader("裂缝识别曲线")
            tracks = [
                {"curves": ["DTS_FAST", "DTS_SLOW"], "title": "快慢横波时差"},
                {"curves": ["DELTA_T", "DELTA_T_SMOOTHED"], "title": "时差差"},
                {"curves": ["FRACTURE_INTENSITY"], "title": "裂缝强度"},
            ]
            
            well_with_frac = WellData(well.well_name)
            well_with_frac.df = result
            well_with_frac.curves = list(result.columns)
            well_with_frac.units = get_fracture_units()
            
            fig = create_log_plot(well_with_frac, tracks, height=700)
            st.plotly_chart(fig, use_container_width=True)
    
    with tab6:
        st.subheader("横波各向异性分析 (Alford旋转)")
        st.info("需要: DTS_X和DTS_Y(交叉偶极分量)，或至少DTS曲线。通过Alford旋转求解快慢横波方向。")
        
        if st.button("计算横波各向异性", key="calc_anisotropy"):
            try:
                with st.spinner("Alford旋转计算中..."):
                    result = analyze_shear_anisotropy(well)
                    st.session_state.anisotropy_results[well.well_name] = result
                    st.success("横波各向异性分析完成!")
            except Exception as e:
                st.error(f"计算失败: {str(e)}")
        
        if well.well_name in st.session_state.anisotropy_results:
            result = st.session_state.anisotropy_results[well.well_name]
            
            col1, col2 = st.columns(2)
            with col1:
                st.subheader("各向异性统计")
                stats = {
                    "快横波方向范围": f"{result['FAST_DIRECTION'].min():.1f}° - {result['FAST_DIRECTION'].max():.1f}°",
                    "各向异性幅值均值": f"{result['ANISOTROPY_MAG'].mean():.2f} us/ft",
                    "各向异性百分比均值": f"{result['ANISOTROPY_PCT'].mean():.2f} %",
                }
                st.write(pd.DataFrame(list(stats.items()), columns=["参数", "值"]))
            with col2:
                st.subheader("2D玫瑰花图")
                fig_rose = create_anisotropy_rose_2d(
                    result["FAST_DIRECTION"].values,
                    result["ANISOTROPY_MAG"].values,
                    title="快横波方向玫瑰花图",
                )
                st.plotly_chart(fig_rose, use_container_width=True)
            
            st.subheader("各向异性曲线")
            tracks = [
                {"curves": ["FAST_DIRECTION", "SLOW_DIRECTION"], "title": "横波方向 (°)"},
                {"curves": ["DTS_FAST", "DTS_SLOW"], "title": "快慢横波时差"},
                {"curves": ["ANISOTROPY_MAG", "ANISOTROPY_PCT"], "title": "各向异性强度"},
            ]
            
            well_with_ani = WellData(well.well_name)
            well_with_ani.df = result
            well_with_ani.curves = list(result.columns)
            well_with_ani.units = get_anisotropy_units()
            
            fig = create_log_plot(well_with_ani, tracks, height=700)
            st.plotly_chart(fig, use_container_width=True)
    
    with tab7:
        st.subheader("深度学习岩相预测 (LSTM/Transformer)")
        
        if not TORCH_AVAILABLE:
            st.warning("⚠️ PyTorch未安装，深度学习功能不可用。请安装: pip install torch")
            st.info("安装PyTorch后可使用LSTM和Transformer进行岩相序列预测")
        else:
            st.info("基于多井测井数据训练序列模型(双向LSTM或Transformer)，与传统随机森林方法对比。")
            
            col1, col2, col3 = st.columns(3)
            with col1:
                model_type = st.selectbox("模型类型", ["LSTM", "Transformer"], index=0)
            with col2:
                seq_length = st.number_input("序列长度", value=50, min_value=10, max_value=200)
            with col3:
                epochs = st.number_input("训练轮数", value=10, min_value=1, max_value=100)
            
            training_wells = st.session_state.wells
            
            if len(training_wells) >= 1:
                st.success(f"已加载 {len(training_wells)} 口井用于训练")
                
                if st.button(f"🚀 训练{model_type}模型", key="train_dl_model"):
                    try:
                        with st.spinner(f"训练{model_type}模型中... (可能需要1-2分钟)"):
                            model, model_info = train_lithofacies_model(
                                training_wells,
                                model_type=model_type.lower(),
                                seq_length=seq_length,
                                epochs=epochs,
                                verbose=False,
                            )
                            st.session_state.dl_model = model
                            st.session_state.dl_model_info = model_info
                            st.success(f"{model_type}模型训练完成!")
                            
                            st.subheader("训练历史")
                            history_df = pd.DataFrame(model_info["history"])
                            fig = create_crossplot(
                                np.arange(len(history_df)),
                                history_df["accuracy"].values,
                                x_label="Epoch",
                                y_label="准确率",
                                title="训练准确率曲线",
                            )
                            st.plotly_chart(fig, use_container_width=True)
                    except Exception as e:
                        st.error(f"训练失败: {str(e)}")
                        st.exception(e)
                
                if st.session_state.dl_model is not None:
                    st.markdown("---")
                    st.subheader("模型预测 & 与传统方法对比")
                    
                    if st.button("📊 预测并对比", key="predict_compare"):
                        try:
                            with st.spinner("预测中..."):
                                dl_result = predict_lithofacies(
                                    well,
                                    st.session_state.dl_model,
                                    st.session_state.dl_model_info,
                                )
                                st.session_state.dl_predictions[well.well_name] = dl_result
                                
                                if well.well_name in st.session_state.lithology_results:
                                    comp_result = compare_predictions(
                                        st.session_state.lithology_results[well.well_name],
                                        dl_result,
                                    )
                                    st.session_state.comparison_results[well.well_name] = comp_result
                                    st.success("预测完成!")
                        except Exception as e:
                            st.error(f"预测失败: {str(e)}")
                            st.exception(e)
                    
                    if well.well_name in st.session_state.comparison_results:
                        comp_result = st.session_state.comparison_results[well.well_name]
                        
                        col1, col2 = st.columns(2)
                        with col1:
                            st.subheader("对比统计")
                            agreement_rate = comp_result["AGREEMENT"].mean() * 100
                            st.metric("方法一致性", f"{agreement_rate:.1f}%")
                            
                            st.dataframe(pd.DataFrame({
                                "方法": ["传统随机森林", "深度学习"],
                                "平均置信度": [
                                    f"{comp_result['CONFIDENCE'].mean()*100:.1f}%",
                                    f"{comp_result['CONFIDENCE_DL'].mean()*100:.1f}%",
                                ],
                            }), use_container_width=True)
                        
                        with col2:
                            st.subheader("岩性分布对比")
                            fig = create_crossplot(
                                comp_result["DEPTH"].values,
                                comp_result["AGREEMENT"].values,
                                x_label="深度 (m)",
                                y_label="一致性 (1=一致, 0=不一致)",
                                title="方法一致性随深度变化",
                            )
                            st.plotly_chart(fig, use_container_width=True)
                        
                        st.subheader("预测结果对比")
                        display_cols = ["DEPTH", "LITHOLOGY", "LITHOFACIES_DL", "CONFIDENCE", "CONFIDENCE_DL", "AGREEMENT"]
                        st.dataframe(comp_result[display_cols].head(50), use_container_width=True)
                        
                        if well.well_name in st.session_state.dl_predictions:
                            st.subheader("深度学习预测剖面")
                            dl_df = st.session_state.dl_predictions[well.well_name]
                            dl_df["LITHOLOGY_COLOR"] = dl_df["LITHOFACIES_DL"].apply(
                                lambda x: get_lithology_color(x) if x in ["砂岩", "泥岩", "石灰岩", "白云岩", "煤", "盐岩"] else "#808080"
                            )
                            dl_df_renamed = dl_df.rename(columns={"LITHOFACIES_DL": "LITHOLOGY"})
                            fig_dl = create_lithology_track(dl_df_renamed)
                            fig_dl.update_layout(title="深度学习岩相预测")
                            st.plotly_chart(fig_dl, use_container_width=True)
            else:
                st.warning("请先加载至少1口井数据进行训练")


def render_visualization(well: WellData):
    st.header(f"📈 {well.well_name} - 可视化")
    
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "综合测井曲线图", "纵横波交会图", "3D井轨迹", "多井对比", "3D各向异性玫瑰花图"
    ])
    
    with tab1:
        st.subheader("综合测井曲线图")
        
        all_curves = well.curves.copy()
        if well.well_name in st.session_state.elastic_results:
            all_curves += [c for c in st.session_state.elastic_results[well.well_name].columns if c != "DEPTH"]
        if well.well_name in st.session_state.porosity_results:
            all_curves += [c for c in st.session_state.porosity_results[well.well_name].columns if c != "DEPTH"]
        if well.well_name in st.session_state.brittleness_results:
            all_curves += [c for c in st.session_state.brittleness_results[well.well_name].columns if c not in ["DEPTH", "BRITTLENESS_CLASS"]]
        
        depths = well.get_depth()
        depth_min = float(depths.min()) if depths is not None else 0.0
        depth_max = float(depths.max()) if depths is not None else 1000.0
        
        col1, col2 = st.columns(2)
        with col1:
            depth_range = st.slider("深度范围 (m)", depth_min, depth_max, (depth_min, depth_max), key="viz_depth_range")
        with col2:
            height = st.number_input("图表高度", value=800, min_value=400, max_value=1200)
        
        st.subheader("选择显示曲线道 (最多6道)")
        n_tracks = st.number_input("显示道数", value=3, min_value=1, max_value=6)
        
        tracks = []
        default_tracks = [
            (["GR"], "自然伽马"),
            (["DT", "DTS"], "声波时差"),
            (["RHOB"], "体积密度"),
        ]
        
        for i in range(n_tracks):
            col_a, col_b = st.columns([2, 1])
            with col_a:
                default_curves = default_tracks[i][0] if i < len(default_tracks) else []
                selected_curves = st.multiselect(f"道{i+1} 曲线", all_curves, default=default_curves, key=f"track_{i}")
            with col_b:
                default_title = default_tracks[i][1] if i < len(default_tracks) else f"道{i+1}"
                track_title = st.text_input(f"道{i+1} 标题", value=default_title, key=f"track_title_{i}")
            tracks.append({"curves": selected_curves, "title": track_title})
        
        if st.button("生成综合曲线图", key="gen_log_plot"):
            if any(t["curves"] for t in tracks):
                combined_well = WellData(well.well_name)
                combined_df = well.df.copy()
                
                if well.well_name in st.session_state.elastic_results:
                    for col in st.session_state.elastic_results[well.well_name].columns:
                        if col != "DEPTH" and col not in combined_df.columns:
                            combined_df[col] = st.session_state.elastic_results[well.well_name][col].values
                
                if well.well_name in st.session_state.porosity_results:
                    for col in st.session_state.porosity_results[well.well_name].columns:
                        if col != "DEPTH" and col not in combined_df.columns:
                            combined_df[col] = st.session_state.porosity_results[well.well_name][col].values
                
                if well.well_name in st.session_state.brittleness_results:
                    for col in st.session_state.brittleness_results[well.well_name].columns:
                        if col != "DEPTH" and col not in combined_df.columns and col != "BRITTLENESS_CLASS":
                            combined_df[col] = st.session_state.brittleness_results[well.well_name][col].values
                
                combined_well.df = combined_df
                combined_well.curves = list(combined_df.columns)
                
                valid_tracks = [t for t in tracks if t["curves"]]
                fig = create_log_plot(combined_well, valid_tracks, depth_range=depth_range, height=height)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("请至少选择一条曲线")
    
    with tab2:
        st.subheader("纵横波交会图")
        
        if well.well_name in st.session_state.elastic_results:
            elastic_df = st.session_state.elastic_results[well.well_name]
            
            col1, col2, col3 = st.columns(3)
            with col1:
                x_axis = st.selectbox("X轴", ["VP", "VS", "VP_VS", "YOUNGS_MODULUS", "POISSONS_RATIO"], index=0, key="xplot_x")
            with col2:
                y_axis = st.selectbox("Y轴", ["VP", "VS", "VP_VS", "YOUNGS_MODULUS", "POISSONS_RATIO"], index=1, key="xplot_y")
            with col3:
                color_options = ["None"] + list(elastic_df.columns)
                color_by = st.selectbox("颜色映射", color_options, index=0, key="xplot_color")
            
            color_data = None
            color_label = ""
            if color_by != "None":
                color_data = elastic_df[color_by].values
                color_label = color_by
            
            fig = create_crossplot(
                elastic_df[x_axis].values,
                elastic_df[y_axis].values,
                color_data=color_data,
                x_label=x_axis,
                y_label=y_axis,
                color_label=color_label,
                title=f"{x_axis} vs {y_axis} 交会图",
            )
            st.plotly_chart(fig, use_container_width=True)
            
            if well.well_name in st.session_state.lithology_results:
                st.subheader("按岩性着色的交会图")
                litho_df = st.session_state.lithology_results[well.well_name]
                litho_codes = pd.Categorical(litho_df["LITHOLOGY"]).codes
                
                fig2 = create_crossplot(
                    elastic_df[x_axis].values,
                    elastic_df[y_axis].values,
                    color_data=litho_codes,
                    x_label=x_axis,
                    y_label=y_axis,
                    color_label="岩性编码",
                    title=f"{x_axis} vs {y_axis} (按岩性着色)",
                )
                st.plotly_chart(fig2, use_container_width=True)
                
                st.caption("岩性编码说明: " + ", ".join([f"{i}={name}" for i, name in enumerate(LITHOLOGY_TYPES.keys())]))
        else:
            st.info("请先在'数据处理'中计算弹性参数")
    
    with tab3:
        st.subheader("3D井轨迹可视化")
        
        if well.well_name not in st.session_state.well_trajectories:
            st.info("生成合成井轨迹数据...")
            depths = well.get_depth()
            max_depth = depths.max() if depths is not None else 3000.0
            
            col1, col2, col3 = st.columns(3)
            with col1:
                azimuth = st.number_input("方位角 (度)", value=90.0, min_value=0.0, max_value=360.0)
            with col2:
                dip = st.number_input("初始倾角 (度)", value=0.0, min_value=-90.0, max_value=90.0)
            with col3:
                build_rate = st.number_input("造斜率 (度/30m)", value=0.0, min_value=-5.0, max_value=5.0)
            
            if st.button("生成井轨迹", key="gen_traj"):
                traj = generate_synthetic_trajectory(well.well_name, max_depth=max_depth, azimuth=azimuth, dip=dip, build_rate=build_rate)
                st.session_state.well_trajectories[well.well_name] = traj
        
        if well.well_name in st.session_state.well_trajectories:
            traj = st.session_state.well_trajectories[well.well_name]
            
            all_trajectories = [(name, df) for name, df in st.session_state.well_trajectories.items()]
            
            col1, col2 = st.columns(2)
            with col1:
                fig_3d = create_3d_trajectory_plot(all_trajectories)
                st.plotly_chart(fig_3d, use_container_width=True)
            with col2:
                fig_top = create_top_view_trajectory(all_trajectories)
                st.plotly_chart(fig_top, use_container_width=True)
    
    with tab4:
        st.subheader("多井对比")
        
        if len(st.session_state.wells) >= 2:
            all_curves = set()
            for w in st.session_state.wells:
                all_curves.update(w.curves)
            all_curves = sorted(list(all_curves))
            
            col1, col2 = st.columns(2)
            with col1:
                curve_name = st.selectbox("选择对比曲线", all_curves, key="multi_curve")
            with col2:
                resample_step = st.number_input("重采样间隔 (m)", value=1.0, min_value=0.1, max_value=10.0)
            
            fig = create_multi_well_comparison(st.session_state.wells, curve_name, resample_step=resample_step)
            st.plotly_chart(fig, use_container_width=True)
            
            st.subheader("多井数据对比表")
            comparison_data = {}
            for w in st.session_state.wells:
                curve_data = w.get_curve(curve_name)
                if curve_data is not None:
                    comparison_data[w.well_name] = {
                        "最小值": float(np.nanmin(curve_data)),
                        "最大值": float(np.nanmax(curve_data)),
                        "平均值": float(np.nanmean(curve_data)),
                        "标准差": float(np.nanstd(curve_data)),
                    }
            
            if comparison_data:
                st.dataframe(pd.DataFrame(comparison_data).T, use_container_width=True)
        else:
            st.info("请至少加载2口井进行对比")
    
    with tab5:
        st.subheader("3D横波各向异性玫瑰花图")
        
        if well.well_name not in st.session_state.anisotropy_results:
            st.info("请先在'数据处理' -> '横波各向异性'中计算各向异性参数")
        else:
            ani_result = st.session_state.anisotropy_results[well.well_name]
            
            col1, col2 = st.columns(2)
            with col1:
                n_sections = st.number_input("深度分段数", value=5, min_value=2, max_value=10)
            with col2:
                n_bins = st.number_input("方向分箱数", value=18, min_value=8, max_value=36)
            
            if st.button("生成3D玫瑰花图", key="gen_3d_rose"):
                with st.spinner("生成3D玫瑰花图..."):
                    fig_3d = create_3d_anisotropy_rose(
                        ani_result["FAST_DIRECTION"].values,
                        ani_result["DEPTH"].values,
                        anisotropy_magnitude=ani_result["ANISOTROPY_MAG"].values,
                        n_direction_bins=n_bins,
                        n_depth_sections=n_sections,
                        scale_factor=500.0,
                    )
                    st.plotly_chart(fig_3d, use_container_width=True)
            
            st.info("3D玫瑰花图说明: 每个深度段显示快横波的方向分布，红色越深表示各向异性越强")


def render_time_depth(well: WellData):
    st.header(f"⏱️ {well.well_name} - 时深转换")
    
    tab1, tab2 = st.tabs(["时深转换", "Checkshot标定"])
    
    with tab1:
        st.subheader("深度域 → 时间域转换")
        
        col1, col2 = st.columns(2)
        with col1:
            time_step = st.number_input("时间采样间隔 (s)", value=0.001, min_value=0.0001, max_value=0.01, format="%.4f")
        with col2:
            max_time = st.number_input("最大时间 (s, 0=自动)", value=0.0, min_value=0.0)
        
        if st.button("执行时深转换", key="do_tdc"):
            try:
                with st.spinner("转换中..."):
                    result = convert_well_to_time_domain(well, time_step=time_step, max_time=max_time if max_time > 0 else None)
                    st.session_state.time_domain_results[well.well_name] = result
                    st.success("时深转换完成!")
            except Exception as e:
                st.error(f"转换失败: {str(e)}")
        
        if well.well_name in st.session_state.time_domain_results:
            result = st.session_state.time_domain_results[well.well_name]
            
            col1, col2 = st.columns(2)
            with col1:
                st.dataframe(result.head(20), use_container_width=True)
            with col2:
                st.subheader("时深关系曲线")
                fig = create_crossplot(
                    result["DEPTH"].values,
                    result["TWT"].values,
                    color_data=result["V_AVG"].values,
                    x_label="深度 (m)",
                    y_label="双程旅行时间 (s)",
                    color_label="平均速度 (m/s)",
                    title="时深关系曲线",
                )
                fig.update_layout(yaxis_autorange="reversed")
                st.plotly_chart(fig, use_container_width=True)
            
            st.subheader("时间域测井曲线")
            time_well = WellData(well.well_name)
            time_well.df = result
            time_well.curves = list(result.columns)
            time_well.units = get_time_depth_units()
            
            tracks = [
                {"curves": ["DT", "DTS"], "title": "声波时差"},
                {"curves": ["RHOB"], "title": "体积密度"},
                {"curves": ["GR"], "title": "自然伽马"},
            ]
            
            valid_tracks = [t for t in tracks if all(c in result.columns for c in t["curves"])]
            if valid_tracks:
                fig = create_log_plot(time_well, valid_tracks, height=600)
                fig.update_layout(yaxis_title="双程旅行时间 (s)")
                st.plotly_chart(fig, use_container_width=True)
    
    with tab2:
        st.subheader("Checkshot时深标定")
        
        st.info("请输入Checkshot数据点（深度，双程旅行时间）")
        
        n_points = st.number_input("Checkshot点数", value=3, min_value=1, max_value=10)
        checkshots = []
        
        for i in range(n_points):
            col1, col2 = st.columns(2)
            with col1:
                depth = st.number_input(f"深度 {i+1} (m)", value=1000.0 + i * 500, key=f"cs_depth_{i}")
            with col2:
                twt = st.number_input(f"双程时间 {i+1} (s)", value=0.6 + i * 0.3, key=f"cs_twt_{i}")
            checkshots.append((depth, twt))
        
        if st.button("进行时深标定", key="do_checkshot"):
            try:
                with st.spinner("标定中..."):
                    result = create_checkshot_calibration(well, checkshots)
                    st.success("时深标定完成!")
                    
                    fig = create_crossplot(
                        result["DEPTH"].values,
                        result["TWT_CALC"].values,
                        x_label="深度 (m)",
                        y_label="双程旅行时间 (s)",
                        title="时深标定结果",
                    )
                    
                    fig.add_trace(
                        create_crossplot(
                            result["DEPTH"].values,
                            result["TWT_CALIBRATED"].values,
                            x_label="",
                            y_label="",
                            title="",
                        ).data[0].update(line=dict(color='red'))
                    )
                    
                    cs_depths = [cs[0] for cs in checkshots]
                    cs_times = [cs[1] for cs in checkshots]
                    fig.add_trace(
                        create_crossplot(
                            np.array(cs_depths),
                            np.array(cs_times),
                            x_label="",
                            y_label="",
                            title="",
                        ).data[0].update(mode='markers', marker=dict(size=10, color='green', symbol='x'))
                    )
                    
                    fig.update_layout(showlegend=True)
                    st.plotly_chart(fig, use_container_width=True)
                    
                    st.dataframe(result.head(20), use_container_width=True)
                    
            except Exception as e:
                st.error(f"标定失败: {str(e)}")


def render_export(well: WellData):
    st.header(f"📤 {well.well_name} - 数据导出")
    
    export_data = {}
    
    if well.df is not None:
        export_data["原始数据"] = well.df
    
    if well.well_name in st.session_state.elastic_results:
        export_data["弹性参数"] = st.session_state.elastic_results[well.well_name]
    
    if well.well_name in st.session_state.porosity_results:
        export_data["孔隙度"] = st.session_state.porosity_results[well.well_name]
    
    if well.well_name in st.session_state.brittleness_results:
        export_data["脆性指数"] = st.session_state.brittleness_results[well.well_name]
    
    if well.well_name in st.session_state.lithology_results:
        litho_df = st.session_state.lithology_results[well.well_name]
        export_data["岩性判别"] = litho_df
        
        st.subheader("岩性解释成果表")
        display_cols = ["DEPTH", "LITHOLOGY", "CONFIDENCE"]
        if "PHI_COMBINED" in st.session_state.porosity_results.get(well.well_name, pd.DataFrame()).columns:
            litho_df["PHI_COMBINED"] = st.session_state.porosity_results[well.well_name]["PHI_COMBINED"].values
            display_cols.append("PHI_COMBINED")
        if "BRITTLENESS" in st.session_state.brittleness_results.get(well.well_name, pd.DataFrame()).columns:
            litho_df["BRITTLENESS"] = st.session_state.brittleness_results[well.well_name]["BRITTLENESS"].values
            display_cols.append("BRITTLENESS")
        
        st.dataframe(litho_df[display_cols].head(50), use_container_width=True)
    
    if well.well_name in st.session_state.fracture_results:
        export_data["裂缝识别"] = st.session_state.fracture_results[well.well_name]
    
    if well.well_name in st.session_state.time_domain_results:
        export_data["时间域数据"] = st.session_state.time_domain_results[well.well_name]
    
    if export_data:
        st.subheader("导出Excel")
        
        selected_sheets = st.multiselect("选择导出的Sheet", list(export_data.keys()), default=list(export_data.keys()))
        
        if selected_sheets:
            export_dict = {k: v for k, v in export_data.items() if k in selected_sheets}
            excel_bytes = export_to_excel(export_dict)
            
            st.download_button(
                label="📥 下载Excel文件",
                data=excel_bytes,
                file_name=f"{well.well_name}_解释成果.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        
        st.markdown("---")
        st.subheader("生成PDF解释报告")
        
        lithology_stats = {}
        if well.well_name in st.session_state.lithology_results:
            litho_df = st.session_state.lithology_results[well.well_name]
            depths = litho_df["DEPTH"].values
            total_thickness = depths.max() - depths.min()
            
            for litho in litho_df["LITHOLOGY"].unique():
                mask = litho_df["LITHOLOGY"] == litho
                litho_depths = depths[mask]
                if len(litho_depths) > 1:
                    thickness = litho_depths.max() - litho_depths.min()
                    lithology_stats[litho] = {
                        "thickness": thickness,
                        "percentage": thickness / total_thickness * 100 if total_thickness > 0 else 0,
                    }
        
        porosity_stats = {}
        if well.well_name in st.session_state.porosity_results:
            phi_df = st.session_state.porosity_results[well.well_name]
            if "PHI_COMBINED" in phi_df.columns:
                phi_vals = phi_df["PHI_COMBINED"].dropna().values
                if len(phi_vals) > 0:
                    porosity_stats = {
                        "min": float(phi_vals.min()),
                        "max": float(phi_vals.max()),
                        "mean": float(phi_vals.mean()),
                    }
            elif "PHI_WYLLIE" in phi_df.columns:
                phi_vals = phi_df["PHI_WYLLIE"].dropna().values
                if len(phi_vals) > 0:
                    porosity_stats = {
                        "min": float(phi_vals.min()),
                        "max": float(phi_vals.max()),
                        "mean": float(phi_vals.mean()),
                    }
        
        brittleness_stats = {}
        if well.well_name in st.session_state.brittleness_results:
            brit_df = st.session_state.brittleness_results[well.well_name]
            brit_vals = brit_df["BRITTLENESS"].dropna().values
            if len(brit_vals) > 0:
                brittleness_stats = {
                    "min": float(brit_vals.min()),
                    "max": float(brit_vals.max()),
                    "mean": float(brit_vals.mean()),
                }
        
        fracture_zones = []
        if well.well_name in st.session_state.fracture_results:
            frac_df = st.session_state.fracture_results[well.well_name]
            depths = frac_df["DEPTH"].values
            flags = frac_df["FRACTURE_FLAG"].values
            
            in_zone = False
            zone_start = 0
            for i, (d, f) in enumerate(zip(depths, flags)):
                if f == 1 and not in_zone:
                    in_zone = True
                    zone_start = d
                    zone_level = frac_df["FRACTURE_LEVEL"].iloc[i]
                elif f == 0 and in_zone:
                    in_zone = False
                    zone_end = depths[i - 1] if i > 0 else d
                    fracture_zones.append({
                        "top": zone_start,
                        "bottom": zone_end,
                        "thickness": zone_end - zone_start,
                        "level": zone_level,
                    })
            if in_zone:
                fracture_zones.append({
                    "top": zone_start,
                    "bottom": depths[-1],
                    "thickness": depths[-1] - zone_start,
                    "level": zone_level,
                })
        
        if st.button("📄 生成PDF报告", key="gen_pdf"):
            try:
                with st.spinner("生成报告中..."):
                    depths = well.get_depth()
                    depth_range = (depths.min(), depths.max()) if depths is not None else (0, 0)
                    
                    pdf_bytes = create_interpretation_report(
                        well.well_name,
                        depth_range,
                        lithology_stats,
                        porosity_stats,
                        brittleness_stats,
                        fracture_zones,
                    )
                    
                    st.download_button(
                        label="📥 下载PDF报告",
                        data=pdf_bytes,
                        file_name=f"{well.well_name}_测井解释报告.pdf",
                        mime="application/pdf",
                    )
                    st.success("PDF报告生成成功!")
            except Exception as e:
                st.error(f"生成PDF失败: {str(e)}")
    else:
        st.info("请先加载数据并进行处理后再导出")


def main():
    init_session_state()
    
    render_sidebar()
    
    current_well = get_current_well()
    
    if current_well is None:
        st.title("📊 声波测井数据可视化解释平台")
        st.markdown("---")
        st.info("👈 请在左侧边栏上传LAS文件或加载示例数据")
        
        st.subheader("平台功能概览")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.markdown("### 📁 数据加载")
            st.write("- 支持LAS文件格式")
            st.write("- 多井数据管理")
            st.write("- 示例数据快速体验")
        
        with col2:
            st.markdown("### ⚙️ 数据处理")
            st.write("- 弹性参数计算")
            st.write("- 孔隙度预测")
            st.write("- 脆性指数计算")
            st.write("- 岩性自动判别")
            st.write("- 裂缝识别")
        
        with col3:
            st.markdown("### 📈 可视化")
            st.write("- 综合测井曲线图")
            st.write("- 纵横波交会图")
            st.write("- 3D井轨迹")
            st.write("- 多井对比")
            st.write("- 时深转换")
        
        st.markdown("---")
        st.subheader("多井对比 & 时深转换")
        st.write("- **多井对比**: 同井场2-4口井平行对比曲线")
        st.write("- **时深转换**: 深度域到时域转换，Checkshot标定")
        st.write("- **横波各向异性**: Alford旋转求取快慢横波，3D玫瑰花图")
        st.write("- **深度学习岩相预测**: LSTM/Transformer序列模型，与传统方法对比")
        st.write("- **数据导出**: Excel成果表 + PDF解释报告")
        
        return
    
    page = st.sidebar.radio(
        "导航",
        ["📋 数据概览", "⚙️ 数据处理", "📈 可视化", "⏱️ 时深转换", "📤 数据导出"],
        key="main_nav"
    )
    
    if page == "📋 数据概览":
        render_data_overview(current_well)
    elif page == "⚙️ 数据处理":
        render_processing(current_well)
    elif page == "📈 可视化":
        render_visualization(current_well)
    elif page == "⏱️ 时深转换":
        render_time_depth(current_well)
    elif page == "📤 数据导出":
        render_export(current_well)
