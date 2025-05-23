#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
实时负载预测与资源管理 - 高级建模 (main3.py)

本脚本将使用扩展特征集实现更先进的预测模型。基于处理过的数据，我们将探索更复杂的特征工程和模型架构。
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
from sklearn.model_selection import train_test_split, TimeSeriesSplit, GridSearchCV
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import xgboost as xgb

# 设置可视化样式
plt.style.use('ggplot')
sns.set(style="whitegrid")

# 设置pandas显示选项
pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', 100)
pd.set_option('display.width', 1000)


# 1. 数据加载与探索
def load_and_explore_data(data_path):
    """加载并探索数据集"""
    print(f"加载数据: {data_path}")
    
    try:
        df = pd.read_csv(data_path)
        print(f"成功读取数据，形状: {df.shape}")
        
        # 显示前几行数据
        print("\n数据预览:")
        print(df.head())
        
        # 查看基本信息
        print("\n数据信息:")
        df.info()
        
        # 检查缺失值
        missing_values = df.isnull().sum()
        missing_percentage = (missing_values / len(df)) * 100
        
        missing_df = pd.DataFrame({
            '缺失值数量': missing_values,
            '缺失百分比': missing_percentage
        }).sort_values('缺失百分比', ascending=False)
        
        print("\n缺失值情况:")
        print(missing_df[missing_df['缺失值数量'] > 0])
        
        return df
    
    except Exception as e:
        print(f"读取数据时出错: {e}")
        return None


# 2. 时间特征处理
def process_time_features(df):
    """处理和转换时间特征"""
    print("\n处理时间特征...")
    
    # 检查并转换时间特征
    time_columns = [col for col in df.columns if 'time' in col.lower() and 'dt' not in col.lower()]
    print(f"时间相关列: {time_columns}")
    
    for col in time_columns:
        if col in df.columns:
            if df[col].dtype == 'int64' or df[col].dtype == 'float64':
                df[f'{col}_dt'] = pd.to_datetime(df[col], unit='us')
                print(f"转换列 {col} 为日期时间格式")
    
    # 确保有时间序列索引
    if 'time_dt' in df.columns:
        df = df.sort_values('time_dt').reset_index(drop=True)
        print("已按时间排序数据")
    
    return df


