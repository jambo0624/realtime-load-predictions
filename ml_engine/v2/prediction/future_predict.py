#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
实时负载预测 - 未来时间预测 (future-predict.py)

本脚本使用训练好的XGBoost模型预测未来时间点的负载值。与已有预测不同，
这里将创建未来时间点的数据框架，并递归地生成预测。
"""

# 导入必要的库
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import os
import joblib
import warnings
warnings.filterwarnings('ignore')

# 机器学习库
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score
import xgboost as xgb

# 设置可视化样式
plt.style.use('ggplot')
sns.set(style="whitegrid")
plt.rcParams['figure.figsize'] = (14, 8)
plt.rcParams['font.size'] = 12

# 设置pandas显示选项
pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', 20)
pd.set_option('display.width', 1000)

# 全局变量初始化
xgb_model = None
scaler = None

# 1. 加载模型和数据
def load_model_and_scaler(model_path, scaler_path):
    """加载XGBoost模型和scaler"""
    global xgb_model, scaler
    
    try:
        xgb_model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        print("成功加载模型和scaler")
        print(f"模型类型: {type(xgb_model)}")
        print(f"Scaler类型: {type(scaler)}")
        
        # 验证模型是否包含特征信息
        if hasattr(scaler, 'feature_names_in_'):
            print(f"Scaler期望的特征数量: {len(scaler.feature_names_in_)}")
            print(f"前几个特征: {list(scaler.feature_names_in_)[:5]}")
        else:
            print("警告: scaler没有feature_names_in_属性")
        
        return True
    except FileNotFoundError as e:
        print(f"错误: 无法找到模型文件: {e}")
        return False
    except Exception as e:
        print(f"加载模型时出错: {e}")
        return False

def load_data(data_path):
    """加载最近预测数据作为未来预测的起点"""
    try:
        df = pd.read_csv(data_path)
        print(f"成功加载数据，形状: {df.shape}")
        print(f"列数量: {len(df.columns)}")
        
        # 确保时间列是datetime类型
        time_col = 'time_dt'
        if time_col in df.columns:
            df[time_col] = pd.to_datetime(df[time_col])
            
            # 查看最后一个时间点
            last_time = df[time_col].max()
            print(f"最后一个时间点: {last_time}")
        else:
            print(f"警告: 未找到时间列 '{time_col}'")
        
        return df
    except Exception as e:
        print(f"加载数据出错: {e}")
        return None

# 2. 特征工程函数
def create_time_features(df, time_col='time_dt'):
    """从时间列创建丰富的时间特征"""
    # 确保列存在
    if time_col not in df.columns:
        print(f"列 {time_col} 不存在")
        return df
    
    # 复制数据框以避免修改原始数据
    df_new = df.copy()
    
    # 确保时间列是datetime类型
    df_new[time_col] = pd.to_datetime(df_new[time_col])
    
    # 从datetime创建特征
    df_new['hour_of_day'] = df_new[time_col].dt.hour
    df_new['day_of_week'] = df_new[time_col].dt.dayofweek
    df_new['day_of_month'] = df_new[time_col].dt.day
    df_new['month'] = df_new[time_col].dt.month
    
    # 创建周末指标 (0=工作日, 1=周末)
    df_new['is_weekend'] = df_new['day_of_week'].apply(lambda x: 1 if x >= 5 else 0)
    
    # 创建一天中的时段分类
    def get_day_part(hour):
        if 5 <= hour < 12:
            return 'morning'
        elif 12 <= hour < 17:
            return 'afternoon'
        elif 17 <= hour < 22:
            return 'evening'
        else:
            return 'night'
    
    df_new['day_part'] = df_new['hour_of_day'].apply(get_day_part)
    
    # 对时段进行独热编码
    df_new = pd.get_dummies(df_new, columns=['day_part'], prefix='day_part')
    
    # 创建小时和日期的周期性特征（正弦和余弦变换）
    df_new['hour_sin'] = np.sin(2 * np.pi * df_new['hour_of_day'] / 24)
    df_new['hour_cos'] = np.cos(2 * np.pi * df_new['hour_of_day'] / 24)
    df_new['day_sin'] = np.sin(2 * np.pi * df_new['day_of_week'] / 7)
    df_new['day_cos'] = np.cos(2 * np.pi * df_new['day_of_week'] / 7)
    
    return df_new

def create_lag_features(df, target_cols, lag_periods=[1, 3, 6, 12, 24]):
    """为目标列创建滞后特征"""
    # 确保target_cols是列表
    if isinstance(target_cols, str):
        target_cols = [target_cols]
    
    # 为每个目标列和每个滞后周期创建特征
    for target in target_cols:
        for lag in lag_periods:
            # 创建滞后特征
            df[f'{target}_lag_{lag}'] = df[target].shift(lag)
    
    return df

def create_rolling_features(df, target_cols, windows=[3, 6, 12, 24]):
    """为目标列创建滚动窗口统计特征"""
    # 确保target_cols是列表
    if isinstance(target_cols, str):
        target_cols = [target_cols]
    
    # 为每个目标列和每个窗口创建特征
    for target in target_cols:
        for window in windows:
            # 创建滚动平均值
            df[f'{target}_rolling_mean_{window}'] = df[target].rolling(window=window, min_periods=1).mean()
            # 创建滚动标准差
            df[f'{target}_rolling_std_{window}'] = df[target].rolling(window=window, min_periods=1).std()
            # 创建滚动最小值和最大值
            df[f'{target}_rolling_min_{window}'] = df[target].rolling(window=window, min_periods=1).min()
            df[f'{target}_rolling_max_{window}'] = df[target].rolling(window=window, min_periods=1).max()
    
    return df

# 3. 未来时间点预测函数
def create_future_timepoints(df, future_periods=24, time_col='time_dt'):
    """基于历史数据创建未来时间点"""
    # 确保时间列存在且有足够数据
    if time_col not in df.columns or len(df) <= 1:
        print(f"错误: 缺少时间列 '{time_col}' 或数据不足")
        return None
    
    # 计算平均时间间隔
    df[time_col] = pd.to_datetime(df[time_col])
    time_diffs = df[time_col].diff().dropna()
    avg_interval = time_diffs.mean()
    print(f"平均时间间隔: {avg_interval}")
    
    # 创建未来时间点
    last_time = df[time_col].max()
    future_times = [last_time + (i+1) * avg_interval for i in range(future_periods)]
    
    # 创建未来数据框架
    future_df = pd.DataFrame({time_col: future_times})
    print(f"创建了包含 {len(future_df)} 个未来时间点的数据框架")
    
    return future_df

def predict_future_values(historical_df, future_df, target_var):
    """递归地预测未来值"""
    global xgb_model, scaler
    
    if xgb_model is None or scaler is None:
        print("错误: 模型或scaler未加载，无法进行预测")
        return None
    
    # 获取历史数据的副本
    working_df = historical_df.copy()
    
    # 确保时间列是日期时间类型
    time_col = 'time_dt'
    working_df[time_col] = pd.to_datetime(working_df[time_col])
    future_df[time_col] = pd.to_datetime(future_df[time_col])
    
    # 确保索引是唯一的
    working_df = working_df.reset_index(drop=True)
    
    # 检查并删除重复的行
    if working_df.duplicated().any():
        print(f"发现 {working_df.duplicated().sum()} 行重复数据，正在删除...")
        working_df = working_df.drop_duplicates().reset_index(drop=True)
    
    # 按时间排序
    working_df = working_df.sort_values(time_col).reset_index(drop=True)
    
    # 创建基础特征
    working_df = create_time_features(working_df, time_col)
    
    # 创建目标变量的滞后和滚动特征
    working_df = create_lag_features(working_df, target_var)
    working_df = create_rolling_features(working_df, target_var)
    
    # 获取scaler中的特征名称（按照训练时的顺序）
    if hasattr(scaler, 'feature_names_in_'):
        expected_features = list(scaler.feature_names_in_)
        print(f"模型期望的特征数量: {len(expected_features)}")
    else:
        print("警告: scaler没有feature_names_in_属性，使用所有非时间和目标列作为特征")
        expected_features = [col for col in working_df.columns 
                           if col != time_col and col != target_var 
                           and not col.endswith('_predicted')]
    
    # 存储预测结果
    future_predictions = []
    
    # 为每个未来时间点生成预测
    for i, future_time in enumerate(future_df[time_col]):
        print(f"\n预测时间点 {i+1}/{len(future_df)}: {future_time}")
        
        # 创建新的数据行
        new_row = pd.DataFrame({time_col: [future_time]})
        
        # 添加时间特征
        new_row = create_time_features(new_row, time_col)
        
        # 直接使用loc添加新行，避免concat
        idx = len(working_df)
        working_df.loc[idx, time_col] = future_time
        
        # 复制新行的所有列到工作数据框
        for col in new_row.columns:
            if col in working_df.columns and col != time_col:
                working_df.loc[idx, col] = new_row[col].iloc[0]
        
        # 更新滞后特征
        working_df = create_lag_features(working_df, target_var)
        working_df = create_rolling_features(working_df, target_var)
        
        # 获取最后一行（当前预测的时间点）
        current_row = working_df.iloc[-1:].copy()
        
        # 创建特征数组
        feature_array = np.zeros((1, len(expected_features)))
        
        # 创建单行的特征数据
        for j, feature in enumerate(expected_features):
            if feature in current_row.columns:
                try:
                    value = current_row[feature].iloc[0]
                    
                    # 尝试转换为数值类型
                    if isinstance(value, (list, tuple, np.ndarray, pd.Series)):
                        print(f"将序列类型特征 {feature} 转换为其第一个值")
                        if len(value) > 0:
                            value = float(value[0])
                        else:
                            value = 0.0
                    elif isinstance(value, str):
                        print(f"将字符串特征 {feature} 转换为数字0")
                        value = 0.0
                    elif pd.isna(value):
                        print(f"将NaN特征 {feature} 转换为数字0")
                        value = 0.0
                    else:
                        value = float(value)
                    
                    feature_array[0, j] = value
                except Exception as e:
                    print(f"处理特征 {feature} 时出错: {e}, 使用0替代")
                    feature_array[0, j] = 0.0
            else:
                print(f"添加缺失特征: {feature}")
                feature_array[0, j] = 0.0
        
        # 转换特征
        X_scaled = scaler.transform(feature_array)
        
        # 预测
        pred = xgb_model.predict(X_scaled)[0]
        print(f"预测值: {pred:.4f}")
        
        # 存储预测结果
        future_predictions.append(pred)
        
        # 更新工作数据框中的目标值
        working_df.loc[idx, target_var] = pred
    
    # 创建结果数据框
    result_df = future_df.copy()
    result_df[target_var] = future_predictions
    
    return result_df

# 4. 可视化函数
def plot_predictions(historical_df, future_df, target_var, time_col='time_dt'):
    """Visualize historical data and future predictions"""
    plt.figure(figsize=(16, 8))
    
    # Plot historical data
    plt.plot(historical_df[time_col], historical_df[target_var], 'b-', label='Historical Data', linewidth=2)
    
    # Plot future prediction data
    plt.plot(future_df[time_col], future_df[target_var], 'r--', label='Future Predictions', linewidth=2)
    
    # Mark the boundary point
    last_time = historical_df[time_col].max()
    plt.axvline(x=last_time, color='green', linestyle='--', label='Prediction Start Point')
    
    plt.title(f'{target_var} Future Load Predictions', fontsize=16)
    plt.xlabel('Time', fontsize=14)
    plt.ylabel('Load Value', fontsize=14)
    plt.legend(fontsize=12)
    plt.grid(True)
    plt.tight_layout()
    
    # Save the chart
    plt.savefig(f'{target_var}_future_prediction.png', dpi=300)
    plt.show()

def analyze_predictions(future_df, target_var, time_col='time_dt'):
    """Analyze prediction patterns across different time segments"""
    try:
        # Add time component analysis
        future_df['hour_of_day'] = future_df[time_col].dt.hour
        future_df['day_of_week'] = future_df[time_col].dt.dayofweek
        future_df['day_name'] = future_df[time_col].dt.day_name()
        
        # Analyze by hour
        hourly_avg = future_df.groupby('hour_of_day')[target_var].mean().reset_index()
        
        plt.figure(figsize=(12, 6))
        plt.bar(hourly_avg['hour_of_day'], hourly_avg[target_var], color='skyblue')
        plt.title(f'{target_var} Hourly Prediction Average', fontsize=16)
        plt.xlabel('Hour', fontsize=14)
        plt.ylabel('Average Load Value', fontsize=14)
        plt.xticks(range(0, 24))
        plt.grid(axis='y')
        plt.tight_layout()
        plt.savefig(f'{target_var}_hourly_pattern.png', dpi=300)
        plt.show()
        
        # Analyze by day of the week
        daily_avg = future_df.groupby(['day_of_week', 'day_name'])[target_var].mean().reset_index()
        daily_avg = daily_avg.sort_values('day_of_week')
        
        plt.figure(figsize=(12, 6))
        plt.bar(daily_avg['day_name'], daily_avg[target_var], color='lightgreen')
        plt.title(f'{target_var} Prediction Average by Day of the Week', fontsize=16)
        plt.xlabel('Day of the Week', fontsize=14)
        plt.ylabel('Average Load Value', fontsize=14)
        plt.grid(axis='y')
        plt.tight_layout()
        plt.savefig(f'{target_var}_daily_pattern.png', dpi=300)
        plt.show()
    except Exception as e:
        print(f"Error analyzing prediction patterns: {e}")

# 5. 主函数
def main():
    """主函数"""
    print("启动未来负载预测...")
    
    # 加载模型和scaler
    model_path = './models/xgb_model_colab.pkl'
    scaler_path = './models/scaler_colab.pkl'
    
    if not load_model_and_scaler(model_path, scaler_path):
        print("模型加载失败，程序终止")
        return
    
    # 设置要预测的目标变量
    target_var = 'average_usage_cpu'  # 或使用 'average_usage_memory'
    
    # 加载最近的预测结果数据作为起点
    data_path = f'prediction_{target_var}_result.csv'
    historical_df = load_data(data_path)
    
    if historical_df is None:
        print("无法加载历史数据，程序终止")
        return
    
    # 检查目标变量是否在数据中
    if target_var not in historical_df.columns:
        print(f"目标变量 '{target_var}' 不在数据集中，程序终止")
        return
    
    print(f"\n目标变量: {target_var}")
    
    # 创建未来时间点
    future_periods = 24  # 预测未来24个时间点
    future_df = create_future_timepoints(historical_df, future_periods)
    
    if future_df is None:
        print("无法创建未来时间点，程序终止")
        return
    
    output_dir = "../prediction_results"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"创建输出目录: {output_dir}")

    # 进行未来预测
    try:
        future_predictions = predict_future_values(
            historical_df=historical_df, 
            future_df=future_df, 
            target_var=target_var
        )
        
        if future_predictions is not None:
            print("\n未来预测完成!")
            print(future_predictions.head())
            
            # 保存预测结果
            output_path = f'../prediction_results/{target_var}_future_predictions.csv'
            future_predictions.to_csv(output_path, index=False)
            print(f"预测结果已保存到 {output_path}")
            
            # 可视化结果
            print("\n生成可视化...")
            # 获取最后一段历史数据
            last_n_rows = min(len(historical_df), future_periods * 2)  # 显示两倍预测长度的历史数据
            historical_subset = historical_df.sort_values('time_dt').tail(last_n_rows)
            
            # 绘制并保存图表
            plot_predictions(historical_subset, future_predictions, target_var)
            
            # 分析预测模式
            analyze_predictions(future_predictions, target_var)
            
    except Exception as e:
        import traceback
        print(f"预测过程中出错: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main() 