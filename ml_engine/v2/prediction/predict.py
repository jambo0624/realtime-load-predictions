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

# 加载模型和scaler
try:
    xgb_model = joblib.load('../models/xgb_model_colab.pkl')
    scaler = joblib.load('../models/scaler_colab.pkl')
    print("成功加载模型和scaler")
except FileNotFoundError as e:
    print(f"错误: 无法找到模型文件: {e}")
    exit(1)

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
def create_time_features(df, time_col='time_dt'):
    """从时间列创建丰富的时间特征"""
    print("\n创建时间特征...")
    
    # 确保列存在
    if time_col not in df.columns:
        print(f"列 {time_col} 不存在")
        return df
    
    # 复制数据框以避免修改原始数据
    df_new = df.copy()
    
    # 确保时间列是datetime类型
    df_new[time_col] = pd.to_datetime(df_new[time_col])
    print(f"转换 {time_col} 为datetime类型")
    
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


def create_utilization_features(df):
    """创建资源使用率特征"""
    print("\n创建资源使用率特征...")
    
    # 检查必要的列是否存在
    if 'resource_request_cpu' in df.columns and 'average_usage_cpu' in df.columns:
        # CPU使用率 = 实际使用 / 请求资源
        df['cpu_utilization_ratio'] = df['average_usage_cpu'] / df['resource_request_cpu']
        # 处理无穷值
        df['cpu_utilization_ratio'] = df['cpu_utilization_ratio'].replace([np.inf, -np.inf], np.nan)
        # 上限为1（100%利用率）
        df['cpu_utilization_ratio'] = df['cpu_utilization_ratio'].clip(upper=1.0)
        print("创建了CPU使用率特征")
    
    if 'resource_request_memory' in df.columns and 'average_usage_memory' in df.columns:
        # 内存使用率 = 实际使用 / 请求资源
        df['memory_utilization_ratio'] = df['average_usage_memory'] / df['resource_request_memory']
        # 处理无穷值
        df['memory_utilization_ratio'] = df['memory_utilization_ratio'].replace([np.inf, -np.inf], np.nan)
        # 上限为1（100%利用率）
        df['memory_utilization_ratio'] = df['memory_utilization_ratio'].clip(upper=1.0)
        print("创建了内存使用率特征")
    
    # 资源效率比率（如果CPU和内存指标都存在）
    if 'cpu_utilization_ratio' in df.columns and 'memory_utilization_ratio' in df.columns:
        # 资源平衡指标（接近1表示CPU和内存使用平衡）
        df['resource_balance_ratio'] = df['cpu_utilization_ratio'] / df['memory_utilization_ratio']
        # 处理无穷值
        df['resource_balance_ratio'] = df['resource_balance_ratio'].replace([np.inf, -np.inf], np.nan)
        print("创建了资源平衡比率特征")
    
    print("资源使用率特征创建完成")
    return df


def process_task_features(df):
    """处理任务特性特征"""
    print("\n处理任务特性特征...")
    
    task_features = ['priority', 'scheduling_class', 'collection_type', 'vertical_scaling', 'instance_index', 'failed']
    task_features = [col for col in task_features if col in df.columns]
    
    if task_features:
        print(f"发现任务特性特征: {task_features}")
        
        # 对分类特征进行独热编码
        categorical_features = []
        for col in task_features:
            if df[col].dtype == 'object' or df[col].nunique() < 10:  # 分类特征判断条件
                categorical_features.append(col)
        
        if categorical_features:
            print(f"将进行独热编码的分类特征: {categorical_features}")
            df = pd.get_dummies(df, columns=categorical_features, prefix=categorical_features)
    else:
        print("未找到任务特性特征")
    
    print("任务特性特征处理完成")
    return df


