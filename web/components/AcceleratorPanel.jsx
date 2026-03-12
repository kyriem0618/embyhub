/**
 * EmbyHub Pro - 播放加速面板
 * 三级智能加速状态展示
 */

import React, { useState, useEffect } from 'react';

// 加速层级图标
const AcceleratorIcons = {
  1: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ), // 闪电 - 自有文件
  2: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ), // 交换 - 用户间秒传
  3: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ), // 下载 - 源兜底
};

// 加速层级说明
const AcceleratorLabels = {
  1: { text: '极速播放', color: 'text-green-600', bg: 'bg-green-100' },
  2: { text: '秒传加速', color: 'text-blue-600', bg: 'bg-blue-100' },
  3: { text: '正常播放', color: 'text-gray-600', bg: 'bg-gray-100' },
};

/**
 * 播放加速状态卡片
 */
export function AcceleratorStatus({ fileId, fileName }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/media/accel/${fileId}`);
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        console.error('Failed to fetch accelerator status:', e);
      } finally {
        setLoading(false);
      }
    }

    if (fileId) {
      fetchStatus();
    }
  }, [fileId]);

  if (loading) {
    return (
      <div className="animate-pulse flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded"></div>
        <div className="flex-1 h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
    );
  }

  const level = status?.accel_level || 3;
  const label = AcceleratorLabels[level];

  return (
    <div className={`flex items-center space-x-3 p-4 ${label.bg} dark:bg-opacity-20 rounded-xl transition-all`}>
      <div className={`${label.color}`}>
        {AcceleratorIcons[level]}
      </div>
      <div className="flex-1">
        <div className={`font-semibold ${label.color}`}>
          {label.text}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {status?.response_time ? `${status.response_time}ms` : ''}
          {status?.source && ` · ${translateSource(status.source)}`}
        </div>
      </div>
      {level === 1 && (
        <span className="px-2 py-1 bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded-full">
          最快
        </span>
      )}
    </div>
  );
}

/**
 * 加速统计面板
 */
export function AcceleratorStats({ userId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function fetchStats() {
      const res = await fetch(`/api/media/stats?user_id=${userId}`);
      const data = await res.json();
      setStats(data);
    }

    if (userId) {
      fetchStats();
    }
  }, [userId]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <StatCard 
        title="加速文件" 
        value={stats.total_files || 0} 
        suffix="个"
        icon="🚀"
      />
      <StatCard 
        title="总播放次数" 
        value={stats.total_plays || stats.total_transfers || 0} 
        suffix="次"
        icon="▶️"
      />
      <StatCard 
        title="平均响应" 
        value={stats.avg_response_time ? Math.round(stats.avg_response_time) : 0} 
        suffix="ms"
        icon="⚡"
      />
    </div>
  );
}

function StatCard({ title, value, suffix, icon }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-800 dark:text-white">
        {value}<span className="text-sm font-normal text-gray-500 ml-1">{suffix}</span>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
    </div>
  );
}

/**
 * Cookie 管理面板
 */
export function CookieManagerPanel({ userId }) {
  const [hasCookie, setHasCookie] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
          🔐 网盘凭证管理
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
        >
          {hasCookie ? '更新凭证' : '添加凭证'}
        </button>
      </div>

      {hasCookie ? (
        <div className="flex items-center space-x-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-green-800 dark:text-green-200">凭证已加密存储</span>
        </div>
      ) : (
        <div className="text-gray-500 dark:text-gray-400 text-sm">
          暂无凭证，添加后可享受秒传加速服务
        </div>
      )}

      {showAddModal && (
        <AddCookieModal 
          userId={userId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setHasCookie(true);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * 添加 Cookie 弹窗
 */
function AddCookieModal({ userId, onClose, onSuccess }) {
  const [driveType, setDriveType] = useState('115');
  const [cookieValue, setCookieValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/media/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          drive_type: driveType,
          cookie: cookieValue,
        }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        alert('保存失败，请重试');
      }
    } catch (e) {
      alert('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
          添加网盘凭证
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              网盘类型
            </label>
            <select
              value={driveType}
              onChange={(e) => setDriveType(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="115">115 网盘</option>
              <option value="aliyun">阿里云盘</option>
              <option value="123pan">123 云盘</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cookie 值
            </label>
            <textarea
              value={cookieValue}
              onChange={(e) => setCookieValue(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white font-mono text-sm"
              rows={4}
              placeholder="请粘贴 Cookie 字符串..."
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              🔒 Cookie 将使用 AES-256 加密存储，仅用于播放加速
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 工具函数
function translateSource(source) {
  if (source === 'user/self') return '自有文件';
  if (source.startsWith('user/')) return '秒传加速';
  if (source === 'source') return '源传输';
  return source;
}

export default AcceleratorStatus;
