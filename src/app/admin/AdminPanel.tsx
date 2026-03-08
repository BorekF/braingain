'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { addYouTubeMaterial, addPDFMaterial, deleteMaterial, getMaterials, type Material } from '@/lib/materials';
import { calculateRewardMinutes, estimateMaterialDuration } from '@/lib/utils';
import {
  PDF_MAX_SIZE_BYTES,
  MESSAGE_DISPLAY_MS_SUCCESS,
  MESSAGE_DISPLAY_MS_ERROR,
  LOGS_REFRESH_INTERVAL_MS,
  PDF_ESTIMATE_WORDS_PER_MB,
  PDF_ESTIMATE_WORDS_PER_MIN,
} from '@/lib/constants';
import { Trash2, Youtube, FileText, Loader2, GraduationCap, Settings, Upload } from 'lucide-react';

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'youtube' | 'pdf'>('youtube');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [startMinutes, setStartMinutes] = useState<number | ''>('');
  const [endMinutes, setEndMinutes] = useState<number | ''>('');
  const [manualText, setManualText] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [youtubeRewardMinutes, setYoutubeRewardMinutes] = useState<number | ''>('');
  const [youtubeSuggestedReward, setYoutubeSuggestedReward] = useState<number | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfRewardMinutes, setPdfRewardMinutes] = useState<number | ''>('');
  const [pdfSuggestedReward, setPdfSuggestedReward] = useState<number | null>(null);

  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const getAdminSecret = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adminSecret') || '';
    }
    return '';
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    try {
      const data = await getMaterials();
      setMaterials(data);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to load materials. Check your Supabase configuration.';
      showMessage('error', errorMessage);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(
      () => setMessage(null),
      type === 'error' ? MESSAGE_DISPLAY_MS_ERROR : MESSAGE_DISPLAY_MS_SUCCESS
    );
  }

  useEffect(() => {
    if (manualText.trim().length > 0) {
      const duration = estimateMaterialDuration(manualText, 'youtube');
      const suggested = calculateRewardMinutes(duration);
      setYoutubeSuggestedReward(suggested);
    } else if (youtubeUrl.trim().length > 0) {
      setYoutubeSuggestedReward(null);
    } else {
      setYoutubeSuggestedReward(null);
    }
  }, [manualText, youtubeUrl]);

  async function handleAddYouTube() {
    if (!youtubeUrl.trim()) {
      showMessage('error', 'Please provide a YouTube video URL');
      return;
    }

    setLoading(true);
    try {
      const rewardMinutes = youtubeRewardMinutes === '' ? undefined : Number(youtubeRewardMinutes);
      const startMin = startMinutes === '' ? 0 : Number(startMinutes);
      const endMin = endMinutes === '' ? undefined : Number(endMinutes);
      const result = await addYouTubeMaterial(
        youtubeUrl.trim(),
        startMin,
        endMin,
        showManualInput && manualText.trim() ? manualText.trim() : undefined,
        rewardMinutes,
        getAdminSecret()
      );

      if (result.success) {
        showMessage('success', 'YouTube material has been added!');
        setYoutubeUrl('');
        setStartMinutes('');
        setEndMinutes('');
        setManualText('');
        setShowManualInput(false);
        setYoutubeRewardMinutes('');
        setYoutubeSuggestedReward(null);
        await loadMaterials();
      } else {
        if (result.requiresManual) {
          setShowManualInput(true);
        }
        showMessage('error', result.error || 'Failed to add material');
      }
    } catch (error) {
      showMessage('error', 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (pdfFile) {
      const estimatedWords = (pdfFile.size / 1024 / 1024) * PDF_ESTIMATE_WORDS_PER_MB;
      const estimatedMinutes = Math.ceil(estimatedWords / PDF_ESTIMATE_WORDS_PER_MIN);
      setPdfSuggestedReward(calculateRewardMinutes(estimatedMinutes));
    } else {
      setPdfSuggestedReward(null);
    }
  }, [pdfFile]);

  async function handleAddPDF() {
    if (!pdfFile) {
      showMessage('error', 'Please select a PDF file');
      return;
    }

    if (pdfFile.size > PDF_MAX_SIZE_BYTES) {
      showMessage(
        'error',
        `File is too large (${(pdfFile.size / 1024 / 1024).toFixed(2)} MB). Maximum: ${PDF_MAX_SIZE_BYTES / 1024 / 1024} MB.`
      );
      return;
    }

    setLoading(true);
    try {
      const rewardMinutes = pdfRewardMinutes === '' ? undefined : Number(pdfRewardMinutes);
      const result = await addPDFMaterial(pdfFile, pdfTitle.trim() || undefined, rewardMinutes, getAdminSecret());

      if (result.success) {
        showMessage('success', 'PDF material has been added!');
        setPdfFile(null);
        setPdfTitle('');
        setPdfRewardMinutes('');
        setPdfSuggestedReward(null);
        const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        await loadMaterials();
      } else {
        const errorMessage = result.error || 'Failed to add material';
        showMessage('error', errorMessage);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Body exceeded') || error.message.includes('1 MB')) {
          showMessage(
            'error',
            `File is too large. Maximum size: ${PDF_MAX_SIZE_BYTES / 1024 / 1024} MB. If the problem persists, check next.config.ts configuration.`
          );
        } else {
          showMessage('error', error.message);
        }
      } else {
        showMessage('error', 'An unexpected error occurred while adding the PDF.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this material?')) {
      return;
    }

    try {
      const result = await deleteMaterial(id, getAdminSecret());
      if (result.success) {
        showMessage('success', 'Material has been deleted');
        await loadMaterials();
      } else {
        showMessage('error', result.error || 'Failed to delete');
      }
    } catch (error) {
      showMessage('error', 'Unexpected error');
    }
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const adminSecret = getAdminSecret();
      const response = await fetch(`/api/logs?lines=200&secret=${encodeURIComponent(adminSecret)}`);
      const data = await response.json();
      if (data.error) {
        showMessage('error', data.error);
      } else if (data.logs) {
        setLogs(data.logs);
      }
    } catch (error) {
      showMessage('error', 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }

  async function clearLogs() {
    if (!confirm('Are you sure you want to clear the logs?')) {
      return;
    }
    try {
      const adminSecret = getAdminSecret();
      const response = await fetch(`/api/logs?clear=true&secret=${encodeURIComponent(adminSecret)}`);
      const data = await response.json();
      if (data.error) {
        showMessage('error', data.error);
      } else if (data.message) {
        showMessage('success', data.message);
        setLogs([]);
      }
    } catch (error) {
      showMessage('error', 'Failed to clear logs');
    }
  }

  useEffect(() => {
    if (showLogs) {
      loadLogs();
      const interval = setInterval(loadLogs, LOGS_REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [showLogs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header with actions */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-6 sm:p-8 mb-6 sm:mb-8 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                Admin Panel
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Manage learning materials and quizzes
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-2 font-semibold"
              >
                <GraduationCap size={18} />
                Student Dashboard
              </Link>
              <button
                onClick={() => {
                  setShowLogs(!showLogs);
                }}
                className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-2 font-semibold"
              >
                <Settings size={18} />
                {showLogs ? 'Hide' : 'Show'} Logs
              </button>
            </div>
          </div>
        </div>

        {/* Message toast */}
        {message && (
          <div
            className={`mb-6 p-4 sm:p-5 rounded-xl shadow-lg border-2 ${
              message.type === 'success'
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border-green-400'
                : 'bg-gradient-to-r from-red-50 to-pink-50 text-red-800 border-red-400'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`text-2xl ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message.type === 'success' ? '✅' : '❌'}
              </div>
              <div className="flex-1">
                <p className={`font-semibold text-base ${message.type === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                  {message.type === 'success' ? 'Success!' : 'Error!'}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{message.text}</p>
              </div>
              <button
                onClick={() => setMessage(null)}
                className={`text-lg hover:opacity-70 transition-opacity ${
                  message.type === 'success' ? 'text-green-600' : 'text-red-600'
                }`}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Logs panel */}
        {showLogs && (
          <div className="bg-gray-900 text-green-400 p-6 rounded-2xl mb-8 font-mono text-sm max-h-96 overflow-y-auto shadow-2xl border-2 border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-white font-semibold">Application logs (last 200 lines)</h2>
              <div className="flex gap-2">
                <button
                  onClick={loadLogs}
                  disabled={logsLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-xs font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  {logsLoading ? 'Loading...' : 'Refresh'}
                </button>
                <button
                  onClick={clearLogs}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  Clear
                </button>
              </div>
            </div>
            {logs.length === 0 ? (
              <p className="text-gray-500">No logs</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="text-xs">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white/60 backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-white/20">
          <button
            onClick={() => setActiveTab('youtube')}
            className={`px-6 py-3 font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 border-2 ${
              activeTab === 'youtube'
                ? 'bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white shadow-lg transform scale-105 border-purple-400'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50 border-transparent hover:border-purple-300'
            }`}
          >
            <Youtube size={20} />
            YouTube
          </button>
          <button
            onClick={() => setActiveTab('pdf')}
            className={`px-6 py-3 font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 border-2 ${
              activeTab === 'pdf'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105 border-blue-400'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50 border-transparent hover:border-blue-300'
            }`}
          >
            <FileText size={20} />
            PDF
          </button>
        </div>

        {activeTab === 'youtube' && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 mb-8 border border-white/20 hover:shadow-2xl transition-shadow duration-300">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
              Add YouTube material
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">YouTube video URL</label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-300 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400"
                  />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Start at minute (optional)
                  </label>
                  <input
                    type="number"
                    value={startMinutes}
                    onChange={(e) => setStartMinutes(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                    min="0"
                    placeholder="0 (full video from the beginning)"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-300 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    End at minute (optional)
                  </label>
                  <input
                    type="number"
                    value={endMinutes}
                    onChange={(e) => setEndMinutes(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                    min="0"
                    placeholder="No limit"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-300 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reward minutes (optional)
                </label>
                <div className="space-y-2">
                  <input
                    type="number"
                    value={youtubeRewardMinutes}
                    onChange={(e) => setYoutubeRewardMinutes(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                    min="1"
                    placeholder="Enter number of minutes..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-300 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400"
                  />
                  {youtubeSuggestedReward !== null && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 bg-gradient-to-r from-purple-50 to-indigo-50 p-3 rounded-xl border-2 border-purple-200 shadow-sm">
                      <span className="font-semibold">💡 Suggested:</span>
                      <button
                        type="button"
                        onClick={() => setYoutubeRewardMinutes(youtubeSuggestedReward)}
                        className="text-purple-600 hover:text-purple-800 font-bold underline hover:scale-110 transition-transform"
                      >
                        {youtubeSuggestedReward} minutes
                      </button>
                      <span className="text-gray-500">(click to use)</span>
                    </div>
                  )}
                </div>
              </div>
              {showManualInput && (
                <div>
                  <div className="mb-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-xl">
                    <p className="text-sm font-bold text-orange-900 flex items-center gap-2">
                      <span className="text-2xl">👇</span>
                      Automatic fetch failed — paste the transcript below
                    </p>
                  </div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Transcript (min. 100 characters)
                  </label>
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="How to get a transcript:&#10;1. Open the video on YouTube&#10;2. Click '...' under the video → 'Show transcript'&#10;3. Copy all text and paste it here&#10;&#10;Paste here..."
                    rows={8}
                    className="w-full px-4 py-3 border-2 border-yellow-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-400 transition-all duration-200 bg-yellow-50/50 resize-none"
                    autoFocus
                  />
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-semibold text-gray-700">
                      {manualText.length} characters {manualText.length >= 100 ? '✅' : `(missing: ${100 - manualText.length})`}
                    </p>
                    <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border border-blue-200">
                      <p className="font-semibold mb-1">💡 Step-by-step:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Open <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">this video on YouTube</a></li>
                        <li>Click the &quot;...&quot; (three dots) button under the video</li>
                        <li>Select &quot;Show transcript&quot;</li>
                        <li>Copy all text (Ctrl+A, Ctrl+C)</li>
                        <li>Paste here (Ctrl+V)</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={handleAddYouTube}
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 text-white rounded-xl hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                {loading && <Loader2 className="animate-spin" size={18} />}
                Add material
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pdf' && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 mb-8 border border-white/20 hover:shadow-2xl transition-shadow duration-300">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
              Add PDF material
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  PDF file (max 10 MB)
                </label>
                <label
                  htmlFor="pdf-file"
                  className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-blue-300 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 hover:from-blue-100 hover:to-indigo-100 hover:border-blue-400 cursor-pointer transition-all duration-200 group shadow-md hover:shadow-xl"
                >
                  <input
                    id="pdf-file"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-200 shadow-lg">
                      <Upload className="text-white" size={32} />
                    </div>
                    <p className="mb-2 text-lg font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">
                      Click to choose a PDF file
                    </p>
                    <p className="text-sm text-gray-500">
                      or drag and drop it here
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      Maximum size: {PDF_MAX_SIZE_BYTES / 1024 / 1024} MB
                    </p>
                  </div>
                </label>
                {pdfFile && (
                  <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      📄 {pdfFile.name}
                    </p>
                    <p className="text-xs text-gray-600 mt-2">
                      Size: <span className="font-semibold">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      {pdfFile.size > PDF_MAX_SIZE_BYTES && (
                        <span className="text-red-600 font-bold ml-2 bg-red-100 px-2 py-1 rounded">
                          ⚠️ Limit exceeded!
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Title (optional — defaults to file name)
                </label>
                  <input
                    type="text"
                    value={pdfTitle}
                    onChange={(e) => setPdfTitle(e.target.value)}
                    placeholder="Material title..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400"
                  />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reward minutes (optional)
                </label>
                <div className="space-y-2">
                  <input
                    type="number"
                    value={pdfRewardMinutes}
                    onChange={(e) => setPdfRewardMinutes(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                    min="1"
                    placeholder="Enter number of minutes..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-300 transition-all duration-200 bg-white text-gray-900 placeholder:text-gray-400"
                  />
                  {pdfSuggestedReward !== null && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-xl border-2 border-blue-200 shadow-sm">
                      <span className="font-semibold">💡 Suggested:</span>
                      <button
                        type="button"
                        onClick={() => setPdfRewardMinutes(pdfSuggestedReward)}
                        className="text-blue-600 hover:text-blue-800 font-bold underline hover:scale-110 transition-transform"
                      >
                        {pdfSuggestedReward} minutes
                      </button>
                      <span className="text-gray-500">(click to use)</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleAddPDF}
                disabled={loading || !pdfFile}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                {loading && <Loader2 className="animate-spin" size={18} />}
                Add material
              </button>
            </div>
          </div>
        )}

        {/* Materials list */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 border border-white/20">
          <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Materials ({materials.length})
          </h2>
          {materials.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📚</div>
              <p className="text-gray-600 text-lg font-medium">No materials</p>
              <p className="text-gray-500 text-sm mt-2">Add your first material above</p>
            </div>
          ) : (
            <div className="space-y-4">
              {materials.map((material) => (
                <div
                  key={material.id}
                  className="flex items-center justify-between p-5 bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 hover:shadow-lg hover:border-indigo-300 transition-all duration-300 transform hover:-translate-y-1"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${material.type === 'youtube' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                        {material.type === 'youtube' ? (
                          <Youtube size={24} className="text-purple-600" />
                        ) : (
                          <FileText size={24} className="text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-gray-800">{material.title}</h3>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                          material.type === 'youtube' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {material.type === 'youtube' ? '📹 YouTube' : '📄 PDF'}
                        </span>
                      </div>
                    </div>
                    {material.video_url && (
                      <a
                        href={material.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {material.video_url}
                      </a>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      Added: {new Date(material.created_at).toLocaleString('en-US')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Content: {material.content_text.length} characters
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(material.id)}
                    className="ml-4 p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 hover:scale-110 hover:shadow-lg"
                    title="Delete material"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