def process_efficiency_metrics(df):
    """处理CPU和内存效率指标"""
    print("\n处理效率指标特征...")
    
    efficiency_features = ['cycles_per_instruction', 'memory_accesses_per_instruction',
                          'assigned_memory', 'page_cache_memory']
    efficiency_features = [col for col in efficiency_features if col in df.columns]
    
    if efficiency_features:
        print(f"发现效率指标特征: {efficiency_features}")
        
        # 检查这些特征的缺失情况
        missing = df[efficiency_features].isnull().sum()
        missing_pct = (missing / len(df)) * 100
        
        for col, miss, pct in zip(efficiency_features, missing, missing_pct):
            print(f"{col}: {miss} 缺失值 ({pct:.2f}%)")
            
            # 如果缺失值不太多，使用中位数填充
            if pct < 50:
                median_val = df[col].median()
                df[col] = df[col].fillna(median_val)
                print(f"  - 使用中位数 {median_val:.6f} 填充缺失值")
        
        # 创建新的复合效率指标
        if 'cycles_per_instruction' in df.columns and 'memory_accesses_per_instruction' in df.columns:
            # 计算计算密集型指标 (高CPI, 低MAI意味着计算密集)
            df['compute_intensity'] = df['cycles_per_instruction'] / (df['memory_accesses_per_instruction'] + 0.001)
            print("已创建计算密集型指标")
            
        if 'assigned_memory' in df.columns and 'page_cache_memory' in df.columns:
            # 计算缓存使用比例
            df['cache_ratio'] = df['page_cache_memory'] / (df['assigned_memory'] + 0.0001)
            print("已创建缓存使用比例")
    else:
        print("未找到效率指标特征")
    
    print("效率指标特征处理完成")
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

def predict_with_xgb(df, feature_cols):
    """使用XGBoost模型进行预测"""
    try:
        xgb_model = globals()['xgb_model']
        scaler = globals()['scaler']
        # 验证模型和scaler是否成功加载
        if xgb_model is None:
            print("错误: 模型未成功加载，无法进行预测")
            return None
            
        if scaler is None:
            print("错误: scaler未成功加载，无法进行预测")
            return None
            
        # 检查特征列是否存在
        if isinstance(feature_cols, str):
            feature_cols = [feature_cols]  # 如果是单个字符串，转为列表
            
        print(f"使用特征 {len(feature_cols)} 个特征进行预测")
        X = df[feature_cols]
        
        # 处理特征不匹配问题
        # 1. 获取scaler期望的特征列
        if hasattr(scaler, 'feature_names_in_'):
            expected_features = scaler.feature_names_in_
        else:
            print("警告: scaler没有feature_names_in_属性，无法确定期望的特征列")
            expected_features = feature_cols
            
        print(f"模型期望的特征数量: {len(expected_features)}")
        
        # 2. 确保X的列与expected_features匹配
        # 移除多余的特征
        X_subset = X.copy()
        extra_cols = [col for col in X_subset.columns if col not in expected_features]
        if extra_cols:
            print(f"警告: 移除了 {len(extra_cols)} 个训练时未见过的特征: {extra_cols}")
            X_subset = X_subset.drop(columns=extra_cols)
        
        # 添加缺失的特征
        missing_cols = [col for col in expected_features if col not in X_subset.columns]
        if missing_cols:
            print(f"警告: 添加了 {len(missing_cols)} 个缺失的特征: {missing_cols}, 并用0填充")
            for col in missing_cols:
                X_subset[col] = 0
                
        # 确保列顺序与训练时一致
        X_subset = X_subset[expected_features]
        
        print(f"调整后的特征形状: {X_subset.shape}")
        
        # 检查数据维度
        if len(X_subset.shape) == 1:
            X_subset = X_subset.values.reshape(-1, 1)
            print("已将输入数据重塑为2D数组")
            
        X_scaled = scaler.transform(X_subset)
        y_pred = xgb_model.predict(X_scaled)
        print(f"成功生成 {len(y_pred)} 个预测")
        return y_pred
    except Exception as e:
        print(f"预测过程中出错: {e}")
        import traceback
        traceback.print_exc()  # 打印详细错误信息
        return None

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
    df = create_utilization_features(df)
    df = process_task_features(df)
    df = process_efficiency_metrics(df)
    
    # 5. 准备建模数据
    df = prepare_data_for_modeling(df, target_vars)
    
    output_dir = "../prediction_results"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"创建输出目录: {output_dir}")

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

        # 获取所有特征列（排除目标变量）
        feature_cols = [col for col in df_model.columns if col != target_var]
        print(f"使用 {len(feature_cols)} 个特征列进行预测")

        # 正确调用预测函数
        predictions = predict_with_xgb(df_model, feature_cols)

        df.to_csv(f'prediction_results/prediction_{target_var}_result.csv', index=False)
    
    print("预测完成！")


if __name__ == "__main__":
    main()