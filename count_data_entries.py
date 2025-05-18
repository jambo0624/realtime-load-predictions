#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import pandas as pd
from tabulate import tabulate
import glob

def count_entries():
    """统计processed_data目录下各个CSV文件的数据条目数并生成排序表格"""
    
    # 获取processed_data目录下所有CSV文件
    csv_files = glob.glob('processed_data/*.csv')
    
    if not csv_files:
        print("未在processed_data目录下找到CSV文件")
        return
    
    # 存储结果
    results = []
    
    # 处理每个文件
    for file_path in csv_files:
        try:
            # 读取CSV文件
            df = pd.read_csv(file_path)
            
            # 获取文件名
            file_name = os.path.basename(file_path)
            
            # 获取数据行数
            row_count = len(df)
            
            # 添加到结果
            results.append({
                "文件名": file_name,
                "数据条目数": row_count
            })
            
        except Exception as e:
            print(f"处理文件 {file_path} 时出错: {e}")
    
    # 按数据条目数排序(从多到少)
    results = sorted(results, key=lambda x: x["数据条目数"], reverse=True)
    
    # 使用tabulate生成美观的表格
    table = tabulate(
        results, 
        headers="keys", 
        tablefmt="grid"
    )
    
    print("\n数据条目统计(按数量从多到少排序):")
    print(table)
    
    # 保存结果到CSV
    result_df = pd.DataFrame(results)
    result_df.to_csv("processed_data_statistics.csv", index=False)
    print(f"\n统计结果已保存至 processed_data_statistics.csv")

if __name__ == "__main__":
    count_entries() 