# 3. 特征工程
def create_time_features(df):
    """从时间列创建丰富的时间特征"""
    print("\n创建时间特征...")
    
    if 'time_dt' not in df.columns:
        print("列 time_dt 不存在，无法创建时间特征")
        return df
    
    # 从datetime创建特征
    df['hour_of_day'] = df['time_dt'].dt.hour
    df['day_of_week'] = df['time_dt'].dt.dayofweek
    df['day_of_month'] = df['time_dt'].dt.day
    df['month'] = df['time_dt'].dt.month
    
    # 创建周末指标 (0=工作日, 1=周末)
    df['is_weekend'] = df['day_of_week'].apply(lambda x: 1 if x >= 5 else 0)
    
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
    
    df['day_part'] = df['hour_of_day'].apply(get_day_part)
    
    # 对时段进行独热编码
    df = pd.get_dummies(df, columns=['day_part'], prefix='day_part')
    
    # 创建小时和日期的周期性特征（正弦和余弦变换）
    df['hour_sin'] = np.sin(2 * np.pi * df['hour_of_day'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour_of_day'] / 24)
    df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    print("时间特征创建完成")
    return df


def create_lag_features(df, target_cols, lag_periods=[1, 3, 6, 12, 24]):
    """为目标列创建滞后特征"""
    print("\n创建滞后特征...")
    
    # 为每个目标列和每个滞后周期创建特征
    for target in target_cols:
        for lag in lag_periods:
            # 创建滞后特征
            df[f'{target}_lag_{lag}'] = df[target].shift(lag)
    
    print("滞后特征创建完成")
    return df


def create_rolling_features(df, target_cols, windows=[3, 6, 12, 24]):
    """为目标列创建滚动窗口统计特征"""
    print("\n创建滚动窗口特征...")
    
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
    
    print("滚动窗口特征创建完成")
    return df


def prepare_data_for_modeling(df, target_vars):
    """准备模型训练数据"""
    print("\n准备模型训练数据...")
    
    # 处理缺失值
    print("处理缺失值...")
    for col in df.columns:
        if df[col].isnull().sum() > 0:
            if df[col].dtype in ['int64', 'float64']:
                # 数值型列用中位数填充
                df[col] = df[col].fillna(df[col].median())
            else:
                # 非数值型列用众数填充
                df[col] = df[col].fillna(df[col].mode()[0])
    
    # 删除无用列
    cols_to_drop = []
    
    # 删除高基数ID列
    id_cols = [col for col in df.columns if 'id' in col.lower() or 'name' in col.lower() or 'user' in col.lower()]
    cols_to_drop.extend(id_cols)
    
    # 删除原始时间戳列（保留转换后的dt列）
    timestamp_cols = [col for col in df.columns if ('time' in col.lower() and 'dt' not in col.lower())]
    cols_to_drop.extend(timestamp_cols)
    
    # 排除目标变量
    cols_to_drop = [col for col in cols_to_drop if col not in target_vars]
    
    # 删除全是NaN的列
    null_cols = df.columns[df.isnull().all()].tolist()
    cols_to_drop.extend(null_cols)
    
    # 删除列
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors='ignore')
    print(f"删除了 {len(cols_to_drop)} 列")
    
    # 将分类变量转换为数值
    object_cols = df.select_dtypes(include=['object']).columns
    for col in object_cols:
        if col not in target_vars:  # 不转换目标变量
            # 对分类变量进行标签编码
            df[col] = pd.factorize(df[col])[0]
    
    print("数据准备完成")
    return df


# 4. 模型构建与评估
def evaluate_models(df, target_var, test_size=0.2, random_state=42):
    """构建和评估多种预测模型"""
    print(f"\n为 {target_var} 评估预测模型...")
    
    # 准备特征和目标
    y = df[target_var]
    X = df.drop(columns=[col for col in df.columns if col in [target_var] or col.startswith('time_')])
    
    print(f"特征数量: {X.shape[1]}")
    print(f"样本数量: {X.shape[0]}")
    
    # 创建训练集和测试集 (时间序列分割)
    # 为确保我们不用未来数据预测过去，使用最后test_size比例的数据作为测试集
    split_idx = int(len(X) * (1 - test_size))
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    print(f"训练集形状: {X_train.shape}, 测试集形状: {X_test.shape}")
    
    # 特征标准化
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # 模型结果存储
    model_results = []
    
    # 1. XGBoost
    print("\n训练XGBoost...")
    xgb_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=random_state)
    xgb_model.fit(X_train_scaled, y_train)
    
    # 预测
    xgb_preds = xgb_model.predict(X_test_scaled)
    
    # 评估
    rmse = np.sqrt(mean_squared_error(y_test, xgb_preds))
    mae = mean_absolute_error(y_test, xgb_preds)
    r2 = r2_score(y_test, xgb_preds)
    
    print(f"XGBoost - RMSE: {rmse:.6f}, MAE: {mae:.6f}, R²: {r2:.6f}")
    model_results.append({"model": "XGBoost", "rmse": rmse, "mae": mae, "r2": r2})
    
    # 汇总结果
    results_df = pd.DataFrame(model_results)
    results_df = results_df.sort_values('rmse')
    
    print("\n模型性能汇总:")
    print(results_df)
    
    # 返回最佳模型和评估结果
    return results_df, feature_importance

# 主函数
def main():
    """主函数"""
    print("开始高级负载预测建模...")
    
    # 1. 加载数据
    data_path = '../processed_data/c7_user_DrrEIEW_timeseries.csv'
    df = load_and_explore_data(data_path)
    
    if df is None:
        print("无法加载数据，程序终止")
        return
    
    # 2. 时间特征处理
    df = process_time_features(df)
    
    # 3. 定义目标变量
    target_vars = ['average_usage_cpu', 'average_usage_memory']
    target_vars = [var for var in target_vars if var in df.columns]
    
    if not target_vars:
        print("未找到目标变量，程序终止")
        return
    
    print(f"目标变量: {target_vars}")
    
    # 4. 特征工程
    df = create_time_features(df)
    df = create_lag_features(df, target_vars)
    df = create_rolling_features(df, target_vars)
    
    # 5. 准备建模数据
    df = prepare_data_for_modeling(df, target_vars)
    
    # 6. 为每个目标变量构建模型
    for target_var in target_vars:
        # 过滤掉含有NaN的行
        df_clean = df.dropna(subset=[target_var])
        
        # 过滤掉其他目标变量的滞后特征
        other_targets = [t for t in target_vars if t != target_var]
        cols_to_drop = []
        for other_target in other_targets:
            cols_to_drop.extend([col for col in df_clean.columns if col.startswith(f"{other_target}_lag_")])
            cols_to_drop.extend([col for col in df_clean.columns if col.startswith(f"{other_target}_rolling_")])
        
        df_model = df_clean.drop(columns=cols_to_drop, errors='ignore')
        
        # 构建和评估模型
        evaluate_models(df_model, target_var)
        
    
    print("建模完成！")


if __name__ == "__main__":
    main()