import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const AdminPanel = ({ onClose, initialTab = 'users' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [users, setUsers] = useState([]);
    const [assetHealth, setAssetHealth] = useState([]);
    const [logs, setLogs] = useState([]);
    const [logActions, setLogActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [regenerating, setRegenerating] = useState(null); // ID of work being regenerated
    const [showRegenStatus, setShowRegenStatus] = useState(false);
    const [regenCount, setRegenCount] = useState(0);
    const [logFilters, setLogFilters] = useState({ q: '', action: '', timeframe: 'all', startDate: '', endDate: '' });

    // Resizing state
    const [panelSize, setPanelSize] = useState(() => {
        const saved = localStorage.getItem('adminPanelSize');
        return saved ? JSON.parse(saved) : { width: 900, height: 600 };
    });
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;

            // Calculate new width/height from mouse position relative to center
            const newWidth = Math.max(800, (e.clientX - window.innerWidth / 2) * 2);
            const newHeight = Math.max(500, (e.clientY - window.innerHeight / 2) * 2);

            setPanelSize({ width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                localStorage.setItem('adminPanelSize', JSON.stringify(panelSize));
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'nwse-resize';
        } else {
            document.body.style.cursor = 'default';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isResizing, panelSize]);

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'assets') fetchAssetStatus();
        if (activeTab === 'logs') {
            fetchLogs();
            fetchLogActions();
        }
    }, [activeTab, logFilters.action, logFilters.timeframe, logFilters.startDate, logFilters.endDate]);

    // Debounced search for logs
    useEffect(() => {
        if (activeTab !== 'logs') return;
        const timer = setTimeout(() => {
            fetchLogs();
        }, 300);
        return () => clearTimeout(timer);
    }, [logFilters.q]);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/admin/users');
            setUsers(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch users", err);
            setLoading(false);
        }
    };

    const handleUpdate = async (id, field, value) => {
        try {
            await api.put(`/admin/users/${id}`, { [field]: value });
            setUsers(users.map(u => u.id === id ? { ...u, [field]: value } : u));
        } catch (err) {
            console.error("Failed to update user", err);
            alert("Update failed");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Are you sure you want to delete this user?")) return;
        try {
            await api.delete(`/admin/users/${id}`);
            setUsers(users.filter(u => u.id !== id));
        } catch (err) {
            console.error("Failed to delete user", err);
            alert("Delete failed");
        }
    };

    const fetchAssetStatus = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/assets/status');
            setAssetHealth(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch asset status", err);
            setLoading(false);
        }
    };

    const handleRegenerate = async (id) => {
        setRegenerating(id);
        try {
            const res = await api.post(`/admin/assets/regenerate/${id}`);
            setRegenCount(res.data.regeneratedCount);
            setShowRegenStatus(true);

            // Update local state instead of rescanning
            setAssetHealth(prev => prev.map(work =>
                work.id === id
                    ? { ...work, missingPreviews: 0, missingThumbs: 0 }
                    : work
            ));
        } catch (err) {
            console.error("Regeneration failed", err);
            alert("Regeneration failed: " + (err.response?.data?.error || err.message));
        } finally {
            setRegenerating(null);
        }
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (logFilters.q) params.append('q', logFilters.q);
            if (logFilters.action) params.append('action', logFilters.action);
            if (logFilters.timeframe && logFilters.timeframe !== 'all') params.append('timeframe', logFilters.timeframe);
            if (logFilters.timeframe === 'custom') {
                if (logFilters.startDate) params.append('startDate', logFilters.startDate);
                if (logFilters.endDate) params.append('endDate', logFilters.endDate);
            }

            const res = await api.get(`/admin/logs?${params.toString()}`);
            setLogs(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch logs", err);
            setLoading(false);
        }
    };

    const fetchLogActions = async () => {
        try {
            const res = await api.get('/admin/logs/actions');
            setLogActions(res.data);
        } catch (err) {
            console.error("Failed to fetch actions", err);
        }
    };

    const handleDownloadLogs = async () => {
        try {
            const params = new URLSearchParams();
            if (logFilters.q) params.append('q', logFilters.q);
            if (logFilters.action) params.append('action', logFilters.action);
            if (logFilters.timeframe && logFilters.timeframe !== 'all') params.append('timeframe', logFilters.timeframe);
            if (logFilters.timeframe === 'custom') {
                if (logFilters.startDate) params.append('startDate', logFilters.startDate);
                if (logFilters.endDate) params.append('endDate', logFilters.endDate);
            }

            const res = await api.get(`/admin/logs/export?${params.toString()}`, {
                responseType: 'blob'
            });

            // Create a link and trigger download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `logs_export_${dateStr}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Download failed", err);
            alert("Failed to download logs. Are you still logged in?");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div
                className="bg-[#121212] border border-[#333] rounded-xl flex flex-col shadow-2xl relative overflow-hidden"
                style={{ width: `${panelSize.width}px`, height: `${panelSize.height}px` }}
            >

                {/* Header */}
                <div className="h-14 px-6 border-b border-[#333] flex items-center justify-between bg-[#1a1a1a]">
                    <h2 className="text-gray-200 font-semibold tracking-wide text-sm">Admin Control Panel</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#333] bg-[#1a1a1a]">
                    <div
                        onClick={() => setActiveTab('users')}
                        className={`px-6 py-3 text-xs font-bold border-b-2 cursor-pointer tracking-wider transition-colors ${activeTab === 'users' ? 'text-red-500 border-red-600' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    >
                        User Management
                    </div>
                    <div
                        onClick={() => setActiveTab('assets')}
                        className={`px-6 py-3 text-xs font-bold border-b-2 cursor-pointer tracking-wider transition-colors ${activeTab === 'assets' ? 'text-red-500 border-red-600' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    >
                        Asset Health
                    </div>
                    <div
                        onClick={() => setActiveTab('logs')}
                        className={`px-6 py-3 text-xs font-bold border-b-2 cursor-pointer tracking-wider transition-colors ${activeTab === 'logs' ? 'text-red-500 border-red-600' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                    >
                        User Logs
                    </div>
                </div>

                {/* content */}
                <div className="flex-1 overflow-auto p-4 bg-[#0e0e0e]">
                    {activeTab === 'users' && (
                        <table className="w-full text-left border-collapse">
                            <thead className="text-xs text-gray-500 font-bold uppercase tracking-wider sticky top-0 bg-[#0e0e0e] z-10">
                                <tr>
                                    <th className="pb-3 pl-2">User</th>
                                    <th className="pb-3">Email</th>
                                    <th className="pb-3 text-center">Items</th>
                                    <th className="pb-3 text-center">In Gallery</th>
                                    <th className="pb-3 text-center">Create</th>
                                    <th className="pb-3">Role</th>
                                    <th className="pb-3 text-right pr-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm text-gray-300 divide-y divide-[#222]">
                                {loading ? (
                                    <tr><td colSpan="7" className="text-center py-10 text-gray-500">Loading...</td></tr>
                                ) : users.map(user => (
                                    <tr key={user.id} className="group hover:bg-[#1a1a1a] transition-colors">
                                        <td className="py-3 pl-2 flex items-center gap-3">
                                            {user.picture ? (
                                                <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
                                                    {user.username ? user.username[0].toUpperCase() : '?'}
                                                </div>
                                            )}
                                            <span className="font-medium text-gray-200">{user.username || 'Unknown'}</span>
                                        </td>
                                        <td className="py-3 text-gray-400">{user.email || '-'}</td>
                                        <td className="py-3 text-center text-gray-500 font-mono">0</td>
                                        <td className="py-3 text-center">
                                            <div className="w-8 h-4 bg-gray-700 rounded-full mx-auto relative cursor-not-allowed opacity-50">
                                                <div className="w-4 h-4 bg-gray-400 rounded-full absolute left-0" />
                                            </div>
                                        </td>
                                        <td className="py-3 text-center">
                                            {/* Status Pill */}
                                            {user.approved ? (
                                                <span className="bg-green-900/30 text-green-500 text-[10px] font-bold px-2 py-1 rounded border border-green-800">APPROVED</span>
                                            ) : (
                                                <span className="bg-yellow-900/30 text-yellow-500 text-[10px] font-bold px-2 py-1 rounded border border-yellow-800">PENDING</span>
                                            )}
                                        </td>
                                        <td className="py-3">
                                            <select
                                                value={user.level}
                                                onChange={(e) => handleUpdate(user.id, 'level', e.target.value)}
                                                className="bg-[#222] text-gray-300 text-xs px-2 py-1 rounded border border-[#333] focus:border-gray-500 focus:outline-none"
                                            >
                                                <option value="user">USER</option>
                                                <option value="admin">ADMIN</option>
                                            </select>
                                        </td>
                                        <td className="py-3 pr-2 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!user.approved && (
                                                    <button
                                                        onClick={() => handleUpdate(user.id, 'approved', 1)}
                                                        className="bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
                                                    >
                                                        Approve
                                                    </button>
                                                )}
                                                {user.approved === 1 && (
                                                    <button
                                                        onClick={() => handleUpdate(user.id, 'approved', 0)}
                                                        className="bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-yellow-500 text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
                                                    >
                                                        Ban
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"
                                                    title="Delete User"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'assets' && (
                        <div className="flex flex-col h-full">
                            <div className="mb-4 flex justify-between items-center">
                                <p className="text-xs text-gray-500">Scanning works for missing previews and thumbnails.</p>
                                <button
                                    onClick={fetchAssetStatus}
                                    className="text-[10px] font-bold text-gray-400 hover:text-white flex items-center gap-1 uppercase tracking-widest"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Refresh Scan
                                </button>
                            </div>

                            <table className="w-full text-left border-collapse">
                                <thead className="text-xs text-gray-500 font-bold uppercase tracking-wider sticky top-0 bg-[#0e0e0e] z-10">
                                    <tr>
                                        <th className="pb-3 pl-2">Work / Folder</th>
                                        <th className="pb-3 text-center">Missing Previews</th>
                                        <th className="pb-3 text-center">Missing Thumbs</th>
                                        <th className="pb-3 text-right pr-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm text-gray-300 divide-y divide-[#222]">
                                    {loading ? (
                                        <tr><td colSpan="4" className="text-center py-10 text-gray-500">Scanning Archive...</td></tr>
                                    ) : assetHealth.length === 0 ? (
                                        <tr><td colSpan="4" className="text-center py-10 text-green-500/50 font-medium italic">All assets are healthy. ✨</td></tr>
                                    ) : assetHealth.map(work => (
                                        <tr key={work.id} className="group hover:bg-[#1a1a1a] transition-colors">
                                            <td className="py-3 pl-2">
                                                <div className="font-medium text-gray-200">{work.talent || 'Untitled'}</div>
                                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">{work.path}</div>
                                            </td>
                                            <td className="py-3 text-center">
                                                <span className={`text-xs font-mono ${work.missingPreviews > 0 ? 'text-red-500 font-bold' : 'text-gray-600'}`}>
                                                    {work.missingPreviews} / {work.totalFiles}
                                                </span>
                                            </td>
                                            <td className="py-3 text-center">
                                                <span className={`text-xs font-mono ${work.missingThumbs > 0 ? 'text-yellow-500 font-bold' : 'text-gray-600'}`}>
                                                    {work.missingThumbs} / {work.totalFiles}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-2 text-right">
                                                <button
                                                    onClick={() => handleRegenerate(work.id)}
                                                    disabled={regenerating === work.id}
                                                    className={`bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1 ml-auto ${regenerating === work.id ? 'opacity-50 cursor-wait' : ''}`}
                                                >
                                                    {regenerating === work.id ? (
                                                        <>
                                                            <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                            Fixing...
                                                        </>
                                                    ) : (
                                                        <>REGENERATE</>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="flex flex-col h-full overflow-hidden">
                            {/* Filters */}
                            <div className="mb-4 flex flex-wrap gap-3 items-center bg-[#1a1a1a] p-3 rounded-lg border border-[#333]">
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        placeholder="Search by user or description..."
                                        className="w-full bg-[#222] border border-[#333] rounded px-8 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-gray-500"
                                        value={logFilters.q}
                                        onChange={(e) => setLogFilters({ ...logFilters, q: e.target.value })}
                                    />
                                    <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <select
                                    className="bg-[#222] border border-[#333] rounded px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-gray-500"
                                    value={logFilters.action}
                                    onChange={(e) => setLogFilters({ ...logFilters, action: e.target.value })}
                                >
                                    <option value="">All Actions</option>
                                    {logActions.map(action => (
                                        <option key={action} value={action}>{action}</option>
                                    ))}
                                </select>
                                <select
                                    className="bg-[#222] border border-[#333] rounded px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-gray-500"
                                    value={logFilters.timeframe}
                                    onChange={(e) => setLogFilters({ ...logFilters, timeframe: e.target.value })}
                                >
                                    <option value="all">All Time</option>
                                    <option value="today">Today</option>
                                    <option value="7d">Last 7 Days</option>
                                    <option value="30d">Last 30 Days</option>
                                    <option value="custom">Custom Range</option>
                                </select>

                                {logFilters.timeframe === 'custom' && (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                        <input
                                            type="date"
                                            className="bg-[#222] border border-[#333] rounded px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-gray-500 inverse-calendar-icon"
                                            value={logFilters.startDate}
                                            onChange={(e) => setLogFilters({ ...logFilters, startDate: e.target.value })}
                                        />
                                        <span className="text-gray-600 text-[10px]">to</span>
                                        <input
                                            type="date"
                                            className="bg-[#222] border border-[#333] rounded px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-gray-500 inverse-calendar-icon"
                                            value={logFilters.endDate}
                                            onChange={(e) => setLogFilters({ ...logFilters, endDate: e.target.value })}
                                        />
                                    </div>
                                )}

                                <button
                                    onClick={handleDownloadLogs}
                                    className="ml-auto bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-white text-[10px] font-bold px-3 py-1.5 rounded flex items-center gap-2 transition-colors uppercase tracking-widest"
                                    title="Download filtered logs as CSV"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download CSV
                                </button>
                            </div>

                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="text-[10px] text-gray-500 font-bold uppercase tracking-wider sticky top-0 bg-[#0e0e0e] z-10">
                                        <tr>
                                            <th className="pb-3 pl-2 w-32">Time</th>
                                            <th className="pb-3 w-40">User</th>
                                            <th className="pb-3 w-32">Action</th>
                                            <th className="pb-3">Description</th>
                                            <th className="pb-3 w-28 text-right pr-2">IP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs text-gray-400 divide-y divide-[#222]">
                                        {loading ? (
                                            <tr><td colSpan="5" className="text-center py-20 text-gray-600">Loading activity logs...</td></tr>
                                        ) : logs.length === 0 ? (
                                            <tr><td colSpan="5" className="text-center py-20 text-gray-600 italic">No logs found matching your filters.</td></tr>
                                        ) : logs.map(log => (
                                            <tr key={log.id} className="hover:bg-[#151515] transition-colors">
                                                <td className="py-2.5 pl-2 text-gray-500 whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-2.5 font-medium text-gray-300 truncate max-w-[150px]" title={log.username}>
                                                    {log.username}
                                                </td>
                                                <td className="py-2.5">
                                                    <span className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold border ${log.action.includes('DELETE') ? 'bg-red-900/20 text-red-400 border-red-900/30' :
                                                        log.action.includes('CREATE') || log.action.includes('ADD') ? 'bg-green-900/20 text-green-400 border-green-900/30' :
                                                            log.action.includes('EDIT') || log.action.includes('ORDER') ? 'bg-blue-900/20 text-blue-400 border-blue-900/30' :
                                                                'bg-gray-800/50 text-gray-400 border-gray-700'
                                                        }`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-gray-300 leading-relaxed">
                                                    {log.action_desc}
                                                </td>
                                                <td className="py-2.5 text-right pr-2 text-gray-400 font-mono text-[10px]" title={log.user_agent}>
                                                    {log.ip_address}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Resize Handle */}
                <div
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 group z-50"
                >
                    <div className="w-1.5 h-1.5 bg-gray-600 rounded-full group-hover:bg-red-500 transition-colors"></div>
                </div>
            </div>

            {/* Custom Regeneration Status Dialog */}
            {showRegenStatus && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                    <div className="bg-[#1a1a1a] border border-[#333] w-[400px] p-8 rounded-xl shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-200">
                        <div className="w-12 h-12 bg-green-900/30 rounded-full flex items-center justify-center mb-4 border border-green-800/50">
                            <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-white font-semibold text-lg mb-2">Regeneration Complete</h3>
                        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                            Successfully regenerated <span className="text-white font-bold">{regenCount}</span> missing assets for this work.
                        </p>
                        <button
                            onClick={() => setShowRegenStatus(false)}
                            className="w-full bg-[#333] hover:bg-[#444] text-white py-3 rounded-lg font-bold text-xs uppercase tracking-widest transition-all border border-[#444]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;
